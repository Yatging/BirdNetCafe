/* BirdNetCafe · 翎英 (AvianLinked)
   原生 DOM 重构版：抛弃 p5.js，完美解决本地图片加载黑屏、跨域和点击交互丢失的问题
*/

let trees = [];
let currentTreeId = null;
let birds = [];
let afcdMap = new Map();
let audioEnabled = false;
let currentPopup = null;
let map = null;

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

const DEFAULT_BIRD_IMG = "image/黑领椋鸟.png";

// 原生数学辅助函数
function random(min, max) { return Math.random() * (max - min) + min; }
const PI = Math.PI;

// ---------- 1. 初始化 ----------
document.addEventListener('DOMContentLoaded', () => {
  injectCSS();
  initMap();
  loadTreesFromLocalStorage();

  if (trees.length === 0 || !trees[0].birds || trees[0].birds.length === 0) {
    localStorage.removeItem('birdnetcafe_trees');
    createPresetTree();
  }

  setCurrentTree(trees[0].id);
  updateTreeListUI();
  bindUI();

  // 监听窗口大小变化以重绘鸟的位置
  window.addEventListener('resize', () => {
    if (getCurrentTree()) renderBirdsDOM();
  });
});

// ---------- 2. 核心渲染 (原生 DOM 替代 p5.js) ----------
function renderBirdsDOM() {
  const container = document.getElementById('canvas-container');
  // 确保容器能正常包裹绝对定位元素
  container.style.position = 'relative';
  container.style.overflow = 'hidden';
  container.innerHTML = ''; // 清空上一屏的内容

  let tree = getCurrentTree();
  if (!tree) return;

  const w = container.clientWidth || 1000;
  const h = container.clientHeight || 700;

  // 注入光晕特效 (纯 CSS)
  const glow = document.createElement('div');
  glow.className = 'tree-glow';
  glow.style.left = (w / 2) + 'px';
  glow.style.top = (h * 0.65 - 40) + 'px';
  container.appendChild(glow);

  tree.x = w / 2;
  tree.y = h * 0.65;

  // 遍历绘制小鸟 (使用真实的 DOM 元素，彻底解决图片不显示问题)
  birds.forEach((bird, index) => {
    // 根据相对偏移量计算绝对坐标
    bird.x = tree.x + bird.dx;
    bird.y = tree.y + bird.dy;

    const node = document.createElement('div');
    node.className = 'bird-node';
    node.style.left = bird.x + 'px';
    node.style.top = bird.y + 'px';
    // 设置 CSS 动画的依次延迟出现效果
    node.style.animationDelay = `${index * 0.15}s`;

    const img = document.createElement('img');
    img.src = bird.imgPath;
    // 如果图片找不到，自动使用默认图片
    img.onerror = () => { img.src = DEFAULT_BIRD_IMG; };
    node.appendChild(img);

    // 绑定点击弹出浮窗事件
    node.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止事件冒泡到父容器
      showPopup(bird);
    });

    container.appendChild(node);
  });

  // 点击空白处关闭浮窗
  container.addEventListener('click', closePopup);
}

// 动态注入原生特效所需的 CSS
function injectCSS() {
  const style = document.createElement('style');
  style.innerHTML = `
    .bird-node {
      position: absolute;
      width: 44px;
      height: 44px;
      transform: translate(-50%, -50%) scale(0);
      opacity: 0;
      border-radius: 50%;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
      transition: box-shadow 0.2s, z-index 0.2s;
      z-index: 10;
      animation: birdPopIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      background-color: rgba(255, 255, 255, 0.5);
    }
    .bird-node:hover {
      box-shadow: 0 0 0 3px #607d8b, 0 6px 15px rgba(0,0,0,0.4);
      z-index: 20;
    }
    .bird-node img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 50%;
      pointer-events: none; /* 让外层 div 捕捉点击事件 */
    }
    @keyframes birdPopIn {
      to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    }
    .tree-glow {
      position: absolute;
      width: 350px;
      height: 350px;
      background: radial-gradient(circle, rgba(100,20,130,0.12) 0%, rgba(255,255,255,0) 70%);
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 1;
      animation: pulse 4s infinite alternate;
    }
    @keyframes pulse {
      from { transform: translate(-50%, -50%) scale(0.9); }
      to { transform: translate(-50%, -50%) scale(1.1); }
    }
  `;
  document.head.appendChild(style);
}

// ---------- 3. 树与数据生成逻辑 ----------
function getCurrentTree() {
  return trees.find(t => t.id === currentTreeId);
}

