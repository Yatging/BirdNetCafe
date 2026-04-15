/* BirdNetCafe · 翎英 (AvianLinked)
   DOM 稳定版：加入右侧鸟类列表、双向高亮、音频增强匹配
*/

let trees = [];
let currentTreeId = null;
let map = null; 
let modalMap = null; 
let modalMarker = null;
let audioEnabled = false;
let currentPlayingAudio = null;

// 预置物种数据 (包含大窝坪道默认配置)
const PRESET_SPECIES = [
  { id: "1", common: "黑领椋鸟", scientific: "Gracupica nigricollis", confidence: 0.94, audioFile: "audio/黑领椋鸟.mp3", img: "images/黑领椋鸟.png", size: 45 },
  { id: "2", common: "暗绿绣眼鸟", scientific: "Zosterops simplex", confidence: 0.85, audioFile: "audio/暗绿绣眼鸟.mp3", img: "images/暗绿绣眼鸟.png", size: 30 },
  { id: "3", common: "红耳鹎", scientific: "Pycnonotus jocosus", confidence: 0.78, audioFile: "audio/红耳鹎.mp3", img: "images/红耳鹎.png", size: 38 },
  { id: "4", common: "噪鹃", scientific: "Eudynamys scolopaceus", confidence: 0.77, audioFile: "audio/噪鹃.mp3", img: "images/噪鹃.png", size: 55 },
  { id: "5", common: "黄眉柳莺", scientific: "Phylloscopus inornatus", confidence: 0.75, audioFile: "audio/黄眉柳莺.mp3", img: "images/黄眉柳莺.png", size: 28 }
];

window.onload = () => {
  initMainMap();
  loadTrees();
  if (trees.length === 0) createPresetTree();
  renderTreeList();
  
  document.getElementById('enableAudioBtn').onclick = () => {
    audioEnabled = true;
    showToast("🎵 音频已启用，点击鸟类可播放鸣声");
    document.getElementById('enableAudioBtn').style.display = 'none';
  };
  
  document.getElementById('createTreeBtn').onclick = openCreateModal;
  document.getElementById('confirmCreateTree').onclick = handleCreateTree;

  // 点击空白处关闭浮窗
  document.getElementById('tree-container').addEventListener('click', (e) => {
    if (e.target.id === 'tree-container') {
      closePopup();
      clearHighlights();
    }
  });
};

