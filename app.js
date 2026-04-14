/* BirdNetCafe · 翎英 (AvianLinked)
   重构版：鸟直接显示在树上，逐渐出现动画，保留地图、多树、音频、浮窗
*/

let canvas;
let trees = [];
let currentTreeId = null;
let birds = [];              // 当前树的鸟对象数组
let afcdMap = new Map();
let audioFiles = new Map();
let audioEnabled = false;
let hoverTimer = null;
let currentPopup = null;
let map = null;

// 预置鸟类数据（包含图片、音频、置信度等）
const PRESET_SPECIES = [
  { common: "黑领椋鸟", scientific: "Gracupica nigricollis", confidence: 0.94, audioFile: "audio/黑领椋鸟.mp3", img: "image/黑领椋鸟.png" },
  { common: "暗绿绣眼鸟", scientific: "Zosterops simplex", confidence: 0.85, audioFile: "audio/暗绿绣眼鸟.mp3", img: "image/暗绿绣眼鸟.png" },
  { common: "红耳鹎", scientific: "Pycnonotus jocosus", confidence: 0.78, audioFile: "audio/红耳鹎.mp3", img: "image/红耳鹎.png" },
  { common: "噪鹃", scientific: "Eudynamys scolopaceus", confidence: 0.77, audioFile: "audio/噪鹃.mp3", img: "image/噪鹃.png" },
  { common: "黄眉柳莺", scientific: "Phylloscopus inornatus", confidence: 0.75, audioFile: "audio/黄眉柳莺.mp3", img: "image/黄眉柳莺.png" },
  { common: "家麻雀", scientific: "Passer domesticus", confidence: 0.71, audioFile: "audio/家麻雀.mp3", img: "image/家麻雀.png" },
  { common: "白喉红臀鹎", scientific: "Pycnonotus aurigaster", confidence: 0.53, audioFile: "audio/白喉红臀鹎.mp3", img: "image/白喉红臀鹎.png" }
];

// 【修复点 1】修改跨域默认图片，使用本地图片避免 CORS 报错拦截
const DEFAULT_BIRD_IMG = "image/黑领椋鸟.png";

// 动画相关
let appearAnimationQueue = [];
let isAnimating = false;

// ---------- p5.js 初始化 ----------
function setup() {
  const container = document.getElementById('canvas-container');
  const w = container.clientWidth || 1000;
  const h = container.clientHeight || 700;
  canvas = createCanvas(w, h);
  canvas.parent('canvas-container');
  
  // 【修复点 2】显式指定透明度的最大值为 255
  colorMode(HSB, 360, 100, 100, 255);

  initMap();
  loadTreesFromLocalStorage();

  // 如果没有有效树，创建预置树
  if (trees.length === 0 || !trees[0].birds || trees[0].birds.length === 0) {
    console.log("No valid tree found, creating preset tree");
    localStorage.removeItem('birdnetcafe_trees');
    createPresetTree();
  }

  // 确保当前树有坐标
  let firstTree = trees[0];
  if (firstTree) {
    firstTree.x = width / 2;
    firstTree.y = height * 0.65;
  }
  setCurrentTree(trees[0].id);
  updateTreeListUI();
  bindUI();

  // 启动逐渐出现动画
  setTimeout(() => startAppearAnimation(), 500);
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
  clear();
  noStroke();
  // 光晕效果
  let glow = (frameCount * 0.02) % TWO_PI;
  let rad = 200 + sin(glow) * 20;
  fill(60, 15, 92, 8);
  ellipse(width/2, height*0.65 - 40, rad, rad);
  fill(0,0,0,10);
  ellipse(width/2, height - 20, 300, 50);
  // 绘制所有鸟
  for (let bird of birds) drawBird(bird);
}

// 绘制单个鸟（图片或占位符）
function drawBird(bird) {
  push();
  translate(bird.x, bird.y);
  // 动画：逐渐出现（透明度 + 缩放）
  let alpha = bird.appearProgress * 255;
  let scaleVal = 0.6 + bird.appearProgress * 0.4;
  scale(scaleVal);
  
  // 【修复点 3】判断图片宽度 > 0 表示加载成功
  if (bird.imgElement && bird.imgElement.width > 0) {
    // 【修复点 4】在 HSB 模式下，用白色 (0, 0, 100) 配合透明度 tint
    tint(0, 0, 100, alpha);
    image(bird.imgElement, -bird.size/2, -bird.size/2, bird.size, bird.size);
    noTint();
  } else {
    // 图片未加载时绘制圆形占位符
    fill(80, 60, 70, alpha);
    ellipse(0, 0, bird.size, bird.size);
    fill(0, 0, 100, alpha);
    textAlign(CENTER, CENTER);
    textSize(12);
    text(bird.species.substring(0,2), 0, 0);
  }
  
  // 悬停高亮外圈
  if (bird.hover) {
    noFill();
    stroke(60, 80, 100);
    strokeWeight(2);
    ellipse(0, 0, bird.size + 6, bird.size + 6);
  }
  pop();
}

