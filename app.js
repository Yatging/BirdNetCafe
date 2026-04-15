/* BirdNetCafe · 翎英 (AvianLinked)
   原生 DOM 稳定版：鸟图透明背景、自定义树背景上传(带自动压缩)、新增使用教程
*/

let trees = [];
let currentTreeId = null;
let birds = [];
let afcdMap = new Map();
let audioEnabled = false;
let currentPopup = null;
let map = null; 
let modalMap = null; 
let modalMarker = null;

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

function generateNonOverlappingOffset(newBirdSize, existingBirds) {
  const maxAttempts = 150; 
  for (let i = 0; i < maxAttempts; i++) {
    let maxRadius = 140 + existingBirds.length * 15;
    let angle = random(-PI * 0.95, -PI * 0.05); 
    let radius = random(60, maxRadius); 
    let dx = radius * Math.cos(angle);
    let dy = radius * Math.sin(angle) - random(10, 60);

    let overlap = false;
    for (let b of existingBirds) {
      if (b.dx === undefined || b.dy === undefined) continue;
      let dist = Math.hypot(dx - b.dx, dy - b.dy);
      let bSize = b.size || calculateBirdSize(null);
      let minSpace = (newBirdSize / 2) + (bSize / 2) + 5; 
      
      if (dist < minSpace) { overlap = true; break; }
    }
    if (!overlap) return { dx, dy };
  }
  return { dx: random(-150, 150), dy: random(-200, -50) };
}

// ---------- 1. 初始化 ----------
document.addEventListener('DOMContentLoaded', () => {
  injectCSS();
  initMainMap();
  injectModalMapUI(); 
  injectTutorialUI(); // 【新增】注入使用教程 UI
  
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

// ---------- 2. 核心渲染 ----------
function renderBirdsDOM() {
  const container = document.getElementById('canvas-container');
  if (!container) return;

  container.style.position = 'relative';
  container.innerHTML = ''; 

  let tree = getCurrentTree();
  if (!tree) return;

  // 【新增】应用自定义树背景
  if (tree.treeImg) {
    container.style.backgroundImage = `url('${tree.treeImg}')`;
    container.style.backgroundSize = 'contain';
    container.style.backgroundRepeat = 'no-repeat';
    container.style.backgroundPosition = 'center bottom';
  } else {
    container.style.backgroundImage = ''; // 恢复 CSS 默认的 banyan.png
  }

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
      background-color: transparent; /* 【修改】恢复透明背景 */
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
      object-fit: contain; 
      transform: scale(0.85); 
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

// ---------- 3. 各种 UI 与模态框注入 ----------

// 注入“使用教程”按钮与弹窗
function injectTutorialUI() {
  const controls = document.querySelector('.controls');
  if (controls && !document.getElementById('tutorialBtn')) {
    const btn = document.createElement('button');
    btn.id = 'tutorialBtn';
    btn.className = 'btn-icon';
    btn.innerHTML = '💡 使用教程';
    controls.insertBefore(btn, controls.firstChild);
    
    btn.onclick = () => document.getElementById('tutorialModal').style.display = 'flex';
  }

  if (!document.getElementById('tutorialModal')) {
    const modal = document.createElement('div');
    modal.id = 'tutorialModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>💡 如何使用 BirdNET 生成树木数据</h2>
          <button class="close-modal" onclick="this.closest('.modal').style.display='none'">&times;</button>
        </div>
        <div class="modal-body" style="line-height: 1.6; color: #444;">
          <p>你可以将自己的野外录音转化为这棵树上的小鸟！具体操作步骤如下：</p>
          <ol style="margin-left: 20px; margin-top: 15px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 10px;">
            <li>前往 <b><a href="https://birdnet.cornell.edu/" target="_blank" style="color: #2b7a4b;">BirdNET 官方网站</a></b> 或在手机上下载 BirdNET 应用程序 (iOS / Android)。</li>
            <li>在应用中上传你录制的鸟叫声音频文件，让 AI 分析并识别出物种。</li>
            <li>识别完成后，进入应用的“显示观察记录 (Show observations)”或设置页面，选择 <strong>导出 (Export)</strong>，将记录保存为 <b>CSV 格式文件 (.csv)</b>。</li>
            <li>回到本网站，点击顶部的 <b>“✨ 创建我的树”</b>。</li>
            <li>在弹窗中填入位置，并上传刚刚导出的 CSV 文件。</li>
            <li>点击确认，你的专属生态树就生成啦！</li>
          </ol>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
}

function initMainMap() { 
  if(!document.getElementById('map')) return;
  map = L.map('map').setView([22.278, 114.162], 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OSM'
  }).addTo(map);
}

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
  labelParent.parentNode.insertBefore(searchUI, labelParent);

  // 【新增】自定义树木图片上传框
  const csvInputLabel = document.getElementById('newTreeCSV')?.parentNode;
  if (csvInputLabel) {
    const imgLabel = document.createElement('label');
    imgLabel.style.display = 'block';
    imgLabel.style.marginTop = '10px';
    imgLabel.innerHTML = `自定义树木背景 (可选)：<input type="file" id="newTreeImg" accept="image/*" style="margin-top: 5px;">`;
    csvInputLabel.parentNode.insertBefore(imgLabel, csvInputLabel);
  }
  
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
    } catch(e) { showToast('搜索服务出错，请直接点击地图'); }
  });
}

