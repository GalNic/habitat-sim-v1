/* V1.3.1 — NASA APP - House
   - Cascarón cilíndrico + tapas
   - Pisos y separación
   - Inserción/edición de módulos con color
   - Guardar/Cargar JSON (schema V1.3.1)
   - Simular Vida (modal) + Detalle
   - Guía/Tabla/Fuentes con capacidades nominales editables (sin “números inventados”)
*/

const pxPerM = 30; // escala de dibujo
const state = {
  version: "1.3.1",
  env: "moon",
  crew: 2,
  dirty: false,
  view: "xy",
  activeFloor: 1,
  shell: { R: 5, L: 12, floors: 3, gap: 2.5 },
  modules: [], // items {id,type,floor,x,y,w,h,rot,color,specific:{}, capacityNominal?:number}
  history: { undo: [], redo: [] },
  refs: ["Burke-ASCEND-2022","Choate-IEEE-2023","ADD-ESDMD-2024","MMPACT-AIAA"],
  // capacidades por tipo (editable por el usuario desde la Guía):
  capacities: {} // e.g. { sleep: 1, hygiene: 3, galley: 4, ... } => “n tripulantes por módulo”
};

// Catálogo de módulos (sin números duros de NASA; descripción e impacto + regla orientativa)
const ModuleCatalog = [
  {
    key: "sleep",
    name: "Sueño (crew quarters)",
    nhv_ref_m3: 4,
    color: "#3b82f6",
    desc: "Descanso y privacidad. Impacta confort/NHV y rendimiento cognitivo.",
    influence: ["NHV","Riesgo bajo","Energía baja"],
    ruleText: "Orientativo: 1 módulo por tripulante (ajustable por capacidad nominal).",
    specific: [
      { id:"berths", label:"Nº literas", type:"number", step:1, value:1, min:1 },
      { id:"privacy", label:"Privacidad", type:"select", options:["baja","media","alta"], value:"media" },
      { id:"acoustic", label:"Aislamiento acústico", type:"select", options:["bajo","medio","alto"], value:"medio" }
    ]
  },
  {
    key: "hygiene",
    name: "Higiene + UWMS",
    nhv_ref_m3: 6,
    color: "#06b6d4",
    desc: "Higiene personal y manejo de desechos (UWMS). Impacto directo en salud/riesgos biológicos y agua.",
    influence: ["H2O","Riesgo","NHV"],
    ruleText: "Orientativo: 1 módulo cada ~3 tripulantes (ajustable).",
    specific: [
      { id:"uwms_cap", label:"Capacidad UWMS (personas/día)", type:"number", step:1, value:3, min:1 },
      { id:"water_flow", label:"Caudal agua (L/d)", type:"number", step:1, value:30, min:0 }
    ]
  },
  {
    key: "galley",
    name: "Galley + Mesa común",
    nhv_ref_m3: 8,
    color: "#10b981",
    desc: "Preparación y consumo de alimentos; cohesión social.",
    influence: ["Energía","NHV"],
    ruleText: "Orientativo: 1 módulo cada ~4 tripulantes (ajustable).",
    specific: [
      { id:"seats", label:"Plazas a mesa", type:"number", step:1, value:4, min:1 }
    ]
  },
  {
    key: "work",
    name: "Trabajo / Comando crítico",
    nhv_ref_m3: 6,
    color: "#8b5cf6",
    desc: "Puestos de trabajo/teleoperación y monitoreo de sistemas.",
    influence: ["Energía","Riesgo"],
    ruleText: "Orientativo: 1 módulo cada ~4 tripulantes.",
    specific: [
      { id:"stations", label:"Puestos", type:"number", step:1, value:2, min:1 },
      { id:"redund", label:"Redundancia consolas", type:"select", options:["baja","media","alta"], value:"media" }
    ]
  },
  {
    key: "medical",
    name: "Médico",
    nhv_ref_m3: 5,
    color: "#ef4444",
    desc: "Atención básica, telemedicina, privacidad.",
    influence: ["Riesgo","NHV"],
    ruleText: "Orientativo: 1 módulo cada ~6 tripulantes.",
    specific: [
      { id:"equip_crit", label:"Equip. crítico", type:"checkbox", value:true }
    ]
  },
  {
    key: "exercise",
    name: "Ejercicio",
    nhv_ref_m3: 10,
    color: "#f59e0b",
    desc: "Mitiga pérdida muscular/ósea. Vibraciones a controlar.",
    influence: ["Energía","NHV","Riesgo"],
    ruleText: "Orientativo: 1 módulo cada ~3 tripulantes.",
    specific: [
      { id:"type", label:"Tipo", type:"select", options:["resistivo","cardio","mixto"], value:"resistivo" },
      { id:"time", label:"Tiempo diario (min)", type:"number", step:5, value:60, min:0 }
    ]
  },
  {
    key: "storage",
    name: "Estiba (Storage)",
    nhv_ref_m3: 12,
    color: "#64748b",
    desc: "Alimentos, repuestos, bagaje. Influye en masa/volumen.",
    influence: ["Masa","NHV"],
    ruleText: "Orientativo: depende de duración; base 1 c/4 tripulantes (ajustable).",
    specific: [
      { id:"food_pct", label:"% Alimentos", type:"number", step:1, value:60, min:0 },
      { id:"spares_pct", label:"% Repuestos", type:"number", step:1, value:40, min:0 }
    ]
  },
  {
    key: "eclss",
    name: "ECLSS (Life Support)",
    nhv_ref_m3: 15,
    color: "#22c55e",
    desc: "Soporte vital (O2/H2O/CO2) regenerativo o abierto.",
    influence: ["O2","H2O","CO2","Energía"],
    ruleText: "Orientativo: 1 módulo cada ~4 tripulantes (según recuperación).",
    specific: [
      { id:"o2_rec", label:"Recuperación O₂ (%)", type:"number", step:1, value:70, min:0, max:100 },
      { id:"h2o_rec", label:"Recuperación H₂O (%)", type:"number", step:1, value:80, min:0, max:100 },
      { id:"mode", label:"Modo", type:"select", options:["abierto","parcial","cerrado"], value:"parcial" }
    ]
  },
  {
    key: "airlock",
    name: "Airlock",
    nhv_ref_m3: 7,
    color: "#0ea5e9",
    desc: "Soporte EVA: ciclo presión, acceso exterior.",
    influence: ["Riesgo","Energía"],
    ruleText: "Orientativo: 1 módulo cada ~4 tripulantes.",
    specific: [
      { id:"cycle_min", label:"Tiempo ciclo (min)", type:"number", step:1, value:20, min:1 },
      { id:"suits", label:"Capacidad trajes", type:"select", options:["1","2"], value:"2" }
    ]
  }
];

