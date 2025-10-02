// ==============================
// V1.3.2 - Core app
// ==============================
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');

// --- Estado global ---
const state = {
  version: '1.3.2',
  view: 'top',                 // 'top' | 'front' | 'side'
  floor: 1,                    // piso activo
  ppm: 30,                     // pixels per meter (auto)
  margin: 30,                  // px
  env: 'luna_sur',
  crewN: 2,
  shell: { radius: 5, length: 12, floors: 3, gap: 2.5 }, // metros
  items: [],                   // módulos
  selId: null,                 // selección
  images: {},                  // (opcional) para sprites por módulo
  bgImg: { top: null, front: null, side: null },
  history: [], redo: []
};

// --- Definición de módulos ---
const MODULES = [
  {key:'sleep',   name:'Sueño (crew quarters)', nhv:4,  mass:100, color:'#4aa3ff'},
  {key:'hygiene', name:'Higiene + UWMS',        nhv:6,  mass:180, color:'#6ed4ff'},
  {key:'galley',  name:'Galley + Mesa común',   nhv:8,  mass:160, color:'#62e6b9'},
  {key:'ops',     name:'Trabajo / Comando crítico', nhv:6, mass:150, color:'#8cf0a7'},
  {key:'med',     name:'Médico',                nhv:5,  mass:140, color:'#ffd166'},
  {key:'ex',      name:'Ejercicio',             nhv:10, mass:200, color:'#f6a4ff'},
  {key:'store',   name:'Estiba (Storage)',      nhv:12, mass:120, color:'#c3dafe'},
  {key:'eclss',   name:'ECLSS (Life Support)',  nhv:15, mass:300, color:'#fff1a8'},
  {key:'airlock', name:'Airlock',               nhv:7,  mass:220, color:'#ffa3a3'},
  {key:'stairs',  name:'Escalera',              nhv:0,  mass:50,  color:'#a3ffd1', sys:true},
  {key:'corr',    name:'Pasillo',               nhv:0,  mass:10,  color:'#9aa8ff', sys:true}
];

// Capacidad nominal por defecto (N tripulantes por módulo)
const CAP_DEFAULTS = {
  sleep: 1,
  hygiene: 3,
  galley: 4,
  ops: 4,
  med: 6,
  ex: 3,
  store: 4,      // 1 módulo cada 4 tripulantes
  eclss: 4,
  airlock: 4
};
const CAP_INFO = {
  sleep:{base:'min. recomendado NASA',infl:'NHV, Riesgo bajo, Energía baja',rule:'1 módulo por tripulante (ajust.)'},
  hygiene:{base:'min. recomendado NASA',infl:'H2O, Riesgo, NHV',rule:'1 módulo cada ~3 trip.'},
  galley:{base:'min. recomendado NASA',infl:'Energía, NHV',rule:'1 módulo cada ~4 trip.'},
  ops:{base:'min. recomendado NASA',infl:'Energía, Riesgo',rule:'1 módulo cada ~4 trip.'},
  med:{base:'min. recomendado NASA',infl:'Riesgo, NHV',rule:'1 módulo cada ~6 trip.'},
  ex:{base:'min. recomendado NASA',infl:'Energía, NHV, Riesgo',rule:'1 módulo cada ~3 trip.'},
  store:{base:'min. recomendado NASA',infl:'Masa, NHV',rule:'Depende de duración; base 1 c/4 trip.'},
  eclss:{base:'min. recomendado NASA',infl:'O2, H2O, CO2, Energía',rule:'1 módulo c/ ~4 trip. (según recuperación)'},
  airlock:{base:'min. recomendado NASA',infl:'Riesgo, Energía',rule:'1 módulo cada ~4 trip.'}
};

// --- Helpers ---
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rad=(d)=>d*Math.PI/180;
const deg=(r)=>r*180/Math.PI;
const m2p = (m)=> m*state.ppm;
const p2m = (p)=> p/state.ppm;
const hex2rgba=(hex,a)=>{const h=hex.replace('#','');const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);return `rgba(${r},${g},${b},${a})`;};
const shortName=(n)=>n.split('(')[0].trim();
let nextId=1;

// --- UI & eventos básicos ---
const $ = (q)=>document.querySelector(q);
const $$ = (q)=>document.querySelectorAll(q);

function mountModuleList(){
  const list = $('#modList'); list.innerHTML='';
  MODULES.forEach(m=>{
    const row=document.createElement('div');
    row.className='item';
    row.dataset.key=m.key;
    row.innerHTML=`<span>${m.name} <small style="opacity:.7">(NHV_ref ${m.nhv} m²)</small></span><span class="badge">P?</span>`;
    row.onclick=()=>insertModule(m.key,true);
    list.appendChild(row);
  });
}
mountModuleList();

