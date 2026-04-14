/* BirdNetCafe · 翎英 (AvianLinked)
   重构版：修复透明度、图片加载判断、飞鸟动画、悬停自动播放音频
*/

let canvas;
let trees = [];
let currentTreeId = null;
let birds = [];              
let afcdMap = new Map();
let audioEnabled = false;
let hoverTimer = null;
let currentPopup = null;
let map = null;
let globalAudio = null; // 全局音频对象

// 预置鸟类数据
const PRESET_SPECIES = [
  { common: "黑领椋鸟", scientific: "Gracupica nigricollis", confidence: 0.94, audioFile: "audio/黑领椋鸟.mp3", img: "image/黑领椋鸟.png" },
  { common: "暗绿绣眼鸟", scientific: "Zosterops simplex", confidence: 0.85, audioFile: "audio/暗绿绣眼鸟.mp3", img: "image/暗绿绣眼鸟.png" },
  { common: "红耳鹎", scientific: "Pycnonotus jocosus", confidence: 0.78, audioFile: "audio/红耳鹎.mp3", img: "image/红耳鹎.png" },
  { common: "噪鹃", scientific: "Eudynamys scolopaceus", confidence: 0.77, audioFile: "audio/噪鹃.mp3", img: "image/噪鹃.png" },
  { common: "黄眉柳莺", scientific: "Phylloscopus inornatus", confidence: 0.75, audioFile: "audio/黄眉柳莺.mp3", img: "image/黄眉柳莺.png" },
  { common: "家麻雀", scientific: "Passer domesticus", confidence: 0.71, audioFile: "audio/家麻雀.mp3", img: "image/家麻雀.png" },
  { common: "白喉红臀鹎", scientific: "Pycnonotus aurigaster", confidence: 0.53, audioFile: "audio/白喉红臀鹎.mp3", img: "image/白喉红臀鹎.png" }
];
const DEFAULT_BIRD_IMG = "https://cdn.pixabay.com/photo/2013/07/25/13/01/bird-167146_1280.png";

// 动画相关
let appearAnimationQueue = [];
let appearTimer = null;

// ---------- p5.js 初始化 ----------
function setup() {
  const container = document.getElementById('canvas-container');
  const w = container.clientWidth || 1000;
  const h = container.clientHeight || 700;
  canvas = createCanvas(w, h);
  canvas.parent('canvas-container');

  initMap();
  loadTreesFromLocalStorage();

  // 如果没有有效树，创建预置树
  if (trees.length === 0 || !trees[0].birds || trees[0].birds.length === 0) {
    console.log("创建演示预置树...");
    localStorage.removeItem('birdnetcafe_trees');
    createPresetTree();
  }

  // 确保树的基准坐标位于当前画布中心
  let firstTree = trees[0];
  if (firstTree) {
    firstTree.x = width / 2;
    firstTree.y = height * 0.65;
    repositionBirds(); // 初始化时根据 dx, dy 重算一遍位置
  }
  
  setCurrentTree(trees[0].id);
  updateTreeListUI();
  bindUI();
}

function windowResized() {
  const container = document.getElementById('canvas-container');
  resizeCanvas(container.clientWidth, container.clientHeight);
  let current = getCurrentTree();
  if (current) {
    current.x = width / 2;
    current.y = height * 0.65;
    repositionBirds();
  }
}

function draw() {
  clear(); // 清除画布，让底部的榕树 CSS 背景透出来
  
  // 光晕效果
  colorMode(HSB, 360, 100, 100, 1);
  noStroke();
  let glow = (frameCount * 0.02) % TWO_PI;
  let rad = 200 + sin(glow) * 20;
  fill(60, 15, 92, 0.08);
  ellipse(width / 2, height * 0.65 - 40, rad, rad);
  fill(0, 0, 0, 0.1);
  ellipse(width / 2, height - 20, 300, 50);

  // 绘制所有鸟
  for (let bird of birds) drawBird(bird);
}