// ---------- 树与鸟管理 ----------
function getCurrentTree() {
  return trees.find(t => t.id === currentTreeId);
}

function createPresetTree() {
  const tree = {
    id: 'preset_tree',
    name: '香港公园 · 榕树',
    lat: 22.278,
    lng: 114.162,
    x: width/2,
    y: height*0.65,
    birds: [],            // 存储鸟对象
    audioMap: new Map(),
    birdnetRecords: []
  };
  // 生成预置鸟
  let birdList = [];
  for (let sp of PRESET_SPECIES) {
    let angle = random(-PI*0.7, 0);
    let radius = random(80, 160);
    let x = tree.x + radius * cos(angle);
    let y = tree.y + radius * sin(angle) - random(20, 80);
    let img = loadImage(sp.img, () => {}, () => {});
    birdList.push({
      id: sp.common,
      species: sp.common,
      scientific: sp.scientific,
      confidence: sp.confidence,
      imgPath: sp.img,
      imgElement: img,
      audioPath: sp.audioFile,
      x: x, y: y,
      baseX: x, baseY: y,
      size: 36,
      appearProgress: 0,
      hover: false,
      playing: false
    });
    if (sp.audioFile) tree.audioMap.set(sp.common, sp.audioFile);
  }
  tree.birds = birdList;
  trees = [tree];
  saveTreesToLocalStorage();
  console.log("Preset tree created with birds:", birdList.length);
}

// 根据当前树的物种数据更新鸟的位置（用于CSV导入后）
function updateCurrentTreeBirds() {
  let treeObj = getCurrentTree();
  if (!treeObj) return;
  let speciesList = Object.keys(treeObj.speciesSummary || {});
  if (speciesList.length === 0) {
    // 没有数据时使用预置物种
    speciesList = PRESET_SPECIES.map(s => s.common);
  }
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
    let img = loadImage(imgPath, () => {}, () => {});
    let angle = startAngle + i * angleStep + random(-0.2, 0.2);
    let radius = random(80, 160);
    let x = treeObj.x + radius * cos(angle);
    let y = treeObj.y + radius * sin(angle) - random(20, 80);
    newBirds.push({
      id: spName,
      species: spName,
      scientific: preset ? preset.scientific : '未知',
      confidence: avgConf,
      imgPath: imgPath,
      imgElement: img,
      audioPath: audioPath,
      x: x, y: y,
      baseX: x, baseY: y,
      size: 36,
      appearProgress: 0,
      hover: false,
      playing: false
    });
    if (audioPath) treeObj.audioMap.set(spName, audioPath);
  }
  treeObj.birds = newBirds;
  birds = newBirds;
  // 重新触发出现动画
  startAppearAnimation();
}

function repositionBirds() {
  let treeObj = getCurrentTree();
  if (!treeObj) return;
  for (let bird of birds) {
    let angle = atan2(bird.baseY - treeObj.y, bird.baseX - treeObj.x);
    let radius = dist(treeObj.x, treeObj.y, bird.baseX, bird.baseY);
    bird.baseX = treeObj.x + radius * cos(angle);
    bird.baseY = treeObj.y + radius * sin(angle);
    bird.x = bird.baseX;
    bird.y = bird.baseY;
  }
}

// ---------- 鸟逐渐出现动画 ----------
function startAppearAnimation() {
  if (birds.length === 0) return;
  // 重置所有鸟的进度
  for (let bird of birds) bird.appearProgress = 0;
  appearAnimationQueue = [...birds];
  processNextAppear();
}

function processNextAppear() {
  if (appearAnimationQueue.length === 0) return;
  let bird = appearAnimationQueue.shift();
  // 动画：0 -> 1 在 0.6 秒内完成
  let startTime = millis();
  function step() {
    let elapsed = millis() - startTime;
    let progress = Math.min(1, elapsed / 600);
    bird.appearProgress = progress;
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      // 完成后延迟0.3秒出现下一只
      setTimeout(() => processNextAppear(), 300);
    }
  }
  step();
}