function syncShellInputs(){
  $('#inpR').value=state.shell.radius;
  $('#inpL').value=state.shell.length;
  $('#inpFloors').value=state.shell.floors;
  $('#inpGap').value=state.shell.gap;
}
syncShellInputs();

['inpR','inpL','inpFloors','inpGap'].forEach(id=>{
  document.getElementById(id).addEventListener('change', ()=>{
    state.shell.radius = parseFloat($('#inpR').value||5);
    state.shell.length = parseFloat($('#inpL').value||12);
    state.shell.floors = parseInt($('#inpFloors').value||3,10);
    state.shell.gap    = parseFloat($('#inpGap').value||2.5);
    ensureStairs(); computePPM(); render();
  });
});
$('#btnShellApply').onclick=()=>{ computePPM(); render(); };

$('#btnReset').onclick=()=>{
  if(!confirm('¿Seguro que deseas volver a comenzar?')) return;
  state.items=[]; state.selId=null; ensureStairs(); pushHistory(); render();
};
$('#btnUndo').onclick=undo; $('#btnRedo').onclick=redo;

$('#btnSave').onclick=()=>{
  const data={version:state.version, env:state.env, crewN:state.crewN, shell:state.shell, items:state.items};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='habitat-v132.json'; a.click();
};
$('#btnLoad').onclick=()=>$('#loadFile').click();
$('#loadFile').onchange=(e)=>{
  const f=e.target.files[0]; if(!f) return;
  const fr=new FileReader();
  fr.onload=()=>{
    try{
      const o=JSON.parse(fr.result);
      state.env=o.env||'luna_sur'; state.crewN=o.crewN||2; state.shell=o.shell||state.shell; state.items=o.items||[];
      $('#crewN').value=state.crewN; $('#capN').textContent=state.crewN;
      ensureStairs(); computePPM(); render();
    }catch{ alert('JSON inválido'); }
  };
  fr.readAsText(f);
};

$('#crewN').onchange=(e)=>{ state.crewN=parseInt(e.target.value||2,10); $('#capN').textContent=state.crewN; };
$('#envSel').onchange=(e)=>{ state.env=e.target.value; loadBackgrounds().then(render); };
$('#btnSim').onclick=()=>alert('Simulación de vida (placeholder)');

$$('.views .tab').forEach(b=>b.onclick=()=>{ $$('.views .tab').forEach(x=>x.classList.remove('active')); b.classList.add('active'); state.view=b.dataset.v; computePPM(); render(); });
$$('.floors .tab').forEach(b=>b.onclick=()=>{ $$('.floors .tab').forEach(x=>x.classList.remove('active')); b.classList.add('active'); state.floor=parseInt(b.dataset.f,10); $('#floorBadge').textContent=`Piso activo: ${state.floor}`; render(); });

// --- Undo/Redo ---
function pushHistory(){
  state.history.push(JSON.stringify({items:state.items, shell:state.shell, floor:state.floor, view:state.view}));
  state.redo.length=0;
}
function undo(){ const s=state.history.pop(); if(!s) return;
  state.redo.push(JSON.stringify({items:state.items, shell:state.shell, floor:state.floor, view:state.view}));
  const o=JSON.parse(s); state.items=o.items; state.shell=o.shell; state.floor=o.floor; state.view=o.view; render(); }
function redo(){ const s=state.redo.pop(); if(!s) return;
  state.history.push(JSON.stringify({items:state.items, shell:state.shell, floor:state.floor, view:state.view}));
  const o=JSON.parse(s); state.items=o.items; state.shell=o.shell; state.floor=o.floor; state.view=o.view; render(); }

// --- Backgrounds (50% alpha) ---
const ASSET_ROOT='assets';
const asset=(p)=>`${ASSET_ROOT}/${p}`;
function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; }); }
async function loadBackgrounds(){
  try{ state.bgImg.top   = await loadImg(asset(`backgrounds/${state.env}/top.jpg`)); }catch{}
  try{ state.bgImg.front = await loadImg(asset(`backgrounds/${state.env}/front.jpg`)); }catch{}
  try{ state.bgImg.side  = await loadImg(asset(`backgrounds/${state.env}/side.jpg`)); }catch{}
}
loadBackgrounds();

// --- Escala automática por vista ---
function computePPM(){
  const M=state.margin;
  let w_m,h_m;
  const R=state.shell.radius, L=state.shell.length;
  if(state.view==='top'){ w_m=R*2; h_m=L; }
  else if(state.view==='front'){ w_m=R*2; h_m=R*2; }
  else { w_m=R*2; h_m=L+R*2; }
  const sx=(cv.width - M*2)/w_m;
  const sy=(cv.height- M*2)/h_m;
  state.ppm=Math.max(10, Math.floor(Math.min(sx,sy)));
}

