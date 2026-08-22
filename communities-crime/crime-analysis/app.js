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

const RATE_FIELD = "cc_violentcrime_violcrime";
const BGID_FIELD = "cities_bgs_GEOID20";
const RATE_COLORS = {
  "very low": "#2c7fb8",
  "low": "#a6bddb",
  "moderate": "#f7f7f7",
  "high": "#fdbb84",
  "very high": "#e34a33"
};
const INCIDENT_INFO = {
  rob: { label: "Robbery", plural: "Robberies", period: "2021–2023", fileSuffix: "rob" },
  mvt: { label: "Motor Vehicle Theft", plural: "Motor Vehicle Thefts", period: "2022", fileSuffix: "mvt" }
};

const lsuId = document.getElementById("lsuId");
const loadButton = document.getElementById("loadButton");
const lookupMessage = document.getElementById("lookupMessage");
const projectContent = document.getElementById("projectContent");
const cityName = document.getElementById("cityName");
const neighborhoodOne = document.getElementById("neighborhoodOne");
const neighborhoodTwo = document.getElementById("neighborhoodTwo");
const rateStatus = document.getElementById("rateStatus");
const incidentSection = document.getElementById("incidentSection");
const incidentHeading = document.getElementById("incidentHeading");
const incidentIntro = document.getElementById("incidentIntro");
const incidentChoiceStatus = document.getElementById("incidentChoiceStatus");
const incidentStatus = document.getElementById("incidentStatus");
const incidentKeyLabel = document.getElementById("incidentKeyLabel");
const rateCaptionOne = document.getElementById("rateCaptionOne");
const rateCaptionTwo = document.getElementById("rateCaptionTwo");
const incidentCaptionOne = document.getElementById("incidentCaptionOne");
const incidentCaptionTwo = document.getElementById("incidentCaptionTwo");
const buildDocument = document.getElementById("buildDocument");
const documentStatus = document.getElementById("documentStatus");

let currentProject = null;
let currentSlug = null;
let currentIncidentType = null;
let maps = {};
let mapReady = new Set();
let incidentLoadController = null;

function baseStyle() {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors"
      },
      satellite: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        attribution: "Tiles © Esri"
      }
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#f4f4f2" } },
      { id: "osm", type: "raster", source: "osm", layout: { visibility: "visible" } },
      { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } }
    ]
  };
}

function showMessage(text, kind = "") {
  lookupMessage.textContent = text;
  lookupMessage.style.color = kind === "error" ? "#ff9e9e" : kind === "success" ? "#9fd0ae" : "#efb366";
}

function featureCollection(features) {
  return { type: "FeatureCollection", features };
}

function normalizeRate(value) {
  return String(value ?? "").trim().toLowerCase();
}

function rateLabel(value) {
  const key = normalizeRate(value);
  if (key === "very low") return "Very Low";
  if (key === "low") return "Low";
  if (key === "moderate") return "Moderate";
  if (key === "high") return "High";
  if (key === "very high") return "Very High";
  return "No data";
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
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  });
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

function expandBox(box, factor = 0.38) {
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

function pointInBox(feature, box) {
  const c = feature?.geometry?.coordinates;
  return Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number" && c[0] >= box[0] && c[0] <= box[2] && c[1] >= box[1] && c[1] <= box[3];
}

function filterPolygons(data, box) {
  return featureCollection((data.features || []).filter(feature => {
    const fbox = featureBox(feature);
    return fbox ? overlaps(fbox, box) : false;
  }));
}

function filterPoints(data, box) {
  return featureCollection((data.features || []).filter(feature => pointInBox(feature, box)));
}

function addFineZoom(map) {
  map.scrollZoom.disable();
  map.getCanvas().addEventListener("wheel", event => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    event.stopPropagation();
    map.jumpTo({ zoom: Math.max(0, Math.min(22, map.getZoom() + (event.deltaY < 0 ? 0.08 : -0.08))) });
  }, { passive: false });
}

function fitBox(map, box, padding = 26, maxZoom = 15.5) {
  map.fitBounds([[box[0], box[1]], [box[2], box[3]]], { padding, duration: 0, maxZoom });
}

