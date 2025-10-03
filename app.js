// Your Home in Space — V1.3.2 (moon/mars; sprites módulos en assets/modules/<clave>_<vista>.png)

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');

const state = {
  version: '1.3.2',
  view: 'top',             // 'top' | 'front' | 'side'
  floor: 1,
  ppm: 30,
  margin: 30,
  env: 'moon',             // 'moon' | 'mars'
  crewN: 2,
  shell: { radius: 5, length: 12, floors: 3, gap: 2.5 }, // m
  items: [],
  selId: null,
  images: { modules:{} },
  bgImg: { top: null, front: null, side: null },
  history: [], redo: []
};

// ---------- Catálogo ----------
const MODULES = [
  {key:'sleep',   name:'Sueño (crew quarters)', nhv:4,  mass:100, color:'#6aa7ff'},
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

// capacidad nominal (N tripulantes por módulo)
const CAP_DEFAULTS = {
  sleep: 1, hygiene: 3, galley: 4, ops: 4, med: 6, ex: 3, store: 4, eclss: 4, airlock: 4
};
const CAP_INFO = {
  sleep:{base:'min. recomendado NASA',infl:'NHV, Riesgo bajo, Energía baja',rule:'1 módulo por tripulante (ajust.)'},
  hygiene:{base:'min. recomendado NASA',infl:'H2O, Riesgo, NHV',rule:'1 módulo cada ~3 trip.'},
  galley:{base:'min. recomendado NASA',infl:'Energía, NHV',rule:'1 módulo cada ~4 trip.'},
  ops:{base:'min. recomendado NASA',infl:'Energía, Riesgo',rule:'1 módulo cada ~4 trip.'},
  med:{base:'min. recomendado NASA',infl:'Riesgo, NHV',rule:'1 módulo cada ~6 trip.'},
  ex:{base:'min. recomendado NASA',infl:'Energía, NHV, Riesgo',rule:'1 módulo cada ~3 trip.'},
  store:{base:'min. recomendado NASA',infl:'Masa, NHV',rule:'Depende de duración; base 1 c/4 trip.'},
  eclss:{base:'min. recomendado NASA',infl:'O2, H2O, CO2, Energía',rule:'1 módulo c/ ~4 trip.'},
  airlock:{base:'min. recomendado NASA',infl:'Riesgo, Energía',rule:'1 módulo cada ~4 trip.'}
};

// ---------- Helpers ----------
const $ = (q)=>document.querySelector(q);
const $$ = (q)=>document.querySelectorAll(q);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rad=(d)=>d*Math.PI/180;
const deg=(r)=>r*180/Math.PI;
const m2p=(m)=>m*state.ppm;
const p2m=(p)=>p/state.ppm;
const hex2rgba=(h,a)=>{const x=h.replace('#','');return`rgba(${parseInt(x.slice(0,2),16)},${parseInt(x.slice(2,4),16)},${parseInt(x.slice(4,6),16)},${a})`;};
const shortName=(n)=>n.split('(')[0].trim();
let nextId=1;

// ---------- UI ----------
function mountModuleList(){
  const list = $('#modList'); list.innerHTML='';
  MODULES.forEach(m=>{
    const row=document.createElement('div');
    row.className='item';
    row.dataset.key=m.key;
    row.innerHTML=`<span>${m.name} <small style="opacity:.7">(NHV_ref ${m.nhv} m²)</small></span><span></span>`;
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

function rebuildFloorOptions(){
  const sel=$('#floorSel'); const cur=state.floor;
  sel.innerHTML='';
  for(let i=1;i<=state.shell.floors;i++){
    const o=document.createElement('option'); o.value=i; o.textContent=i; sel.appendChild(o);
  }
  sel.value = Math.min(cur, state.shell.floors);
  state.floor = parseInt(sel.value,10);
  $('#floorBadge').textContent=`Piso activo: ${state.floor}`;
}
rebuildFloorOptions();

['inpR','inpL','inpFloors','inpGap'].forEach(id=>{
  document.getElementById(id).addEventListener('change', ()=>{
    state.shell.radius = parseFloat($('#inpR').value||5);
    state.shell.length = parseFloat($('#inpL').value||12);
    state.shell.floors = parseInt($('#inpFloors').value||3,10);
    state.shell.gap    = parseFloat($('#inpGap').value||2.5);
    rebuildFloorOptions();
    computePPM(); render();
  });
});
$('#btnShellApply').onclick=()=>{ rebuildFloorOptions(); computePPM(); render(); };

$('#btnReset').onclick=()=>{
  if(!confirm('¿Seguro que deseas volver a comenzar?')) return;
  state.items=[]; state.selId=null; pushHistory(); render();
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
      state.env=o.env||'moon'; state.crewN=o.crewN||2; state.shell=o.shell||state.shell; state.items=o.items||[];
      $('#envSel').value=state.env; $('#crewN').value=state.crewN; $('#capN').textContent=state.crewN;
      rebuildFloorOptions(); computePPM(); loadBackgrounds().then(render);
    }catch{ alert('JSON inválido'); }
  };
  fr.readAsText(f);
};

$('#crewN').onchange=(e)=>{ state.crewN=parseInt(e.target.value||2,10); $('#capN').textContent=state.crewN; };
$('#envSel').onchange=(e)=>{ state.env=e.target.value; loadBackgrounds().then(render); };
$('#btnSim').onclick=()=>openSimulation();

$('#viewSel').onchange=(e)=>{ state.view=e.target.value; computePPM(); render(); };
$('#floorSel').onchange=(e)=>{ state.floor=parseInt(e.target.value,10); $('#floorBadge').textContent=`Piso activo: ${state.floor}`; render(); };

// ---------- Atajos: mover/rotar/eliminar ----------
window.addEventListener('keydown',(e)=>{
  const it=currentSel();
  const step = e.shiftKey? 1.0 : 0.1;
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','r','R','Delete'].includes(e.key)) e.preventDefault();
  if(!it && e.key!=='Delete') return;
  if(e.key==='ArrowLeft')  { it.x -= step; changed(); }
  if(e.key==='ArrowRight') { it.x += step; changed(); }
  if(e.key==='ArrowUp')    { it.y -= step; changed(); }
  if(e.key==='ArrowDown')  { it.y += step; changed(); }
  if(e.key==='r' || e.key==='R'){ it.rot = (it.rot+15)%360; changed(); }
  if(e.key==='Delete' && state.selId!=null){
    state.items = state.items.filter(x=>x.id!==state.selId);
    state.selId=null; render(); pushHistory(); updateProp();
  }
  function changed(){ render(); pushHistory(); }
});

// ---------- Undo/Redo ----------
function pushHistory(){
  state.history.push(JSON.stringify({items:state.items, shell:state.shell, floor:state.floor, view:state.view}));
  state.redo.length=0;
}
function undo(){ const s=state.history.pop(); if(!s) return;
  state.redo.push(JSON.stringify({items:state.items, shell:state.shell, floor:state.floor, view:state.view}));
  const o=JSON.parse(s); state.items=o.items; state.shell=o.shell; state.floor=o.floor; state.view=o.view; $('#viewSel').value=state.view; rebuildFloorOptions(); render(); }
function redo(){ const s=state.redo.pop(); if(!s) return;
  state.history.push(JSON.stringify({items:state.items, shell:state.shell, floor:state.floor, view:state.view}));
  const o=JSON.parse(s); state.items=o.items; state.shell=o.shell; state.floor=o.floor; state.view=o.view; $('#viewSel').value=state.view; rebuildFloorOptions(); render(); }

// ---------- Assets ----------
const ASSET_ROOT='assets';
const asset=(p)=>`${ASSET_ROOT}/${p}`;
function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=()=>res(null); i.src=src; }); }
async function loadBackgrounds(){
  state.bgImg.top   = await loadImg(asset(`${state.env}/top.jpg`));
  state.bgImg.front = await loadImg(asset(`${state.env}/front.jpg`));
  state.bgImg.side  = await loadImg(asset(`${state.env}/side.jpg`));
}
async function getModuleSprite(key, view){
  const cacheKey = `${key}_${view}`;
  if(state.images.modules[cacheKey]) return state.images.modules[cacheKey];
  const img = await loadImg(asset(`modules/${cacheKey}.png`));
  if(img) state.images.modules[cacheKey] = img;
  return img || null;
}
loadBackgrounds();

