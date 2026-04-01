/* app.js - front-end prototype
   - p5.js handles canvas and audio FFT
   - DOM handles file inputs, CSV parsing, layer list and controls
*/

let canvas;
let fft;
let layers = [];
let currentAudio = null;
let audioURL = null;
let birdnetRecords = [];
let afcdList = [];

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

function draw() {
  background(220, 20, 98);
  push();
  translate(width * 0.5, height * 0.6);
  drawBanyanBase();
  pop();

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

  drawSelectionCard();
}

function drawBanyanBase() {
  noStroke();
  fill(30, 30, 20);
  rect(-40, -40, 80, 160, 20);
  fill(30, 30, 18);
  for (let i = -3; i <= 3; i++) {
    ellipse(i * 30, 120, 40, 20);
  }
  for (let i = 0; i < 12; i++) {
    let a = i * TWO_PI / 12 + frameCount * 0.002;
    let r = 160 + 10 * sin(frameCount * 0.01 + i);
    let x = cos(a) * r;
    let y = -120 + sin(a) * (r * 0.4);
    fill((100 + i * 20) % 360, 40, 60, 60);
    ellipse(x, y, 120, 80);
  }
}

function drawLayerVisual(layer) {
  const spectrum = layer.spectrum || fft.analyze();
  const layersCount = 5;
  for (let li = 0; li < layersCount; li++) {
    const alpha = map(li, 0, layersCount - 1, 90, 20);
    const hue = (layer.hue + li * 12 + frameCount * 0.05) % 360;
    fill(hue, 70 - li * 6, 80, alpha);
    beginShape();
    vertex(-width, height * 0.5 + li * 10);
    for (let i = 0; i < spectrum.length; i += 6) {
      const x = map(i, 0, spectrum.length, -width * 0.5, width * 0.5);
      const amp = spectrum[i] / 255;
      let y = map(pow(amp, 1.2), 0, 1, 0, -180) - li * 8;
      y += 10 * sin(i * 0.02 + frameCount * 0.02 + li);
      curveVertex(x, y);
    }
    vertex(width, height * 0.5 + li * 10);
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
    refreshLayerList();
  });
}

/* -------------------------
   CSV parsing
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
   BirdNET UI
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
    };
    list.appendChild(btn);
  }
}

/* -------------------------
   Create layers
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
    hue: random(0, 360),
    blend: 'ADD',
    selected: false,
    afcdMatch: false
  };
  L.spectrum = fft.analyze();
  layers.push(L);
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
    hue: random(0, 360),
    blend: 'ADD',
    selected: false,
    afcdMatch: matchAfcd(record.species_scientific, record.species_common) ? true : false
  };
  layers.push(L);
  refreshLayerList();
}

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

function generateFakeSpectrum(name) {
  const arr = new Array(1024).fill(0).map((v, i) => {
    const base = 40 + 160 * noise(i * 0.01, frameCount * 0.001);
    return base + 80 * Math.sin(i * 0.02 + (name ? name.length : 0));
  });
  return arr;
}

/* -------------------------
   Layer list & selection
   ------------------------- */
function refreshLayerList() {
  const list = document.getElementById('layerList');
  // If BirdNET candidates exist, keep them visible; otherwise show layers
  if (birdnetRecords && birdnetRecords.length > 0) {
    // keep candidate UI (do nothing)
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
      layers.splice(i, 1);
      refreshLayerList();
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

function drawSelectionCard() {
  const sel = layers.find(l => l.selected);
  if (!sel) return;
  push();
  fill(0, 0, 100, 95);
  stroke(0, 0, 0, 10);
  rect(10, height - 120, 320, 110, 8);
  noStroke();
  fill(0);
  textSize(14);
  text(`${sel.label}`, 20, height - 96);
  textSize(12);
  text(`Scientific: ${sel.scientific || '—'}`, 20, height - 76);
  text(`Confidence: ${sel.confidence ? sel.confidence.toFixed(2) : '—'}`, 20, height - 56);
  text(`AFCD match: ${sel.afcdMatch ? 'Yes' : 'No / Unknown'}`, 20, height - 36);
  pop();
}

/* -------------------------
   Drag & drop
   ------------------------- */
let dragging = null;
let dragOffset = { x: 0, y: 0 };

function mousePressed() {
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
  }
}

function mouseReleased() {
  dragging = null;
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
    hue: random(0, 360),
    blend: 'ADD',
    selected: false,
    afcdMatch: false
  };
  layers.push(demo);
  refreshLayerList();
}

window.addEventListener('load', () => {
  refreshLayerList();
});
