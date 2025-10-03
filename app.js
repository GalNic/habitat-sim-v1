import * as THREE from 'https://cdn.skypack.dev/three@0.160.0';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'https://cdn.skypack.dev/three@0.160.0/examples/jsm/controls/TransformControls.js';

const container = document.getElementById('viewport3d');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.shadowMap.enabled = true;
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.set(22, 16, 22);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.06;
orbit.target.set(0, 0, 0);
orbit.update();

const transform = new TransformControls(camera, renderer.domElement);
transform.setMode('translate');
transform.setTranslationSnap(0.1);
transform.setRotationSnap(THREE.MathUtils.degToRad(15));
let transformDragging = false;
transform.addEventListener('dragging-changed', (event) => {
  orbit.enabled = !event.value;
  transformDragging = event.value;
});
transform.addEventListener('objectChange', () => {
  syncTransformToState();
});
transform.addEventListener('mouseUp', () => {
  pushHistory();
});
scene.add(transform);
transform.visible = false;

const ambient = new THREE.AmbientLight(0x6278a0, 0.65);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
dirLight.position.set(25, 30, 20);
dirLight.castShadow = true;
dirLight.shadow.bias = -0.0002;
dirLight.shadow.mapSize.set(1024, 1024);
scene.add(dirLight);

const groundMat = new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.9, metalness: 0.05, transparent: true, opacity: 0.7 });
const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), groundMat);
ground.receiveShadow = true;
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const grid = new THREE.GridHelper(60, 60, 0x33547e, 0x1a2a40);
grid.position.y = -0.01;
scene.add(grid);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const state = {
  version: '1.4.0',
  env: 'moon',
  crewN: 2,
  view: 'orbital',
  floor: 1,
  shell: { radius: 5, length: 12, floors: 3, gap: 2.5 },
  items: [],
  selId: null,
  history: [],
  redo: []
};
let nextId = 1;

const moduleVisuals = new Map();
let shellGroup = null;

const ENV_PRESETS = {
  moon: { background: 0x050a16, ground: 0x0f1a32, light: 0x96c0ff },
  mars: { background: 0x1b0d08, ground: 0x23100d, light: 0xffb48a }
};

const MODULES = [
  { key: 'sleep', name: 'Sueño (crew quarters)', nhv: 4, mass: 100, color: '#6aa7ff' },
  { key: 'hygiene', name: 'Higiene + UWMS', nhv: 6, mass: 180, color: '#6ed4ff' },
  { key: 'galley', name: 'Galley + Mesa común', nhv: 8, mass: 160, color: '#62e6b9' },
  { key: 'ops', name: 'Trabajo / Comando crítico', nhv: 6, mass: 150, color: '#8cf0a7' },
  { key: 'med', name: 'Médico', nhv: 5, mass: 140, color: '#ffd166' },
  { key: 'ex', name: 'Ejercicio', nhv: 10, mass: 200, color: '#f6a4ff' },
  { key: 'store', name: 'Estiba (Storage)', nhv: 12, mass: 120, color: '#c3dafe' },
  { key: 'eclss', name: 'ECLSS (Life Support)', nhv: 15, mass: 300, color: '#fff1a8' },
  { key: 'airlock', name: 'Airlock', nhv: 7, mass: 220, color: '#ffa3a3' },
  { key: 'stairs', name: 'Escalera', nhv: 0, mass: 50, color: '#a3ffd1', sys: true },
  { key: 'corr', name: 'Pasillo', nhv: 0, mass: 10, color: '#9aa8ff', sys: true }
];

const CAP_DEFAULTS = {
  sleep: 1,
  hygiene: 3,
  galley: 4,
  ops: 4,
  med: 6,
  ex: 3,
  store: 4,
  eclss: 4,
  airlock: 4
};