// ---------- 悬停检测与浮窗 ----------
function checkBirdHover() {
  let hit = null;
  for (let bird of birds) {
    let d = dist(mouseX, mouseY, bird.x, bird.y);
    if (d < bird.size/2) hit = bird;
    bird.hover = (bird === hit);
  }
  if (hit && !currentPopup) {
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => showPopup(hit), 180);
  } else if (!hit && currentPopup) {
    closePopup();
    if (hoverTimer) clearTimeout(hoverTimer);
  }
}

async function showPopup(bird) {
  closePopup();
  let species = bird.species;
  let imgUrl = bird.imgPath;
  let wikiUrl = `https://zh.wikipedia.org/wiki/${encodeURIComponent(species)}`;
  let sciName = bird.scientific;
  let desc = afcdMap.get(species) || '香港常见鸟类，鸣声独特。';

  const root = document.getElementById('popup-root');
  const popup = document.createElement('div');
  popup.className = 'leaf-popup';
  popup.innerHTML = `
    <button class="close-btn">×</button>
    <div style="display:flex; gap:12px;">
      <img src="${imgUrl}" style="width:70px; height:70px; object-fit:cover; border-radius:12px;">
      <div><h4>${species}</h4><div class="sci-name">${sciName}</div></div>
    </div>
    <div class="meta">📊 置信度 ${(bird.confidence*100).toFixed(0)}%</div>
    <div class="desc">${desc}</div>
    <div class="controls">
      <button class="play-btn">▶ 播放鸟叫</button>
      <button class="stop-btn">⏹️ 停止</button>
      <a href="${wikiUrl}" target="_blank" class="btn-icon">📖 百科</a>
    </div>
  `;
  const rect = canvas.elt.getBoundingClientRect();
  let left = rect.left + bird.x - 150;
  let top = rect.top + bird.y - 140;
  left = Math.min(window.innerWidth-280, Math.max(10, left));
  top = Math.max(10, top);
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
  root.appendChild(popup);
  currentPopup = popup;

  // 音频处理
  let tree = getCurrentTree();
  let audioPath = tree.audioMap.get(species);
  let playBtn = popup.querySelector('.play-btn');
  let stopBtn = popup.querySelector('.stop-btn');
  let audioObj = null;

  if (audioPath && audioEnabled) {
    if (typeof audioPath === 'string') {
      audioObj = new Audio(audioPath);
      playBtn.onclick = () => audioObj.play();
      stopBtn.onclick = () => { audioObj.pause(); audioObj.currentTime = 0; };
    } else if (typeof audioPath.play === 'function') {
      playBtn.onclick = () => audioPath.play();
      stopBtn.onclick = () => audioPath.stop();
    } else {
      playBtn.onclick = () => showToast('音频格式不支持');
    }
  } else {
    playBtn.onclick = () => showToast('未上传该物种的音频或未启用音频');
    stopBtn.onclick = () => {};
  }
  popup.querySelector('.close-btn').onclick = closePopup;
}

function closePopup() {
  if (currentPopup) currentPopup.remove();
  currentPopup = null;
  if (hoverTimer) clearTimeout(hoverTimer);
}

// ---------- 地图与多树管理（保留原有功能，适配鸟类）----------
function initMap() { 
  map = L.map('map').setView([22.278, 114.162], 13);
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
  startAppearAnimation();  // 切换树后重新播放出现动画
}

function saveTreesToLocalStorage() {
  let serializable = trees.map(t => ({
    id: t.id, name: t.name, lat: t.lat, lng: t.lng,
    x: t.x, y: t.y,
    birds: t.birds.map(b => ({ ...b, imgElement: null })), // 不序列化图片对象
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
    // 重新加载图片
    let birdsWithImg = (t.birds || []).map(b => {
      let img = loadImage(b.imgPath, () => {}, () => {});
      return { ...b, imgElement: img };
    });
    return {
      ...t,
      birds: birdsWithImg,
      audioMap: new Map(t.audioMap)
    };
  });
  trees.forEach(t => addMapMarker(t));
}

// CSV导入后更新当前树的鸟类
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
    if (!summary[species]) summary[species] = { count:0, sumConf:0, records:[] };
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
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  if (lines.length<1) return [];
  const headers = lines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,''));
  let rows=[];
  for(let i=1;i<lines.length;i++){
    let vals=[], cur='', inQuote=false;
    for(let ch of lines[i]){
      if(ch==='"'){ inQuote=!inQuote; continue; }
      if(ch===',' && !inQuote){ vals.push(cur); cur=''; continue; }
      cur+=ch;
    }
    vals.push(cur);
    if(vals.length!==headers.length) continue;
    let obj={};
    for(let j=0;j<headers.length;j++) obj[headers[j]]=vals[j].trim();
    rows.push(obj);
  }
  return rows;
}