// --- Centro válido por vista ---
function viewCenter(){
  const R=state.shell.radius, L=state.shell.length;
  if(state.view==='top')   return {x:R, y:L/2};
  if(state.view==='front') return {x:R, y:R};
  return {x:R, y:R + L/2}; // side
}

// --- Inserción de módulos ---
function insertModule(key,center=true){
  const def=MODULES.find(m=>m.key===key); if(!def) return;
  const sz=Math.max(2, Math.sqrt(def.nhv)||2);
  const it={id:nextId++, key, name:def.name, floor:state.floor, x:0, y:0, w:sz, h:sz, rot:0, locked:false};
  if(key==='corr'){ it.w=1.2; it.h=4; }
  if(key==='stairs'){ it.w=2; it.h=2; it.stairs=true; }
  if(center){ const c=viewCenter(); it.x=c.x-it.w/2; it.y=c.y-it.h/2; }
  state.items.push(it); state.selId=it.id; pushHistory(); render();
}

// Escalera obligatoria si hay +1 piso
function ensureStairs(){
  if(state.shell.floors<=1) return;
  const has = state.items.some(i=>i.key==='stairs');
  if(!has){ const c=viewCenter(); state.items.push({id:nextId++, key:'stairs', name:'Escalera', floor:1, x:c.x-1, y:c.y-1, w:2, h:2, rot:0, locked:false, stairs:true}); }
}

// --- Dibujo ---
function drawBackground(){
  const k=state.view, img=state.bgImg[k]; if(!img) return;
  ctx.save(); ctx.globalAlpha=.5;
  const rC=cv.width/cv.height, rI=img.width/img.height;
  let w=cv.width,h=cv.height,x=0,y=0;
  if(rI>rC){ h=cv.height; w=h*rI; x=(cv.width-w)/2; } else { w=cv.width; h=w/rI; y=(cv.height-h)/2; }
  ctx.drawImage(img,x,y,w,h); ctx.restore();
}
function drawShell(){
  ctx.save();
  ctx.strokeStyle='rgba(80,120,200,0.9)'; ctx.lineWidth=2;
  const R=m2p(state.shell.radius), L=m2p(state.shell.length), cx=cv.width/2;
  if(state.view==='top'){
    const w=R*2, h=L, left=cx-R, top=(cv.height-h)/2;
    ctx.strokeRect(left,top,w,h);
  }else if(state.view==='front'){
    const w=R*2, h=R*2, left=cx-R, top=(cv.height-h)/2;
    ctx.strokeRect(left,top,w,h);
    const gap=m2p(state.shell.gap); ctx.setLineDash([6,6]); ctx.strokeStyle='rgba(80,120,200,0.55)';
    for(let i=1;i<state.shell.floors;i++){ const y=top+i*gap; if(y<top+h-1){ ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(left+w,y); ctx.stroke(); } }
    ctx.setLineDash([]);
  }else{
    const h=L+R*2, top=(cv.height-h)/2, left=cx-R, right=cx+R;
    ctx.beginPath(); ctx.arc(cx, top+R, R, Math.PI, 0,false); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(left,top+R); ctx.lineTo(left,top+R+L); ctx.moveTo(right,top+R); ctx.lineTo(right,top+R+L); ctx.stroke();
    const gap=m2p(state.shell.gap); ctx.setLineDash([6,6]); ctx.strokeStyle='rgba(80,120,200,0.55)';
    for(let i=1;i<state.shell.floors;i++){ const y=top+R+i*gap; if(y<top+R+L-1){ ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(right,y); ctx.stroke(); } }
    ctx.setLineDash([]);
  }
  ctx.restore();
}
function drawScaleBar(){
  const base_m=5, pxLen=m2p(base_m), x0=16, y0=cv.height-28;
  ctx.save();
  ctx.strokeStyle='#ddd'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x0+pxLen,y0); ctx.stroke();
  for(let i=0;i<=base_m;i++){ const x=x0+m2p(i), h=(i%5===0)?10:6; ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,y0-h); ctx.stroke(); }
  ctx.fillStyle='#ddd'; ctx.font='12px system-ui';
  ctx.fillText(`${base_m} m`, x0+pxLen+6, y0+4);
  ctx.fillText(`Escala: 1 m = ${state.ppm} px`, x0, y0-16);
  ctx.restore();
}
function getColor(key){ const m=MODULES.find(x=>x.key===key); return m?m.color:'#4aa3ff'; }
function drawModule(it){
  const x=m2p(it.x), y=m2p(it.y), w=m2p(it.w), h=m2p(it.h);
  ctx.save();
  const cx=x+w/2, cy=y+h/2; ctx.translate(cx,cy); ctx.rotate(rad(it.rot)); ctx.translate(-cx,-cy);
  const col = collides(it) ? 'rgba(239,68,68,0.85)' : 'rgba(74,163,255,0.85)';
  ctx.fillStyle = hex2rgba(getColor(it.key), .85);
  ctx.strokeStyle = col; ctx.lineWidth=2;
  ctx.fillRect(x,y,w,h); ctx.strokeRect(x,y,w,h);
  ctx.fillStyle='#0b0f17'; ctx.font='12px system-ui'; ctx.fillText(shortName(it.name), x+6, y+14);
  // badge
  ctx.fillStyle='rgba(20,40,77,.85)'; ctx.strokeStyle='rgba(41,74,122,.9)'; ctx.lineWidth=1; const bw=34,bh=16;
  ctx.fillRect(x+w-bw-4,y+4,bw,bh); ctx.strokeRect(x+w-bw-4,y+4,bw,bh);
  ctx.fillStyle='#9fc5ff'; ctx.fillText(`P${it.floor}`, x+w-bw+8,y+16);
  ctx.restore();
  if(state.selId===it.id) drawHandles(x,y,w,h);
}
function drawHandles(x,y,w,h){
  const hs=7;
  const pts=[[x,y],[x+w/2,y],[x+w,y],[x+w,y+h/2],[x+w,y+h],[x+w/2,y+h],[x,y+h],[x,y+h/2]];
  ctx.save();
  ctx.fillStyle='#fff';
  pts.forEach(p=>{ ctx.fillRect(p[0]-hs/2,p[1]-hs/2,hs,hs); ctx.strokeStyle='#0b0f17'; ctx.strokeRect(p[0]-hs/2,p[1]-hs/2,hs,hs); });
  // centro mover
  ctx.beginPath(); ctx.arc(x+w/2,y+h/2, hs+1,0,Math.PI*2); ctx.fillStyle='#ffe08a'; ctx.fill(); ctx.strokeStyle='#0b0f17'; ctx.stroke();
  // rotar
  ctx.beginPath(); ctx.arc(x+w/2,y-18, hs,0,Math.PI*2); ctx.fillStyle='#aaf'; ctx.fill(); ctx.strokeStyle='#0b0f17'; ctx.stroke();
  ctx.restore();
}
function render(){
  ctx.clearRect(0,0,cv.width,cv.height);
  computePPM(); drawBackground(); drawShell();
  const arr=state.items.filter(i=>i.floor===state.floor);
  for(const it of arr) drawModule(it);
  drawScaleBar(); updateScore();
}