// ---------- 绘制与动画核心 ----------
function drawBird(bird) {
  push();
  translate(bird.x, bird.y);

  // 在 draw 循环中自然推进动画，更加平滑稳定
  if (bird.isAppearing) {
    bird.appearProgress += 0.02; // 控制出现速度
    if (bird.appearProgress >= 1) {
      bird.appearProgress = 1;
      bird.isAppearing = false;
    }
  }

  let prog = bird.appearProgress || 0;
  if (prog === 0) { pop(); return; } // 完全透明时不绘制，节省性能

  let scaleVal = 0.6 + prog * 0.4;
  scale(scaleVal);

  // 切换到 RGB 模式专门处理透明度（避免 HSB 模式下 tint 的严重兼容性问题）
  colorMode(RGB, 255, 255, 255, 1);
  
  // 在 p5.js 中判断图片是否加载完毕需使用 img.width > 0
  if (bird.imgElement && bird.imgElement.width > 0) {
    tint(255, prog); // RGB 模式下：(色调白色，透明度 alpha)
    image(bird.imgElement, -bird.size / 2, -bird.size / 2, bird.size, bird.size);
    noTint();
  } else {
    // 图片加载失败或尚未加载时绘制圆形占位符
    colorMode(HSB, 360, 100, 100, 1);
    fill(80, 60, 70, prog);
    ellipse(0, 0, bird.size, bird.size);
    fill(0, 0, 100, prog);
    textAlign(CENTER, CENTER);
    textSize(12);
    text(bird.species.substring(0, 2), 0, 0);
  }

  // 悬停高亮外圈
  if (bird.hover) {
    colorMode(HSB, 360, 100, 100, 1);
    noFill();
    stroke(60, 80, 100, prog);
    strokeWeight(2);
    ellipse(0, 0, bird.size + 6, bird.size + 6);
  }
  
  pop();
}

function startAppearAnimation() {
  if (!birds || birds.length === 0) return;
  // 重置状态
  for (let bird of birds) {
    bird.appearProgress = 0;
    bird.isAppearing = false;
  }
  appearAnimationQueue = [...birds];
  clearTimeout(appearTimer);
  processNextAppear();
}

function processNextAppear() {
  if (appearAnimationQueue.length === 0) return;
  let bird = appearAnimationQueue.shift();
  bird.isAppearing = true; // 激活状态后交由 draw() 循环执行动画
  appearTimer = setTimeout(processNextAppear, 200); // 间隔 0.2 秒依次触发下一只
}

// ---------- 树与鸟管理 ----------
function getCurrentTree() {
  return trees.find(t => t.id === currentTreeId);
}

function createPresetTree() {
  const tree = {
    id: 'preset_tree',
    name: '泽安邨 · 榕树',
    lat: 22.336,
    lng: 114.162,
    x: width / 2,
    y: height * 0.65,
    birds: [],
    audioMap: new Map(),
    birdnetRecords: []
  };
  
  let birdList = [];
  for (let sp of PRESET_SPECIES) {
    let angle = random(-PI * 0.7, 0);
    let radius = random(80, 160);
    // 相对坐标，用来适配屏幕缩放
    let dx = radius * cos(angle);
    let dy = radius * sin(angle) - random(20, 80);
    
    let img = loadImage(sp.img); // 移除空的 callback，交由引擎自理
    birdList.push({
      id: sp.common,
      species: sp.common,
      scientific: sp.scientific,
      confidence: sp.confidence,
      imgPath: sp.img,
      imgElement: img,
      audioPath: sp.audioFile,
      x: tree.x + dx, 
      y: tree.y + dy,
      dx: dx, 
      dy: dy,
      size: 40,
      appearProgress: 0,
      isAppearing: false,
      hover: false
    });
    if (sp.audioFile) tree.audioMap.set(sp.common, sp.audioFile);
  }
  tree.birds = birdList;
  trees = [tree];
  saveTreesToLocalStorage();
}

function repositionBirds() {
  let treeObj = getCurrentTree();
  if (!treeObj) return;
  for (let bird of birds) {
    // 重新根据相对距离附加在树干当前最新位置，防止缩放时错位
    bird.x = treeObj.x + (bird.dx || 0);
    bird.y = treeObj.y + (bird.dy || 0);
  }
}

