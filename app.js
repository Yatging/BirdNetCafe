let trees = [];
let currentTreeId = null;
let map = null; 
let modalMap = null; 
let modalMarker = null;
let audioEnabled = false;
let currentPlayingAudio = null;

// 默认大窝坪道背景图
const DEFAULT_TREE_BG = "https://images.unsplash.com/photo-1596541604085-f53835f8e5d0?q=80&w=1200&auto=format&fit=crop";

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
  
  // 重置按钮逻辑
  document.getElementById('resetBtn').onclick = () => {
    if(confirm("确定要清空所有数据并重置为大窝坪道默认配置吗？")) {
      localStorage.removeItem('birdnet_trees');
      location.reload();
    }
  };

  document.getElementById('enableAudioBtn').onclick = () => {
    audioEnabled = true;
    showToast("🎵 声音已开启");
    document.getElementById('enableAudioBtn').style.display = 'none';
  };
  
  document.getElementById('createTreeBtn').onclick = openCreateModal;
  document.getElementById('confirmCreateTree').onclick = handleCreateTree;

  document.getElementById('tree-container').onclick = (e) => {
    if (e.target.id === 'tree-container') {
      closePopup();
      clearHighlights();
    }
  };
};

function initMainMap() { 
  map = L.map('map').setView([22.3407, 114.1668], 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);
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

function createPresetTree() {
  const tree = { 
    id: 'preset_tree', 
    name: '大窝坪道 · 榕树', 
    lat: 22.3407, 
    lng: 114.1668, 
    background: DEFAULT_TREE_BG,
    birds: [], 
    audioMap: {} 
  };
  PRESET_SPECIES.forEach(sp => {
    tree.birds.push({ ...sp, x: 20 + Math.random()*60, y: 15 + Math.random()*65 });
    if (sp.audioFile) tree.audioMap[sp.common] = sp.audioFile;
  });
  trees = [tree];
  localStorage.setItem('birdnet_trees', JSON.stringify(trees));
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
  let tree = trees.find(t => t.id === id);
  if (!tree) return;

  // 关键修复：动态设置背景图
  const container = document.getElementById('tree-container');
  container.style.backgroundImage = `url('${tree.background || DEFAULT_TREE_BG}')`;

  renderTreeList();
  renderBirdsDOM();
  renderSpeciesList();
  closePopup();
  map.setView([tree.lat, tree.lng], 16);
}

function renderBirdsDOM() {
  const container = document.getElementById('tree-container');
  container.innerHTML = '';
  let tree = trees.find(t => t.id === currentTreeId);
  tree.birds.forEach(bird => {
    let img = document.createElement('img');
    img.src = bird.img;
    img.className = 'bird-element';
    img.id = 'bird-dom-' + bird.id;
    img.style.left = bird.x + '%';
    img.style.top = bird.y + '%';
    img.style.width = bird.size + 'px';
    img.onclick = (e) => { e.stopPropagation(); triggerBirdInteraction(bird, e.clientX, e.clientY); };
    container.appendChild(img);
  });
}

function renderSpeciesList() {
  const list = document.getElementById('species-list');
  list.innerHTML = '';
  let tree = trees.find(t => t.id === currentTreeId);
  tree.birds.forEach(bird => {
    let li = document.createElement('li');
    li.id = 'bird-li-' + bird.id;
    li.innerHTML = `<span>${bird.common}</span> <small>${(bird.confidence*100).toFixed(0)}%</small>`;
    li.onclick = () => {
      let dom = document.getElementById('bird-dom-' + bird.id);
      let r = dom.getBoundingClientRect();
      triggerBirdInteraction(bird, r.left + r.width/2, r.top);
    };
    list.appendChild(li);
  });
}

function triggerBirdInteraction(bird, x, y) {
  clearHighlights();
  document.getElementById('bird-dom-' + bird.id).classList.add('highlighted');
  let li = document.getElementById('bird-li-' + bird.id);
  li.classList.add('active');
  li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  let tree = trees.find(t => t.id === currentTreeId);
  let audioSrc = tree.audioMap[bird.common];
  if (audioEnabled && audioSrc) {
    if (currentPlayingAudio) currentPlayingAudio.pause();
    currentPlayingAudio = new Audio(audioSrc);
    currentPlayingAudio.play();
  }
  showBirdPopup(bird, x, y);
}

// 恢复并丰富了上一个版本的浮窗
function showBirdPopup(bird, x, y) {
  const root = document.getElementById('popup-root');
  const confPercent = (bird.confidence * 100).toFixed(1);
  root.innerHTML = `
    <div class="leaf-popup" style="left: ${x}px; top: ${y - 10}px;">
      <h4>${bird.common}</h4>
      <span class="sci">${bird.scientific}</span>
      <div style="font-size: 0.8rem;">识别置信度: ${confPercent}%</div>
      <div class="conf-bar"><div class="conf-fill" style="width: ${confPercent}%"></div></div>
      <a class="ebird-btn" href="https://ebird.org/species/${bird.scientific.replace(' ', '-')}" target="_blank">🔍 在 eBird 上查看</a>
    </div>
  `;
}

function clearHighlights() {
  document.querySelectorAll('.bird-element').forEach(el => el.classList.remove('highlighted'));
  document.querySelectorAll('.species-list li').forEach(el => el.classList.remove('active'));
}
function closePopup() { document.getElementById('popup-root').innerHTML = ''; }
function showToast(m) {
  const r = document.getElementById('toast-root');
  const t = document.createElement('div');
  t.className = 'toast'; t.innerText = m; r.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

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
  }, 100);
}

async function handleCreateTree() {
  let name = document.getElementById('newTreeName').value || '新榕树';
  let coords = document.getElementById('newTreeCoords').value.split(',');
  if (coords.length < 2) return alert("请在地图上选择位置");
  let newTree = {
    id: 'tree_' + Date.now(), name: name, lat: parseFloat(coords[0]), lng: parseFloat(coords[1]),
    background: DEFAULT_TREE_BG, birds: [], audioMap: {}
  };
  PRESET_SPECIES.forEach((sp, i) => {
    newTree.birds.push({ ...sp, id: Date.now()+i, x: 20 + Math.random()*60, y: 15 + Math.random()*65 });
  });
  trees.push(newTree);
  localStorage.setItem('birdnet_trees', JSON.stringify(trees));
  L.marker([newTree.lat, newTree.lng]).addTo(map).bindPopup(name);
  document.getElementById('createTreeModal').style.display = 'none';
  switchTree(newTree.id);
}