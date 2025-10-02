/* Habitat Layout Creator – V1.2.0
 * EVA = Extravehicular Activity
 * NHV = Net Habitable Volume
 * Todo configurable desde habitat_params_v1.csv
 */

const PX_PER_M = 30;
const CANVAS = document.getElementById('canvas');
const CTX = CANVAS.getContext('2d');

const envSelect = document.getElementById('envSelect');
const crewInput = document.getElementById('crewInput');
const reloadBtn = document.getElementById('reloadBtn');
const simulateBtn = document.getElementById('simulateBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const exportPngBtn = document.getElementById('exportPngBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

// Sim paralelo
const snapA=document.getElementById('snapA'), runA=document.getElementById('runA'), lifeA=document.getElementById('lifeA');
const snapB=document.getElementById('snapB'), runB=document.getElementById('runB'), lifeB=document.getElementById('lifeB');

// Propiedades
const propNone = document.getElementById('propNone');
const propCard = document.getElementById('propCard');
const pName = document.getElementById('pName');
const pNHVmin = document.getElementById('pNHVmin');
const pNHVref = document.getElementById('pNHVref');
const pMass = document.getElementById('pMass');
const pDims = document.getElementById('pDims');
const pVol = document.getElementById('pVol');

// Shell controls
const shellBtns = document.querySelectorAll('.shellBtn');
const shellA = document.getElementById('shellA');
const shellB = document.getElementById('shellB');
const shellH = document.getElementById('shellH');
const applyShell = document.getElementById('applyShell');

let GLOBAL = {};
let MODULE_DEFS = [];
let INSTANCES = []; // {id,name, x,y, w,h, w_m,d_m,h_m}
let CURRENT_VIEW = "top";
let needRender = true;

let SELECTED_ID = null;
let SLOT_A=null, SLOT_B=null;

const UNDO = [], REDO=[];
function pushUndo(){ UNDO.push(JSON.stringify(INSTANCES)); REDO.length=0; }
function undo(){ if(!UNDO.length) return; REDO.push(JSON.stringify(INSTANCES)); INSTANCES = JSON.parse(UNDO.pop()); needRender=true; computeAndUpdate(); }
function redo(){ if(!REDO.length) return; UNDO.push(JSON.stringify(INSTANCES)); INSTANCES = JSON.parse(REDO.pop()); needRender=true; computeAndUpdate(); }

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const deepCopy = o=>JSON.parse(JSON.stringify(o));
const mToPx = m=>m*PX_PER_M;
const pxToM = px=>px/PX_PER_M;

/* ---------------------- CSV Loader ---------------------- */
async function loadCSV(){
  const res = await fetch('habitat_params_v1.csv?'+Date.now());
  const txt = await res.text();
  const lines = txt.split(/\r?\n/).filter(l=>l.trim().length>0);
  const header = lines[0].split(',');

  GLOBAL={}; MODULE_DEFS=[];
  for(let i=1;i<lines.length;i++){
    const cols = lines[i].split(',');
    const row={}; header.forEach((h,idx)=>row[h.trim()] = (cols[idx]??'').trim());
    if ((row.type||'').toUpperCase()==='GLOBAL'){
      GLOBAL[row.key] = isNaN(parseFloat(row.value)) ? row.value : parseFloat(row.value);
    } else if ((row.type||'').toUpperCase()==='MODULE'){
      MODULE_DEFS.push({
        Modulo: row.Modulo,
        NHV_min_m3: parseFloat(row.NHV_min_m3),
        NHV_ref_m3: parseFloat(row.NHV_ref_m3),
        Masa_est_kg: parseFloat(row.Masa_est_kg),
        Consumo_O2_kg_dia: parseFloat(row.Consumo_O2_kg_dia),
        Consumo_H2O_kg_dia: parseFloat(row.Consumo_H2O_kg_dia),
        Consumo_Food_kg_dia: parseFloat(row.Consumo_Food_kg_dia),
        Energia_req_kW: parseFloat(row.Energia_req_kW),
        ECLSS_soporta_crew: row.ECLSS_soporta_crew ? parseFloat(row.ECLSS_soporta_crew) : 0
      });
    }
  }

  envSelect.value = (GLOBAL['environment_default'] || 'moon_south_pole');
  crewInput.value = GLOBAL['crew_count'] ? parseInt(GLOBAL['crew_count']) : 2;

  shellA.value = GLOBAL['habitat_a_m']||10;
  shellB.value = GLOBAL['habitat_b_m']||7;
  shellH.value = GLOBAL['habitat_height_m']||3;

  buildPalette();
  computeAndUpdate(); render();
}

function buildPalette(){
  const palette = document.getElementById('palette');
  palette.innerHTML='';
  MODULE_DEFS.forEach(def=>{
    const btn=document.createElement('button');
    btn.textContent = `${def.Modulo}  (NHV_ref ${def.NHV_ref_m3} m³)`;
    btn.onclick=()=>{ addInstance(def.Modulo); };
    palette.appendChild(btn);
  });
}

/* ---------------------- Shell & Corridors ---------------------- */
function setShellShape(shape){
  GLOBAL['habitat_shape'] = shape;
  needRender=true;
}
shellBtns.forEach(b=> b.onclick=()=> setShellShape(b.dataset.shape));
applyShell.onclick=()=>{
  GLOBAL['habitat_a_m']=parseFloat(shellA.value)||GLOBAL['habitat_a_m'];
  GLOBAL['habitat_b_m']=parseFloat(shellB.value)||GLOBAL['habitat_b_m'];
  GLOBAL['habitat_height_m']=parseFloat(shellH.value)||GLOBAL['habitat_height_m'];
  needRender=true; computeAndUpdate();
};

function drawHabitatOutline(){
  const shape=(GLOBAL['habitat_shape']||'ellipse').toLowerCase();
  const a=GLOBAL['habitat_a_m']||10, b=GLOBAL['habitat_b_m']||7;
  const W=mToPx(a*2), H=mToPx(b*2);
  CTX.save(); CTX.translate(CANVAS.width/2, CANVAS.height/2);
  CTX.lineWidth=2; CTX.strokeStyle='#2563eb'; CTX.setLineDash([6,6]);

  if (CURRENT_VIEW==='top'){
    if (shape==='cube'){ CTX.strokeRect(-W/2,-H/2,W,H); }
    else { CTX.beginPath(); CTX.ellipse(0,0,W/2,H/2,0,0,Math.PI*2); CTX.stroke(); }

    // pasillos
    const count=GLOBAL['corridor_count']||0;
    CTX.strokeStyle='#ef4444'; CTX.setLineDash([10,6]);
    for(let i=1;i<=count;i++){
      const y_m=GLOBAL[`corridor${i}_y_m`]; if(typeof y_m!=='number') continue;
      CTX.beginPath();
      CTX.moveTo(-W/2, -H/2 + mToPx(y_m));
      CTX.lineTo( W/2, -H/2 + mToPx(y_m));
      CTX.stroke();
    }
  }else{
    const height = mToPx(GLOBAL['habitat_height_m']||3);
    CTX.strokeRect(-W/2, -height/2, W, height);
  }
  CTX.restore();
}

function insideHabitat(inst){
  const a=GLOBAL['habitat_a_m']||10, b=GLOBAL['habitat_b_m']||7;
  const W=mToPx(a*2), H=mToPx(b*2);
  const cx=CANVAS.width/2, cy=CANVAS.height/2;
  const x0=inst.x, y0=inst.y, x1=inst.x+inst.w, y1=inst.y+inst.h;

  if (CURRENT_VIEW==='top'){
    const shape=(GLOBAL['habitat_shape']||'ellipse').toLowerCase();
    if (shape==='cube'){ return (x0>=cx-W/2 && y0>=cy-H/2 && x1<=cx+W/2 && y1<=cy+H/2); }
    const chk=(x,y)=>{ const ex=(x-cx)/(W/2), ey=(y-cy)/(H/2); return ex*ex+ey*ey<=1; };
    return chk(x0,y0)&&chk(x1,y0)&&chk(x0,y1)&&chk(x1,y1);
  }else{
    const height = mToPx(GLOBAL['habitat_height_m']||3);
    return (x0>=cx-W/2 && y0>=cy-height/2 && x1<=cx+W/2 && y1<=cy+height/2);
  }
}

/* ---------------------- Instancias y proyección 3D ---------------------- */
function defByName(n){ return MODULE_DEFS.find(m=>m.Modulo===n); }

function addInstance(name){
  pushUndo();
  const def=defByName(name); if(!def) return;
  const hCab=GLOBAL['cabin_height_m']||2.5;
  const area=def.NHV_ref_m3/hCab;
  const lado=Math.sqrt(area);
  const minE=GLOBAL['module_min_edge_m']||1.2, maxE=GLOBAL['module_max_edge_m']||6;

  const inst={
    id:crypto.randomUUID(), name,
    w_m:clamp(lado,minE,maxE), d_m:clamp(lado,minE,maxE), h_m:clamp(hCab,minE,maxE),
    x: CANVAS.width/2 - mToPx(lado)/2, y: CANVAS.height/2 - mToPx(lado)/2, w:mToPx(lado), h:mToPx(lado)
  };
  project(inst);
  INSTANCES.push(inst); SELECTED_ID=inst.id; computeAndUpdate(); needRender=true;
}

function project(inst){
  if (CURRENT_VIEW==='top'){ inst.w=mToPx(inst.w_m); inst.h=mToPx(inst.d_m); }
  if (CURRENT_VIEW==='front'){ inst.w=mToPx(inst.w_m); inst.h=mToPx(inst.h_m); }
  if (CURRENT_VIEW==='side'){ inst.w=mToPx(inst.d_m); inst.h=mToPx(inst.h_m); }
}
function reprojectAll(){ INSTANCES.forEach(project); needRender=true; }

/* ---------------------- Drag/Resize/Select ---------------------- */
let drag={active:false,id:null,dx:0,dy:0,mode:'move',handle:null};
function hitHandle(r,x,y){
  const hs=8, handles=[
    {k:'nw',x:r.x,y:r.y},{k:'ne',x:r.x+r.w,y:r.y},
    {k:'sw',x:r.x,y:r.y+r.h},{k:'se',x:r.x+r.w,y:r.y+r.h}
  ];
  for(const h of handles){ if (Math.abs(x-h.x)<=hs && Math.abs(y-h.y)<=hs) return h.k; } return null;
}
function rectsOverlap(a,b){ return !(a.x+a.w<=b.x || b.x+b.w<=a.x || a.y+a.h<=b.y || b.y+b.h<=a.y); }
function violatesOverlap(c){
  if (!parseInt(GLOBAL['forbid_overlap']||0)) return false;
  for(const r of INSTANCES){ if(r.id!==c.id && rectsOverlap(r,c)) return true; } return false;
}

CANVAS.addEventListener('mousedown', e=>{
  const r=CANVAS.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top;
  for(let i=INSTANCES.length-1;i>=0;i--){
    const it=INSTANCES[i]; const handle=hitHandle(it,mx,my);
    if(handle){ drag={active:true,id:it.id,mode:'resize',handle}; SELECTED_ID=it.id; updateProps(); return; }
    if(mx>=it.x && mx<=it.x+it.w && my>=it.y && my<=it.y+it.h){
      drag={active:true,id:it.id,dx:mx-it.x,dy:my-it.y,mode:'move'}; SELECTED_ID=it.id; updateProps(); return;
    }
  }
  SELECTED_ID=null; updateProps();
});
window.addEventListener('mousemove', e=>{
  if(!drag.active) return;
  const r=CANVAS.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top;
  const it=INSTANCES.find(i=>i.id===drag.id); if(!it) return;
  const before={...it};

  if(drag.mode==='move'){ it.x=mx-drag.dx; it.y=my-drag.dy; }
  else{
    const minPx=mToPx(GLOBAL['module_min_edge_m']||1.2), maxPx=mToPx(GLOBAL['module_max_edge_m']||6);
    if(drag.handle==='nw'){ const nx=Math.min(it.x+it.w-10,mx), ny=Math.min(it.y+it.h-10,my); it.w+=it.x-nx; it.h+=it.y-ny; it.x=nx; it.y=ny; }
    if(drag.handle==='ne'){ const nx=Math.max(it.x+10,mx); it.w=nx-it.x; const ny=Math.min(it.y+it.h-10,my); it.h+=it.y-ny; it.y=ny; }
    if(drag.handle==='sw'){ const nx=Math.min(it.x+it.w-10,mx); it.w+=it.x-nx; it.x=nx; const ny=Math.max(it.y+10,my); it.h=ny-it.y; }
    if(drag.handle==='se'){ it.w=Math.max(10,mx-it.x); it.h=Math.max(10,my-it.y); }
    it.w=clamp(it.w,minPx,maxPx); it.h=clamp(it.h,minPx,maxPx);

    if(CURRENT_VIEW==='top'){ it.w_m=pxToM(it.w); it.d_m=pxToM(it.h); }
    if(CURRENT_VIEW==='front'){ it.w_m=pxToM(it.w); it.h_m=pxToM(it.h); }
    if(CURRENT_VIEW==='side'){ it.d_m=pxToM(it.w); it.h_m=pxToM(it.h); }
  }

  if(!insideHabitat(it) || violatesOverlap(it)){ Object.assign(it,before); }
  else{ needRender=true; updateProps(); }
});
window.addEventListener('mouseup', ()=>{ if(drag.active){ drag.active=false; computeAndUpdate(); pushUndo(); } });
CANVAS.addEventListener('dblclick', e=>{
  const r=CANVAS.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top;
  for(let i=INSTANCES.length-1;i>=0;i--){
    const it=INSTANCES[i];
    if(mx>=it.x && mx<=it.x+it.w && my>=it.y && my<=it.y+it.h){
      pushUndo(); INSTANCES.splice(i,1); SELECTED_ID=null; computeAndUpdate(); needRender=true; updateProps(); return;
    }
  }
});

/* ---------------------- Astronauta (avatar) ---------------------- */
const astro = { x: CANVAS.width/2, y: CANVAS.height/2, r: 8, speed: 3 };
const KEYS = {};
window.addEventListener('keydown', e=>{ KEYS[e.key.toLowerCase()]=true; });
window.addEventListener('keyup', e=>{ KEYS[e.key.toLowerCase()]=false; });
function moveAstronaut(){
  let dx=0,dy=0;
  if(KEYS['arrowup']||KEYS['w']) dy-=astro.speed;
  if(KEYS['arrowdown']||KEYS['s']) dy+=astro.speed;
  if(KEYS['arrowleft']||KEYS['a']) dx-=astro.speed;
  if(KEYS['arrowright']||KEYS['d']) dx+=astro.speed;
  const next={x:astro.x+dx,y:astro.y+dy,r:astro.r};
  if (!collidesWithModules(next) && insideHabPoint(next.x,next.y)){ astro.x=next.x; astro.y=next.y; needRender=true; }
}
function collidesWithModules(pt){
  for(const it of INSTANCES){
    if(pt.x>=it.x && pt.x<=it.x+it.w && pt.y>=it.y && pt.y<=it.y+it.h) return true;
  }
  return false;
}
function insideHabPoint(x,y){
  const a=GLOBAL['habitat_a_m']||10,b=GLOBAL['habitat_b_m']||7;
  const W=mToPx(a*2),H=mToPx(b*2),cx=CANVAS.width/2,cy=CANVAS.height/2;
  if(CURRENT_VIEW!=='top'){ const height=mToPx(GLOBAL['habitat_height_m']||3); return (x>=cx-W/2 && y>=cy-height/2 && x<=cx+W/2 && y<=cy+height/2); }
  if((GLOBAL['habitat_shape']||'ellipse')==='cube'){ return (x>=cx-W/2 && y>=cy-H/2 && x<=cx+W/2 && y<=cy+H/2); }
  const ex=(x-cx)/(W/2), ey=(y-cy)/(H/2); return ex*ex+ey*ey<=1;
}

/* ---------------------- Render ---------------------- */
function render(){
  requestAnimationFrame(render);
  moveAstronaut();
  if(!needRender) return;
  needRender=false;

  CTX.clearRect(0,0,CANVAS.width,CANVAS.height);

  // Fondo con imagen (opcional):
  // const img = new Image(); img.src='assets/luna.jpg'; img.onload=()=>CTX.drawImage(img,0,0,CANVAS.width,CANVAS.height);

  drawHabitatOutline();

  INSTANCES.forEach(it=>{
    CTX.fillStyle='#dbeafe'; CTX.strokeStyle= (it.id===SELECTED_ID?'#0ea5e9':'#1d4ed8');
    CTX.lineWidth=(it.id===SELECTED_ID?3:2);
    CTX.fillRect(it.x,it.y,it.w,it.h);
    CTX.strokeRect(it.x,it.y,it.w,it.h);
    CTX.fillStyle='#0f172a';
    CTX.fillText(it.name, it.x+6, it.y+16);

    // handles
    CTX.fillStyle='#0ea5e9';
    const hs=6;
    [[it.x,it.y],[it.x+it.w,it.y],[it.x,it.y+it.h],[it.x+it.w,it.y+it.h]].forEach(([hx,hy])=>{
      CTX.beginPath(); CTX.arc(hx,hy,hs,0,Math.PI*2); CTX.fill();
    });
  });

  // Astronauta
  CTX.fillStyle='#10b981';
  CTX.beginPath(); CTX.arc(astro.x,astro.y,astro.r,0,Math.PI*2); CTX.fill();
  CTX.strokeStyle='#065f46'; CTX.stroke();
}

/* ---------------------- Métricas / Score ---------------------- */
function center(r){ return {cx:r.x+r.w/2, cy:r.y+r.h/2}; }
function dist(a,b){ const A=center(a),B=center(b); const dx=pxToM(Math.abs(A.cx-B.cx)), dy=pxToM(Math.abs(A.cy-B.cy)); return Math.sqrt(dx*dx+dy*dy); }

function computeMetrics(){
  const hCab=GLOBAL['cabin_height_m']||2.5;
  const massRef=GLOBAL['mass_ref_kg']||8000;
  const adjThr=GLOBAL['adjacency_threshold_m']||3.0;

  // colisiones
  let collisions=0; for(let i=0;i<INSTANCES.length;i++) for(let j=i+1;j<INSTANCES.length;j++) if(rectsOverlap(INSTANCES[i],INSTANCES[j])) collisions++;
  const mCollisions = collisions===0?1:Math.max(0,1-collisions/INSTANCES.length);

  // NHV
  let nhvMinTotal=0; INSTANCES.forEach(i=> nhvMinTotal+=(defByName(i.name)?.NHV_min_m3||0));
  let nhvUsado=0; INSTANCES.forEach(i=> nhvUsado += pxToM(i.w)*pxToM(i.h)*hCab );
  const mNHV = clamp(nhvMinTotal/Math.max(nhvUsado,1e-3),0,1);

  // adyacencias
  const A=n=>INSTANCES.find(i=>i.name===n), has=n=>!!A(n);
  let checks=0, ok=0;
  if(has('Higiene + UWMS')&&has('Sueño (crew quarters)')){checks++; if(dist(A('Higiene + UWMS'),A('Sueño (crew quarters)'))<=adjThr) ok++;}
  if(has('Médico')&&has('Airlock')){checks++; if(dist(A('Médico'),A('Airlock'))<=adjThr) ok++;}
  const mAdj = checks>0? ok/checks : 1;

  // masa
  let massTotal=0; INSTANCES.forEach(i=> massTotal+=(defByName(i.name)?.Masa_est_kg||0));
  const optMasa = clamp(massRef/Math.max(massTotal,1),0,1);

  return {mCollisions,mNHV,mAdj,massTotal,optMasa,scoreBase:clamp(mCollisions*mAdj*mNHV,0,1), nhvMinTotal, nhvUsado};
}

/* ---------------------- Simulación Vida (con motivo) ---------------------- */
function getEnvConfig(){
  const env=envSelect.value;
  return {
    daylight_h: GLOBAL[`${env}.daylight_hours`]||12,
    night_h: GLOBAL[`${env}.night_hours`]||12,
    solar_kW_daylight: GLOBAL[`${env}.solar_kW_mean_daylight`]||5,
    battery_kWh: GLOBAL[`${env}.energy_storage_kWh`]||50
  };
}
function simulateLife(instancesSnapshot){
  const N=parseInt(crewInput.value||GLOBAL['crew_count']||2);
  let O2=GLOBAL['store_O2_kg']||50;
  let H2O=GLOBAL['store_H2O_kg']||200;
  let FOOD=GLOBAL['store_Food_kg']||100;

  const perO2=GLOBAL['per_crew_O2_kg_day']||0.84;
  const perH2O=GLOBAL['per_crew_H2O_kg_day']||3.0;
  const perFood=GLOBAL['per_crew_Food_kg_day']||0.62;

  const env=getEnvConfig(); let battery=env.battery_kWh;
  let kW_req=0; instancesSnapshot.forEach(i=> kW_req+=(defByName(i.name)?.Energia_req_kW||0));

  const eclssDef=defByName('ECLSS (Life Support)');
  const eclssCount=instancesSnapshot.filter(i=>i.name==='ECLSS (Life Support)').length;
  const eclssCrewBase=(eclssDef?.ECLSS_soporta_crew||4);
  const scaleEclss=eclssCount>0 ? (eclssCount*N)/eclssCrewBase : 0;

  let days=0, reason='-';
  while(days<365){
    const demandO2=N*perO2, demandH2O=N*perH2O, demandFood=N*perFood;
    const prodO2=(eclssDef?.Consumo_O2_kg_dia||0)*scaleEclss;
    const prodH2O=(eclssDef?.Consumo_H2O_kg_dia||0)*scaleEclss;
    const prodFood=(eclssDef?.Consumo_Food_kg_dia||0)*scaleEclss;

    O2 += (prodO2 - demandO2);
    H2O += (prodH2O - demandH2O);
    FOOD += (prodFood - demandFood);
    if (O2<=0){ reason='O₂ agotado'; break; }
    if (H2O<=0){ reason='Agua agotada'; break; }
    if (FOOD<=0){ reason='Comida agotada'; break; }

    const gen_kWh=env.solar_kW_daylight*env.daylight_h;
    let afterDay = Math.min(env.battery_kWh, battery + gen_kWh - kW_req*env.daylight_h);
    let afterNight = afterDay - kW_req*env.night_h;
    if (afterNight < 0){ reason='Batería/Energía insuficiente'; break; }
    battery = afterNight;

    days++;
  }
  if(days===365) reason='OK (límite sim)';
  return {days, reason};
}

/* ---------------------- UI Update ---------------------- */
function updateProps(){
  if(!SELECTED_ID){ propNone.hidden=false; propCard.hidden=true; return; }
  const it=INSTANCES.find(i=>i.id===SELECTED_ID); if(!it){propNone.hidden=false; propCard.hidden=true; return;}
  const d=defByName(it.name)||{};
  pName.textContent = it.name;
  pNHVmin.textContent = (d.NHV_min_m3??'-');
  pNHVref.textContent = (d.NHV_ref_m3??'-');
  pMass.textContent = Math.round(d.Masa_est_kg||0);
  const vol = (it.w_m*it.d_m*it.h_m);
  pDims.textContent = `${it.w_m.toFixed(2)} × ${it.d_m.toFixed(2)} × ${it.h_m.toFixed(2)}`;
  pVol.textContent = vol.toFixed(2);
  propNone.hidden=true; propCard.hidden=false;
}

function computeAndUpdate(){
  const refDays = GLOBAL['ref_days_normalization']||30;
  const {mCollisions,mNHV,mAdj,massTotal,optMasa,scoreBase, nhvMinTotal, nhvUsado} = computeMetrics();
  const life = simulateLife(INSTANCES);
  const M_vida = clamp(life.days/refDays,0,1);
  const optVolumen = mNHV;
  const finalScore = clamp(scoreBase*M_vida*optMasa*optVolumen,0,1)*100;

  document.getElementById('mCollisions').textContent = mCollisions.toFixed(2);
  document.getElementById('mAdj').textContent = mAdj.toFixed(2);
  document.getElementById('mNHV').textContent = `${mNHV.toFixed(2)} (min ${nhvMinTotal.toFixed(1)} m³ / usado ${nhvUsado.toFixed(1)} m³)`;
  document.getElementById('mMass').textContent = Math.round(massTotal);
  document.getElementById('mLife').textContent = life.days;
  document.getElementById('mFail').textContent = life.reason;
  document.getElementById('mBase').textContent = scoreBase.toFixed(2);
  document.getElementById('mOptV').textContent = optVolumen.toFixed(2);
  document.getElementById('mOptM').textContent = optMasa.toFixed(2);
  document.getElementById('mFinal').textContent = finalScore.toFixed(1);

  needRender=true; updateProps();
}

/* ---------------------- Export & Events ---------------------- */
function download(filename, text){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:'application/json'})); a.download=filename; a.click(); URL.revokeObjectURL(a.href); }
exportJsonBtn.onclick=()=> download('habitat_layout_v1_2.json', JSON.stringify({version:"1.2.0",environment:envSelect.value,crew:parseInt(crewInput.value||GLOBAL['crew_count']||2), instances:INSTANCES.map(r=>({name:r.name,w_m:r.w_m,d_m:r.d_m,h_m:r.h_m,x:r.x,y:r.y}))}, null, 2));
exportPngBtn.onclick=()=>{ const a=document.createElement('a'); a.href=CANVAS.toDataURL('image/png'); a.download='habitat_layout_v1_2.png'; a.click(); };

document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); CURRENT_VIEW=btn.dataset.view; reprojectAll(); computeAndUpdate();
  });
});
reloadBtn.onclick=()=> loadCSV().then(()=>{ reprojectAll(); computeAndUpdate(); });
simulateBtn.onclick=()=> computeAndUpdate();
envSelect.onchange=()=> computeAndUpdate();
crewInput.onchange=()=> computeAndUpdate();

undoBtn.onclick=()=>undo();
redoBtn.onclick=()=>redo();

snapA.onclick=()=>{ SLOT_A=deepCopy(INSTANCES); lifeA.textContent='guardado'; };
runA.onclick =()=>{ if(SLOT_A){ const r=simulateLife(SLOT_A); lifeA.textContent=r.days+' d ('+r.reason+')'; } };
snapB.onclick=()=>{ SLOT_B=deepCopy(INSTANCES); lifeB.textContent='guardado'; };
runB.onclick =()=>{ if(SLOT_B){ const r=simulateLife(SLOT_B); lifeB.textContent=r.days+' d ('+r.reason+')'; } };

/* ---------------------- Init ---------------------- */
loadCSV(); render();