// ————— Utils —————
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
function uid(){ return 'm' + Math.random().toString(36).slice(2,9); }
function markDirty(){ state.dirty = true; }
function pushHistory(){ state.history.undo.push(JSON.stringify(state)); state.history.redo.length=0; }
function clone(obj){ return JSON.parse(JSON.stringify(obj)); }

// ————— Inicialización —————
window.addEventListener('load', () => {
  // UI binds
  $('#envSelect').addEventListener('change', e=>{ state.env=e.target.value; draw(); });
  $('#crewInput').addEventListener('input', e=>{ state.crew = Math.max(1, +e.target.value||1); updateScore(); });
  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);
  $('#resetLayoutBtn').addEventListener('click', onResetLayout);
  $('#simulateBtn').addEventListener('click', openSim);
  $('#saveBtn').addEventListener('click', doSave);
  $('#loadBtn').addEventListener('click', ()=>$('#fileOpen').click());
  $('#fileOpen').addEventListener('change', doLoad);
  $('#applyShellBtn').addEventListener('click', applyShell);
  $('#detailBtn').addEventListener('click', openDetail);
  $('#helpBtn').addEventListener('click', ()=>openModal('helpModal'));

  $$('.tabBtn').forEach(b=>b.addEventListener('click', ()=>{
    $$('.tabBtn').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); state.view=b.dataset.view; draw();
  }));
  $$('.floorBtn').forEach(b=>b.addEventListener('click', ()=>{
    state.activeFloor = +b.dataset.floor; draw();
  }));
  $$('.closeModal').forEach(b=>b.addEventListener('click', ()=>closeModal(b.dataset.close)));

  // pestañas del modal de ayuda
  $$('.tab2Btn').forEach(b=>b.addEventListener('click', ()=>{
    $$('.tab2Btn').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    $$('.tab2Pane').forEach(p=>p.hidden=true);
    $('#tab-'+b.dataset.tab).hidden=false;
  }));
  $('#resetCapsBtn').addEventListener('click', ()=>{ state.capacities={}; renderHelpTable(); });
  $('#applyRecsBtn').addEventListener('click', applyRecommendations);

  // Guardar confirmación al cerrar
  window.addEventListener('beforeunload', (e)=>{
    if(state.dirty){ e.preventDefault(); e.returnValue=''; }
  });

  renderModulesList();
  renderHelpTable();
  ensureFloorButtons();
  draw();
  updateScore();
});

