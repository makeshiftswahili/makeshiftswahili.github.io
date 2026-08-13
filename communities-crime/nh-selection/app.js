const API_URL = "https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/neighborhood-selection";

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
const mapElement = document.getElementById("map");
const selectedNames = document.getElementById("selectedNames");
const finalizeButton = document.getElementById("finalizeButton");
const mapMessage = document.getElementById("mapMessage");
const studentMessage = document.getElementById("studentMessage");
const confirmModal = document.getElementById("confirmModal");
const confirmNeighborhoods = document.getElementById("confirmNeighborhoods");
const confirmCity = document.getElementById("confirmCity");
const cancelConfirm = document.getElementById("cancelConfirm");
const confirmSubmit = document.getElementById("confirmSubmit");
const studentName = document.getElementById("studentName");
const lsuId = document.getElementById("lsuId");

let map;
let mapResizeObserver;
let neighborhoodLayer;
let currentCityKey = null;
let selected = [];
let claimedNeighborhoods = new Set();
let submissionComplete = false;
let existingSubmissionLocked = false;
let lookupTimer = null;
let lookupSequence = 0;

const styles = {
  available: { color: "#f2f2f2", weight: 1.4, fillColor: "#2CA25F", fillOpacity: 0.20 },
  selected: { color: "#ffffff", weight: 2.5, fillColor: "#2CA25F", fillOpacity: 0.78 },
  claimed: { color: "#c5c5c5", weight: 1, fillColor: "#777777", fillOpacity: 0.62 }
};

const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

Object.entries(cityConfig).forEach(([key, city]) => {
  const option = document.createElement("option");
  option.value = key;
  option.textContent = city.label;
  citySelect.appendChild(option);
});

function initMap() {
  if (map) return;

  map = L.map("map", { zoomControl: true, preferCanvas: true });

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

  if ("ResizeObserver" in window) {
    mapResizeObserver = new ResizeObserver(() => {
      if (map && !mapSection.classList.contains("is-hidden")) {
        map.invalidateSize({ pan: false, animate: false });
      }
    });
    mapResizeObserver.observe(mapElement);
  }
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
  finalizeButton.disabled = submissionComplete || existingSubmissionLocked || selected.length !== 2;
}

function resetForIdentityEdit() {
  existingSubmissionLocked = false;
  studentMessage.textContent = "";
  citySelect.disabled = false;
  updateSelectionSummary();
}

async function checkExistingSelection() {
  const name = studentName.value.trim();
  const id = lsuId.value.trim();
  const sequence = ++lookupSequence;

  if (name.length < 3 || id.length < 4 || submissionComplete) {
    resetForIdentityEdit();
    return;
  }

  citySelect.disabled = true;
  studentMessage.textContent = "Checking for an existing neighborhood selection…";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "lookup", studentName: name, lsuId: id })
    });
    const payload = await response.json().catch(() => ({}));
    if (sequence !== lookupSequence) return;
    if (!response.ok) throw new Error(payload.error || "Could not check existing selection");

    if (!payload.exists) {
      existingSubmissionLocked = false;
      studentMessage.textContent = "";
      citySelect.disabled = false;
      updateSelectionSummary();
      return;
    }

    existingSubmissionLocked = true;
    selected = [];
    currentCityKey = null;
    citySelect.value = "";
    citySelect.disabled = true;
    mapSection.classList.add("is-hidden");
    updateSelectionSummary();

    if (payload.matched && Array.isArray(payload.neighborhoods) && payload.neighborhoods.length === 2) {
      studentMessage.textContent = `You have already selected ${payload.neighborhoods[0]} and ${payload.neighborhoods[1]} in ${payload.city}. Neighborhood selections are final.`;
    } else {
      studentMessage.textContent = "A neighborhood selection has already been submitted for that LSU ID. Check that your name and LSU ID are entered correctly; selections are final once submitted.";
    }
  } catch (error) {
    if (sequence !== lookupSequence) return;
    console.error(error);
    existingSubmissionLocked = false;
    citySelect.disabled = false;
    studentMessage.textContent = "Could not verify whether this LSU ID has already submitted a selection. You may continue, but the system will check again before saving.";
    updateSelectionSummary();
  }
}

function scheduleExistingSelectionCheck() {
  clearTimeout(lookupTimer);
  resetForIdentityEdit();
  lookupTimer = setTimeout(checkExistingSelection, 450);
}

studentName.addEventListener("input", scheduleExistingSelectionCheck);
lsuId.addEventListener("input", scheduleExistingSelectionCheck);

async function refreshClaims() {
  const response = await fetch(API_URL, { method: "GET", cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not load neighborhood availability");
  claimedNeighborhoods = new Set(
    (payload.claims || [])
      .filter(claim => claim.city === currentCityKey)
      .map(claim => claim.neighborhood)
  );
}

function handleNeighborhoodClick(layer) {
  if (submissionComplete || existingSubmissionLocked) return;
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
    if (!submissionComplete && !existingSubmissionLocked && !claimedNeighborhoods.has(name) && !selected.includes(name)) {
      layer.setStyle({ weight: 2.5, fillOpacity: 0.35 });
    }
  });
  layer.on("mouseout", refreshStyles);
}