function addNeighborhoodOutline(map, feature) {
  map.addSource("neighborhood", { type: "geojson", data: featureCollection([feature]) });
  map.addLayer({
    id: "neighborhood-halo",
    type: "line",
    source: "neighborhood",
    paint: { "line-color": "#111111", "line-width": 8.5, "line-opacity": 0.95 }
  });
  map.addLayer({
    id: "neighborhood-line",
    type: "line",
    source: "neighborhood",
    paint: { "line-color": "#ffffff", "line-width": 4.5, "line-opacity": 1 }
  });
}

function addRateLayer(map, data) {
  map.addSource("rates", { type: "geojson", data });
  map.addLayer({
    id: "rate-fill",
    type: "fill",
    source: "rates",
    paint: {
      "fill-color": [
        "match",
        ["downcase", ["to-string", ["coalesce", ["get", RATE_FIELD], ""]]],
        "very low", RATE_COLORS["very low"],
        "low", RATE_COLORS.low,
        "moderate", RATE_COLORS.moderate,
        "high", RATE_COLORS.high,
        "very high", RATE_COLORS["very high"],
        "rgba(0,0,0,0)"
      ],
      "fill-opacity": 0.82
    }
  });
  map.addLayer({
    id: "rate-lines",
    type: "line",
    source: "rates",
    paint: { "line-color": "#6f6f6f", "line-width": 0.65, "line-opacity": 0.75 }
  });

  let activePopup = null;
  let activeId = null;
  map.on("mouseenter", "rate-fill", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "rate-fill", () => { map.getCanvas().style.cursor = ""; });
  map.on("click", "rate-fill", event => {
    const feature = event.features?.[0];
    if (!feature) return;
    const props = feature.properties || {};
    const id = String(props[BGID_FIELD] || "");
    if (activePopup && activeId === id) {
      activePopup.remove(); activePopup = null; activeId = null; return;
    }
    if (activePopup) activePopup.remove();
    activeId = id;
    activePopup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "290px" })
      .setLngLat(event.lngLat)
      .setHTML(`<div class="value-popup"><strong>Block group ${escapeHtml(id)}</strong><div>City-relative violent crime rate: <b>${escapeHtml(rateLabel(props[RATE_FIELD]))}</b></div></div>`)
      .addTo(map);
    activePopup.on("close", () => { activePopup = null; activeId = null; });
  });
}

function addIncidentLayer(map, data) {
  map.addSource("incidents", { type: "geojson", data });
  map.addLayer({
    id: "incident-points",
    type: "circle",
    source: "incidents",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.2, 13, 3.7, 16, 5.2],
      "circle-color": "#e63946",
      "circle-stroke-color": "#1b1b1b",
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 0.7, 16, 1.4],
      "circle-opacity": 0.88
    }
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

function destroyMap(key) {
  const map = maps[key];
  if (map) {
    try { map.remove(); } catch {}
    delete maps[key];
  }
  mapReady.delete(key);
}

function destroyMaps() {
  Object.keys(maps).forEach(destroyMap);
  mapReady.clear();
  if (incidentLoadController) {
    incidentLoadController.abort();
    incidentLoadController = null;
  }
  updateDocumentState();
}

function registerRateLegendPreview(key) {
  const mapHost = maps[key]?.getContainer?.();
  const controlsHost = document.querySelector(`[data-legend-controls-for="${key}"]`);
  if (!mapHost || !controlsHost) return;
  window.CC_LEGEND_PREVIEW?.register({ key, controlsHost, mapHost, raw: true, rerenderOnScale: true, render: scale => renderRateLegendPreview(key, scale) });
}

function markReady(key) {
  mapReady.add(key);
  if (key.startsWith("rate-")) registerRateLegendPreview(key);
  updateDocumentState();
}

