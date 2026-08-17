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
let roadAbortController = null;

function baseStyle() {
  return {
    version: 8,
    sources: {},
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#141414" } }
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
  if (roadAbortController) {
    roadAbortController.abort();
    roadAbortController = null;
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

function filterRoadsForNeighborhoods(roads, neighborhoodFeatures) {
  const boxes = neighborhoodFeatures.map(feature => expandBox(featureBox(feature)));
  const selected = boxes.map(() => []);

  for (const feature of roads.features || []) {
    const box = featureBox(feature);
    if (!box) continue;
    boxes.forEach((target, index) => {
      if (overlaps(box, target)) selected[index].push(feature);
    });
  }

  return selected.map(features => ({ type: "FeatureCollection", features }));
}

function roadWidthExpression(values) {
  return [
    "interpolate", ["linear"], ["zoom"],
    10, values[1],
    14, values[3],
    17, values[5]
  ];
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

function makeNeighborhoodMap(containerId, feature, roads) {
  const map = new maplibregl.Map({
    container: containerId,
    style: baseStyle(),
    center: [-90, 30],
    zoom: 10,
    minZoom: 7,
    maxZoom: 19,
    attributionControl: false
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new maplibregl.AttributionControl({
    compact: true,
    customAttribution: "© OpenStreetMap contributors"
  }));

  map.on("load", () => {
    addRoadLayers(map, roads);

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
        "line-width": 7,
        "line-opacity": 0.9
      }
    });

    map.addLayer({
      id: "neighborhood-outline",
      type: "line",
      source: "neighborhood",
      paint: {
        "line-color": "#2CA25F",
        "line-width": 3.2,
        "line-opacity": 1
      }
    });

    const bounds = mapBounds(feature);
    if (bounds) map.fitBounds(bounds, { padding: 54, duration: 0, maxZoom: 15.5 });
  });

  return map;
}

async function loadRoadData(slug, signal) {
  const response = await fetch(`${DATA_BASE}OPP_paths_${slug}.geojson`, {
    cache: "force-cache",
    signal
  });
  if (!response.ok) throw new Error("Could not load the street-network data for your city.");
  const data = await response.json();
  if (!Array.isArray(data?.features)) throw new Error("The street-network file is not valid GeoJSON.");
  return data;
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
    mapOneTitle.textContent = data.neighborhoods[0];
    mapTwoTitle.textContent = data.neighborhoods[1];

    projectContent.classList.remove("is-hidden");
    mapStatus.textContent = `Loading ${data.city.split(",")[0]} street-network data…`;

    roadAbortController = new AbortController();
    const roads = await loadRoadData(slug, roadAbortController.signal);
    const localRoads = filterRoadsForNeighborhoods(roads, features);
    roadAbortController = null;

    requestAnimationFrame(() => {
      maps = [
        makeNeighborhoodMap("mapOne", features[0], localRoads[0]),
        makeNeighborhoodMap("mapTwo", features[1], localRoads[1])
      ];
    });

    mapStatus.textContent = "Street networks loaded. Compare road hierarchy, connectivity, barriers, and access within and around the two neighborhoods.";
    showMessage("Neighborhoods loaded.", "success");
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.error(error);
    showMessage(error instanceof Error ? error.message : "Could not load the project.", "error");
    mapStatus.textContent = "";
  } finally {
    loadButton.disabled = false;
  }
}

loadButton.addEventListener("click", loadProject);
lsuId.addEventListener("keydown", event => {
  if (event.key === "Enter") loadProject();
});