const CAP_INFO = {
  sleep: { base: 'min. recomendado NASA', infl: 'NHV, Riesgo bajo, Energía baja', rule: '1 módulo por tripulante (ajust.)' },
  hygiene: { base: 'min. recomendado NASA', infl: 'H2O, Riesgo, NHV', rule: '1 módulo cada ~3 trip.' },
  galley: { base: 'min. recomendado NASA', infl: 'Energía, NHV', rule: '1 módulo cada ~4 trip.' },
  ops: { base: 'min. recomendado NASA', infl: 'Energía, Riesgo', rule: '1 módulo cada ~4 trip.' },
  med: { base: 'min. recomendado NASA', infl: 'Riesgo, NHV', rule: '1 módulo cada ~6 trip.' },
  ex: { base: 'min. recomendado NASA', infl: 'Energía, NHV, Riesgo', rule: '1 módulo cada ~3 trip.' },
  store: { base: 'min. recomendado NASA', infl: 'Masa, NHV', rule: 'Depende de duración; base 1 c/4 trip.' },
  eclss: { base: 'min. recomendado NASA', infl: 'O2, H2O, CO2, Energía', rule: '1 módulo c/ ~4 trip.' },
  airlock: { base: 'min. recomendado NASA', infl: 'Riesgo, Energía', rule: '1 módulo cada ~4 trip.' }
};

const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const moduleHeight = () => Math.max(1.2, state.shell.gap * 0.72);
const floorSpan = () => (state.shell.floors <= 1 ? 0 : state.shell.gap * (state.shell.floors - 1));
const floorCenterY = (floor) => {
  const span = floorSpan();
  return span === 0 ? 0 : -span / 2 + (floor - 1) * state.shell.gap;
};

function shortName(name) {
  return name.split('(')[0].trim();
}

function getColor(key) {
  const m = MODULES.find((x) => x.key === key);
  return m ? m.color : '#4aa3ff';
}

function normalizeItem(it) {
  it.floor = clamp(it.floor || 1, 1, state.shell.floors);
  it.w = clamp(it.w || 2, 0.6, state.shell.radius * 1.9);
  it.h = clamp(it.h || 2, 0.6, Math.max(1, state.shell.length - 0.2));
  it.x = clamp(it.x || 0, 0, state.shell.radius * 2 - it.w);
  it.y = clamp(it.y || 0, 0, state.shell.length - it.h);
  if (Number.isNaN(it.rot)) it.rot = 0;
  if (typeof it.locked !== 'boolean') it.locked = false;
}

function moduleScenePosition(it) {
  const x = it.x + it.w / 2 - state.shell.radius;
  const z = it.y + it.h / 2 - state.shell.length / 2;
  const y = floorCenterY(it.floor);
  return { x, y, z };
}

function moduleSceneRotation(it) {
  return THREE.MathUtils.degToRad(it.rot || 0);
}

function mountModuleList() {
  const list = $('#modList');
  list.innerHTML = '';
  MODULES.forEach((m) => {
    const row = document.createElement('div');
    row.className = 'item';
    row.dataset.key = m.key;
    row.innerHTML = `<span>${m.name} <small style="opacity:.7">(NHV_ref ${m.nhv} m²)</small></span>`;
    row.onclick = () => insertModule(m.key, true);
    list.appendChild(row);
  });
}

function syncShellInputs() {
  $('#inpR').value = state.shell.radius;
  $('#inpL').value = state.shell.length;
  $('#inpFloors').value = state.shell.floors;
  $('#inpGap').value = state.shell.gap;
}

function rebuildFloorOptions() {
  const sel = $('#floorSel');
  const cur = state.floor;
  sel.innerHTML = '';
  for (let i = 1; i <= state.shell.floors; i++) {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = i;
    sel.appendChild(o);
  }
  sel.value = Math.min(cur, state.shell.floors);
  state.floor = parseInt(sel.value, 10);
  updateFloorBadge();
}

function updateFloorBadge() {
  $('#floorBadge').textContent = `Piso activo: ${state.floor}`;
}

function insertModule(key, center = true) {
  const def = MODULES.find((m) => m.key === key);
  if (!def) return;
  const size = Math.max(2, Math.sqrt(def.nhv) || 2);
  const it = {
    id: nextId++,
    key,
    name: def.name,
    floor: state.floor,
    x: state.shell.radius - size / 2,
    y: state.shell.length / 2 - size / 2,
    w: size,
    h: size,
    rot: 0,
    locked: false
  };
  if (key === 'corr') { it.w = 1.2; it.h = 4; }
  if (key === 'stairs') { it.w = 2; it.h = 2; }
  if (!center) {
    it.x = clamp(it.x, 0, state.shell.radius * 2 - it.w);
    it.y = clamp(it.y, 0, state.shell.length - it.h);
  }
  normalizeItem(it);
  state.items.push(it);
  selectItem(it.id);
  refreshModules3D();
  pushHistory();
  updateProp();
  updateScore();
}