function initMainMap() { 
  if(!document.getElementById('map')) return;
  // 默认中心：大窝坪道
  map = L.map('map').setView([22.3407, 114.1668], 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OSM' }).addTo(map);
}

function loadTrees() {
  let stored = localStorage.getItem('birdnet_trees');
  if (stored) {
    try { trees = JSON.parse(stored); } catch(e) { trees = []; }
  }
  trees.forEach(t => {
    L.marker([t.lat, t.lng]).addTo(map).bindPopup(t.name).on('click', () => switchTree(t.id));
  });
}

function saveTreesToLocalStorage() {
  localStorage.setItem('birdnet_trees', JSON.stringify(trees));
}

function createPresetTree() {
  const tree = { 
    id: 'preset_tree', 
    name: '大窝坪道 · 榕树', 
    lat: 22.3407, 
    lng: 114.1668, 
    birds: [], 
    audioMap: {} 
  };
  
  // 随机分布位置 (百分比)
  PRESET_SPECIES.forEach(sp => {
    let x = 20 + Math.random() * 60; // 20% - 80% 宽度
    let y = 10 + Math.random() * 70; // 10% - 80% 高度
    tree.birds.push({
      ...sp, x: x, y: y
    });
    if (sp.audioFile) tree.audioMap[sp.common] = sp.audioFile;
  });
  
  trees = [tree];
  saveTreesToLocalStorage();
  L.marker([tree.lat, tree.lng]).addTo(map).bindPopup(tree.name);
}

function renderTreeList() {
  const list = document.getElementById('treeList');
  list.innerHTML = '';
  trees.forEach(t => {
    let li = document.createElement('li');
    li.innerText = t.name;
    if (t.id === currentTreeId) li.classList.add('active');
    li.onclick = () => switchTree(t.id);
    list.appendChild(li);
  });
  if (trees.length > 0 && !currentTreeId) switchTree(trees[0].id);
}

function switchTree(id) {
  currentTreeId = id;
  renderTreeList();
  renderBirdsDOM();
  renderSpeciesList();
  closePopup();
  
  let tree = trees.find(t => t.id === id);
  if (tree) map.setView([tree.lat, tree.lng], 16);
}

// ============== 核心：渲染树上的鸟 (DOM) ==============
function renderBirdsDOM() {
  const container = document.getElementById('tree-container');
  if (!container) return;
  container.innerHTML = '';
  
  let tree = trees.find(t => t.id === currentTreeId);
  if (!tree) return;

  tree.birds.forEach(bird => {
    let img = document.createElement('img');
    img.src = bird.img || 'images/default.png';
    img.className = 'bird-element';
    img.id = 'bird-dom-' + bird.id;
    img.style.left = bird.x + '%';
    img.style.top = bird.y + '%';
    img.style.width = bird.size + 'px';
    
    img.onclick = (e) => {
      e.stopPropagation();
      triggerBirdInteraction(bird, e.clientX, e.clientY);
    };
    container.appendChild(img);
  });
}

// ============== 新增：渲染右侧鸟类列表 ==============
function renderSpeciesList() {
  const list = document.getElementById('species-list');
  if (!list) return;
  list.innerHTML = '';
  
  let tree = trees.find(t => t.id === currentTreeId);
  if (!tree) return;

  tree.birds.forEach(bird => {
    let li = document.createElement('li');
    li.id = 'bird-li-' + bird.id;
    li.innerHTML = `
      <span>${bird.common}</span>
      <span style="color:#888; font-size:0.8rem">${(bird.confidence * 100).toFixed(0)}%</span>
    `;
    li.onclick = (e) => {
      // 找到对应的树上DOM位置来显示弹窗
      let domEl = document.getElementById('bird-dom-' + bird.id);
      if(domEl) {
        let rect = domEl.getBoundingClientRect();
        triggerBirdInteraction(bird, rect.left + rect.width/2, rect.top);
      }
    };
    list.appendChild(li);
  });
}

// ============== 双向高亮与交互逻辑 ==============
function triggerBirdInteraction(bird, x, y) {
  clearHighlights();
  
  // 1. 高亮树上的鸟
  let domEl = document.getElementById('bird-dom-' + bird.id);
  if (domEl) domEl.classList.add('highlighted');
  
  // 2. 高亮右侧列表
  let liEl = document.getElementById('bird-li-' + bird.id);
  if (liEl) {
    liEl.classList.add('active');
    liEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // 3. 播放音频
  let tree = trees.find(t => t.id === currentTreeId);
  let audioSrc = tree.audioMap[bird.common];
  if (audioEnabled && audioSrc) {
    if (currentPlayingAudio) { currentPlayingAudio.pause(); currentPlayingAudio.currentTime = 0; }
    currentPlayingAudio = new Audio(audioSrc);
    currentPlayingAudio.play().catch(e => console.log('Audio play blocked:', e));
  }

  // 4. 显示浮窗
  showBirdPopup(bird, x, y);
}

function clearHighlights() {
  document.querySelectorAll('.bird-element').forEach(el => el.classList.remove('highlighted'));
  document.querySelectorAll('.species-list li').forEach(el => el.classList.remove('active'));
}

// ============== UI 与弹窗逻辑 ==============
function showBirdPopup(bird, x, y) {
  const root = document.getElementById('popup-root');
  root.innerHTML = `
    <div class="leaf-popup" style="left: ${x}px; top: ${y - 20}px;">
      <h4>${bird.common}</h4>
      <div class="sci-name">${bird.scientific}</div>
      <div style="margin-bottom: 8px;">置信度: ${(bird.confidence * 100).toFixed(1)}%</div>
      <button onclick="window.open('https://ebird.org/species/${bird.scientific.replace(' ', '-')}', '_blank')">
        在 eBird 查看详情
      </button>
    </div>
  `;
}

function closePopup() {
  document.getElementById('popup-root').innerHTML = '';
}

function showToast(msg) {
  const root = document.getElementById('toast-root');
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerText = msg;
  root.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ============== 创建新树逻辑 ==============
function openCreateModal() {
  document.getElementById('createTreeModal').style.display = 'flex';
  setTimeout(() => {
    if (!modalMap) {
      modalMap = L.map('modal-map-container').setView([22.3407, 114.1668], 15);
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

async function handleCreateTree() {
  let name = document.getElementById('newTreeName').value || '未命名榕树';
  let coords = document.getElementById('newTreeCoords').value.split(',');
  if (coords.length !== 2) return alert('请在地图上选择位置！');
  
  let lat = parseFloat(coords[0]);
  let lng = parseFloat(coords[1]);
  let audioFiles = document.getElementById('newTreeAudio').files;
  
  // 简化的新建树逻辑 (复用预置鸟作为Demo，并尝试匹配本地音频)
  let newTree = {
    id: 'tree_' + Date.now(), name: name, lat: lat, lng: lng, birds: [], audioMap: {}
  };
  
  PRESET_SPECIES.forEach((sp, i) => {
    newTree.birds.push({ ...sp, id: Date.now() + i, x: 20 + Math.random()*60, y: 10 + Math.random()*70 });
  });

  // 音频智能匹配逻辑：匹配中文或学名
  Array.from(audioFiles).forEach(file => {
    let url = URL.createObjectURL(file);
    let fileName = file.name.toLowerCase();
    newTree.birds.forEach(bird => {
      if (fileName.includes(bird.common.toLowerCase()) || fileName.includes(bird.scientific.toLowerCase())) {
        newTree.audioMap[bird.common] = url;
      }
    });
  });

  trees.push(newTree);
  saveTreesToLocalStorage();
  
  L.marker([lat, lng]).addTo(map).bindPopup(name);
  document.getElementById('createTreeModal').style.display = 'none';
  switchTree(newTree.id);
  showToast('新树创建成功！');
}