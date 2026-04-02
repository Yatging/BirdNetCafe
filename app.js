/* 榕树声景 v2.0
   视觉升级：背景图片 + 动态光晕，叶片保留，交互保留
*/

let canvas, fft;
let tree = { x: 0, y: 0, scale: 1.0 };
let leaves = [];
let birdnetRecords = [];
let afcdMap = new Map();
let audioFiles = new Map();
let audioEnabled = false;
let hoverTimer = null;
let currentPopup = null;
let glow = 0;          // 用于光效动画

function setup() {
  const container = document.getElementById('canvas-container');
  const w = container.clientWidth || 1000;
  const h = container.clientHeight || 700;
  canvas = createCanvas(w, h);
  canvas.parent('canvas-container');
  colorMode(HSB, 360, 100, 100);
  fft = new p5.FFT(0.9, 1024);

  // 树的位置（用于叶片布局）
  tree.x = width / 2;
  tree.y = height * 0.65;

  // 初始化交互
  bindUI();
  loadDemoData();
}

function windowResized() {
  const container = document.getElementById('canvas-container');
  resizeCanvas(container.clientWidth, container.clientHeight);
  tree.x = width / 2;
  tree.y = height * 0.65;
  repositionLeaves();
}

function draw() {
  // 背景透明，让 CSS 背景图片透出
  clear();
  noStroke();

  // 绘制柔和的光晕（模拟树冠下的光斑）
  glow = (glow + 0.01) % TWO_PI;
  let rad = 200 + sin(glow) * 20;
  for (let i = 0; i < 3; i++) {
    fill(60, 15, 92, 5 - i * 1.5);
    ellipse(tree.x, tree.y - 40, rad + i * 30, rad + i * 30);
  }

  // 绘制一个半透明的地面投影，增强真实感
  fill(0, 0, 0, 10);
  ellipse(tree.x, height - 20, 300, 50);

  // 绘制叶片
  for (let leaf of leaves) drawLeaf(leaf);
}

// 叶片绘制（简洁抽象，依然优雅）
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

  // 水滴形叶片
  beginShape();
  vertex(-size * 0.4, 0);
  bezierVertex(-size * 0.6, -size * 0.55, size * 0.6, -size * 0.55, size * 0.4, 0);
  bezierVertex(size * 0.6, size * 0.55, -size * 0.6, size * 0.55, -size * 0.4, 0);
  endShape(CLOSE);
  pop();
}