// 根据当前树的数据更新鸟的位置（用于 CSV 导入后）
function updateCurrentTreeBirds() {
  let treeObj = getCurrentTree();
  if (!treeObj) return;
  let speciesList = Object.keys(treeObj.speciesSummary || {});
  if (speciesList.length === 0) speciesList = PRESET_SPECIES.map(s => s.common);
  
  let newBirds = [];
  let angleStep = PI / (speciesList.length + 1);
  let startAngle = -PI * 0.6;
  
  for (let i = 0; i < speciesList.length; i++) {
    let spName = speciesList[i];
    let info = treeObj.speciesSummary[spName];
    let avgConf = info ? info.sumConf / info.count : 0.5;
    let preset = PRESET_SPECIES.find(s => s.common === spName);
    
    let imgPath = preset ? preset.img : DEFAULT_BIRD_IMG;
    let audioPath = preset ? preset.audioFile : null;
    let img = loadImage(imgPath);
    
    let angle = startAngle + i * angleStep + random(-0.2, 0.2);
    let radius = random(80, 160);
    let dx = radius * cos(angle);
    let dy = radius * sin(angle) - random(20, 80);
    
    newBirds.push({
      id: spName,
      species: spName,
      scientific: preset ? preset.scientific : '未知物种',
      confidence: avgConf,
      imgPath: imgPath,
      imgElement: img,
      audioPath: audioPath,
      x: treeObj.x + dx, 
      y: treeObj.y + dy,
      dx: dx, 
      dy: dy,
      size: 40,
      appearProgress: 0,
      isAppearing: false,
      hover: false
    });
    if (audioPath) treeObj.audioMap.set(spName, audioPath);
  }
  treeObj.birds = newBirds;
  birds = newBirds;
  startAppearAnimation();
}

// ---------- 悬停与全局音频管理 ----------
function playBirdAudio(audioPath) {
  if (!audioEnabled || !audioPath) return;
  stopBirdAudio();
  try {
    globalAudio = new Audio(audioPath);
    globalAudio.play().catch(err => console.log("浏览器自动播放被拦截:", err));
  } catch (e) {
    console.error("音频加载失败", e);
  }
}

function stopBirdAudio() {
  if (globalAudio) {
    globalAudio.pause();
    globalAudio.currentTime = 0;
    globalAudio = null;
  }
}

function checkBirdHover() {
  let hit = null;
  for (let bird of birds) {
    if (bird.appearProgress === 0) continue; // 完全透明还没出来的鸟不要被摸到
    let d = dist(mouseX, mouseY, bird.x, bird.y);
    if (d < bird.size / 2) hit = bird;
    bird.hover = (bird === hit);
  }
  
  if (hit && !currentPopup) {
    // 命中新的鸟 -> 自动播放叫声
    let tree = getCurrentTree();
    let audioPath = tree.audioMap.get(hit.species);
    if (audioPath) playBirdAudio(audioPath);
    
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => showPopup(hit), 150);
  } else if (!hit && currentPopup) {
    closePopup();
    stopBirdAudio(); // 离开卡片/鸟 时停止叫声
    if (hoverTimer) clearTimeout(hoverTimer);
  }
}

