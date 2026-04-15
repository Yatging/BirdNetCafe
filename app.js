let trees = [];
let currentTreeId = null;
let map = null; 
let modalMap = null; 
let modalMarker = null;
let audioEnabled = false;
let currentPlayingAudio = null;

// 1. 明确使用本地 bayan.png 作为背景
const DEFAULT_TREE_BG = "bayan.png";

// 2. 完整恢复 7 种鸟类的真实路径和数据
const PRESET_SPECIES = [
  { id: "1", common: "黑领椋鸟", scientific: "Gracupica nigricollis", confidence: 0.94, audioFile: "audio/黑领椋鸟.mp3", img: "image/黑领椋鸟.png", realSizeCm: 28 },
  { id: "2", common: "暗绿绣眼鸟", scientific: "Zosterops simplex", confidence: 0.85, audioFile: "audio/暗绿绣眼鸟.mp3", img: "image/暗绿绣眼鸟.png", realSizeCm: 11 },
  { id: "3", common: "红耳鹎", scientific: "Pycnonotus jocosus", confidence: 0.78, audioFile: "audio/红耳鹎.mp3", img: "image/红耳鹎.png", realSizeCm: 20 },
  { id: "4", common: "噪鹃", scientific: "Eudynamys scolopaceus", confidence: 0.77, audioFile: "audio/噪鹃.mp3", img: "image/噪鹃.png", realSizeCm: 43 },
  { id: "5", common: "黄眉柳莺", scientific: "Phylloscopus inornatus", confidence: 0.75, audioFile: "audio/黄眉柳莺.mp3", img: "image/黄眉柳莺.png", realSizeCm: 10 },
  { id: "6", common: "家麻雀", scientific: "Passer domesticus", confidence: 0.71, audioFile: "audio/家麻雀.mp3", img: "image/家麻雀.png", realSizeCm: 15 },
  { id: "7", common: "白喉红臀鹎", scientific: "Pycnonotus aurigaster", confidence: 0.53, audioFile: "audio/白喉红臀鹎.mp3", img: "image/白喉红臀鹎.png", realSizeCm: 20 }
];

function random(min, max) { return Math.random() * (max - min) + min; }
function calculateBirdSize(realSizeCm) { return realSizeCm ? 35 + (realSizeCm * 1.6) : random(50, 70); }

// 防重叠生成坐标
function generateNonOverlappingOffset(newBirdSize, existingBirds) {
  for (let i = 0; i < 150; i++) {
    let maxRadius = 140 + existingBirds.length * 15;
    let angle = random(-Math.PI * 0.95, -Math.PI * 0.05); 
    let radius = random(60, maxRadius); 
    let dx = radius * Math.cos(angle);
    let dy = radius * Math.sin(angle) - random(10, 60);

    let overlap = false;
    for (let b of existingBirds) {
      if (b.dx === undefined || b.dy === undefined) continue;
      let dist = Math.hypot(dx - b.dx, dy - b.dy);
      let minSpace = (newBirdSize / 2) + ((b.size || 50) / 2) + 5; 
      if (dist < minSpace) { overlap = true; break; }
    }
    if (!overlap) return { dx, dy };
  }
  return { dx: random(-150, 150), dy: random(-200, -50) };
}