// ---------- Escala ----------
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
function viewCenter(){
  const R=state.shell.radius, L=state.shell.length;
  if(state.view==='top')   return {x:R, y:L/2};
  if(state.view==='front') return {x:R, y:R};
  return {x:R, y:R + L/2};
}

// ---------- Inserción módulos ----------
function insertModule(key,center=true){
  const def=MODULES.find(m=>m.key===key); if(!def) return;
  const sz=Math.max(2, Math.sqrt(def.nhv)||2);
  const it={
    id:nextId++, key, name:def.name,
    floor:state.floor, x:0, y:0, w:sz, h:sz, rot:0, locked:false,
    geometry:'rect' // por defecto TODOS rectangulares
  };
  if(key==='corr'){ it.w=1.2; it.h=4; }
  if(key==='stairs'){ it.w=2; it.h=2; } // no se agrega automáticamente
  if(center){ const c=viewCenter(); it.x=c.x-it.w/2; it.y=c.y-it.h/2; }
  state.items.push(it); state.selId=it.id; pushHistory(); render();
}

// ---------- Dibujo casco + interior gris ----------
function drawBackground(){
  const k=state.view, img=state.bgImg[k]; if(!img) return;
  ctx.save(); ctx.globalAlpha=.3; // 70% transparencia
  const rC=cv.width/cv.height, rI=img.width/img.height;
  let w=cv.width,h=cv.height,x=0,y=0;
  if(rI>rC){ h=cv.height; w=h*rI; x=(cv.width-w)/2; } else { w=cv.width; h=w/rI; y=(cv.height-h)/2; }
  ctx.drawImage(img,x,y,w,h); ctx.restore();
}
function drawShellInterior(){
  ctx.save();
  const R=m2p(state.shell.radius), L=m2p(state.shell.length), cx=cv.width/2;
  ctx.fillStyle='rgba(180,190,205,0.21)'; // gris interior +15%
  ctx.strokeStyle='rgba(80,120,200,0.9)'; ctx.lineWidth=2;
  if(state.view==='top'){
    const w=R*2, h=L, left=cx-R, top=(cv.height-h)/2;
    ctx.fillRect(left,top,w,h);
    ctx.strokeRect(left,top,w,h);
  }else if(state.view==='front'){
    const w=R*2, h=R*2, left=cx-R, top=(cv.height-h)/2;
    ctx.fillRect(left,top,w,h); ctx.strokeRect(left,top,w,h);
    drawFloorLines(left,top,w,h, m2p(state.shell.gap));
  }else{
    const h=L+R*2, top=(cv.height-h)/2, left=cx-R, right=cx+R;
    // tapa superior y volumen
    ctx.beginPath(); ctx.moveTo(left,top+R);
    ctx.arc(cx, top+R, R, Math.PI, 0,false);
    ctx.lineTo(right, top+R+L); ctx.lineTo(left, top+R+L); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // paredes
    ctx.beginPath(); ctx.moveTo(left,top+R); ctx.lineTo(left,top+R+L);
    ctx.moveTo(right,top+R); ctx.lineTo(right,top+R+L); ctx.stroke();
    drawFloorLines(left,top+R, right-left, L, m2p(state.shell.gap));
  }
  ctx.restore();
}
function drawFloorLines(left,top,w,h,gap){
  ctx.save(); ctx.setLineDash([6,6]); ctx.strokeStyle='rgba(80,120,200,0.55)';
  const n=state.shell.floors;
  for(let i=1;i<n;i++){ const y=top+i*gap; if(y<top+h-1){ ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(left+w,y); ctx.stroke(); } }
  ctx.setLineDash([]); ctx.restore();
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

// ---------- Dibujo de módulos ----------
async function drawModule(it){
  const x=m2p(it.x), y=m2p(it.y), w=m2p(it.w), h=m2p(it.h);
  const sprite = await getModuleSprite(it.key, state.view);
  ctx.save();
  const cx=x+w/2, cy=y+h/2; ctx.translate(cx,cy); ctx.rotate(rad(it.rot)); ctx.translate(-cx,-cy);

  // FONDO gris “piso” del módulo (oscurecido +15%)
  ctx.fillStyle='rgba(210,220,230,0.35)';
  if(state.view==='top' && it.key==='sleep'){
    const r=Math.min(w,h)/2;
    ctx.beginPath(); ctx.arc(x+w/2,y+h/2,r,0,Math.PI*2); ctx.fill();
  }else{
    ctx.fillRect(x,y,w,h);
  }

  if(sprite){
    const rS = sprite.width/sprite.height;
    let dw=w, dh=h;
    if(w/h > rS){ dw = h*rS; } else { dh = w/rS; }
    ctx.globalAlpha = 0.92;
    ctx.drawImage(sprite, x+(w-dw)/2, y+(h-dh)/2, dw, dh);
    ctx.globalAlpha = 1.0;
  }else{
    ctx.fillStyle = hex2rgba(getColor(it.key), .85);
    // Sueño: Top circular, Front/Side rectangular (coherentes)
    if(state.view==='top' && it.key==='sleep'){
      const r=Math.min(w,h)/2;
      ctx.beginPath(); ctx.arc(x+w/2,y+h/2,r,0,Math.PI*2); ctx.fill();
    }else if(state.view==='top' && it.geometry==='rhomb'){
      ctx.beginPath();
      ctx.moveTo(x+w/2,y); ctx.lineTo(x+w,y+h/2); ctx.lineTo(x+w/2,y+h); ctx.lineTo(x,y+h/2); ctx.closePath(); ctx.fill();
    }else{
      roundRect(ctx,x,y,w,h,6,true,false);
    }
  }

  // borde (colisión o normal)
  const col = collides(it) ? 'rgba(239,68,68,0.9)' : 'rgba(74,163,255,0.9)';
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  if(state.view==='top' && it.key==='sleep'){
    const r=Math.min(w,h)/2; ctx.beginPath(); ctx.arc(x+w/2,y+h/2,r,0,Math.PI*2); ctx.stroke();
  }else if(state.view==='top' && it.geometry==='rhomb'){
    ctx.beginPath(); ctx.moveTo(x+w/2,y); ctx.lineTo(x+w,y+h/2); ctx.lineTo(x+w/2,y+h); ctx.lineTo(x,y+h/2); ctx.closePath(); ctx.stroke();
  }else{
    ctx.strokeRect(x,y,w,h);
  }

  // etiqueta y badge Pn
  ctx.fillStyle='#0b0f17'; ctx.font='12px system-ui'; ctx.fillText(shortName(it.name), x+6, y+14);
  ctx.fillStyle='rgba(20,40,77,.85)'; ctx.strokeStyle='rgba(41,74,122,.9)'; ctx.lineWidth=1; const bw=34,bh=16;
  ctx.fillRect(x+w-bw-4,y+4,bw,bh); ctx.strokeRect(x+w-bw-4,y+4,bw,bh);
  ctx.fillStyle='#9fc5ff'; ctx.fillText(`P${it.floor}`, x+w-bw+8,y+16);

  ctx.restore();

  if(state.selId===it.id) drawHandles(x,y,w,h);
}
function roundRect(ctx,x,y,w,h,r,fill,stroke){
  if(r>Math.min(w,h)/2) r=Math.min(w,h)/2;
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  if(fill) ctx.fill();
  if(stroke) ctx.stroke();
}

function drawHandles(x,y,w,h){
  const hs=7;
  const pts=[[x,y],[x+w/2,y],[x+w,y],[x+w,y+h/2],[x+w,y+h],[x+w/2,y+h],[x,y+h],[x,y+h/2]];
  ctx.save();
  ctx.fillStyle='#fff';
  pts.forEach(p=>{ ctx.fillRect(p[0]-hs/2,p[1]-hs/2,hs,hs); ctx.strokeStyle='#0b0f17'; ctx.strokeRect(p[0]-hs/2,p[1]-hs/2,hs,hs); });
  ctx.beginPath(); ctx.arc(x+w/2,y+h/2, hs+1,0,Math.PI*2); ctx.fillStyle='#ffe08a'; ctx.fill(); ctx.strokeStyle='#0b0f17'; ctx.stroke();
  ctx.beginPath(); ctx.arc(x+w/2,y-18, hs,0,Math.PI*2); ctx.fillStyle='#aaf'; ctx.fill(); ctx.strokeStyle='#0b0f17'; ctx.stroke();
}

async function render(){
  ctx.clearRect(0,0,cv.width,cv.height);
  computePPM(); drawBackground(); drawShellInterior();
  const arr=state.items.filter(i=>i.floor===state.floor);
  for(const it of arr) await drawModule(it);
  drawScaleBar(); updateScore();
}

// ---------- Interacción ratón ----------
function currentSel(){ return state.items.find(i=>i.id===state.selId); }
function itemBoxPx(it){ return {x:m2p(it.x), y:m2p(it.y), w:m2p(it.w), h:m2p(it.h)}; }
function pointInBoxPx(p, box){ const X=m2p(p.x), Y=m2p(p.y); return (X>=box.x&&X<=box.x+box.w&&Y>=box.y&&Y<=box.y+box.h); }
function getMouseM(ev){ const r=cv.getBoundingClientRect(); const x=(ev.clientX-r.left)*(cv.width/r.width); const y=(ev.clientY-r.top)*(cv.height/r.height); return {x:p2m(x), y:p2m(y)}; }

let drag=null;
cv.addEventListener('mousedown', (e)=>{
  const pos=getMouseM(e);
  const it = pickItem(pos); state.selId = it? it.id : null; updateProp();
  const sel=currentSel(); if(!sel){ render(); return; }
  const box=itemBoxPx(sel);
  const hit=hitHandle(pos, box);
  if(hit==='move'){ drag={mode:'move',offx:pos.x-sel.x, offy:pos.y-sel.y}; }
  else if(hit==='rot'){ drag={mode:'rot', start:pos}; }
  else if(typeof hit==='number'){ drag={mode:'res', idx:hit, start:pos, startBox:{x:sel.x,y:sel.y,w:sel.w,h:sel.h}}; }
  else if(pointInBoxPx(pos, box)){ drag={mode:'move',offx:pos.x-sel.x, offy:pos.y-sel.y}; }
});
cv.addEventListener('mousemove', async (e)=>{
  if(!drag) return; const pos=getMouseM(e); const it=currentSel(); if(!it) return;
  if(drag.mode==='move'){ it.x=pos.x-drag.offx; it.y=pos.y-drag.offy; }
  else if(drag.mode==='rot'){ const c={x:it.x+it.w/2,y:it.y+it.h/2}; it.rot = clamp(deg(Math.atan2(pos.y-c.y,pos.x-c.x)), -180,180); }
  else if(drag.mode==='res'){
    const i=drag.idx, sb=drag.startBox, dx=pos.x-drag.start.x, dy=pos.y-drag.start.y; let x=sb.x,y=sb.y,w=sb.w,h=sb.h;
    if(i===0){ x=sb.x+dx; y=sb.y+dy; w=sb.w-dx; h=sb.h-dy; }
    if(i===1){ y=sb.y+dy; h=sb.h-dy; }
    if(i===2){ y=sb.y+dy; w=sb.w+dx; h=sb.h-dy; }
    if(i===3){ w=sb.w+dx; }
    if(i===4){ w=sb.w+dx; h=sb.h+dy; }
    if(i===5){ h=sb.h+dy; }
    if(i===6){ x=sb.x+dx; w=sb.w-dx; h=sb.h+dy; }
    if(i===7){ x=sb.x+dx; }
    const min= it.key==='corr' ? {w:.8,h:1.0} : {w:1.0,h:1.0};
    it.x=x; it.y=y; it.w=Math.max(min.w,w); it.h=Math.max(min.h,h);
  }
  await render();
});
window.addEventListener('mouseup',()=>{ if(drag){ drag=null; pushHistory(); updateScore(); } });

function hitHandle(p, box){
  const hs=7, radH=10; const pts=[[box.x,box.y],[box.x+box.w/2,box.y],[box.x+box.w,box.y],[box.x+box.w,box.y+box.h/2],[box.x+box.w,box.y+box.h],[box.x+box.w/2,box.y+box.h],[box.x,box.y+box.h],[box.x,box.y+box.h/2]];
  const X=m2p(p.x), Y=m2p(p.y);
  if(Math.hypot(X-(box.x+box.w/2), Y-(box.y-18))<=radH) return 'rot';
  if(Math.hypot(X-(box.x+box.w/2), Y-(box.y+box.h/2))<=radH) return 'move';
  for(let i=0;i<pts.length;i++) if(Math.abs(X-pts[i][0])<=hs && Math.abs(Y-pts[i][1])<=hs) return i;
  return null;
}

function pickItem(p){
  const arr=state.items.filter(i=>i.floor===state.floor);
  for(let i=arr.length-1;i>=0;i--){ const it=arr[i]; if(pointInBoxPx(p, itemBoxPx(it))) return it; }
  return null;
}

// ---------- Colisiones ----------
function collides(A){
  const a={x:A.x,y:A.y,w:A.w,h:A.h,f:A.floor};
  for(const B of state.items){ if(B.id===A.id||B.floor!==A.floor) continue;
    const b={x:B.x,y:B.y,w:B.w,h:B.h};
    if(a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y ) return true;
  }
  const R=state.shell.radius, L=state.shell.length;
  if(state.view==='top'){ if(a.x<0||a.y<0||a.x+a.w>R*2||a.y+a.h>L) return true; }
  else if(state.view==='front'){ if(a.x<0||a.y<0||a.x+a.w>R*2||a.y+a.h>R*2) return true; }
  else { if(a.x<0||a.y<0||a.x+a.w>R*2||a.y+a.h>(L+R*2)) return true; }
  return false;
}

// ---------- Propiedades ----------
function updateProp(){
  const box=$('#propBox'); const it=currentSel();
  if(!it){ box.innerHTML='<div class="hint">Seleccioná un módulo…</div>'; return; }
  box.innerHTML=`
    <div class="kv"><div>Nombre</div><input class="ro" value="${it.name}" readonly></div>
    <div class="kv"><div>Piso</div><input id="pFloor" type="number" min="1" max="${state.shell.floors}" value="${it.floor}"></div>
    <div class="kv"><div>Geometría</div>
      <select id="pGeom">
        <option value="rect" ${it.geometry==='rect'?'selected':''}>Prisma rectangular</option>
        <option value="cube" ${it.geometry==='cube'?'selected':''}>Cúbica</option>
        <option value="rhomb" ${it.geometry==='rhomb'?'selected':''}>Rómbica</option>
      </select>
    </div>
    <div class="kv"><div>X (m)</div><input id="pX" type="number" step="0.1" value="${it.x.toFixed(2)}"></div>
    <div class="kv"><div>Y (m)</div><input id="pY" type="number" step="0.1" value="${it.y.toFixed(2)}"></div>
    <div class="kv"><div>Ancho (m)</div><input id="pW" type="number" step="0.1" value="${it.w.toFixed(2)}"></div>
    <div class="kv"><div>Largo (m)</div><input id="pH" type="number" step="0.1" value="${it.h.toFixed(2)}"></div>
    <div class="kv"><div>Rotación (°)</div><input id="pR" type="number" step="1" value="${it.rot.toFixed(0)}"></div>
    <div class="kv"><div>Bloqueado</div><input id="pLock" type="checkbox" ${it.locked?'checked':''}></div>
  `;
  $('#pGeom').onchange=(e)=>{ it.geometry=e.target.value; updateProp(); render(); pushHistory(); };
  ['pFloor','pX','pY','pW','pH','pR','pLock'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    el.onchange=(e)=>{
      if(id==='pFloor') it.floor=clamp(parseInt(e.target.value,10),1,state.shell.floors);
      else if(id==='pLock') it.locked=e.target.checked;
      else if(id==='pR') it.rot=parseFloat(e.target.value||0);
      else if(id==='pX') it.x=parseFloat(e.target.value||it.x);
      else if(id==='pY') it.y=parseFloat(e.target.value||it.y);
      else if(id==='pW') it.w=Math.max(0.3,parseFloat(e.target.value||it.w));
      else if(id==='pH') it.h=Math.max(0.3,parseFloat(e.target.value||it.h));
      render(); pushHistory(); updateScore();
    };
  });
}