async function loadCity(cityKey) {
  if (existingSubmissionLocked) return;

  currentCityKey = cityKey;
  selected = [];
  submissionComplete = false;
  updateSelectionSummary();
  mapMessage.textContent = "Loading neighborhood boundaries and current availability…";

  mapSection.classList.remove("is-hidden");
  await nextFrame();
  initMap();
  map.invalidateSize({ pan: false, animate: false });
  await nextFrame();
  map.invalidateSize({ pan: false, animate: false });

  if (neighborhoodLayer) {
    neighborhoodLayer.remove();
    neighborhoodLayer = null;
  }

  try {
    const config = cityConfig[cityKey];
    const [geoResponse] = await Promise.all([
      fetch(`../data/${config.file}`, { cache: "no-store" }),
      refreshClaims()
    ]);

    if (!geoResponse.ok) throw new Error(`Could not load ${config.file}`);
    const geojson = await geoResponse.json();
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

    await nextFrame();
    map.invalidateSize({ pan: false, animate: false });
    const bounds = neighborhoodLayer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [18, 18] });

    const notices = [];
    if (missing) notices.push(`${missing} feature${missing === 1 ? "" : "s"} missing a neighborhood name`);
    if (duplicates.length) notices.push("duplicate neighborhood names detected");
    if (notices.length) {
      mapMessage.textContent = `Data check: ${notices.join("; ")}.`;
    } else if (claimedNeighborhoods.size) {
      mapMessage.textContent = `${claimedNeighborhoods.size} neighborhood${claimedNeighborhoods.size === 1 ? " is" : "s are"} already unavailable in this city.`;
    } else {
      mapMessage.textContent = "";
    }
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

finalizeButton.addEventListener("click", async () => {
  const name = studentName.value.trim();
  const id = lsuId.value.trim();

  if (name.length < 3 || id.length < 4) {
    mapMessage.textContent = "Enter your full name and LSU ID before finalizing your selection.";
    (name.length < 3 ? studentName : lsuId).focus();
    return;
  }

  if (selected.length !== 2 || !currentCityKey || existingSubmissionLocked) return;

  finalizeButton.disabled = true;
  mapMessage.textContent = "Checking current neighborhood availability…";

  try {
    const lookupResponse = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "lookup", studentName: name, lsuId: id })
    });
    const lookupPayload = await lookupResponse.json().catch(() => ({}));
    if (!lookupResponse.ok) throw new Error(lookupPayload.error || "Could not verify existing selection");

    if (lookupPayload.exists) {
      existingSubmissionLocked = true;
      selected = [];
      currentCityKey = null;
      citySelect.value = "";
      citySelect.disabled = true;
      mapSection.classList.add("is-hidden");
      if (lookupPayload.matched && Array.isArray(lookupPayload.neighborhoods)) {
        studentMessage.textContent = `You have already selected ${lookupPayload.neighborhoods[0]} and ${lookupPayload.neighborhoods[1]} in ${lookupPayload.city}. Neighborhood selections are final.`;
      } else {
        studentMessage.textContent = "A neighborhood selection has already been submitted for that LSU ID. Check that your name and LSU ID are entered correctly; selections are final once submitted.";
      }
      updateSelectionSummary();
      return;
    }

    await refreshClaims();
    const newlyClaimed = selected.filter(neighborhood => claimedNeighborhoods.has(neighborhood));

    if (newlyClaimed.length) {
      selected = selected.filter(neighborhood => !claimedNeighborhoods.has(neighborhood));
      refreshStyles();
      updateSelectionSummary();
      const names = newlyClaimed.join(" and ");
      mapMessage.textContent = `${names} ${newlyClaimed.length === 1 ? "was" : "were"} just selected by another student. Please choose ${newlyClaimed.length === 1 ? "another neighborhood" : "two available neighborhoods"}.`;
      return;
    }

    mapMessage.textContent = "";
    confirmNeighborhoods.textContent = selected.join(" and ");
    confirmCity.textContent = cityConfig[currentCityKey].label;
    confirmModal.classList.remove("is-hidden");
  } catch (error) {
    console.error(error);
    mapMessage.textContent = "Could not verify current neighborhood availability. Please try again.";
  } finally {
    updateSelectionSummary();
  }
});

cancelConfirm.addEventListener("click", () => confirmModal.classList.add("is-hidden"));

confirmModal.addEventListener("click", event => {
  if (event.target === confirmModal && !confirmSubmit.disabled) confirmModal.classList.add("is-hidden");
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !confirmSubmit.disabled) confirmModal.classList.add("is-hidden");
});

confirmSubmit.addEventListener("click", async () => {
  if (submissionComplete || existingSubmissionLocked || selected.length !== 2 || !currentCityKey) return;

  confirmSubmit.disabled = true;
  cancelConfirm.disabled = true;
  confirmSubmit.textContent = "Submitting…";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentName: studentName.value.trim(),
        lsuId: lsuId.value.trim(),
        city: currentCityKey,
        neighborhoods: [...selected]
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Selection could not be submitted");

    submissionComplete = true;
    selected.forEach(name => claimedNeighborhoods.add(name));
    confirmModal.classList.add("is-hidden");
    refreshStyles();
    updateSelectionSummary();

    studentName.disabled = true;
    lsuId.disabled = true;
    citySelect.disabled = true;

    const fileNote = payload.fileGenerated
      ? "Your two-neighborhood GeoJSON has also been generated for the instructor."
      : "Your neighborhood selection is saved; the instructor file will be regenerated from the stored backup if needed.";
    mapMessage.textContent = `Selection submitted successfully: ${selected.join(" and ")}. ${fileNote}`;
  } catch (error) {
    console.error(error);
    confirmModal.classList.add("is-hidden");
    mapMessage.textContent = error.message;

    try {
      await refreshClaims();
      selected = selected.filter(name => !claimedNeighborhoods.has(name));
      refreshStyles();
      updateSelectionSummary();
    } catch (refreshError) {
      console.error(refreshError);
    }
  } finally {
    confirmSubmit.disabled = false;
    cancelConfirm.disabled = false;
    confirmSubmit.textContent = "Confirm final selection";
  }
});
