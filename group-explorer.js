/* The atlas uses border-derived groups and registry-assigned sample rows. */
let groupMap, groupMarkers, groupIndex = [], groupChoices = [], groupSelected = new Set();
let groupId = 'elements', groupField = '', groupAxis = 'age', groupWindow = null;
let groupPlotted = [], groupReady = false;
const groupColors = ['#267a98','#d99039','#5a9b78','#8666ae','#bf6271','#5486c0'];
const groupFieldKey = (field, unit) => JSON.stringify([field, unit]);
const groupFinite = value => typeof value === 'number' && Number.isFinite(value);

function groupPointSite(record, coreIndex) {
  return record.siteIds?.length === 1 ? record.siteIds[0] : record.coreSiteIds?.[coreIndex];
}

function initGroupExplorer() {
  const sites = new Map((dataset.registry?.sites || []).map(site => [site.site_id,site]));
  for (const record of records) {
    const fields = new Set([...Object.keys(record.series || {}),...Object.keys(record.undatedSeries || {})]);
    for (const field of fields) {
      const id = record.fieldGroups?.[field];
      if (!id) continue;
      const bySite = new Map();
      const add = (siteId, point) => {
        if (!sites.has(siteId)) return;
        if (!bySite.has(siteId)) bySite.set(siteId,[]);
        bySite.get(siteId).push(point);
      };
      for (const p of record.series?.[field] || []) {
        const meta = record.pointMeta?.[p[2]];
        if (!meta) continue;
        add(groupPointSite(record,meta[3]),{age:p[0],value:p[1],depth:meta[1],row:meta[2],core:record.coreLabels?.[meta[3]] || record.core,ageRaw:meta[4],error:p[3] ?? null});
      }
      for (const p of record.undatedSeries?.[field] || []) {
        add(groupPointSite(record,p[3]),{age:null,depth:p[0],value:p[1],row:p[2],core:record.coreLabels?.[p[3]] || record.core,ageRaw:null,error:p[4] ?? null});
      }
      for (const [siteId,points] of bySite) groupIndex.push({groupId:id,field,unit:record.proxyUnits?.[field] || '',key:groupFieldKey(field,record.proxyUnits?.[field] || ''),site:sites.get(siteId),record,points});
    }
  }
  const populated = new Set(groupIndex.map(entry => entry.groupId));
  groupChoices = (dataset.borderGroups || []).filter(group => populated.has(group.id));
  if (!populated.has(groupId)) groupId = groupChoices[0]?.id || '';
  $('#group-select').innerHTML = groupChoices.map(group => `<option value="${esc(group.id)}">${esc(group.label)}</option>`).join('');
  $('#group-select').value = groupId;
  $('#group-select').addEventListener('change',() => {groupId=$('#group-select').value;groupField='';groupWindow=null;$('#group-search').value='';groupSelected.clear();refreshGroupExplorer(true);});
  $('#group-measurement').addEventListener('change',() => {groupField=$('#group-measurement').value;groupWindow=null;refreshGroupExplorer();});
  $('#group-axis').addEventListener('change',() => {groupAxis=$('#group-axis').value;groupWindow=null;refreshGroupExplorer();});
  $('#group-search').addEventListener('input',renderGroupCoverage);
  $('#group-clear').addEventListener('click',() => {groupSelected.clear();renderGroupCoverage();renderGroupPlots();});
  $('#group-fit').addEventListener('click',fitGroupMap);
  $('#group-download').addEventListener('click',downloadGroupObservations);
  $('#group-range-apply').addEventListener('click',() => {
    const lo=$('#group-from').value.trim(),hi=$('#group-to').value.trim();
    if ((lo && !Number.isFinite(Number(lo))) || (hi && !Number.isFinite(Number(hi))) || (lo && hi && Number(hi)<=Number(lo))) {
      $('#group-range-note').textContent='Enter a start value smaller than the end value.';return;
    }
    groupWindow=[lo?Number(lo):null,hi?Number(hi):null];renderGroupPlots();
  });
  $('#group-range-reset').addEventListener('click',() => {groupWindow=null;$('#group-from').value='';$('#group-to').value='';renderGroupPlots();});
  groupReady=true;refreshGroupExplorer(true);
}

