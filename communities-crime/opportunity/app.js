const API_URL = "https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/neighborhood-selection";
const DATA_BASE = "../data/";

const citySlug = {
  NewOrleans: "neworleans",
  LA: "losangeles",
  Philadelphia: "philadelphia",
  Chicago: "chicago",
  Houston: "houston",
  SanFrancisco: "sanfrancisco",
  Atlanta: "atlanta",
  Milwaukee: "milwaukee",
  Detroit: "detroit",
  Denver: "denver",
  Seattle: "seattle"
};

const roadClasses = [
  { code: 4, id: "residential", label: "Residential / local street", color: "#f2efe9", width: [10, 0.35, 14, 0.75, 17, 1.35] },
  { code: 3, id: "secondary", label: "Secondary street", color: "#e8d45d", width: [10, 0.65, 14, 1.25, 17, 2.1] },
  { code: 2, id: "major", label: "Major arterial", color: "#ef9a3b", width: [10, 1.05, 14, 2.05, 17, 3.3] },
  { code: 1, id: "freeway", label: "Freeway", color: "#df6072", width: [10, 1.4, 14, 2.8, 17, 4.5] }
];

const landUseClasses = [
  { code: 1, label: "Commercial", color: "#39b7a5" },
  { code: 2, label: "Industrial", color: "#9a78cf" },
  { code: 3, label: "Government", color: "#5d91d7" },
  { code: 4, label: "Education", color: "#79c96b" }
];

const lsuId = document.getElementById("lsuId");
const loadButton = document.getElementById("loadButton");
const lookupMessage = document.getElementById("lookupMessage");
const projectContent = document.getElementById("projectContent");
const cityName = document.getElementById("cityName");
const neighborhoodOne = document.getElementById("neighborhoodOne");
const neighborhoodTwo = document.getElementById("neighborhoodTwo");
const streetStatus = document.getElementById("streetStatus");
const landUseStatus = document.getElementById("landUseStatus");
const barsStatus = document.getElementById("barsStatus");
const microStatus = document.getElementById("microStatus");

let maps = [];
let mapsByContainer = {};
let dataAbortController = null;

function baseStyle() {
  return {
    version: 8,
    sources: {
      satellite: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        attribution: "Tiles © Esri"
      }
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#141414" } },
      { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } }
    ]
  };
}

function showMessage(text, kind = "") {
  lookupMessage.textContent = text;
  lookupMessage.style.color = kind === "error" ? "#ff9e9e" : kind === "success" ? "#9fd0ae" : "#efb366";
}

function destroyMaps() {
  maps.forEach(map => {
    try { map.remove(); } catch {}
  });
  maps = [];
  mapsByContainer = {};
  if (dataAbortController) {
    dataAbortController.abort();
    dataAbortController = null;
  }
}

function walkCoordinates(coords, callback) {
  if (!Array.isArray(coords)) return;
  if (coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
    callback(coords[0], coords[1]);
    return;
  }
  coords.forEach(part => walkCoordinates(part, callback));
}