function makeRateMap(key, containerId, feature, rates, box) {
  destroyMap(key);
  const map = new maplibregl.Map({
    container: containerId,
    style: baseStyle(),
    center: [-90, 30],
    zoom: 10,
    minZoom: 7,
    maxZoom: 19,
    attributionControl: false
  });
  maps[key] = map;
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new maplibregl.AttributionControl({ compact: true }));
  addFineZoom(map);
  map.on("load", () => {
    addRateLayer(map, rates);
    addNeighborhoodOutline(map, feature);
    fitBox(map, box);
    map.once("idle", () => markReady(key));
  });
  return map;
}

function makeIncidentMap(key, containerId, feature, points, box) {
  destroyMap(key);
  const map = new maplibregl.Map({
    container: containerId,
    style: baseStyle(),
    center: [-90, 30],
    zoom: 10,
    minZoom: 7,
    maxZoom: 19,
    attributionControl: false
  });
  maps[key] = map;
  updateBasemapButtons(containerId, "street");
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new maplibregl.AttributionControl({ compact: true }));
  addFineZoom(map);
  map.on("load", () => {
    addIncidentLayer(map, points);
    addNeighborhoodOutline(map, feature);
    fitBox(map, box);
    map.once("idle", () => markReady(key));
  });
  return map;
}

function updateBasemapButtons(containerId, mode) {
  document.querySelectorAll(`[data-map-container="${containerId}"][data-basemap]`).forEach(button => {
    const active = button.dataset.basemap === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function setBasemap(containerId, mode) {
  const entry = Object.entries(maps).find(([, map]) => map?.getContainer?.().id === containerId);
  const map = entry?.[1];
  if (!map) return;
  updateBasemapButtons(containerId, mode);
  if (!map.isStyleLoaded()) return;
  map.setLayoutProperty("osm", "visibility", mode === "street" ? "visible" : "none");
  map.setLayoutProperty("satellite", "visibility", mode === "satellite" ? "visible" : "none");
  map.triggerRepaint();
}

function wireBasemapToggles() {
  document.querySelectorAll("[data-map-container][data-basemap]").forEach(button => {
    button.addEventListener("click", () => setBasemap(button.dataset.mapContainer, button.dataset.basemap));
  });
}

async function loadGeoJson(filename, signal, description) {
  const response = await fetch(`${DATA_BASE}${filename}`, { cache: "force-cache", signal });
  if (!response.ok) throw new Error(`Could not load ${description} for this city.`);
  const data = await response.json();
  if (!Array.isArray(data?.features)) throw new Error(`${description} is not valid GeoJSON.`);
  return data;
}

function setProjectText(project) {
  const [n1, n2] = project.neighborhoods;
  const city = project.city.split(",")[0];
  cityName.textContent = project.city;
  neighborhoodOne.textContent = n1;
  neighborhoodTwo.textContent = n2;
  document.querySelectorAll("[data-neighborhood-title]").forEach(element => {
    element.textContent = project.neighborhoods[Number(element.dataset.neighborhoodTitle)] || "";
  });
  rateCaptionOne.textContent = `Figure 1. City-Relative Violent Crime Rates – ${n1}, ${city}`;
  rateCaptionTwo.textContent = `Figure 2. City-Relative Violent Crime Rates – ${n2}, ${city}`;
}

function updateIncidentText(type) {
  const info = INCIDENT_INFO[type];
  const [n1, n2] = currentProject.neighborhoods;
  const city = currentProject.city.split(",")[0];
  incidentHeading.textContent = `${info.label} incidents`;
  incidentIntro.textContent = `Figures 3 and 4 map point-level ${info.label.toLowerCase()} incidents from ${info.period}. Use the point locations to compare the internal spatial pattern of incidents across your two neighborhoods.`;
  incidentKeyLabel.textContent = `${info.label} incident`;
  incidentCaptionOne.textContent = `Figure 3. ${info.period} ${info.plural} – ${n1}, ${city}`;
  incidentCaptionTwo.textContent = `Figure 4. ${info.period} ${info.plural} – ${n2}, ${city}`;
}

function updateChoiceButtons(type) {
  document.querySelectorAll("[data-incident-type]").forEach(button => {
    const active = button.dataset.incidentType === type;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}


function updateDocumentState() {
  if (buildDocument?.dataset.building === "true") return;
  const allReady = ["rate-1", "rate-2", "incident-1", "incident-2"].every(key => mapReady.has(key));
  const ready = Boolean(currentProject && currentIncidentType && allReady);
  buildDocument.disabled = !ready;
  if (ready) documentStatus.textContent = "Ready to build your Word assignment.";
  else if (!currentProject) documentStatus.textContent = "Load your project and choose an incident type first.";
  else if (!currentIncidentType) documentStatus.textContent = "Choose Robbery or Motor Vehicle Theft to create Figures 3 and 4.";
  else documentStatus.textContent = "Maps must finish loading first.";
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
  currentProject = null;
  currentSlug = null;
  currentIncidentType = null;
  incidentSection.classList.add("is-hidden");
  updateChoiceButtons(null);
  incidentChoiceStatus.textContent = "Choose a crime type to create Figures 3 and 4.";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "moduleLookup", lsuId: id })
    });
    const project = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(project.error || "Could not load your neighborhood selection.");
    const features = project?.geojson?.features;
    if (!Array.isArray(features) || features.length !== 2) throw new Error("Your neighborhood boundaries could not be loaded.");
    const slug = citySlug[project.cityKey];
    if (!slug) throw new Error("Your city is not configured for the Crime Analysis module.");

    currentProject = project;
    currentSlug = slug;
    setProjectText(project);
    projectContent.classList.remove("is-hidden");
    rateStatus.textContent = `Loading ${project.city.split(",")[0]} violent crime rates…`;

    const rates = await loadGeoJson(`${slug}_viorate.geojson`, undefined, "violent crime rate data");
    const boxes = features.map(feature => expandBox(featureBox(feature)));
    const localRates = boxes.map(box => filterPolygons(rates, box));
    makeRateMap("rate-1", "rateMapOne", features[0], localRates[0], boxes[0]);
    makeRateMap("rate-2", "rateMapTwo", features[1], localRates[1], boxes[1]);
    rateStatus.textContent = "Violent crime rate maps loaded. Click a block group to see its city-relative category.";
    showMessage("Neighborhoods and violent crime rate data loaded.", "success");
    updateDocumentState();
  } catch (error) {
    console.error(error);
    showMessage(error instanceof Error ? error.message : "Could not load the project.", "error");
    projectContent.classList.add("is-hidden");
  } finally {
    loadButton.disabled = false;
  }
}