function removeSelected() {
  if (state.selId == null) return;
  const before = state.items.length;
  state.items = state.items.filter((it) => it.id !== state.selId);
  if (state.items.length !== before) {
    selectItem(null);
    refreshModules3D();
    pushHistory();
    updateScore();
  }
}

function createLabelTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(15,33,64,0.82)';
  ctx.strokeStyle = 'rgba(74,130,192,0.95)';
  ctx.lineWidth = 6;
  drawRoundRect(ctx, 20, 24, canvas.width - 40, canvas.height - 48, 26, true, true);
  ctx.fillStyle = '#d9ecff';
  ctx.font = 'bold 40px "Segoe UI", system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy() || 1;
  texture.needsUpdate = true;
  return texture;
}

function drawRoundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function createModuleVisual(it) {
  const group = new THREE.Group();
  group.userData.itemId = it.id;

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(getColor(it.key)), roughness: 0.45, metalness: 0.08, emissive: 0x000000, emissiveIntensity: 0.6 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0x1d3355 }));
  mesh.add(edges);

  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: createLabelTexture(shortName(it.name)), transparent: true }));
  label.scale.set(3, 1.2, 1);
  label.position.y = 1.2;

  group.add(mesh);
  group.add(label);
  scene.add(group);

  return { group, mesh, edges, label };
}

function updateModuleVisual(it, visual) {
  normalizeItem(it);
  const height = moduleHeight();
  const width = Math.max(0.5, it.w);
  const depth = Math.max(0.5, it.h);

  const newGeometry = new THREE.BoxGeometry(width, height, depth);
  visual.mesh.geometry.dispose();
  visual.mesh.geometry = newGeometry;
  visual.edges.geometry.dispose();
  visual.edges.geometry = new THREE.EdgesGeometry(newGeometry);

  const mat = visual.mesh.material;
  mat.color.set(getColor(it.key));
  const activeFloor = it.floor === state.floor;
  mat.opacity = activeFloor ? 0.96 : 0.22;
  mat.transparent = !activeFloor;
  mat.needsUpdate = true;

  visual.edges.visible = activeFloor;
  visual.label.visible = activeFloor || state.selId === it.id;
  if (visual.label.visible) {
    const tex = createLabelTexture(`P${it.floor} · ${shortName(it.name)}`);
    visual.label.material.map.dispose();
    visual.label.material.map = tex;
    visual.label.material.needsUpdate = true;
    const scaleX = clamp(width * 0.9, 2.2, 4.2);
    visual.label.scale.set(scaleX, scaleX * 0.4, 1);
    visual.label.position.y = height / 2 + 0.6;
  }

  const pos = moduleScenePosition(it);
  visual.group.position.set(pos.x, pos.y, pos.z);
  visual.group.rotation.set(0, moduleSceneRotation(it), 0);
}

function disposeVisual(visual) {
  scene.remove(visual.group);
  visual.mesh.geometry.dispose();
  visual.mesh.material.dispose();
  visual.edges.geometry.dispose();
  visual.edges.material.dispose();
  if (visual.label.material.map) visual.label.material.map.dispose();
  visual.label.material.dispose();
}

function refreshModules3D(force = false) {
  if (force) {
    moduleVisuals.forEach(disposeVisual);
    moduleVisuals.clear();
  }
  const ids = new Set(state.items.map((i) => i.id));
  for (const [id, visual] of moduleVisuals.entries()) {
    if (!ids.has(id)) {
      disposeVisual(visual);
      moduleVisuals.delete(id);
    }
  }
  for (const it of state.items) {
    let visual = moduleVisuals.get(it.id);
    if (!visual) {
      visual = createModuleVisual(it);
      moduleVisuals.set(it.id, visual);
    }
    updateModuleVisual(it, visual);
  }
  updateSelectionVisual();
}

