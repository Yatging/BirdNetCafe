/* app.js - single banyan tree exhibit
   - Single realistic banyan tree
   - Leaves appear on canopy; hover a leaf to show popup and auto-play call
   - Requires user to click "Enable Audio" once to allow playback in many browsers
*/

let canvas;
let fft;
let tree = null;       // single tree object
let leaves = [];       // interactive leaves
let birdnetRecords = [];
let afcdList = [];
let audioFiles = {};   // filename -> p5.Sound or URL
let audioEnabled = false;
let hoverPopupTimer = null;
const HOVER_DELAY = 220; // ms before showing popup on hover

function setup() {
  const container = document.getElementById('canvas-container');
  const w = container.clientWidth || 1000;
  const h = container.clientHeight || 700;
  canvas = createCanvas(w, h);
  canvas.parent('canvas-container');
  colorMode(HSB, 360, 100, 100, 100);
  fft = new p5.FFT(0.9, 1024);

  createSingleTree();
  bindUI();
  drawLegend();
}

function windowResized() {
  const container = document.getElementById('canvas-container');
  resizeCanvas(container.clientWidth, container.clientHeight);
  // reposition tree center
  tree.x = width * 0.5;
  tree.y = height * 0.62;
  layoutLeavesAroundTree();
}

function draw() {
  background(210, 30, 98);

  // ground
  noStroke();
  fill(120, 20, 95);
  rect(0, height * 0.78, width, height * 0.22);

  // draw tree
  push();
  translate(tree.x, tree.y);
  drawRealisticTrunk();
  drawCanopy();
  pop();

  // draw leaves
  for (let lf of leaves) drawLeaf(lf);
}

/* -------------------------
   Create single tree object
------------------------- */
function createSingleTree() {
  tree = {
    id: 'tree-1',
    x: width * 0.5,
    y: height * 0.62,
    scale: 1.0,
    speciesSummary: {}
  };
}

/* -------------------------
   Draw trunk with texture
------------------------- */
function drawRealisticTrunk() {
  push();
  noStroke();
  // layered trunk rectangles for depth
  for (let i = 0; i < 6; i++) {
    fill(28, 30, 18, 92 - i * 6);
    rect(-40 - i * 6, -220 + i * 12, 80 + i * 12, 240 + i * 8, 20);
  }
  // roots
  fill(28, 30, 16);
  for (let i = -3; i <= 3; i++) ellipse(i * 28, 150, 40 + abs(i) * 6, 18);
  pop();

  // branches
  push();
  translate(0, -40);
  stroke(28, 30, 18);
  strokeWeight(8);
  noFill();
  for (let b = 0; b < 6; b++) {
    let bx = map(b, 0, 5, -140, 140);
    let by = -20 - b * 8;
    beginShape();
    curveVertex(bx, by);
    curveVertex(bx + random(-40, 40), by - 60);
    curveVertex(bx + random(-80, 80), by - 140);
    curveVertex(bx + random(-140, 140), by - 240);
    endShape();
  }
  pop();
}

/* -------------------------
   Canopy clusters (decorative)
------------------------- */
function drawCanopy() {
  const clusterCount = 12;
  for (let i = 0; i < clusterCount; i++) {
    const angle = map(i, 0, clusterCount - 1, -PI, 0);
    const rx = 120 * cos(angle) + random(-12, 12);
    const ry = -140 + 40 * sin(angle) + random(-8, 8);
    drawCanopyCluster(rx, ry, 64 + i * 6);
  }
}

function drawCanopyCluster(cx, cy, size) {
  push();
  translate(cx, cy);
  for (let i = 0; i < 8; i++) {
    const hue = (100 + i * 18 + (tree.x + tree.y) * 0.01) % 360;
    fill(hue, 40, 70, 72);
    ellipse(random(-size * 0.45, size * 0.45), random(-size * 0.25, size * 0.25), size, size * 0.7);
  }
  pop();
}

