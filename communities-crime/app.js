const cityConfig = {
  NewOrleans: { label: "New Orleans, LA", file: "NewOrleans.geojson", nameField: "gnocdc_lab" },
  LA: { label: "Los Angeles, CA", file: "LA.geojson", nameField: "name" },
  Philadelphia: { label: "Philadelphia, PA", file: "Philadelphia.geojson", nameField: "LISTNAME" },
  Chicago: { label: "Chicago, IL", file: "Chicago.geojson", nameField: "pri_neigh" },
  Houston: { label: "Houston, TX", file: "Houston.geojson", nameField: "SNBNAME" },
  SanFrancisco: { label: "San Francisco, CA", file: "SanFrancisco.geojson", nameField: "name" },
  Atlanta: { label: "Atlanta, GA", file: "Atlanta.geojson", nameField: "NAME" },
  Milwaukee: { label: "Milwaukee, WI", file: "Milwaukee.geojson", nameField: "NEIGHBORHD" },
  Detroit: { label: "Detroit, MI", file: "Detroit.geojson", nameField: "nhood_name" },
  Denver: { label: "Denver, CO", file: "Denver.geojson", nameField: "NBHD_NAME" },
  Seattle: { label: "Seattle, WA", file: "Seattle.geojson", nameField: "S_HOOD" }
};

const citySelect = document.getElementById("citySelect");
const mapSection = document.getElementById("mapSection");
const selectedNames = document.getElementById("selectedNames");
const finalizeButton = document.getElementById("finalizeButton");
const mapMessage = document.getElementById("mapMessage");
const confirmModal = document.getElementById("confirmModal");
const confirmNeighborhoods = document.getElementById("confirmNeighborhoods");
const confirmCity = document.getElementById("confirmCity");
const cancelConfirm = document.getElementById("cancelConfirm");
const confirmSubmit = document.getElementById("confirmSubmit");
const studentName = document.getElementById("studentName");
const lsuId = document.getElementById("lsuId");

let map;
let neighborhoodLayer;
let currentCityKey = null;
let selected = [];
let claimedNeighborhoods = new Set(); // Supabase will populate this in the next phase.

const styles = {
  available: { color: "#f2f2f2", weight: 1.4, fillColor: "#2CA25F", fillOpacity: 0.20 },
  selected: { color: "#ffffff", weight: 2.5, fillColor: "#2CA25F", fillOpacity: 0.78 },
  claimed: { color: "#c5c5c5", weight: 1, fillColor: "#777777", fillOpacity: 0.62 }
};

Object.entries(cityConfig).forEach(([key, city]) => {
  const option = document.createElement("option");
  option.value = key;
  option.textContent = city.label;
  citySelect.appendChild(option);
});

function initMap() {
  if (map) return;

  map = L.map("map", {
    zoomControl: true,
    preferCanvas: true
  });

  const satellite = L.esri.tiledMapLayer({
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
    attribution: "Tiles &copy; Esri"
  });

  const streets = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  });

  satellite.addTo(map);
  L.control.layers({ "Satellite imagery": satellite, "Street map": streets }, null, { collapsed: false }).addTo(map);
}

function neighborhoodName(feature) {
  const config = cityConfig[currentCityKey];
  const value = feature?.properties?.[config.nameField];
  return value === null || value === undefined ? "" : String(value).trim();
}

function styleFeature(feature) {
  const name = neighborhoodName(feature);
  if (claimedNeighborhoods.has(name)) return styles.claimed;
  if (selected.includes(name)) return styles.selected;
  return styles.available;
}

function refreshStyles() {
  if (!neighborhoodLayer) return;
  neighborhoodLayer.eachLayer(layer => layer.setStyle(styleFeature(layer.feature)));
}

function updateSelectionSummary() {
  selectedNames.textContent = selected.length ? selected.join(" + ") : "None selected";
  finalizeButton.disabled = selected.length !== 2;
}