function refreshShell() {
  if (shellGroup) {
    scene.remove(shellGroup);
    shellGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    shellGroup = null;
  }
  shellGroup = new THREE.Group();
  const radius = state.shell.radius;
  const length = state.shell.length;
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a3258, transparent: true, opacity: 0.18, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.1 });

  const cylGeo = new THREE.CylinderGeometry(radius, radius, length, 48, 1, true);
  const cyl = new THREE.Mesh(cylGeo, bodyMat);
  cyl.rotation.x = Math.PI / 2;
  cyl.receiveShadow = true;
  shellGroup.add(cyl);

  const capGeo = new THREE.SphereGeometry(radius, 48, 32, 0, Math.PI * 2, 0, Math.PI / 2);
  const capFront = new THREE.Mesh(capGeo, bodyMat.clone());
  capFront.position.z = length / 2;
  capFront.rotation.x = Math.PI / 2;
  shellGroup.add(capFront);
  const capBack = new THREE.Mesh(capGeo, bodyMat.clone());
  capBack.position.z = -length / 2;
  capBack.rotation.x = -Math.PI / 2;
  shellGroup.add(capBack);

  const floorMat = new THREE.MeshBasicMaterial({ color: 0x243f6b, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
  for (let i = 1; i <= state.shell.floors; i++) {
    const planeGeo = new THREE.PlaneGeometry(radius * 2, length, 1, 1);
    const plane = new THREE.Mesh(planeGeo, floorMat.clone());
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = floorCenterY(i);
    shellGroup.add(plane);
  }

  scene.add(shellGroup);
}

function updateSelectionVisual() {
  let target = null;
  for (const [id, visual] of moduleVisuals.entries()) {
    const it = state.items.find((x) => x.id === id);
    if (!it) continue;
    const selected = id === state.selId;
    visual.mesh.material.emissive.setHex(selected ? 0x2b6cf0 : 0x000000);
    visual.mesh.material.emissiveIntensity = selected ? 0.85 : 0.35;
    visual.edges.material.color.setHex(selected ? 0xaad2ff : 0x1d3355);
    if (selected && !it.locked) target = visual.group;
  }
  if (target) {
    transform.visible = true;
    transform.attach(target);
  } else {
    transform.visible = false;
    transform.detach();
  }
}

function applyEnvironment() {
  const preset = ENV_PRESETS[state.env] || ENV_PRESETS.moon;
  scene.background = new THREE.Color(preset.background);
  ground.material.color.setHex(preset.ground);
  dirLight.color.setHex(preset.light);
}

function selectItem(id) {
  state.selId = id;
  updateSelectionVisual();
  updateProp();
}

function currentSel() {
  return state.items.find((i) => i.id === state.selId) || null;
}

function updateProp() {
  const box = $('#propBox');
  const it = currentSel();
  if (!it) {
    box.innerHTML = '<div class="hint">Seleccioná un módulo…</div>';
    return;
  }
  box.innerHTML = `
    <div class="kv"><div>Nombre</div><input class="ro" value="${it.name}" readonly></div>
    <div class="kv"><div>Piso</div><input id="pFloor" type="number" min="1" max="${state.shell.floors}" value="${it.floor}"></div>
    <div class="kv"><div>X (m)</div><input id="pX" type="number" step="0.1" value="${it.x.toFixed(2)}"></div>
    <div class="kv"><div>Z (m)</div><input id="pY" type="number" step="0.1" value="${it.y.toFixed(2)}"></div>
    <div class="kv"><div>Ancho X (m)</div><input id="pW" type="number" step="0.1" value="${it.w.toFixed(2)}"></div>
    <div class="kv"><div>Largo Z (m)</div><input id="pH" type="number" step="0.1" value="${it.h.toFixed(2)}"></div>
    <div class="kv"><div>Rotación (°)</div><input id="pR" type="number" step="1" value="${(it.rot || 0).toFixed(0)}"></div>
    <div class="kv"><div>Bloqueado</div><input id="pLock" type="checkbox" ${it.locked ? 'checked' : ''}></div>
  `;
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.onchange = (e) => {
      fn(e);
      refreshModules3D();
      pushHistory();
      updateProp();
      updateScore();
    };
  };
  bind('pFloor', (e) => { it.floor = clamp(parseInt(e.target.value, 10) || it.floor, 1, state.shell.floors); });
  bind('pX', (e) => { it.x = parseFloat(e.target.value || it.x); });
  bind('pY', (e) => { it.y = parseFloat(e.target.value || it.y); });
  bind('pW', (e) => { it.w = Math.max(0.5, parseFloat(e.target.value || it.w)); });
  bind('pH', (e) => { it.h = Math.max(0.5, parseFloat(e.target.value || it.h)); });
  bind('pR', (e) => { it.rot = parseFloat(e.target.value || it.rot); });
  bind('pLock', (e) => { it.locked = e.target.checked; });
}

