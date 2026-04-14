/* BirdNetCafe · 翎英 (AvianLinked)
   原生 DOM 稳定版：修复坐标系漂移、解决旧数据残留、浮窗定位优化、图片加载容错
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

// 数学辅助
function random(min, max) { return Math.random() * (max - min) + min; }
const PI = Math.PI;

// ---------- 1. 初始化 ----------
document.addEventListener('DOMContentLoaded', () => {
  injectCSS();
  initMap();
  
  // 强制清理旧版本格式可能导致错乱的遗留数据
  loadTreesFromLocalStorage();

  if (trees.length === 0 || !trees[0].birds || trees[0].birds.length === 0) {
    createPresetTree();
  }

  setCurrentTree(trees[0].id);
  updateTreeListUI();
  bindUI();

  // 延迟渲染，确保 CSS 已经给容器赋了实际宽度和高度
  setTimeout(renderBirdsDOM, 100);
});

// 二次保险：等所有资源加载完再算一次位置
window.addEventListener('load', renderBirdsDOM);
window.addEventListener('resize', renderBirdsDOM);

// ---------- 2. 核心渲染 (原生 DOM) ----------
function renderBirdsDOM() {
  const container = document.getElementById('canvas-container');
  if (!container) return;

  container.style.position = 'relative';
  container.innerHTML = ''; // 清空上一屏的内容

  let tree = getCurrentTree();
  if (!tree) return;

  // 获取真实宽高，如果获取不到则给默认值防止全挤在 0,0
  const rect = container.getBoundingClientRect();
  const w = rect.width || container.offsetWidth || 800;
  const h = rect.height || container.offsetHeight || 600;

  // 注入光晕特效 (纯 CSS)
  const glow = document.createElement('div');
  glow.className = 'tree-glow';
  glow.style.left = (w / 2) + 'px';
  glow.style.top = (h * 0.65 - 40) + 'px';
  container.appendChild(glow);

  tree.x = w / 2;
  tree.y = h * 0.65;

  // 遍历绘制小鸟
  birds.forEach((bird, index) => {
    // 【修复点 1】：防呆设计。如果 dx 是 NaN (旧版遗留数据)，重新随机分配，防止堆在左上角
    if (isNaN(bird.dx) || isNaN(bird.dy)) {
      let angle = random(-PI * 0.7, 0);
      let radius = random(80, 160);
      bird.dx = radius * Math.cos(angle);
      bird.dy = radius * Math.sin(angle) - random(20, 80);
    }

    bird.x = tree.x + bird.dx;
    bird.y = tree.y + bird.dy;

    const node = document.createElement('div');
    node.className = 'bird-node';
    node.style.left = bird.x + 'px';
    node.style.top = bird.y + 'px';
    node.style.animationDelay = `${index * 0.15}s`;

    const img = document.createElement('img');
    // 使用 encodeURI 确保中文字符路径不被浏览器拦截
    img.src = encodeURI(bird.imgPath);
    
    // 【修复点 2】：图片加载失败的终极容错
    img.onerror = function() {
      if (!this.dataset.triedDefault) {
        this.dataset.triedDefault = true;
        this.src = DEFAULT_BIRD_IMG; // 尝试加载默认图片
      } else {
        // 如果连默认图片都没有，就直接变成一个带有文字的彩色圆圈
        this.style.display = 'none';
        const fallbackText = document.createElement('div');
        fallbackText.className = 'bird-fallback';
        fallbackText.innerText = bird.species.substring(0, 2);
        node.appendChild(fallbackText);
      }
    };

    node.appendChild(img);

    // 绑定点击事件
    node.addEventListener('click', (e) => {
      e.stopPropagation(); 
      showPopup(bird);
    });

    container.appendChild(node);
  });

  // 点击空白处关闭浮窗
  container.addEventListener('click', closePopup);
}

function injectCSS() {
  if (document.getElementById('bird-dynamic-style')) return;
  const style = document.createElement('style');
  style.id = 'bird-dynamic-style';
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
      background-color: rgba(255, 255, 255, 0.2);
    }
    .bird-node:hover {
      box-shadow: 0 0 0 3px #fff, 0 6px 15px rgba(0,0,0,0.4);
      z-index: 20;
    }
    .bird-node img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 50%;
      pointer-events: none;
      display: block;
    }
    .bird-fallback {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: linear-gradient(135deg, #4CAF50, #2E7D32);
      color: white;
      font-size: 12px;
      font-weight: bold;
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
    .leaf-popup {
      position: absolute;
      z-index: 9999;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.15);
      width: 280px;
      animation: fadeIn 0.2s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

// ---------- 3. 浮窗交互管理 ----------
function showPopup(bird) {
  closePopup();
  let species = bird.species;
  let wikiUrl = `https://zh.wikipedia.org/wiki/${encodeURIComponent(species)}`;
  let desc = afcdMap.get(species) || '香港常见鸟类，鸣声独特，为城市生态增添活力。';

  let root = document.getElementById('popup-root') || document.body;
  const popup = document.createElement('div');
  popup.className = 'leaf-popup';

  popup.innerHTML = `
    <button class="close-btn" style="position:absolute; right:12px; top:12px; border:none; background:none; font-size:18px; cursor:pointer; color:#666;">✖</button>
    <div style="display:flex; gap:12px; margin-top:5px;">
      <img src="${encodeURI(bird.imgPath)}" onerror="this.style.display='none'" style="width:64px; height:64px; object-fit:cover; border-radius:10px; background:#ddd;">
      <div>
        <h4 style="margin:0; font-size:16px; color:#222;">${species}</h4>
        <div style="font-size:12px; color:#666; font-style:italic; margin-top:4px;">${bird.scientific}</div>
      </div>
    </div>
    <div style="margin-top:12px; font-size:13px; font-weight:bold; color:#4a7a5e;">📊 置信度 ${(bird.confidence * 100).toFixed(0)}%</div>
    <div style="font-size:13px; color:#444; margin-top:8px; line-height:1.5;">${desc}</div>
    <div style="margin-top:12px; display:flex; gap:8px;">
      <button class="play-btn" style="padding:6px 12px; background:#4a7a5e; color:#fff; border:none; border-radius:6px; cursor:pointer; flex:1;">▶ 播放鸣叫</button>
      <button class="stop-btn" style="padding:6px 12px; background:#e0e0e0; color:#333; border:none; border-radius:6px; cursor:pointer;">⏹️</button>
      <a href="${wikiUrl}" target="_blank" style="padding:6px 12px; background:#f0f0f0; color:#333; text-decoration:none; border-radius:6px; font-size:13px; text-align:center;">📖 百科</a>
    </div>
  `;

  // 【修复点 3】：基于页面的绝对定位计算，修复浮窗跑到最底部的问题
  const container = document.getElementById('canvas-container');
  const rect = container.getBoundingClientRect();
  
  // 视口坐标 + 网页卷去的距离 = 网页绝对坐标
  let absoluteX = rect.left + window.scrollX + bird.x;
  let absoluteY = rect.top + window.scrollY + bird.y;

  let left = absoluteX - 140; // 让浮窗居中小鸟
  let top = absoluteY - 180;  // 让浮窗悬浮在小鸟正上方

  // 边界保护：防止弹出屏幕之外
  left = Math.max(10, Math.min(window.innerWidth - 300, left));
  top = Math.max(10, top);
  
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
  
  root.appendChild(popup);
  currentPopup = popup;

  // 绑定音频
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
  
  popup.addEventListener('click', (e) => e.stopPropagation());
  popup.querySelector('.close-btn').onclick = closePopup;
}

function closePopup() {
  if (currentPopup) currentPopup.remove();
  currentPopup = null;
}

// ---------- 4. 树与数据生成逻辑 ----------
function getCurrentTree() { return trees.find(t => t.id === currentTreeId); }

function createPresetTree() {
  const tree = {
    id: 'preset_tree', name: '香港公园 · 榕树', lat: 22.278, lng: 114.162,
    birds: [], audioMap: new Map(), birdnetRecords: []
  };

  let birdList = [];
  for (let sp of PRESET_SPECIES) {
    let angle = random(-PI * 0.7, 0);
    let radius = random(80, 160);
    birdList.push({
      id: sp.common, species: sp.common, scientific: sp.scientific,
      confidence: sp.confidence, imgPath: sp.img, audioPath: sp.audioFile,
      dx: radius * Math.cos(angle), dy: radius * Math.sin(angle) - random(20, 80)
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
    
    newBirds.push({
      id: spName, species: spName,
      scientific: preset ? preset.scientific : '未知', confidence: avgConf,
      imgPath: preset ? preset.img : DEFAULT_BIRD_IMG,
      audioPath: preset ? preset.audioFile : null,
      dx: radius * Math.cos(angle), dy: radius * Math.sin(angle) - random(20, 80)
    });
    if (preset && preset.audioFile) treeObj.audioMap.set(spName, preset.audioFile);
  }
  treeObj.birds = newBirds;
  birds = newBirds;
  renderBirdsDOM();
}

// ---------- 5. 数据与缓存管理 ----------
function saveTreesToLocalStorage() {
  let serializable = trees.map(t => ({
    id: t.id, name: t.name, lat: t.lat, lng: t.lng,
    birds: t.birds, audioMap: Array.from(t.audioMap.entries()), birdnetRecords: t.birdnetRecords
  }));
  localStorage.setItem('birdnetcafe_trees', JSON.stringify(serializable));
}

function loadTreesFromLocalStorage() {
  let data = localStorage.getItem('birdnetcafe_trees');
  if (!data) return;
  try {
    trees = JSON.parse(data).map(t => ({
      ...t, audioMap: new Map(t.audioMap || [])
    }));
    trees.forEach(t => addMapMarker(t));
  } catch (e) {
    trees = []; // 如果数据格式彻底损坏，直接清空重置
  }
}

// ---------- 6. 地图与 UI 绑定 ----------
function initMap() { 
  if(!document.getElementById('map')) return;
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
  if(!map) return;
  let marker = L.marker([tree.lat, tree.lng]).addTo(map);
  marker.bindPopup(`<b>${tree.name}</b>`);
  marker.on('click', () => setCurrentTree(tree.id));
  tree.marker = marker;
}

function updateTreeListUI() {
  let ul = document.getElementById('tree-list');
  if(!ul) return;
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
  if (tree && tree.marker && map) map.setView([tree.lat, tree.lng], 15);
  birds = tree.birds || [];
  updateTreeListUI();
  renderBirdsDOM();
}

function bindUI() {
  document.getElementById('enableAudioBtn')?.addEventListener('click', () => {
    audioEnabled = true;
    showToast('🎵 音频已启用！点击小鸟即可播放叫声');
  });

  document.getElementById('resetBtn')?.addEventListener('click', () => {
    localStorage.clear();
    location.reload();
  });

  document.getElementById('createTreeBtn')?.addEventListener('click', () => {
    document.getElementById('newTreeCoords').value = '';
    document.getElementById('newTreeName').value = '';
    document.getElementById('createTreeModal').style.display = 'flex';
  });

  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.onclick = () => btn.closest('.modal').style.display = 'none';
  });

  document.getElementById('confirmCreateTree')?.addEventListener('click', async () => {
    let name = document.getElementById('newTreeName').value;
    let coordStr = document.getElementById('newTreeCoords').value;
    if (!name || !coordStr) { showToast('请填写树名和位置'); return; }
    let [lat, lng] = coordStr.split(',').map(Number);
    let csvFile = document.getElementById('newTreeCSV').files[0];
    let audioFilesList = Array.from(document.getElementById('newTreeAudio').files || []);
    await createNewTree(name, lat, lng, csvFile, audioFilesList);
    document.getElementById('createTreeModal').style.display = 'none';
  });

  document.getElementById('birdnetFile')?.addEventListener('change', async e => {
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