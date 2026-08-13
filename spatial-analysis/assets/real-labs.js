(() => {
  'use strict';

  const C = window.SpatialCore;
  const DATA_BASE = '../data/chicago/';
  const GEOJSON_FILE = 'chi_tract10.geojson';
  const CSV_FILE = 'sa_class_data_fa26.csv';

  const VARIABLES = [
    ['avgtvioevt2018', 'Violent crimes, average count (2017–2019)'],
    ['avgtprpevt2018', 'Property crimes, average count (2017–2019)'],
    ['rtavgtvioevt2018', 'Violent crime rate per 10,000 (2017–2019)'],
    ['rtavgtprpevt2018', 'Property crime rate per 10,000 (2017–2019)'],
    ['tpop15', 'Population (2015)'],
    ['tpden15', 'Population density (2015)'],
    ['condis15', 'Concentrated disadvantage index (2015)'],
    ['tblack15', '% Black (2015)'],
    ['tasian15', '% Asian (2015)'],
    ['tlatino15', '% Latino (2015)'],
    ['twhite15', '% White (2015)'],
    ['tothrac15', '% other races (2015)'],
    ['tethhet15', 'Ethnic heterogeneity (2015)'],
    ['timm15', '% immigrants (2015)'],
    ['tage1529', '% aged 15–29 (2015)'],
    ['tkids15', '% families with kids (2015)'],
    ['tsngpar15', '% female single-parent families (2015)'],
    ['tavghhinc15', 'Average household income (2015)'],
    ['tpov15', '% below poverty (2015)'],
    ['tpov12515', '% at or below 125% of poverty (2015)'],
    ['tunemp15', '% unemployed (2015)'],
    ['tedbach15', "% with bachelor's degree (2015)"],
    ['towner15', '% homeowners (2015)'],
    ['tavgval15', 'Average home value (2015)'],
    ['tmdval15', 'Median home value (2015)'],
    ['tavrent15', 'Average contract rent (2015)'],
    ['tmdrent15', 'Median rent (2015)'],
    ['trentburden15', '% rent-burdened households (2015)'],
    ['tsfu15', '% single-family housing units (2015)'],
    ['tsmhse15', '% in same house one year ago (2015)'],
    ['tvac15', '% vacant units (2015)'],
    ['propretail_emp15', 'Share of jobs in retail trade (2015)'],
    ['propoffice_emp15', 'Share of jobs in office-based sectors (2015)'],
    ['propother_emp15', 'Share of jobs in service-based sectors (2015)'],
    ['propind_emp15', 'Share of jobs in industrial sectors (2015)'],
    ['propent_emp15', 'Share of jobs in entertainment & arts (2015)'],
    ['propfoodetc_emp15', 'Share of jobs in food, hotels & drinking places (2015)'],
    ['propedu_emp15', 'Share of jobs in educational services (2015)'],
    ['totjobs15', 'Total jobs (2015)'],
    ['toxconc15', 'Toxicity-weighted concentration (2015)'],
    ['cscore15', 'Cancer toxicity risk score (2015)'],
    ['ncscore15', 'Noncancer toxicity risk score (2015)']
  ];

  const VAR_LABELS = Object.fromEntries(VARIABLES);
  const REG_Y = 'rtavgtvioevt2018';
  const REG_X = [
    'condis15', 'tblack15', 'tasian15', 'tlatino15', 'tothrac15', 'tethhet15',
    'timm15', 'tsmhse15', 'tvac15', 'tsfu15', 'propretail_emp15',
    'propoffice_emp15', 'propother_emp15', 'propind_emp15', 'propent_emp15',
    'propfoodetc_emp15', 'propedu_emp15', 'totjobs15'
  ];

  let chicagoPromise = null;

  function normalizeGeoid(value) {
    const s = String(value ?? '').trim().replace(/^"|"$/g, '').replace(/\.0+$/, '');
    return /^\d+$/.test(s) ? s.padStart(11, '0') : s;
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
        else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
      else field += ch;
    }
    if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
    const header = rows.shift().map(x => x.trim());
    return rows.filter(r => r.some(x => String(x).trim() !== '')).map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
  }

  async function loadChicago() {
    if (!chicagoPromise) {
      chicagoPromise = Promise.all([
        fetch(`${DATA_BASE}${GEOJSON_FILE}`).then(r => { if (!r.ok) throw new Error('Could not load Chicago tract geography.'); return r.json(); }),
        fetch(`${DATA_BASE}${CSV_FILE}`).then(r => { if (!r.ok) throw new Error('Could not load Chicago teaching data.'); return r.text(); })
      ]).then(([geo, csvText]) => {
        const rows = parseCSV(csvText);
        const byId = new Map(rows.map(r => [normalizeGeoid(r.geoid10), r]));
        const features = [];
        for (const source of geo.features || []) {
          const geoid = normalizeGeoid(source.properties?.GEOID10 ?? source.properties?.geoid10 ?? source.id);
          const row = byId.get(geoid);
          if (!row) continue;
          const p = { ...(source.properties || {}) };
          for (const [name] of VARIABLES) {
            const raw = String(row[name] ?? '').trim();
            p[name] = raw === '' || raw === '.' || raw.toLowerCase() === 'na' ? null : Number(raw);
            if (!Number.isFinite(p[name])) p[name] = null;
          }
          p._geoid = geoid;
          p._label = `Tract ${geoid}`;
          p._state = 0;
          p._class = 'NS';
          p._sig = 1;
          features.push({ ...source, properties: p });
        }
        const fc = { type: 'FeatureCollection', features };
        reindex(fc);
        return { fc, csvRows: rows.length, joined: features.length };
      });
    }
    const out = await chicagoPromise;
    return { fc: cloneFC(out.fc), csvRows: out.csvRows, joined: out.joined };
  }

  function cloneFC(fc) { return JSON.parse(JSON.stringify(fc)); }

  function reindex(fc) {
    fc.features.forEach((f, i) => {
      f.id = i;
      f.properties._index = i;
    });
    return fc;
  }

  function completeCase(fc, vars) {
    return reindex({
      type: 'FeatureCollection',
      features: fc.features.filter(f => vars.every(v => Number.isFinite(Number(f.properties[v])))).map(f => JSON.parse(JSON.stringify(f)))
    });
  }

  function variableOptions(selected) {
    return VARIABLES.map(([name, label]) => `<option value="${name}" ${name === selected ? 'selected' : ''}>${label}</option>`).join('');
  }

  function weightsControls() {
    return `
      <div class="control-group"><label>Geography</label><div class="equation-box" style="margin-top:0">Chicago census tracts (2010 boundaries)</div></div>
      <div class="control-group"><label for="weight-type">Spatial weights</label>
        <select id="weight-type">
          <option value="queen">Queen contiguity</option>
          <option value="rook">Rook contiguity</option>
          <option value="knn">K-nearest neighbors</option>
          <option value="distance">Distance band</option>
        </select>
      </div>
      <div id="k-wrap" class="control-group" hidden><label for="k">K neighbors</label><div class="range-line"><input id="k" type="range" min="1" max="10" value="4"><span id="k-value" class="range-value">4</span></div></div>
      <div id="distance-wrap" class="control-group" hidden><label for="distance">Threshold (km)</label><div class="range-line"><input id="distance" type="range" min="1" max="25" step="1" value="6"><span id="distance-value" class="range-value">6 km</span></div></div>
      <div class="control-group"><label class="checkbox-line"><input id="row-standardize" type="checkbox" checked> Row-standardize weights</label></div>`;
  }

  function bindWeightControls(onChange) {
    const type = document.getElementById('weight-type');
    const kWrap = document.getElementById('k-wrap');
    const dWrap = document.getElementById('distance-wrap');
    const refresh = () => {
      kWrap.hidden = type.value !== 'knn';
      dWrap.hidden = type.value !== 'distance';
      onChange?.();
    };
    type.addEventListener('change', refresh);
    document.getElementById('k').addEventListener('input', e => {
      document.getElementById('k-value').textContent = e.target.value;
      onChange?.();
    });
    document.getElementById('distance').addEventListener('input', e => {
      document.getElementById('distance-value').textContent = `${e.target.value} km`;
      onChange?.();
    });
    document.getElementById('row-standardize').addEventListener('change', () => onChange?.());
    refresh();
  }

  function currentWeightSpec() {
    return {
      type: document.getElementById('weight-type').value,
      k: Number(document.getElementById('k').value),
      thresholdKm: Number(document.getElementById('distance').value),
      rowStandardize: document.getElementById('row-standardize').checked
    };
  }

  function shell(lab) {
    const cfg = {
      lag: ['Lab 2 · Spatial Lag', 'Build Wy from real Chicago data', 'A spatial lag is a weighted summary of nearby observations. Start with concentrated disadvantage, then explore any variable in the teaching dataset.'],
      lisa: ['Lab 4 · Local Spatial Autocorrelation', 'LISA & Moran Scatterplot', 'Start with violent crime and connect each Chicago tract to its standardized value, spatial lag, and HH/LL/HL/LH classification.'],
      regression: ['Lab 6 · Spatial Regression', 'Why spatial regression exists', 'Move from a known synthetic data-generating process to a full real-data neighborhood crime model for Chicago.']
    }[lab];
    document.getElementById('app').innerHTML = `
      <main class="shell">
        <nav class="lab-nav"><a href="../">← All labs</a><span>•</span><span>${cfg[0]}</span></nav>
        <header class="page-header"><div class="eyebrow">${cfg[0]}</div><h1>${cfg[1]}</h1><p>${cfg[2]}</p></header>
        <div class="lab-layout">
          <section class="panel map-panel"><div class="map-wrap"><div id="map" class="map"></div><div id="map-message" class="map-message">Loading…</div></div></section>
          <aside id="controls" class="panel controls"></aside>
        </div>
      </main>`;
  }

  function setMsg(text, error = false) {
    const el = document.getElementById('map-message');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('error', error);
  }

  function waitMap(map) { return new Promise(resolve => map.loaded() ? resolve() : map.once('load', resolve)); }

  function percentileScores(values) {
    const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const out = Array(values.length).fill(50);
    const denom = Math.max(1, values.length - 1);
    sorted.forEach((x, rank) => { out[x.i] = 5 + 90 * rank / denom; });
    return out;
  }

  function formatValue(value) {
    const a = Math.abs(value);
    if (!Number.isFinite(value)) return '—';
    if (a >= 10000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (a >= 100) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
    if (a >= 10) return value.toFixed(2);
    return value.toFixed(3);
  }

  function divergingExpression(property = '_z') {
    return ['interpolate', ['linear'], ['coalesce', ['get', property], 0],
      -2.5, '#2166ac', -1, '#67a9cf', 0, '#f1f1f1', 1, '#ef8a62', 2.5, '#b2182b'];
  }

  async function initLag() {
    shell('lag');
    const controls = document.getElementById('controls');
    controls.innerHTML = weightsControls() + `
      <div class="control-group"><label for="variable">Variable</label><select id="variable">${variableOptions('condis15')}</select></div>
      <div class="control-group"><label for="lag-map-mode">Map</label><select id="lag-map-mode"><option value="y">Observed value y</option><option value="wy">Spatial lag Wy</option></select></div>
      <div class="readout-grid">
        <div class="metric"><div class="metric-label">yᵢ</div><div id="yi" class="metric-value">—</div></div>
        <div class="metric"><div class="metric-label">Wyᵢ</div><div id="wyi" class="metric-value">—</div></div>
      </div>
      <div class="equation-box" id="lag-equation">Click a tract to build its spatial lag.</div>
      <div class="table-wrap"><h3>Neighbor contributions</h3><div id="neighbor-list" class="neighbor-list"><div class="small" style="padding:10px">No tract selected.</div></div></div>
      <p id="lag-sample" class="small" style="margin-top:12px"></p>`;

    const map = C.createMap('map', { basemap: true });
    await waitMap(map);
    const loaded = await loadChicago();
    let fc, weights, values, lag, selected = null;

    const paint = () => {
      if (!fc) return;
      const mode = document.getElementById('lag-map-mode').value;
      const mapped = mode === 'wy' ? percentileScores(lag) : percentileScores(values);
      fc.features.forEach((f, i) => {
        f.properties._displayValue = mapped[i];
        f.properties._state = 0;
      });
      if (selected !== null && fc.features[selected]) {
        fc.features[selected].properties._state = 1;
        weights.neighbors[selected].forEach(j => { fc.features[j].properties._state = 2; });
      }
      C.addOrUpdateUnits(map, fc, { fillColor: C.valueColorExpression('_displayValue'), fillOpacity: .72 });
      map.setPaintProperty('units-fill', 'fill-color', C.valueColorExpression('_displayValue'));
      map.setPaintProperty('units-line', 'line-color', ['case', ['==',['get','_state'],1], '#2CA25F', ['==',['get','_state'],2], '#f0a54a', '#ededed']);
      map.setPaintProperty('units-line', 'line-width', ['case', ['==',['get','_state'],1], 3, ['==',['get','_state'],2], 1.8, .55]);
    };

    const readout = () => {
      if (selected === null || !fc.features[selected]) return;
      document.getElementById('yi').textContent = formatValue(values[selected]);
      document.getElementById('wyi').textContent = formatValue(lag[selected]);
      const row = weights.rows[selected];
      const terms = row.map(x => `${x.w.toFixed(3)}×${formatValue(values[x.j])}`);
      document.getElementById('lag-equation').textContent = row.length ? `Wyᵢ = ${terms.join(' + ')} = ${formatValue(lag[selected])}` : 'No neighbors under the current definition.';
      document.getElementById('neighbor-list').innerHTML = row.length ? row.map(x => `
        <div class="neighbor-row"><span>${fc.features[x.j].properties._label}</span><span class="num">y=${formatValue(values[x.j])}</span><span class="num">w=${x.w.toFixed(3)}</span></div>`).join('') : '<div class="small" style="padding:10px">No neighbors under this definition.</div>';
    };

    const rebuildData = () => {
      const variable = document.getElementById('variable').value;
      fc = completeCase(loaded.fc, [variable]);
      values = fc.features.map(f => Number(f.properties[variable]));
      selected = null;
      weights = C.buildWeights(fc, currentWeightSpec());
      lag = C.spatialLag(values, weights);
      C.addOrUpdateUnits(map, fc, { fillColor: C.valueColorExpression('_displayValue'), fillOpacity: .72 });
      C.fitGeoJSON(map, fc);
      paint();
      document.getElementById('lag-sample').textContent = `${fc.features.length} tracts with nonmissing ${VAR_LABELS[variable]}. Map colors show within-variable percentile ranks; calculations use the original values.`;
      document.getElementById('yi').textContent = '—';
      document.getElementById('wyi').textContent = '—';
      document.getElementById('lag-equation').textContent = 'Click a tract to build its spatial lag.';
      document.getElementById('neighbor-list').innerHTML = '<div class="small" style="padding:10px">No tract selected.</div>';
      setMsg(`Chicago · ${VAR_LABELS[variable]}. Click a tract to inspect how Wy is constructed.`);
    };

    const recomputeWeights = () => {
      if (!fc) return;
      setMsg('Recomputing spatial weights and lag…');
      setTimeout(() => {
        try {
          weights = C.buildWeights(fc, currentWeightSpec());
          lag = C.spatialLag(values, weights);
          selected = null;
          paint();
          setMsg('Weights updated. Click a tract to inspect its spatial lag.');
        } catch (err) { setMsg(err.message, true); }
      }, 20);
    };

    bindWeightControls(recomputeWeights);
    document.getElementById('variable').addEventListener('change', rebuildData);
    document.getElementById('lag-map-mode').addEventListener('change', paint);
    map.on('click', 'units-fill', e => { selected = Number(e.features[0].properties._index); paint(); readout(); });
    map.on('mouseenter', 'units-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'units-fill', () => { map.getCanvas().style.cursor = ''; });
    rebuildData();
  }

  function classify(z, wz) { return z >= 0 && wz >= 0 ? 'HH' : z < 0 && wz < 0 ? 'LL' : z >= 0 ? 'HL' : 'LH'; }

  function scatterSVG(z, wz, fc, selected = null) {
    const W = 360, H = 300, pad = 38;
    const maxAbs = Math.max(1.2, ...z.map(Math.abs), ...wz.map(Math.abs));
    const sx = v => pad + (v + maxAbs) / (2 * maxAbs) * (W - 2*pad);
    const sy = v => H - pad - (v + maxAbs) / (2 * maxAbs) * (H - 2*pad);
    const colors = { HH:'#d95f5f', LL:'#4c78a8', HL:'#f2a3a3', LH:'#8fb7da' };
    const pts = z.map((x,i) => `<circle class="scatter-point" data-index="${i}" cx="${sx(x)}" cy="${sy(wz[i])}" r="${selected===i?6:3.5}" fill="${colors[classify(x,wz[i])]}" stroke="${selected===i?'#fff':'#222'}" stroke-width="${selected===i?2:1}"><title>${fc.features[i].properties._label}</title></circle>`).join('');
    const slope = z.reduce((a,x,i) => a + x*wz[i], 0) / Math.max(z.reduce((a,x)=>a+x*x,0), 1e-9);
    return `<svg id="scatter-svg" class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Moran scatterplot">
      <line x1="${sx(0)}" y1="${pad}" x2="${sx(0)}" y2="${H-pad}" class="chart-axis"/>
      <line x1="${pad}" y1="${sy(0)}" x2="${W-pad}" y2="${sy(0)}" class="chart-axis"/>
      <line x1="${sx(-maxAbs)}" y1="${sy(slope*-maxAbs)}" x2="${sx(maxAbs)}" y2="${sy(slope*maxAbs)}" stroke="#2CA25F" stroke-width="1.5"/>
      <text x="${W-50}" y="${sy(0)-7}" class="chart-label">zᵢ</text><text x="${sx(0)+7}" y="18" class="chart-label">Wzᵢ</text>
      <text x="${W-65}" y="22" class="chart-label">HH</text><text x="12" y="${H-16}" class="chart-label">LL</text><text x="${W-65}" y="${H-16}" class="chart-label">HL</text><text x="12" y="22" class="chart-label">LH</text>${pts}</svg>`;
  }

  async function initLisa() {
    shell('lisa');
    const controls = document.getElementById('controls');
    controls.innerHTML = weightsControls() + `
      <div class="control-group"><label for="variable">Variable</label><select id="variable">${variableOptions('rtavgtvioevt2018')}</select></div>
      <div class="readout-grid">
        <div class="metric"><div class="metric-label">Global Moran’s I</div><div id="global-i" class="metric-value">—</div></div>
        <div class="metric"><div class="metric-label">Selected class</div><div id="selected-class" class="metric-value">—</div></div>
      </div>
      <div class="chart-wrap"><div id="scatter"></div><div class="legend"><span class="legend-item"><span class="swatch" style="background:#d95f5f"></span>HH</span><span class="legend-item"><span class="swatch" style="background:#4c78a8"></span>LL</span><span class="legend-item"><span class="swatch" style="background:#f2a3a3"></span>HL</span><span class="legend-item"><span class="swatch" style="background:#8fb7da"></span>LH</span></div></div>
      <div class="control-group"><button id="lisa-permute" class="primary">Run 99 local permutations</button></div>
      <div class="control-group"><label for="sig-threshold">After permutations, show</label><select id="sig-threshold"><option value="1">All quadrants</option><option value="0.10">p ≤ .10</option><option value="0.05">p ≤ .05</option><option value="0.01">p ≤ .01</option></select></div>
      <div id="lisa-note" class="small">Quadrants are shown immediately from z and Wz. Permutations add a local significance filter.</div>`;

    const map = C.createMap('map', { basemap: true });
    await waitMap(map);
    const loaded = await loadChicago();
    let fc, values, weights, local, pvals = null, selected = null;

    const bindScatter = () => document.querySelectorAll('.scatter-point').forEach(pt => pt.addEventListener('click', () => { selected = Number(pt.dataset.index); paint(); }));
    const paint = () => {
      const threshold = Number(document.getElementById('sig-threshold').value);
      fc.features.forEach((f,i) => {
        f.properties._class = classify(local.z[i], local.lagZ[i]);
        f.properties._sig = !pvals || threshold >= 1 || pvals[i] <= threshold ? 1 : 0;
        f.properties._state = selected === i ? 1 : 0;
      });
      C.addOrUpdateUnits(map, fc, { fillColor: C.lisaColorExpression(), fillOpacity: .78 });
      map.setPaintProperty('units-fill','fill-color',C.lisaColorExpression());
      map.setPaintProperty('units-line','line-color',['case',['==',['get','_state'],1],'#ffffff','#d6d6d6']);
      map.setPaintProperty('units-line','line-width',['case',['==',['get','_state'],1],3,.55]);
      document.getElementById('scatter').innerHTML = scatterSVG(local.z, local.lagZ, fc, selected);
      bindScatter();
      document.getElementById('global-i').textContent = C.moransI(values, weights).toFixed(3);
      document.getElementById('selected-class').textContent = selected === null ? '—' : `${fc.features[selected].properties._class}${pvals ? ` (p=${pvals[selected].toFixed(2)})` : ''}`;
    };

    const rebuildData = () => {
      const variable = document.getElementById('variable').value;
      fc = completeCase(loaded.fc, [variable]);
      values = fc.features.map(f => Number(f.properties[variable]));
      weights = C.buildWeights(fc, currentWeightSpec());
      local = C.localMorans(values, weights);
      pvals = null; selected = null;
      C.addOrUpdateUnits(map, fc, { fillColor: C.lisaColorExpression(), fillOpacity: .78 });
      C.fitGeoJSON(map, fc);
      paint();
      document.getElementById('sig-threshold').value = '1';
      document.getElementById('lisa-note').textContent = `${fc.features.length} tracts with nonmissing ${VAR_LABELS[variable]}. Quadrants are shown immediately; permutations add a significance filter.`;
      setMsg(`Chicago · ${VAR_LABELS[variable]}. Click a tract or scatterplot point.`);
    };

    const recomputeWeights = () => {
      if (!fc) return;
      setMsg('Recomputing local spatial association…');
      setTimeout(() => {
        weights = C.buildWeights(fc, currentWeightSpec());
        local = C.localMorans(values, weights);
        pvals = null; selected = null; paint();
        document.getElementById('sig-threshold').value = '1';
        setMsg('Weights updated. Click a tract or scatterplot point.');
      }, 20);
    };

    bindWeightControls(recomputeWeights);
    document.getElementById('variable').addEventListener('change', rebuildData);
    document.getElementById('sig-threshold').addEventListener('change', paint);
    document.getElementById('lisa-permute').addEventListener('click', () => {
      const btn = document.getElementById('lisa-permute');
      btn.disabled = true; btn.textContent = 'Permuting…';
      setMsg('Running 99 local permutations…');
      setTimeout(() => {
        try {
          pvals = C.localPermutationP(values, weights, 99, 4555);
          document.getElementById('sig-threshold').value = '0.05';
          paint();
          document.getElementById('lisa-note').textContent = 'Gray tracts do not meet the selected local permutation threshold. P-values are two-sided randomization estimates.';
          setMsg('Local permutation test complete.');
        } catch (err) { setMsg(err.message, true); }
        finally { btn.disabled = false; btn.textContent = 'Run 99 local permutations'; }
      }, 20);
    });
    map.on('click','units-fill', e => { selected = Number(e.features[0].properties._index); paint(); });
    map.on('mouseenter','units-fill', () => { map.getCanvas().style.cursor='pointer'; });
    map.on('mouseleave','units-fill', () => { map.getCanvas().style.cursor=''; });
    rebuildData();
  }

  function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i += 1) s += a[i] * b[i]; return s; }
  function sparseW(weights, v) { return weights.rows.map(row => row.reduce((s, x) => s + x.w * v[x.j], 0)); }
  function columns(X) { return X[0].map((_, j) => X.map(r => r[j])); }
  function fromColumns(cols) { return cols[0].map((_, i) => cols.map(c => c[i])); }

  function tracePowers(weights, maxPower = 18, probes = 14, seed = 81771) {
    const rng = C.seededRandom(seed);
    const traces = Array(maxPower).fill(0);
    for (let r = 0; r < probes; r += 1) {
      const z = Array.from({ length: weights.n }, () => rng() < .5 ? -1 : 1);
      let v = z.slice();
      for (let k = 1; k <= maxPower; k += 1) {
        v = sparseW(weights, v);
        traces[k - 1] += dot(z, v) / probes;
      }
    }
    return traces;
  }

  function approxLogDet(alpha, traces) {
    let out = 0, power = alpha;
    for (let k = 1; k <= traces.length; k += 1) {
      out -= power * traces[k - 1] / k;
      power *= alpha;
    }
    return out;
  }

  function logLikFromRSS(rss, n, logDet = 0) {
    return logDet - n / 2 * (Math.log(2 * Math.PI) + 1 + Math.log(Math.max(rss / n, 1e-12)));
  }

  function modelFromOLS(label, fit, weights) {
    return { model: label, beta: fit.beta, se: fit.se, names: fit.names, spatial: null, spatialName: '', resid: fit.resid, logLik: fit.logLik, aic: fit.aic, residualMoran: C.moransI(fit.resid, weights) };
  }

  function estimateSARGeneric(y, X, names, weights, traces) {
    const wy = sparseW(weights, y);
    let best = null;
    const evaluate = rho => {
      const yStar = y.map((v, i) => v - rho * wy[i]);
      const fit = C.ols(yStar, X, names);
      const ll = logLikFromRSS(fit.rss, y.length, approxLogDet(rho, traces));
      return { rho, fit, ll, yStar };
    };
    for (let rho = -.80; rho <= .8001; rho += .05) {
      const item = evaluate(rho);
      if (!best || item.ll > best.ll) best = item;
    }
    const center = best.rho;
    for (let rho = center - .05; rho <= center + .0501; rho += .01) {
      if (rho <= -.95 || rho >= .95) continue;
      const item = evaluate(rho);
      if (item.ll > best.ll) best = item;
    }
    const fittedX = C.matVec(X, best.fit.beta);
    const resid = best.yStar.map((v, i) => v - fittedX[i]);
    return { model:'SAR', beta:best.fit.beta, se:best.fit.se, names, spatial:best.rho, spatialName:'ρ', resid, logLik:best.ll, aic:2*(names.length+1)-2*best.ll, residualMoran:C.moransI(resid,weights) };
  }

  function estimateSEMGeneric(y, X, names, weights, traces) {
    const wy = sparseW(weights, y);
    const xCols = columns(X);
    const wxCols = xCols.map(col => sparseW(weights, col));
    let best = null;
    const evaluate = lambda => {
      const yStar = y.map((v, i) => v - lambda * wy[i]);
      const xStar = fromColumns(xCols.map((col, j) => col.map((v, i) => v - lambda * wxCols[j][i])));
      const fit = C.ols(yStar, xStar, names);
      const ll = logLikFromRSS(fit.rss, y.length, approxLogDet(lambda, traces));
      return { lambda, fit, ll };
    };
    for (let lambda = -.80; lambda <= .8001; lambda += .05) {
      const item = evaluate(lambda);
      if (!best || item.ll > best.ll) best = item;
    }
    const center = best.lambda;
    for (let lambda = center - .05; lambda <= center + .0501; lambda += .01) {
      if (lambda <= -.95 || lambda >= .95) continue;
      const item = evaluate(lambda);
      if (item.ll > best.ll) best = item;
    }
    const fitted = C.matVec(X, best.fit.beta);
    const rawResid = y.map((v, i) => v - fitted[i]);
    const wu = sparseW(weights, rawResid);
    const innovations = rawResid.map((v, i) => v - best.lambda * wu[i]);
    return { model:'SEM', beta:best.fit.beta, se:best.fit.se, names, spatial:best.lambda, spatialName:'λ', resid:innovations, logLik:best.ll, aic:2*(names.length+1)-2*best.ll, residualMoran:C.moransI(innovations,weights) };
  }

  function estimateSLXGeneric(y, predictors, predNames, weights) {
    const wx = predictors.map(col => sparseW(weights, col));
    const X = Array.from({ length: y.length }, (_, i) => [1, ...predictors.map(col => col[i]), ...wx.map(col => col[i])]);
    const names = ['Intercept', ...predNames, ...predNames.map(n => `W:${n}`)];
    const fit = C.ols(y, X, names);
    return modelFromOLS('SLX', fit, weights);
  }

  function fitRealModels(fc, weights) {
    const y = fc.features.map(f => Number(f.properties[REG_Y]));
    const predictors = REG_X.map(name => fc.features.map(f => Number(f.properties[name])));
    const X = Array.from({ length: y.length }, (_, i) => [1, ...predictors.map(col => col[i])]);
    const names = ['Intercept', ...REG_X];
    const ols = modelFromOLS('OLS', C.ols(y, X, names), weights);
    const traces = tracePowers(weights, 18, 14, 20260813);
    const sar = estimateSARGeneric(y, X, names, weights, traces);
    const sem = estimateSEMGeneric(y, X, names, weights, traces);
    const slx = estimateSLXGeneric(y, predictors, REG_X, weights);
    return { y, X, predictors, models:[ols,sar,sem,slx], traces };
  }

  function summaryModelTable(models) {
    const focal = 'condis15';
    const rows = models.map(m => {
      const idx = m.names.indexOf(focal);
      const spatial = m.spatial === null ? '—' : `${m.spatialName}=${m.spatial.toFixed(3)}`;
      return `<tr><td>${m.model}</td><td>${idx >= 0 ? m.beta[idx].toFixed(3) : '—'}</td><td>${idx >= 0 ? m.se[idx].toFixed(3) : '—'}</td><td>${spatial}</td><td>${m.aic.toFixed(1)}</td><td>${m.residualMoran.toFixed(3)}</td></tr>`;
    }).join('');
    return `<table class="model-table"><thead><tr><th>Model</th><th>b: disadvantage</th><th>SE</th><th>Spatial</th><th>AIC</th><th>Residual I</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function fullCoefficientTable(models) {
    const rows = ['Intercept', ...REG_X].map(name => {
      const label = name === 'Intercept' ? 'Intercept' : VAR_LABELS[name];
      const cells = models.map(m => {
        const i = m.names.indexOf(name);
        return i < 0 ? '<td>—</td>' : `<td>${m.beta[i].toFixed(3)}<br><span class="small">(${m.se[i].toFixed(3)})</span></td>`;
      }).join('');
      return `<tr><td>${label}</td>${cells}</tr>`;
    }).join('');
    const slx = models.find(m => m.model === 'SLX');
    const lagRows = REG_X.map(name => {
      const i = slx.names.indexOf(`W:${name}`);
      return `<tr><td>W × ${VAR_LABELS[name]}</td><td>—</td><td>—</td><td>—</td><td>${slx.beta[i].toFixed(3)}<br><span class="small">(${slx.se[i].toFixed(3)})</span></td></tr>`;
    }).join('');
    return `<div style="max-height:390px;overflow:auto"><table class="model-table"><thead><tr><th>Coefficient</th><th>OLS</th><th>SAR</th><th>SEM</th><th>SLX</th></tr></thead><tbody>${rows}${lagRows}</tbody></table></div>`;
  }

  function simSummaryTable(models) {
    return `<table class="model-table"><thead><tr><th>Model</th><th>β̂ on X</th><th>SE</th><th>Spatial</th><th>AIC</th><th>Residual I</th></tr></thead><tbody>${models.map(m => `<tr><td>${m.model}</td><td>${m.beta[1].toFixed(3)}</td><td>${m.se[1].toFixed(3)}</td><td>${m.spatial===null?'—':`${m.spatialName}=${m.spatial.toFixed(3)}`}</td><td>${m.aic.toFixed(1)}</td><td>${m.residualMoran.toFixed(3)}</td></tr>`).join('')}</tbody></table>`;
  }

  async function initRegression() {
    shell('regression');
    const controls = document.getElementById('controls');
    const map = C.createMap('map', { basemap: true });
    await waitMap(map);
    let mode = 'simulation';
    let simSeed = 32111, simData = null, simModels = null, simGrid = C.gridGeoJSON(8,8,[-1,-1,1,1]);
    let realCache = null;

    const mapValues = (fc, vals, diverging = false) => {
      const z = C.standardize(vals);
      fc.features.forEach((f,i) => {
        f.properties._z = Math.max(-3, Math.min(3, z[i]));
        f.properties._displayValue = 50 + 17 * f.properties._z;
      });
      C.addOrUpdateUnits(map, fc, { fillColor: diverging ? divergingExpression('_z') : C.valueColorExpression('_displayValue'), fillOpacity: .82 });
      map.setPaintProperty('units-fill', 'fill-color', diverging ? divergingExpression('_z') : C.valueColorExpression('_displayValue'));
      map.setPaintProperty('units-line', 'line-color', '#e0e0e0');
      map.setPaintProperty('units-line', 'line-width', .45);
      C.fitGeoJSON(map, fc, 18);
    };

    const renderModePicker = () => `
      <div class="control-group"><label for="reg-mode">Teaching mode</label><select id="reg-mode"><option value="simulation" ${mode==='simulation'?'selected':''}>Controlled simulation</option><option value="real" ${mode==='real'?'selected':''}>Real Chicago data</option></select></div>`;

    const bindMode = () => document.getElementById('reg-mode').addEventListener('change', e => { mode = e.target.value; render(); });

    const renderSimulation = () => {
      controls.innerHTML = renderModePicker() + `
        <div class="control-group"><label for="dgp">True data-generating process</label><select id="dgp"><option value="ols">OLS: y = βX + ε</option><option value="sar">SAR: y = ρWy + βX + ε</option><option value="sem">SEM: y = βX + u; u = λWu + ε</option><option value="slx">SLX: y = βX + θWX + ε</option></select></div>
        <div class="control-group"><label for="beta">β on X</label><div class="range-line"><input id="beta" type="range" min="0" max="3" step="0.1" value="1.5"><span id="beta-v" class="range-value">1.5</span></div></div>
        <div class="control-group"><label for="rho">ρ (SAR dependence)</label><div class="range-line"><input id="rho" type="range" min="0" max="0.8" step="0.05" value="0.5"><span id="rho-v" class="range-value">0.50</span></div></div>
        <div class="control-group"><label for="lambda">λ (spatial error)</label><div class="range-line"><input id="lambda" type="range" min="0" max="0.8" step="0.05" value="0.5"><span id="lambda-v" class="range-value">0.50</span></div></div>
        <div class="control-group"><label for="theta">θ on WX</label><div class="range-line"><input id="theta" type="range" min="-2" max="2" step="0.1" value="1"><span id="theta-v" class="range-value">1.0</span></div></div>
        <div class="button-row"><button id="generate" class="primary">Generate new realization</button></div>
        <div class="control-group" style="margin-top:16px"><label for="reg-map">Map variable</label><select id="reg-map"><option value="y">Outcome y</option><option value="x">Predictor X</option><option value="resid-ols">OLS residuals</option></select></div>
        <div id="model-results" class="table-wrap"><p class="small">Generating models…</p></div>
        <div class="equation-box" id="reg-lesson"></div>`;
      bindMode();
      const updateLabels = () => {
        document.getElementById('beta-v').textContent=Number(document.getElementById('beta').value).toFixed(1);
        document.getElementById('rho-v').textContent=Number(document.getElementById('rho').value).toFixed(2);
        document.getElementById('lambda-v').textContent=Number(document.getElementById('lambda').value).toFixed(2);
        document.getElementById('theta-v').textContent=Number(document.getElementById('theta').value).toFixed(1);
      };
      const updateEnabled = () => {
        const d=document.getElementById('dgp').value;
        document.getElementById('rho').disabled=d!=='sar';
        document.getElementById('lambda').disabled=d!=='sem';
        document.getElementById('theta').disabled=d!=='slx';
      };
      const paint = () => {
        if (!simData) return;
        const ols=simModels.find(m=>m.model==='OLS');
        const which=document.getElementById('reg-map').value;
        const vals=which==='x'?simData.x:which==='resid-ols'?ols.resid:simData.y;
        mapValues(simGrid, vals, which==='resid-ols');
      };
      const generate = () => {
        updateLabels(); updateEnabled();
        const params={dgp:document.getElementById('dgp').value,beta:Number(document.getElementById('beta').value),rho:Number(document.getElementById('rho').value),lambda:Number(document.getElementById('lambda').value),theta:Number(document.getElementById('theta').value),seed:simSeed++,rows:8,cols:8};
        setMsg('Generating data from a known process and fitting OLS, SAR, SEM, and SLX…');
        setTimeout(() => {
          try {
            simData=C.generateSpatialProcess(params); simModels=C.fitSpatialModels(simData);
            document.getElementById('model-results').innerHTML=simSummaryTable(simModels);
            const ols=simModels.find(m=>m.model==='OLS');
            document.getElementById('reg-lesson').textContent=`True β = ${params.beta.toFixed(2)}. OLS residual Moran’s I = ${ols.residualMoran.toFixed(3)}. Because the DGP is known here, you can judge directly which model recovers it.`;
            paint(); setMsg('Regenerate with the same parameters to see sampling variation around a known truth.');
          } catch (err) { setMsg(err.message,true); }
        },20);
      };
      ['beta','rho','lambda','theta'].forEach(id=>document.getElementById(id).addEventListener('input',updateLabels));
      document.getElementById('dgp').addEventListener('change',()=>{updateEnabled();generate();});
      document.getElementById('generate').addEventListener('click',generate);
      document.getElementById('reg-map').addEventListener('change',paint);
      updateLabels(); updateEnabled(); generate();
    };

    const renderReal = async () => {
      controls.innerHTML = renderModePicker() + `
        <div class="equation-box" style="margin-top:0">Outcome: ${VAR_LABELS[REG_Y]}<br>Predictors: ${REG_X.length} neighborhood demographic, housing, and land-use measures from 2015.</div>
        <div class="control-group"><label>Spatial weights</label><div class="equation-box" style="margin-top:0">Queen contiguity · row-standardized</div></div>
        <div class="control-group"><label for="real-map">Map</label><select id="real-map"><option value="y">Violent crime rate</option><option value="ols">OLS residuals</option><option value="sar">SAR innovations</option><option value="sem">SEM innovations</option><option value="slx">SLX residuals</option></select></div>
        <div id="real-summary" class="table-wrap"><p class="small">Loading Chicago data…</p></div>
        <div class="control-group"><button id="show-coefs">Show full coefficient table</button></div>
        <div id="real-coefs" class="table-wrap" hidden></div>
        <div class="equation-box">The real-data models are descriptive comparisons, not a test that reveals the true spatial process. SAR and SEM use an approximate log-determinant suitable for this browser teaching tool.</div>`;
      bindMode();
      document.getElementById('show-coefs').disabled = true;
      setMsg('Loading and joining Chicago tract data…');
      try {
        if (!realCache) {
          const loaded = await loadChicago();
          const fc = completeCase(loaded.fc, [REG_Y, ...REG_X]);
          setMsg(`Building queen weights for ${fc.features.length} complete-case tracts…`);
          await new Promise(r => setTimeout(r, 20));
          const weights = C.buildWeights(fc, { type:'queen', rowStandardize:true });
          setMsg('Estimating full OLS, SAR, SEM, and SLX models…');
          await new Promise(r => setTimeout(r, 20));
          const fit = fitRealModels(fc, weights);
          realCache = { fc, weights, ...fit };
        }
        const { fc, models, y } = realCache;
        document.getElementById('real-summary').innerHTML = `<p class="small">N = ${fc.features.length} complete-case Chicago tracts. Coefficients below focus on concentrated disadvantage; all ${REG_X.length} predictors are included in every base specification.</p>${summaryModelTable(models)}`;
        document.getElementById('real-coefs').innerHTML = fullCoefficientTable(models);
        const show = document.getElementById('show-coefs');
        show.disabled = false;
        show.addEventListener('click', () => {
          const box = document.getElementById('real-coefs'); box.hidden = !box.hidden;
          show.textContent = box.hidden ? 'Show full coefficient table' : 'Hide full coefficient table';
        });
        const paint = () => {
          const which = document.getElementById('real-map').value;
          const vals = which === 'y' ? y : models.find(m => m.model.toLowerCase() === which).resid;
          mapValues(fc, vals, which !== 'y');
        };
        document.getElementById('real-map').addEventListener('change', paint);
        paint();
        setMsg('Real Chicago model ready. Compare fit, spatial parameters, and residual spatial autocorrelation across specifications.');
      } catch (err) {
        console.error(err); setMsg(`Real-data model failed: ${err.message}`, true);
        document.getElementById('real-summary').innerHTML = `<p class="error">${err.message}</p>`;
      }
    };

    const render = () => mode === 'simulation' ? renderSimulation() : renderReal();
    render();
  }

  async function start() {
    try {
      const lab = document.body.dataset.lab;
      if (lab === 'lag') await initLag();
      else if (lab === 'lisa') await initLisa();
      else if (lab === 'regression') await initRegression();
    } catch (err) {
      console.error(err);
      setMsg(`Lab failed to initialize: ${err.message}`, true);
    }
  }

  window.addEventListener('DOMContentLoaded', start);
})();