function collides(A) {
  const a = { x: A.x, y: A.y, w: A.w, h: A.h, f: A.floor };
  for (const B of state.items) {
    if (B.id === A.id || B.floor !== A.floor) continue;
    const b = { x: B.x, y: B.y, w: B.w, h: B.h };
    if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) return true;
  }
  if (a.x < 0 || a.y < 0 || a.x + a.w > state.shell.radius * 2 || a.y + a.h > state.shell.length) return true;
  return false;
}

function updateScore() {
  let collisions = 0;
  for (const it of state.items.filter((i) => i.floor === state.floor)) {
    if (collides(it)) collisions++;
  }
  const base = Math.max(0, 0.6 - Math.min(1, collisions * 0.08));
  const design = Math.max(0, Math.min(100, base * 100));
  const surv = computeSurvivalFactor();
  const final = +(design * surv).toFixed(1);
  $('#scColl').textContent = collisions.toFixed(2);
  $('#scAdj').textContent = (1 - collisions * 0.05).toFixed(2);
  $('#scMass').textContent = state.items.reduce((s, i) => s + (MODULES.find((m) => m.key === i.key)?.mass || 0), 0);
  $('#scoreDesign').textContent = design.toFixed(1);
  $('#scoreSurv').textContent = surv.toFixed(2);
  $('#scoreFinal').textContent = final.toFixed(1);
}

function computeSurvivalFactor() {
  const N = state.crewN;
  const counts = (key) => state.items.filter((i) => i.key === key).length;
  const needs = [
    ['sleep', 'Sueño'],
    ['hygiene', 'Higiene'],
    ['galley', 'Alimentación'],
    ['eclss', 'ECLSS'],
    ['airlock', 'Airlock']
  ].map(([k, lab]) => {
    const cap = CAP_DEFAULTS[k] || Infinity;
    const req = cap === 0 ? 0 : Math.ceil(N / cap);
    const have = counts(k);
    const ok = req === 0 ? 1 : have / req;
    return { key: k, label: lab, req, have, ok: Math.min(1, ok) };
  });
  const surv = needs.reduce((m, n) => Math.min(m, n.ok), 1);
  computeSurvivalFactor._lastNeeds = needs;
  return surv;
}

function openSimulation() {
  const needs = computeSurvivalFactor._lastNeeds || (computeSurvivalFactor(), computeSurvivalFactor._lastNeeds);
  const days = needs.some((n) => n.ok < 1) ? 0 : 30;
  const sugg = needs.filter((n) => n.ok < 1).map((n) => `Falta ${n.req - n.have} × ${n.label} (req=${n.req} para N=${state.crewN})`);
  const html = `
    <div class="sim-grid">
      <div class="callout">
        <div class="kpi"><b>Días estimados:</b> ${days}</div>
        <div><b>Supervivencia (0–1):</b> ${computeSurvivalFactor().toFixed(2)}</div>
        <div><b>N tripulantes:</b> ${state.crewN}</div>
      </div>
      <div class="callout">
        <b>Estado por función</b>
        <ul>
          ${needs.map((n) => `<li class="${n.ok < 1 ? 'bad' : 'good'}">${n.label}: ${n.have}/${n.req}</li>`).join('')}
        </ul>
      </div>
      <div class="callout" style="grid-column:1/3">
        <b>Sugerencias</b>
        <ul>
          ${sugg.length ? sugg.map((s) => `<li>${s}</li>`).join('') : '<li>Todo cubierto para misión corta (30 días).</li>'}
        </ul>
      </div>
    </div>`;
  $('#simContent').innerHTML = html;
  $('#simModal').classList.add('show');
}

$('#closeSim').onclick = () => $('#simModal').classList.remove('show');

$('#btnGuide').onclick = () => {
  mountCapTable();
  $('#guideModal').classList.add('show');
};
$('#closeGuide').onclick = () => $('#guideModal').classList.remove('show');
$$('.tap').forEach((b) => {
  b.onclick = () => {
    $$('.tap').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    const t = b.dataset.t;
    $('#tabA').style.display = t === 'a' ? 'block' : 'none';
    $('#tabB').style.display = t === 'b' ? 'block' : 'none';
    $('#tabC').style.display = t === 'c' ? 'block' : 'none';
  };
});