async function chooseIncidentType(type) {
  if (!currentProject || !currentSlug || !INCIDENT_INFO[type]) return;
  if (incidentLoadController) incidentLoadController.abort();
  incidentLoadController = new AbortController();
  const signal = incidentLoadController.signal;

  currentIncidentType = type;
  updateChoiceButtons(type);
  updateIncidentText(type);
  incidentSection.classList.remove("is-hidden");
  destroyMap("incident-1");
  destroyMap("incident-2");
  updateDocumentState();

  const info = INCIDENT_INFO[type];
  incidentChoiceStatus.textContent = `${info.label} selected.`;
  incidentStatus.textContent = `Loading ${info.label.toLowerCase()} incidents…`;

  try {
    const data = await loadGeoJson(`${currentSlug}_${info.fileSuffix}.geojson`, signal, `${info.label.toLowerCase()} incident data`);
    const features = currentProject.geojson.features;
    const boxes = features.map(feature => expandBox(featureBox(feature)));
    const localPoints = boxes.map(box => filterPoints(data, box));
    makeIncidentMap("incident-1", "incidentMapOne", features[0], localPoints[0], boxes[0]);
    makeIncidentMap("incident-2", "incidentMapTwo", features[1], localPoints[1], boxes[1]);
    incidentStatus.textContent = `${info.label} incidents loaded: ${localPoints[0].features.length.toLocaleString()} points around ${currentProject.neighborhoods[0]} and ${localPoints[1].features.length.toLocaleString()} around ${currentProject.neighborhoods[1]}.`;
    incidentLoadController = null;
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.error(error);
    incidentStatus.textContent = error instanceof Error ? error.message : `Could not load ${info.label.toLowerCase()} incidents.`;
    incidentChoiceStatus.textContent = `${info.label} is selected, but its data could not be loaded.`;
    updateDocumentState();
  }
}

