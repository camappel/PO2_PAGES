const $ = (selector) => document.querySelector(selector);
let dataset, records, selectedRecord, selectedProfile, selectedInspectorSite;
let checkedInspectorRecords = new Set(), inspectorFieldChoices = [], inspectorFieldKey = '', inspectorRenderedPoints = [];
let inspectorAgeMin = 0, inspectorAgeMax = null, inspectorAgeSite = '';
const fmt = (n) => new Intl.NumberFormat('en-GB').format(n);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const proxyLabel = (name) => name.replaceAll('_', ' ');
const activeProxies = record => Object.keys(record.series).filter(name => record.series[name].length);

function showView(name, updateRoute = true) {
  document.body.dataset.view = name;
  document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== name; el.classList.toggle('active', el.id === name); });
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === name);
    if (el.dataset.view === name) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  if (updateRoute) {
    const hash = name === 'profiles' && selectedProfile ? `#profile/${encodeURIComponent(selectedProfile)}` : name === 'inspector' && selectedInspectorSite ? `#inspector/${encodeURIComponent(selectedInspectorSite)}` : `#${name}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }
  window.scrollTo({top: 0, behavior: 'smooth'});
  if (name === 'groups' && typeof groupViewShown === 'function') groupViewShown();
}

function renderMetrics() {
  const metrics = [
    ['Source workbooks', records.length, 'Individual core/reference files', '#61a6bd'],
    ['Core labels', new Set(records.map(r => r.core)).size, 'Supplied IDs; not yet harmonised', '#dc9e4a'],
    ['Dated rows', records.reduce((n,r) => n+r.dated,0), 'Age values with known units', '#84bcb1'],
    ['Numeric fields', new Set(records.flatMap(activeProxies)).size, 'Measurements and taxa with dated values', '#577fad'],
  ];
  $('#metrics').innerHTML = metrics.map(([label,value,foot,color]) => `<div class="metric" style="--accent:${color}"><div class="metric-label">${label}</div><div class="metric-value">${fmt(value)}</div><div class="metric-foot">${foot}</div></div>`).join('');
}

function renderProxyCoverage() {
  const counts = {};
  for (const r of records) for (const name of activeProxies(r)) counts[name] = (counts[name] || 0) + 1;
  const top = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,12);
  const max = top[0]?.[1] || 1;
  $('#proxy-chart').innerHTML = top.map(([name,count]) => `<div class="bar-row" title="${esc(name)}: ${count} source workbooks"><span>${esc(proxyLabel(name))}</span><div class="bar-track"><div class="bar-fill" style="width:${count/max*100}%"></div></div><span class="bar-number">${count}</span></div>`).join('');
}

function renderAgeCoverage() {
  const bins = Array.from({length:21}, (_,i) => i*10);
  const counts = Object.fromEntries(bins.map(x => [x,0]));
  for (const r of records) for (const [key,n] of Object.entries(r.ageBins || {})) counts[+key] += n;
  const max = Math.max(...Object.values(counts), 1);
  $('#age-chart').innerHTML = bins.map((age,i) => `<div class="age-col" title="${age === 200 ? 'Over 200 ka' : age+'–'+(age+10)+' ka'}: ${fmt(counts[age])} dated rows"><div class="age-bar" style="height:${Math.max(2,counts[age]/max*100)}%"></div><label>${age === 200 ? '200+' : age}</label></div>`).join('');
}

function renderTable() {
  const term = $('#record-search').value.trim().toLowerCase();
  const shown = records.filter(r => `${r.core} ${r.file}`.toLowerCase().includes(term)).sort((a,b) => b.dated-a.dated);
  $('#record-rows').innerHTML = shown.slice(0,50).map(r => { const n=activeProxies(r).length; return `<tr><td>${esc(r.core)}<small>${esc(r.file)}</small></td><td>${fmt(r.dated)}</td><td>${r.ageMin == null ? '—' : `${r.ageMin}–${r.ageMax} ka`}</td><td><span class="chip">${n} ${n===1?'type':'types'}</span></td><td><button class="text-button" data-open="${esc(r.id)}">Inspect →</button></td></tr>`; }).join('');
  $('#record-count').textContent = `${fmt(Math.min(shown.length,50))} shown · ${fmt(shown.length)} matches across ${fmt(records.length)} source records. Search to find other records.`;
  document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => { $('#core-select').value = button.dataset.open; renderCore(); showView('cores'); }));
}

function option(record) { return `<option value="${esc(record.id)}">${esc(record.core)} · ${esc(record.file)}</option>`; }
const statusLabel = value => ({archive_matched:'Archive matched',missing:'Missing location',conflict:'Location conflict',reviewed:'Reviewed',needs_review:'Identity needs review',provisional:'Provisional identity'}[value] || value);
function externalLink(url, label) {
  try { const u = new URL(url); if (['http:','https:'].includes(u.protocol)) return `<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`; } catch (_) {}
  return '';
}
const sourceLink = url => externalLink(url, 'Location source') || (url ? esc(url) : 'No location source yet');
const profileLink = s => `<a class="text-button" href="#profile/${encodeURIComponent(s.site_id)}">Read ${esc(s.canonical_label)} profile →</a>`;
function renderRegistry() {
  const registry = dataset.registry;
  $('#site-detail').hidden = true;
  if (!registry) { $('#site-count').textContent = 'Build the site registry to populate this view.'; return; }
  const summary = registry.summary;
  $('#registry-metrics').innerHTML = [
    ['Registry entries',summary.registry_entries,'Provisional cores, sites and holes'],
    ['Linked workbooks',summary.source_workbooks,'Every source file has an assignment'],
    ['Sourced locations',summary.sourced_locations ?? summary.archive_matched,'Cited coordinates; see review status'],
    ['Missing locations',summary.missing_location,'Location evidence still needed'],
  ].map(([label,value,foot])=>`<div class="metric"><div class="metric-label">${esc(label)}</div><div class="metric-value">${fmt(value)}</div><div class="metric-foot">${esc(foot)}</div></div>`).join('');
  const term = $('#site-search').value.trim().toLowerCase(), filter = $('#site-status').value;
  const shown = registry.sites.filter(s => {
    const found = `${s.canonical_label} ${s.site_id} ${s.aliases.join(' ')} ${s.basin} ${s.region} ${s.record_ids.join(' ')}`.toLowerCase().includes(term);
    return found && (filter==='all' || (filter==='located' && ['archive_matched','reviewed'].includes(s.location_status)) || (filter==='missing' && s.location_status==='missing') || (filter==='review' && s.identity_status==='needs_review'));
  });
  $('#site-rows').innerHTML = shown.map(s=>`<tr><td><a href="#profile/${encodeURIComponent(s.site_id)}">${esc(s.canonical_label)}</a><small title="${esc(s.aliases.join('; '))}">${esc(s.aliases.join('; '))}</small></td><td>${s.latitude==null?'Not available':`${s.latitude.toFixed(4)}°, ${s.longitude.toFixed(4)}°`}<small>${esc(s.basin || s.region || 'Basin not assigned')}</small></td><td>${s.water_depth_m==null?'—':`${fmt(s.water_depth_m)} m`}</td><td><span class="chip ${s.location_status==='missing'?'pending':''}">${esc(statusLabel(s.location_status))}</span>${s.identity_status==='needs_review'?'<small class="review-text">Identity needs review</small>':''}</td><td>${s.record_ids.length}</td><td><button class="text-button" data-site="${esc(s.site_id)}">Details →</button></td></tr>`).join('') || '<tr><td colspan="6">No entries match this search and filter.</td></tr>';
  $('#site-count').textContent = `${fmt(shown.length)} of ${fmt(registry.sites.length)} entries · archive metadata checked 12 October 2026 · curator review pending`;
  $('#site-rows').querySelectorAll('[data-site]').forEach(b=>b.addEventListener('click',()=>renderSiteDetail(b.dataset.site)));
}
function renderSiteDetail(id) {
  const s = dataset.registry.sites.find(s=>s.site_id===id);
  if (!s) return;
  const panel = $('#site-detail');
  panel.hidden = false;
  panel.innerHTML = `<p class="eyebrow dark">${esc(s.site_id)} · ${esc(s.entity_type.replaceAll('_',' '))}</p><h3>${esc(s.canonical_label)}</h3><p>${profileLink(s)}</p><p><button class="text-button" data-inspect-site="${esc(s.site_id)}">Open Site Inspector →</button></p><p><strong>Original labels:</strong> ${esc(s.aliases.join('; '))}</p><p>${esc(statusLabel(s.identity_status))} · ${esc(statusLabel(s.location_status))}. ${sourceLink(s.location_source)}</p>${s.location_event?`<p><strong>Archive event:</strong> ${esc(s.location_event)}</p>`:''}${s.location_note?`<p>${esc(s.location_note)}</p>`:''}${s.review_note?`<p class="review-text"><strong>Review:</strong> ${esc(s.review_note)}</p>`:''}<p class="small-label">Linked source workbooks</p><div class="site-sources">${s.record_ids.map(id=>{const r=records.find(r=>r.id===id);return r?`<button class="text-button" data-inspect-source="${esc(id)}">${esc(r.file)} →</button>`:'';}).join('')}</div>`;
  panel.querySelectorAll('[data-inspect-source]').forEach(b=>b.addEventListener('click',()=>{ $('#core-select').value=b.dataset.inspectSource;renderCore();showView('cores'); }));
  panel.querySelector('[data-inspect-site]').addEventListener('click',()=>openInspector(s.site_id));
}

const entityDescriptions = {
  core: ['Sediment core', 'A core is a column of seafloor sediment collected for study. Researchers take samples from different depths, assign them ages and measure their properties.'],
  drilling_site: ['Drilling site', 'A drilling site is a collection location. It can include several holes and many recovered core sections, so this entry represents a site rather than one tube of sediment.'],
  drilling_hole: ['Drilling hole', 'A drilling hole is one borehole at a collection site. Its samples can come from several recovered core sections within that hole.'],
  unresolved_material: ['Material awaiting identification', 'This material record has not yet been tied to a unique sampling site. Use its source workbook and identity notes to establish what was collected.'],
};
function ageSpan(min, max) {
  if (min == null || max == null) return 'No usable ages available';
  const years = min === max ? fmt(Math.round(min*1000)) : `${fmt(Math.round(min*1000))}–${fmt(Math.round(max*1000))}`;
  const ka = min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
  return `Approximately ${years} years before present (${ka} ka BP)`;
}
function profileSources(site) {
  return site.record_ids.map(id => records.find(r => r.id === id)).filter(Boolean);
}
function sampleDepthWarning(record) {
  const unit = (record.depthUnit || '').trim().toLowerCase();
  if (['m','metre','metres','meter','meters'].includes(unit) && record.depthMax > 12000) return 'Recorded sample depths are implausible for metres. Check the workbook depth unit or scale.';
  if (record.depthMin != null && record.depthMin < 0) return 'Some sample depths are negative. Check the workbook depth reference and units.';
  return '';
}
function renderProfileChoices() {
  const sites = dataset.registry?.sites || [];
  const term = $('#profile-search').value.trim().toLowerCase();
  const shown = sites.filter(s => {
    const context = dataset.profileContext?.[s.site_id];
    return `${s.canonical_label} ${s.aliases.join(' ')} ${s.region} ${s.basin} ${context?.region || ''} ${context?.study_label || ''} ${s.record_ids.join(' ')} ${profileSources(s).map(r => r.reference).join(' ')}`.toLowerCase().includes(term);
  }).sort((a,b) => a.canonical_label.localeCompare(b.canonical_label));
  if (!shown.some(s => s.site_id === selectedProfile)) selectedProfile = shown[0]?.site_id;
  $('#profile-select').innerHTML = shown.map(s => `<option value="${esc(s.site_id)}">${esc(s.canonical_label)} · ${esc(entityDescriptions[s.entity_type]?.[0] || 'Registry entry')}</option>`).join('');
  $('#profile-select').disabled = !shown.length;
  $('#profile-select').value = selectedProfile || '';
  $('#profile-count').textContent = `${fmt(shown.length)} of ${fmt(sites.length)} entries${term ? ' match your search' : ' available'} · original labels and study references are searchable`;
  renderProfile();
  if (!$('#profiles').hidden) history.replaceState(null, '', selectedProfile ? `#profile/${encodeURIComponent(selectedProfile)}` : '#profiles');
}
function openProfile(id) {
  if (!dataset.registry?.sites.some(s => s.site_id === id)) return;
  selectedProfile = id;
  $('#profile-search').value = '';
  renderProfileChoices();
  showView('profiles');
}
function openSource(id, measurement) {
  const r = records.find(r => r.id === id);
  if (!r) return;
  $('#core-select').value = id;
  renderCore();
  if (measurement && activeProxies(r).includes(measurement)) {
    $('#proxy-select').value = measurement;
    renderCore();
  }
  showView('cores');
}
function inspectorLinkedRecords(site) {
  return (site?.record_ids || []).map(id => records.find(r => r.id === id)).filter(Boolean);
}
function inspectorPointSite(record, pointIndex, siteId) {
  if ((record.siteIds || []).length === 1) return record.siteIds[0] === siteId;
  const meta = record.pointMeta?.[pointIndex];
  return !!meta && record.coreSiteIds?.[meta[3]] === siteId;
}
function inspectorSeries(record, siteId, field) {
  return (record.series?.[field] || []).filter(point => inspectorPointSite(record, point[2], siteId)).map(point => {
    const meta = record.pointMeta?.[point[2]] || [];
    return {age:point[0], value:point[1], depth:meta[1], row:meta[2], core:record.coreLabels?.[meta[3]] || record.core, ageRaw:meta[4], record, field, unit:record.proxyUnits?.[field] || '', kind:'measurement'};
  });
}
function inspectorSampleRows(record, siteId) {
  if ((record.siteIds || []).length === 1) return (record.pointMeta || []).map(meta => ({meta, record}));
  return (record.pointMeta || []).filter(meta => record.coreSiteIds?.[meta[3]] === siteId).map(meta => ({meta, record}));
}
function inspectorAgeExtent(site, linked) {
  let max = 0;
  for (const record of linked) if (checkedInspectorRecords.has(record.id)) {
    for (const {meta} of inspectorSampleRows(record, site.site_id)) if (Number.isFinite(meta[0])) max = Math.max(max, meta[0]);
  }
  return max;
}
function renderInspectorChoices() {
  const sites = dataset.registry?.sites || [];
  const term = $('#inspector-search').value.trim().toLowerCase();
  const shown = sites.filter(site => `${site.canonical_label} ${site.aliases.join(' ')} ${site.region} ${site.basin} ${site.record_ids.join(' ')}`.toLowerCase().includes(term)).sort((a,b) => a.canonical_label.localeCompare(b.canonical_label));
  const previousSite = selectedInspectorSite;
  if (!shown.some(site => site.site_id === selectedInspectorSite)) selectedInspectorSite = shown[0]?.site_id || '';
  if (previousSite !== selectedInspectorSite) {
    const nextSite = sites.find(site => site.site_id === selectedInspectorSite);
    checkedInspectorRecords = new Set(nextSite?.record_ids || []);
    inspectorFieldKey = '';
    inspectorAgeMin = 0; inspectorAgeMax = null; inspectorAgeSite = selectedInspectorSite;
  }
  $('#inspector-site').innerHTML = shown.map(site => `<option value="${esc(site.site_id)}">${esc(site.canonical_label)} · ${esc(entityDescriptions[site.entity_type]?.[0] || 'Registry entry')}</option>`).join('');
  $('#inspector-site').disabled = !shown.length;
  $('#inspector-site').value = selectedInspectorSite;
  if (!shown.length) {
    $('#inspector-summary').innerHTML = '<article class="panel"><h3>No matching sites</h3><p>Try another name or original label.</p></article>';
    $('#inspector-depth-chart').innerHTML = '';
    $('#inspector-field-chart').innerHTML = '';
    $('#inspector-studies').innerHTML = '';
    $('#inspector-field').innerHTML = '';
    return;
  }
  renderSiteInspector();
}
function openInspector(siteId) {
  const site = dataset.registry?.sites.find(item => item.site_id === siteId);
  if (!site) return;
  selectedInspectorSite = siteId;
  $('#inspector-search').value = '';
  checkedInspectorRecords = new Set(site.record_ids);
  inspectorAgeMin = 0; inspectorAgeMax = null; inspectorAgeSite = siteId;
  renderInspectorChoices();
  showView('inspector');
}
function inspectorFields(site, linked) {
  const grouped = new Map();
  for (const record of linked) if (checkedInspectorRecords.has(record.id)) {
    for (const field of Object.keys(record.series || {})) {
      const count = inspectorSeries(record, site.site_id, field).length;
      if (!count) continue;
      const unit = record.proxyUnits?.[field] || '';
      const key = `${field}\u0000${unit}`;
      if (!grouped.has(key)) grouped.set(key, {key, field, unit, count:0, records:[]});
      const item = grouped.get(key); item.count += count; item.records.push(record);
    }
  }
  const priority = name => ({Mo:0,U:1,MoEF_Al:2,UEF_Al:3,O2_reconstruction_assemblages:4}[name] ?? 10);
  return [...grouped.values()].sort((a,b) => b.count-a.count || priority(a.field)-priority(b.field) || a.field.localeCompare(b.field) || a.unit.localeCompare(b.unit));
}
function renderInspectorSummary(site, linked) {
  const coords = Number.isFinite(site.latitude) && Number.isFinite(site.longitude);
  const coordinate = coords ? `${Math.abs(site.latitude).toFixed(4)}° ${site.latitude < 0 ? 'S' : 'N'}, ${Math.abs(site.longitude).toFixed(4)}° ${site.longitude < 0 ? 'W' : 'E'}` : 'Exact coordinates not yet verified';
  const recordsWithPoints = linked.filter(record => inspectorSampleRows(record, site.site_id).length);
  const depth = site.water_depth_m == null ? 'Not yet verified' : `${fmt(site.water_depth_m)} m below sea level`;
  const locationProof = coords ? `${sourceLink(site.location_source)}${site.location_event ? ` · event ${esc(site.location_event)}` : ''} · ${esc(statusLabel(site.location_status))}` : 'A study region does not establish an exact collection position.';
  const reviewNote = (site.review_note || '').replace('Existing chart combines their rows.', 'Core explorer still combines workbook rows; Site Inspector filters samples by their original Core_ID.');
  $('#inspector-summary').innerHTML = `<article class="panel inspector-site-card"><div><p class="eyebrow dark">${esc(entityDescriptions[site.entity_type]?.[0] || 'Registry entry')} · ${esc(statusLabel(site.identity_status))}</p><h3>${esc(site.canonical_label)}</h3><p>${esc(site.aliases.join(' · '))}</p><div class="inspector-links"><a class="text-button" href="#profile/${encodeURIComponent(site.site_id)}">Read profile →</a><a class="text-button" href="#registry">Open registry →</a></div></div><dl class="profile-facts"><div><dt>Region</dt><dd>${esc(site.region || site.basin || 'Not yet documented')}</dd></div><div><dt>Exact coordinates</dt><dd>${esc(coordinate)}</dd></div><div><dt>Water depth</dt><dd>${esc(depth)}</dd></div><div><dt>Linked studies with dated samples</dt><dd>${fmt(recordsWithPoints.length)} of ${fmt(linked.length)}</dd></div></dl><p class="profile-evidence">${locationProof}</p>${reviewNote ? `<p class="profile-warning">${esc(reviewNote)}</p>` : ''}</article>`;
  $('#inspector-location').innerHTML = `<h4>Collection evidence</h4><p>${esc(coordinate)} · ${esc(depth)}</p><p>${locationProof}</p>${site.location_note ? `<p>${esc(site.location_note)}</p>` : ''}`;
}
function renderInspectorStudies(site, linked) {
  $('#inspector-studies').innerHTML = linked.map(record => {
    const count = inspectorSampleRows(record, site.site_id).length;
    const fields = [...new Set(Object.keys(record.series || {}).filter(field => inspectorSeries(record, site.site_id, field).length))].length;
    const source = dataset.registry.source_records.find(item => item.record_id === record.id);
    const urls = [...new Set([...(source?.source_urls?.split('; ') || []), ...(record.reference?.match(/https?:\/\/[^\s<>]+/g) || []).map(url => url.replace(/[.,;]+$/, ''))])];
    const unmapped = (record.pointMeta || []).filter(meta => !record.coreSiteIds?.[meta[3]]).length;
    return `<article class="study-card"><label><input type="checkbox" data-inspector-study="${esc(record.id)}" ${checkedInspectorRecords.has(record.id) ? 'checked' : ''}><span><strong>${esc(record.file)}</strong><small>${fmt(count)} dated sample rows · ${fmt(fields)} fields${record.siteIds?.length > 1 ? ' · shared workbook split by Core_ID' : ''}</small></span></label><p>${esc(record.reference || 'No reference entered in the source workbook.')}</p><div class="profile-source-links">${urls.map((url,i) => externalLink(url, `Reference ${i+1}`)).filter(Boolean).join('')}</div>${record.siteIds?.length > 1 && unmapped ? `<p class="profile-warning">${fmt(unmapped)} workbook rows could not be assigned to a registered core; they are not included in the core plots.</p>` : ''}</article>`;
  }).join('') || '<p>No source workbooks are linked to this registry entry.</p>';
  $('#inspector-studies').querySelectorAll('[data-inspector-study]').forEach(input => input.addEventListener('change', () => {
    if (input.checked) checkedInspectorRecords.add(input.dataset.inspectorStudy); else checkedInspectorRecords.delete(input.dataset.inspectorStudy);
    inspectorAgeMax = null;
    renderSiteInspector();
  }));
}
function renderSiteInspector() {
  const site = dataset.registry?.sites.find(item => item.site_id === selectedInspectorSite);
  if (!site) return;
  inspectorRenderedPoints = [];
  $('#inspector-depth-total').textContent = '';
  $('#inspector-render-total').textContent = '';
  const linked = inspectorLinkedRecords(site);
  if (inspectorAgeSite !== site.site_id) { inspectorAgeMin = 0; inspectorAgeMax = null; inspectorAgeSite = site.site_id; }
  renderInspectorSummary(site, linked);
  renderInspectorStudies(site, linked);
  inspectorFieldChoices = inspectorFields(site, linked);
  if (!inspectorFieldChoices.some(item => item.key === inspectorFieldKey)) inspectorFieldKey = inspectorFieldChoices[0]?.key || '';
  $('#inspector-field').innerHTML = inspectorFieldChoices.map((item,i) => `<option value="${i}">${esc(proxyLabel(item.field))} · ${esc(item.unit || 'unit not specified')} · ${fmt(item.count)} points</option>`).join('');
  const fieldIndex = inspectorFieldChoices.findIndex(item => item.key === inspectorFieldKey);
  $('#inspector-field').disabled = fieldIndex < 0;
  $('#inspector-field').value = fieldIndex < 0 ? '' : String(fieldIndex);
  const maxAge = inspectorAgeExtent(site, linked);
  if (inspectorAgeMax == null) inspectorAgeMax = maxAge || 1;
  inspectorAgeMax = Math.min(inspectorAgeMax, maxAge || inspectorAgeMax);
  $('#inspector-age-min').value = inspectorAgeMin;
  $('#inspector-age-max').value = inspectorAgeMax;
  $('#inspector-age-max').max = maxAge || 1;
  const validWindow = inspectorAgeMax > inspectorAgeMin;
  $('#inspector-age-note').textContent = validWindow ? `Viewing ${fmt(inspectorAgeMin)}–${fmt(inspectorAgeMax)} ka BP · axes are shared` : 'Choose an age range where the end is greater than the start.';
  const selectedRecords = linked.filter(record => checkedInspectorRecords.has(record.id));
  const depthPoints = [];
  for (const record of selectedRecords) for (const {meta} of inspectorSampleRows(record, site.site_id)) {
    if (Number.isFinite(meta[0]) && Number.isFinite(meta[1]) && meta[0] >= inspectorAgeMin && meta[0] <= inspectorAgeMax) depthPoints.push({age:meta[0],value:meta[1],depth:meta[1],row:meta[2],core:record.coreLabels?.[meta[3]] || record.core,ageRaw:meta[4],record,unit:record.depthUnit || '',kind:'depth'});
  }
  const depthUnits = [...new Set(depthPoints.map(point => point.unit || '(unit not specified)'))];
  $('#inspector-depth-subtitle').textContent = depthPoints.length ? `${fmt(depthPoints.length)} dated sample depths · study age models shown as supplied` : 'No depth and age pairs in the selected sources and age range';
  if (depthUnits.length > 1) {
    $('#inspector-depth-chart').innerHTML = `<p class="chart-empty">Depth units vary across these studies (${depthUnits.map(esc).join(', ')}). Select studies with the same depth unit to compare this panel.</p>`;
  } else {
    const depthGroups = selectedRecords.map(record => ({record,points:depthPoints.filter(point => point.record.id === record.id)})).filter(group => group.points.length);
    $('#inspector-depth-chart').innerHTML = depthGroups.length ? inspectorChartSvg(depthGroups, 'depth', depthUnits[0] || '') : '<p class="chart-empty">Depth values are unavailable for these studies. Their measurement records remain available below.</p>';
  }
  const field = inspectorFieldChoices[fieldIndex];
  const fieldGroups = field ? field.records.filter(record => checkedInspectorRecords.has(record.id)).map(record => ({record,points:inspectorSeries(record,site.site_id,field.field).filter(point => point.unit === field.unit && point.age >= inspectorAgeMin && point.age <= inspectorAgeMax)})).filter(group => group.points.length) : [];
  $('#inspector-field-title').textContent = field ? `${proxyLabel(field.field)} through time` : 'Measurements through time';
  $('#inspector-field-subtitle').textContent = field ? `${field.field} · ${field.unit || 'unit not specified'} · ${fmt(field.count)} observations in selected sources` : 'No dated measurement values are available for this site.';
  $('#inspector-field-chart').innerHTML = fieldGroups.length ? inspectorChartSvg(fieldGroups,'measurement',field?.unit || '') : '<p class="chart-empty">No observations for this field in the selected studies and age range.</p>';
  connectInspectorDots();
}
function inspectorChartSvg(groups, kind, unit) {
  const all = groups.flatMap(group => group.points).filter(point => Number.isFinite(point.age) && Number.isFinite(point.value));
  if (!all.length) return '<p class="chart-empty">No observations are available to plot.</p>';
  let minX = inspectorAgeMin;
  let maxX = inspectorAgeMax;
  if (maxX <= minX) { minX = Math.max(0,minX-0.5); maxX += 0.5; }
  let minY = Math.min(...all.map(point => point.value)), maxY = Math.max(...all.map(point => point.value));
  if (maxY === minY) { const pad = Math.abs(maxY)*.08 || 1; minY -= pad; maxY += pad; }
  const padY = (maxY-minY)*.08;
  if (kind === 'depth') { minY = Math.max(0,minY-padY); maxY += padY; }
  else { const nonnegative = minY >= 0; minY = nonnegative ? Math.max(0,minY-padY) : minY-padY; maxY += padY; }
  const W=960,H=340,L=76,R=22,T=24,B=52;
  const x = value => L+(value-minX)/(maxX-minX)*(W-L-R);
  const y = value => kind === 'depth' ? T+(value-minY)/(maxY-minY)*(H-T-B) : H-B-(value-minY)/(maxY-minY)*(H-T-B);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${kind === 'depth' ? 'Sample depth' : 'Measurement value'} against age in thousands of years before present">`;
  for (let i=0;i<=4;i++) { const yy=T+i*(H-T-B)/4,value=kind==='depth'?minY+i*(maxY-minY)/4:maxY-i*(maxY-minY)/4; svg+=`<line class="inspector-grid" x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}"/><text class="chart-text" x="${L-10}" y="${yy+4}" text-anchor="end">${formatTick(value)}</text>`; }
  for (let i=0;i<=5;i++) { const xx=L+i*(W-L-R)/5,value=minX+i*(maxX-minX)/5; svg+=`<line class="inspector-grid" x1="${xx}" x2="${xx}" y1="${T}" y2="${H-B}"/><text class="chart-text" x="${xx}" y="${H-B+19}" text-anchor="middle">${formatTick(value)}</text>`; }
  const yTitle = kind === 'depth' ? `Sample depth (${unit || 'unit not specified'})` : `${unit || 'Measurement value'}`;
  svg+=`<line class="chart-axis" x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}"/><text class="chart-text" x="${(L+W-R)/2}" y="${H-5}" text-anchor="middle">Age (ka BP)</text><text class="chart-text" transform="translate(15 ${(T+H-B)/2}) rotate(-90)" text-anchor="middle">${esc(yTitle)}</text>`;
  let drawn = 0, actual = 0;
  const colors=['#287da0','#df9b3f','#60a69b','#8068a8','#c76a67','#5f84b7'];
  for (let groupIndex=0;groupIndex<groups.length;groupIndex++) {
    const group=groups[groupIndex], points=group.points.filter(point=>point.age>=inspectorAgeMin && point.age<=inspectorAgeMax).sort((a,b)=>a.age-b.age);
    actual += points.length;
    const stride=Math.max(1,Math.ceil(points.length/1400));
    const shown=points.filter((_,i)=>i%stride===0);
    const site=dataset.registry?.sites.find(item=>item.site_id===selectedInspectorSite);
    const sourceIndex=site?.record_ids.indexOf(group.record.id) ?? groupIndex;
    const color=colors[(sourceIndex<0?groupIndex:sourceIndex)%colors.length];
    svg+=`<g class="inspector-point-series" aria-label="${esc(group.record.file)}">`;
    for (const point of shown) {
      const globalIndex=inspectorRenderedPoints.push(point)-1; drawn++;
      const details = `${point.record.file}; ${point.age} ka BP; ${kind === 'depth' ? `depth ${point.value} ${point.unit}` : `${point.field} ${point.value} ${point.unit}`}; ${point.depth == null ? 'depth not recorded' : `depth ${point.depth} ${point.record.depthUnit || ''}`}; workbook row ${point.row}; core ${point.core}`;
      svg+=`<circle class="inspector-dot" cx="${x(point.age).toFixed(2)}" cy="${y(point.value).toFixed(2)}" r="4" fill="${color}" tabindex="0" role="button" data-observation="${globalIndex}" aria-label="${esc(details)}"><title>${esc(details)}</title></circle>`;
    }
    svg+='</g>';
    const ly=T+16+groupIndex*18;
    svg+=`<circle cx="${W-260}" cy="${ly}" r="4.5" fill="${color}"/><text class="chart-text inspector-legend" x="${W-250}" y="${ly+4}">${esc(group.record.file.length>32?group.record.file.slice(0,29)+'…':group.record.file)}</text>`;
  }
  const countNote=actual>drawn?`Showing ${fmt(drawn)} plotted points from ${fmt(actual)} recorded observations.`:`${fmt(actual)} recorded observations.`;
  if (kind === 'depth') $('#inspector-depth-total').textContent = countNote;
  else $('#inspector-render-total').textContent = countNote;
  return svg+'</svg>';
}
function showInspectorPoint(index) {
  const point=inspectorRenderedPoints[index];
  if (!point) return;
  const description=point.kind==='depth'?'Sample depth':proxyLabel(point.field);
  $('#inspector-point-detail').innerHTML=`<strong>${esc(point.record.file)}</strong><span>${esc(description)}: ${esc(fmt(point.value))} ${esc(point.unit || '(unit not specified)')}</span><span>Age: ${esc(fmt(point.age))} ka BP · workbook row ${fmt(point.row)}</span><span>${point.depth==null?'Sample depth not recorded':`Sample depth: ${esc(fmt(point.depth))} ${esc(point.record.depthUnit || '(unit not specified)')}`} · Core_ID: ${esc(point.core || 'not recorded')}</span><span>Workbook age as entered: ${esc(fmt(point.ageRaw))} ${esc(point.record.ageUnit)}</span>`;
}
function connectInspectorDots() {
  document.querySelectorAll('#inspector-depth-chart [data-observation],#inspector-field-chart [data-observation]').forEach(dot => {
    const show=()=>showInspectorPoint(Number(dot.dataset.observation));
    dot.addEventListener('mouseenter',show); dot.addEventListener('focus',show); dot.addEventListener('click',show);
    dot.addEventListener('keydown',event=>{ if(event.key==='Enter'||event.key===' '){event.preventDefault();show();} });
  });
}
function downloadInspector() {
  const site=dataset.registry?.sites.find(item=>item.site_id===selectedInspectorSite);
  const field=inspectorFieldChoices.find(item=>item.key===inspectorFieldKey);
  if (!site || !field) return;
  const rows=[];
  for (const record of inspectorLinkedRecords(site)) if (checkedInspectorRecords.has(record.id)) for (const point of inspectorSeries(record,site.site_id,field.field)) {
    if (point.unit!==field.unit || point.age<inspectorAgeMin || point.age>inspectorAgeMax) continue;
    rows.push([site.canonical_label,site.site_id,record.file,record.reference,point.core,point.row,point.age,point.ageRaw,record.ageUnit,point.depth,record.depthUnit,field.field,point.value,field.unit]);
  }
  const headers=['site','site_id','source_workbook','reference','Core_ID','workbook_row','age_ka_BP','age_as_entered','age_unit_as_entered','sample_depth','depth_unit','field','value','measurement_unit'];
  const cell=value=>{let v=String(value??'');if(/^[=+@\t\r]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"';};
  const csv='\uFEFF'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`PO2-${site.canonical_label.replace(/[^\w.-]+/g,'_')}-${field.field}.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function renderProfile() {
  const site = dataset.registry?.sites.find(s => s.site_id === selectedProfile);
  const body = $('#profile-body');
  if (!site) { body.innerHTML = '<article class="panel"><h3>No matching entries</h3><p>Try another name, original label, region or study.</p></article>'; return; }
  const context = dataset.profileContext?.[site.site_id];
  const linked = profileSources(site);
  // Workbook-level counts cannot be assigned to an individual core in a shared file.
  const exclusive = linked.filter(r => r.siteIds?.length === 1);
  const mixed = linked.filter(r => r.siteIds?.length > 1);
  const dated = exclusive.filter(r => r.ageMin != null);
  const minAge = dated.length ? Math.min(...dated.map(r => r.ageMin)) : null;
  const maxAge = dated.length ? Math.max(...dated.map(r => r.ageMax)) : null;
  const [type, description] = entityDescriptions[site.entity_type] || ['Registry entry', 'A catalogue entry linking source workbooks to a sampling identity.'];
  const fields = [...new Set(linked.flatMap(r => Object.keys(r.proxies)))].sort((a,b) => a.localeCompare(b));
  const coords = Number.isFinite(site.latitude) && Number.isFinite(site.longitude);
  const coordinateText = coords ? `${Math.abs(site.latitude).toFixed(4)}° ${site.latitude < 0 ? 'S' : 'N'}, ${Math.abs(site.longitude).toFixed(4)}° ${site.longitude < 0 ? 'W' : 'E'}` : 'Not yet verified';
  const contextCitation = context ? `<p class="profile-evidence">Study context: ${externalLink(context.source_url, context.study_label)} · ${esc(context.source_section)} · checked ${esc(context.checked_on)}</p>` : '';
  const unknowns = [];
  if (!coords) unknowns.push('Exact collection coordinates have not yet been verified.');
  if (site.water_depth_m == null) unknowns.push('Seafloor water depth has not yet been verified.');
  if (!context?.expedition) unknowns.push('Collection expedition is not documented in this profile.');
  if (site.identity_status !== 'reviewed') unknowns.push(site.identity_status === 'needs_review' ? 'The core or site identity has an unresolved issue; see the review notes below.' : 'The identity and original-label assignments await curator review.');
  if (coords && site.location_status !== 'reviewed') unknowns.push('The cited archive location awaits curator review.');
  if (context?.label_note) unknowns.push(context.label_note);
  unknowns.push('Age-model methods and uncertainties have not yet been reviewed in this dashboard.');
  if (fields.some(name => !context?.measurements?.[name])) unknowns.push('Plain-language interpretation of these measurement fields still needs a reviewed proxy dictionary.');
  if (mixed.length) unknowns.push('A linked workbook contains several cores. Its counts, ages and chart combine those cores and cannot yet be attributed to this entry.');
  for (const r of linked) if (sampleDepthWarning(r)) unknowns.push(`${r.file}: ${sampleDepthWarning(r)}`);
  const measurementRows = linked.flatMap(r => Object.keys(r.proxies).sort().map(name => {
    const info = context?.source_record_id === r.id ? context.measurements?.[name] : null;
    const count = r.series[name]?.length || 0;
    const shared = r.siteIds?.length > 1;
    return `<tr><td>${esc(info?.label || proxyLabel(name))}<small>${esc(name)}</small>${info ? `<p class="measurement-explanation">${esc(info.explanation)}</p>` : ''}</td><td>${esc(r.proxyUnits[name] || 'Not specified')}${info?.unit_explanation ? `<p class="measurement-explanation">${esc(info.unit_explanation)}</p>` : ''}</td><td>${fmt(count)}${shared ? '<small>Whole workbook; several cores</small>' : '<small>Dated values</small>'}</td><td><span class="profile-file">${esc(r.file)}</span>${count ? `<button class="text-button" data-profile-source="${esc(r.id)}" data-measurement="${esc(name)}">${shared ? 'Inspect combined chart' : 'Plot measurement'} →</button>` : '<small>No dated chart available</small>'}</td></tr>`;
  })).join('');
  const sourceCards = linked.map((r,i) => {
    const source = dataset.registry.source_records.find(s => s.record_id === r.id);
    const reference = source?.reference || r.reference;
    const referenceURLs = (reference?.match(/https?:\/\/[^\s<>]+/g) || []).map(url => url.replace(/[.,;]+$/, ''));
    const urls = [...new Set([...(source?.source_urls?.split('; ') || []), ...referenceURLs])].filter(Boolean);
    const shared = r.siteIds?.length > 1;
    const depthText = r.depthMin == null ? 'Not available' : `${fmt(r.depthMin)}${r.depthMin === r.depthMax ? '' : `–${fmt(r.depthMax)}`} ${r.depthUnit || '(unit not specified)'}`;
    return `<article class="profile-source"><div class="profile-source-head"><h4>Source workbook ${i+1}</h4><button class="text-button" data-profile-source="${esc(r.id)}">Inspect ${shared ? 'combined workbook' : 'age series'} →</button></div><p class="profile-file">${esc(r.file)}</p><p>${esc(reference || 'No reference entered in this workbook.')}</p><dl class="profile-facts"><div><dt>${shared ? 'Rows in whole workbook' : 'Sample rows in this workbook'}</dt><dd>${fmt(r.samples)} · ${fmt(r.dated)} with usable ages</dd></div><div><dt>${shared ? 'Whole-workbook age span' : 'Workbook age span'}</dt><dd>${esc(ageSpan(r.ageMin,r.ageMax))}</dd></div><div><dt>Sample depth as recorded in workbook</dt><dd>${esc(depthText)}</dd></div></dl>${sampleDepthWarning(r) ? `<p class="profile-warning">${esc(sampleDepthWarning(r))} Values above retain the workbook unit.</p>` : ''}${shared ? '<p class="profile-warning">Several cores share this workbook. These figures describe the whole file.</p>' : ''}${r.registryWarning ? `<p class="profile-warning">${esc(r.registryWarning)}</p>` : ''}<div class="profile-source-links">${urls.map((url,j) => externalLink(url, `Study / data source ${j+1}`)).join('')}</div></article>`;
  }).join('');
  const exampleRecord = exclusive.find(r => r.id === context?.source_record_id && r.sampleExample && !sampleDepthWarning(r)) || exclusive.find(r => r.sampleExample && !sampleDepthWarning(r));
  const example = exampleRecord?.sampleExample;
  const exampleName = context && exampleRecord && context.source_record_id === exampleRecord.id ? context.measurements?.[example?.measurement]?.label : null;
  const exampleHTML = example && site.entity_type !== 'unresolved_material' ? `<article class="panel profile-walkthrough"><p class="eyebrow dark">FROM SEDIMENT TO A DATA POINT</p><h3>How to read one sample</h3><p class="profile-caption">A worked example from row ${fmt(example.sourceRow)} of ${esc(exampleRecord.file)}. The diagram is schematic.</p><ol class="sample-steps"><li><div class="sample-tube" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><div><span class="step-number">1 · Take a sample</span><p>${example.depth == null ? 'A sediment sample is recorded in this workbook.' : `The sample is ${esc(fmt(example.depth))} ${esc(exampleRecord.depthUnit || '(unit not specified)')} down the core.`}</p><small>This is depth within the sediment, separate from water depth.</small></div></li><li><span class="step-number">2 · Assign an age</span><p>${esc(fmt(example.ageRaw))} ${esc(exampleRecord.ageUnit)} in the workbook becomes <strong>${esc(fmt(example.ageKa))} ka BP</strong> on the chart.</p><small>ka BP means thousands of years before present. The age comes from the workbook.</small></li><li><span class="step-number">3 · Plot a measurement</span><p>${esc(exampleName || proxyLabel(example.measurement))}: <strong>${esc(fmt(example.value))} ${esc(exampleRecord.proxyUnits[example.measurement] || '(unit not specified)')}</strong>.</p><button class="text-button" data-profile-source="${esc(exampleRecord.id)}" data-measurement="${esc(example.measurement)}">See this age series →</button></li></ol></article>` : '';
  body.innerHTML = `<article class="panel profile-identity"><div class="profile-title-row"><div><p class="eyebrow dark">${esc(type)}</p><h3>What is ${esc(site.canonical_label)}?</h3></div><span class="chip ${site.identity_status === 'needs_review' ? 'pending' : ''}">${esc(statusLabel(site.identity_status))}</span></div><p class="profile-lead">${site.entity_type === 'core' ? `<strong>${esc(site.canonical_label)}</strong> is catalogued as a sediment core in this compilation. ` : ''}${esc(description)}</p>${context ? `<p>${esc(context.context)}</p>${contextCitation}` : '<p class="profile-caption">This summary uses the registry and linked workbooks. Expedition details and study-specific interpretation have not yet been added.</p>'}<p><a class="text-button" href="#inspector/${encodeURIComponent(site.site_id)}">Open Site Inspector →</a></p><details class="profile-labels"><summary>Original labels and catalogue identity</summary><p>${esc(site.aliases.join('; '))}</p><p class="profile-caption">Permanent catalogue ID: ${esc(site.site_id)}. Original labels are retained so you can trace this entry back to each source.</p></details></article>
    <div class="profile-grid"><article class="panel"><h3>Where was it collected?</h3><dl class="profile-facts"><div><dt>${context?.region ? 'Region described by the study' : 'Region in the registry'}</dt><dd>${esc(site.region || site.basin || context?.region || 'Not yet documented')}</dd></div><div><dt>Collection expedition</dt><dd>${esc(context?.expedition || 'Not yet documented')}</dd></div><div><dt>Exact coordinates</dt><dd>${esc(coordinateText)}</dd></div><div><dt>Water depth at the seafloor</dt><dd>${site.water_depth_m == null ? 'Not yet verified' : `${fmt(site.water_depth_m)} metres below sea level`}</dd></div></dl>${coords ? `<p class="profile-evidence">${sourceLink(site.location_source)}${site.location_event ? ` · archive event ${esc(site.location_event)}` : ''} · ${esc(statusLabel(site.location_status))}</p>` : `<p class="profile-caption">${context?.region ? 'Study-level geography does not establish the exact collection position.' : 'Location evidence has not yet been assigned to this entry.'}</p>`}</article>
    <article class="panel"><h3>What is available here?</h3><dl class="profile-facts"><div><dt>Linked source workbooks</dt><dd>${fmt(linked.length)}${linked.length > 1 ? ' · kept separate by study' : ''}</dd></div><div><dt>Populated measurement fields</dt><dd>${fmt(fields.length)}${mixed.length ? ' · includes shared-workbook fields' : ''}</dd></div><div><dt>${mixed.length ? 'Age span excluding shared workbooks' : 'Age span in linked workbooks'}</dt><dd>${mixed.length && !dated.length ? 'Not yet separated by core' : esc(ageSpan(minAge,maxAge))}</dd></div></dl><p class="profile-caption">Coverage describes the compiled workbooks. Gaps between samples are not continuous observations; age models may differ between studies.</p>${mixed.length ? '<p class="profile-warning">Several cores share a linked workbook. See its scope under Sources.</p>' : ''}</article></div>
    ${exampleHTML}
    <article class="panel profile-measurements"><h3>What was measured?</h3><p class="profile-caption">Original field codes and units are preserved. Open a measurement to see its age series.</p>${fields.length ? `<div class="table-wrap"><table><thead><tr><th>Measurement / original field</th><th>Workbook unit</th><th>Values with ages</th><th>Source and chart</th></tr></thead><tbody>${measurementRows}</tbody></table></div>` : '<p>No populated numeric measurement fields were imported from these workbooks.</p>'}${context?.measurements ? contextCitation : ''}</article>
    <div class="profile-grid profile-bottom"><article class="panel"><h3>Sources behind this profile</h3><p class="profile-caption">Each workbook remains a separate source record, even when it describes the same core.</p>${sourceCards}</article><article class="panel profile-unknowns"><h3>What still needs checking?</h3><ul>${unknowns.map(note => `<li>${esc(note)}</li>`).join('')}</ul>${site.review_note ? `<p class="profile-warning"><strong>Identity notes:</strong> ${esc(site.review_note)}</p>` : ''}${site.location_note ? `<p class="profile-caption">${esc(site.location_note)}</p>` : ''}<button id="profile-registry-details" class="download-button">View registry evidence →</button></article></div>`;
  body.querySelectorAll('[data-profile-source]').forEach(button => button.addEventListener('click', () => openSource(button.dataset.profileSource,button.dataset.measurement)));
  $('#profile-registry-details').addEventListener('click', () => {
    $('#site-search').value = site.canonical_label;
    $('#site-status').value = 'all';
    renderRegistry(); renderSiteDetail(site.site_id); showView('registry');
  });
}
function followRoute() {
  let route;
  try { route = decodeURIComponent(location.hash.slice(1)); } catch (_) { route = ''; }
  if (route.startsWith('profile/')) {
    const id = route.slice('profile/'.length);
    if (dataset.registry?.sites.some(s => s.site_id === id)) { openProfile(id); return; }
  }
  if (route.startsWith('inspector/')) {
    const id = route.slice('inspector/'.length);
    if (dataset.registry?.sites.some(s => s.site_id === id)) {
      selectedInspectorSite=id; checkedInspectorRecords=new Set(dataset.registry.sites.find(s=>s.site_id===id).record_ids); inspectorAgeMin=0;inspectorAgeMax=null;inspectorAgeSite=id;
      $('#inspector-search').value='';renderInspectorChoices();showView('inspector',false);return;
    }
  }
  showView(['overview','groups','registry','profiles','inspector','cores','compare','methods'].includes(route) ? route : 'groups');
}
function downloadRegistry() {
  if (!dataset.registry) return;
  const keys = ['site_id','canonical_label','entity_type','identity_status','latitude','longitude','water_depth_m','basin','region','location_status','location_source','location_event','location_note','review_note','reviewed_by','reviewed_on'];
  const cell = value => {let v=String(value??'');if (/^[=+@\t\r]/.test(v)) v="'"+v;return '"'+v.replaceAll('"','""')+'"';};
  const csv = '\uFEFF'+[keys,...dataset.registry.sites.map(s=>keys.map(k=>s[k]))].map(row=>row.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a'); link.href=url;link.download='PO2-site-registry.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function fillSelections() {
  const sorted = [...records].sort((a,b) => a.core.localeCompare(b.core) || a.file.localeCompare(b.file));
  for (const id of ['core-select','compare-a','compare-b']) $('#'+id).innerHTML = sorted.map(option).join('');
  selectedRecord = [...records].filter(r => activeProxies(r).length).sort((a,b) => b.dated-a.dated)[0];
  if (selectedRecord) $('#core-select').value = selectedRecord.id;
  const match = records.filter(r => r.series.Mo?.length && r.proxyUnits?.Mo).sort((a,b) => b.series.Mo.length-a.series.Mo.length);
  const second = match.find(r => r.core !== match[0]?.core && r.proxyUnits.Mo === match[0]?.proxyUnits.Mo);
  if (match.length && second) { $('#compare-a').value = match[0].id; $('#compare-b').value = second.id; }
  else { $('#compare-a').value = sorted[0]?.id; $('#compare-b').value = sorted[1]?.id; }
}

function pointsSvg(seriesList, unit) {
  const all = seriesList.flatMap(s => s.points).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (!all.length) return '<p>No dated values for this measurement.</p>';
  let minX = Math.min(...all.map(p => p[0])), maxX = Math.max(...all.map(p => p[0]));
  let minY = Math.min(...all.map(p => p[1])), maxY = Math.max(...all.map(p => p[1]));
  const nonnegative = minY >= 0;
  if (maxX === minX) { minX -= 1; maxX += 1; }
  if (maxY === minY) { minY -= 1; maxY += 1; }
  const padY = (maxY-minY)*.08; minY = nonnegative ? Math.max(0,minY-padY) : minY-padY; maxY += padY;
  const W=900,H=300,L=61,R=18,T=18,B=43;
  const x = v => L+(v-minX)/(maxX-minX)*(W-L-R);
  const y = v => H-B-(v-minY)/(maxY-minY)*(H-T-B);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Proxy value against age in thousands of years before present">`;
  for(let i=0;i<=4;i++) { const yy=T+i*(H-T-B)/4, value=maxY-i*(maxY-minY)/4; svg+=`<line class="chart-grid" x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}"/><text class="chart-text" x="${L-9}" y="${yy+3}" text-anchor="end">${formatTick(value)}</text>`; }
  for(let i=0;i<=5;i++) { const xx=L+i*(W-L-R)/5, value=minX+i*(maxX-minX)/5; svg+=`<line class="chart-grid" x1="${xx}" x2="${xx}" y1="${T}" y2="${H-B}"/><text class="chart-text" x="${xx}" y="${H-B+17}" text-anchor="middle">${formatTick(value)}</text>`; }
  svg+=`<line class="chart-axis" x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}"/><text class="chart-text" x="${(L+W-R)/2}" y="${H-4}" text-anchor="middle">Age (ka BP)</text><text class="chart-text" transform="translate(13 ${(T+H-B)/2}) rotate(-90)" text-anchor="middle">${esc(unit || 'Proxy value')}</text>`;
  seriesList.forEach((series,j) => {
    const ordered = series.points.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1])).sort((a,b) => a[0]-b[0]);
    const sampled = ordered.length > 700 ? ordered.filter((_,i) => i % Math.ceil(ordered.length/700) === 0) : ordered;
    const alt = j ? ' alt' : '';
    svg+=`<polyline class="chart-line${alt}" points="${sampled.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')}"/>`;
    if(sampled.length <= 180) for(const p of sampled) svg+=`<circle class="chart-dot${alt}" cx="${x(p[0]).toFixed(1)}" cy="${y(p[1]).toFixed(1)}" r="3"><title>${esc(series.name)} · ${p[0]} ka BP · ${p[1]} ${esc(unit)}</title></circle>`;
  });
  if(seriesList.length>1) svg+=`<circle cx="${W-216}" cy="${T+5}" r="5" fill="#277da1"/><text class="chart-text" x="${W-205}" y="${T+9}">${esc(seriesList[0].name.slice(0,22))}</text><circle cx="${W-216}" cy="${T+22}" r="5" fill="#df9c42"/><text class="chart-text" x="${W-205}" y="${T+26}">${esc(seriesList[1].name.slice(0,22))}</text>`;
  return svg+'</svg>';
}
function formatTick(n) { return Math.abs(n)>=100 ? Math.round(n).toLocaleString('en-GB') : Number(n.toFixed(2)).toString(); }

