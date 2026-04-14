/* BirdNetCafe · 翎英 (AvianLinked)
   原生 DOM 稳定版：防重叠碰撞检测、图片比例修复、独立选点地图+搜索功能
*/

let trees = [];
let currentTreeId = null;
let birds = [];
let afcdMap = new Map();
let audioEnabled = false;
let currentPopup = null;
let map = null; // 主页展示地图
let modalMap = null; // 弹窗选点地图
let modalMarker = null;

// 预置鸟类数据 (包含真实体长)
const PRESET_SPECIES = [
  { common: "黑领椋鸟", scientific: "Gracupica nigricollis", confidence: 0.94, audioFile: "audio/黑领椋鸟.mp3", img: "images/黑领椋鸟.png", realSizeCm: 28 },
  { common: "暗绿绣眼鸟", scientific: "Zosterops simplex", confidence: 0.85, audioFile: "audio/暗绿绣眼鸟.mp3", img: "images/暗绿绣眼鸟.png", realSizeCm: 11 },
  { common: "红耳鹎", scientific: "Pycnonotus jocosus", confidence: 0.78, audioFile: "audio/红耳鹎.mp3", img: "images/红耳鹎.png", realSizeCm: 20 },
  { common: "噪鹃", scientific: "Eudynamys scolopaceus", confidence: 0.77, audioFile: "audio/噪鹃.mp3", img: "images/噪鹃.png", realSizeCm: 43 },
  { common: "黄眉柳莺", scientific: "Phylloscopus inornatus", confidence: 0.75, audioFile: "audio/黄眉柳莺.mp3", img: "images/黄眉柳莺.png", realSizeCm: 10 },
  { common: "家麻雀", scientific: "Passer domesticus", confidence: 0.71, audioFile: "audio/家麻雀.mp3", img: "images/家麻雀.png", realSizeCm: 15 },
  { common: "白喉红臀鹎", scientific: "Pycnonotus aurigaster", confidence: 0.53, audioFile: "audio/白喉红臀鹎.mp3", img: "images/白喉红臀鹎.png", realSizeCm: 20 }
];

const DEFAULT_BIRD_IMG = "images/黑领椋鸟.png";

function random(min, max) { return Math.random() * (max - min) + min; }
const PI = Math.PI;

function calculateBirdSize(realSizeCm) {
  if (!realSizeCm) return random(50, 70);
  return 35 + (realSizeCm * 1.6);
}

// ---------- 【新增核心】防重叠坐标生成算法 ----------
function generateNonOverlappingOffset(newBirdSize, existingBirds) {
  const maxAttempts = 150; // 最多尝试 150 次寻找空位
  for (let i = 0; i < maxAttempts; i++) {
    // 鸟越多，分布半径越大
    let maxRadius = 140 + existingBirds.length * 15;
    let angle = random(-PI * 0.95, -PI * 0.05); 
    let radius = random(60, maxRadius); 
    let dx = radius * Math.cos(angle);
    let dy = radius * Math.sin(angle) - random(10, 60);

    let overlap = false;
    for (let b of existingBirds) {
      if (b.dx === undefined || b.dy === undefined) continue;
      // 计算圆心距离
      let dist = Math.hypot(dx - b.dx, dy - b.dy);
      // 两个鸟的安全距离 = 半径1 + 半径2 + 5px空隙
      let bSize = b.size || calculateBirdSize(null);
      let minSpace = (newBirdSize / 2) + (bSize / 2) + 5; 
      
      if (dist < minSpace) {
        overlap = true;
        break; // 发生重叠，跳出当前比对，重新生成坐标
      }
    }
    if (!overlap) return { dx, dy };
  }
  // 如果实在太拥挤找不到空位（兜底方案）
  return { dx: random(-150, 150), dy: random(-200, -50) };
}

// ---------- 1. 初始化 ----------
document.addEventListener('DOMContentLoaded', () => {
  injectCSS();
  initMainMap();
  injectModalMapUI(); // 动态向弹窗注入地图和搜索框
  
  loadTreesFromLocalStorage();

  if (trees.length === 0 || !trees[0].birds || trees[0].birds.length === 0) {
    createPresetTree();
  }

  setCurrentTree(trees[0].id);
  updateTreeListUI();
  bindUI();

  setTimeout(renderBirdsDOM, 100);
});

