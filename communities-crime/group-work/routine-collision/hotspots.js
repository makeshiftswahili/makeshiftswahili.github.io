(() => {
  const data = window.ROUTINE_COLLISION_DATA;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  if (!data?.robberyDataUrl || !data?.hotspotAnalysis) return;

  const hotspotState = {
    robberyGeojson: null,
    points: [],
    hotspots: [],
    map: null,
    selectedRank: null,
    notes: {}
  };

  function streetViewUrl(site) {
    return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${encodeURIComponent(site.lat + ',' + site.lng)}`;
  }

  function projectBostonPoint(lng, lat) {
    const lat0 = 42.33 * Math.PI / 180;
    return {
      x: lng * 111320 * Math.cos(lat0),
      y: lat * 111132
    };
  }

  function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function countWithinRadius(center, points, radiusMeters) {
    const r2 = radiusMeters * radiusMeters;
    let count = 0;
    for (const point of points) {
      if (distanceSquared(center, point) <= r2) count += 1;
    }
    return count;
  }

  function deriveHotspots(points) {
    const settings = data.hotspotAnalysis;
    const radius2 = settings.radiusMeters * settings.radiusMeters;
    const separation2 = settings.separationMeters * settings.separationMeters;

    const scored = points.map((point, index) => {
      let count = 0;
      for (let j = 0; j < points.length; j += 1) {
        if (distanceSquared(point, points[j]) <= radius2) count += 1;
      }
      return { ...point, index, count };
    }).sort((a, b) => b.count - a.count || a.index - b.index);

    const selected = [];
    for (const candidate of scored) {
      if (selected.every(existing => distanceSquared(candidate, existing) >= separation2)) {
        selected.push({ ...candidate, rank: selected.length + 1 });
        if (selected.length >= settings.topN) break;
      }
    }
    return selected;
  }

  function updateComparisonReveal(points) {
    const radius = data.hotspotAnalysis.comparisonRadiusMeters;
    const ids = data.comparison.siteIds;
    const siteStats = {};

    ids.forEach(id => {
      const site = data.sites[id];
      const projected = projectBostonPoint(site.lng, site.lat);
      const count = countWithinRadius(projected, points, radius);
      siteStats[id] = {
        count,
        display: `${count} robberies`,
        label: `within ${radius} m of the site`
      };
    });

    const winner = ids.reduce(
      (best, id) => siteStats[id].count > siteStats[best].count ? id : best,
      ids[0]
    );

    data.comparison.crimeReveal = {
      winner,
      sites: siteStats,
      explanation: `These are raw incident counts from the Boston robbery point file within a ${radius}-meter radius of each comparison site. The counts describe spatial concentration; they do not by themselves establish why the difference exists.`
    };
  }

  function hotspotMapStyle() {
    const tileUrl = window.CC_BASEMAP?.tileUrl || 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png';
    const attribution = window.CC_BASEMAP?.attributionHtml || '© OpenStreetMap contributors';
    return {
      version: 8,
      sources: {
        base: { type: 'raster', tiles: [tileUrl], tileSize: 256, attribution }
      },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#f4f4f2' } },
        { id: 'base', type: 'raster', source: 'base' }
      ]
    };
  }

  function selectHotspot(hotspot, openStreetView = false) {
    hotspotState.selectedRank = hotspot.rank;
    const panel = $('#hotspotObservationPanel');
    $('#selectedHotspotLabel').textContent = `Hotspot ${hotspot.rank}`;
    $('#selectedHotspotTitle').textContent = `Robbery density investigation site ${hotspot.rank}`;
    $('#selectedHotspotStats').textContent = `${hotspot.lat.toFixed(5)}, ${hotspot.lng.toFixed(5)} · ${hotspot.count} robberies within ${data.hotspotAnalysis.radiusMeters} m`;
    $('#selectedHotspotStreetView').href = streetViewUrl(hotspot);
    panel.classList.remove('is-hidden');

    const notes = hotspotState.notes[hotspot.rank] || {};
    panel.querySelectorAll('[data-hotspot-note]').forEach(textarea => {
      textarea.value = notes[textarea.dataset.hotspotNote] || '';
    });

    $$('.hotspot-list-button').forEach(button => {
      button.classList.toggle('selected', Number(button.dataset.hotspotRank) === hotspot.rank);
    });

    if (openStreetView) {
      window.open(streetViewUrl(hotspot), '_blank', 'noopener,noreferrer');
    }
  }

  function renderHotspotList() {
    $('#hotspotList').innerHTML = hotspotState.hotspots.map(hotspot => `
      <button type="button" class="hotspot-list-button" data-hotspot-rank="${hotspot.rank}">
        <span class="hotspot-rank">${hotspot.rank}</span>
        <span class="hotspot-list-copy">
          <strong>Hotspot ${hotspot.rank}</strong>
          <span>${hotspot.count} robberies within ${data.hotspotAnalysis.radiusMeters} m · ${hotspot.lat.toFixed(5)}, ${hotspot.lng.toFixed(5)}</span>
        </span>
        <span class="hotspot-open">Street View ↗</span>
      </button>
    `).join('');

    $$('.hotspot-list-button').forEach(button => {
      button.addEventListener('click', () => {
        const hotspot = hotspotState.hotspots.find(item => item.rank === Number(button.dataset.hotspotRank));
        if (hotspot) selectHotspot(hotspot, true);
      });
    });
  }

  function initHotspotMap() {
    if (!window.maplibregl || !hotspotState.robberyGeojson) return;

    const map = new maplibregl.Map({
      container: 'hotspotMap',
      style: hotspotMapStyle(),
      center: [-71.08, 42.32],
      zoom: 11.4,
      attributionControl: true
    });
    hotspotState.map = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      map.addSource('robberies', { type: 'geojson', data: hotspotState.robberyGeojson });
      map.addLayer({
        id: 'robbery-points',
        type: 'circle',
        source: 'robberies',
        paint: {
          'circle-radius': 2.3,
          'circle-color': '#b64b4b',
          'circle-opacity': 0.35,
          'circle-stroke-width': 0
        }
      });

      const bounds = new maplibregl.LngLatBounds();
      hotspotState.robberyGeojson.features.forEach(feature => {
        if (feature.geometry?.type === 'Point') bounds.extend(feature.geometry.coordinates);
      });
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 34, maxZoom: 12.3, duration: 0 });

      hotspotState.hotspots.forEach(hotspot => {
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'hotspot-marker';
        marker.textContent = hotspot.rank;
        marker.title = `Hotspot ${hotspot.rank}: ${hotspot.count} robberies within ${data.hotspotAnalysis.radiusMeters} meters. Open Street View.`;
        marker.setAttribute('aria-label', marker.title);
        marker.addEventListener('click', event => {
          event.stopPropagation();
          selectHotspot(hotspot, true);
        });
        new maplibregl.Marker({ element: marker, anchor: 'center' })
          .setLngLat([hotspot.lng, hotspot.lat])
          .addTo(map);
      });
    });
  }

  function bindHotspotNotes() {
    $('#hotspotObservationPanel').querySelectorAll('[data-hotspot-note]').forEach(textarea => {
      textarea.addEventListener('input', () => {
        if (!hotspotState.selectedRank) return;
        hotspotState.notes[hotspotState.selectedRank] = hotspotState.notes[hotspotState.selectedRank] || {};
        hotspotState.notes[hotspotState.selectedRank][textarea.dataset.hotspotNote] = textarea.value;
      });
    });
  }

  function bindMapResize() {
    document.querySelector('[data-stage="6"]')?.addEventListener('click', () => {
      window.setTimeout(() => hotspotState.map?.resize(), 120);
    });
    document.querySelector('[data-next-stage="6"]')?.addEventListener('click', () => {
      window.setTimeout(() => hotspotState.map?.resize(), 120);
    });
  }

  async function init() {
    const status = $('#hotspotStatus');
    try {
      const response = await fetch(data.robberyDataUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const geojson = await response.json();
      const features = Array.isArray(geojson.features)
        ? geojson.features.filter(feature => feature.geometry?.type === 'Point')
        : [];
      if (!features.length) throw new Error('No point features found');

      hotspotState.robberyGeojson = geojson;
      hotspotState.points = features.map((feature, index) => {
        const [lng, lat] = feature.geometry.coordinates;
        const projected = projectBostonPoint(lng, lat);
        return { ...projected, lng, lat, index };
      });
      hotspotState.hotspots = deriveHotspots(hotspotState.points);
      updateComparisonReveal(hotspotState.points);

      status.textContent = '';
      status.classList.add('is-hidden');
      $('#hotspotSummary').innerHTML = `
        <div><span>Robbery incidents</span><strong>${features.length.toLocaleString()}</strong></div>
        <div><span>Density window</span><strong>${data.hotspotAnalysis.radiusMeters} m</strong></div>
        <div><span>Flagged hotspots</span><strong>${hotspotState.hotspots.length}</strong></div>
      `;
      $('#hotspotSummary').classList.remove('is-hidden');
      renderHotspotList();
      initHotspotMap();
      bindHotspotNotes();
      bindMapResize();
    } catch (error) {
      console.error(error);
      status.classList.remove('is-hidden');
      status.textContent = 'The Boston robbery data could not be loaded. Reload the page or tell the instructor before continuing with this stage.';
      $('#hotspotMap').classList.add('is-hidden');
    }
  }

  init();
})();
