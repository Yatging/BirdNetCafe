/* app.js - integrated prototype
   - p5.js handles canvas and audio FFT
   - DOM handles file inputs, CSV parsing, layer list and controls
   - Added: realistic banyan drawing, leaf objects with popups and playback
*/

let canvas;
let fft;
let layers = [];        // visual layers (audio or BirdNET records)
let leaves = [];        // interactive leaves bound to layers
let currentAudio = null;
let audioURL = null;
let birdnetRecords = [];
let afcdList = [];

/* -------------------------
   p5.js setup
   ------------------------- */
function setup() {
  const container = document.getElementById('canvas-container');
  const w = container.clientWidth || 900;
  const h = container.clientHeight || 600;
  canvas = createCanvas(w, h);
  canvas.parent('canvas-container');
  colorMode(HSB, 360, 100, 100, 100);
  fft = new p5.FFT(0.9, 1024);

  bindUI();
  refreshLayerList();
}

function windowResized() {
  const container = document.getElementById('canvas-container');
  resizeCanvas(container.clientWidth, container.clientHeight);
}

/* -------------------------
   Main draw: realistic banyan + leaves + layers
   ------------------------- */
function draw() {
  background(210, 30, 98); // subtle background
  // draw realistic banyan trunk & branches
  drawRealisticBanyan();

  // draw leaves (interactive)
  drawLeaves();

  // draw visual layers (mountain-like) behind leaves for depth
  for (let i = 0; i < layers.length; i++) {
    const L = layers[i];
    push();
    translate(L.x, L.y);
    scale(L.scale);
    drawingContext.globalAlpha = L.opacity;
    setBlendMode(L.blend);
    drawLayerVisual(L);
    drawingContext.globalAlpha = 1;
    pop();
  }

  // selection/info card handled by DOM popup
}

/* -------------------------
   Realistic banyan drawing
   ------------------------- */
function drawRealisticBanyan() {
  push();
  translate(width * 0.5, height * 0.72);
  // trunk layers
  noStroke();
  for (let i = 0; i < 6; i++) {
    fill(28, 30, 18, 92 - i * 6);
    rect(-40 - i * 6, -220 + i * 12, 80 + i * 12, 240 + i * 8, 20);
  }
  // roots
  fill(28, 30, 16);
  for (let i = -4; i <= 4; i++) {
    ellipse(i * 28, 150, 40 + abs(i) * 6, 20);
  }
  // branches (curved)
  stroke(28, 30, 18);
  strokeWeight(8);
  noFill();
  for (let b = 0; b < 6; b++) {
    let bx = map(b, 0, 5, -140, 140);
    let by = -60 - b * 8;
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
   Layer visual (mountain-like watercolor)
   ------------------------- */
function drawLayerVisual(layer) {
  const spectrum = layer.spectrum || fft.analyze();
  const layersCount = 4;
  for (let li = 0; li < layersCount; li++) {
    const alpha = map(li, 0, layersCount - 1, 85, 18);
    const hue = (layer.hue + li * 10 + frameCount * 0.03) % 360;
    fill(hue, 60 - li * 6, 85, alpha);
    beginShape();
    vertex(-width, height * 0.45 + li * 8);
    for (let i = 0; i < spectrum.length; i += 8) {
      const x = map(i, 0, spectrum.length, -width * 0.45, width * 0.45);
      const amp = spectrum[i] / 255;
      let y = map(pow(amp, 1.3), 0, 1, 0, -160) - li * 6;
      y += 8 * sin(i * 0.02 + frameCount * 0.02 + li);
      curveVertex(x, y);
    }
    vertex(width, height * 0.45 + li * 8);
    endShape(CLOSE);
  }
}

/* -------------------------
   UI bindings
   ------------------------- */
function bindUI() {
  const audioInput = document.getElementById('audioFile');
  audioInput.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (currentAudio && currentAudio.isPlaying()) currentAudio.stop();
    if (audioURL) URL.revokeObjectURL(audioURL);
    audioURL = URL.createObjectURL(f);
    loadSound(audioURL, (s) => {
      currentAudio = s;
      currentAudio.setVolume(0.9);
      document.getElementById('audioStatus').innerText = `Loaded: ${f.name}`;
      // create a visual layer bound to this audio
      createLayerFromAudio(currentAudio, f.name);
    }, (err) => {
      console.error('loadSound error', err);
      document.getElementById('audioStatus').innerText = 'Audio load error';
    });
  });

  document.getElementById('playBtn').addEventListener('click', () => {
    if (currentAudio) currentAudio.loop();
  });
  document.getElementById('pauseBtn').addEventListener('click', () => {
    if (currentAudio) currentAudio.pause();
  });
  document.getElementById('stopBtn').addEventListener('click', () => {
    if (currentAudio) {
      currentAudio.stop();
      currentAudio.jump(0);
    }
  });

  const birdnetInput = document.getElementById('birdnetFile');
  birdnetInput.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      birdnetRecords = parseCSV(reader.result);
      document.getElementById('dataStatus').innerText = `BirdNET CSV loaded (${birdnetRecords.length})`;
      showBirdnetCandidates();
    };
    reader.readAsText(f);
  });

  const afcdInput = document.getElementById('afcdFile');
  afcdInput.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      afcdList = parseCSV(reader.result).map(r => ({
        scientific: (r.scientific_name || r.scientific || '').trim(),
        english: (r.english_name || r.english || '').trim(),
        chinese: (r.chinese_name || r.chinese || '').trim()
      }));
      document.getElementById('dataStatus').innerText = `AFCD list loaded (${afcdList.length})`;
    };
    reader.readAsText(f);
  });

  document.getElementById('addDemo').addEventListener('click', () => addDemoLayer());
  document.getElementById('clearLayers').addEventListener('click', () => {
    layers = [];
    leaves = [];
    refreshLayerList();
    closeLeafPopup();
  });
}

