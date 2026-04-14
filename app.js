/* BirdNetCafe · 翎英 (AvianLinked) - 修复预置树不显示问题 */
let canvas;
let trees = [];
let currentTreeId = null;
let leaves = [];
let afcdMap = new Map();
let audioFiles = new Map();
let audioEnabled = false;
let hoverTimer = null;
let currentPopup = null;
let map = null;

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

let birdAnimationQueue = [];
let flyingBirdDivs = [];

function setup() {
  const container = document.getElementById('canvas-container');
  const w = container.clientWidth || 1000;
  const h = container.clientHeight || 700;
  canvas = createCanvas(w, h);
  canvas.parent('canvas-container');
  colorMode(HSB, 360, 100, 100);

  initMap();
  loadTreesFromLocalStorage();

  // 如果 trees 为空，或者第一棵树没有物种数据，强制重建预置树
  if (trees.length === 0 || !trees[0].speciesSummary || Object.keys(trees[0].speciesSummary).length === 0) {
    console.log("No valid tree found, creating preset tree");
    localStorage.removeItem('birdnetcafe_trees'); // 清除旧缓存
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

  // 强制刷新叶片
  updateCurrentTreeLeaves();
  console.log("Initial leaves count:", leaves.length);

  // 延迟启动飞鸟动画
  setTimeout(() => startBirdFlyAnimation(), 800);
}

function windowResized() {
  const container = document.getElementById('canvas-container');
  resizeCanvas(container.clientWidth, container.clientHeight);
  let current = getCurrentTree();
  if (current) {
    current.x = width / 2;
    current.y = height * 0.65;
    repositionLeaves();
  }
}

function draw() {
  clear();
  noStroke();
  let glow = (frameCount * 0.02) % TWO_PI;
  let rad = 200 + sin(glow) * 20;
  fill(60, 15, 92, 8);
  ellipse(width/2, height*0.65 - 40, rad, rad);
  fill(0,0,0,10);
  ellipse(width/2, height - 20, 300, 50);
  for (let leaf of leaves) drawLeaf(leaf);
}

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
    speciesSummary: {},
    audioMap: new Map(),
    birdnetRecords: []
  };
  let summary = {};
  for (let sp of PRESET_SPECIES) {
    summary[sp.common] = {
      count: 1,
      sumConf: sp.confidence,
      records: [{ species_common: sp.common, species_scientific: sp.scientific, confidence: sp.confidence }]
    };
    if (sp.audioFile) tree.audioMap.set(sp.common, sp.audioFile);
  }
  tree.speciesSummary = summary;
  trees = [tree]; // 直接替换，避免残留
  saveTreesToLocalStorage();
  console.log("Preset tree created with species:", Object.keys(summary));
}

function updateCurrentTreeLeaves() {
  let treeObj = getCurrentTree();
  if (!treeObj) {
    console.error("No current tree");
    return;
  }
  leaves = [];
  let speciesList = Object.keys(treeObj.speciesSummary || {});
  if (speciesList.length === 0) {
    console.warn("No species in current tree, using PRESET_SPECIES as fallback");
    speciesList = PRESET_SPECIES.map(s => s.common);
    // 临时构建一个虚拟的 speciesSummary 用于叶片生成
    for (let sp of speciesList) {
      if (!treeObj.speciesSummary[sp]) {
        let preset = PRESET_SPECIES.find(s => s.common === sp);
        treeObj.speciesSummary[sp] = {
          count: 1,
          sumConf: preset ? preset.confidence : 0.5,
          records: []
        };
      }
    }
  }

  let angleStep = PI / (speciesList.length + 1);
  let startAngle = -PI * 0.6;
  for (let i = 0; i < speciesList.length; i++) {
    let sp = speciesList[i];
    let info = treeObj.speciesSummary[sp];
    let avgConf = info.sumConf / info.count;
    let leafCount = Math.min(5, Math.max(1, Math.floor(info.count * 0.7) + 1));
    for (let j = 0; j < leafCount; j++) {
      let angle = startAngle + i * angleStep + random(-0.3, 0.3);
      let radius = random(80, 160);
      let baseX = treeObj.x + radius * cos(angle);
      let baseY = treeObj.y + radius * sin(angle) - random(20, 110);
      leaves.push({
        id: `${sp}_${j}`,
        baseX, baseY, x: baseX, y: baseY,
        confidence: avgConf,
        species: sp,
        records: info.records || [],
        avgConfidence: avgConf,
        count: info.count,
        hover: false,
        playing: false,
        idx: random(1000),
        highlight: false
      });
    }
  }
  console.log("Generated leaves count:", leaves.length);
}

