const API_URL = "https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/neighborhood-selection";
const DOC_URL = "https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/neighborhood-assignment-doc";

const lsuId = document.getElementById("lsuId");
const loadButton = document.getElementById("loadButton");
const lookupMessage = document.getElementById("lookupMessage");
const projectContent = document.getElementById("projectContent");
const cityName = document.getElementById("cityName");
const neighborhoodOne = document.getElementById("neighborhoodOne");
const neighborhoodTwo = document.getElementById("neighborhoodTwo");
const censusLink = document.getElementById("censusLink");
const contextTitle = document.getElementById("contextTitle");
const contextCaption = document.getElementById("contextCaption");
const mapOneTitle = document.getElementById("mapOneTitle");
const mapTwoTitle = document.getElementById("mapTwoTitle");
const mapOneCaption = document.getElementById("mapOneCaption");
const mapTwoCaption = document.getElementById("mapTwoCaption");
const downloadContext = document.getElementById("downloadContext");
const downloadOne = document.getElementById("downloadOne");
const downloadTwo = document.getElementById("downloadTwo");
const buildDocument = document.getElementById("buildDocument");
const mapStatus = document.getElementById("mapStatus");
const documentStatus = document.getElementById("documentStatus");

let maps = {};
let currentProject = null;
let readyMaps = new Set();
let basemapState = { context: "street", one: "street", two: "street" };

function baseStyle() {
  return {
    version: 8,
    sources: {
      satellite: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        attribution: "Tiles © Esri"
      },
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors"
      }
    },
    layers: [
      { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } },
      { id: "osm", type: "raster", source: "osm", layout: { visibility: "visible" } }
    ]
  };
}

function setControls(enabled) {
  [downloadContext, downloadOne, downloadTwo, buildDocument].forEach(button => button.disabled = !enabled);
  documentStatus.textContent = enabled ? "Ready to build your Word assignment." : "Maps must finish loading first.";
}

function updateBasemapButtons(key, mode) {
  document.querySelectorAll(`[data-map-key="${key}"][data-basemap]`).forEach(button => {
    button.classList.toggle("active", button.dataset.basemap === mode);
    button.setAttribute("aria-pressed", button.dataset.basemap === mode ? "true" : "false");
  });
}

function setBasemap(key, mode) {
  const map = maps[key];
  basemapState[key] = mode;
  updateBasemapButtons(key, mode);
  if (!map || !map.isStyleLoaded()) return;
  map.setLayoutProperty("osm", "visibility", mode === "street" ? "visible" : "none");
  map.setLayoutProperty("satellite", "visibility", mode === "satellite" ? "visible" : "none");
  map.triggerRepaint();
}

function resetBasemaps() {
  basemapState = { context: "street", one: "street", two: "street" };
  Object.keys(basemapState).forEach(key => updateBasemapButtons(key, "street"));
}

function destroyMaps() {
  Object.values(maps).forEach(map => map.remove());
  maps = {};
  readyMaps = new Set();
  resetBasemaps();
  setControls(false);
}

function findFeatureByName(geojson, name) {
  return geojson.features.find(feature => Object.values(feature?.properties || {}).some(value => String(value).trim() === name));
}

function coordinatesFromGeometry(geometry, output = []) {
  const walk = value => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") output.push([value[0], value[1]]);
    else value.forEach(walk);
  };
  if (geometry) walk(geometry.coordinates);
  return output;
}

function boundsForFeatures(features) {
  const coords = features.flatMap(feature => coordinatesFromGeometry(feature.geometry));
  if (!coords.length) return null;
  const lngs = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}

function markReady(key) {
  readyMaps.add(key);
  if (readyMaps.size === 3) {
    setControls(true);
    mapStatus.textContent = "All three maps are ready. Explore with satellite imagery if useful; exports will use the street basemap.";
  }
}