/* -------------------------
   CSV parsing (simple)
   ------------------------- */
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];
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
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      res.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0) res.push(cur);
  return res;
}

/* -------------------------
   BirdNET candidate UI
   ------------------------- */
function showBirdnetCandidates() {
  const list = document.getElementById('layerList');
  list.innerHTML = '';
  if (!birdnetRecords || birdnetRecords.length === 0) {
    list.innerHTML = '<div style="padding:6px;color:#777">No BirdNET records</div>';
    return;
  }
  const header = document.createElement('div');
  header.style.fontSize = '13px';
  header.style.marginBottom = '6px';
  header.innerText = 'BirdNET candidates (click to add)';
  list.appendChild(header);
  for (let i = 0; i < Math.min(12, birdnetRecords.length); i++) {
    const r = birdnetRecords[i];
    const btn = document.createElement('button');
    btn.style.display = 'block';
    btn.style.width = '100%';
    btn.style.marginBottom = '6px';
    btn.innerText = `${r.species_common || r.species_scientific || 'Unknown'} (${(parseFloat(r.confidence)||0).toFixed(2)})`;
    btn.onclick = () => {
      createLayerFromRecord(r);
      // after adding, refresh list to show layers instead
      birdnetRecords = [];
      refreshLayerList();
    };
    list.appendChild(btn);
  }
}

/* -------------------------
   Create layers & leaves
   ------------------------- */
function createLayerFromAudio(p5soundObj, label) {
  const L = {
    id: 'layer-' + Date.now(),
    label: label || 'Audio',
    species: '',
    scientific: '',
    confidence: 0,
    audio: p5soundObj,
    spectrum: null,
    x: random(width * 0.3, width * 0.7),
    y: random(height * 0.2, height * 0.6),
    scale: 1.0,
    opacity: 0.9,
    hue: random(40, 160),
    blend: 'ADD',
    selected: false,
    afcdMatch: false
  };
  L.spectrum = fft.analyze();
  layers.push(L);
  createLeavesForLayer(L, 3);
  refreshLayerList();
}

function createLayerFromRecord(record) {
  const L = {
    id: 'layer-' + Date.now(),
    label: record.species_common || record.species_scientific || 'Bird',
    species: record.species_common || '',
    scientific: record.species_scientific || '',
    confidence: parseFloat(record.confidence || record.score || 0),
    audio: null,
    spectrum: generateFakeSpectrum(record.species_scientific),
    x: random(width * 0.3, width * 0.7),
    y: random(height * 0.2, height * 0.6),
    scale: 1.0,
    opacity: map(parseFloat(record.confidence || 0), 0, 1, 0.4, 1),
    hue: random(40, 160),
    blend: 'ADD',
    selected: false,
    afcdMatch: matchAfcd(record.species_scientific, record.species_common) ? true : false
  };
  layers.push(L);
  createLeavesForLayer(L, 2);
  refreshLayerList();
}

/* create leaves bound to a layer */
function createLeavesForLayer(layer, count = 2) {
  for (let i = 0; i < count; i++) {
    const angle = random(-PI, PI);
    const radius = random(60, 180);
    const lx = layer.x + radius * cos(angle);
    const ly = layer.y + radius * sin(angle) - random(20, 80);
    const leaf = {
      id: 'leaf-' + Date.now() + '-' + i,
      x: lx,
      y: ly,
      baseX: lx,
      baseY: ly,
      size: random(18, 36),
      hue: (layer.hue + random(-20, 20) + 360) % 360,
      boundLayerId: layer.id,
      audioUrl: null,
      hover: false,
      playing: false
    };
    leaves.push(leaf);
  }
}

