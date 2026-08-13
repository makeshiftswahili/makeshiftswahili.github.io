(() => {
  'use strict';

  const CITY_DATA = {
    neworleans: { label: 'New Orleans', file: 'NewOrleans.geojson' },
    houston: { label: 'Houston', file: 'Houston.geojson' },
    atlanta: { label: 'Atlanta', file: 'Atlanta.geojson' },
    chicago: { label: 'Chicago', file: 'Chicago.geojson' },
    la: { label: 'Los Angeles', file: 'LA.geojson' }
  };

  const cityCache = new Map();
  const weightCache = new WeakMap();

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const sum = arr => arr.reduce((a, b) => a + b, 0);

  function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seededRandom(seed) {
    let s = (seed >>> 0) || 1;
    return function rng() {
      s |= 0;
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(array, rng = Math.random) {
    const out = array.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function featureLabel(feature, i) {
    const p = feature.properties || {};
    const preferred = [
      'gnocdc_lab', 'name', 'NAME', 'Name', 'neighborhood', 'NEIGHBORHOOD',
      'community', 'COMMUNITY', 'tract', 'TRACT', 'label', 'LABEL'
    ];
    for (const key of preferred) {
      if (typeof p[key] === 'string' && p[key].trim()) return p[key].trim();
    }
    for (const [key, value] of Object.entries(p)) {
      if (typeof value === 'string' && value.trim() && !/^shape/i.test(key)) return value.trim();
    }
    return `Unit ${i + 1}`;
  }

  function normalizeCityGeoJSON(raw, cityKey) {
    const fc = JSON.parse(JSON.stringify(raw));
    const centroids = fc.features.map(f => turf.centroid(f).geometry.coordinates);
    const xs = centroids.map(c => c[0]);
    const ys = centroids.map(c => c[1]);
    const west = Math.min(...xs), east = Math.max(...xs);
    const south = Math.min(...ys), north = Math.max(...ys);
    const dx = Math.max(east - west, 1e-9), dy = Math.max(north - south, 1e-9);

    fc.features.forEach((f, i) => {
      const c = centroids[i];
      const nx = (c[0] - west) / dx;
      const ny = (c[1] - south) / dy;
      const uid = String(f.id ?? f.properties?.OBJECTID ?? f.properties?.objectid ?? i);
      const rng = seededRandom(hashString(`${cityKey}-${uid}`));
      const smooth = 50 + 19 * (nx - .5) - 17 * (ny - .5)
        + 13 * Math.sin(nx * Math.PI * 2.4) + 11 * Math.cos(ny * Math.PI * 2.0);
      const value = clamp(smooth + (rng() - .5) * 13, 5, 95);
      f.id = i;
      f.properties = {
        ...(f.properties || {}),
        _uid: uid,
        _index: i,
        _label: featureLabel(f, i),
        _value: value,
        _displayValue: value,
        _state: 0,
        _class: 'NS',
        _sig: 1
      };
    });
    return fc;
  }

  async function loadCity(cityKey) {
    if (!CITY_DATA[cityKey]) throw new Error(`Unknown city: ${cityKey}`);
    if (!cityCache.has(cityKey)) {
      cityCache.set(cityKey, fetch(`/communities-crime/data/${CITY_DATA[cityKey].file}`)
        .then(r => {
          if (!r.ok) throw new Error(`Could not load ${CITY_DATA[cityKey].label} geography.`);
          return r.json();
        })
        .then(raw => normalizeCityGeoJSON(raw, cityKey)));
    }
    const fc = await cityCache.get(cityKey);
    return JSON.parse(JSON.stringify(fc));
  }

  function createMap(container, { basemap = true } = {}) {
    const background = '#161616';
    const style = basemap ? {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          minzoom: 0,
          maxzoom: 19,
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': background } },
        { id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-opacity': 0.46, 'raster-saturation': -0.8, 'raster-brightness-max': 0.72 } }
      ]
    } : {
      version: 8,
      sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': background } }]
    };

    const map = new maplibregl.Map({
      container,
      style,
      center: [-90.07, 29.96],
      zoom: 10,
      attributionControl: true,
      dragRotate: false,
      pitchWithRotate: false
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    return map;
  }

  function fitGeoJSON(map, fc, padding = 28) {
    const b = turf.bbox(fc);
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding, duration: 0 });
  }

  function addOrUpdateUnits(map, fc, options = {}) {
    const sourceId = options.sourceId || 'units';
    const fillId = `${sourceId}-fill`;
    const lineId = `${sourceId}-line`;
    if (map.getSource(sourceId)) {
      map.getSource(sourceId).setData(fc);
      return;
    }
    map.addSource(sourceId, { type: 'geojson', data: fc });
    map.addLayer({
      id: fillId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': options.fillColor || '#2b6f8f',
        'fill-opacity': options.fillOpacity ?? 0.58
      }
    });
    map.addLayer({
      id: lineId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': options.lineColor || '#d8d8d8',
        'line-width': options.lineWidth ?? 0.8,
        'line-opacity': options.lineOpacity ?? 0.8
      }
    });
  }

  function valueColorExpression(property = '_displayValue') {
    return [
      'interpolate', ['linear'], ['coalesce', ['get', property], 50],
      0, '#fff7ec', 20, '#fee8c8', 40, '#fdbb84', 60, '#fc8d59', 80, '#d7301f', 100, '#7f0000'
    ];
  }

  function selectionColorExpression(base = '#426d82') {
    return ['case',
      ['==', ['get', '_state'], 1], '#2CA25F',
      ['==', ['get', '_state'], 2], '#f0a54a',
      base
    ];
  }

  function lisaColorExpression() {
    return ['case',
      ['==', ['get', '_sig'], 0], '#5a5a5a',
      ['==', ['get', '_class'], 'HH'], '#d95f5f',
      ['==', ['get', '_class'], 'LL'], '#4c78a8',
      ['==', ['get', '_class'], 'HL'], '#f2a3a3',
      ['==', ['get', '_class'], 'LH'], '#8fb7da',
      '#777777'
    ];
  }

  function bboxOverlap(a, b, eps = 1e-10) {
    return !(a[2] < b[0] - eps || b[2] < a[0] - eps || a[3] < b[1] - eps || b[3] < a[1] - eps);
  }

  function getWeightCache(fc) {
    if (!weightCache.has(fc)) weightCache.set(fc, new Map());
    return weightCache.get(fc);
  }

  function buildWeights(fc, spec = {}) {
    const type = spec.type || 'queen';
    const rowStandardize = spec.rowStandardize !== false;
    const k = Math.max(1, Number(spec.k || 4));
    const thresholdKm = Math.max(0.05, Number(spec.thresholdKm || 5));
    const cacheKey = `${type}|${k}|${thresholdKm}|${rowStandardize}`;
    const cache = getWeightCache(fc);
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const n = fc.features.length;
    const neighbors = Array.from({ length: n }, () => []);
    const centroids = fc.features.map(f => turf.centroid(f));

    if (type === 'queen' || type === 'rook') {
      const boxes = fc.features.map(f => turf.bbox(f));
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          if (!bboxOverlap(boxes[i], boxes[j])) continue;
          let touches = false;
          try { touches = turf.booleanTouches(fc.features[i], fc.features[j]); } catch (_) { touches = false; }
          if (!touches) continue;
          let connected = true;
          if (type === 'rook') {
            try { connected = turf.lineOverlap(fc.features[i], fc.features[j], { tolerance: 0.002 }).features.length > 0; }
            catch (_) { connected = false; }
          }
          if (connected) {
            neighbors[i].push(j);
            neighbors[j].push(i);
          }
        }
      }
    } else {
      const dists = Array.from({ length: n }, () => Array(n).fill(Infinity));
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          const d = turf.distance(centroids[i], centroids[j], { units: 'kilometers' });
          dists[i][j] = d;
          dists[j][i] = d;
        }
      }
      if (type === 'knn') {
        for (let i = 0; i < n; i += 1) {
          neighbors[i] = dists[i].map((d, j) => ({ d, j })).filter(x => x.j !== i)
            .sort((a, b) => a.d - b.d).slice(0, Math.min(k, n - 1)).map(x => x.j);
        }
      } else if (type === 'distance') {
        for (let i = 0; i < n; i += 1) {
          neighbors[i] = dists[i].map((d, j) => ({ d, j })).filter(x => x.j !== i && x.d <= thresholdKm).map(x => x.j);
        }
      }
    }

    const rows = neighbors.map(js => {
      const denom = rowStandardize && js.length ? js.length : 1;
      return js.map(j => ({ j, w: rowStandardize ? 1 / denom : 1 }));
    });
    const s0 = rows.reduce((acc, row) => acc + row.reduce((a, x) => a + x.w, 0), 0);
    const result = { type, rowStandardize, k, thresholdKm, neighbors, rows, s0, n };
    cache.set(cacheKey, result);
    return result;
  }

  function spatialLag(values, weights) {
    return weights.rows.map(row => row.reduce((acc, x) => acc + x.w * values[x.j], 0));
  }

  function standardize(values) {
    const m = mean(values);
    const sd = Math.sqrt(values.reduce((a, x) => a + (x - m) ** 2, 0) / values.length) || 1;
    return values.map(x => (x - m) / sd);
  }

  function moransI(values, weights) {
    if (!values.length || !weights.s0) return NaN;
    const z = standardize(values);
    let cross = 0;
    for (let i = 0; i < z.length; i += 1) {
      for (const x of weights.rows[i]) cross += x.w * z[i] * z[x.j];
    }
    const denom = z.reduce((a, x) => a + x * x, 0);
    return (z.length / weights.s0) * (cross / denom);
  }

  function localMorans(values, weights) {
    const z = standardize(values);
    const lagZ = spatialLag(z, weights);
    return { z, lagZ, localI: z.map((x, i) => x * lagZ[i]) };
  }

  function permutationMoran(values, weights, reps = 199, seed = 9917) {
    const rng = seededRandom(seed);
    const observed = moransI(values, weights);
    const sims = [];
    let extreme = 0;
    for (let r = 0; r < reps; r += 1) {
      const sim = moransI(shuffle(values, rng), weights);
      sims.push(sim);
      if (Math.abs(sim) >= Math.abs(observed)) extreme += 1;
    }
    return { observed, sims, p: (extreme + 1) / (reps + 1) };
  }

  function localPermutationP(values, weights, reps = 99, seed = 8173) {
    const rng = seededRandom(seed);
    const { z, localI } = localMorans(values, weights);
    const n = z.length;
    const p = Array(n).fill(1);
    const poolBase = Array.from({ length: n }, (_, i) => i);
    for (let i = 0; i < n; i += 1) {
      const row = weights.rows[i];
      if (!row.length) continue;
      let extreme = 0;
      const pool = poolBase.filter(j => j !== i);
      for (let r = 0; r < reps; r += 1) {
        const sampled = shuffle(pool, rng).slice(0, row.length);
        let lag = 0;
        for (let q = 0; q < row.length; q += 1) lag += row[q].w * z[sampled[q]];
        const sim = z[i] * lag;
        if (Math.abs(sim) >= Math.abs(localI[i])) extreme += 1;
      }
      p[i] = (extreme + 1) / (reps + 1);
    }
    return p;
  }

  function correlation(x, y) {
    const mx = mean(x), my = mean(y);
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < x.length; i += 1) {
      const a = x[i] - mx, b = y[i] - my;
      num += a * b; dx += a * a; dy += b * b;
    }
    return num / Math.sqrt(dx * dy || 1);
  }

  function transpose(A) {
    return A[0].map((_, j) => A.map(row => row[j]));
  }
  function matMul(A, B) {
    const Bt = transpose(B);
    return A.map(row => Bt.map(col => row.reduce((s, x, i) => s + x * col[i], 0)));
  }
  function matVec(A, v) {
    return A.map(row => row.reduce((s, x, i) => s + x * v[i], 0));
  }
  function identity(n) {
    return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 1 : 0));
  }
  function cloneMatrix(A) { return A.map(r => r.slice()); }

  function solveLinear(A, b) {
    const n = A.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let k = 0; k < n; k += 1) {
      let pivot = k;
      for (let i = k + 1; i < n; i += 1) if (Math.abs(M[i][k]) > Math.abs(M[pivot][k])) pivot = i;
      if (Math.abs(M[pivot][k]) < 1e-12) throw new Error('Singular matrix');
      [M[k], M[pivot]] = [M[pivot], M[k]];
      const d = M[k][k];
      for (let j = k; j <= n; j += 1) M[k][j] /= d;
      for (let i = 0; i < n; i += 1) {
        if (i === k) continue;
        const f = M[i][k];
        if (Math.abs(f) < 1e-15) continue;
        for (let j = k; j <= n; j += 1) M[i][j] -= f * M[k][j];
      }
    }
    return M.map(row => row[n]);
  }

  function inverse(A) {
    const n = A.length;
    const cols = identity(n).map((_, j) => solveLinear(A, identity(n).map(row => row[j])));
    return transpose(cols);
  }

  function logAbsDet(A) {
    const M = cloneMatrix(A);
    const n = M.length;
    let logdet = 0;
    for (let k = 0; k < n; k += 1) {
      let pivot = k;
      for (let i = k + 1; i < n; i += 1) if (Math.abs(M[i][k]) > Math.abs(M[pivot][k])) pivot = i;
      if (Math.abs(M[pivot][k]) < 1e-12) return -Infinity;
      [M[k], M[pivot]] = [M[pivot], M[k]];
      const piv = M[k][k];
      logdet += Math.log(Math.abs(piv));
      for (let i = k + 1; i < n; i += 1) {
        const f = M[i][k] / piv;
        for (let j = k + 1; j < n; j += 1) M[i][j] -= f * M[k][j];
      }
    }
    return logdet;
  }

  function denseW(weights) {
    const W = Array.from({ length: weights.n }, () => Array(weights.n).fill(0));
    weights.rows.forEach((row, i) => row.forEach(x => { W[i][x.j] = x.w; }));
    return W;
  }

  function IminusAlphaW(weights, alpha) {
    const W = denseW(weights);
    return W.map((row, i) => row.map((x, j) => (i === j ? 1 : 0) - alpha * x));
  }

  function ols(y, X, names = []) {
    const Xt = transpose(X);
    const XtX = matMul(Xt, X);
    const Xty = matVec(Xt, y);
    const beta = solveLinear(XtX, Xty);
    const fitted = matVec(X, beta);
    const resid = y.map((v, i) => v - fitted[i]);
    const n = y.length, k = beta.length;
    const rss = sum(resid.map(e => e * e));
    const tss = sum(y.map(v => (v - mean(y)) ** 2));
    const sigma2 = rss / Math.max(1, n - k);
    const invXtX = inverse(XtX);
    const se = beta.map((_, i) => Math.sqrt(Math.max(0, sigma2 * invXtX[i][i])));
    const logLik = -n / 2 * (Math.log(2 * Math.PI) + 1 + Math.log(Math.max(rss / n, 1e-12)));
    return {
      beta, se, fitted, resid, rss,
      r2: 1 - rss / Math.max(tss, 1e-12),
      logLik,
      aic: 2 * k - 2 * logLik,
      names: names.length ? names : beta.map((_, i) => `b${i}`)
    };
  }

  function gaussianRandom(rng) {
    let u = 0, v = 0;
    while (!u) u = rng();
    while (!v) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function gridGeoJSON(rows, cols, extent = [-1, -1, 1, 1]) {
    const [x0, y0, x1, y1] = extent;
    const dx = (x1 - x0) / cols, dy = (y1 - y0) / rows;
    const features = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const west = x0 + c * dx, east = west + dx;
        const south = y0 + r * dy, north = south + dy;
        const i = r * cols + c;
        features.push(turf.polygon([[[west,south],[east,south],[east,north],[west,north],[west,south]]], {
          _index: i, _uid: String(i), _label: `Cell ${r + 1}, ${c + 1}`, row: r, col: c,
          _value: 50, _displayValue: 50, _state: 0, _class: 'NS', _sig: 1
        }, { id: i }));
      }
    }
    return turf.featureCollection(features);
  }

  function gridWeights(rows, cols, type = 'queen', rowStandardize = true) {
    const n = rows * cols;
    const neighbors = Array.from({ length: n }, () => []);
    const directions = type === 'rook'
      ? [[-1,0],[1,0],[0,-1],[0,1]]
      : [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const i = r * cols + c;
        for (const [dr, dc] of directions) {
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) neighbors[i].push(rr * cols + cc);
        }
      }
    }
    const rowsW = neighbors.map(js => {
      const d = rowStandardize && js.length ? js.length : 1;
      return js.map(j => ({ j, w: rowStandardize ? 1 / d : 1 }));
    });
    return { type, rowStandardize, neighbors, rows: rowsW, n, s0: rowsW.reduce((a,row) => a + sum(row.map(x => x.w)), 0) };
  }

  function generateSpatialProcess({ rows = 8, cols = 8, dgp = 'ols', beta = 1.5, rho = .5, lambda = .5, theta = 1.0, seed = 12345 }) {
    const n = rows * cols;
    const rng = seededRandom(seed);
    const weights = gridWeights(rows, cols, 'queen', true);
    const W = denseW(weights);
    const x = Array.from({ length: n }, () => gaussianRandom(rng));
    const e = Array.from({ length: n }, () => gaussianRandom(rng));
    const wx = matVec(W, x);
    let y;
    if (dgp === 'sar') {
      const rhs = x.map((v, i) => beta * v + e[i]);
      y = solveLinear(IminusAlphaW(weights, rho), rhs);
    } else if (dgp === 'sem') {
      const u = solveLinear(IminusAlphaW(weights, lambda), e);
      y = x.map((v, i) => beta * v + u[i]);
    } else if (dgp === 'slx') {
      y = x.map((v, i) => beta * v + theta * wx[i] + e[i]);
    } else {
      y = x.map((v, i) => beta * v + e[i]);
    }
    return { x, wx, y, e, weights, rows, cols };
  }

  function estimateSAR(y, X, weights, names) {
    let best = null;
    for (let rho = -0.8; rho <= 0.8001; rho += 0.04) {
      const A = IminusAlphaW(weights, rho);
      const yStar = matVec(A, y);
      const fit = ols(yStar, X, names);
      const ll = logAbsDet(A) - y.length / 2 * (Math.log(2 * Math.PI) + 1 + Math.log(Math.max(fit.rss / y.length, 1e-12)));
      if (!best || ll > best.logLik) best = { rho, fit, logLik: ll };
    }
    const coarse = best.rho;
    for (let rho = coarse - .04; rho <= coarse + .0401; rho += .005) {
      if (rho <= -.95 || rho >= .95) continue;
      const A = IminusAlphaW(weights, rho);
      const yStar = matVec(A, y);
      const fit = ols(yStar, X, names);
      const ll = logAbsDet(A) - y.length / 2 * (Math.log(2 * Math.PI) + 1 + Math.log(Math.max(fit.rss / y.length, 1e-12)));
      if (ll > best.logLik) best = { rho, fit, logLik: ll };
    }
    const A = IminusAlphaW(weights, best.rho);
    const fittedX = matVec(X, best.fit.beta);
    const resid = matVec(A, y).map((v, i) => v - fittedX[i]);
    return { model: 'SAR', beta: best.fit.beta, se: best.fit.se, names, spatial: best.rho, spatialName: 'ρ', resid, logLik: best.logLik, aic: 2 * (best.fit.beta.length + 1) - 2 * best.logLik };
  }

  function estimateSEM(y, X, weights, names) {
    let best = null;
    for (let lambda = -0.8; lambda <= 0.8001; lambda += 0.04) {
      const A = IminusAlphaW(weights, lambda);
      const yStar = matVec(A, y);
      const XStar = X.map(() => []);
      for (let j = 0; j < X[0].length; j += 1) {
        const col = X.map(row => row[j]);
        const transformed = matVec(A, col);
        transformed.forEach((v, i) => XStar[i].push(v));
      }
      const fit = ols(yStar, XStar, names);
      const ll = logAbsDet(A) - y.length / 2 * (Math.log(2 * Math.PI) + 1 + Math.log(Math.max(fit.rss / y.length, 1e-12)));
      if (!best || ll > best.logLik) best = { lambda, fit, logLik: ll };
    }
    const coarse = best.lambda;
    for (let lambda = coarse - .04; lambda <= coarse + .0401; lambda += .005) {
      if (lambda <= -.95 || lambda >= .95) continue;
      const A = IminusAlphaW(weights, lambda);
      const yStar = matVec(A, y);
      const XStar = X.map(() => []);
      for (let j = 0; j < X[0].length; j += 1) {
        const transformed = matVec(A, X.map(row => row[j]));
        transformed.forEach((v, i) => XStar[i].push(v));
      }
      const fit = ols(yStar, XStar, names);
      const ll = logAbsDet(A) - y.length / 2 * (Math.log(2 * Math.PI) + 1 + Math.log(Math.max(fit.rss / y.length, 1e-12)));
      if (ll > best.logLik) best = { lambda, fit, logLik: ll };
    }
    const fitted = matVec(X, best.fit.beta);
    const rawResid = y.map((v, i) => v - fitted[i]);
    const innovations = matVec(IminusAlphaW(weights, best.lambda), rawResid);
    return { model: 'SEM', beta: best.fit.beta, se: best.fit.se, names, spatial: best.lambda, spatialName: 'λ', resid: innovations, logLik: best.logLik, aic: 2 * (best.fit.beta.length + 1) - 2 * best.logLik };
  }

  function fitSpatialModels(data) {
    const { x, wx, y, weights } = data;
    const X = x.map(v => [1, v]);
    const names = ['Intercept', 'X'];
    const olsFit = ols(y, X, names);
    const olsModel = { model: 'OLS', beta: olsFit.beta, se: olsFit.se, names, spatial: null, spatialName: '', resid: olsFit.resid, logLik: olsFit.logLik, aic: olsFit.aic };
    const sar = estimateSAR(y, X, weights, names);
    const sem = estimateSEM(y, X, weights, names);
    const Xslx = x.map((v, i) => [1, v, wx[i]]);
    const slxFit = ols(y, Xslx, ['Intercept', 'X', 'WX']);
    const slx = { model: 'SLX', beta: slxFit.beta, se: slxFit.se, names: ['Intercept','X','WX'], spatial: slxFit.beta[2], spatialName: 'θ', resid: slxFit.resid, logLik: slxFit.logLik, aic: slxFit.aic };
    return [olsModel, sar, sem, slx].map(m => ({ ...m, residualMoran: moransI(m.resid, weights) }));
  }

  function aggregateGrid(base, zoneFn) {
    const groups = new Map();
    base.features.forEach((f, i) => {
      const zone = String(zoneFn(f.properties.row, f.properties.col, i));
      if (!groups.has(zone)) groups.set(zone, []);
      groups.get(zone).push(f);
    });
    const assembled = [];
    for (const [zone, features] of groups.entries()) {
      const x = mean(features.map(f => f.properties.x));
      const y = mean(features.map(f => f.properties.y));
      const copies = features.map(f => turf.polygon(f.geometry.coordinates, { zone }));
      let dissolved;
      try { dissolved = turf.dissolve(turf.featureCollection(copies), { propertyName: 'zone' }).features[0]; }
      catch (_) { dissolved = turf.multiPolygon(copies.map(f => f.geometry.coordinates), { zone }); }
      dissolved.properties = { ...(dissolved.properties || {}), zone, x, y, _displayValue: y, _index: assembled.length, _label: `Zone ${zone}` };
      dissolved.id = assembled.length;
      assembled.push(dissolved);
    }
    return turf.featureCollection(assembled);
  }

  window.SpatialCore = {
    CITY_DATA, clamp, mean, sum, hashString, seededRandom, shuffle,
    loadCity, createMap, fitGeoJSON, addOrUpdateUnits, valueColorExpression,
    selectionColorExpression, lisaColorExpression, buildWeights, spatialLag,
    standardize, moransI, localMorans, permutationMoran, localPermutationP,
    correlation, transpose, matMul, matVec, identity, solveLinear, inverse,
    logAbsDet, denseW, IminusAlphaW, ols, gaussianRandom, gridGeoJSON,
    gridWeights, generateSpatialProcess, fitSpatialModels, aggregateGrid
  };
})();