/* -------------------------
   Leaves: draw and motion
------------------------- */
function drawLeaf(lf) {
  // subtle floating
  lf.x = lf.baseX + 6 * sin(frameCount * 0.02 + lf.baseX * 0.01);
  lf.y = lf.baseY + 4 * sin(frameCount * 0.015 + lf.baseY * 0.01);

  push();
  translate(lf.x, lf.y);
  rotate(0.12 * sin(frameCount * 0.02 + lf.x * 0.01));
  if (lf.hover || lf.playing) {
    fill(lf.hue, 70, 88, 95);
    stroke(0, 0, 0, 6);
    strokeWeight(1.2);
    ellipse(0, 0, lf.size * 1.6, lf.size * 1.0);
  }
  noStroke();
  fill(lf.hue, 60, 72, 95);
  beginShape();
  vertex(-lf.size * 0.4, 0);
  bezierVertex(-lf.size * 0.6, -lf.size * 0.6, lf.size * 0.6, -lf.size * 0.6, lf.size * 0.4, 0);
  bezierVertex(lf.size * 0.6, lf.size * 0.6, -lf.size * 0.6, lf.size * 0.6, -lf.size * 0.4, 0);
  endShape(CLOSE);
  pop();
}

/* -------------------------
   Layout leaves around tree based on speciesSummary
------------------------- */
function layoutLeavesFromSummary() {
  leaves = [];
  const speciesKeys = Object.keys(tree.speciesSummary || {});
  let offsetAngle = -PI;
  for (let sp of speciesKeys) {
    const info = tree.speciesSummary[sp];
    const count = Math.min(4, Math.max(1, Math.round(info.count)));
    for (let i = 0; i < count; i++) {
      const angle = offsetAngle + random(-0.35, 0.35);
      const radius = random(60, 140);
      const lx = tree.x + radius * cos(angle);
      const ly = tree.y + radius * sin(angle) - random(20, 80);
      const lf = {
        id: 'leaf-' + sp.replace(/\s+/g, '_') + '-' + i,
        x: lx, y: ly, baseX: lx, baseY: ly,
        size: random(16, 28),
        hue: random(80, 160),
        species: sp,
        confidence: info.sumConf / info.count,
        records: info.records,
        hover: false,
        playing: false,
        boundTreeId: tree.id
      };
      leaves.push(lf);
    }
    offsetAngle += 0.6;
  }
}

/* reposition leaves when resizing */
function layoutLeavesAroundTree() {
  for (let lf of leaves) {
    // recompute base positions relative to tree center
    const angle = random(-PI, 0);
    const radius = random(60, 140);
    lf.baseX = tree.x + radius * cos(angle);
    lf.baseY = tree.y + radius * sin(angle) - random(20, 80);
  }
}

/* -------------------------
   UI bindings
------------------------- */
function bindUI() {
  document.getElementById('birdnetFile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      birdnetRecords = parseCSV(reader.result);
      distributeRecordsToTree();
      layoutLeavesFromSummary();
      showToast(`Loaded BirdNET CSV (${birdnetRecords.length} records)`);
    };
    reader.readAsText(f);
  });

  document.getElementById('afcdFile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      afcdList = parseCSV(reader.result).map(r => ({
        scientific: (r.scientific_name || r.scientific || '').trim(),
        english: (r.english_name || r.english || '').trim(),
        chinese: (r.chinese_name || r.chinese || '').trim()
      }));
      showToast(`Loaded AFCD list (${afcdList.length})`);
    };
    reader.readAsText(f);
  });

  document.getElementById('audioFile').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    for (let f of files) {
      try {
        const url = URL.createObjectURL(f);
        await new Promise((res) => {
          loadSound(url, (s) => {
            audioFiles[f.name] = s;
            res();
          }, () => {
            // fallback to URL string
            audioFiles[f.name] = url;
            res();
          });
        });
      } catch (err) {
        console.warn('audio load error', err);
      }
    }
    showToast(`Loaded ${files.length} audio file(s)`);
  });

  document.getElementById('enableAudioBtn').addEventListener('click', () => {
    // create a short silent buffer to satisfy user gesture in some browsers
    userEnableAudio();
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    birdnetRecords = [];
    afcdList = [];
    audioFiles = {};
    leaves = [];
    tree.speciesSummary = {};
    showToast('Reset complete');
  });

  // canvas interactions
  canvas.mouseMoved(() => {
    const mx = mouseX, my = mouseY;
    const lf = checkLeafHover(mx, my);
    if (lf) {
      canvas.canvas.style.cursor = 'pointer';
      // schedule popup after small delay
      if (hoverPopupTimer) clearTimeout(hoverPopupTimer);
      hoverPopupTimer = setTimeout(() => {
        openLeafPopup(lf);
        // auto-play if audio enabled
        tryAutoPlayForLeaf(lf);
      }, HOVER_DELAY);
    } else {
      canvas.canvas.style.cursor = 'default';
      if (hoverPopupTimer) { clearTimeout(hoverPopupTimer); hoverPopupTimer = null; }
      // close popup when leaving
      closeAllPopups();
    }
  });

  canvas.mousePressed(() => {
    // clicking does nothing special here; hover handles popups
  });
}