/* AFCD matching */
function matchAfcd(scientific, english) {
  if (!afcdList || afcdList.length === 0) return null;
  const sci = (scientific || '').toLowerCase().trim();
  const eng = (english || '').toLowerCase().trim();
  for (let a of afcdList) {
    if (sci && a.scientific && a.scientific.toLowerCase().trim() === sci) return a;
    if (eng && a.english && a.english.toLowerCase().trim() === eng) return a;
  }
  return null;
}

/* fake spectrum for records without audio */
function generateFakeSpectrum(name) {
  const arr = new Array(1024).fill(0).map((v, i) => {
    const base = 40 + 160 * noise(i * 0.01, frameCount * 0.001);
    return base + 80 * Math.sin(i * 0.02 + (name ? name.length : 0));
  });
  return arr;
}

/* -------------------------
   Layer list UI
   ------------------------- */
function refreshLayerList() {
  const list = document.getElementById('layerList');
  // if birdnetRecords exist, show candidates (handled elsewhere)
  if (birdnetRecords && birdnetRecords.length > 0) {
    showBirdnetCandidates();
    return;
  }
  list.innerHTML = '';
  if (layers.length === 0) {
    list.innerHTML = '<div style="padding:6px;color:#777">No layers yet</div>';
    return;
  }
  for (let i = layers.length - 1; i >= 0; i--) {
    const L = layers[i];
    const item = document.createElement('div');
    item.className = 'layer-item';
    item.innerHTML = `<div><strong>${L.label}</strong><br><small>${L.scientific || ''} ${L.confidence ? '(' + L.confidence.toFixed(2) + ')' : ''}</small></div>`;
    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '6px';
    const sel = document.createElement('button');
    sel.innerText = 'Select';
    sel.onclick = () => {
      layers.forEach(x => x.selected = false);
      L.selected = true;
    };
    controls.appendChild(sel);
    const del = document.createElement('button');
    del.innerText = 'Delete';
    del.onclick = () => {
      // remove layer and its leaves
      layers.splice(i, 1);
      leaves = leaves.filter(lf => lf.boundLayerId !== L.id);
      refreshLayerList();
      closeLeafPopup();
    };
    controls.appendChild(del);
    const op = document.createElement('input');
    op.type = 'range';
    op.min = 0; op.max = 100; op.value = Math.round(L.opacity * 100);
    op.style.width = '80px';
    op.oninput = () => { L.opacity = op.value / 100; };
    controls.appendChild(op);
    item.appendChild(controls);
    list.appendChild(item);
  }
}

/* -------------------------
   Leaves drawing & interaction
   ------------------------- */