function featureBox(feature) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  walkCoordinates(feature?.geometry?.coordinates, (x, y) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

function mapBounds(feature) {
  const box = featureBox(feature);
  return box ? [[box[0], box[1]], [box[2], box[3]]] : null;
}

function expandBox(box, factor = 1.15) {
  const width = Math.max(box[2] - box[0], 0.006);
  const height = Math.max(box[3] - box[1], 0.006);
  return [
    box[0] - width * factor,
    box[1] - height * factor,
    box[2] + width * factor,
    box[3] + height * factor
  ];
}

function overlaps(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function filterForNeighborhoods(data, neighborhoodFeatures) {
  const boxes = neighborhoodFeatures.map(feature => expandBox(featureBox(feature)));
  const selected = boxes.map(() => []);

  for (const feature of data.features || []) {
    const box = featureBox(feature);
    if (!box) continue;
    boxes.forEach((target, index) => {
      if (overlaps(box, target)) selected[index].push(feature);
    });
  }

  return selected.map(features => ({ type: "FeatureCollection", features }));
}

function normalizeLandUseData(data) {
  const codes = new Set((data.features || []).map(f => Number(f?.properties?.lucode)).filter(Number.isFinite));
  const usesFiveCodeSchema = codes.has(5);

  if (!usesFiveCodeSchema) {
    return {
      type: "FeatureCollection",
      features: (data.features || []).filter(f => [1, 2, 3, 4].includes(Number(f?.properties?.lucode)))
    };
  }

  const remap = { 1: 1, 3: 2, 4: 3, 5: 4 };
  return {
    type: "FeatureCollection",
    features: (data.features || [])
      .filter(f => remap[Number(f?.properties?.lucode)])
      .map(f => ({
        ...f,
        properties: { ...(f.properties || {}), lucode: remap[Number(f.properties.lucode)] }
      }))
  };
}

function roadWidthExpression(values) {
  return [
    "interpolate", ["linear"], ["zoom"],
    10, values[1],
    14, values[3],
    17, values[5]
  ];
}

function addLandUseLayers(map, landUse) {
  map.addSource("landuse", { type: "geojson", data: landUse });
  map.addLayer({
    id: "landuse-fill",
    type: "fill",
    source: "landuse",
    paint: {
      "fill-color": [
        "match", ["to-number", ["get", "lucode"]],
        1, landUseClasses[0].color,
        2, landUseClasses[1].color,
        3, landUseClasses[2].color,
        4, landUseClasses[3].color,
        "rgba(0,0,0,0)"
      ],
      "fill-opacity": 0.72
    }
  });
  map.addLayer({
    id: "landuse-outline",
    type: "line",
    source: "landuse",
    paint: {
      "line-color": "#111111",
      "line-width": 0.55,
      "line-opacity": 0.72
    }
  });
}

function addRoadLayers(map, roads) {
  map.addSource("roads", { type: "geojson", data: roads });

  roadClasses.forEach(cls => {
    map.addLayer({
      id: `roads-${cls.id}`,
      type: "line",
      source: "roads",
      filter: ["==", ["get", "oppcode"], cls.code],
      layout: {
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": cls.color,
        "line-width": roadWidthExpression(cls.width),
        "line-opacity": 0.96
      }
    });
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addBarLayer(map, bars) {
  map.addSource("bars", { type: "geojson", data: bars });
  map.addLayer({
    id: "bars-points",
    type: "circle",
    source: "bars",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 14, 5.2, 17, 7],
      "circle-color": "#ff5ca8",
      "circle-stroke-color": "#141414",
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 17, 2.1],
      "circle-opacity": 0.98
    }
  });

  let activePopup = null;
  let activeKey = null;
  map.on("mouseenter", "bars-points", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "bars-points", () => { map.getCanvas().style.cursor = ""; });
  map.on("click", "bars-points", event => {
    const feature = event.features?.[0];
    if (!feature) return;
    const props = feature.properties || {};
    const coords = feature.geometry?.coordinates || [];
    const key = `${props.name || ""}|${props.barclass || ""}|${coords.join(",")}`;

    if (activePopup && activeKey === key) {
      activePopup.remove();
      activePopup = null;
      activeKey = null;
      return;
    }
    if (activePopup) activePopup.remove();

    activeKey = key;
    const name = props.name ? escapeHtml(props.name) : "Unnamed drinking establishment";
    const kind = props.barclass ? escapeHtml(props.barclass) : "Drinking establishment";
    activePopup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "280px" })
      .setLngLat(event.lngLat)
      .setHTML(`<div class="bar-popup"><strong>${name}</strong><div>${kind}</div></div>`)
      .addTo(map);
    activePopup.on("close", () => {
      activePopup = null;
      activeKey = null;
    });
  });
}

function addNeighborhoodLayer(map, feature) {
  map.addSource("neighborhood", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [feature] }
  });

  map.addLayer({
    id: "neighborhood-fill",
    type: "fill",
    source: "neighborhood",
    paint: {
      "fill-color": "#2CA25F",
      "fill-opacity": 0.025
    }
  });

  map.addLayer({
    id: "neighborhood-outline-halo",
    type: "line",
    source: "neighborhood",
    paint: {
      "line-color": "#141414",
      "line-width": 10,
      "line-opacity": 0.95
    }
  });

  map.addLayer({
    id: "neighborhood-outline",
    type: "line",
    source: "neighborhood",
    paint: {
      "line-color": "#2CA25F",
      "line-width": 5.2,
      "line-opacity": 1
    }
  });
}