window.addEventListener('load', renderBirdsDOM);
window.addEventListener('resize', renderBirdsDOM);

// ---------- 2. 核心渲染 (原生 DOM) ----------
function renderBirdsDOM() {
  const container = document.getElementById('canvas-container');
  if (!container) return;

  container.style.position = 'relative';
  container.innerHTML = ''; 

  let tree = getCurrentTree();
  if (!tree) return;

  const rect = container.getBoundingClientRect();
  const w = rect.width || container.offsetWidth || 800;
  const h = rect.height || container.offsetHeight || 600;

  const glow = document.createElement('div');
  glow.className = 'tree-glow';
  glow.style.left = (w / 2) + 'px';
  glow.style.top = (h * 0.65 - 40) + 'px';
  container.appendChild(glow);

  tree.x = w / 2;
  tree.y = h * 0.65;

  // 修复旧数据缺失坐标时的防重叠
  let renderedBirds = [];
  birds.forEach((bird, index) => {
    let finalSize = bird.size || calculateBirdSize(null);
    if (isNaN(bird.dx) || isNaN(bird.dy)) {
      let offset = generateNonOverlappingOffset(finalSize, renderedBirds);
      bird.dx = offset.dx;
      bird.dy = offset.dy;
    }
    renderedBirds.push(bird);

    bird.x = tree.x + bird.dx;
    bird.y = tree.y + bird.dy;

    const node = document.createElement('div');
    node.className = 'bird-node';
    node.style.left = bird.x + 'px';
    node.style.top = bird.y + 'px';
    node.style.width = finalSize + 'px';
    node.style.height = finalSize + 'px';
    node.style.animationDelay = `${index * 0.2}s`;

    const img = document.createElement('img');
    img.src = encodeURI(bird.imgPath);
    
    img.onerror = function() {
      if (!this.dataset.triedDefault) {
        this.dataset.triedDefault = true;
        this.src = DEFAULT_BIRD_IMG; 
      } else {
        this.style.display = 'none';
        const fallbackText = document.createElement('div');
        fallbackText.className = 'bird-fallback';
        fallbackText.innerText = bird.species.substring(0, 2);
        node.appendChild(fallbackText);
      }
    };

    node.appendChild(img);
    node.addEventListener('click', (e) => { e.stopPropagation(); showPopup(bird); });
    container.appendChild(node);
  });

  container.addEventListener('click', closePopup);
}

// 【修复比例问题】将 CSS 中的 cover 改为 contain 并加入内边距
function injectCSS() {
  if (document.getElementById('bird-dynamic-style')) return;
  const style = document.createElement('style');
  style.id = 'bird-dynamic-style';
  style.innerHTML = `
    .bird-node {
      position: absolute;
      transform: translate(-50%, -50%) scale(0);
      opacity: 0;
      border-radius: 50%;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
      transition: box-shadow 0.2s, z-index 0.2s;
      z-index: 10;
      animation: birdPopIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      background-color: rgba(255, 255, 255, 0.95); /* 实心背景防透底 */
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .bird-node:hover {
      box-shadow: 0 0 0 3px #2b7a4b, 0 8px 20px rgba(0,0,0,0.4);
      z-index: 20;
    }
    .bird-node img {
      width: 100%;
      height: 100%;
      object-fit: contain; /* 核心修复：防止图片被暴力裁切 */
      transform: scale(0.85); /* 稍微缩小让边缘留白，看起来更自然 */
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
      font-size: 14px;
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
  `;
  document.head.appendChild(style);
}

// ---------- 3. 地图与弹窗搜索逻辑 ----------
function initMainMap() { 
  if(!document.getElementById('map')) return;
  map = L.map('map').setView([22.278, 114.162], 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OSM'
  }).addTo(map);
  // 【地图分离】删除了此处主地图的 map.on('click') 事件，使其仅用于展示和选择已有树木
}

