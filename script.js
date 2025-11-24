// script.js — separado para index.html
// Versión: Generador Actas PAE (Plantilla oficial)
// Instrucciones: Incluye <script src="script.js"></script> al final de tu index.html

const BASE_INPUT_ID = 'repo-url';
const FALLBACK_IMAGES = [
  '/mnt/data/a8dd408b-dd02-427e-9679-37ebadcbc9f4.png',
  '/mnt/data/a4be31fb-ac6e-4be4-9e6c-8d82752c1f10.png',
  '/mnt/data/0ae641fc-a1dc-4eb8-8c7d-801bc53cb803.png',
  '/mnt/data/c598d830-51a6-4cf2-ad5b-1edfa69ed77c.png',
  '/mnt/data/2f0709c0-914d-4ce4-b742-691dae14bdec.png'
];

const $ = id => document.getElementById(id);
let BASE = $(BASE_INPUT_ID)?.value?.trim() || '';
let rawWeeks = {}, schoolsRaw = [];
let selectedWeeks = [], menusByWeek = {}, PRODUCTS = {};

// ---------- Utilities ----------
async function fetchText(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error('HTTP '+res.status+' — '+url);
  return await res.text();
}

async function fetchCSV(url){
  const t = await fetchText(url);
  return Papa.parse(t, {header:true,skipEmptyLines:true}).data;
}

function showAlert(msg){ alert(msg); }

// Try loading image: prefer repo = BASE + name, fallback to local path array
function imageUrl(name, idx){
  const repoUrl = (BASE.endsWith('/')?BASE:BASE+'/') + name;
  return {repoUrl, fallback: FALLBACK_IMAGES[idx]};
}

// ---------- Load CSVs & UI population ----------
async function loadAllCsvs(){
  try{
    BASE = $(BASE_INPUT_ID).value.trim();
    if(!BASE) throw new Error('Escribe la URL raw base del repo (raw.githubusercontent.com/...)');
    // ensure trailing slash
    if(!BASE.endsWith('/')) BASE = BASE + '/';

    // load escuelas
    schoolsRaw = await fetchCSV(BASE + 'escuelas.csv');
    // normalize CUPOS to numeric and ensure fields exist
    schoolsRaw = schoolsRaw.map(r => ({
      COD_DANE: r.COD_DANE || r.COD || r.codigo || '',
      CENTRO_EDUCATIVO: r.CENTRO_EDUCATIVO || r.NOMBRE || r.centro || '',
      CUPOS: parseInt(r.CUPOS) || 0,
      // keep original raw row for later fields
      _raw: r
    }));

    // load weeks
    for(let i=1;i<=4;i++){
      rawWeeks[i] = await fetchCSV(BASE + `Semana ${i}.csv`);
    }

    populateWeeksSelect();
    renderSchoolsTable();
    showAlert('CSV cargados correctamente. Ahora selecciona ciclos y menús.');
  }catch(e){ console.error(e); showAlert('Error cargando CSVs: '+e.message); }
}

function populateWeeksSelect(){
  const sel = $('semanas'); sel.innerHTML = '';
  for(let i=1;i<=4;i++){
    const o = document.createElement('option'); o.value = i; o.text = 'Semana '+i; sel.appendChild(o);
  }
}