window.onload = () => {
  initMainMap();
  loadTrees();
  if (trees.length === 0) createPresetTree();
  
  // 事件绑定
  document.getElementById('resetBtn').onclick = () => {
    if(confirm("确定要清空所有数据并重置为大窝坪道默认配置吗？")) {
      localStorage.removeItem('birdnetcafe_trees');
      location.reload();
    }
  };

  document.getElementById('aboutBtn').onclick = () => {
    document.getElementById('aboutModal').style.display = 'flex';
  };

  document.getElementById('enableAudioBtn').onclick = () => {
    audioEnabled = true;
    showToast("🎵 声音已开启");
    document.getElementById('enableAudioBtn').style.display = 'none';
  };
  
  document.getElementById('createTreeBtn').onclick = openCreateModal;
  document.getElementById('confirmCreateTree').onclick = handleCreateTree;

  // 搜索地图
  document.getElementById('locSearchBtn').onclick = async () => {
    let q = document.getElementById('locSearchInput').value;
    if(!q) return;
    try {
      showToast('搜索中...');
      let res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`);
      let data = await res.json();
      if(data && data.length > 0) {
        let lat = parseFloat(data[0].lat); let lon = parseFloat(data[0].lon);
        modalMap.setView([lat, lon], 14);
        if(modalMarker) modalMap.removeLayer(modalMarker);
        modalMarker = L.marker([lat, lon]).addTo(modalMap);
        document.getElementById('newTreeCoords').value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        showToast('📍 已找到地点');
      } else showToast('未找到地点');
    } catch(e) {}
  };

  document.getElementById('tree-container').onclick = (e) => {
    if (e.target.id === 'tree-container') { closePopup(); clearHighlights(); }
  };
};

function initMainMap() { 
  map = L.map('map').setView([22.3407, 114.1668], 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);
}

function loadTrees() {
  let stored = localStorage.getItem('birdnetcafe_trees');
  if (stored) { try { trees = JSON.parse(stored); } catch(e) { trees = []; } }
  trees.forEach(t => { L.marker([t.lat, t.lng]).addTo(map).bindPopup(t.name).on('click', () => switchTree(t.id)); });
}

function saveTreesToLocalStorage() {
  localStorage.setItem('birdnetcafe_trees', JSON.stringify(trees));
}

function createPresetTree() {
  const tree = { 
    id: 'preset_tree', name: '大窝坪道 · 榕树', lat: 22.3407, lng: 114.1668, 
    background: DEFAULT_TREE_BG, birds: [], audioMap: {} 
  };
  let birdList = [];
  PRESET_SPECIES.forEach(sp => {
    let size = calculateBirdSize(sp.realSizeCm);
    let offset = generateNonOverlappingOffset(size, birdList);
    birdList.push({ ...sp, size: size, dx: offset.dx, dy: offset.dy });
    if (sp.audioFile) tree.audioMap[sp.common] = sp.audioFile;
  });
  tree.birds = birdList;
  trees = [tree];
  saveTreesToLocalStorage();
  L.marker([tree.lat, tree.lng]).addTo(map).bindPopup(tree.name);
  switchTree(tree.id);
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
}

function switchTree(id) {
  currentTreeId = id;
  let tree = trees.find(t => t.id === id);
  if (!tree) return;

  const container = document.getElementById('tree-container');
  // 读取自定义图片或默认 bayan.png
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
  const w = container.offsetWidth || 800; const h = container.offsetHeight || 600;
  
  let treeX = w / 2; let treeY = h * 0.65;

  tree.birds.forEach((bird, index) => {
    let finalSize = bird.size || 50;
    let node = document.createElement('div');
    node.className = 'bird-node';
    node.id = 'bird-dom-' + bird.id;
    node.style.left = (treeX + bird.dx) + 'px';
    node.style.top = (treeY + bird.dy) + 'px';
    node.style.width = finalSize + 'px';
    node.style.height = finalSize + 'px';
    node.style.animationDelay = `${index * 0.2}s`;

    let img = document.createElement('img');
    img.src = encodeURI(bird.img || bird.imgPath);
    img.onerror = function() { 
      this.style.display='none'; 
      let fb = document.createElement('div'); fb.className='bird-fallback'; fb.innerText=bird.common.substring(0,2); node.appendChild(fb); 
    };

    node.appendChild(img);
    node.onclick = (e) => { e.stopPropagation(); triggerBirdInteraction(bird, e.clientX, e.clientY); };
    container.appendChild(node);
  });
}

function renderSpeciesList() {
  const list = document.getElementById('species-list');
  list.innerHTML = '';
  let tree = trees.find(t => t.id === currentTreeId);
  tree.birds.forEach(bird => {
    let li = document.createElement('li');
    li.id = 'bird-li-' + bird.id;
    li.innerHTML = `<span>${bird.common}</span> <span style="color:#888; font-size:0.8rem;">${(bird.confidence*100).toFixed(0)}%</span>`;
    li.onclick = () => {
      let dom = document.getElementById('bird-dom-' + bird.id);
      if(dom) {
        let r = dom.getBoundingClientRect();
        triggerBirdInteraction(bird, r.left + r.width/2, r.top);
      }
    };
    list.appendChild(li);
  });
}

function triggerBirdInteraction(bird, x, y) {
  clearHighlights();
  document.getElementById('bird-dom-' + bird.id)?.classList.add('highlighted');
  let li = document.getElementById('bird-li-' + bird.id);
  if(li) { li.classList.add('active'); li.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }

  let tree = trees.find(t => t.id === currentTreeId);
  let audioSrc = tree.audioMap[bird.common];
  if (audioEnabled && audioSrc) {
    if (currentPlayingAudio) currentPlayingAudio.pause();
    currentPlayingAudio = new Audio(audioSrc);
    currentPlayingAudio.play().catch(e=>{});
  }
  showBirdPopup(bird, x, y);
}

// 3. 带有缩略图和维基百科的浮窗
function showBirdPopup(bird, x, y) {
  const root = document.getElementById('popup-root');
  const confPercent = (bird.confidence * 100).toFixed(1);
  const wikiLink = `https://zh.wikipedia.org/wiki/${encodeURIComponent(bird.common)}`;
  
  root.innerHTML = `
    <div class="leaf-popup" style="left: ${x}px; top: ${y - 10}px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px;">
        <img src="${bird.img || bird.imgPath}" onerror="this.style.display='none'" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-green); background: #eee;">
        <div>
          <h4 style="color: var(--accent-green); margin: 0; font-size: 1.1rem;">${bird.common}</h4>
          <span style="font-size: 0.8rem; font-style: italic; color: #888;">${bird.scientific}</span>
        </div>
      </div>
      <div style="font-size: 0.8rem; color: #555;">识别置信度: <strong>${confPercent}%</strong></div>
      <div style="height: 4px; background: #eee; border-radius: 2px; margin: 6px 0; overflow: hidden;">
        <div style="width: ${confPercent}%; height: 100%; background: var(--accent-amber);"></div>
      </div>
      <a class="wiki-btn" href="${wikiLink}" target="_blank">📘 在 Wikipedia 查看</a>
    </div>
  `;
}

function clearHighlights() {
  document.querySelectorAll('.bird-node').forEach(el => el.classList.remove('highlighted'));
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
    // 关键修复：防止弹窗地图塌陷
    modalMap.invalidateSize();
  }, 100);
}