/* -------------------------
   CSV parsing & distribution
------------------------- */
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 1) return [];
  const headers = splitCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length === 0) continue;
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j].trim()] = (cols[j] || '').trim();
    }
    rows.push(obj);
  }
  return rows;
}
function splitCSVLine(line) {
  const res = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { res.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.length > 0) res.push(cur);
  return res;
}

/* distribute BirdNET records to the single tree */
function distributeRecordsToTree() {
  tree.speciesSummary = {};
  if (!birdnetRecords || birdnetRecords.length === 0) return;
  for (let rec of birdnetRecords) {
    const species = (rec.species_common || rec.species_scientific || 'Unknown').trim();
    const conf = parseFloat(rec.confidence || rec.score || 0) || 0;
    if (!tree.speciesSummary[species]) tree.speciesSummary[species] = { count: 0, sumConf: 0, records: [] };
    tree.speciesSummary[species].count += 1;
    tree.speciesSummary[species].sumConf += conf;
    tree.speciesSummary[species].records.push(rec);
  }
}

/* -------------------------
   Hover detection
------------------------- */
function checkLeafHover(mx, my) {
  let found = null;
  for (let i = leaves.length - 1; i >= 0; i--) {
    const lf = leaves[i];
    const dx = mx - lf.x;
    const dy = my - lf.y;
    const r = lf.size * 0.6;
    if (dx * dx + dy * dy <= r * r) { found = lf; break; }
  }
  leaves.forEach(l => l.hover = (l === found));
  return found;
}

/* -------------------------
   Popups & autoplay on hover
------------------------- */
function openLeafPopup(leaf) {
  closeAllPopups();
  const root = document.getElementById('popup-root');
  const popup = document.createElement('div');
  popup.className = 'leaf-popup';
  popup.id = 'leaf-popup-' + leaf.id;

  const rect = canvas.elt.getBoundingClientRect();
  const left = Math.min(window.innerWidth - 360, Math.max(8, rect.left + leaf.x));
  const top = Math.max(8, rect.top + leaf.y - 120);
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.innerText = '×';
  closeBtn.onclick = () => closeAllPopups();
  popup.appendChild(closeBtn);

  const title = document.createElement('h4');
  title.innerText = leaf.species || 'Unknown';
  popup.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = `Avg confidence: ${(leaf.confidence || 0).toFixed(2)} · Records: ${leaf.records ? leaf.records.length : 0}`;
  popup.appendChild(meta);

  const controls = document.createElement('div');
  controls.className = 'controls';
  const playBtn = document.createElement('button');
  playBtn.innerText = 'Play';
  const stopBtn = document.createElement('button');
  stopBtn.innerText = 'Stop';
  controls.appendChild(playBtn);
  controls.appendChild(stopBtn);
  popup.appendChild(controls);

  // try to match uploaded audio by species name
  let matchedAudio = null;
  for (let key of Object.keys(audioFiles)) {
    if (key.toLowerCase().includes(leaf.species.toLowerCase().split(' ')[0])) {
      matchedAudio = audioFiles[key];
      break;
    }
  }

  let audioEl = null;
  if (matchedAudio) {
    if (typeof matchedAudio.play === 'function') {
      playBtn.onclick = () => { matchedAudio.play(); leaf.playing = true; };
      stopBtn.onclick = () => { matchedAudio.stop(); leaf.playing = false; };
      try { matchedAudio.onended = () => { leaf.playing = false; }; } catch (e) {}
    } else {
      audioEl = new Audio(matchedAudio);
      playBtn.onclick = () => { audioEl.play(); leaf.playing = true; };
      stopBtn.onclick = () => { audioEl.pause(); audioEl.currentTime = 0; leaf.playing = false; };
      audioEl.onended = () => { leaf.playing = false; };
    }
  } else {
    playBtn.onclick = () => { alert('No audio uploaded for this species.'); };
    stopBtn.onclick = () => {};
  }

  root.appendChild(popup);
  document._currentLeafPopup = { popup, leaf, audioEl, matchedAudio };
}