// 动态将地图和搜索栏注入到创建模态框
function injectModalMapUI() {
  const coordInput = document.getElementById('newTreeCoords');
  if(!coordInput) return;
  const labelParent = coordInput.parentNode;
  
  const searchUI = document.createElement('div');
  searchUI.innerHTML = `
    <div style="margin: 10px 0;">
      <label style="display:block; margin-bottom:4px; font-weight:500;">搜索地点：</label>
      <div style="display:flex; gap:8px;">
        <input type="text" id="locSearchInput" placeholder="例如：香港公园 / 城门水塘" style="flex:1; padding:8px; border-radius:8px; border:1px solid #ccc;">
        <button type="button" id="locSearchBtn" style="padding:8px 16px; border-radius:8px; border:none; background:#2b7a4b; color:white; cursor:pointer;">搜索</button>
      </div>
    </div>
    <p style="font-size:12px; color:#666; margin-bottom:4px;">或在下方地图点击选择位置：</p>
    <div id="modal-map-container" style="height: 180px; border-radius: 12px; margin-bottom: 12px; border:1px solid #ddd; z-index:10;"></div>
  `;
  // 将搜索UI插在坐标输入框前面
  labelParent.parentNode.insertBefore(searchUI, labelParent);
  
  document.getElementById('locSearchBtn').addEventListener('click', async () => {
    let q = document.getElementById('locSearchInput').value;
    if(!q) return;
    try {
      showToast('搜索中...');
      let res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`);
      let data = await res.json();
      if(data && data.length > 0) {
        let lat = parseFloat(data[0].lat);
        let lon = parseFloat(data[0].lon);
        modalMap.setView([lat, lon], 14);
        if(modalMarker) modalMap.removeLayer(modalMarker);
        modalMarker = L.marker([lat, lon]).addTo(modalMap);
        coordInput.value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        showToast('📍 已找到地点');
      } else {
        showToast('⚠️ 未找到该地点，请尝试换个关键词');
      }
    } catch(e) {
      showToast('搜索服务出错，请直接点击地图');
    }
  });
}

function openCreateModal() {
  document.getElementById('newTreeCoords').value = '';
  document.getElementById('newTreeName').value = '';
  document.getElementById('createTreeModal').style.display = 'flex';
  
  // 延迟初始化/刷新模态框地图，防止地图尺寸计算错误
  setTimeout(() => {
    if (!modalMap) {
      modalMap = L.map('modal-map-container').setView([22.278, 114.162], 11);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(modalMap);
      modalMap.on('click', (e) => {
        if(modalMarker) modalMap.removeLayer(modalMarker);
        modalMarker = L.marker(e.latlng).addTo(modalMap);
        document.getElementById('newTreeCoords').value = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
      });
    }
    modalMap.invalidateSize(); // 强制重绘
  }, 100);
}

function addMapMarker(tree) {
  if(!map) return;
  let marker = L.marker([tree.lat, tree.lng]).addTo(map);
  marker.bindPopup(`<b>${tree.name}</b>`);
  marker.on('click', () => setCurrentTree(tree.id));
  tree.marker = marker;
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
    showToast('🎵 音频已启用！');
  });

  document.getElementById('resetBtn')?.addEventListener('click', () => {
    localStorage.clear();
    location.reload();
  });

  // 绑定新的打开弹窗逻辑
  document.getElementById('createTreeBtn')?.addEventListener('click', openCreateModal);

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
}

// ---------- 4. 数据与浮窗 ----------
function getCurrentTree() { return trees.find(t => t.id === currentTreeId); }

function createPresetTree() {
  const tree = { id: 'preset_tree', name: '香港公园 · 榕树', lat: 22.278, lng: 114.162, birds: [], audioMap: new Map(), birdnetRecords: [] };
  let birdList = [];
  for (let sp of PRESET_SPECIES) {
    let size = calculateBirdSize(sp.realSizeCm);
    let offset = generateNonOverlappingOffset(size, birdList); // 防重叠
    birdList.push({
      id: sp.common, species: sp.common, scientific: sp.scientific, confidence: sp.confidence, 
      imgPath: sp.img, audioPath: sp.audioFile, size: size, dx: offset.dx, dy: offset.dy
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
  for (let i = 0; i < speciesList.length; i++) {
    let spName = speciesList[i];
    let info = treeObj.speciesSummary[spName];
    let avgConf = info ? info.sumConf / info.count : 0.5;
    let preset = PRESET_SPECIES.find(s => s.common === spName);
    
    let size = calculateBirdSize(preset ? preset.realSizeCm : null);
    let offset = generateNonOverlappingOffset(size, newBirds); // 防重叠
    
    newBirds.push({
      id: spName, species: spName, scientific: preset ? preset.scientific : '未知', confidence: avgConf,
      imgPath: preset ? preset.img : DEFAULT_BIRD_IMG, audioPath: preset ? preset.audioFile : null,
      size: size, dx: offset.dx, dy: offset.dy
    });
    if (preset && preset.audioFile) treeObj.audioMap.set(spName, preset.audioFile);
  }
  treeObj.birds = newBirds;
  birds = newBirds;
  renderBirdsDOM();
}

// 保持不变的辅助函数
function saveTreesToLocalStorage() {
  let serializable = trees.map(t => ({
    id: t.id, name: t.name, lat: t.lat, lng: t.lng, birds: t.birds, audioMap: Array.from(t.audioMap.entries()), birdnetRecords: t.birdnetRecords
  }));
  localStorage.setItem('birdnetcafe_trees', JSON.stringify(serializable));
}

function loadTreesFromLocalStorage() {
  let data = localStorage.getItem('birdnetcafe_trees');
  if (!data) return;
  try {
    trees = JSON.parse(data).map(t => ({ ...t, audioMap: new Map(t.audioMap || []) }));
    trees.forEach(t => addMapMarker(t));
  } catch (e) { trees = []; }
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

function showPopup(bird) {
  closePopup();
  let species = bird.species;
  let wikiUrl = `https://zh.wikipedia.org/wiki/${encodeURIComponent(species)}`;
  let desc = afcdMap.get(species) || '城市常见鸟类，为生态增添活力。';

  let root = document.getElementById('popup-root') || document.body;
  const popup = document.createElement('div');
  popup.className = 'leaf-popup';
  popup.innerHTML = `
    <button class="close-btn" style="position:absolute; right:12px; top:12px; border:none; background:none; font-size:18px; cursor:pointer; color:#666;">✖</button>
    <div style="display:flex; gap:12px; margin-top:5px;">
      <div style="width:64px; height:64px; border-radius:10px; background:#fff; display:flex; align-items:center; justify-content:center; overflow:hidden;">
        <img src="${encodeURI(bird.imgPath)}" onerror="this.style.display='none'" style="width:100%; height:100%; object-fit:contain; transform:scale(0.85);">
      </div>
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
  
  const container = document.getElementById('canvas-container');
  const rect = container.getBoundingClientRect();
  let left = rect.left + window.scrollX + bird.x - 140; 
  let top = rect.top + window.scrollY + bird.y - 180;  
  popup.style.left = Math.max(10, Math.min(window.innerWidth - 300, left)) + 'px';
  popup.style.top = Math.max(10, top) + 'px';
  root.appendChild(popup);
  currentPopup = popup;

  let audioPath = getCurrentTree().audioMap.get(species);
  let playBtn = popup.querySelector('.play-btn');
  let stopBtn = popup.querySelector('.stop-btn');
  let audioObj = null;

  if (audioPath && audioEnabled) {
    audioObj = new Audio(audioPath);
    playBtn.onclick = () => { audioObj.currentTime = 0; audioObj.play(); };
    stopBtn.onclick = () => { audioObj.pause(); audioObj.currentTime = 0; };
  } else { playBtn.onclick = () => showToast(audioEnabled ? '未找到该物种音频' : '请先启用音频'); }
  
  popup.addEventListener('click', e => e.stopPropagation());
  popup.querySelector('.close-btn').onclick = closePopup;
}

function closePopup() { if (currentPopup) { currentPopup.remove(); currentPopup = null; } }

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
  
  if (csvFile) await importCSVToCurrentTree(csvFile);
  else {
    let birdList = [];
    for (let sp of PRESET_SPECIES) {
      let size = calculateBirdSize(sp.realSizeCm);
      let offset = generateNonOverlappingOffset(size, birdList);
      birdList.push({
        id: sp.common, species: sp.common, scientific: sp.scientific, confidence: sp.confidence,
        imgPath: sp.img, audioPath: sp.audioFile, size: size, dx: offset.dx, dy: offset.dy
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
        bird.audioPath = url; break;
      }
    }
  }
  saveTreesToLocalStorage();
  showToast(`新树“${name}”已创建！`);
}

async function importCSVToCurrentTree(csvFile) {
  let tree = getCurrentTree();
  let records = parseCSV(await csvFile.text());
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