function repositionLeaves() {
  let treeObj = getCurrentTree();
  if (!treeObj) return;
  for (let lf of leaves) {
    let angle = atan2(lf.baseY - treeObj.y, lf.baseX - treeObj.x);
    let radius = dist(treeObj.x, treeObj.y, lf.baseX, lf.baseY);
    lf.baseX = treeObj.x + radius * cos(angle);
    lf.baseY = treeObj.y + radius * sin(angle);
  }
}

function drawLeaf(lf) {
  lf.x = lf.baseX + sin(frameCount * 0.02 + lf.idx) * 2.5;
  lf.y = lf.baseY + cos(frameCount * 0.025 + lf.idx) * 2;

  push();
  translate(lf.x, lf.y);
  rotate(sin(frameCount * 0.03 + lf.idx) * 0.2);
  let size = map(lf.confidence, 0, 1, 14, 26);
  let hue = map(lf.confidence, 0, 1, 80, 130);
  let sat = map(lf.confidence, 0, 1, 50, 85);
  let bright = map(lf.confidence, 0, 1, 70, 92);
  if (lf.hover) {
    fill(hue, sat, bright + 10);
    stroke(0, 0, 0, 40);
    strokeWeight(1.2);
  } else {
    noStroke();
    fill(hue, sat, bright, 92);
  }
  if (lf.highlight) {
    fill(hue, sat, 95, 80);
    ellipse(0, 0, size*1.4, size*0.9);
  }
  beginShape();
  vertex(-size * 0.4, 0);
  bezierVertex(-size * 0.6, -size * 0.55, size * 0.6, -size * 0.55, size * 0.4, 0);
  bezierVertex(size * 0.6, size * 0.55, -size * 0.6, size * 0.55, -size * 0.4, 0);
  endShape(CLOSE);
  pop();
}
function repositionLeaves() {
  let treeObj = getCurrentTree();
  if (!treeObj) return;
  for (let lf of leaves) {
    let angle = atan2(lf.baseY - treeObj.y, lf.baseX - treeObj.x);
    let radius = dist(treeObj.x, treeObj.y, lf.baseX, lf.baseY);
    lf.baseX = treeObj.x + radius * cos(angle);
    lf.baseY = treeObj.y + radius * sin(angle);
  }
}

function drawLeaf(lf) {
  lf.x = lf.baseX + sin(frameCount * 0.02 + lf.idx) * 2.5;
  lf.y = lf.baseY + cos(frameCount * 0.025 + lf.idx) * 2;

  push();
  translate(lf.x, lf.y);
  rotate(sin(frameCount * 0.03 + lf.idx) * 0.2);
  let size = map(lf.confidence, 0, 1, 14, 26);
  let hue = map(lf.confidence, 0, 1, 80, 130);
  let sat = map(lf.confidence, 0, 1, 50, 85);
  let bright = map(lf.confidence, 0, 1, 70, 92);
  if (lf.hover) {
    fill(hue, sat, bright + 10);
    stroke(0, 0, 0, 40);
    strokeWeight(1.2);
  } else {
    noStroke();
    fill(hue, sat, bright, 92);
  }
  if (lf.highlight) {
    fill(hue, sat, 95, 80);
    ellipse(0, 0, size*1.4, size*0.9);
  }
  beginShape();
  vertex(-size * 0.4, 0);
  bezierVertex(-size * 0.6, -size * 0.55, size * 0.6, -size * 0.55, size * 0.4, 0);
  bezierVertex(size * 0.6, size * 0.55, -size * 0.6, size * 0.55, -size * 0.4, 0);
  endShape(CLOSE);
  pop();
}

// ---------- 主动飞鸟动画 ----------
function startBirdFlyAnimation() {
  if (leaves.length === 0) {
    console.warn("No leaves to animate");
    return;
  }
  let speciesDone = new Set();
  let tasks = [];
  for (let leaf of leaves) {
    if (!speciesDone.has(leaf.species)) {
      speciesDone.add(leaf.species);
      tasks.push({ species: leaf.species, targetLeaf: leaf });
    }
  }
  tasks.sort(() => Math.random() - 0.5);
  birdAnimationQueue = tasks;
  processNextBird();
}

function processNextBird() {
  if (birdAnimationQueue.length === 0) return;
  let task = birdAnimationQueue.shift();
  flyBirdToLeaf(task.species, task.targetLeaf, () => {
    task.targetLeaf.highlight = true;
    setTimeout(() => { task.targetLeaf.highlight = false; }, 800);
    setTimeout(() => processNextBird(), 400);
  });
}