async function showPopup(bird) {
  closePopup();
  let species = bird.species;
  let imgUrl = bird.imgPath;
  let wikiUrl = `https://zh.wikipedia.org/wiki/${encodeURIComponent(species)}`;
  let sciName = bird.scientific;
  let desc = afcdMap.get(species) || '香港常见鸟类，鸣声独特，为城市生态增添活力。';

  const root = document.getElementById('popup-root');
  const popup = document.createElement('div');
  popup.className = 'leaf-popup';
  popup.innerHTML = `
    <button class="close-btn">×</button>
    <div style="display:flex; gap:12px;">
      <img src="${imgUrl}" style="width:70px; height:70px; object-fit:cover; border-radius:12px;" onerror="this.src='${DEFAULT_BIRD_IMG}'">
      <div><h4>${species}</h4><div class="sci-name">${sciName}</div></div>
    </div>
    <div class="meta">📊 置信度 ${(bird.confidence * 100).toFixed(0)}%</div>
    <div class="desc">${desc}</div>
    <div class="controls">
      <button class="play-btn">▶ 播放</button>
      <button class="stop-btn">⏹️ 停止</button>
      <a href="${wikiUrl}" target="_blank" class="btn-icon">📖 百科</a>
    </div>
  `;
  
  // 防止卡片溢出屏幕
  const rect = canvas.elt.getBoundingClientRect();
  let left = rect.left + bird.x - 150;
  let top = rect.top + bird.y - 140;
  left = Math.min(window.innerWidth - 280, Math.max(10, left));
  top = Math.max(10, top);
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
  
  root.appendChild(popup);
  currentPopup = popup;

  // 绑定内部播放按钮
  let tree = getCurrentTree();
  let audioPath = tree.audioMap.get(species);
  let playBtn = popup.querySelector('.play-btn');
  let stopBtn = popup.querySelector('.stop-btn');

  if (audioPath && audioEnabled) {
    playBtn.onclick = () => playBirdAudio(audioPath);
    stopBtn.onclick = stopBirdAudio;
  } else {
    playBtn.onclick = () => showToast(audioEnabled ? '未上传该物种的音频' : '请先在顶栏启用音频');
    stopBtn.onclick = () => {};
  }
  popup.querySelector('.close-btn').onclick = () => {
    closePopup();
    stopBirdAudio();
  };
}

function closePopup() {
  if (currentPopup) currentPopup.remove();
  currentPopup = null;
}

// ---------- 地图与数据管理 ----------
function initMap() { 
  map = L.map('map').setView([22.336, 114.162], 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
  }).addTo(map);
  map.on('click', (e) => {
    document.getElementById('newTreeCoords').value = `${e.latlng.lat}, ${e.latlng.lng}`;
    document.getElementById('createTreeModal').style.display = 'flex';
  });
}

function addMapMarker(tree) {
  let marker = L.marker([tree.lat, tree.lng]).addTo(map);
  marker.bindPopup(`<b>${tree.name}</b>`);
  marker.on('click', () => setCurrentTree(tree.id));
  tree.marker = marker;
}

function updateTreeListUI() {
  let ul = document.getElementById('tree-list');
  ul.innerHTML = '';
  trees.forEach(tree => {
    let li = document.createElement('li');
    li.textContent = tree.name;
    if (tree.id === currentTreeId) li.classList.add('active');
    li.onclick = () => setCurrentTree(tree.id);
    ul.appendChild(li);
  });
}

function setCurrentTree(id) {
  currentTreeId = id;
  let tree = getCurrentTree();
  if (tree && tree.marker) map.setView([tree.lat, tree.lng], 15);
  birds = tree.birds || [];
  updateTreeListUI();
  startAppearAnimation(); // 切换树时重新触发逐渐出现
}

function saveTreesToLocalStorage() {
  let serializable = trees.map(t => ({
    id: t.id, name: t.name, lat: t.lat, lng: t.lng,
    x: t.x, y: t.y,
    birds: t.birds.map(b => ({ ...b, imgElement: null })), 
    audioMap: Array.from(t.audioMap.entries()),
    birdnetRecords: t.birdnetRecords
  }));
  localStorage.setItem('birdnetcafe_trees', JSON.stringify(serializable));
}

function loadTreesFromLocalStorage() {
  let data = localStorage.getItem('birdnetcafe_trees');
  if (!data) return;
  let parsed = JSON.parse(data);
  trees = parsed.map(t => {
    let birdsWithImg = (t.birds || []).map(b => {
      let img = loadImage(b.imgPath);
      return { 
        ...b, 
        dx: b.dx !== undefined ? b.dx : (b.x - t.x), // 兼容老数据
        dy: b.dy !== undefined ? b.dy : (b.y - t.y),
        imgElement: img,
        appearProgress: 0,
        isAppearing: false,
        hover: false
      };
    });
    return { ...t, birds: birdsWithImg, audioMap: new Map(t.audioMap) };
  });
  trees.forEach(t => addMapMarker(t));
}