function waitForIdle(map) {
  return new Promise(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    map.once("idle", finish);
    map.triggerRepaint();
    setTimeout(finish, 2500);
  });
}

async function captureMap(key, includeLegend) {
  const map = maps[key];
  if (!map || !mapReady.has(key)) throw new Error("That map is not ready yet.");
  await waitForIdle(map);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const src = map.getCanvas();
  const maxWidth = 1400;
  const width = Math.min(src.width, maxWidth);
  const height = Math.round(src.height * width / src.width);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(src, 0, 0, width, height);
  if (includeLegend) drawRateLegend(ctx, canvas, window.CC_LEGEND_PREVIEW?.getScale(key) ?? 1);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not export the map image.")), "image/png"));
}

function renderRateLegendPreview(key,sizeMultiplier=1){const map=maps[key];if(!map)return document.createElement("span");const src=map.getCanvas(),exportWidth=Math.min(src.width,1400),legendScale=Math.max(.9,exportWidth/1150)*sizeMultiplier,width=290*legendScale,height=184*legendScale,edge=12*legendScale,canvas=document.createElement("canvas");canvas.width=Math.ceil(width+edge);canvas.height=Math.ceil(height+edge);drawRateLegend(canvas.getContext("2d"),canvas,sizeMultiplier,legendScale);const liveWidth=map.getContainer().getBoundingClientRect().width||1,factor=liveWidth/exportWidth;canvas.style.width=`${canvas.width*factor}px`;canvas.style.height=`${canvas.height*factor}px`;return canvas}

function drawRateLegend(ctx, canvas, sizeMultiplier = 1, forcedScale = null) {
  const scale = forcedScale ?? (Math.max(0.9, canvas.width / 1150) * sizeMultiplier);
  const pad = 13 * scale;
  const row = 23 * scale;
  const sw = 14 * scale;
  const width = 290 * scale;
  const height = 184 * scale;
  const x = canvas.width - width - 12 * scale;
  const y = canvas.height - height - 12 * scale;
  const items = [
    ["Very Low", RATE_COLORS["very low"]],
    ["Low", RATE_COLORS.low],
    ["Moderate", RATE_COLORS.moderate],
    ["High", RATE_COLORS.high],
    ["Very High", RATE_COLORS["very high"]]
  ];
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,.96)";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "#bdbdbd";
  ctx.lineWidth = 1 * scale;
  ctx.strokeRect(x + .5, y + .5, width - 1, height - 1);
  ctx.fillStyle = "#1d1d1d";
  ctx.font = `600 ${13 * scale}px Arial, sans-serif`;
  ctx.fillText("City-relative violent crime rate", x + pad, y + 22 * scale);
  ctx.font = `${12 * scale}px Arial, sans-serif`;
  let yy = y + 50 * scale;
  for (const [label, color] of items) {
    ctx.fillStyle = color;
    ctx.fillRect(x + pad, yy - sw + 3 * scale, sw, sw);
    ctx.strokeStyle = "#777";
    ctx.strokeRect(x + pad + .5, yy - sw + 3 * scale + .5, sw - 1, sw - 1);
    ctx.fillStyle = "#333";
    ctx.fillText(label, x + pad + 24 * scale, yy);
    yy += row;
  }
  ctx.restore();
}


window.CC_CRIME_ANALYSIS = {
  getProject: () => currentProject,
  getIncidentType: () => currentIncidentType,
  getIncidentInfo: () => currentIncidentType ? INCIDENT_INFO[currentIncidentType] : null,
  getMaps: () => maps,
  isReady: () => ["rate-1", "rate-2", "incident-1", "incident-2"].every(key => mapReady.has(key)),
  captureMap,
  updateDocumentState
};

wireBasemapToggles();
loadButton.addEventListener("click", loadProject);
lsuId.addEventListener("keydown", event => { if (event.key === "Enter") loadProject(); });
document.querySelectorAll("[data-incident-type]").forEach(button => button.addEventListener("click", () => chooseIncidentType(button.dataset.incidentType)));
updateDocumentState();