async function handleCreateTree() {
  let name = document.getElementById('newTreeName').value || '新榕树';
  let coords = document.getElementById('newTreeCoords').value.split(',');
  if (coords.length < 2) return alert("请在地图上选择位置");
  
  let treeImgFile = document.getElementById('newTreeImg').files[0];
  let customBg = null;
  if(treeImgFile) customBg = await compressImage(treeImgFile);

  let newTree = {
    id: 'tree_' + Date.now(), name: name, lat: parseFloat(coords[0]), lng: parseFloat(coords[1]),
    background: customBg || DEFAULT_TREE_BG, birds: [], audioMap: {}
  };
  
  let birdList = [];
  PRESET_SPECIES.forEach((sp, i) => {
    let size = calculateBirdSize(sp.realSizeCm);
    let offset = generateNonOverlappingOffset(size, birdList);
    birdList.push({ ...sp, id: Date.now()+i, size: size, dx: offset.dx, dy: offset.dy });
  });
  newTree.birds = birdList;

  trees.push(newTree);
  saveTreesToLocalStorage();
  L.marker([newTree.lat, newTree.lng]).addTo(map).bindPopup(name);
  document.getElementById('createTreeModal').style.display = 'none';
  switchTree(newTree.id);
  showToast('新树创建成功！');
}

// 图片压缩防止 LocalStorage 溢出
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > 1200 || h > 1200) { if (w > h) { h *= 1200/w; w = 1200; } else { w *= 1200/h; h = 1200; } }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.6)); 
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}