function addFineZoomControl(map) {
  map.scrollZoom.disable();
  const canvas = map.getCanvas();
  canvas.addEventListener("wheel", event => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    const increment = event.deltaY < 0 ? 0.08 : -0.08;
    const nextZoom = Math.max(0, Math.min(22, map.getZoom() + increment));
    map.jumpTo({ zoom: nextZoom });
  }, { passive: false });
}

function createBoundaryMap(container, features, padding, key) {
  const map = new maplibregl.Map({
    container,
    style: baseStyle(),
    interactive: true,
    attributionControl: true,
    canvasContextAttributes: { preserveDrawingBuffer: true }
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  addFineZoomControl(map);

  map.on("load", () => {
    map.addSource("neighborhoods", { type: "geojson", data: { type: "FeatureCollection", features } });
    map.addLayer({ id: "neighborhood-fill", type: "fill", source: "neighborhoods", paint: { "fill-color": "#2CA25F", "fill-opacity": 0.12 } });
    map.addLayer({ id: "neighborhood-line", type: "line", source: "neighborhoods", paint: { "line-color": "#111111", "line-width": 3 } });
    const bounds = boundsForFeatures(features);
    if (bounds) map.fitBounds(bounds, { padding, duration: 0, maxZoom: 15 });
    setBasemap(key, basemapState[key] || "street");
    map.once("idle", () => markReady(key));
    window.setTimeout(() => { if (!readyMaps.has(key)) markReady(key); }, 5000);
  });

  maps[key] = map;
}

function renderProject(payload) {
  const [firstName, secondName] = payload.neighborhoods;
  const firstFeature = findFeatureByName(payload.geojson, firstName);
  const secondFeature = findFeatureByName(payload.geojson, secondName);
  if (!firstFeature || !secondFeature) throw new Error("Your neighborhoods were found, but their map boundaries could not be matched.");

  currentProject = payload;
  cityName.textContent = payload.city;
  neighborhoodOne.textContent = firstName;
  neighborhoodTwo.textContent = secondName;
  censusLink.href = payload.censusProfileUrl;
  censusLink.textContent = `Open the Census profile for ${payload.city} →`;
  contextTitle.textContent = `${firstName} & ${secondName}`;
  contextCaption.textContent = `Figure 1. ${firstName} and ${secondName}, ${payload.city}`;
  mapOneTitle.textContent = firstName;
  mapTwoTitle.textContent = secondName;
  mapOneCaption.textContent = `Figure 2. ${firstName}, ${payload.city} Neighborhood Boundaries`;
  mapTwoCaption.textContent = `Figure 3. ${secondName}, ${payload.city} Neighborhood Boundaries`;

  projectContent.classList.remove("is-hidden");
  destroyMaps();
  mapStatus.textContent = "Rendering maps…";
  requestAnimationFrame(() => {
    createBoundaryMap("contextMap", [firstFeature, secondFeature], 72, "context");
    createBoundaryMap("mapOne", [firstFeature], 54, "one");
    createBoundaryMap("mapTwo", [secondFeature], 54, "two");
  });
}

async function loadProject() {
  const id = lsuId.value.trim();
  if (id.length < 4) { lookupMessage.textContent = "Enter a valid LSU ID."; lsuId.focus(); return; }
  loadButton.disabled = true;
  lookupMessage.textContent = "Loading your saved neighborhoods…";
  projectContent.classList.add("is-hidden");
  currentProject = null;
  destroyMaps();
  try {
    const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "moduleLookup", lsuId: id }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not load your project.");
    renderProject(payload);
    lookupMessage.textContent = "";
  } catch (error) {
    console.error(error);
    lookupMessage.textContent = error.message;
  } finally {
    loadButton.disabled = false;
  }
}

function waitForIdle(map) {
  return new Promise(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    map.once("idle", finish);
    window.setTimeout(finish, 2500);
  });
}