function handleNeighborhoodClick(layer) {
  const name = neighborhoodName(layer.feature);
  if (!name || claimedNeighborhoods.has(name)) return;

  if (selected.includes(name)) {
    selected = selected.filter(item => item !== name);
  } else if (selected.length < 2) {
    selected.push(name);
  } else {
    mapMessage.textContent = "You can select exactly two neighborhoods. Deselect one before choosing another.";
    return;
  }

  mapMessage.textContent = "";
  updateSelectionSummary();
  refreshStyles();
}

function bindNeighborhood(feature, layer) {
  const name = neighborhoodName(feature);

  if (!name) {
    layer.setStyle(styles.claimed);
    return;
  }

  layer.bindTooltip(name, {
    sticky: true,
    direction: "auto",
    className: "nh-label"
  });

  layer.on("click", () => handleNeighborhoodClick(layer));
  layer.on("mouseover", () => {
    if (!claimedNeighborhoods.has(name) && !selected.includes(name)) {
      layer.setStyle({ weight: 2.5, fillOpacity: 0.35 });
    }
  });
  layer.on("mouseout", refreshStyles);
}

async function loadCity(cityKey) {
  currentCityKey = cityKey;
  selected = [];
  claimedNeighborhoods = new Set();
  updateSelectionSummary();
  mapMessage.textContent = "Loading neighborhood boundaries…";

  initMap();
  mapSection.classList.remove("is-hidden");

  requestAnimationFrame(() => map.invalidateSize());

  if (neighborhoodLayer) {
    neighborhoodLayer.remove();
    neighborhoodLayer = null;
  }

  try {
    const config = cityConfig[cityKey];
    const response = await fetch(`data/${config.file}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${config.file}`);

    const geojson = await response.json();
    if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
      throw new Error(`${config.file} is not a GeoJSON FeatureCollection`);
    }

    const names = geojson.features.map(feature => {
      const value = feature?.properties?.[config.nameField];
      return value === null || value === undefined ? "" : String(value).trim();
    });

    const missing = names.filter(name => !name).length;
    const duplicates = names.filter((name, index) => name && names.indexOf(name) !== index);

    neighborhoodLayer = L.geoJSON(geojson, {
      style: styleFeature,
      onEachFeature: bindNeighborhood
    }).addTo(map);

    const bounds = neighborhoodLayer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [18, 18] });

    const notices = [];
    if (missing) notices.push(`${missing} feature${missing === 1 ? "" : "s"} missing a neighborhood name`);
    if (duplicates.length) notices.push("duplicate neighborhood names detected");
    mapMessage.textContent = notices.length ? `Data check: ${notices.join("; ")}.` : "";
  } catch (error) {
    console.error(error);
    mapMessage.textContent = `Map error: ${error.message}.`;
  }
}

citySelect.addEventListener("change", event => {
  const cityKey = event.target.value;
  if (!cityKey) {
    mapSection.classList.add("is-hidden");
    return;
  }
  loadCity(cityKey);
});

finalizeButton.addEventListener("click", () => {
  const name = studentName.value.trim();
  const id = lsuId.value.trim();

  if (!name || !id) {
    mapMessage.textContent = "Enter your name and LSU ID before finalizing your selection.";
    (!name ? studentName : lsuId).focus();
    return;
  }

  if (selected.length !== 2 || !currentCityKey) return;

  confirmNeighborhoods.textContent = selected.join(" and ");
  confirmCity.textContent = cityConfig[currentCityKey].label;
  confirmModal.classList.remove("is-hidden");
});

cancelConfirm.addEventListener("click", () => confirmModal.classList.add("is-hidden"));

confirmModal.addEventListener("click", event => {
  if (event.target === confirmModal) confirmModal.classList.add("is-hidden");
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") confirmModal.classList.add("is-hidden");
});

confirmSubmit.addEventListener("click", () => {
  confirmModal.classList.add("is-hidden");
  mapMessage.textContent = "Prototype only: the map selection works, but final submission and neighborhood locking will be connected to Supabase next.";
});
