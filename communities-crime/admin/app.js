const API_URL = "https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/neighborhood-admin";

const loginPanel = document.getElementById("loginPanel");
const adminPanel = document.getElementById("adminPanel");
const adminKeyInput = document.getElementById("adminKey");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");
const refreshButton = document.getElementById("refreshButton");
const logoutButton = document.getElementById("logoutButton");
const submissionRows = document.getElementById("submissionRows");
const countLabel = document.getElementById("countLabel");
const adminMessage = document.getElementById("adminMessage");
const communityModuleRows = document.getElementById("communityModuleRows");
const groupModuleRows = document.getElementById("groupModuleRows");
const moduleMessage = document.getElementById("moduleMessage");
const resetModal = document.getElementById("resetModal");
const resetDescription = document.getElementById("resetDescription");
const cancelReset = document.getElementById("cancelReset");
const confirmReset = document.getElementById("confirmReset");

let adminKey = sessionStorage.getItem("cc_admin_key") || "";
let submissions = [];
let modules = [];
let pendingReset = null;

const cityLabels = {
  NewOrleans: "New Orleans, LA",
  LA: "Los Angeles, CA",
  Philadelphia: "Philadelphia, PA",
  Chicago: "Chicago, IL",
  Houston: "Houston, TX",
  SanFrancisco: "San Francisco, CA",
  Atlanta: "Atlanta, GA",
  Milwaukee: "Milwaukee, WI",
  Detroit: "Detroit, MI",
  Denver: "Denver, CO",
  Seattle: "Seattle, WA"
};

const moduleLinks = {
  "neighborhood-selection": "../nh-selection/",
  "neighborhood-context": "../neighborhood-description/",
  "social-disorganization": "../social-disorganization/",
  "opportunity": "../opportunity/",
  "political-economy": "../political-economy/",
  "segregation": "../segregation/",
  "crime-analysis": "../crime-analysis/",
  "group-map-interpretation": "../group-work/choropleth-interpretation/",
  "group-routine-collision": "../group-work/microspatial/"
};

const communityModuleKeys = [
  "neighborhood-selection",
  "neighborhood-context",
  "social-disorganization",
  "opportunity",
  "political-economy",
  "segregation",
  "crime-analysis"
];

const groupModuleKeys = [
  "group-map-interpretation",
  "group-routine-collision"
];

function apiHeaders() {
  return {
    "Content-Type": "application/json",
    "x-admin-key": adminKey
  };
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Chicago"
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function moduleNameMarkup(module) {
  const label = escapeHtml(module.label);
  const href = moduleLinks[module.module_key];
  if (!href) return label;
  return `<a class="module-link" href="${href}" target="_blank" rel="noopener noreferrer">${label}<span aria-hidden="true"> ↗</span></a>`;
}

function renderModuleGroup(container, keys) {
  const lookup = new Map(modules.map(module => [module.module_key, module]));
  const groupModules = keys.map(key => lookup.get(key)).filter(Boolean);

  if (!groupModules.length) {
    container.innerHTML = `<div class="module-row"><div class="module-name">No module records found.</div></div>`;
    return;
  }

  container.innerHTML = groupModules.map(module => `
    <div class="module-row">
      <div class="module-name">${moduleNameMarkup(module)}</div>
      <div class="module-status ${module.is_available ? "available" : ""}">${module.is_available ? "Available" : "Unavailable"}</div>
      <button type="button" class="${module.is_available ? "secondary" : ""} small" data-module-toggle="${escapeHtml(module.module_key)}" data-next-state="${module.is_available ? "false" : "true"}">
        ${module.is_available ? "Hide module" : "Make available"}
      </button>
    </div>
  `).join("");
}

async function fetchAdminState() {
  const response = await fetch(API_URL, { method: "GET", headers: apiHeaders(), cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not load admin data");
  submissions = payload.submissions || [];
  modules = payload.modules || [];
  renderRows();
  renderModules();
}

async function loadAdminState() {
  adminMessage.textContent = "Loading submissions…";
  moduleMessage.textContent = "Loading module availability…";
  await fetchAdminState();
  adminMessage.textContent = "";
  moduleMessage.textContent = "";
}

function renderModules() {
  renderModuleGroup(communityModuleRows, communityModuleKeys);
  renderModuleGroup(groupModuleRows, groupModuleKeys);

  document.querySelectorAll("[data-module-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      toggleModule(button.dataset.moduleToggle, button.dataset.nextState === "true", button);
    });
  });
}

async function toggleModule(moduleKey, isAvailable, button) {
  button.disabled = true;
  moduleMessage.textContent = isAvailable ? "Making module available…" : "Hiding module…";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ action: "set-module", moduleKey, isAvailable })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not update module availability");

    const updated = payload.module;
    modules = modules.map(module => module.module_key === updated.module_key ? updated : module);
    renderModules();
    moduleMessage.textContent = `${updated.label} is now ${updated.is_available ? "available" : "unavailable"}.`;
  } catch (error) {
    moduleMessage.textContent = error.message;
    button.disabled = false;
  }
}