function flyBirdToLeaf(species, targetLeaf, onComplete) {
  let preset = PRESET_SPECIES.find(s => s.common === species);
  let imgUrl = preset ? preset.img : DEFAULT_BIRD_IMG;
  let startX = random(-100, width+100);
  let startY = random(-100, -50);
  if (random() > 0.5) startY = height + 50;
  let canvasRect = canvas.elt.getBoundingClientRect();
  let targetX = canvasRect.left + targetLeaf.x;
  let targetY = canvasRect.top + targetLeaf.y;
  let birdDiv = document.createElement('div');
  birdDiv.className = 'flying-bird';
  birdDiv.style.backgroundImage = `url(${imgUrl})`;
  birdDiv.style.left = startX + 'px';
  birdDiv.style.top = startY + 'px';
  birdDiv.style.setProperty('--tx', (targetX - startX) + 'px');
  birdDiv.style.setProperty('--ty', (targetY - startY) + 'px');
  document.body.appendChild(birdDiv);
  flyingBirdDivs.push(birdDiv);
  birdDiv.addEventListener('animationend', () => {
    birdDiv.remove();
    if (onComplete) onComplete();
  });
}

// ---------- 悬停浮窗与音频 ----------
function checkLeafHover() {
  let hit = null;
  for (let lf of leaves) {
    let d = dist(mouseX, mouseY, lf.x, lf.y);
    let size = map(lf.confidence, 0, 1, 14, 26);
    if (d < size * 0.7) hit = lf;
    lf.hover = (lf === hit);
  }
  if (hit && !currentPopup) {
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => showPopup(hit), 180);
  } else if (!hit && currentPopup) {
    closePopup();
    if (hoverTimer) clearTimeout(hoverTimer);
  }
}

async function showPopup(leaf) {
  closePopup();
  let species = leaf.species;
  let preset = PRESET_SPECIES.find(s => s.common === species);
  let imgUrl = preset ? preset.img : DEFAULT_BIRD_IMG;
  let wikiUrl = `https://zh.wikipedia.org/wiki/${encodeURIComponent(species)}`;
  let sciName = leaf.records[0]?.species_scientific || (preset ? preset.scientific : '未知');
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
    <div class="meta">📊 置信度 ${(leaf.avgConfidence*100).toFixed(0)}% · 🔢 ${leaf.count}条记录</div>
    <div class="desc">${desc}</div>
    <div class="controls">
      <button class="play-btn">▶ 播放鸟叫</button>
      <button class="stop-btn">⏹️ 停止</button>
      <a href="${wikiUrl}" target="_blank" class="btn-icon">📖 百科</a>
    </div>
  `;
  const rect = canvas.elt.getBoundingClientRect();
  let left = rect.left + leaf.x - 150;
  let top = rect.top + leaf.y - 140;
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

// ---------- 地图与多树管理 ----------
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
  updateCurrentTreeLeaves();
  updateTreeListUI();
  startBirdFlyAnimation();
}

function saveTreesToLocalStorage() {
  let serializable = trees.map(t => ({
    id: t.id, name: t.name, lat: t.lat, lng: t.lng,
    x: t.x, y: t.y,
    speciesSummary: t.speciesSummary,
    audioMap: Array.from(t.audioMap.entries()),
    birdnetRecords: t.birdnetRecords
  }));
  localStorage.setItem('birdnetcafe_trees', JSON.stringify(serializable));
}

function loadTreesFromLocalStorage() {
  let data = localStorage.getItem('birdnetcafe_trees');
  if (!data) return;
  let parsed = JSON.parse(data);
  trees = parsed.map(t => ({
    ...t,
    audioMap: new Map(t.audioMap)
  }));
  trees.forEach(t => addMapMarker(t));
}

async function createNewTree(name, lat, lng, csvFile, audioFilesList) {
  let newId = 'tree_' + Date.now();
  let tree = {
    id: newId, name: name, lat: lat, lng: lng,
    x: width/2, y: height*0.65,
    speciesSummary: {},
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
  }
  for (let file of audioFilesList) {
    let url = URL.createObjectURL(file);
    let speciesHint = file.name.replace(/\.[^/.]+$/, '');
    for (let sp of Object.keys(tree.speciesSummary)) {
      if (speciesHint.includes(sp) || sp.includes(speciesHint)) {
        tree.audioMap.set(sp, url);
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
  canvas.mouseMoved(checkLeafHover);
  document.getElementById('enableAudioBtn').addEventListener('click', () => {
    if (getAudioContext().state !== 'running') {
      getAudioContext().resume().then(() => {
        audioEnabled = true;
        showToast('音频已启用，悬停叶片可播放');
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
      speciesSummary: tree.speciesSummary,
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
        speciesSummary: data.speciesSummary,
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
  setTimeout(() => toast.remove(), 2200);
}