// ---------- CSV 解析 ----------
async function importCSVToCurrentTree(csvFile) {
  let tree = getCurrentTree();
  if (!tree) return;
  let text = await csvFile.text();
  let records = parseCSV(text);
  tree.birdnetRecords = records;
  
  let summary = {};
  for (let rec of records) {
    let species = rec.species_common || rec.Species || rec.scientific || 'Unknown';
    let conf = parseFloat(rec.confidence || rec.Confidence || 0);
    if (isNaN(conf)) conf = 0;
    if (!summary[species]) summary[species] = { count: 0, sumConf: 0, records: [] };
    summary[species].count++;
    summary[species].sumConf += conf;
    summary[species].records.push(rec);
  }
  tree.speciesSummary = summary;
  updateCurrentTreeBirds();
  saveTreesToLocalStorage();
  showToast(`已为“${tree.name}”导入 ${records.length} 条记录`);
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 1) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  let rows = [];
  for (let i = 1; i < lines.length; i++) {
    let vals = [], cur = '', inQuote = false;
    for (let ch of lines[i]) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { vals.push(cur); cur = ''; continue; }
      cur += ch;
    }
    vals.push(cur);
    if (vals.length !== headers.length) continue;
    let obj = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = vals[j].trim();
    rows.push(obj);
  }
  return rows;
}

// ---------- UI 绑定 ----------
function bindUI() {
  canvas.mouseMoved(checkBirdHover);
  
  document.getElementById('enableAudioBtn').addEventListener('click', () => {
    audioEnabled = true;
    showToast('🎵 音频已启用！悬停在鸟身上即可播放叫声');
    // 播放一段无声音频来强行解锁部分严苛浏览器的 Autoplay 限制
    let silent = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
    silent.play().catch(()=>{});
  });
  
  document.getElementById('resetBtn').addEventListener('click', () => {
    localStorage.removeItem('birdnetcafe_trees');
    location.reload();
  });
  
  document.getElementById('createTreeBtn').addEventListener('click', () => {
    document.getElementById('newTreeCoords').value = '';
    document.getElementById('newTreeName').value = '';
    document.getElementById('newTreeCSV').value = '';
    document.getElementById('newTreeAudio').value = '';
    document.getElementById('createTreeModal').style.display = 'flex';
  });
  
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.onclick = () => {
       btn.closest('.modal').style.display = 'none';
       stopBirdAudio();
    };
  });
  
  document.getElementById('confirmCreateTree').addEventListener('click', async () => {
    let name = document.getElementById('newTreeName').value;
    let coordStr = document.getElementById('newTreeCoords').value;
    if (!name || !coordStr) { showToast('请填写树名和位置'); return; }
    let [lat, lng] = coordStr.split(',').map(Number);
    let csvFile = document.getElementById('newTreeCSV').files[0];
    let audioFilesList = Array.from(document.getElementById('newTreeAudio').files || []);
    await createNewTree(name, lat, lng, csvFile, audioFilesList);
    document.getElementById('createTreeModal').style.display = 'none';
  });
  
  document.getElementById('exportTreeBtn').addEventListener('click', () => {
    let tree = getCurrentTree();
    let exportData = {
      name: tree.name, lat: tree.lat, lng: tree.lng,
      birds: tree.birds.map(b => ({ ...b, imgElement: null })),
      audioMap: Array.from(tree.audioMap.entries())
    };
    let blob = new Blob([JSON.stringify(exportData)], {type: 'application/json'});
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url; a.download = `${tree.name}.tree.json`;
    a.click(); URL.revokeObjectURL(url);
  });
  
  document.getElementById('importTreeFile').addEventListener('change', e => {
    let file = e.target.files[0];
    if (!file) return;
    let reader = new FileReader();
    reader.onload = ev => {
      let data = JSON.parse(ev.target.result);
      let newTree = {
        id: 'tree_' + Date.now(),
        name: data.name, lat: data.lat, lng: data.lng,
        x: width / 2, y: height * 0.65,
        birds: data.birds.map(b => ({ ...b, imgElement: loadImage(b.imgPath) })),
        audioMap: new Map(data.audioMap),
        birdnetRecords: []
      };
      trees.push(newTree);
      addMapMarker(newTree);
      saveTreesToLocalStorage();
      setCurrentTree(newTree.id);
      showToast(`导入树：${data.name}`);
    };
    reader.readAsText(file);
  });
  
  document.getElementById('aboutBtn').addEventListener('click', () => {
    document.getElementById('aboutModal').style.display = 'flex';
  });
}