function renderRows() {
  countLabel.textContent = `${submissions.length} submission${submissions.length === 1 ? "" : "s"}`;

  if (!submissions.length) {
    submissionRows.innerHTML = `<tr><td colspan="6" class="empty">No student submissions yet.</td></tr>`;
    return;
  }

  submissionRows.innerHTML = submissions.map(sub => `
    <tr>
      <td>${escapeHtml(sub.student_name)}</td>
      <td>${escapeHtml(sub.lsu_id)}</td>
      <td>${escapeHtml(cityLabels[sub.city] || sub.city)}</td>
      <td>
        <div class="nh-pair">
          <span>${escapeHtml(sub.neighborhood_1)}</span>
          <span>${escapeHtml(sub.neighborhood_2)}</span>
        </div>
      </td>
      <td>${escapeHtml(formatDate(sub.submitted_at))}</td>
      <td>
        <div class="row-actions">
          <button type="button" class="secondary small" data-download="${sub.id}">Download</button>
          <button type="button" class="danger small" data-reset="${sub.id}">Release / reset</button>
        </div>
      </td>
    </tr>
  `).join("");

  document.querySelectorAll("[data-download]").forEach(button => {
    button.addEventListener("click", () => downloadGeojson(Number(button.dataset.download)));
  });

  document.querySelectorAll("[data-reset]").forEach(button => {
    button.addEventListener("click", () => openReset(Number(button.dataset.reset)));
  });
}

async function downloadGeojson(submissionId) {
  adminMessage.textContent = "Preparing GeoJSON…";
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ action: "download", submissionId })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not prepare GeoJSON");

    if (payload.url) {
      window.location.href = payload.url;
    } else if (payload.geojson) {
      const blob = new Blob([JSON.stringify(payload.geojson)], { type: "application/geo+json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = payload.filename || `submission_${submissionId}_nh.geojson`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }
    adminMessage.textContent = "";
  } catch (error) {
    adminMessage.textContent = error.message;
  }
}

function openReset(submissionId) {
  const submission = submissions.find(item => item.id === submissionId);
  if (!submission) return;
  pendingReset = submission;
  resetDescription.textContent = `${submission.student_name}: ${submission.neighborhood_1} and ${submission.neighborhood_2} in ${cityLabels[submission.city] || submission.city}.`;
  resetModal.classList.remove("is-hidden");
}

cancelReset.addEventListener("click", () => {
  pendingReset = null;
  resetModal.classList.add("is-hidden");
});

confirmReset.addEventListener("click", async () => {
  if (!pendingReset) return;
  const target = pendingReset;
  confirmReset.disabled = true;
  cancelReset.disabled = true;
  confirmReset.textContent = "Resetting…";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ action: "reset", submissionId: target.id })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not reset submission");

    resetModal.classList.add("is-hidden");
    pendingReset = null;
    adminMessage.textContent = `${target.student_name}'s submission was reset. Both neighborhoods are available again.${payload.warning ? ` ${payload.warning}` : ""}`;
    await fetchAdminState();
  } catch (error) {
    resetModal.classList.add("is-hidden");
    pendingReset = null;
    adminMessage.textContent = error.message;
  } finally {
    confirmReset.disabled = false;
    cancelReset.disabled = false;
    confirmReset.textContent = "Release & reset";
  }
});

async function login() {
  const key = adminKeyInput.value.trim();
  if (!key) {
    loginMessage.textContent = "Enter the admin passphrase.";
    return;
  }

  adminKey = key;
  loginButton.disabled = true;
  loginMessage.textContent = "Checking access…";

  try {
    const response = await fetch(API_URL, { method: "GET", headers: apiHeaders(), cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Access denied");

    sessionStorage.setItem("cc_admin_key", adminKey);
    submissions = payload.submissions || [];
    modules = payload.modules || [];
    loginPanel.classList.add("is-hidden");
    adminPanel.classList.remove("is-hidden");
    loginMessage.textContent = "";
    renderRows();
    renderModules();
  } catch (error) {
    adminKey = "";
    sessionStorage.removeItem("cc_admin_key");
    loginMessage.textContent = error.message === "Unauthorized" ? "Incorrect passphrase." : error.message;
  } finally {
    loginButton.disabled = false;
  }
}

loginButton.addEventListener("click", login);
adminKeyInput.addEventListener("keydown", event => {
  if (event.key === "Enter") login();
});

refreshButton.addEventListener("click", async () => {
  try {
    await loadAdminState();
  } catch (error) {
    adminMessage.textContent = error.message;
    moduleMessage.textContent = error.message;
  }
});

logoutButton.addEventListener("click", () => {
  adminKey = "";
  sessionStorage.removeItem("cc_admin_key");
  adminKeyInput.value = "";
  adminPanel.classList.add("is-hidden");
  loginPanel.classList.remove("is-hidden");
  loginMessage.textContent = "";
});

resetModal.addEventListener("click", event => {
  if (event.target === resetModal && !confirmReset.disabled) {
    pendingReset = null;
    resetModal.classList.add("is-hidden");
  }
});

if (adminKey) {
  adminKeyInput.value = adminKey;
  login();
}