function mountCapTable() {
  $('#capN').textContent = state.crewN;
  const tb = $('#capTable tbody');
  tb.innerHTML = '';
  ['sleep', 'hygiene', 'galley', 'ops', 'med', 'ex', 'store', 'eclss', 'airlock'].forEach((k) => {
    const m = MODULES.find((x) => x.key === k);
    const tr = document.createElement('tr');
    tr.dataset.key = k;
    tr.innerHTML = `
      <td>${m.name}</td>
      <td>${CAP_INFO[k].base}</td>
      <td><input type="number" step="0.1" value="${CAP_DEFAULTS[k]}" style="width:90px"></td>
      <td class="rec"></td>
      <td>${CAP_INFO[k].infl}</td>
      <td>${CAP_INFO[k].rule}</td>`;
    tb.appendChild(tr);
  });
  recalcCaps();
  tb.querySelectorAll('input').forEach((i) => (i.onchange = recalcCaps));
}

function recalcCaps() {
  const N = state.crewN;
  const tb = $('#capTable tbody');
  tb.querySelectorAll('tr').forEach((tr) => {
    const k = tr.dataset.key;
    const cap = parseFloat(tr.querySelector('input').value || CAP_DEFAULTS[k]);
    const r = cap <= 0 ? 0 : Math.ceil(N / cap);
    tr.querySelector('.rec').textContent = r;
  });
}

$('#btnResetCaps').onclick = mountCapTable;
$('#btnApplyCaps').onclick = () => {
  const tb = $('#capTable tbody');
  tb.querySelectorAll('tr').forEach((tr) => {
    const k = tr.dataset.key;
    const r = parseInt(tr.querySelector('.rec').textContent || '0', 10);
    const cur = state.items.filter((i) => i.key === k).length;
    for (let i = cur; i < r; i++) insertModule(k, false);
  });
  $('#guideModal').classList.remove('show');
  refreshModules3D();
};

function exportState() {
  return {
    version: state.version,
    env: state.env,
    crewN: state.crewN,
    view: state.view,
    floor: state.floor,
    shell: { ...state.shell },
    items: state.items.map((it) => ({ ...it }))
  };
}

function importState(obj) {
  state.env = obj.env || state.env;
  state.crewN = obj.crewN || state.crewN;
  state.view = obj.view || 'orbital';
  state.floor = obj.floor || 1;
  state.shell = { ...state.shell, ...(obj.shell || {}) };
  state.items = (obj.items || []).map((it) => ({ ...it }));
  if (!state.items.every((it) => typeof it.id === 'number')) {
    state.items.forEach((it, idx) => { it.id = idx + 1; });
  }
  nextId = state.items.reduce((m, it) => Math.max(m, it.id), 0) + 1;
  state.selId = null;
  syncShellInputs();
  rebuildFloorOptions();
  snapAllItems();
  refreshShell();
  refreshModules3D(true);
  applyEnvironment();
  $('#envSel').value = state.env;
  $('#crewN').value = state.crewN;
  $('#viewSel').value = state.view;
  updateScore();
  updateProp();
}

function pushHistory() {
  const snap = JSON.stringify(exportState());
  state.history.push(snap);
  if (state.history.length > 128) state.history.shift();
  state.redo.length = 0;
}

function undo() {
  if (state.history.length <= 1) return;
  const current = state.history.pop();
  state.redo.push(current);
  const prev = JSON.parse(state.history[state.history.length - 1]);
  importState(prev);
}

function redo() {
  const snap = state.redo.pop();
  if (!snap) return;
  const obj = JSON.parse(snap);
  state.history.push(JSON.stringify(obj));
  importState(obj);
}

function snapAllItems() {
  state.items.forEach((it) => {
    normalizeItem(it);
  });
}

function applyShellChanges() {
  const radius = parseFloat($('#inpR').value) || state.shell.radius;
  const length = Math.max(4, parseFloat($('#inpL').value) || state.shell.length);
  const floors = clamp(parseInt($('#inpFloors').value, 10) || state.shell.floors, 1, 8);
  const gap = Math.max(1, parseFloat($('#inpGap').value) || state.shell.gap);
  state.shell = { radius, length, floors, gap };
  state.floor = clamp(state.floor, 1, floors);
  rebuildFloorOptions();
  snapAllItems();
  refreshShell();
  refreshModules3D();
  setCameraMode(state.view);
  updateScore();
  pushHistory();
}

['inpR', 'inpL', 'inpFloors', 'inpGap'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', applyShellChanges);
});
$('#btnShellApply').onclick = applyShellChanges;