function renderCore() {
  const r = records.find(x => x.id === $('#core-select').value);
  if (!r) return;
  selectedRecord = r;
  const names = activeProxies(r).sort((a,b) => r.series[b].length-r.series[a].length);
  const chosen = names.includes($('#proxy-select').value) ? $('#proxy-select').value : names[0];
  $('#proxy-select').innerHTML = names.map(name => `<option value="${esc(name)}">${esc(proxyLabel(name))} · ${r.series[name].length} points</option>`).join('');
  $('#proxy-select').value = chosen || '';
  $('#core-name').textContent = r.core;
  $('#core-details').innerHTML = [['Source file',r.file],['Dated rows',fmt(r.dated)],['Age range',r.ageMin == null ? 'Unavailable' : `${r.ageMin}–${r.ageMax} ka BP`],['Measurements',names.length]].map(([k,v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  $('#core-reference').textContent = r.reference || 'No reference entered in the source workbook.';
  const siteNames = (r.siteIds || []).map(id=>dataset.registry?.sites.find(s=>s.site_id===id)?.canonical_label).filter(Boolean);
  const sites = (r.siteIds || []).map(id=>dataset.registry?.sites.find(s=>s.site_id===id)).filter(Boolean);
  $('#core-profile-links').innerHTML = sites.length ? `<span>Understand the ${sites.length > 1 ? 'entries behind this workbook' : 'entry behind this record'}:</span> ${sites.map(profileLink).join(' ')}` : '';
  if (siteNames.length) $('#core-details').innerHTML += `<div><dt>Registry entry</dt><dd>${esc(siteNames.join('; '))}</dd></div>`;
  $('#core-registry-warning').hidden = !r.registryWarning;
  $('#core-registry-warning').textContent = r.registryWarning ? `Registry review: ${r.registryWarning}` : '';
  const unit = r.proxyUnits?.[chosen] || '';
  $('#core-chart-title').textContent = chosen ? proxyLabel(chosen) : 'No numeric proxy series';
  $('#core-chart-subtitle').textContent = chosen ? `${fmt(r.series[chosen].length)} dated values · ${unit || 'unit not specified'} · ${r.file}` : r.file;
  $('#core-chart').innerHTML = chosen ? pointsSvg([{name:r.core,points:r.series[chosen]}],unit) : '<p>No dated proxy values are available for this source.</p>';
}

function renderCompare() {
  const a = records.find(x => x.id === $('#compare-a').value), b = records.find(x => x.id === $('#compare-b').value);
  if (!a || !b) return;
  const review = [a,b].filter(r=>r.registryWarning).map(r=>`${r.file}: ${r.registryWarning}`).join(' ');
  $('#compare-registry-warning').hidden = !review;
  $('#compare-registry-warning').textContent = review;
  const shared = activeProxies(a).filter(name => b.series[name]?.length && (a.proxyUnits?.[name] || '') === (b.proxyUnits?.[name] || '')).sort((x,y) => (a.series[y].length+b.series[y].length)-(a.series[x].length+b.series[x].length));
  const chosen = shared.includes($('#compare-proxy').value) ? $('#compare-proxy').value : shared[0];
  $('#compare-proxy').innerHTML = shared.map(name => `<option value="${esc(name)}">${esc(proxyLabel(name))}</option>`).join('');
  $('#compare-proxy').value = chosen || '';
  $('#compare-title').textContent = chosen ? proxyLabel(chosen) : 'No shared measurement with matching units';
  $('#compare-subtitle').textContent = chosen ? `${a.core} (${a.file})  ·  ${b.core} (${b.file})` : 'Try another source pair';
  $('#compare-chart').innerHTML = chosen ? pointsSvg([{name:a.core,points:a.series[chosen]},{name:b.core,points:b.series[chosen]}],a.proxyUnits?.[chosen]) : '<p>These source records have no dated proxy series with the same column name and unit.</p>';
}

async function start() {
  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
  try {
    const embedded = document.getElementById('po2-data');
    if (embedded) dataset = JSON.parse(embedded.textContent);
    else {
      const response = await fetch('./data.json?v=proxy-groups-2');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const snapshot = await response.json();
      if (snapshot.parts) {
        const parts = await Promise.all(snapshot.parts.map(async path => {
          const part = await fetch('./' + path);
          if (!part.ok) throw new Error(`Snapshot part: HTTP ${part.status}`);
          return part.text();
        }));
        dataset = JSON.parse(parts.join(''));
      } else dataset = snapshot;
    }
    records = dataset.records;
    initGroupExplorer();
    renderMetrics(); renderProxyCoverage(); renderAgeCoverage(); renderTable(); fillSelections(); renderCore(); renderCompare(); renderRegistry();
    selectedProfile = dataset.registry?.sites.find(s => s.canonical_label === '64PE406-E1')?.site_id;
    renderProfileChoices();
    const initialInspectorSite = dataset.registry?.sites.find(s => s.canonical_label === '64PE406-E1') || dataset.registry?.sites.find(s => s.canonical_label === '64PE406-E1');
    selectedInspectorSite = initialInspectorSite?.site_id || '';
    checkedInspectorRecords = new Set(initialInspectorSite?.record_ids || []);
    inspectorAgeSite = selectedInspectorSite;
    renderInspectorChoices();
    const issueText = Object.entries(dataset.issues).map(([k,v]) => `${v} ${k}`).join('; ');
    $('#quality-summary').textContent = issueText ? `The import flagged ${issueText}. These records should be reviewed against their source files before release.` : 'This preview contains three source workbooks from 64PE406-E1. Scientific and curator review remains pending.';
    $('#record-search').addEventListener('input', renderTable);
    $('#site-search').addEventListener('input', renderRegistry);
    $('#site-status').addEventListener('change', renderRegistry);
    $('#registry-download').addEventListener('click', downloadRegistry);
    $('#profile-search').addEventListener('input', renderProfileChoices);
    $('#profile-select').addEventListener('change', () => { selectedProfile = $('#profile-select').value; renderProfile(); showView('profiles'); });
    $('#profile-example').addEventListener('click', () => {
      const example = dataset.registry?.sites.find(s => s.canonical_label === '64PE406-E1');
      if (example) openProfile(example.site_id);
    });
    $('#inspector-search').addEventListener('input', renderInspectorChoices);
    $('#inspector-site').addEventListener('change', () => {
      selectedInspectorSite=$('#inspector-site').value;
      const site=dataset.registry.sites.find(item=>item.site_id===selectedInspectorSite);
      checkedInspectorRecords=new Set(site?.record_ids||[]);inspectorFieldKey='';inspectorAgeMin=0;inspectorAgeMax=null;inspectorAgeSite=selectedInspectorSite;
      renderSiteInspector();showView('inspector');
    });
    $('#inspector-field').addEventListener('change', () => {
      const choice=inspectorFieldChoices[Number($('#inspector-field').value)];
      inspectorFieldKey=choice?.key||'';renderSiteInspector();
    });
    $('#inspector-age-apply').addEventListener('click', () => {
      const from=Number($('#inspector-age-min').value),to=Number($('#inspector-age-max').value);
      if (!Number.isFinite(from)||!Number.isFinite(to)||from<0||to<=from) { $('#inspector-age-note').textContent='Enter a non-negative start age and a later end age.';return; }
      inspectorAgeMin=from;inspectorAgeMax=to;renderSiteInspector();
    });
    $('#inspector-download').addEventListener('click', downloadInspector);
    window.addEventListener('hashchange', followRoute);
    $('#core-select').addEventListener('change', renderCore);
    $('#proxy-select').addEventListener('change', renderCore);
    ['compare-a','compare-b','compare-proxy'].forEach(id => $('#'+id).addEventListener('change', renderCompare));
    $('#loading').hidden = true; followRoute();
  } catch (error) {
    $('#loading').textContent = `The source snapshot could not be loaded: ${error.message}`;
  }
}
start();