/* attempt autoplay when hovering */
function tryAutoPlayForLeaf(leaf) {
  if (!audioEnabled) return;
  // find matched audio
  let matchedAudio = null;
  for (let key of Object.keys(audioFiles)) {
    if (key.toLowerCase().includes(leaf.species.toLowerCase().split(' ')[0])) {
      matchedAudio = audioFiles[key];
      break;
    }
  }
  if (!matchedAudio) return;
  if (typeof matchedAudio.play === 'function') {
    try { matchedAudio.play(); leaf.playing = true; } catch (e) { console.warn('play failed', e); }
  } else {
    try {
      const a = new Audio(matchedAudio);
      a.play().catch(()=>{});
      leaf._tempAudioEl = a;
      leaf.playing = true;
      a.onended = () => { leaf.playing = false; leaf._tempAudioEl = null; };
    } catch (e) { console.warn('audio play error', e); }
  }
}

/* close popups and stop audio */
function closeAllPopups() {
  const root = document.getElementById('popup-root');
  root.innerHTML = '';
  for (let lf of leaves) lf.playing = false;
  for (let key of Object.keys(audioFiles)) {
    const a = audioFiles[key];
    if (a && typeof a.stop === 'function') try { a.stop(); } catch (e) {}
  }
}

/* -------------------------
   Enable audio (user gesture)
------------------------- */
function userEnableAudio() {
  // create a short silent buffer via p5 to unlock audio context
  try {
    const osc = new p5.Oscillator('sine');
    osc.start();
    osc.amp(0);
    setTimeout(() => { osc.stop(); }, 50);
  } catch (e) {
    // ignore
  }
  audioEnabled = true;
  document.getElementById('enableAudioBtn').innerText = 'Audio Enabled';
  document.getElementById('enableAudioBtn').disabled = true;
  showToast('Audio enabled. Hover leaves to hear calls (if uploaded).');
}

/* -------------------------
   Utilities: toast & legend
------------------------- */
function showToast(msg, ms = 1600) {
  let t = document.getElementById('exhibit-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'exhibit-toast';
    t.style.position = 'fixed';
    t.style.right = '12px';
    t.style.bottom = '12px';
    t.style.background = 'rgba(0,0,0,0.75)';
    t.style.color = '#fff';
    t.style.padding = '8px 12px';
    t.style.borderRadius = '8px';
    t.style.zIndex = 9999;
    document.body.appendChild(t);
  }
  t.innerText = msg;
  t.style.opacity = '1';
  setTimeout(() => { t.style.opacity = '0'; }, ms);
}

function drawLegend() {
  const container = document.getElementById('canvas-container');
  let legend = document.querySelector('.legend');
  if (!legend) {
    legend = document.createElement('div');
    legend.className = 'legend';
    legend.innerHTML = `<strong>How to use</strong><div style="font-size:13px;margin-top:6px">Click "Enable Audio" once, then hover a leaf to see species info and hear its call (if uploaded).</div>`;
    container.appendChild(legend);
  }
}

/* -------------------------
   Demo fallback: if no CSV, create sample species
------------------------- */
function addDemoSpecies() {
  birdnetRecords = [
    { species_common: 'Black-naped Oriole', species_scientific: 'Oriolus chinensis', confidence: '0.92' },
    { species_common: 'Light-vented Bulbul', species_scientific: 'Pycnonotus sinensis', confidence: '0.81' },
    { species_common: 'Eurasian Tree Sparrow', species_scientific: 'Passer montanus', confidence: '0.66' },
    { species_common: 'Collared Dove', species_scientific: 'Streptopelia decaocto', confidence: '0.78' }
  ];
  distributeRecordsToTree();
  layoutLeavesFromSummary();
  showToast('Demo species loaded');
}

/* -------------------------
   On load: if no data, show demo
------------------------- */
window.addEventListener('load', () => {
  setTimeout(() => {
    if (!birdnetRecords || birdnetRecords.length === 0) addDemoSpecies();
  }, 400);
});