// ————— Render de lista de módulos —————
function renderModulesList(){
  const wrap = $('#modulesList'); wrap.innerHTML='';
  ModuleCatalog.forEach(m=>{
    const btn = document.createElement('button');
    btn.textContent = `${m.name} (NHV_ref ${m.nhv_ref_m3} m³)`;
    btn.addEventListener('click', ()=>addModuleFromCatalog(m.key));
    wrap.appendChild(btn);
  });
}

function ensureFloorButtons(){
  const N = state.shell.floors;
  const holder = document.querySelector('.floorsel');
  holder.querySelectorAll('.floorBtn').forEach(b=>b.remove());
  for(let i=1;i<=N;i++){
    const b=document.createElement('button'); b.className='floorBtn'; b.dataset.floor=i; b.textContent=String(i);
    b.addEventListener('click', ()=>{ state.activeFloor=i; draw(); });
    holder.appendChild(b);
  }
}

// ————— Agregar módulo —————
function addModuleFromCatalog(key){
  const def = ModuleCatalog.find(x=>x.key===key);
  const id = uid();
  const mod = {
    id,
    type: key,
    floor: state.activeFloor,
    x: 1 + Math.random()*2, // posición inicial simple
    y: 1 + Math.random()*2,
    w: 2.0, h: 2.0, rot: 0,
    color: def.color,
    specific: (def.specific||[]).reduce((a,p)=>{ a[p.id]=p.value; return a; },{})
  };
  pushHistory();
  state.modules.push(mod);
  state.dirty = true;
  draw();
  selectModule(id);
}

// ————— Dibujo —————
function draw(){
  const canvas = $('#viewCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);

  drawBackground(ctx);
  drawShell(ctx);
  drawModules(ctx);
}

function drawBackground(ctx){
  // Fondo por entorno con fallback
  const img = new Image();
  img.onload = ()=>{ ctx.drawImage(img, 0,0, ctx.canvas.width, ctx.canvas.height); drawShell(ctx); drawModules(ctx); };
  img.onerror = ()=>{ ctx.fillStyle = (state.env==='moon')?'#111827':'#1b263b'; ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height); };
  img.src = state.env==='moon' ? 'assets/bg_moon.jpg' : 'assets/bg_mars.jpg';
}

function toPX(m){ return m*pxPerM; }