function drawLeaves() {
  for (let lf of leaves) {
    // floating motion
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
}

/* hover detection */
function checkLeafHover(mx, my) {
  let found = null;
  for (let i = leaves.length - 1; i >= 0; i--) {
    const lf = leaves[i];
    const dx = mx - lf.x;
    const dy = my - lf.y;
    const r = lf.size * 0.6;
    if (dx * dx + dy * dy <= r * r) {
      found = lf;
      break;
    }
  }
  leaves.forEach(l => l.hover = (l === found));
  return found;
}

function mouseMoved() {
  checkLeafHover(mouseX, mouseY);
}

/* mousePressed: leaf popup priority, else layer drag */
let dragging = null;
let dragOffset = { x: 0, y: 0 };

function mousePressed() {
  const lf = checkLeafHover(mouseX, mouseY);
  if (lf) {
    openLeafPopup(lf);
    return;
  }
  // layer drag logic
  for (let i = layers.length - 1; i >= 0; i--) {
    const L = layers[i];
    const mx = mouseX - L.x;
    const my = mouseY - L.y;
    if (mx > -200 * L.scale && mx < 200 * L.scale && my > -200 * L.scale && my < 200 * L.scale) {
      dragging = L;
      dragOffset.x = mx;
      dragOffset.y = my;
      layers.splice(i, 1);
      layers.push(L);
      layers.forEach(x => x.selected = false);
      L.selected = true;
      refreshLayerList();
      return;
    }
  }
  layers.forEach(x => x.selected = false);
  refreshLayerList();
}

function mouseDragged() {
  if (dragging) {
    dragging.x = mouseX - dragOffset.x;
    dragging.y = mouseY - dragOffset.y;
    // move bound leaves with layer
    for (let lf of leaves) {
      if (lf.boundLayerId === dragging.id) {
        lf.baseX += (mouseX - pmouseX);
        lf.baseY += (mouseY - pmouseY);
      }
    }
  }
}

function mouseReleased() {
  dragging = null;
}

/* -------------------------
   Leaf popup DOM & playback
   ------------------------- */
function openLeafPopup(leaf) {
  closeLeafPopup();
  const layer = layers.find(l => l.id === leaf.boundLayerId);

  const popup = document.createElement('div');
  popup.className = 'leaf-popup';
  popup.id = 'leaf-popup-' + leaf.id;

  // position relative to canvas
  const rect = canvas.elt.getBoundingClientRect();
  const left = Math.min(window.innerWidth - 380, Math.max(8, rect.left + leaf.x));
  const top = Math.max(8, rect.top + leaf.y - 120);
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.innerText = '×';
  closeBtn.onclick = () => closeLeafPopup();
  popup.appendChild(closeBtn);

  const title = document.createElement('h4');
  title.innerText = layer ? (layer.label || 'Unknown bird') : 'Unknown';
  popup.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = `<span class="leaf-badge">${layer && layer.confidence ? 'Confidence ' + (layer.confidence.toFixed ? layer.confidence.toFixed(2) : layer.confidence) : 'No score'}</span>
                    &nbsp; ${layer && layer.afcdMatch ? '<span class="leaf-badge">AFCD matched</span>' : ''}`;
  popup.appendChild(meta);

  const controls = document.createElement('div');
  controls.className = 'controls';
  const playBtn = document.createElement('button');
  playBtn.innerText = 'Play call';
  const stopBtn = document.createElement('button');
  stopBtn.innerText = 'Stop';
  controls.appendChild(playBtn);
  controls.appendChild(stopBtn);
  popup.appendChild(controls);

  const details = document.createElement('div');
  details.style.marginTop = '8px';
  details.innerHTML = `<small>Scientific: ${layer && layer.scientific ? layer.scientific : '—'}</small>`;
  popup.appendChild(details);

  document.body.appendChild(popup);

  // playback logic
  let audioEl = null;
  if (layer && layer.audio && typeof layer.audio.play === 'function') {
    playBtn.onclick = () => {
      layer.audio.play();
      leaf.playing = true;
    };
    stopBtn.onclick = () => {
      layer.audio.stop();
      leaf.playing = false;
    };
    if (layer.audio && layer.audio.onended === undefined) {
      // try to set onended if available
      try { layer.audio.onended = () => { leaf.playing = false; }; } catch (e) {}
    }
  } else if (leaf.audioUrl) {
    audioEl = new Audio(leaf.audioUrl);
    playBtn.onclick = () => { audioEl.play(); leaf.playing = true; };
    stopBtn.onclick = () => { audioEl.pause(); audioEl.currentTime = 0; leaf.playing = false; };
    audioEl.onended = () => { leaf.playing = false; };
  } else {
    playBtn.onclick = () => { alert('No audio clip available for this leaf.'); };
    stopBtn.onclick = () => {};
  }

  document._currentLeafPopup = { popup, leaf, audioEl };
}

function closeLeafPopup() {
  const cur = document._currentLeafPopup;
  if (!cur) return;
  if (cur.audioEl) {
    cur.audioEl.pause();
    cur.audioEl.currentTime = 0;
  }
  if (cur.leaf && cur.leaf.boundLayerId) {
    const layer = layers.find(l => l.id === cur.leaf.boundLayerId);
    if (layer && layer.audio && layer.audio.isPlaying && layer.audio.isPlaying()) {
      layer.audio.stop();
    }
    cur.leaf.playing = false;
  }
  cur.popup.remove();
  document._currentLeafPopup = null;
}

/* -------------------------
   Utilities
   ------------------------- */
function setBlendMode(name) {
  switch ((name || '').toUpperCase()) {
    case 'ADD': blendMode(ADD); break;
    case 'MULTIPLY': blendMode(MULTIPLY); break;
    case 'SCREEN': blendMode(SCREEN); break;
    default: blendMode(BLEND); break;
  }
}

function addDemoLayer() {
  const demo = {
    id: 'demo-' + Date.now(),
    label: 'Demo Bird',
    species: 'Demo avius',
    scientific: 'Demo avius',
    confidence: 0.78,
    audio: null,
    spectrum: generateFakeSpectrum('demo'),
    x: width * 0.5 + random(-80, 80),
    y: height * 0.4 + random(-40, 40),
    scale: 1.0,
    opacity: 0.9,
    hue: random(40, 160),
    blend: 'ADD',
    selected: false,
    afcdMatch: false
  };
  layers.push(demo);
  createLeavesForLayer(demo, 3);
  refreshLayerList();
}

/* -------------------------
   Init on load
   ------------------------- */
window.addEventListener('load', () => {
  refreshLayerList();
});