// ---------- UI 绑定 ----------
function bindUI() {
  canvas.mouseMoved(checkBirdHover);
  document.getElementById('enableAudioBtn').addEventListener('click', () => {
    if (getAudioContext().state !== 'running') {
      getAudioContext().resume().then(() => {
        audioEnabled = true;
        showToast('音频已启用，悬停鸟即可播放');
      });
    } else {
      audioEnabled = true;
      showToast('音频已启用');
    }
  });
  document.getElementById('resetBtn').addEventListener('click', () => {
    localStorage.clear();
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
    btn.onclick = () => btn.closest('.modal').style.display = 'none';
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
      name: tree.name,
      lat: tree.lat, lng: tree.lng,
      birds: tree.birds.map(b => ({ ...b, imgElement: null })),
      audioMap: Array.from(tree.audioMap.entries())
    };
    let dataStr = JSON.stringify(exportData);
    let blob = new Blob([dataStr], {type: 'application/json'});
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = `${tree.name}.tree.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById('importTreeFile').addEventListener('change', e => {
    let file = e.target.files[0];
    if (!file) return;
    let reader = new FileReader();
    reader.onload = ev => {
      let data = JSON.parse(ev.target.result);
      let newTree = {
        id: 'tree_' + Date.now(),
        name: data.name,
        lat: data.lat, lng: data.lng,
        x: width/2, y: height*0.65,
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
  // 新增：为当前树导入CSV的按钮（复用原有的birdnetFile）
  document.getElementById('birdnetFile').addEventListener('change', async e => {
    let file = e.target.files[0];
    if (!file) return;
    await importCSVToCurrentTree(file);
  });
}

function showToast(msg) {
  let root = document.getElementById('toast-root');
  let toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = msg;
  root.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

// 创建新树（模态框）- 复用原有逻辑，但生成鸟类
async function createNewTree(name, lat, lng, csvFile, audioFilesList) {
  let newId = 'tree_' + Date.now();
  let tree = {
    id: newId, name: name, lat: lat, lng: lng,
    x: width/2, y: height*0.65,
    birds: [],
    audioMap: new Map(),
    birdnetRecords: []
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
      if (!summary[species]) summary[species] = { count:0, sumConf:0, records:[] };
      summary[species].count++;
      summary[species].sumConf += conf;
      summary[species].records.push(rec);
    }
    tree.speciesSummary = summary;
    // 根据summary生成鸟
    let birdList = [];
    let angleStep = PI / (Object.keys(summary).length + 1);
    let startAngle = -PI * 0.6;
    let i = 0;
    for (let sp in summary) {
      let avgConf = summary[sp].sumConf / summary[sp].count;
      let preset = PRESET_SPECIES.find(s => s.common === sp);
      let imgPath = preset ? preset.img : DEFAULT_BIRD_IMG;
      let audioPath = preset ? preset.audioFile : null;
      let img = loadImage(imgPath, () => {}, () => {});
      let angle = startAngle + i * angleStep + random(-0.2, 0.2);
      let radius = random(80, 160);
      let x = tree.x + radius * cos(angle);
      let y = tree.y + radius * sin(angle) - random(20, 80);
      birdList.push({
        id: sp,
        species: sp,
        scientific: preset ? preset.scientific : '未知',
        confidence: avgConf,
        imgPath: imgPath,
        imgElement: img,
        audioPath: audioPath,
        x: x, y: y,
        baseX: x, baseY: y,
        size: 36,
        appearProgress: 0,
        hover: false,
        playing: false
      });
      if (audioPath) tree.audioMap.set(sp, audioPath);
      i++;
    }
    tree.birds = birdList;
  } else {
    // 没有CSV时使用预置鸟作为演示
    let birdList = [];
    for (let sp of PRESET_SPECIES) {
      let angle = random(-PI*0.7, 0);
      let radius = random(80, 160);
      let x = tree.x + radius * cos(angle);
      let y = tree.y + radius * sin(angle) - random(20, 80);
      let img = loadImage(sp.img, () => {}, () => {});
      birdList.push({
        id: sp.common,
        species: sp.common,
        scientific: sp.scientific,
        confidence: sp.confidence,
        imgPath: sp.img,
        imgElement: img,
        audioPath: sp.audioFile,
        x: x, y: y,
        baseX: x, baseY: y,
        size: 36,
        appearProgress: 0,
        hover: false,
        playing: false
      });
      if (sp.audioFile) tree.audioMap.set(sp.common, sp.audioFile);
    }
    tree.birds = birdList;
  }
  // 处理上传的音频文件（匹配物种）
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