function syncTransformToState() {
  const obj = transform.object;
  if (!obj) return;
  const id = obj.userData.itemId;
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  const pos = obj.position;
  const rot = obj.rotation;
  const baseY = floorCenterY(it.floor);
  pos.y = baseY;
  it.x = pos.x + state.shell.radius - it.w / 2;
  it.y = pos.z + state.shell.length / 2 - it.h / 2;
  it.rot = THREE.MathUtils.radToDeg(rot.y);
  normalizeItem(it);
  const corrected = moduleScenePosition(it);
  obj.position.set(corrected.x, corrected.y, corrected.z);
  obj.rotation.set(0, moduleSceneRotation(it), 0);
  refreshModules3D();
  updateProp();
  updateScore();
}

function setCameraMode(mode) {
  state.view = mode;
  const dist = Math.max(state.shell.radius * 3, state.shell.length * 1.1, 12);
  if (mode === 'orbital') {
    orbit.enabled = true;
    orbit.enableRotate = true;
    orbit.enablePan = true;
    orbit.minPolarAngle = 0.1;
    orbit.maxPolarAngle = Math.PI - 0.1;
  } else {
    orbit.enabled = true;
    orbit.enableRotate = false;
    orbit.enablePan = false;
    if (mode === 'top') {
      camera.position.set(0, dist, 0.01);
    } else if (mode === 'front') {
      camera.position.set(0, dist * 0.55, dist);
    } else if (mode === 'side') {
      camera.position.set(dist, dist * 0.55, 0);
    }
    camera.lookAt(0, 0, 0);
  }
  orbit.update();
}

$('#viewSel').addEventListener('change', (e) => {
  setCameraMode(e.target.value);
});

$('#floorSel').addEventListener('change', (e) => {
  state.floor = parseInt(e.target.value, 10) || 1;
  updateFloorBadge();
  refreshModules3D();
  updateProp();
  updateScore();
});

function onPointerDown(event) {
  if (transformDragging) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  pointer.set(x, y);
  raycaster.setFromCamera(pointer, camera);
  const groups = Array.from(moduleVisuals.values()).map((v) => v.group);
  const intersects = raycaster.intersectObjects(groups, true);
  if (intersects.length > 0) {
    const obj = intersects[0].object;
    let cur = obj;
    while (cur && !cur.userData.itemId) cur = cur.parent;
    if (cur && cur.userData.itemId) {
      selectItem(cur.userData.itemId);
      return;
    }
  }
  selectItem(null);
}

renderer.domElement.addEventListener('pointerdown', onPointerDown);

function onWindowResize() {
  const { clientWidth, clientHeight } = container;
  renderer.setSize(clientWidth, clientHeight);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', onWindowResize);

const resizeObserver = new ResizeObserver(onWindowResize);
resizeObserver.observe(container);

window.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    removeSelected();
  }
  if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    transform.setMode(transform.mode === 'translate' ? 'rotate' : 'translate');
  }
  if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  }
});

$('#btnReset').onclick = () => {
  if (!confirm('¿Seguro que deseas volver a comenzar?')) return;
  state.items = [];
  nextId = 1;
  selectItem(null);
  refreshModules3D(true);
  pushHistory();
  updateScore();
};
$('#btnUndo').onclick = undo;
$('#btnRedo').onclick = redo;

$('#btnSave').onclick = () => {
  const data = exportState();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'habitat-v140.json';
  a.click();
};

$('#btnLoad').onclick = () => $('#loadFile').click();
$('#loadFile').onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const o = JSON.parse(fr.result);
      importState(o);
      pushHistory();
    } catch (err) {
      alert('JSON inválido');
    }
  };
  fr.readAsText(f);
};

$('#crewN').addEventListener('change', (e) => {
  state.crewN = parseInt(e.target.value || state.crewN, 10);
  $('#capN').textContent = state.crewN;
  updateScore();
});

$('#envSel').addEventListener('change', (e) => {
  state.env = e.target.value;
  applyEnvironment();
  pushHistory();
});

$('#btnSim').onclick = () => openSimulation();

$('#btnScoreDetail').onclick = () => {
  alert('El score combina penalización por colisiones y factor de supervivencia. Añadí módulos clave para mejorar el puntaje.');
};

function animate() {
  requestAnimationFrame(animate);
  orbit.update();
  renderer.render(scene, camera);
}

function boot() {
  mountModuleList();
  syncShellInputs();
  rebuildFloorOptions();
  applyEnvironment();
  refreshShell();
  refreshModules3D();
  pushHistory();
  setCameraMode(state.view);
  updateScore();
  animate();
}

boot();