function openCreateModal() {
  document.getElementById('newTreeCoords').value = '';
  document.getElementById('newTreeName').value = '';
  if (document.getElementById('newTreeImg')) document.getElementById('newTreeImg').value = '';
  document.getElementById('createTreeModal').style.display = 'flex';
  
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
    modalMap.invalidateSize(); 
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
    
    // 【新增】处理树木背景图
    let treeImgFile = document.getElementById('newTreeImg')?.files[0];
    let compressedImgBase64 = null;
    if (treeImgFile) {
      showToast('⏳ 正在处理背景图...');
      compressedImgBase64 = await compressImage(treeImgFile);
    }

    await createNewTree(name, lat, lng, csvFile, audioFilesList, compressedImgBase64);
    document.getElementById('createTreeModal').style.display = 'none';
  });
}

// 【新增核心】轻量级图片压缩，防止 LocalStorage 爆仓
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        const maxSize = 1200; // 最大分辨率限制
        if (w > maxSize || h > maxSize) {
          if (w > h) { h *= maxSize / w; w = maxSize; }
          else { w *= maxSize / h; h = maxSize; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        // 输出 60% 质量的 JPEG（实测通常只有几十 KB）
        resolve(canvas.toDataURL('image/jpeg', 0.6)); 
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------- 4. 数据与存储 ----------
function getCurrentTree() { return trees.find(t => t.id === currentTreeId); }

function createPresetTree() {
  const tree = { id: 'preset_tree', name: '香港公园 · 榕树', lat: 22.278, lng: 114.162, birds: [], audioMap: new Map(), birdnetRecords: [], treeImg: null };
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
    let offset = generateNonOverlappingOffset(size, newBirds); 
    
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

function saveTreesToLocalStorage() {
  let serializable = trees.map(t => ({
    id: t.id, name: t.name, lat: t.lat, lng: t.lng, birds: t.birds, 
    audioMap: Array.from(t.audioMap.entries()), birdnetRecords: t.birdnetRecords,
    treeImg: t.treeImg // 【新增】保存背景图数据
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
      <div style="width:64px; height:64px; border-radius:10px; background:transparent; display:flex; align-items:center; justify-content:center; overflow:hidden;">
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

// 【参数更新】接收压缩后的图片 Base64
async function createNewTree(name, lat, lng, csvFile, audioFilesList, customTreeImg) {
  let newId = 'tree_' + Date.now();
  let tree = { 
    id: newId, name: name, lat: lat, lng: lng, birds: [], 
    audioMap: new Map(), birdnetRecords: [], treeImg: customTreeImg || null 
  };
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
  
  // 【优化】升级音频文件的匹配逻辑：同时检测中文名和学名，且忽略大小写
  for (let file of audioFilesList) {
    let url = URL.createObjectURL(file);
    let fileName = file.name.replace(/\.[^/.]+$/, '').toLowerCase(); // 去除后缀并转小写
    
    for (let bird of tree.birds) {
      let common = (bird.species || '').toLowerCase();
      let sci = (bird.scientific || '').toLowerCase();
      
      if (fileName.includes(common) || common.includes(fileName) || 
          fileName.includes(sci) || sci.includes(fileName)) {
        tree.audioMap.set(bird.species, url);
        bird.audioPath = url; 
        break; // 匹配成功，跳到下一个音频文件
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