// --- Selección/Edición ---
function currentSel(){ return state.items.find(i=>i.id===state.selId); }
function itemBoxPx(it){ return {x:m2p(it.x), y:m2p(it.y), w:m2p(it.w), h:m2p(it.h)}; }
function pointInBoxPx(p, box){ const X=m2p(p.x), Y=m2p(p.y); return (X>=box.x&&X<=box.x+box.w&&Y>=box.y&&Y<=box.y+box.h); }
function getMouseM(ev){ const r=cv.getBoundingClientRect(); const x=(ev.clientX-r.left)*(cv.width/r.width); const y=(ev.clientY-r.top)*(cv.height/r.height); return {x:p2m(x), y:p2m(y)}; }
function hitHandle(p, box){
  const hs=7, rad=10; const pts=[[box.x,box.y],[box.x+box.w/2,box.y],[box.x+box.w,box.y],[box.x+box.w,box.y+box.h/2],[box.x+box.w,box.y+box.h],[box.x+box.w/2,box.y+box.h],[box.x,box.y+box.h],[box.x,box.y+box.h/2]];
  const X=m2p(p.x), Y=m2p(p.y);
  if(Math.hypot(X-(box.x+box.w/2), Y-(box.y-18))<=rad) return 'rot';
  if(Math.hypot(X-(box.x+box.w/2), Y-(box.y+box.h/2))<=rad) return 'move';
  for(let i=0;i<pts.length;i++) if(Math.abs(X-pts[i][0])<=hs && Math.abs(Y-pts[i][1])<=hs) return i;
  return null;
}

let drag=null; // {mode:'move'|'rot'|'res', idx?, offx,offy,start, startBox}
cv.addEventListener('mousedown', (e)=>{
  const pos=getMouseM(e);
  // pick
  const it = pickItem(pos); state.selId = it? it.id : null; updateProp();
  const sel=currentSel(); if(!sel){ render(); return; }
  const box=itemBoxPx(sel); const hit=hitHandle(pos, box);
  if(hit==='move'){ drag={mode:'move',offx:pos.x-sel.x, offy:pos.y-sel.y}; }
  else if(hit==='rot'){ drag={mode:'rot', start:pos}; }
  else if(typeof hit==='number'){ drag={mode:'res', idx:hit, start:pos, startBox:{x:sel.x,y:sel.y,w:sel.w,h:sel.h}}; }
  else if(pointInBoxPx(pos, box