function showToast(msg) {
  let root = document.getElementById('toast-root');
  let toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = msg;
  root.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// 创建新树（模态框逻辑）
async function createNewTree(name, lat, lng, csvFile, audioFilesList) {
  let newId = 'tree_' + Date.now();
  let tree = {
    id: newId, name: name, lat: lat, lng: lng,
    x: width / 2, y: height * 0.65,
    birds: [], audioMap: new Map(), birdnetRecords: []
  };
  
  if (csvFile) {
    let text = await csvFile.text();
    let records = parseCSV(text);
    tree.birdnetRecords = records;
    let summary = {};
    for (let rec of records) {
      let species = rec.species_common || rec.Species || rec.scientific || 'Unknown';
      let conf = parseFloat(rec.confidence || rec.Confidence || 0);
      if (isNaN(conf)) conf = 0;
      if (!summary[species]) summary[species] = { count: 0, sumConf: 0, records: [] };
      summary[species].count++;
      summary[species].sumConf += conf;
      summary[species].records.push(rec);
    }
    tree.speciesSummary = summary;
    let birdList = [];
    let angleStep = PI / (Object.keys(summary).length + 1);
    let startAngle = -PI * 0.6;
    let i = 0;
    for (let sp in summary) {
      let preset = PRESET_SPECIES.find(s => s.common === sp);
      let imgPath = preset ? preset.img : DEFAULT_BIRD_IMG;
      let audioPath = preset ? preset.audioFile : null;
      let angle = startAngle + i * angleStep + random(-0.2, 0.2);
      let radius = random(80, 160);
      let dx = radius * cos(angle);
      let dy = radius * sin(angle) - random(20, 80);
      birdList.push({
        id: sp, species: sp,
        scientific: preset ? preset.scientific : '未知',
        confidence: summary[sp].sumConf / summary[sp].count,
        imgPath: imgPath, imgElement: loadImage(imgPath), audioPath: audioPath,
        x: tree.x + dx, y: tree.y + dy, dx: dx, dy: dy,
        size: 40, appearProgress: 0, isAppearing: false, hover: false
      });
      if (audioPath) tree.audioMap.set(sp, audioPath);
      i++;
    }
    tree.birds = birdList;
  } else {
    // 没传 CSV 文件直接注入演示鸟
    let birdList = [];
    for (let sp of PRESET_SPECIES) {
      let angle = random(-PI * 0.7, 0);
      let radius = random(80, 160);
      let dx = radius * cos(angle);
      let dy = radius * sin(angle) - random(20, 80);
      birdList.push({
        id: sp.common, species: sp.common,
        scientific: sp.scientific, confidence: sp.confidence,
        imgPath: sp.img, imgElement: loadImage(sp.img), audioPath: sp.audioFile,
        x: tree.x + dx, y: tree.y + dy, dx: dx, dy: dy,
        size: 40, appearProgress: 0, isAppearing: false, hover: false
      });
      if (sp.audioFile) tree.audioMap.set(sp.common, sp.audioFile);
    }
    tree.birds = birdList;
  }
  
  // 处理本地上传音频绑定
  for (let file of audioFilesList) {
    let url = URL.createObjectURL(file);
    let speciesHint = file.name.replace(/\.[^/.]+$/, '');
    for (let bird of tree.birds) {
      if (speciesHint.includes(bird.species) || bird.species.includes(speciesHint)) {
        tree.audioMap.set(bird.species, url);
        bird.audioPath = url;
        break;
      }
    }
  }
  trees.push(tree);
  addMapMarker(tree);
  saveTreesToLocalStorage();
  setCurrentTree(newId);
  showToast(`新树“${name}”已创建！`);
}