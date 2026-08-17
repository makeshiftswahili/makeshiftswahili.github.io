const API_URL = "https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/neighborhood-selection";

const lsuId = document.getElementById("lsuId");
const loadButton = document.getElementById("loadButton");
const lookupMessage = document.getElementById("lookupMessage");
const projectContent = document.getElementById("projectContent");
const cityName = document.getElementById("cityName");
const neighborhoodOne = document.getElementById("neighborhoodOne");
const neighborhoodTwo = document.getElementById("neighborhoodTwo");
const mapOneTitle = document.getElementById("mapOneTitle");
const mapTwoTitle = document.getElementById("mapTwoTitle");
const mapStatus = document.getElementById("mapStatus");

let maps = [];

function baseStyle() {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "© OpenStreetMap contributors"
      }
    },
    layers: [
      { id: "osm", type: "raster", source: "osm" }
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
}

function walkCoordinates(coords, bounds) {
  if (!Array.isArray(coords)) return;
  if (coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
    bounds.extend([coords[0], coords[1]]);
    return;
  }
  coords.forEach(part => walkCoordinates(part, bounds));
}

function featureBounds(feature) {
  const bounds = new maplibregl.LngLatBounds();
  walkCoordinates(feature?.geometry?.coordinates, bounds);
  return bounds;
}

function makeNeighborhoodMap(containerId, feature) {
  const map = new maplibregl.Map({
    container: containerId,
    style: baseStyle(),
    center: [-90, 30],
    zoom: 10,
    minZoom: 2,
    maxZoom: 19,
    attributionControl: true
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  map.on("load", () => {
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
        "fill-opacity": 0.035
      }
    });

    map.addLayer({
      id: "neighborhood-outline-halo",
      type: "line",
      source: "neighborhood",
      paint: {
        "line-color": "#ffffff",
        "line-width": 6,
        "line-opacity": 0.85
      }
    });

    map.addLayer({
      id: "neighborhood-outline",
      type: "line",
      source: "neighborhood",
      paint: {
        "line-color": "#2CA25F",
        "line-width": 3.5,
        "line-opacity": 1
      }
    });

    const bounds = featureBounds(feature);
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 46, duration: 0, maxZoom: 15.5 });
    }
  });

  return map;
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

    cityName.textContent = data.city;
    neighborhoodOne.textContent = data.neighborhoods[0];
    neighborhoodTwo.textContent = data.neighborhoods[1];
    mapOneTitle.textContent = data.neighborhoods[0];
    mapTwoTitle.textContent = data.neighborhoods[1];

    projectContent.classList.remove("is-hidden");
    requestAnimationFrame(() => {
      maps = [
        makeNeighborhoodMap("mapOne", features[0]),
        makeNeighborhoodMap("mapTwo", features[1])
      ];
    });

    mapStatus.textContent = "OpenStreetMap loaded. Zoom in on each neighborhood to inspect smaller streets, paths, buildings, and land-use detail.";
    showMessage("Neighborhoods loaded.", "success");
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "Could not load the project.", "error");
  } finally {
    loadButton.disabled = false;
  }
}

loadButton.addEventListener("click", loadProject);
lsuId.addEventListener("keydown", event => {
  if (event.key === "Enter") loadProject();
});