// ----- 数据与叶片布局 -----
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  let rows = [];
  for (let i = 1; i < lines.length; i++) {
    let vals = [];
    let inQuote = false;
    let cur = '';
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

function updateSpeciesSummary() {
  tree.speciesSummary = {};
  for (let rec of birdnetRecords) {
    let species = rec.species_common || rec.Species || rec.scientific || 'Unknown';
    let conf = parseFloat(rec.confidence || rec.Confidence || 0);
    if (isNaN(conf)) conf = 0;
    if (!tree.speciesSummary[species]) {
      tree.speciesSummary[species] = { count: 0, sumConf: 0, records: [] };
    }
    tree.speciesSummary[species].count++;
    tree.speciesSummary[species].sumConf += conf;
    tree.speciesSummary[species].records.push(rec);
  }
  layoutLeaves();
}

function layoutLeaves() {
  leaves = [];
  let speciesList = Object.keys(tree.speciesSummary || {});
  if (speciesList.length === 0) return;

  let angleStep = PI / (speciesList.length + 1);
  let startAngle = -PI * 0.6;
  for (let i = 0; i < speciesList.length; i++) {
    let sp = speciesList[i];
    let info = tree.speciesSummary[sp];
    let avgConf = info.sumConf / info.count;
    let count = Math.min(5, Math.max(1, Math.floor(info.count * 0.7) + 1));
    for (let j = 0; j < count; j++) {
      let angle = startAngle + i * angleStep + random(-0.3, 0.3);
      let radius = random(80, 160);
      let baseX = tree.x + radius * cos(angle);
      let baseY = tree.y + radius * sin(angle) - random(20, 110);
      leaves.push({
        id: `${sp}_${j}`,
        baseX, baseY, x: baseX, y: baseY,
        confidence: avgConf,
        species: sp,
        records: info.records,
        avgConfidence: avgConf,
        count: info.count,
        hover: false,
        playing: false,
        idx: random(1000)
      });
    }
  }
}

function repositionLeaves() {
  for (let lf of leaves) {
    let angle = atan2(lf.baseY - tree.y, lf.baseX - tree.x);
    let radius = dist(tree.x, tree.y, lf.baseX, lf.baseY);
    lf.baseX = tree.x + radius * cos(angle);
    lf.baseY = tree.y + radius * sin(angle);
  }
}

// ----- 交互逻辑（保持不变）-----
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

function showPopup(leaf) {
  closePopup();
  const root = document.getElementById('popup-root');
  const popup = document.createElement('div');
  popup.className = 'leaf-popup';
  popup.id = 'popup-current';

  let info = afcdMap.get(leaf.species) || { chinese: '', desc: '香港常见鸟类，鸣声独特。' };
  let commonName = leaf.species;
  let sciName = leaf.records[0]?.species_scientific || '未知学名';

  popup.innerHTML = `
    <button class="close-btn">×</button>
    <h4>${commonName}</h4>
    <div class="sci-name">${sciName}</div>
    <div class="meta">
      <span>📊 置信度 ${(leaf.avgConfidence * 100).toFixed(0)}%</span>
      <span>🔢 ${leaf.count} 条记录</span>
    </div>
    <div class="desc">${info.desc}</div>
    <div class="controls">
      <button class="play-btn">▶ 播放鸟叫</button>
      <button class="stop-btn">⏹️ 停止</button>
    </div>
  `;

  const rect = canvas.elt.getBoundingClientRect();
  let left = rect.left + leaf.x - 150;
  let top = rect.top + leaf.y - 140;
  left = Math.min(window.innerWidth - 280, Math.max(10, left));
  top = Math.max(10, top);
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';

  root.appendChild(popup);
  currentPopup = popup;

  // 音频匹配
  let matchedAudio = null;
  for (let [name, aud] of audioFiles.entries()) {
    if (name.toLowerCase().includes(leaf.species.toLowerCase().split(' ')[0])) {
      matchedAudio = aud;
      break;
    }
  }

  const playBtn = popup.querySelector('.play-btn');
  const stopBtn = popup.querySelector('.stop-btn');
  let audioEl = null;

  if (matchedAudio) {
    if (typeof matchedAudio.play === 'function') {
      playBtn.onclick = () => { matchedAudio.play(); leaf.playing = true; };
      stopBtn.onclick = () => { matchedAudio.stop(); leaf.playing = false; };
    } else {
      audioEl = new Audio(matchedAudio);
      playBtn.onclick = () => { audioEl.play(); leaf.playing = true; };
      stopBtn.onclick = () => { audioEl.pause(); audioEl.currentTime = 0; leaf.playing = false; };
      audioEl.onended = () => leaf.playing = false;
    }
  } else {
    playBtn.onclick = () => showToast('未上传该物种的音频');
    stopBtn.onclick = () => {};
  }

  if (audioEnabled && matchedAudio) {
    if (audioEl) audioEl.play().catch(e=>console.log);
    else if (matchedAudio.play) matchedAudio.play();
    leaf.playing = true;
  }

  popup.querySelector('.close-btn').onclick = closePopup;
}

function closePopup() {
  if (currentPopup) currentPopup.remove();
  currentPopup = null;
  if (hoverTimer) clearTimeout(hoverTimer);
  for (let l of leaves) l.playing = false;
  for (let [_, aud] of audioFiles) {
    if (aud.stop) aud.stop();
    else if (aud.pause) aud.pause();
  }
}

// ----- UI 绑定与辅助函数 -----
function bindUI() {
  document.getElementById('birdnetFile').addEventListener('change', e => {
    let f = e.target.files[0];
    if (!f) return;
    let reader = new FileReader();
    reader.onload = ev => {
      birdnetRecords = parseCSV(ev.target.result);
      updateSpeciesSummary();
      showToast(`已加载 ${birdnetRecords.length} 条鸟鸣记录`);
    };
    reader.readAsText(f);
  });

  document.getElementById('afcdFile').addEventListener('change', e => {
    let f = e.target.files[0];
    if (!f) return;
    let reader = new FileReader();
    reader.onload = ev => {
      let rows = parseCSV(ev.target.result);
      for (let r of rows) {
        let name = r.common_name || r.english || r.species;
        if (name) afcdMap.set(name, {
          chinese: r.chinese_name || '',
          desc: r.description || `香港常见鸟类，栖息于林缘。`
        });
      }
      showToast(`已加载 ${afcdMap.size} 种鸟类信息`);
    };
    reader.readAsText(f);
  });

  document.getElementById('audioFile').addEventListener('change', async e => {
    let files = Array.from(e.target.files);
    for (let f of files) {
      let url = URL.createObjectURL(f);
      await new Promise(resolve => {
        loadSound(url, s => { audioFiles.set(f.name, s); resolve(); },
          () => { audioFiles.set(f.name, url); resolve(); });
      });
    }
    showToast(`已加载 ${files.length} 个音频文件`);
  });

  document.getElementById('enableAudioBtn').addEventListener('click', () => {
    if (getAudioContext().state !== 'running') {
      getAudioContext().resume().then(() => {
        audioEnabled = true;
        showToast('音频已启用，悬停叶片即可播放');
        document.getElementById('enableAudioBtn').disabled = true;
      });
    } else {
      audioEnabled = true;
      showToast('音频已启用');
    }
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    birdnetRecords = [];
    afcdMap.clear();
    audioFiles.clear();
    tree.speciesSummary = {};
    leaves = [];
    closePopup();
    showToast('已重置所有数据');
  });

  canvas.mouseMoved(checkLeafHover);

  // 关于项目模态框
  const modal = document.getElementById('aboutModal');
  const aboutBtn = document.getElementById('aboutBtn');
  const closeModal = document.querySelector('.close-modal');
  aboutBtn.onclick = () => modal.style.display = 'flex';
  closeModal.onclick = () => modal.style.display = 'none';
  window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
}

function showToast(msg) {
  let root = document.getElementById('toast-root');
  let toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = msg;
  root.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

function loadDemoData() {
  birdnetRecords = [
    { species_common: '黑领椋鸟', species_scientific: 'Gracupica nigricollis', confidence: 0.92 },
    { species_common: '暗绿绣眼鸟', species_scientific: 'Zosterops simplex', confidence: 0.85 },
    { species_common: '红耳鹎', species_scientific: 'Pycnonotus jocosus', confidence: 0.78 },
    { species_common: '噪鹃', species_scientific: 'Eudynamys scolopaceus', confidence: 0.77 },
    { species_common: '黄眉柳莺', species_scientific: 'Phylloscopus inornatus', confidence: 0.75 },
    { species_common: '家麻雀', species_scientific: 'Passer domesticus', confidence: 0.71 },
    { species_common: '白喉红臀鹎', species_scientific: 'Pycnonotus aurigaster', confidence: 0.53 }
  ];
  updateSpeciesSummary();
  showToast('演示数据已加载 · 榕树声景');
}