function updateBasemapButtons(containerId, mode) {
  document.querySelectorAll(`[data-map-container="${containerId}"][data-basemap]`).forEach(button => {
    const active = button.dataset.basemap === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function setBasemap(containerId, mode) {
  const map = mapsByContainer[containerId];
  if (!map) return;
  updateBasemapButtons(containerId, mode);
  if (!map.isStyleLoaded()) return;
  map.setLayoutProperty("satellite", "visibility", mode === "satellite" ? "visible" : "none");
  map.triggerRepaint();
}

function wireBasemapToggles() {
  document.querySelectorAll("[data-map-container][data-basemap]").forEach(button => {
    button.addEventListener("click", () => setBasemap(button.dataset.mapContainer, button.dataset.basemap));
  });
}

function makeNeighborhoodMap(containerId, feature, roads, landUse = null, bars = null) {
  const map = new maplibregl.Map({
    container: containerId,
    style: baseStyle(),
    center: [-90, 30],
    zoom: 10,
    minZoom: 7,
    maxZoom: 19,
    attributionControl: false
  });

  mapsByContainer[containerId] = map;
  updateBasemapButtons(containerId, "street");

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new maplibregl.AttributionControl({
    compact: true,
    customAttribution: "© OpenStreetMap contributors · Satellite © Esri"
  }));

  map.on("load", () => {
    if (landUse) addLandUseLayers(map, landUse);
    addRoadLayers(map, roads);
    if (bars) addBarLayer(map, bars);
    addNeighborhoodLayer(map, feature);

    const bounds = mapBounds(feature);
    if (bounds) map.fitBounds(bounds, { padding: 54, duration: 0, maxZoom: 15.5 });
  });

  return map;
}

async function loadGeoJson(filename, signal, description) {
  const response = await fetch(`${DATA_BASE}${filename}`, { cache: "force-cache", signal });
  if (!response.ok) throw new Error(`Could not load the ${description} data for your city.`);
  const data = await response.json();
  if (!Array.isArray(data?.features)) throw new Error(`The ${description} file is not valid GeoJSON.`);
  return data;
}

function setNeighborhoodTitles(names) {
  document.querySelectorAll("[data-neighborhood-title]").forEach(element => {
    const index = Number(element.dataset.neighborhoodTitle);
    element.textContent = names[index] || "";
  });
}

async function loadProject() {
  const id = lsuId.value.trim();
  if (id.length < 4) {
    showMessage("Enter a valid LSU ID.", "error");
    return;
  }

  loadButton.disabled = true;
  showMessage("Loading your neighborhoods…");
  projectContent.classList.add("is-hidden");
  destroyMaps();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "moduleLookup", lsuId: id })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not load your neighborhood selection.");

    const features = data?.geojson?.features;
    if (!Array.isArray(features) || features.length !== 2) {
      throw new Error("Your neighborhood selection was found, but the saved boundaries could not be loaded.");
    }

    const slug = citySlug[data.cityKey];
    if (!slug) throw new Error("Your city is not configured for the Opportunity module.");

    cityName.textContent = data.city;
    neighborhoodOne.textContent = data.neighborhoods[0];
    neighborhoodTwo.textContent = data.neighborhoods[1];
    setNeighborhoodTitles(data.neighborhoods);

    projectContent.classList.remove("is-hidden");
    dataAbortController = new AbortController();
    const signal = dataAbortController.signal;

    streetStatus.textContent = `Loading ${data.city.split(",")[0]} street-network data…`;
    landUseStatus.textContent = "Waiting for the street-network stage…";
    barsStatus.textContent = "Waiting for the land-use stage…";
    microStatus.textContent = "Waiting for the cumulative opportunity layers…";

    const roads = await loadGeoJson(`OPP_paths_${slug}.geojson`, signal, "street-network");
    const localRoads = filterForNeighborhoods(roads, features);
    maps.push(
      makeNeighborhoodMap("streetMapOne", features[0], localRoads[0]),
      makeNeighborhoodMap("streetMapTwo", features[1], localRoads[1])
    );
    streetStatus.textContent = "Street networks loaded. Compare hierarchy, connectivity, barriers, and routes into and through each neighborhood.";

    landUseStatus.textContent = `Loading ${data.city.split(",")[0]} nonresidential building-use data…`;
    const rawLandUse = await loadGeoJson(`OPP_landuse_${slug}.geojson`, signal, "land-use");
    const landUse = normalizeLandUseData(rawLandUse);
    const localLandUse = filterForNeighborhoods(landUse, features);
    maps.push(
      makeNeighborhoodMap("landUseMapOne", features[0], localRoads[0], localLandUse[0]),
      makeNeighborhoodMap("landUseMapTwo", features[1], localRoads[1], localLandUse[1])
    );
    landUseStatus.textContent = "Land use loaded. Toggle between the street map and satellite imagery as you inspect nonresidential activity settings and land-use edges.";

    barsStatus.textContent = `Loading ${data.city.split(",")[0]} drinking-establishment data…`;
    const barData = await loadGeoJson(`OPP_bars_${slug}.geojson`, signal, "bar");
    const localBars = filterForNeighborhoods(barData, features);
    maps.push(
      makeNeighborhoodMap("barsMapOne", features[0], localRoads[0], localLandUse[0], localBars[0]),
      makeNeighborhoodMap("barsMapTwo", features[1], localRoads[1], localLandUse[1], localBars[1])
    );
    barsStatus.textContent = "Bars loaded. Compare where drinking establishments sit relative to street access and activity-generating land uses; click a point for its name and type.";

    microStatus.textContent = "Preparing micro-place maps…";
    maps.push(
      makeNeighborhoodMap("microMapOne", features[0], localRoads[0], localLandUse[0], localBars[0]),
      makeNeighborhoodMap("microMapTwo", features[1], localRoads[1], localLandUse[1], localBars[1])
    );
    microStatus.textContent = "Micro-place maps are ready. Zoom and pan independently until each map is framed around the place you think is most likely to concentrate crime opportunities.";

    dataAbortController = null;
    showMessage("Neighborhoods and opportunity layers loaded.", "success");
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.error(error);
    showMessage(error instanceof Error ? error.message : "Could not load the project.", "error");
  } finally {
    loadButton.disabled = false;
  }
}

wireBasemapToggles();
loadButton.addEventListener("click", loadProject);
lsuId.addEventListener("keydown", event => {
  if (event.key === "Enter") loadProject();
});
