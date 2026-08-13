(() => {
  'use strict';
  const C = window.SpatialCore;

  const LABS = {
    weights: {
      eyebrow: 'Lab 1 · Spatial Weights',
      title: 'What counts as a neighbor?',
      description: 'Change the definition of spatial proximity, click a unit, and watch its row of the spatial weights matrix change.'
    },
    lag: {
      eyebrow: 'Lab 2 · Spatial Lag',
      title: 'Build Wy from the map',
      description: 'A spatial lag is a weighted summary of nearby observations. Click a unit to see the calculation neighbor by neighbor.'
    },
    moran: {
      eyebrow: 'Lab 3 · Global Spatial Autocorrelation',
      title: 'Moran’s I Sandbox',
      description: 'Change the spatial pattern while preserving the basic geography and watch Moran’s I move from dispersion to randomness to clustering.'
    },
    lisa: {
      eyebrow: 'Lab 4 · Local Spatial Autocorrelation',
      title: 'LISA & Moran Scatterplot',
      description: 'Link each mapped unit to its standardized value and standardized spatial lag: HH, LL, HL, or LH.'
    },
    maup: {
      eyebrow: 'Lab 5 · Spatial Aggregation',
      title: 'The Modifiable Areal Unit Problem',
      description: 'Keep the underlying observations fixed, then change the scale or zoning system and watch correlations and regression slopes change.'
    },
    regression: {
      eyebrow: 'Lab 6 · Spatial Regression',
      title: 'Why spatial regression exists',
      description: 'Generate data from known spatial processes, fit OLS/SAR/SEM/SLX models, and compare what each estimator leaves behind.'
    }
  };

  function shell() {
    const lab = document.body.dataset.lab;
    const cfg = LABS[lab];
    document.getElementById('app').innerHTML = `
      <main class="shell">
        <nav class="lab-nav"><a href="../">← All labs</a><span>•</span><span>${cfg.eyebrow}</span></nav>
        <header class="page-header">
          <div class="eyebrow">${cfg.eyebrow}</div>
          <h1>${cfg.title}</h1>
          <p>${cfg.description}</p>
        </header>
        <div class="lab-layout">
          <section class="panel map-panel"><div class="map-wrap"><div id="map" class="map"></div><div id="map-message" class="map-message">Loading…</div></div></section>
          <aside id="controls" class="panel controls"></aside>
        </div>
      </main>`;
    return lab;
  }

  function cityOptions() {
    return Object.entries(C.CITY_DATA).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('');
  }

  function weightsControls({ includeRow = true } = {}) {
    return `
      <div class="control-group"><label for="city">City</label><select id="city">${cityOptions()}</select></div>
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

  function bindWeightVisibility(onChange) {
    const type = document.getElementById('weight-type');
    const kWrap = document.getElementById('k-wrap');
    const dWrap = document.getElementById('distance-wrap');
    const k = document.getElementById('k');
    const dist = document.getElementById('distance');
    const refresh = () => {
      kWrap.hidden = type.value !== 'knn';
      dWrap.hidden = type.value !== 'distance';
      if (onChange) onChange();
    };
    type.addEventListener('change', refresh);
    if (k) k.addEventListener('input', () => { document.getElementById('k-value').textContent = k.value; if (onChange) onChange(); });
    if (dist) dist.addEventListener('input', () => { document.getElementById('distance-value').textContent = `${dist.value} km`; if (onChange) onChange(); });
    refresh();
  }

  function currentWeightSpec() {
    return {
      type: document.getElementById('weight-type').value,
      k: Number(document.getElementById('k')?.value || 4),
      thresholdKm: Number(document.getElementById('distance')?.value || 6),
      rowStandardize: document.getElementById('row-standardize')?.checked !== false
    };
  }

  function setMsg(text, error = false) {
    const el = document.getElementById('map-message');
    el.textContent = text;
    el.classList.toggle('error', error);
  }

  function waitMap(map) {
    return new Promise(resolve => map.loaded() ? resolve() : map.once('load', resolve));
  }

  async function initWeights() {
    const controls = document.getElementById('controls');
    controls.innerHTML = weightsControls() + `
      <div class="readout-grid">
        <div class="metric"><div class="metric-label">Selected unit</div><div id="selected-name" class="metric-value" style="font-size:1rem">—</div></div>
        <div class="metric"><div class="metric-label">Neighbors</div><div id="neighbor-count" class="metric-value">—</div></div>
      </div>
      <div class="equation-box" id="weight-equation">Click a polygon to inspect its weights.</div>
      <div class="explain"><h3>Row of W</h3><div id="matrix-row" class="matrix-row"></div><p class="small" style="margin-top:8px">Highlighted cells are nonzero weights for the selected spatial unit.</p></div>`;

    const map = C.createMap('map', { basemap: true });
    await waitMap(map);
    let fc, weights, selected = null;

    const renderSelection = () => {
      if (!fc || !weights) return;
      fc.features.forEach(f => { f.properties._state = 0; });
      if (selected !== null) {
        fc.features[selected].properties._state = 1;
        weights.neighbors[selected].forEach(j => { fc.features[j].properties._state = 2; });
      }
      C.addOrUpdateUnits(map, fc, { fillColor: C.selectionColorExpression('#426d82'), fillOpacity: .63 });
      if (selected === null) return;
      const row = weights.rows[selected];
      document.getElementById('selected-name').textContent = fc.features[selected].properties._label;
      document.getElementById('neighbor-count').textContent = row.length;
      const terms = row.map(x => `w${selected + 1},${x.j + 1}=${x.w.toFixed(3)}`);
      document.getElementById('weight-equation').textContent = terms.length ? terms.join('   ') : 'This unit has no neighbors under the current definition.';
      document.getElementById('matrix-row').innerHTML = fc.features.map((_, j) => {
        const found = row.find(x => x.j === j);
        return `<span class="matrix-cell ${found ? 'on' : ''}" title="${fc.features[j].properties._label}">${found ? found.w.toFixed(2) : '0'}</span>`;
      }).join('');
    };

    const recompute = () => {
      if (!fc) return;
      setMsg('Building spatial weights…');
      setTimeout(() => {
        try {
          weights = C.buildWeights(fc, currentWeightSpec());
          renderSelection();
          setMsg('Click a spatial unit. Change the weights definition and watch its neighbors change.');
        } catch (err) { setMsg(err.message, true); }
      }, 20);
    };

    const load = async () => {
      selected = null;
      document.getElementById('selected-name').textContent = '—';
      document.getElementById('neighbor-count').textContent = '—';
      document.getElementById('matrix-row').innerHTML = '';
      setMsg('Loading city geography…');
      try {
        fc = await C.loadCity(document.getElementById('city').value);
        C.addOrUpdateUnits(map, fc, { fillColor: C.selectionColorExpression('#426d82'), fillOpacity: .63 });
        C.fitGeoJSON(map, fc);
        recompute();
      } catch (err) { setMsg(err.message, true); }
    };

    bindWeightVisibility(recompute);
    document.getElementById('row-standardize').addEventListener('change', recompute);
    document.getElementById('city').addEventListener('change', load);
    map.on('click', 'units-fill', e => { selected = Number(e.features[0].properties._index); renderSelection(); });
    map.on('mouseenter', 'units-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'units-fill', () => { map.getCanvas().style.cursor = ''; });
    await load();
  }

  async function initLag() {
    const controls = document.getElementById('controls');
    controls.innerHTML = weightsControls() + `
      <div class="control-group"><label for="lag-map-mode">Map</label><select id="lag-map-mode"><option value="y">Observed value y</option><option value="wy">Spatial lag Wy</option></select></div>
      <div class="readout-grid">
        <div class="metric"><div class="metric-label">yᵢ</div><div id="yi" class="metric-value">—</div></div>
        <div class="metric"><div class="metric-label">Wyᵢ</div><div id="wyi" class="metric-value">—</div></div>
      </div>
      <div class="equation-box" id="lag-equation">Click a polygon to build its spatial lag.</div>
      <div class="table-wrap"><h3>Neighbor contributions</h3><div id="neighbor-list" class="neighbor-list"><div class="small" style="padding:10px">No unit selected.</div></div></div>
      <p class="small" style="margin-top:12px">Values are synthetic and spatially structured; the geography is real. The point is the mechanics of Wy.</p>`;

    const map = C.createMap('map', { basemap: true });
    await waitMap(map);
    let fc, weights, values, lag, selected = null;

    const paint = () => {
      if (!fc) return;
      const mode = document.getElementById('lag-map-mode').value;
      let mapped = values;
      if (mode === 'wy') {
        const lo = Math.min(...lag), hi = Math.max(...lag);
        mapped = lag.map(v => 5 + 90 * (v - lo) / Math.max(hi - lo, 1e-9));
      }
      fc.features.forEach((f, i) => {
        f.properties._displayValue = mode === 'wy' ? mapped[i] : values[i];
        f.properties._state = 0;
      });
      if (selected !== null) {
        fc.features[selected].properties._state = 1;
        weights.neighbors[selected].forEach(j => { fc.features[j].properties._state = 2; });
      }
      C.addOrUpdateUnits(map, fc, { fillColor: C.valueColorExpression('_displayValue'), fillOpacity: .68 });
      map.setPaintProperty('units-line', 'line-color', ['case', ['==',['get','_state'],1], '#2CA25F', ['==',['get','_state'],2], '#f0a54a', '#f0f0f0']);
      map.setPaintProperty('units-line', 'line-width', ['case', ['==',['get','_state'],1], 3, ['==',['get','_state'],2], 2, .7]);
    };

    const readout = () => {
      if (selected === null) return;
      document.getElementById('yi').textContent = values[selected].toFixed(1);
      document.getElementById('wyi').textContent = lag[selected].toFixed(1);
      const row = weights.rows[selected];
      const terms = row.map(x => `${x.w.toFixed(3)}×${values[x.j].toFixed(1)}`);
      document.getElementById('lag-equation').textContent = `Wyᵢ = ${terms.join(' + ')} = ${lag[selected].toFixed(2)}`;
      document.getElementById('neighbor-list').innerHTML = row.length ? row.map(x => `
        <div class="neighbor-row"><span>${fc.features[x.j].properties._label}</span><span class="num">y=${values[x.j].toFixed(1)}</span><span class="num">w=${x.w.toFixed(3)}</span></div>`).join('') : '<div class="small" style="padding:10px">No neighbors under this definition.</div>';
    };

    const recompute = () => {
      if (!fc) return;
      setMsg('Recomputing spatial lag…');
      setTimeout(() => {
        weights = C.buildWeights(fc, currentWeightSpec());
        lag = C.spatialLag(values, weights);
        paint(); readout();
        setMsg('Click a unit to see exactly how its spatial lag is constructed.');
      }, 20);
    };

    const load = async () => {
      selected = null;
      setMsg('Loading city geography…');
      fc = await C.loadCity(document.getElementById('city').value);
      values = fc.features.map(f => f.properties._value);
      weights = C.buildWeights(fc, currentWeightSpec());
      lag = C.spatialLag(values, weights);
      C.addOrUpdateUnits(map, fc, { fillColor: C.valueColorExpression('_displayValue'), fillOpacity: .68 });
      C.fitGeoJSON(map, fc);
      paint();
      setMsg('Click a unit to see exactly how its spatial lag is constructed.');
    };

    bindWeightVisibility(recompute);
    document.getElementById('row-standardize').addEventListener('change', recompute);
    document.getElementById('city').addEventListener('change', load);
    document.getElementById('lag-map-mode').addEventListener('change', paint);
    map.on('click', 'units-fill', e => { selected = Number(e.features[0].properties._index); paint(); readout(); });
    map.on('mouseenter', 'units-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'units-fill', () => { map.getCanvas().style.cursor = ''; });
    await load();
  }

  function patternValues(kind, rows, cols, seed = 88) {
    const rng = C.seededRandom(seed);
    const vals = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        let v;
        if (kind === 'checker') v = (r + c) % 2 ? 82 : 18;
        else if (kind === 'gradient') v = 10 + 80 * ((r + c) / (rows + cols - 2));
        else if (kind === 'cluster') {
          const a = Math.exp(-((r - rows*.28)**2 + (c - cols*.28)**2) / (rows*1.8));
          const b = Math.exp(-((r - rows*.72)**2 + (c - cols*.72)**2) / (rows*2.1));
          v = 20 + 65 * Math.max(a, b) + (rng() - .5) * 8;
        } else v = 15 + 70 * rng();
        vals.push(C.clamp(v, 0, 100));
      }
    }
    return vals;
  }

  function histogramHTML(values, observed) {
    const min = Math.min(...values, observed), max = Math.max(...values, observed);
    const bins = 18, counts = Array(bins).fill(0);
    values.forEach(v => { const b = Math.min(bins - 1, Math.floor((v - min) / Math.max(max - min, 1e-9) * bins)); counts[b] += 1; });
    const maxC = Math.max(...counts, 1);
    const W = 340, H = 150, pad = 26, bw = (W - 2*pad) / bins;
    const bars = counts.map((c,i) => `<rect x="${pad+i*bw}" y="${H-pad-(c/maxC)*(H-2*pad)}" width="${Math.max(1,bw-1)}" height="${(c/maxC)*(H-2*pad)}" fill="#666"/>`).join('');
    const ox = pad + ((observed - min) / Math.max(max-min,1e-9)) * (W-2*pad);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Permutation distribution of Moran's I">${bars}<line x1="${ox}" y1="12" x2="${ox}" y2="${H-pad}" stroke="#2CA25F" stroke-width="3"/><text x="${ox+4}" y="18" class="chart-label">Observed</text><line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}" class="chart-axis"/></svg>`;
  }

  async function initMoran() {
    const controls = document.getElementById('controls');
    controls.innerHTML = `
      <div class="control-group"><label for="grid-weight">Spatial weights</label><select id="grid-weight"><option value="queen">Queen contiguity</option><option value="rook">Rook contiguity</option></select></div>
      <div class="control-group"><label>Generate pattern</label><div class="button-row"><button data-pattern="random">Random</button><button data-pattern="cluster">Cluster</button><button data-pattern="checker">Checkerboard</button><button data-pattern="gradient">Gradient</button></div></div>
      <div class="metric"><div class="metric-label">Global Moran’s I</div><div id="moran-i" class="metric-value">—</div></div>
      <div class="explain"><p class="small">Click a cell to increase its value. Shift-click to decrease it. The statistic updates immediately.</p></div>
      <div class="control-group"><button id="permute" class="primary">Randomize 199 times</button></div>
      <div id="perm-result" class="chart-wrap"><p class="small">Permutation inference will appear here.</p></div>`;

    const rows = 10, cols = 10;
    const fc = C.gridGeoJSON(rows, cols, [-1,-1,1,1]);
    let values = patternValues('random', rows, cols, 444);
    let weights = C.gridWeights(rows, cols, 'queen', true);
    values.forEach((v,i) => { fc.features[i].properties._displayValue = v; });
    const map = C.createMap('map', { basemap: false });
    await waitMap(map);
    C.addOrUpdateUnits(map, fc, { fillColor: C.valueColorExpression('_displayValue'), fillOpacity: .9, lineColor: '#2f2f2f', lineWidth: .8 });
    C.fitGeoJSON(map, fc, 14);

    const update = () => {
      values.forEach((v,i) => { fc.features[i].properties._displayValue = v; });
      C.addOrUpdateUnits(map, fc);
      map.setPaintProperty('units-fill', 'fill-color', C.valueColorExpression('_displayValue'));
      document.getElementById('moran-i').textContent = C.moransI(values, weights).toFixed(3);
      setMsg('Positive I = similar values cluster. Negative I = neighboring values differ. Near zero = little global spatial pattern.');
    };

    document.querySelectorAll('[data-pattern]').forEach(btn => btn.addEventListener('click', () => {
      values = patternValues(btn.dataset.pattern, rows, cols, Date.now() & 0xffff);
      document.getElementById('perm-result').innerHTML = '<p class="small">Pattern changed; rerun the permutation test.</p>';
      update();
    }));
    document.getElementById('grid-weight').addEventListener('change', e => { weights = C.gridWeights(rows, cols, e.target.value, true); update(); });
    document.getElementById('permute').addEventListener('click', () => {
      const btn = document.getElementById('permute'); btn.disabled = true; btn.textContent = 'Randomizing…';
      setTimeout(() => {
        const out = C.permutationMoran(values, weights, 199, 2209);
        document.getElementById('perm-result').innerHTML = `${histogramHTML(out.sims, out.observed)}<p class="small">Two-sided permutation p ≈ <strong>${out.p.toFixed(3)}</strong>. The gray bars show Moran’s I after shuffling the same values across space.</p>`;
        btn.disabled = false; btn.textContent = 'Randomize 199 times';
      }, 20);
    });
    map.on('click', 'units-fill', e => {
      const i = Number(e.features[0].properties._index);
      values[i] = C.clamp(values[i] + (e.originalEvent.shiftKey ? -10 : 10), 0, 100);
      update();
    });
    map.on('mouseenter', 'units-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'units-fill', () => { map.getCanvas().style.cursor = ''; });
    update();
  }

  function scatterSVG(z, wz, fc, selected = null) {
    const W = 360, H = 300, pad = 38;
    const maxAbs = Math.max(1.2, ...z.map(Math.abs), ...wz.map(Math.abs));
    const sx = v => pad + (v + maxAbs) / (2 * maxAbs) * (W - 2*pad);
    const sy = v => H - pad - (v + maxAbs) / (2 * maxAbs) * (H - 2*pad);
    const cls = (x,y) => x>=0 && y>=0 ? 'HH' : x<0 && y<0 ? 'LL' : x>=0 ? 'HL' : 'LH';
    const colors = {HH:'#d95f5f',LL:'#4c78a8',HL:'#f2a3a3',LH:'#8fb7da'};
    const pts = z.map((x,i) => `<circle class="scatter-point" data-index="${i}" cx="${sx(x)}" cy="${sy(wz[i])}" r="${selected===i?6:4}" fill="${colors[cls(x,wz[i])]}" stroke="${selected===i?'#fff':'#222'}" stroke-width="${selected===i?2:1}"><title>${fc.features[i].properties._label}</title></circle>`).join('');
    const slope = z.reduce((a,x,i) => a + x*wz[i], 0) / Math.max(z.reduce((a,x)=>a+x*x,0), 1e-9);
    const lineX1 = -maxAbs, lineX2 = maxAbs;
    return `<svg id="scatter-svg" class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Moran scatterplot">
      <line x1="${sx(0)}" y1="${pad}" x2="${sx(0)}" y2="${H-pad}" class="chart-axis"/>
      <line x1="${pad}" y1="${sy(0)}" x2="${W-pad}" y2="${sy(0)}" class="chart-axis"/>
      <line x1="${sx(lineX1)}" y1="${sy(slope*lineX1)}" x2="${sx(lineX2)}" y2="${sy(slope*lineX2)}" stroke="#2CA25F" stroke-width="1.5" opacity=".9"/>
      <text x="${W-50}" y="${sy(0)-7}" class="chart-label">zᵢ</text><text x="${sx(0)+7}" y="18" class="chart-label">Wzᵢ</text>
      <text x="${W-65}" y="22" class="chart-label">HH</text><text x="12" y="${H-16}" class="chart-label">LL</text><text x="${W-65}" y="${H-16}" class="chart-label">HL</text><text x="12" y="22" class="chart-label">LH</text>${pts}</svg>`;
  }

  async function initLisa() {
    const controls = document.getElementById('controls');
    controls.innerHTML = weightsControls({ includeRow: false }) + `
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
    let fc, values, weights, local, pvals = null, selected = null;

    const classify = (z,wz) => z>=0 && wz>=0 ? 'HH' : z<0 && wz<0 ? 'LL' : z>=0 ? 'HL' : 'LH';
    const bindScatter = () => {
      document.querySelectorAll('.scatter-point').forEach(pt => pt.addEventListener('click', () => {
        selected = Number(pt.dataset.index); paint();
      }));
    };
    const paint = () => {
      const threshold = Number(document.getElementById('sig-threshold').value);
      fc.features.forEach((f,i) => {
        f.properties._class = classify(local.z[i], local.lagZ[i]);
        f.properties._sig = !pvals || threshold >= 1 || pvals[i] <= threshold ? 1 : 0;
        f.properties._state = selected === i ? 1 : 0;
      });
      C.addOrUpdateUnits(map, fc, { fillColor: C.lisaColorExpression(), fillOpacity: .76 });
      map.setPaintProperty('units-fill','fill-color',C.lisaColorExpression());
      map.setPaintProperty('units-line','line-color',['case',['==',['get','_state'],1],'#ffffff','#d6d6d6']);
      map.setPaintProperty('units-line','line-width',['case',['==',['get','_state'],1],3,.65]);
      document.getElementById('scatter').innerHTML = scatterSVG(local.z, local.lagZ, fc, selected);
      bindScatter();
      document.getElementById('global-i').textContent = C.moransI(values, weights).toFixed(3);
      document.getElementById('selected-class').textContent = selected === null ? '—' : `${fc.features[selected].properties._class}${pvals ? ` (p=${pvals[selected].toFixed(2)})` : ''}`;
    };
    const recompute = () => {
      if (!fc) return;
      weights = C.buildWeights(fc, currentWeightSpec());
      local = C.localMorans(values, weights);
      pvals = null; selected = null; paint();
      setMsg('Click a map unit or scatterplot point to link geography to its Moran quadrant.');
    };
    const load = async () => {
      setMsg('Loading city geography…');
      fc = await C.loadCity(document.getElementById('city').value);
      values = fc.features.map(f => f.properties._value);
      weights = C.buildWeights(fc, currentWeightSpec());
      local = C.localMorans(values, weights); pvals = null; selected = null;
      C.addOrUpdateUnits(map, fc, { fillColor: C.lisaColorExpression(), fillOpacity: .76 });
      C.fitGeoJSON(map, fc); paint(); setMsg('Click a map unit or scatterplot point to link geography to its Moran quadrant.');
    };
    bindWeightVisibility(recompute);
    document.getElementById('city').addEventListener('change', load);
    document.getElementById('sig-threshold').addEventListener('change', paint);
    document.getElementById('lisa-permute').addEventListener('click', () => {
      const btn = document.getElementById('lisa-permute'); btn.disabled = true; btn.textContent = 'Permuting…';
      setTimeout(() => {
        pvals = C.localPermutationP(values, weights, 99, 4555);
        document.getElementById('sig-threshold').value = '0.05'; paint();
        document.getElementById('lisa-note').textContent = 'Gray units do not meet the selected local permutation threshold. P-values are two-sided randomization estimates.';
        btn.disabled = false; btn.textContent = 'Run 99 local permutations';
      }, 20);
    });
    map.on('click','units-fill', e => { selected = Number(e.features[0].properties._index); paint(); });
    map.on('mouseenter','units-fill', () => { map.getCanvas().style.cursor='pointer'; });
    map.on('mouseleave','units-fill', () => { map.getCanvas().style.cursor=''; });
    await load();
  }

  function baseMaupData(rows=16, cols=16) {
    const fc = C.gridGeoJSON(rows, cols, [-1,-1,1,1]);
    const rng = C.seededRandom(9401);
    fc.features.forEach(f => {
      const r = f.properties.row, c = f.properties.col;
      const nx = c/(cols-1), ny = r/(rows-1);
      const contextual = Math.sin(nx*Math.PI*2) + .8*Math.cos(ny*Math.PI*1.5);
      const x = 45 + 18*nx + 10*contextual + (rng()-.5)*20;
      const y = 35 + .18*x + 12*ny - 8*contextual + (rng()-.5)*26;
      f.properties.x = x; f.properties.y = y; f.properties._displayValue = y;
    });
    return fc;
  }

  function aggregateMaup(base, rows, cols, size, scheme) {
    const zoneFn = (r,c) => {
      if (scheme === 'stripes') return `${Math.floor(c/size)}`;
      if (scheme === 'offset') return `${Math.floor((r + Math.floor(size/2))/size)}-${Math.floor((c + Math.floor(size/2))/size)}`;
      return `${Math.floor(r/size)}-${Math.floor(c/size)}`;
    };
    return C.aggregateGrid(base, zoneFn);
  }

  async function initMaup() {
    const controls = document.getElementById('controls');
    controls.innerHTML = `
      <div class="control-group"><label for="maup-scale">Aggregation scale</label><select id="maup-scale"><option value="1">1×1 (original cells)</option><option value="2">2×2</option><option value="4" selected>4×4</option><option value="8">8×8</option></select></div>
      <div class="control-group"><label for="maup-scheme">Zoning scheme</label><select id="maup-scheme"><option value="regular">Regular blocks</option><option value="offset">Shifted blocks</option><option value="stripes">Vertical strips</option></select></div>
      <div class="readout-grid">
        <div class="metric"><div class="metric-label">Spatial units</div><div id="zone-count" class="metric-value">—</div></div>
        <div class="metric"><div class="metric-label">Correlation r</div><div id="maup-r" class="metric-value">—</div></div>
        <div class="metric"><div class="metric-label">OLS slope</div><div id="maup-b" class="metric-value">—</div></div>
        <div class="metric"><div class="metric-label">Underlying cells</div><div class="metric-value">256</div></div>
      </div>
      <div class="equation-box" id="maup-note">The 256 underlying observations never change. Only the boundaries used to summarize them change.</div>
      <div class="explain"><p class="small">Scale effect: change the size of units. Zoning effect: hold the basic scale roughly similar but redraw which cells belong together.</p></div>`;
    const rows=16, cols=16, base=baseMaupData(rows,cols);
    const map=C.createMap('map',{basemap:false}); await waitMap(map);
    let agg;
    const update=()=>{
      const size=Number(document.getElementById('maup-scale').value), scheme=document.getElementById('maup-scheme').value;
      agg=aggregateMaup(base,rows,cols,size,scheme);
      const x=agg.features.map(f=>f.properties.x), y=agg.features.map(f=>f.properties.y);
      const fit=C.ols(y,x.map(v=>[1,v]),['Intercept','X']);
      C.addOrUpdateUnits(map,agg,{fillColor:C.valueColorExpression('_displayValue'),fillOpacity:.86,lineColor:'#ececec',lineWidth:1.3});
      map.setPaintProperty('units-fill','fill-color',C.valueColorExpression('_displayValue'));
      C.fitGeoJSON(map,agg,14);
      document.getElementById('zone-count').textContent=agg.features.length;
      document.getElementById('maup-r').textContent=C.correlation(x,y).toFixed(3);
      document.getElementById('maup-b').textContent=fit.beta[1].toFixed(3);
      setMsg('Change only the aggregation scale or zoning scheme. The 256 underlying cell values remain fixed.');
    };
    document.getElementById('maup-scale').addEventListener('change',update);
    document.getElementById('maup-scheme').addEventListener('change',update);
    update();
  }

  function regressionTable(models, trueBeta) {
    const minAic=Math.min(...models.map(m=>m.aic));
    return `<table class="model-table"><thead><tr><th>Model</th><th>β̂(X)</th><th>SE</th><th>Spatial</th><th>AIC</th><th>Residual I</th></tr></thead><tbody>${models.map(m=>{
      const xIndex=m.names.indexOf('X');
      const spatial=m.spatial===null?'—':`${m.spatialName}=${m.spatial.toFixed(2)}`;
      return `<tr class="${Math.abs(m.aic-minAic)<1e-6?'best':''}"><td>${m.model}</td><td>${m.beta[xIndex].toFixed(3)}</td><td>${m.se[xIndex].toFixed(3)}</td><td>${spatial}</td><td>${m.aic.toFixed(1)}</td><td>${m.residualMoran.toFixed(3)}</td></tr>`;
    }).join('')}</tbody></table><p class="small" style="margin-top:8px">True β for X = <strong>${trueBeta.toFixed(2)}</strong>. Green shading marks the lowest AIC in this realization. SAR/SEM coefficient SEs are conditional on the estimated spatial parameter, so treat them as teaching approximations.</p>`;
  }

  async function initRegression() {
    const controls=document.getElementById('controls');
    controls.innerHTML=`
      <div class="control-group"><label for="dgp">True data-generating process</label><select id="dgp"><option value="ols">OLS: y = βX + ε</option><option value="sar">SAR: y = ρWy + βX + ε</option><option value="sem">SEM: y = βX + u; u = λWu + ε</option><option value="slx">SLX: y = βX + θWX + ε</option></select></div>
      <div class="control-group"><label for="beta">β on X</label><div class="range-line"><input id="beta" type="range" min="0" max="3" step="0.1" value="1.5"><span id="beta-v" class="range-value">1.5</span></div></div>
      <div class="control-group"><label for="rho">ρ (SAR dependence)</label><div class="range-line"><input id="rho" type="range" min="0" max="0.8" step="0.05" value="0.5"><span id="rho-v" class="range-value">0.50</span></div></div>
      <div class="control-group"><label for="lambda">λ (spatial error)</label><div class="range-line"><input id="lambda" type="range" min="0" max="0.8" step="0.05" value="0.5"><span id="lambda-v" class="range-value">0.50</span></div></div>
      <div class="control-group"><label for="theta">θ on WX</label><div class="range-line"><input id="theta" type="range" min="-2" max="2" step="0.1" value="1"><span id="theta-v" class="range-value">1.0</span></div></div>
      <div class="button-row"><button id="generate" class="primary">Generate new realization</button></div>
      <div class="control-group" style="margin-top:16px"><label for="reg-map">Map variable</label><select id="reg-map"><option value="y">Outcome y</option><option value="x">Predictor X</option><option value="resid-ols">OLS residuals</option></select></div>
      <div id="model-results" class="table-wrap"><p class="small">Generating models…</p></div>
      <div class="equation-box" id="reg-lesson"></div>`;

    const map=C.createMap('map',{basemap:false}); await waitMap(map);
    const grid=C.gridGeoJSON(8,8,[-1,-1,1,1]);
    let seed=32111, data, models;

    const updateEnabled=()=>{
      const d=document.getElementById('dgp').value;
      document.getElementById('rho').disabled=d!=='sar';
      document.getElementById('lambda').disabled=d!=='sem';
      document.getElementById('theta').disabled=d!=='slx';
    };
    const updateLabels=()=>{
      document.getElementById('beta-v').textContent=Number(document.getElementById('beta').value).toFixed(1);
      document.getElementById('rho-v').textContent=Number(document.getElementById('rho').value).toFixed(2);
      document.getElementById('lambda-v').textContent=Number(document.getElementById('lambda').value).toFixed(2);
      document.getElementById('theta-v').textContent=Number(document.getElementById('theta').value).toFixed(1);
    };
    const paint=()=>{
      if(!data)return;
      const mode=document.getElementById('reg-map').value;
      const ols=models.find(m=>m.model==='OLS');
      const vals=mode==='x'?data.x:mode==='resid-ols'?ols.resid:data.y;
      const z=C.standardize(vals);
      grid.features.forEach((f,i)=>{ f.properties._displayValue=50+18*z[i]; });
      C.addOrUpdateUnits(map,grid,{fillColor:C.valueColorExpression('_displayValue'),fillOpacity:.9,lineColor:'#303030',lineWidth:.8});
      map.setPaintProperty('units-fill','fill-color',C.valueColorExpression('_displayValue'));
      C.fitGeoJSON(map,grid,14);
    };
    const generate=()=>{
      updateLabels(); updateEnabled(); setMsg('Generating data and estimating four competing models…');
      const params={dgp:document.getElementById('dgp').value,beta:Number(document.getElementById('beta').value),rho:Number(document.getElementById('rho').value),lambda:Number(document.getElementById('lambda').value),theta:Number(document.getElementById('theta').value),seed:seed++,rows:8,cols:8};
      setTimeout(()=>{
        try{
          data=C.generateSpatialProcess(params); models=C.fitSpatialModels(data);
          document.getElementById('model-results').innerHTML=regressionTable(models,params.beta);
          const ols=models.find(m=>m.model==='OLS');
          document.getElementById('reg-lesson').textContent=`OLS residual Moran’s I = ${ols.residualMoran.toFixed(3)}. Compare that with the correctly specified model and with the coefficient estimate for X. Regenerate the same DGP to see sampling variation.`;
          paint(); setMsg('Same true parameters, new random errors: regenerate repeatedly and watch estimates move around the underlying process.');
        }catch(err){setMsg(err.message,true); document.getElementById('model-results').innerHTML=`<p class="error">${err.message}</p>`;}
      },20);
    };
    ['beta','rho','lambda','theta'].forEach(id=>document.getElementById(id).addEventListener('input',updateLabels));
    document.getElementById('dgp').addEventListener('change',()=>{updateEnabled();generate();});
    document.getElementById('generate').addEventListener('click',generate);
    document.getElementById('reg-map').addEventListener('change',paint);
    updateLabels(); updateEnabled(); generate();
  }

  async function start() {
    const lab=shell();
    try {
      if (lab==='weights') await initWeights();
      else if (lab==='lag') await initLag();
      else if (lab==='moran') await initMoran();
      else if (lab==='lisa') await initLisa();
      else if (lab==='maup') await initMaup();
      else if (lab==='regression') await initRegression();
    } catch (err) {
      console.error(err);
      setMsg(`Lab failed to initialize: ${err.message}`, true);
    }
  }

  window.addEventListener('DOMContentLoaded', start);
})();