function createPresetTree() {
  const tree = {
    id: 'preset_tree',
    name: '香港公园 · 榕树',
    lat: 22.278,
    lng: 114.162,
    birds: [],
    audioMap: new Map(),
    birdnetRecords: []
  };

  let birdList = [];
  for (let sp of PRESET_SPECIES) {
    let angle = random(-PI * 0.7, 0);
    let radius = random(80, 160);
    // 储存相对偏移量 dx, dy
    let dx = radius * Math.cos(angle);
    let dy = radius * Math.sin(angle) - random(20, 80);
    
    birdList.push({
      id: sp.common,
      species: sp.common,
      scientific: sp.scientific,
      confidence: sp.confidence,
      imgPath: sp.img,
      audioPath: sp.audioFile,
      dx: dx,
      dy: dy
    });
    if (sp.audioFile) tree.audioMap.set(sp.common, sp.audioFile);
  }
  tree.birds = birdList;
  trees = [tree];
  saveTreesToLocalStorage();
}

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
    
    let angle = startAngle + i * angleStep + random(-0.2, 0.2);
    let radius = random(80, 160);
    let dx = radius * Math.cos(angle);
    let dy = radius * Math.sin(angle) - random(20, 80);
    
    newBirds.push({
      id: spName,
      species: spName,
      scientific: preset ? preset.scientific : '未知',
      confidence: avgConf,
      imgPath: preset ? preset.img : DEFAULT_BIRD_IMG,
      audioPath: preset ? preset.audioFile : null,
      dx: dx,
      dy: dy
    });
    if (preset && preset.audioFile) treeObj.audioMap.set(spName, preset.audioFile);
  }
  treeObj.birds = newBirds;
  birds = newBirds;
  renderBirdsDOM();
}

// ---------- 4. 浮窗交互管理 ----------
function showPopup(bird) {
  closePopup();
  let species = bird.species;
  let wikiUrl = `https://zh.wikipedia.org/wiki/${encodeURIComponent(species)}`;
  let desc = afcdMap.get(species) || '香港常见鸟类，鸣声独特，为城市生态增添活力。';

  let root = document.getElementById('popup-root') || document.body;
  const popup = document.createElement('div');
  popup.className = 'leaf-popup';
  popup.style.position = 'absolute';
  popup.style.zIndex = '9999';

  popup.innerHTML = `
    <button class="close-btn" style="position:absolute; right:10px; top:10px; border:none; background:none; font-size:16px; cursor:pointer;">✖</button>
    <div style="display:flex; gap:12px; margin-top:5px;">
      <img src="${bird.imgPath}" onerror="this.src='${DEFAULT_BIRD_IMG}'" style="width:70px; height:70px; object-fit:cover; border-radius:12px;">
      <div>
        <h4 style="margin:0; font-size:16px;">${species}</h4>
        <div style="font-size:12px; color:#666; font-style:italic;">${bird.scientific}</div>
      </div>
    </div>
    <div style="margin-top:10px; font-size:12px; font-weight:bold; color:#4a7a5e;">📊 置信度 ${(bird.confidence * 100).toFixed(0)}%</div>
    <div style="font-size:13px; color:#444; margin-top:8px;">${desc}</div>
    <div style="margin-top:12px; display:flex; gap:8px;">
      <button class="play-btn" style="padding:6px 12px; background:#4a7a5e; color:#fff; border:none; border-radius:6px; cursor:pointer;">▶ 播放鸟叫</button>
      <button class="stop-btn" style="padding:6px 12px; background:#e0e0e0; color:#333; border:none; border-radius:6px; cursor:pointer;">⏹️</button>
      <a href="${wikiUrl}" target="_blank" style="padding:6px 12px; background:#f0f0f0; color:#333; text-decoration:none; border-radius:6px; font-size:13px;">📖 百科</a>
    </div>
  `;

  // 保证位置不溢出屏幕
  const containerRect = document.getElementById('canvas-container').getBoundingClientRect();
  let left = containerRect.left + bird.x - 150;
  let top = containerRect.top + bird.y - 140;
  left = Math.min(window.innerWidth - 280, Math.max(10, left));
  top = Math.max(10, top);
  
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
  root.appendChild(popup);
  currentPopup = popup;

  // 绑定内部音频按钮
  let tree = getCurrentTree();
  let audioPath = tree.audioMap.get(species);
  let playBtn = popup.querySelector('.play-btn');
  let stopBtn = popup.querySelector('.stop-btn');
  let audioObj = null;

  if (audioPath && audioEnabled) {
    audioObj = new Audio(audioPath);
    playBtn.onclick = () => { audioObj.currentTime = 0; audioObj.play(); };
    stopBtn.onclick = () => { audioObj.pause(); audioObj.currentTime = 0; };
  } else {
    playBtn.onclick = () => showToast(audioEnabled ? '未找到该物种音频' : '请先在顶栏点击【启用音频】');
  }
  
  // 阻止在卡片上的点击冒泡导致卡片关闭
  popup.addEventListener('click', (e) => e.stopPropagation());
  popup.querySelector('.close-btn').onclick = closePopup;
}