function groupAvailableEntries() {
  return groupIndex.filter(entry => entry.groupId===groupId && (!groupField || entry.key===groupField) && entry.points.some(point=>groupFinite(point[groupAxis])));
}
function groupVisibleSites() {
  const term=$('#group-search').value.trim().toLowerCase(),sites=new Map();
  for (const entry of groupAvailableEntries()) {
    const site=entry.site;
    if (!`${site.canonical_label} ${site.aliases.join(' ')} ${site.region} ${site.basin} ${site.record_ids.join(' ')}`.toLowerCase().includes(term)) continue;
    if (!sites.has(site.site_id)) sites.set(site.site_id,{site,entries:[]});
    sites.get(site.site_id).entries.push(entry);
  }
  return [...sites.values()].sort((a,b)=>a.site.canonical_label.localeCompare(b.site.canonical_label));
}
function groupHasLocation(site) {
  return site.map_ready && groupFinite(site.latitude) && groupFinite(site.longitude) && Math.abs(site.latitude)<=90 && Math.abs(site.longitude)<=180;
}
function refreshGroupExplorer(selectFirst=false) {
  const group=groupChoices.find(item=>item.id===groupId),fields=new Map();
  for (const entry of groupIndex.filter(entry=>entry.groupId===groupId && entry.points.some(point=>groupFinite(point[groupAxis])))) {
    if (!fields.has(entry.key)) fields.set(entry.key,{field:entry.field,unit:entry.unit,count:0});
    fields.get(entry.key).count+=entry.points.filter(point=>groupFinite(point[groupAxis])).length;
  }
  if (!fields.has(groupField)) groupField='';
  $('#group-measurement').innerHTML='<option value="">All measurements in this group</option>'+[...fields].sort((a,b)=>b[1].count-a[1].count || a[1].field.localeCompare(b[1].field)).map(([key,item])=>`<option value="${esc(key)}">${esc(proxyLabel(item.field))} · ${esc(item.unit || 'unit not specified')}</option>`).join('');
  $('#group-measurement').value=groupField;
  $('#group-description').textContent=`${group?.description || ''}. Groups follow the borders in each workbook; names describe the section headers.`;
  $('#group-from').value='';$('#group-to').value='';
  const ids=new Set(groupAvailableEntries().map(entry=>entry.site.site_id));
  groupSelected=new Set([...groupSelected].filter(id=>ids.has(id)));
  if (selectFirst) {
    const available=groupVisibleSites();
    const first=available.find(item=>groupHasLocation(item.site)) || available[0];
    if (first) groupSelected.add(first.site.site_id);
  }
  renderGroupCoverage();renderGroupPlots();
}