function renderSchoolsTable(){
  const tbody = $('schools-table').querySelector('tbody'); tbody.innerHTML='';
  schoolsRaw.forEach((s, i)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input type="checkbox" class="sel-school" data-i="${i}" checked></td>
                    <td>${s.COD_DANE}</td>
                    <td>${s.CENTRO_EDUCATIVO}</td>
                    <td><input type="number" class="cup-input" data-i="${i}" value="${s.CUPOS}" min="0" style="width:90px"></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.cup-input').forEach(inp=> inp.addEventListener('change', e=>{ const i=parseInt(e.target.dataset.i); schoolsRaw[i].CUPOS = parseInt(e.target.value)||0; updateSchoolSelect(); }));
  updateSchoolSelect();
}

function updateSchoolSelect(){ const sel = $('select-school'); sel.innerHTML=''; schoolsRaw.forEach((s,i)=>{ const opt=document.createElement('option'); opt.value=i; opt.text = `${s.CENTRO_EDUCATIVO} — ${s.CUPOS || 0}`; sel.appendChild(opt); }); }

// When user picks cycles: show two cycle selects (allow choosing same?) — we will allow up to 2 selected cycles
$('semanas').addEventListener('change', ()=>{
  const selected = [...$('semanas').selectedOptions].map(o=>o.value);
  selectedWeeks = selected;
  const container = $('menus-areas'); container.innerHTML='';
  // for Option C we want a dropdown per selected week showing available menu numbers from CSV
  selected.forEach((w)=>{
    const box = document.createElement('div'); box.style.marginTop='8px';
    const label = document.createElement('label'); label.textContent = 'Semana '+w+' — seleccione menús (Ctrl/Comando+clic para multiselección)';
    const select = document.createElement('select'); select.multiple = true; select.dataset.week = w; select.size = 6; select.style.width = '100%';
    // populate options with unique menu numbers found in rawWeeks[w]
    const data = rawWeeks[w] || [];
    const set = new Set();
    data.forEach(row=>{
      const m = (row['menú']||row['menu']||row['Menu']||row['Menú']||'').toString().trim();
      if(m) set.add(m);
    });
    Array.from(set).sort((a,b)=> parseInt(a)-parseInt(b)).forEach(m=>{ const o=document.createElement('option'); o.value=m; o.text = 'Menú '+m; select.appendChild(o); });
    box.appendChild(label); box.appendChild(select); container.appendChild(box);
  });
});

function collectMenus(){ menusByWeek = {}; document.querySelectorAll('#menus-areas select').forEach(s=>{ const week = s.dataset.week; const vals = [...s.selectedOptions].map(o=>o.value); menusByWeek[week] = vals; }); }

function buildProductsFromSelection(){ PRODUCTS = {};
  for(const w of Object.keys(menusByWeek)){
    const menus = menusByWeek[w]; if(!menus || menus.length===0) continue;
    const data = rawWeeks[w] || [];
    data.forEach(row=>{
      const menuVal = (row['menú']||row['menu']||row['Menu']||row['Menú']||'').toString().trim();
      if(!menus.includes(menuVal)) return;
      const prod = (row['producto']||row['Producto']||'').trim(); if(!prod) return;
      const cantidad = parseFloat(row['cantidad']) || 0;
      const unidad = (row['unidad']||'').trim();
      const empaque = parseFloat(row['empaque']) || 1;
      const key = `${prod}||${unidad}||${empaque}`;
      if(!PRODUCTS[key]) PRODUCTS[key] = {producto:prod, unidad, empaque, porEstudiante_sum:0, weeks:{}};
      PRODUCTS[key].porEstudiante_sum += cantidad;
      PRODUCTS[key].weeks[w] = (PRODUCTS[key].weeks[w]||0) + cantidad;
    });
  }
}

function prepareCalculation(){
  if(selectedWeeks.length===0) return showAlert('Selecciona al menos un ciclo (Semana) en el selector izquierdo.');
  collectMenus();
  // ensure menus chosen for each selected week
  for(const w of selectedWeeks){ if(!(menusByWeek[w] && menusByWeek[w].length)) return showAlert('Selecciona al menos 1 menú para la semana '+w); }
  buildProductsFromSelection();
  if(Object.keys(PRODUCTS).length===0) return showAlert('No se encontraron productos para las combinaciones seleccionadas.');
  showAlert('Menús preparados. Presiona Calcular víveres.');
}

function calculateAll(){
  if(Object.keys(PRODUCTS).length===0){ showAlert('Primero prepara los menús (Cargar menús).'); return; }
  // read cups from schoolsRaw
  const results = schoolsRaw.map(s=>{
    const C = parseInt(s.CUPOS)||0;
    const prodMap = {};
    Object.values(PRODUCTS).forEach(p=>{
      const total_quincena = p.porEstudiante_sum * C; // total grams (or units) for quincena
      const cantidad_sin = total_quincena / (parseFloat(p.empaque)||1);
      const cantidad_ent = Math.ceil(cantidad_sin);
      prodMap[p.producto] = {unidad:p.unidad, empaque:p.empaque, porEstudiante:p.porEstudiante_sum, total_quincena, cantidad_sin, cantidad_ent, weeks: p.weeks};
    });
    return {school:s, products:prodMap};
  });
  // summary
  const summary = {};
  results.forEach(r=>{
    for(const prod in r.products){ const t = r.products[prod].total_quincena; if(!summary[prod]) summary[prod] = {total:0, unidad:r.products[prod].unidad, empaque:r.products[prod].empaque}; summary[prod].total += t; }
  });
  window.__PAE = {results, summary}; renderPreview(); renderSummary(); showAlert('Cálculo completado. Revisa la vista previa y genera el PDF final.');
}

function renderPreview(){ const idx = parseInt($('select-school').value || 0); if(!window.__PAE) return $('acta-preview').innerText = 'No hay cálculos'; const r = window.__PAE.results[idx]; if(!r) return; const s = r.school; const products = r.products;
  // build polished HTML that matches the official layout
  let html = `<div class="pdf-acta" style="padding:8px;background:#fff;border-radius:6px">
    <div style="display:flex;align-items:center;gap:8px">
      <div style="flex:1"><img src="${imageUrl('Imagen1.png',0).repoUrl}" style="height:56px;margin-right:6px" onerror="this.src='${imageUrl('Imagen1.png',0).fallback}'"></div>
      <div style="text-align:right"><strong>ACTA DE ENTREGA DE VÍVERES PAE</strong></div>
    </div>
    <table style="margin-top:8px"><tr><th>Operador</th><td>${$('operador').value}</td><th>N° de entrega</th><td>${$('entrega-num').value}</td></tr>`;
  html += `<tr><th>Municipio</th><td>${$('municipio').value}</td><th>Subregión</th><td>${$('subregion').value}</td></tr>`;
  html += `<tr><th>Establecimiento</th><td>${s.CENTRO_EDUCATIVO}</td><th>Código DANE</th><td>${s.COD_DANE}</td></tr>`;
  html += `<tr><th>Lugar de entrega</th><td>${$('lugar').value}</td><th>Fecha de entrega</th><td>${$('fecha-entrega').value}</td></tr>`;
  html += `<tr><th>Fechas de consumo</th><td>Desde: ${$('desde').value}</td><th>Hasta</th><td>${$('hasta').value}</td></tr>`;
  html += `<tr><th>Hora</th><td>${$('hora').value}</td><th>Placa</th><td>${$('placa').value}</td></tr></table>`;
  html += `<h4 style="margin-top:8px">Relación de víveres con unidad de medida y cantidad a entregar</h4>`;
  html += `<table><thead><tr><th>Listado de víveres</th><th>Gr x cupo</th><th>Gr x total cupos</th><th>Unidad</th><th>Cant sin redondear</th><th>Cant entregada</th></tr></thead><tbody>`;
  for(const p in products){ const v = products[p]; html += `<tr><td>${p}</td><td class="right">${v.porEstudiante}</td><td class="right">${v.total_quincena}</td><td class="right">${v.unidad || v.empaque}</td><td class="right">${v.cantidad_sin.toFixed(4)}</td><td class="right">${v.cantidad_ent}</td></tr>`; }
  html += `</tbody></table></div>`;
  $('acta-preview').innerHTML = html;
}

function renderSummary(){ if(!window.__PAE) return; const s = window.__PAE.summary; let html = '<table><thead><tr><th>Producto</th><th>Total (unidad base)</th><th>Empaque</th><th>Entregas redondeadas</th></tr></thead><tbody>';
  for(const p in s){ const it = s[p]; const entregas = Math.ceil(it.total/(parseFloat(it.empaque)||1)); html += `<tr><td>${p}</td><td class="right">${it.total.toFixed(2)}</td><td class="right">${it.empaque}</td><td class="right">${entregas}</td></tr>`; }
  html += '</tbody></table>'; $('summary-box').innerHTML = html; }

// Build the official acta HTML for a school (used when building PDF)
function buildActaHtml(r){
  const s = r.school; const products = r.products;
  // header images inline
  const imgs = FALLBACK_IMAGES.map((path, idx)=>`<img src="${BASE+ 'Imagen' + (idx+1) + '.png'}" style="height:48px;margin-right:6px" onerror="this.src='${path}'"/>`).join('');
  let html = `<div class="acta"><div class="header">${imgs}<div style="flex:1;text-align:right"><strong>ACTA DE ENTREGA DE VÍVERES PAE</strong></div></div>`;
  html += `<table><tr><th>Operador</th><td>${$('operador').value}</td><th>N° de entrega</th><td>${$('entrega-num').value}</td></tr>`;
  html += `<tr><th>Municipio</th><td>${$('municipio').value}</td><th>Subregión</th><td>${$('subregion').value}</td></tr>`;
  html += `<tr><th>Establecimiento</th><td>${s.CENTRO_EDUCATIVO}</td><th>Código DANE</th><td>${s.COD_DANE}</td></tr>`;
  html += `<tr><th>Lugar de entrega</th><td>${$('lugar').value}</td><th>Fecha de entrega</th><td>${$('fecha-entrega').value}</td></tr>`;
  html += `<tr><th>Fechas consumo</th><td>Desde: ${$('desde').value}</td><th>Hasta</th><td>${$('hasta').value}</td></tr>`;
  html += `<tr><th>Hora</th><td>${$('hora').value}</td><th>Placa</th><td>${$('placa').value}</td></tr></table>`;
  html += `<h4>Relación de víveres con unidad de medida y cantidad a entregar</h4>`;
  html += `<table><thead><tr><th>Listado de víveres</th><th>Gr x cupo</th><th>Gr x total cupos</th><th>Unidad</th><th>Cant sin redondear</th><th>Cant entregada</th></tr></thead><tbody>`;
  for(const p in products){ const v = products[p]; html += `<tr><td>${p}</td><td class="right">${v.porEstudiante}</td><td class="right">${v.total_quincena}</td><td class="right">${v.unidad || v.empaque}</td><td class="right">${v.cantidad_sin.toFixed(4)}</td><td class="right">${v.cantidad_ent}</td></tr>`; }
  html += `</tbody></table>`;
  html += `<div style="margin-top:12px"><table><tr><td style="height:70px"></td><td style="height:70px"></td></tr><tr><td style="text-align:center">NOMBRE<br>CARGO<br>NUMERO DE CEDULA</td><td style="text-align:center">NOMBRE<br>CARGO<br>NUMERO DE CEDULA<br>Entrega — Municipio ___ Operador ___</td></tr></table></div>`;
  html += `</div>`;
  return html;
}

async function generateSinglePdf(){
  if(!window.__PAE) return showAlert('Primero calcula.');
  const {results, summary} = window.__PAE;
  const entrega = $('entrega-num').value;
  // Build container with selected schools
  const container = document.createElement('div'); container.className = 'pdf-container';
  const checkboxes = document.querySelectorAll('.sel-school');
  for(let i=0;i<results.length;i++){
    if(!checkboxes[i] || !checkboxes[i].checked) continue; // skip unselected
    const actaHtml = buildActaHtml(results[i]);
    const wrapper = document.createElement('div'); wrapper.innerHTML = actaHtml;
    container.appendChild(wrapper);
  }
  // Add summary page
  const sumWrap = document.createElement('div'); sumWrap.className = 'acta';
  let sumHtml = `<div style="text-align:center;font-weight:700;margin-bottom:8px">Resumen consolidado de la entrega</div>`;
  sumHtml += `<div><strong>Nº entrega:</strong> ${entrega} — <strong>Operador:</strong> ${$('operador').value}</div>`;
  sumHtml += `<table><thead><tr><th>Producto</th><th>Total</th><th>Empaque</th><th>Entregas</th></tr></thead><tbody>`;
  for(const p in summary){ const it = summary[p]; const entregas = Math.ceil(it.total/(parseFloat(it.empaque)||1)); sumHtml += `<tr><td>${p}</td><td class="right">${it.total.toFixed(2)}</td><td class="right">${it.empaque}</td><td class="right">${entregas}</td></tr>`; }
  sumHtml += '</tbody></table>';
  sumWrap.innerHTML = sumHtml; container.appendChild(sumWrap);

  await html2pdf().set({margin:10, filename:`Actas_Entrega${entrega}.pdf`, image:{type:'jpeg',quality:0.95}, html2canvas:{scale:1.2, useCORS:true}, jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}}).from(container).save();
  showAlert('PDF único generado con actas seleccionadas + resumen.');
}

// ---------- Event wiring ----------
window.addEventListener('DOMContentLoaded', ()=>{
  // wire buttons if exist
  const btnFetch = $('btn-fetch'); if(btnFetch) btnFetch.addEventListener('click', loadAllCsvs);
  const btnLoadMenus = $('btn-load-menus'); if(btnLoadMenus) btnLoadMenus.addEventListener('click', prepareCalculation);
  const btnCalc = $('btn-calc'); if(btnCalc) btnCalc.addEventListener('click', calculateAll);
  const btnGen = $('btn-generate'); if(btnGen) btnGen.addEventListener('click', generateSinglePdf);
  const selectSchool = $('select-school'); if(selectSchool) selectSchool.addEventListener('change', renderPreview);
  const search = $('search-school'); if(search) search.addEventListener('input', ()=>{ const q = search.value.toLowerCase(); document.querySelectorAll('#schools-table tbody tr').forEach(tr=>{ tr.style.display = tr.innerText.toLowerCase().includes(q) ? '' : 'none'; }); });
  const selectAll = $('btn-select-all'); if(selectAll) selectAll.addEventListener('click', ()=>document.querySelectorAll('.sel-school').forEach(cb=> cb.checked = true));
});

// End of script.js
