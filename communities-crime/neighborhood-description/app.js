const API_URL = "https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/neighborhood-selection";

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

let maps = [];

function baseStyle() {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors"
      }
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }]
  };
}

function destroyMaps() {
  maps.forEach(map => map.remove());
  maps = [];
}

function findFeatureByName(geojson, name) {
  return geojson.features.find(feature =>
    Object.values(feature?.properties || {}).some(value => String(value).trim() === name)
  );
}

function coordinatesFromGeometry(geometry, output = []) {
  if (!geometry) return output;
  const walk = value => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      output.push([value[0], value[1]]);
      return;
    }
    value.forEach(walk);
  };
  walk(geometry.coordinates);
  return output;
}

function boundsForFeatures(features) {
  const coords = features.flatMap(feature => coordinatesFromGeometry(feature.geometry));
  if (!coords.length) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  coords.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  });
  return [[minLng, minLat], [maxLng, maxLat]];
}

function createBoundaryMap(container, features, padding) {
  const geojson = { type: "FeatureCollection", features };
  const map = new maplibregl.Map({
    container,
    style: baseStyle(),
    interactive: true,
    attributionControl: true
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  map.on("load", () => {
    map.addSource("neighborhoods", { type: "geojson", data: geojson });
    map.addLayer({
      id: "neighborhood-fill",
      type: "fill",
      source: "neighborhoods",
      paint: {
        "fill-color": "#2CA25F",
        "fill-opacity": 0.12
      }
    });
    map.addLayer({
      id: "neighborhood-line",
      type: "line",
      source: "neighborhoods",
      paint: {
        "line-color": "#111111",
        "line-width": 3
      }
    });

    const bounds = boundsForFeatures(features);
    if (bounds) map.fitBounds(bounds, { padding, duration: 0, maxZoom: 15 });
  });

  maps.push(map);
  return map;
}

function renderProject(payload) {
  const [firstName, secondName] = payload.neighborhoods;
  const firstFeature = findFeatureByName(payload.geojson, firstName);
  const secondFeature = findFeatureByName(payload.geojson, secondName);

  if (!firstFeature || !secondFeature) {
    throw new Error("Your neighborhoods were found, but their map boundaries could not be matched.");
  }

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

  requestAnimationFrame(() => {
    createBoundaryMap("contextMap", [firstFeature, secondFeature], 72);
    createBoundaryMap("mapOne", [firstFeature], 54);
    createBoundaryMap("mapTwo", [secondFeature], 54);
  });
}

async function loadProject() {
  const id = lsuId.value.trim();
  if (id.length < 4) {
    lookupMessage.textContent = "Enter a valid LSU ID.";
    lsuId.focus();
    return;
  }

  loadButton.disabled = true;
  lookupMessage.textContent = "Loading your saved neighborhoods…";
  projectContent.classList.add("is-hidden");
  destroyMaps();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "moduleLookup", lsuId: id })
    });
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

loadButton.addEventListener("click", loadProject);
lsuId.addEventListener("keydown", event => {
  if (event.key === "Enter") loadProject();
});