function ensureGroupMap() {
  if (groupMap || !window.L || !window.PO2_LAND) return;
  groupMap=L.map('group-map',{crs:L.CRS.EPSG4326,minZoom:0,maxZoom:7,scrollWheelZoom:false,maxBounds:[[-90,-210],[90,210]],maxBoundsViscosity:0.7}).setView([0,0],0);
  L.geoJSON(window.PO2_LAND,{interactive:false,style:{color:'#a0b4b5',weight:0.6,fillColor:'#e1e8df',fillOpacity:1}}).addTo(groupMap);
  groupMarkers=L.layerGroup().addTo(groupMap);
  groupMap.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>');
  groupMap.fitBounds([[-70,-180],[80,180]]);
}
function groupViewShown() {
  if (!groupReady) return;
  requestAnimationFrame(()=>{ensureGroupMap();groupMap?.invalidateSize();renderGroupMap();document.querySelectorAll('#group-plots .group-plot').forEach(node=>window.Plotly?.Plots.resize(node));});
}
function toggleGroupSite(id) {
  if (groupSelected.has(id)) groupSelected.delete(id);else groupSelected.add(id);
  renderGroupCoverage();renderGroupPlots();
}
function renderGroupCoverage() {
  const visible=groupVisibleSites(),located=visible.filter(item=>groupHasLocation(item.site));
  $('#group-counts').textContent=`${fmt(visible.length)} ${visible.length===1?'core':'cores'} with ${groupAxis==='age'?'dated':'depth-linked'} data · ${fmt(located.length)} on the map · ${fmt(visible.length-located.length)} without a map location`;
  $('#group-core-list').innerHTML=visible.map(({site,entries})=>{
    const count=entries.reduce((n,entry)=>n+entry.points.filter(point=>groupFinite(point[groupAxis])).length,0);
    const sources=new Set(entries.map(entry=>entry.record.id));
    return `<label class="group-core-option ${groupSelected.has(site.site_id)?'selected':''}"><input type="checkbox" data-group-site="${esc(site.site_id)}" ${groupSelected.has(site.site_id)?'checked':''}><span><strong>${esc(site.canonical_label)}</strong><small>${fmt(sources.size)} ${sources.size===1?'source':'sources'} · ${fmt(count)} values · ${groupHasLocation(site)?'On map':'Location unavailable'}</small></span></label>`;
  }).join('') || '<p class="chart-empty">No cores match this group, measurement, axis and search.</p>';
  $('#group-core-list').querySelectorAll('[data-group-site]').forEach(input=>input.addEventListener('change',()=>toggleGroupSite(input.dataset.groupSite)));
  $('#group-selection-count').textContent=`${fmt(groupSelected.size)} ${groupSelected.size===1?'core':'cores'} selected`;
  if (!$('#groups').hidden) {ensureGroupMap();renderGroupMap();}
}
function renderGroupMap() {
  if (!groupMap) return;
  groupMarkers.clearLayers();
  const positions=new Map();
  for (const {site} of groupVisibleSites()) if (groupHasLocation(site)) {
    const key=`${site.latitude},${site.longitude}`;
    if (!positions.has(key)) positions.set(key,[]);
    positions.get(key).push(site);
  }
  for (const sites of positions.values()) {
    const selected=sites.some(site=>groupSelected.has(site.site_id));
    const marker=L.circleMarker([sites[0].latitude,sites[0].longitude],{radius:selected?8:5.5,color:selected?'#8d4e11':'#15566e',weight:1.5,fillColor:selected?'#eca749':'#3b9bad',fillOpacity:0.9}).addTo(groupMarkers);
    marker.bindTooltip(sites.map(site=>esc(site.canonical_label)).join('<br>'));
    const popup=document.createElement('div');popup.className='group-map-popup';
    popup.innerHTML=sites.map(site=>`<strong>${esc(site.canonical_label)}</strong><small>${esc(statusLabel(site.location_status))}${site.water_depth_m==null?'':` · ${fmt(site.water_depth_m)} m water depth`}</small><button type="button" data-map-site="${esc(site.site_id)}">${groupSelected.has(site.site_id)?'Remove from plots':'Add to plots'}</button>`).join('');
    popup.querySelectorAll('[data-map-site]').forEach(button=>button.addEventListener('click',()=>toggleGroupSite(button.dataset.mapSite)));
    marker.bindPopup(popup);
    if (sites.length===1) marker.on('click',()=>toggleGroupSite(sites[0].site_id));
  }
}
function fitGroupMap() {
  ensureGroupMap();
  const located=groupVisibleSites().filter(item=>groupHasLocation(item.site));
  if (located.length) groupMap?.fitBounds(L.latLngBounds(located.map(({site})=>[site.latitude,site.longitude])),{padding:[30,30],maxZoom:4});
  else groupMap?.fitBounds([[-70,-180],[80,180]]);
}