async function captureMap(key) {
  const map = maps[key];
  if (!map) throw new Error("Map is not ready.");
  const previousMode = basemapState[key] || "street";

  try {
    if (previousMode !== "street") {
      setBasemap(key, "street");
      await waitForIdle(map);
    } else {
      await waitForIdle(map);
    }

    map.triggerRepaint();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const source = map.getCanvas();
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the map image.");
    ctx.drawImage(source, 0, 0);

    const scale = Math.max(window.devicePixelRatio || 1, 1);
    const size = Math.max(Math.round(10 * scale), 10);
    const label = "© OpenStreetMap contributors";
    ctx.font = `${size}px Arial, sans-serif`;
    const width = ctx.measureText(label).width;
    const pad = Math.round(5 * scale);
    const x = canvas.width - width - pad * 3;
    const y = canvas.height - size - pad * 3;
    ctx.fillStyle = "rgba(255,255,255,.88)";
    ctx.fillRect(x, y, width + pad * 2, size + pad * 2);
    ctx.fillStyle = "#333";
    ctx.fillText(label, x + pad, y + size + Math.round(pad / 2));

    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not export the map image.")), "image/png"));
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    if (previousMode !== "street") setBasemap(key, previousMode);
  }
}

function safe(value) {
  return String(value || "").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || "map";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadFigure(key, number) {
  if (!currentProject || !maps[key]) return;
  const button = key === "context" ? downloadContext : key === "one" ? downloadOne : downloadTwo;
  button.disabled = true;
  mapStatus.textContent = `Exporting Figure ${number} with the street basemap…`;
  try {
    const image = await captureMap(key);
    const name = key === "context" ? currentProject.neighborhoods.join("_") : currentProject.neighborhoods[key === "one" ? 0 : 1];
    downloadBlob(image.blob, `${safe(lsuId.value)}_figure${number}_${safe(name)}.png`);
    mapStatus.textContent = `Figure ${number} downloaded with the street basemap.`;
  } catch (error) {
    console.error(error);
    mapStatus.textContent = `Could not export Figure ${number}. ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not encode a map image."));
    reader.readAsDataURL(blob);
  });
}

async function figureData(image, targetWidth) {
  const targetHeight = Math.round(targetWidth * image.height / image.width);
  return { data: await blobToDataUrl(image.blob), width: targetWidth, height: targetHeight };
}

async function buildWord() {
  if (!currentProject || readyMaps.size !== 3) return;
  setControls(false);
  documentStatus.textContent = "Capturing street-map figures and building your Word document…";
  try {
    const [contextImage, oneImage, twoImage] = await Promise.all([captureMap("context"), captureMap("one"), captureMap("two")]);
    const [context, one, two] = await Promise.all([figureData(contextImage, 570), figureData(oneImage, 525), figureData(twoImage, 525)]);
    const response = await fetch(DOC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lsuId: lsuId.value.trim(),
        project: currentProject,
        figures: { context, one, two }
      })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "The document generator returned an error.");
    }
    const blob = await response.blob();
    downloadBlob(blob, `${safe(lsuId.value)}_neighborhood_description_city_context.docx`);
    documentStatus.textContent = "Word assignment downloaded. Before submitting, delete all red prompts and the temporary Census profile link.";
  } catch (error) {
    console.error(error);
    documentStatus.textContent = `Could not build the Word assignment. ${error.message}`;
  } finally {
    setControls(true);
  }
}

loadButton.addEventListener("click", loadProject);
lsuId.addEventListener("keydown", event => { if (event.key === "Enter") loadProject(); });
downloadContext.addEventListener("click", () => downloadFigure("context", 1));
downloadOne.addEventListener("click", () => downloadFigure("one", 2));
downloadTwo.addEventListener("click", () => downloadFigure("two", 3));
buildDocument.addEventListener("click", buildWord);

document.querySelectorAll("[data-map-key][data-basemap]").forEach(button => {
  button.addEventListener("click", () => setBasemap(button.dataset.mapKey, button.dataset.basemap));
});
