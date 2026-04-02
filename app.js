/* 榕树声景 · 科普展项
   - 拟真榕树（分形树干 + 气根 + 动态树冠）
   - 叶片代表物种，映射置信度（大小/颜色）
   - 悬停浮窗 + 自动播放鸟叫
   - 数据导入：BirdNET CSV / AFCD 名录 / 音频文件
*/

let canvas, fft;
let tree = { x: 0, y: 0, scale: 1.0 };
let leaves = [];            // 交互叶片对象
let birdnetRecords = [];
let afcdMap = new Map();    // 学名 -> { common, chinese, desc }
let audioFiles = new Map(); // 文件名 -> p5.Sound 或 Audio 对象
let audioEnabled = false;
let hoverTimer = null;
let currentPopup = null;
let swingAngle = 0;         // 树冠摆动

function setup() {
  const container = document.getElementById('canvas-container');
  const w = container.clientWidth || 1000;
  const h = container.clientHeight || 700;
  canvas = createCanvas(w, h);
  canvas.parent('canvas-container');
  colorMode(HSB, 360, 100, 100);
  fft = new p5.FFT(0.9, 1024);

  tree.x = width / 2;
  tree.y = height * 0.65;
  createTree();
  bindUI();
  loadDemoData();           // 演示数据
}

function windowResized() {
  const container = document.getElementById('canvas-container');
  resizeCanvas(container.clientWidth, container.clientHeight);
  tree.x = width / 2;
  tree.y = height * 0.65;
  repositionLeaves();
}

function draw() {
  // 天空渐变背景
  setGradient(0, 0, width, height, color(85, 40, 95), color(120, 20, 90));
  // 地面
  fill(120, 20, 85);
  rect(0, height * 0.78, width, height * 0.22);

  // 更新树冠摆动
  swingAngle += 0.008;
  let sway = sin(swingAngle) * 4;

  // 绘制树（主干 + 气根）
  push();
  translate(tree.x, tree.y);
  drawTrunk(sway);
  drawRoots();
  drawBranches(sway);
  drawCanopy(sway);
  pop();

  // 绘制叶片（需要浮空感）
  for (let leaf of leaves) drawLeaf(leaf);
}

// ---- 树绘制（增强真实感）----
function drawTrunk(sway) {
  push();
  rotate(radians(sway * 0.5));
  noStroke();
  for (let i = 0; i < 12; i++) {
    let w = 70 - i * 2;
    let h = 30 - i;
    fill(28, 60, 22 - i * 1.5, 90);
    ellipse(0, -150 + i * 18, w, h);
  }
  // 树皮纹理
  stroke(28, 60, 18);
  strokeWeight(1.5);
  for (let i = 0; i < 40; i++) {
    let y = -140 + i * 6;
    line(-25 + random(-3, 3), y, 25 + random(-3, 3), y);
  }
  pop();
}

function drawRoots() {
  fill(28, 55, 20);
  for (let i = -2; i <= 2; i++) {
    ellipse(i * 28, 60, 35, 15);
  }
}

function drawBranches(sway) {
  stroke(28, 55, 20);
  strokeWeight(6);
  noFill();
  let angles = [-0.6, -0.2, 0.2, 0.6];
  for (let a of angles) {
    push();
    rotate(radians(sway * 0.3));
    rotate(a);
    bezier(0, -120, 40, -180, 80, -210, 60 + sway * 0.5, -280);
    bezier(0, -120, -40, -180, -80, -210, -60 - sway * 0.5, -280);
    pop();
  }
}

function drawCanopy(sway) {
  // 动态树冠（多层级椭圆）
  push();
  rotate(radians(sway * 0.6));
  for (let layer = 0; layer < 5; layer++) {
    let offsetY = -120 + layer * 30;
    let size = 160 - layer * 10;
    let alpha = 65 - layer * 8;
    fill(100, 50, 55, alpha);
    ellipse(0, offsetY, size, size * 0.85);
  }
  pop();
}

// ---- 叶片绘制 ----
function drawLeaf(lf) {
  // 动态漂浮
  lf.x = lf.baseX + sin(frameCount * 0.02 + lf.idx) * 3;
  lf.y = lf.baseY + cos(frameCount * 0.025 + lf.idx) * 2.5;

  push();
  translate(lf.x, lf.y);
  rotate(sin(frameCount * 0.03 + lf.idx) * 0.2);
  // 根据置信度映射大小和颜色
  let size = map(lf.confidence, 0, 1, 12, 24);
  let hue = map(lf.confidence, 0, 1, 80, 140); // 绿 → 翠绿
  let sat = map(lf.confidence, 0, 1, 40, 80);
  let bright = map(lf.confidence, 0, 1, 65, 88);

  if (lf.hover) {
    // 悬停高亮
    fill(hue, sat, bright + 10);
    stroke(0, 0, 0, 30);
    strokeWeight(1.5);
  } else {
    noStroke();
    fill(hue, sat, bright, 95);
  }
  // 叶片形状
  beginShape();
  vertex(-size * 0.4, 0);
  bezierVertex(-size * 0.6, -size * 0.55, size * 0.6, -size * 0.55, size * 0.4, 0);
  bezierVertex(size * 0.6, size * 0.55, -size * 0.6, size * 0.55, -size * 0.4, 0);
  endShape(CLOSE);
  pop();
}

// ---- 叶片布局 ----
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

// ---- 数据解析与汇总 ----
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

// ---- 交互与浮窗 ----
function checkLeafHover() {
  let hit = null;
  for (let lf of leaves) {
    let d = dist(mouseX, mouseY, lf.x, lf.y);
    let size = map(lf.confidence, 0, 1, 12, 24);
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

  // 获取 AFCD 信息
  let info = afcdMap.get(leaf.species) || { chinese: '', desc: '本地常见留鸟，鸣声清脆。' };
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

  // 定位
  const rect = canvas.elt.getBoundingClientRect();
  let left = rect.left + leaf.x - 150;
  let top = rect.top + leaf.y - 140;
  left = Math.min(window.innerWidth - 280, Math.max(10, left));
  top = Math.max(10, top);
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';

  root.appendChild(popup);
  currentPopup = popup;

  // 绑定音频播放
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

  // 自动播放（如果音频已启用）
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
  // 停止所有音频
  for (let [_, aud] of audioFiles) {
    if (aud.stop) aud.stop();
    else if (aud.pause) aud.pause();
  }
}

// ---- UI 绑定与辅助 ----
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
    // 触发用户手势激活 AudioContext
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
}

function showToast(msg) {
  let root = document.getElementById('toast-root');
  let toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = msg;
  root.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

function setGradient(x, y, w, h, c1, c2) {
  for (let i = y; i <= y + h; i++) {
    let inter = map(i, y, y + h, 0, 1);
    let col = lerpColor(color(c1), color(c2), inter);
    stroke(col);
    line(x, i, x + w, i);
  }
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
  showToast('演示数据已加载（榕树·七种鸟鸣）');
}