function groupFilteredPoints(entry) {
  return entry.points.filter(point=>groupFinite(point[groupAxis]) && (!groupWindow || ((groupWindow[0]==null || point[groupAxis]>=groupWindow[0]) && (groupWindow[1]==null || point[groupAxis]<=groupWindow[1]))));
}
function renderGroupPlots() {
  const container=$('#group-plots');
  if (window.Plotly) container.querySelectorAll('.group-plot').forEach(node=>Plotly.purge(node));
  container.innerHTML='';groupPlotted=[];
  $('#group-sources').innerHTML='';
  $('#group-observation').textContent='Select a point to see its workbook row and sample details.';
  const selected=groupAvailableEntries().filter(entry=>groupSelected.has(entry.site.site_id));
  const facets=new Map();
  for (const entry of selected) {
    const points=groupFilteredPoints(entry);
    if (!points.length) continue;
    const key=groupAxis==='depth'?JSON.stringify([entry.key,entry.record.depthUnit || '']):entry.key;
    if (!facets.has(key)) facets.set(key,[]);
    facets.get(key).push({...entry,points});
    groupPlotted.push({...entry,points});
  }
  const allFacets=[...facets.values()].sort((a,b)=>b.reduce((n,e)=>n+e.points.length,0)-a.reduce((n,e)=>n+e.points.length,0));
  const drawn=allFacets.slice(0,6),total=groupPlotted.reduce((n,entry)=>n+entry.points.length,0);
  $('#group-download').disabled=!total;
  $('#group-range-label').textContent=groupAxis==='age'?'Age range (ka BP)':'Sample-depth range (source units)';
  $('#group-range-note').textContent=groupWindow?'Range applied to plots and download.':'Full range shown. Drag within a plot to zoom; double-click to reset.';
  $('#group-plot-summary').textContent=total?`${fmt(total)} observations across ${fmt(groupPlotted.length)} core/source/measurement series. ${allFacets.length>6?`Showing 6 of ${fmt(allFacets.length)} measurement panels; choose a measurement above to see another. Download includes all ${fmt(total)} matching observations.`:'Measurements and units are kept on separate panels.'}`:'Select a core on the map or in the list to plot its data.';
  if (!drawn.length) {container.innerHTML=`<div class="group-empty">${groupSelected.size?'No observations for the selected cores in this range. Change the range, axis or measurement.':'Select one or more cores to compare their measurements.'}</div>`;return;}
  const selectedIds=[...groupSelected];
  for (const entries of drawn) {
    const first=entries[0],panel=document.createElement('article');panel.className='panel group-chart-panel';
    const n=entries.reduce((sum,entry)=>sum+entry.points.length,0);
    panel.innerHTML=`<div class="panel-heading"><div><h3>${esc(proxyLabel(first.field))}</h3><p>${esc(first.unit || 'Unit not specified')} · ${fmt(n)} observations</p></div></div><div class="group-plot"></div><p class="group-chart-caption"></p>`;
    container.append(panel);const node=panel.querySelector('.group-plot');
    let shown=0;
    const traces=entries.map(entry=>{
      const ordered=[...entry.points].sort((a,b)=>a[groupAxis]-b[groupAxis]),stride=Math.max(1,Math.ceil(ordered.length/2500));
      const points=ordered.filter((_,i)=>i%stride===0 || i===ordered.length-1);shown+=points.length;
      const color=groupColors[selectedIds.indexOf(entry.site.site_id)%groupColors.length];
      const trace={type:'scatter',mode:'markers',name:`${entry.site.canonical_label} · ${entry.record.file.replace(/\.xlsx$/,'')}`,x:points.map(point=>point[groupAxis]),y:points.map(point=>point.value),marker:{color,size:5,opacity:.8},customdata:points.map(point=>[esc(entry.record.file),point.row,esc(point.core),point.age,point.depth,esc(entry.record.depthUnit || ''),esc(entry.record.proxyErrors?.[entry.field]?.unit || '')]),hovertemplate:`<b>%{customdata[2]}</b><br>${groupAxis==='age'?'Age: %{x} ka BP':'Depth: %{x} '+esc(entry.record.depthUnit || '')}<br>${esc(first.field)}: %{y} ${esc(first.unit)}<br>%{customdata[0]} · row %{customdata[1]}<extra></extra>`};
      const uncertainty=entry.record.proxyErrors?.[entry.field];
      if (uncertainty && /^(1\s*sd|1\s*se|2\s*sd|sd|se)$/i.test(uncertainty.unit.trim()) && points.some(point=>groupFinite(point.error) && point.error>=0)) trace.error_y={type:'data',array:points.map(point=>groupFinite(point.error) && point.error>=0?point.error:0),visible:true,thickness:.7,width:2,color};
      return trace;
    });
    const xTitle=groupAxis==='age'?'Age (ka BP)':`Sample depth (${first.record.depthUnit || 'unit not specified'})`;
    const layout={autosize:true,height:365,margin:{l:75,r:22,t:10,b:100},font:{family:'Inter, system-ui, sans-serif',size:11,color:'#446575'},paper_bgcolor:'#fff',plot_bgcolor:'#fff',xaxis:{title:{text:xTitle},gridcolor:'#e8eff2',zeroline:false},yaxis:{title:{text:first.unit || 'Measurement value'},gridcolor:'#e8eff2',zeroline:false},legend:{orientation:'h',y:-.24,x:0,font:{size:9}},hovermode:'closest',dragmode:'zoom',uirevision:`${groupId}-${groupField}-${groupAxis}-${groupWindow}`};
    if (window.Plotly) {
      Plotly.newPlot(node,traces,layout,{responsive:true,displaylogo:false,modeBarButtonsToRemove:['lasso2d','select2d'],toImageButtonOptions:{filename:`PO2-${first.field}`,format:'png',scale:2}});
      node.on('plotly_click',event=>{
        const p=event.points[0],details=p.customdata;
        $('#group-observation').innerHTML=`<strong>${details[2]}</strong> · ${details[0]} · workbook row ${esc(details[1])} · ${esc(first.field)} = ${esc(p.y)} ${esc(first.unit)} · age ${details[3]==null?'unavailable':esc(details[3])+' ka BP'} · sample depth ${details[4]==null?'unavailable':esc(details[4])+' '+details[5]}`;
      });
    } else node.textContent='The chart library is unavailable. You can still download the selected observations.';
    const uncertainty=[...new Set(entries.map(entry=>entry.record.proxyErrors?.[entry.field]?.unit).filter(Boolean))];
    panel.querySelector('.group-chart-caption').textContent=`${shown<n?`${fmt(shown)} points displayed from ${fmt(n)} observations; download retains every matching value. `:''}${uncertainty.length?`Reported error columns: ${uncertainty.join(', ')}. Recognised SD/SE errors are drawn as supplied. `:''}Dots are original measurements; no interpolation is applied.`;
  }
  const sources=new Map(groupPlotted.map(entry=>[entry.record.id,entry]));
  $('#group-sources').innerHTML=[...sources.values()].map(entry=>{
    const section=entry.record.borderSections?.find(section=>section.groupId===groupId && entry.record.fieldColumns?.[entry.field]>section.start && entry.record.fieldColumns?.[entry.field]<=section.end);
    return `<article><strong>${esc(entry.record.file)}</strong><p>${esc(entry.record.reference || 'No reference entered in the source workbook.')}</p><small>Bordered section: ${esc(section?.columns || 'not recorded')} · ${esc(entry.record.borderSections?.length?'Workbook headers and unit row':'')}${sampleDepthWarning(entry.record)?` · ${esc(sampleDepthWarning(entry.record))}`:''}</small></article>`;
  }).join('');
}

function downloadGroupObservations() {
  const headers=['proxy_group','core','site_id','source_workbook','sheet_row','source_column','field','unit','value','reported_error','error_definition','age_ka_BP','source_age','source_age_unit','sample_depth','sample_depth_unit','reference'];
  const rows=[];
  for (const entry of groupPlotted) for (const point of entry.points) rows.push([groupChoices.find(group=>group.id===entry.groupId)?.label,point.core,entry.site.site_id,entry.record.file,point.row,entry.record.fieldColumns?.[entry.field],entry.field,entry.unit,point.value,point.error,entry.record.proxyErrors?.[entry.field]?.unit,point.age,point.ageRaw,entry.record.ageUnit,point.depth,entry.record.depthUnit,entry.record.reference]);
  const cell=value=>{let text=String(value??'');if (/^[=+@\t\r]/.test(text)) text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const csv='\uFEFF'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');
  link.href=url;link.download=`PO2-${groupId}-${groupAxis}.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