function drawShell(ctx){
  const {R,L,floors,gap} = state.shell;
  const cx = 80, cy = 70; // márgenes
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth=2; ctx.strokeStyle='#94a3b8';

  if(state.view==='xy'){
    // círculo principal (proyección superior)
    ctx.beginPath();
    ctx.arc(toPX(R), toPX(R), toPX(R), 0, Math.PI*2);
    ctx.stroke();
    // reja/sugerencia
    ctx.setLineDash([4,4]);
    ctx.beginPath();
    ctx.moveTo(0,toPX(R)); ctx.lineTo(toPX(2*R),toPX(R));
    ctx.moveTo(toPX(R),0); ctx.lineTo(toPX(R),toPX(2*R));
    ctx.stroke(); ctx.setLineDash([]);
  } else {
    // frontal/lateral: cilindro + tapas
    const len = L, rad = R;
    const w = toPX(2*rad), h = toPX(len + 2*rad);
    // cuerpo
    ctx.strokeRect(0, toPX(rad), w, toPX(len));
    // tapas (semicírculos)
    ctx.beginPath();
    ctx.arc(toPX(rad), toPX(rad), toPX(rad), Math.PI, 0);
    ctx.moveTo(0, toPX(rad+len));
    ctx.arc(toPX(rad), toPX(rad+len), toPX(rad), 0, Math.PI);
    ctx.stroke();

    // pisos
    for(let i=1;i<=floors;i++){
      const y = toPX(rad + (i-1)*gap + 0.05); // línea fina
      ctx.setLineDash(i===state.activeFloor?[2,2]:[6,4]);
      ctx.strokeStyle = i===state.activeFloor ? '#0ea5e9' : '#cbd5e1';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.strokeStyle='#94a3b8';
  }
  ctx.restore();
}

function drawModules(ctx){
  const floor = state.activeFloor;
  for(const m of state.modules){
    if(m.floor!==floor) continue;
    // proyección simple: XY dibuja rectángulo; XZ/YZ cambia eje
    const col = m.color || '#38bdf8';
    ctx.save();
    // offset de dibujo base (igual que shell translate)
    const ox=80, oy=70;
    ctx.translate(ox,oy);

    let x=toPX(m.x), y=toPX(m.y), w=toPX(m.w), h=toPX(m.h);
    if(state.view!=='xy'){ // frontal/lateral comparten layout plano
      // usar x como horizontal y y como “altura” sobre el piso
      x=toPX(m.x); y=toPX(m.y); w=toPX(m.w); h=toPX(m.h);
    }
    ctx.translate(x,y);
    ctx.rotate(m.rot*Math.PI/180);
    ctx.fillStyle = col+"aa";
    ctx.strokeStyle = col;
    ctx.lineWidth=2;
    ctx.fillRect(0,0,w,h);
    ctx.strokeRect(0,0,w,h);

    ctx.fillStyle="#0f172a";
    ctx.font="12px system-ui";
    ctx.fillText(ModuleCatalog.find(d=>d.key===m.type).name.split(" ")[0], 4, 14);
    ctx.restore();
  }
}

// ————— Selección y propiedades —————
let selectedId = null;
$('#viewCanvas').addEventListener('click', (e)=>{
  const floor = state.activeFloor;
  const rect = e.target.getBoundingClientRect();
  const mx = (e.clientX-rect.left - 80)/pxPerM;
  const my = (e.clientY-rect.top - 70)/pxPerM;

  // hit-test simple (AABB sin rotación – suficiente V1.3.1)
  for(const m of [...state.modules].reverse()){
    if(m.floor!==floor) continue;
    if(mx>=m.x && mx<=m.x+m.w && my>=m.y && my<=m.y+m.h){
      selectModule(m.id); return;
    }
  }
  // click vacío
  selectModule(null);
});

function selectModule(id){
  selectedId = id;
  const form = $('#propsForm');
  const none = $('#noSelection');
  if(!id){ form.hidden=true; none.hidden=false; return; }

  const m = state.modules.find(x=>x.id===id);
  none.hidden=true; form.hidden=false;

  $('#p_id').value = m.id;
  $('#p_type').value = ModuleCatalog.find(x=>x.key===m.type).name;
  $('#p_floor').value = m.floor;
  $('#p_x').value = m.x;  $('#p_y').value = m.y;
  $('#p_w').value = m.w;  $('#p_h').value = m.h;
  $('#p_rot').value = m.rot;
  $('#p_color').value = m.color || '#38bdf8';

  // específicos
  const def = ModuleCatalog.find(x=>x.key===m.type);
  const box = $('#specificParams'); box.innerHTML='';
  (def.specific||[]).forEach(p=>{
    const row=document.createElement('div'); row.className='row';
    const lab=document.createElement('label'); lab.textContent=p.label;
    let inp;
    if(p.type==='select'){
      inp=document.createElement('select');
      p.options.forEach(op=>{
        const o=document.createElement('option'); o.value=op; o.textContent=op;
        inp.appendChild(o);
      });
      inp.value=m.specific[p.id];
    }else if(p.type==='checkbox'){
      inp=document.createElement('input'); inp.type='checkbox'; inp.checked=!!m.specific[p.id];
    }else{
      inp=document.createElement('input'); inp.type='number';
      if(p.step) inp.step=p.step; if(p.min!=null) inp.min=p.min; if(p.max!=null) inp.max=p.max;
      inp.value=m.specific[p.id];
    }
    inp.dataset.pid=p.id;
    row.appendChild(lab); row.appendChild(inp); box.appendChild(row);
  });

  // descripción + regla
  $('#moduleDesc').innerHTML = `<strong>Para qué sirve:</strong> ${def.desc}<br>
    <em>Influencia:</em> ${def.influence.join(", ")}<br>
    <em>Regla orientativa por tripulación:</em> ${def.ruleText}`;
}

$('#applyModuleBtn').addEventListener('click', ()=>{
  if(!selectedId) return;
  const m = state.modules.find(x=>x.id===selectedId);
  pushHistory();
  m.floor = Math.max(1, +$('#p_floor').value||1);
  m.x = +$('#p_x').value||m.x;
  m.y = +$('#p_y').value||m.y;
  m.w = Math.max(0.5, +$('#p_w').value||m.w);
  m.h = Math.max(0.5, +$('#p_h').value||m.h);
  m.rot = +$('#p_rot').value||0;
  m.color = $('#p_color').value;

  // específicos
  $$('#specificParams [data-pid]').forEach(inp=>{
    const pid = inp.dataset.pid;
    if(inp.type==='checkbox') m.specific[pid]=inp.checked;
    else if(inp.tagName==='SELECT') m.specific[pid]=inp.value;
    else m.specific[pid]=+inp.value;
  });

  markDirty(); draw(); updateScore();
});

$('#resetModuleBtn').addEventListener('click', ()=>{
  if(!selectedId) return;
  const m = state.modules.find(x=>x.id===selectedId);
  const def = ModuleCatalog.find(x=>x.key===m.type);
  pushHistory();
  m.w=2; m.h=2; m.rot=0; m.color=def.color;
  m.specific = (def.specific||[]).reduce((a,p)=>{ a[p.id]=p.value; return a; },{});
  markDirty(); draw(); selectModule(selectedId);
});

// ————— Cascarón —————
function applyShell(){
  const R = +$('#shellR').value||state.shell.R;
  const L = +$('#shellL').value||state.shell.L;
  const floors = Math.max(1, +$('#floorsN').value||state.shell.floors);
  const gap = +$('#floorGap').value||state.shell.gap;
  pushHistory();
  state.shell={R,L,floors,gap};
  ensureFloorButtons();
  draw();
  markDirty();
}

// ————— Undo/Redo —————
function undo(){
  const {undo, redo} = state.history;
  if(!undo.length) return;
  redo.push(JSON.stringify(state));
  const snap = JSON.parse(undo.pop());
  Object.keys(state).forEach(k=>delete state[k]);
  Object.assign(state, snap);
  draw(); updateScore(); selectModule(null);
}
function redo(){
  const {undo, redo} = state.history;
  if(!redo.length) return;
  undo.push(JSON.stringify(state));
  const snap = JSON.parse(redo.pop());
  Object.keys(state).forEach(k=>delete state[k]);
  Object.assign(state, snap);
  draw(); updateScore(); selectModule(null);
}

// ————— Reset layout —————
function onResetLayout(){
  if(!confirm("¿Seguro que querés volver a comenzar? Se perderán los cambios no guardados.")) return;
  pushHistory();
  state.modules=[]; state.dirty=true; draw(); updateScore(); selectModule(null);
}

// ————— Guardar/Cargar —————
function doSave(){
  const data = {
    version: state.version,
    env: state.env,
    crew: state.crew,
    shell: state.shell,
    modules: state.modules,
    refs: state.refs,
    capacities: state.capacities
  };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `habitat_project_v${state.version}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  state.dirty=false;
}

async function doLoad(e){
  const f=e.target.files[0]; if(!f) return;
  const txt = await f.text();
  const data = JSON.parse(txt);
  pushHistory();
  Object.assign(state, {
    env: data.env||'moon',
    crew: data.crew||2,
    shell: data.shell||state.shell,
    modules: data.modules||[],
    capacities: data.capacities||{},
    refs: data.refs||state.refs
  });
  ensureFloorButtons(); draw(); updateScore(); selectModule(null);
  state.dirty=false;
}

// ————— Simular y detalle —————
function updateScore(){
  // V1.3.1: cálculos sencillos/placeholder (sin inventar cifras NASA)
  const coll = 0; // AABB simplificado — no implementado en detalle aquí
  const nhvEff = "—";
  const mass = state.modules.length * 1000; // placeholder
  const days = mass>0 ? 29 : 0; // placeholder
  const fail = mass>0 ? "O₂ agotado" : "—";
  const sbase=0, svol=0.5, smass=1.0, smult=0.5;
  const sfinal = 0.0;

  $('#m_coll').textContent = coll.toFixed(2);
  $('#m_adj').textContent = "1.00";
  $('#m_nhv').textContent = nhvEff;
  $('#m_mass').textContent = mass.toFixed(0);
  $('#m_days').textContent = days;
  $('#m_fail').textContent = fail;
  $('#m_sbase').textContent = sbase.toFixed(2);
  $('#m_svol').textContent = svol.toFixed(2);
  $('#m_smass').textContent = smass.toFixed(2);
  $('#m_smult').textContent = smult.toFixed(2);
  $('#m_sfinal').textContent = sfinal.toFixed(1);
}

function openSim(){
  const el = $('#simContent');
  el.innerHTML = `
    <p><strong>Entorno:</strong> ${state.env==='moon'?'Luna Sur':'Marte'} — <strong>Tripulación:</strong> ${state.crew}</p>
    <p><strong>Módulos:</strong> ${state.modules.length}</p>
    <div class="card">
      <div><strong>Vida estimada (días):</strong> ${$('#m_days').textContent}</div>
      <div><strong>Motivo de fallo:</strong> ${$('#m_fail').textContent}</div>
      <div><strong>Score final:</strong> ${$('#m_sfinal').textContent}</div>
    </div>
    <p>En V1.4.x se agregará el modo <em>manual tipo SIMS</em>.</p>
  `;
  openModal('simModal');
}

function openDetail(){
  const box = $('#detailContent');
  box.innerHTML = `
    <p>Resumen de factores y multiplicadores (placeholder V1.3.1):</p>
    <ul>
      <li>Volumen/NHV, Masa, Adyacencias, Rutas de 1 m, ECLSS, Confort/Privacidad.</li>
      <li>La bibliografía base se documenta en la pestaña “Fuentes”.</li>
    </ul>
  `;
  openModal('detailModal');
}

function openModal(id){ $('#'+id).hidden=false; }
function closeModal(id){ $('#'+id).hidden=true; }

// ————— Guía/Tabla/Fuentes —————
function renderHelpTable(){
  const wrap = $('#helpTableWrap');
  const N = state.crew;
  // capacidades actuales (editable en tabla)
  const caps = state.capacities;

  const rows = ModuleCatalog.map(def=>{
    const cap = caps[def.key] ?? "";
    const demandText = "min. recomendado NASA (ver Fuentes)";
    // recomendación: si hay capacidad definida (n tripulantes/módulo), usamos ceil(N/cap)
    const rec = (cap && +cap>0) ? Math.ceil(N / (+cap)) : "—";
    return `
      <tr>
        <td>${def.name}</td>
        <td>${demandText}</td>
        <td><input data-cap="${def.key}" type="number" min="1" step="1" value="${cap}"></td>
        <td class="mono">${rec}</td>
        <td>${def.influence.join(", ")}</td>
        <td><em>${def.ruleText}</em></td>
      </tr>
    `;
  }).join("");

  wrap.innerHTML = `
    <table class="card" style="width:100%;border-collapse:collapse">
      <thead>
        <tr>
          <th style="text-align:left">Módulo (app)</th>
          <th style="text-align:left">Parámetro base</th>
          <th style="text-align:left">Capacidad nominal<br><small>(N tripulantes por módulo)</small></th>
          <th style="text-align:left">Recomendación<br><small>para N=${N}</small></th>
          <th style="text-align:left">Influencia</th>
          <th style="text-align:left">Regla orientativa</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  // binds
  wrap.querySelectorAll('[data-cap]').forEach(inp=>{
    inp.addEventListener('input', ()=>{
      const k = inp.dataset.cap;
      const v = inp.value ? Math.max(1, +inp.value) : "";
      if(v==="") delete state.capacities[k]; else state.capacities[k]=v;
      renderHelpTable();
    });
  });
}

function applyRecommendations(){
  // Inserta/ajusta cantidad por tipo según recomendación (solo suma; no borra)
  const needAdd = [];
  const N = state.crew;
  for(const def of ModuleCatalog){
    const cap = state.capacities[def.key];
    if(!cap || +cap<=0) continue;
    const rec = Math.ceil(N / (+cap));
    const have = state.modules.filter(m=>m.type===def.key).length;
    const toAdd = Math.max(0, rec - have);
    if(toAdd>0) needAdd.push({key:def.key, count:toAdd});
  }
  if(!needAdd.length){ alert("No hay módulos para agregar con las capacidades actuales."); return; }
  pushHistory();
  needAdd.forEach(it=>{
    for(let i=0;i<it.count;i++) addModuleFromCatalog(it.key);
  });
  markDirty(); draw(); updateScore();
}