// ---------- Score: diseño + supervivencia ----------
function updateScore(){
  // Diseño base
  let base=0.5, vol=0.5, mass=1.0, mult=0.5;
  let collisions=0; for(const it of state.items.filter(i=>i.floor===state.floor)) if(collides(it)) collisions++;
  base = Math.max(0, base - Math.min(1, collisions*0.05));
  const design = Math.max(0, Math.min(100, (base*0.4 + vol*0.2 + mass*0.2 + mult*0.2)*100 ));

  // Supervivencia (0..1)
  const surv = computeSurvivalFactor();

  const final = +(design * surv).toFixed(1);
  $('#scColl').textContent=collisions.toFixed(2);
  $('#scMass').textContent=state.items.reduce((s,i)=>s+(MODULES.find(m=>m.key===i.key)?.mass||0),0);
  $('#scoreDesign').textContent=design.toFixed(1);
  $('#scoreSurv').textContent=surv.toFixed(2);
  $('#scoreFinal').textContent=final.toFixed(1);
}
function computeSurvivalFactor(){
  const N=state.crewN;
  const counts = key=> state.items.filter(i=>i.key===key).length;
  const needs = [
    ['sleep','Sueño'],
    ['hygiene','Higiene'],
    ['galley','Alimentación'],
    ['eclss','ECLSS'],
    ['airlock','Airlock']
  ].map(([k,lab])=>{
    const cap = CAP_DEFAULTS[k]||Infinity;
    const req = cap===0?0: Math.ceil(N/cap);
    const have = counts(k);
    const ok = req===0?1:(have/req);
    return {key:k,label:lab,req,have,ok:Math.min(1,ok)};
  });
  const surv = needs.reduce((m,n)=>Math.min(m,n.ok),1);
  computeSurvivalFactor._lastNeeds=needs;
  return surv;
}

