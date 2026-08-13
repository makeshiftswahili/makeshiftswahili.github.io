(() => {
  'use strict';

  const C = window.SpatialCore;
  const DATA_BASE = '../data/chicago/';
  const GEOJSON_FILE = 'sa_cities_tract10.geojson';
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
  let geoPromise = null;
  let chicagoRowsPromise = null;

  const escapeHTML = value => String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

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
    const header = (rows.shift() || []).map(x => x.trim());
    return rows.filter(r => r.some(x => String(x).trim() !== ''))
      .map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
  }

  async function loadRawGeography() {
    if (!geoPromise) {
      geoPromise = fetch(`${DATA_BASE}${GEOJSON_FILE}`)
        .then(r => { if (!r.ok) throw new Error('Could not load multi-city tract geography.'); return r.json(); })
        .then(raw => {
          if (!raw || raw.type !== 'FeatureCollection' || !Array.isArray(raw.features)) {
            throw new Error('The tract GeoJSON is not a valid FeatureCollection.');
          }
          return raw;
        });
    }
    return geoPromise;
  }

  async function loadChicagoRows() {
    if (!chicagoRowsPromise) {
      chicagoRowsPromise = fetch(`${DATA_BASE}${CSV_FILE}`)
        .then(r => { if (!r.ok) throw new Error('Could not load Chicago teaching data.'); return r.text(); })
        .then(parseCSV)
        .then(rows => new Map(rows.map(r => [normalizeGeoid(r.geoid10 ?? r.GEOID10), r])));
    }
    return chicagoRowsPromise;
  }

  function cityNameOf(feature) {
    const value = feature?.properties?.NAME20;
    return value === null || value === undefined ? '' : String(value).trim();
  }

  function isChicago(name) { return /chicago/i.test(String(name)); }

  async function cityNames() {
    const raw = await loadRawGeography();
    const names = [...new Set(raw.features.map(cityNameOf).filter(Boolean))];
    names.sort((a, b) => {
      if (isChicago(a) && !isChicago(b)) return -1;
      if (!isChicago(a) && isChicago(b)) return 1;
      return a.localeCompare(b);
    });
    if (!names.length) throw new Error('No city names were found in NAME20.');
    return names;
  }

  function cleanGeometry(geometry) {
    if (!geometry || !geometry.type || !geometry.coordinates) return null;
    let valid = true;
    function walk(node) {
      if (!Array.isArray(node)) { valid = false; return node; }
      if (node.length >= 2 && !Array.isArray(node[0])) {
        const lon = Number(node[0]), lat = Number(node[1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
          valid = false;
          return node;
        }
        const out = [lon, lat];
        for (let i = 2; i < node.length; i += 1) {
          const extra = Number(node[i]);
          if (Number.isFinite(extra)) out.push(extra);
        }
        return out;
      }
      return node.map(walk);
    }
    const coordinates = walk(geometry.coordinates);
    return valid ? { ...geometry, coordinates } : null;
  }

  function syntheticValue(feature, cityName, geoid) {
    const c = turf.centroid(feature).geometry.coordinates;
    const rng = C.seededRandom(C.hashString(`${cityName}-${geoid}`));
    return C.clamp(50 + 12 * Math.sin(c[0] * 3.2) + 12 * Math.cos(c[1] * 3.8) + (rng() - .5) * 20, 5, 95);
  }

  async function loadCity(cityName) {
    const raw = await loadRawGeography();
    const chicagoRows = isChicago(cityName) ? await loadChicagoRows() : null;
    const features = [];
    let droppedGeometry = 0;

    for (const source of raw.features) {
      if (cityNameOf(source) !== cityName) continue;
      const geometry = cleanGeometry(source.geometry);
      if (!geometry) { droppedGeometry += 1; continue; }
      const geoid = normalizeGeoid(source.properties?.GEOID10 ?? source.properties?.geoid10 ?? source.id);
      const properties = { ...(source.properties || {}) };
      properties._geoid = geoid;
      properties._label = `Tract ${geoid}`;
      properties._state = 0;
      properties._class = 'NS';
      properties._sig = 1;

      if (chicagoRows) {
        const row = chicagoRows.get(geoid);
        for (const [name] of VARIABLES) {
          const rawValue = String(row?.[name] ?? '').trim();
          const numeric = rawValue === '' || rawValue === '.' || rawValue.toLowerCase() === 'na' ? null : Number(rawValue);
          properties[name] = Number.isFinite(numeric) ? numeric : null;
        }
      } else {
        properties._synthetic = syntheticValue({ ...source, geometry }, cityName, geoid);
      }

      features.push({ ...source, id: features.length, geometry, properties: { ...properties, _index: features.length } });
    }

    if (!features.length) throw new Error(`No valid tracts found for ${cityName}.`);
    if (droppedGeometry) console.warn(`Dropped ${droppedGeometry} ${cityName} tract(s) with invalid longitude/latitude coordinates.`);
    return { type: 'FeatureCollection', features };
  }

  function cloneFC(fc) { return JSON.parse(JSON.stringify(fc)); }

  function reindex(fc) {
    fc.features.forEach((f, i) => { f.id = i; f.properties._index = i; });
    return fc;
  }

  function completeCase(fc, vars) {
    return reindex({
      type: 'FeatureCollection',
      features: fc.features.filter(f => vars.every(v => Number.isFinite(Number(f.properties[v])))).map(f => JSON.parse(JSON.stringify(f)))
    });
  }

  function fitGeoJSONSafe(map, fc, padding = 28) {
    let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
    function visit(node) {
      if (!Array.isArray(node)) return;
      if (node.length >= 2 && !Array.isArray(node[0])) {
        const lon = Number(node[0]), lat = Number(node[1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) return;
        west = Math.min(west, lon); east = Math.max(east, lon);
        south = Math.min(south, lat); north = Math.max(north, lat);
        return;
      }
      node.forEach(visit);
    }
    fc.features.forEach(f => visit(f.geometry?.coordinates));
    if (![west, south, east, north].every(Number.isFinite)) throw new Error('Could not calculate valid longitude/latitude bounds for this city.');
    map.fitBounds([[west, south], [east, north]], { padding, duration: 0 });
  }

  function defaultCity(names) { return names.find(n => /^chicago$/i.test(n)) || names.find(isChicago) || names[0]; }

  function cityOptions(names, selected) {
    return names.map(name => `<option value="${escapeHTML(name)}" ${name === selected ? 'selected' : ''}>${escapeHTML(name)}</option>`).join('');
  }

  function variableOptions(selected) {
    return VARIABLES.map(([name, label]) => `<option value="${name}" ${name === selected ? 'selected' : ''}>${escapeHTML(label)}</option>`).join('');
  }

  function shell(lab) {
    const cfg = {
      weights: ['Lab 1 · Spatial Weights', 'What counts as a neighbor?', 'Change the definition of spatial proximity, click a tract, and watch its row of the spatial weights matrix change.'],
      lag: ['Lab 2 · Spatial Lag', 'Build Wy from the map', 'Choose a city, define W, and inspect how each tract’s spatial lag is constructed neighbor by neighbor.'],
      lisa: ['Lab 4 · Local Spatial Autocorrelation', 'LISA & Moran Scatterplot', 'Connect each tract to its standardized value, standardized spatial lag, and HH/LL/HL/LH classification.']
    }[lab];
    document.getElementById('app').innerHTML = `
      <main class="shell">
        <nav class="lab-nav"><a href="../">← All labs</a><span>•</span><span>${cfg[0]}</span></nav>
        <header class="page-header"><div class="eyebrow">${cfg[0]}</div><h1>${cfg[1]}</h1><p>${cfg[2]}</p></header>
        <div class="lab-layout">
          <section class="panel map-panel"><div class="map-wrap"><div id="map" class="map"></div><div id="map-message" class="map-message">Loading tract geography…</div></div></section>
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

  function weightsControls(names, selectedCity, includeRow = true) {
    return `
      <div class="control-group"><label for="city">City</label><select id="city">${cityOptions(names, selectedCity)}</select></div>
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
      ${includeRow ? '<div class="control-group"><label class="checkbox-line"><input id="row-standardize" type="checkbox" checked> Row-standardize weights</label></div>' : ''}`;
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
    document.getElementById('row-standardize')?.addEventListener('change', () => onChange?.());
    refresh();
  }

  function currentWeightSpec() {
    return {
      type: document.getElementById('weight-type').value,
      k: Number(document.getElementById('k').value),
      thresholdKm: Number(document.getElementById('distance').value),
      rowStandardize: document.getElementById('row-standardize')?.checked !== false
    };
  }

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

  async function initWeights() {
    shell('weights');
    const names = await cityNames();
    const initialCity = defaultCity(names);
    const controls = document.getElementById('controls');
    controls.innerHTML = weightsControls(names, initialCity, true) + `
      <div class="readout-grid">
        <div class="metric"><div class="metric-label">Selected tract</div><div id="selected-name" class="metric-value" style="font-size:1rem">—</div></div>
        <div class="metric"><div class="metric-label">Neighbors</div><div id="neighbor-count" class="metric-value">—</div></div>
      </div>
      <div class="equation-box" id="weight-equation">Click a tract to inspect its weights.</div>
      <div class="explain"><h3>Row of W</h3><div id="matrix-row" class="matrix-row"></div><p class="small" style="margin-top:8px">Highlighted cells are nonzero weights for the selected tract.</p></div>`;

    const map = C.createMap('map', { basemap: true });
    await waitMap(map);
    let fc = null, weights = null, selected = null;

    const renderSelection = () => {
      if (!fc || !weights) return;
      fc.features.forEach(f => { f.properties._state = 0; });
      if (selected !== null && fc.features[selected]) {
        fc.features[selected].properties._state = 1;
        weights.neighbors[selected].forEach(j => { fc.features[j].properties._state = 2; });
      }
      C.addOrUpdateUnits(map, fc, { fillColor: C.selectionColorExpression('#426d82'), fillOpacity: .63 });
      map.setPaintProperty('units-fill', 'fill-color', C.selectionColorExpression('#426d82'));
      if (selected === null || !fc.features[selected]) return;
      const row = weights.rows[selected];
      document.getElementById('selected-name').textContent = fc.features[selected].properties._label;
      document.getElementById('neighbor-count').textContent = row.length;
      const terms = row.map(x => `w${selected + 1},${x.j + 1}=${x.w.toFixed(3)}`);
      document.getElementById('weight-equation').textContent = terms.length ? terms.join('   ') : 'This tract has no neighbors under the current definition.';
      document.getElementById('matrix-row').innerHTML = fc.features.map((_, j) => {
        const found = row.find(x => x.j === j);
        return `<span class="matrix-cell ${found ? 'on' : ''}" title="${escapeHTML(fc.features[j].properties._label)}">${found ? found.w.toFixed(2) : '0'}</span>`;
      }).join('');
    };

    const recompute = () => {
      if (!fc) return;
      setMsg('Building spatial weights…');
      setTimeout(() => {
        try {
          weights = C.buildWeights(fc, currentWeightSpec());
          selected = null;
          renderSelection();
          setMsg(`${document.getElementById('city').value} · click a tract to inspect its neighbors.`);
        } catch (err) { setMsg(err.message, true); }
      }, 20);
    };

    const load = async () => {
      try {
        selected = null;
        setMsg('Loading tract geography…');
        fc = await loadCity(document.getElementById('city').value);
        C.addOrUpdateUnits(map, fc, { fillColor: C.selectionColorExpression('#426d82'), fillOpacity: .63 });
        map.setPaintProperty('units-fill', 'fill-color', C.selectionColorExpression('#426d82'));
        fitGeoJSONSafe(map, fc);
        document.getElementById('selected-name').textContent = '—';
        document.getElementById('neighbor-count').textContent = '—';
        document.getElementById('matrix-row').innerHTML = '';
        document.getElementById('weight-equation').textContent = 'Click a tract to inspect its weights.';
        recompute();
      } catch (err) { setMsg(err.message, true); }
    };

    bindWeightControls(recompute);
    document.getElementById('city').addEventListener('change', load);
    await load();
    map.on('click', 'units-fill', e => { selected = Number(e.features[0].properties._index); renderSelection(); });
    map.on('mouseenter', 'units-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'units-fill', () => { map.getCanvas().style.cursor = ''; });
  }

  function setVariableControl(cityName, selected, syntheticLabel = 'Synthetic teaching value') {
    const select = document.getElementById('variable');
    if (isChicago(cityName)) {
      select.disabled = false;
      select.innerHTML = variableOptions(selected);
      select.value = selected;
    } else {
      select.disabled = true;
      select.innerHTML = `<option value="_synthetic">${syntheticLabel}</option>`;
    }
  }

  async function initLag() {
    shell('lag');
    const names = await cityNames();
    const initialCity = defaultCity(names);
    const controls = document.getElementById('controls');
    controls.innerHTML = weightsControls(names, initialCity, true) + `
      <div class="control-group"><label for="variable">Variable</label><select id="variable"></select></div>
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
    let baseFc = null, fc = null, weights = null, values = null, lag = null, selected = null;

    const paint = () => {
      if (!fc || !weights || !values || !lag) return;
      const mapped = percentileScores(document.getElementById('lag-map-mode').value === 'wy' ? lag : values);
      fc.features.forEach((f, i) => { f.properties._displayValue = mapped[i]; f.properties._state = 0; });
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
      if (selected === null || !fc?.features[selected]) return;
      document.getElementById('yi').textContent = formatValue(values[selected]);
      document.getElementById('wyi').textContent = formatValue(lag[selected]);
      const row = weights.rows[selected];
      const terms = row.map(x => `${x.w.toFixed(3)}×${formatValue(values[x.j])}`);
      document.getElementById('lag-equation').textContent = row.length ? `Wyᵢ = ${terms.join(' + ')} = ${formatValue(lag[selected])}` : 'No neighbors under the current definition.';
      document.getElementById('neighbor-list').innerHTML = row.length ? row.map(x => `
        <div class="neighbor-row"><span>${escapeHTML(fc.features[x.j].properties._label)}</span><span class="num">y=${formatValue(values[x.j])}</span><span class="num">w=${x.w.toFixed(3)}</span></div>`).join('') : '<div class="small" style="padding:10px">No neighbors under this definition.</div>';
    };

    const rebuildData = () => {
      const city = document.getElementById('city').value;
      const variable = document.getElementById('variable').value;
      fc = variable === '_synthetic' ? cloneFC(baseFc) : completeCase(baseFc, [variable]);
      values = fc.features.map(f => Number(f.properties[variable]));
      selected = null;
      weights = C.buildWeights(fc, currentWeightSpec());
      lag = C.spatialLag(values, weights);
      C.addOrUpdateUnits(map, fc, { fillColor: C.valueColorExpression('_displayValue'), fillOpacity: .72 });
      fitGeoJSONSafe(map, fc);
      paint();
      document.getElementById('yi').textContent = '—';
      document.getElementById('wyi').textContent = '—';
      document.getElementById('lag-equation').textContent = 'Click a tract to build its spatial lag.';
      document.getElementById('neighbor-list').innerHTML = '<div class="small" style="padding:10px">No tract selected.</div>';
      if (isChicago(city)) {
        document.getElementById('lag-sample').textContent = `${fc.features.length} tracts with nonmissing ${VAR_LABELS[variable]}. Map colors show within-variable percentile ranks; calculations use original values.`;
        setMsg(`${city} · ${VAR_LABELS[variable]}. Click a tract to inspect how Wy is constructed.`);
      } else {
        document.getElementById('lag-sample').textContent = `${fc.features.length} 2010 tracts. Only Chicago currently has linked teaching attributes, so this city uses a clearly labeled synthetic field for the lag mechanics.`;
        setMsg(`${city} · synthetic teaching values on real 2010 tract geography.`);
      }
    };

    const load = async () => {
      try {
        const city = document.getElementById('city').value;
        setMsg('Loading tract geography…');
        baseFc = await loadCity(city);
        setVariableControl(city, 'condis15', 'Synthetic teaching value');
        rebuildData();
      } catch (err) { setMsg(err.message, true); }
    };

    const recomputeWeights = () => {
      if (!fc) return;
      try {
        weights = C.buildWeights(fc, currentWeightSpec());
        lag = C.spatialLag(values, weights);
        selected = null;
        paint();
        setMsg('Weights updated. Click a tract to inspect its spatial lag.');
      } catch (err) { setMsg(err.message, true); }
    };

    bindWeightControls(recomputeWeights);
    document.getElementById('city').addEventListener('change', load);
    document.getElementById('variable').addEventListener('change', rebuildData);
    document.getElementById('lag-map-mode').addEventListener('change', paint);
    await load();
    map.on('click', 'units-fill', e => { selected = Number(e.features[0].properties._index); paint(); readout(); });
    map.on('mouseenter', 'units-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'units-fill', () => { map.getCanvas().style.cursor = ''; });
  }

  function classify(z, wz) { return z >= 0 && wz >= 0 ? 'HH' : z < 0 && wz < 0 ? 'LL' : z >= 0 ? 'HL' : 'LH'; }

  function scatterSVG(z, wz, fc, selected = null) {
    const W = 360, H = 300, pad = 38;
    const maxAbs = Math.max(1.2, ...z.map(Math.abs), ...wz.map(Math.abs));
    const sx = v => pad + (v + maxAbs) / (2 * maxAbs) * (W - 2 * pad);
    const sy = v => H - pad - (v + maxAbs) / (2 * maxAbs) * (H - 2 * pad);
    const colors = { HH:'#d95f5f', LL:'#4c78a8', HL:'#f2a3a3', LH:'#8fb7da' };
    const pts = z.map((x, i) => `<circle class="scatter-point" data-index="${i}" cx="${sx(x)}" cy="${sy(wz[i])}" r="${selected === i ? 6 : 3.5}" fill="${colors[classify(x, wz[i])]}" stroke="${selected === i ? '#fff' : '#222'}" stroke-width="${selected === i ? 2 : 1}"><title>${escapeHTML(fc.features[i].properties._label)}</title></circle>`).join('');
    const slope = z.reduce((a, x, i) => a + x * wz[i], 0) / Math.max(z.reduce((a, x) => a + x * x, 0), 1e-9);
    return `<svg id="scatter-svg" class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Moran scatterplot">
      <line x1="${sx(0)}" y1="${pad}" x2="${sx(0)}" y2="${H-pad}" class="chart-axis"/>
      <line x1="${pad}" y1="${sy(0)}" x2="${W-pad}" y2="${sy(0)}" class="chart-axis"/>
      <line x1="${sx(-maxAbs)}" y1="${sy(slope * -maxAbs)}" x2="${sx(maxAbs)}" y2="${sy(slope * maxAbs)}" stroke="#2CA25F" stroke-width="1.5"/>
      <text x="${W-50}" y="${sy(0)-7}" class="chart-label">zᵢ</text><text x="${sx(0)+7}" y="18" class="chart-label">Wzᵢ</text>
      <text x="${W-65}" y="22" class="chart-label">HH</text><text x="12" y="${H-16}" class="chart-label">LL</text><text x="${W-65}" y="${H-16}" class="chart-label">HL</text><text x="12" y="22" class="chart-label">LH</text>${pts}</svg>`;
  }

  async function initLisa() {
    shell('lisa');
    const names = await cityNames();
    const initialCity = defaultCity(names);
    const controls = document.getElementById('controls');
    controls.innerHTML = weightsControls(names, initialCity, true) + `
      <div class="control-group"><label for="variable">Variable</label><select id="variable"></select></div>
      <div class="readout-grid">
        <div class="metric"><div class="metric-label">Global Moran’s I</div><div id="global-i" class="metric-value">—</div></div>
        <div class="metric"><div class="metric-label">Selected class</div><div id="selected-class" class="metric-value">—</div></div>
      </div>
      <div class="chart-wrap"><div id="scatter"></div><div class="legend"><span class="legend-item"><span class="swatch" style="background:#d95f5f"></span>HH</span><span class="legend-item"><span class="swatch" style="background:#4c78a8"></span>LL</span><span class="legend-item"><span class="swatch" style="background:#f2a3a3"></span>HL</span><span class="legend-item"><span class="swatch" style="background:#8fb7da"></span>LH</span></div></div>
      <div class="control-group"><button id="lisa-permute" class="primary">Run 99 local permutations</button></div>
      <div class="control-group"><label for="sig-threshold">After permutations, show</label><select id="sig-threshold"><option value="1">All quadrants</option><option value="0.10">p ≤ .10</option><option value="0.05">p ≤ .05</option><option value="0.01">p ≤ .01</option></select></div>
      <div id="lisa-note" class="small"></div>`;

    const map = C.createMap('map', { basemap: true });
    await waitMap(map);
    let baseFc = null, fc = null, values = null, weights = null, local = null, pvals = null, selected = null;

    const bindScatter = () => document.querySelectorAll('.scatter-point').forEach(pt => pt.addEventListener('click', () => { selected = Number(pt.dataset.index); paint(); }));
    const paint = () => {
      if (!fc || !local) return;
      const threshold = Number(document.getElementById('sig-threshold').value);
      fc.features.forEach((f, i) => {
        f.properties._class = classify(local.z[i], local.lagZ[i]);
        f.properties._sig = !pvals || threshold >= 1 || pvals[i] <= threshold ? 1 : 0;
        f.properties._state = selected === i ? 1 : 0;
      });
      C.addOrUpdateUnits(map, fc, { fillColor: C.lisaColorExpression(), fillOpacity: .78 });
      map.setPaintProperty('units-fill', 'fill-color', C.lisaColorExpression());
      map.setPaintProperty('units-line', 'line-color', ['case', ['==',['get','_state'],1], '#ffffff', '#d6d6d6']);
      map.setPaintProperty('units-line', 'line-width', ['case', ['==',['get','_state'],1], 3, .55]);
      document.getElementById('scatter').innerHTML = scatterSVG(local.z, local.lagZ, fc, selected);
      bindScatter();
      document.getElementById('global-i').textContent = C.moransI(values, weights).toFixed(3);
      document.getElementById('selected-class').textContent = selected === null ? '—' : `${fc.features[selected].properties._class}${pvals ? ` (p=${pvals[selected].toFixed(2)})` : ''}`;
    };

    const rebuildData = () => {
      const city = document.getElementById('city').value;
      const variable = document.getElementById('variable').value;
      fc = variable === '_synthetic' ? cloneFC(baseFc) : completeCase(baseFc, [variable]);
      values = fc.features.map(f => Number(f.properties[variable]));
      weights = C.buildWeights(fc, currentWeightSpec());
      local = C.localMorans(values, weights);
      pvals = null; selected = null;
      C.addOrUpdateUnits(map, fc, { fillColor: C.lisaColorExpression(), fillOpacity: .78 });
      fitGeoJSONSafe(map, fc);
      document.getElementById('sig-threshold').value = '1';
      paint();
      if (isChicago(city)) {
        document.getElementById('lisa-note').textContent = `${fc.features.length} tracts with nonmissing ${VAR_LABELS[variable]}. Quadrants are shown immediately; permutations add a significance filter.`;
        setMsg(`${city} · ${VAR_LABELS[variable]}. Click a tract or scatterplot point.`);
      } else {
        document.getElementById('lisa-note').textContent = `${fc.features.length} 2010 tracts. Only Chicago currently has linked teaching attributes, so this city uses a synthetic field on the real tract geography.`;
        setMsg(`${city} · synthetic teaching values on real 2010 tract geography.`);
      }
    };

    const load = async () => {
      try {
        const city = document.getElementById('city').value;
        setMsg('Loading tract geography…');
        baseFc = await loadCity(city);
        setVariableControl(city, 'rtavgtvioevt2018', 'Synthetic teaching value');
        rebuildData();
      } catch (err) { setMsg(err.message, true); }
    };

    const recomputeWeights = () => {
      if (!fc) return;
      try {
        weights = C.buildWeights(fc, currentWeightSpec());
        local = C.localMorans(values, weights);
        pvals = null; selected = null;
        document.getElementById('sig-threshold').value = '1';
        paint();
        setMsg('Weights updated. Click a tract or scatterplot point.');
      } catch (err) { setMsg(err.message, true); }
    };

    bindWeightControls(recomputeWeights);
    document.getElementById('city').addEventListener('change', load);
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

    await load();
    map.on('click', 'units-fill', e => { selected = Number(e.features[0].properties._index); paint(); });
    map.on('mouseenter', 'units-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'units-fill', () => { map.getCanvas().style.cursor = ''; });
  }

  async function start() {
    const lab = document.body.dataset.lab;
    try {
      if (lab === 'weights') await initWeights();
      else if (lab === 'lag') await initLag();
      else if (lab === 'lisa') await initLisa();
    } catch (err) {
      console.error(err);
      if (!document.getElementById('app').innerHTML) shell(lab);
      setMsg(`Lab failed to initialize: ${err.message}`, true);
    }
  }

  window.addEventListener('DOMContentLoaded', start);
})();