function closePopup() {
  if (currentPopup) currentPopup.remove();
  currentPopup = null;
}

// ---------- 5. 地图、多树与 CSV 管理 ----------
function initMap() { 
  map = L.map('map').setView([22.278, 114.162], 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OSM'
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
  renderBirdsDOM(); // 切换树时重新执行原生 DOM 渲染
}

function saveTreesToLocalStorage() {
  let serializable = trees.map(t => ({
    id: t.id, name: t.name, lat: t.lat, lng: t.lng,
    birds: t.birds,
    audioMap: Array.from(t.audioMap.entries()),
    birdnetRecords: t.birdnetRecords
  }));
  localStorage.setItem('birdnetcafe_trees', JSON.stringify(serializable));
}

function loadTreesFromLocalStorage() {
  let data = localStorage.getItem('birdnetcafe_trees');
  if (!data) return;
  trees = JSON.parse(data).map(t => ({
    ...t, audioMap: new Map(t.audioMap)
  }));
  trees.forEach(t => addMapMarker(t));
}

// ---------- UI 事件绑定与 CSV 解析 ----------
function bindUI() {
  document.getElementById('enableAudioBtn').addEventListener('click', () => {
    audioEnabled = true;
    showToast('🎵 音频已启用！点击小鸟即可播放叫声');
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    localStorage.clear();
    location.reload();
  });

  document.getElementById('createTreeBtn').addEventListener('click', () => {
    document.getElementById('newTreeCoords').value = '';
    document.getElementById('newTreeName').value = '';
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

  document.getElementById('birdnetFile').addEventListener('change', async e => {
    let file = e.target.files[0];
    if (!file) return;
    await importCSVToCurrentTree(file);
  });
}

function showToast(msg) {
  let root = document.getElementById('toast-root');
  if(!root) { root = document.createElement('div'); root.id = 'toast-root'; document.body.appendChild(root); }
  let toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = msg;
  root.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

async function createNewTree(name, lat, lng, csvFile, audioFilesList) {
  let newId = 'tree_' + Date.now();
  let tree = { id: newId, name: name, lat: lat, lng: lng, birds: [], audioMap: new Map(), birdnetRecords: [] };
  trees.push(tree);
  addMapMarker(tree);
  setCurrentTree(newId);
  
  if (csvFile) {
    await importCSVToCurrentTree(csvFile);
  } else {
    // 没传 CSV 文件，生成预置鸟演示
    let birdList = [];
    for (let sp of PRESET_SPECIES) {
      let angle = random(-PI * 0.7, 0);
      let radius = random(80, 160);
      birdList.push({
        id: sp.common, species: sp.common, scientific: sp.scientific, confidence: sp.confidence,
        imgPath: sp.img, audioPath: sp.audioFile,
        dx: radius * Math.cos(angle), dy: radius * Math.sin(angle) - random(20, 80)
      });
      if (sp.audioFile) tree.audioMap.set(sp.common, sp.audioFile);
    }
    tree.birds = birdList;
    renderBirdsDOM();
  }
  
  // 处理本地上传音频
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
  saveTreesToLocalStorage();
  showToast(`新树“${name}”已创建！`);
}

async function importCSVToCurrentTree(csvFile) {
  let tree = getCurrentTree();
  let text = await csvFile.text();
  let records = parseCSV(text);
  tree.birdnetRecords = records;
  let summary = {};
  for (let rec of records) {
    let species = rec.species_common || rec.Species || rec.scientific || 'Unknown';
    let conf = parseFloat(rec.confidence || rec.Confidence || 0);
    if (!summary[species]) summary[species] = { count:0, sumConf:0 };
    summary[species].count++;
    summary[species].sumConf += (isNaN(conf) ? 0 : conf);
  }
  tree.speciesSummary = summary;
  updateCurrentTreeBirds();
  saveTreesToLocalStorage();
  showToast(`已成功导入 ${records.length} 条记录`);
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
    if (vals.length === headers.length) {
      let obj = {};
      for (let j = 0; j < headers.length; j++) obj[headers[j]] = vals[j].trim();
      rows.push(obj);
    }
  }
  return rows;
}