// ---------- Simulación ----------
function openSimulation(){
  const needs = computeSurvivalFactor._lastNeeds || (computeSurvivalFactor(), computeSurvivalFactor._lastNeeds);
  const days = needs.some(n=>n.ok<1) ? 0 : 30; // placeholder simple
  const sugg = needs.filter(n=>n.ok<1).map(n=>`Falta ${n.req-n.have} × ${n.label} (req=${n.req} para N=${state.crewN})`);
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
          ${needs.map(n=>`<li class="${n.ok<1?'bad':'good'}">${n.label}: ${n.have}/${n.req}</li>`).join('')}
        </ul>
      </div>
      <div class="callout" style="grid-column:1/3">
        <b>Sugerencias</b>
        <ul>
          ${sugg.length? sugg.map(s=>`<li>${s}</li>`).join('') : '<li>Todo cubierto para misión corta (30 días).</li>'}
        </ul>
      </div>
    </div>`;
  $('#simContent').innerHTML=html;
  $('#simModal').classList.add('show');
}
$('#closeSim').onclick=()=>$('#simModal').classList.remove('show');

// ---------- Guía de capacidades ----------
$('#btnGuide').onclick=()=>{ mountCapTable(); $('#guideModal').classList.add('show'); };
$('#closeGuide').onclick=()=>$('#guideModal').classList.remove('show');
$$('.tap').forEach(b=>b.onclick=()=>{
  $$('.tap').forEach(x=>x.classList.remove('active')); b.classList.add('active');
  const t=b.dataset.t;
  $('#tabA').style.display = (t==='a')?'block':'none';
  $('#tabB').style.display = (t==='b')?'block':'none';
  $('#tabC').style.display = (t==='c')?'block':'none';
});
function mountCapTable(){
  $('#capN').textContent=state.crewN;
  const tb=$('#capTable tbody'); tb.innerHTML='';
  ['sleep','hygiene','galley','ops','med','ex','store','eclss','airlock'].forEach(k=>{
    const m=MODULES.find(x=>x.key===k);
    const tr=document.createElement('tr'); tr.dataset.key=k;
    tr.innerHTML=`
      <td>${m.name}</td>
      <td>${CAP_INFO[k].base}</td>
      <td><input type="number" step="0.1" value="${CAP_DEFAULTS[k]}" style="width:90px"></td>
      <td class="rec"></td>
      <td>${CAP_INFO[k].infl}</td>
      <td>${CAP_INFO[k].rule}</td>`;
    tb.appendChild(tr);
  });
  recalcCaps(); tb.querySelectorAll('input').forEach(i=>i.onchange=recalcCaps);
}
function recalcCaps(){
  const N=state.crewN, tb=$('#capTable tbody');
  tb.querySelectorAll('tr').forEach(tr=>{
    const k=tr.dataset.key; const cap=parseFloat(tr.querySelector('input').value||CAP_DEFAULTS[k]);
    const r = cap<=0? 0 : Math.ceil(N/cap); tr.querySelector('.rec').textContent=r;
  });
}
$('#btnResetCaps').onclick=mountCapTable;
$('#btnApplyCaps').onclick=()=>{
  const tb=$('#capTable tbody');
  tb.querySelectorAll('tr').forEach(tr=>{
    const k=tr.dataset.key; const r=parseInt(tr.querySelector('.rec').textContent||'0',10);
    const cur = state.items.filter(i=>i.key===k).length;
    for(let i=cur;i<r;i++) insertModule(k,false);
  });
  $('#guideModal').classList.remove('show'); render();
};

// ---------- Boot ----------
function boot(){ rebuildFloorOptions(); computePPM(); loadBackgrounds().then(render); pushHistory(); }
boot();
