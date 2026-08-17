const API_URL = "https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/spatial-analysis-admin";
const SPATIAL_KEYS = new Set(["sa-weights","sa-lag","sa-moran","sa-lisa","sa-maup","sa-regression"]);

const moduleLinks = {
  "sa-weights": "../weights/",
  "sa-lag": "../lag/",
  "sa-moran": "../moran/",
  "sa-lisa": "../lisa/",
  "sa-maup": "../maup/",
  "sa-regression": "../regression/"
};

const loginPanel = document.getElementById("loginPanel");
const adminPanel = document.getElementById("adminPanel");
const adminKeyInput = document.getElementById("adminKey");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");
const refreshButton = document.getElementById("refreshButton");
const logoutButton = document.getElementById("logoutButton");
const moduleRows = document.getElementById("moduleRows");
const moduleMessage = document.getElementById("moduleMessage");

let adminKey = sessionStorage.getItem("sa_admin_key") || "";
let modules = [];

function headers() { return { "Content-Type": "application/json", "x-admin-key": adminKey }; }
function escapeHtml(value) { return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }

function moduleNameMarkup(module) {
  const label = escapeHtml(module.label);
  const href = moduleLinks[module.module_key];
  return href
    ? `<a class="module-link" href="${href}" target="_blank" rel="noopener noreferrer">${label}<span aria-hidden="true"> ↗</span></a>`
    : label;
}

function renderModules() {
  const visible = modules.filter(m => SPATIAL_KEYS.has(m.module_key));
  moduleRows.innerHTML = visible.map(module => `
    <div class="module-row">
      <div class="module-name">${moduleNameMarkup(module)}</div>
      <div class="module-status ${module.is_available ? "available" : ""}">${module.is_available ? "Available" : "Hidden"}</div>
      <button type="button" data-module="${escapeHtml(module.module_key)}" data-next="${module.is_available ? "false" : "true"}">${module.is_available ? "Hide module" : "Make available"}</button>
    </div>`).join("") || '<div class="module-row"><div class="module-name">No spatial-analysis modules found.</div></div>';
  document.querySelectorAll("[data-module]").forEach(button => button.addEventListener("click", () => toggleModule(button.dataset.module, button.dataset.next === "true", button)));
}

async function fetchState() {
  const response = await fetch(API_URL, { method: "GET", headers: headers(), cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not load module availability");
  modules = payload.modules || [];
  renderModules();
}

async function toggleModule(moduleKey, isAvailable, button) {
  button.disabled = true;
  moduleMessage.textContent = isAvailable ? "Making module available…" : "Hiding module…";
  try {
    const response = await fetch(API_URL, { method: "POST", headers: headers(), body: JSON.stringify({ action: "set-module", moduleKey, isAvailable }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not update module availability");
    modules = modules.map(m => m.module_key === payload.module.module_key ? payload.module : m);
    renderModules();
    moduleMessage.textContent = `${payload.module.label} is now ${payload.module.is_available ? "available" : "hidden"}.`;
  } catch (error) {
    moduleMessage.textContent = error.message;
    button.disabled = false;
  }
}

async function login() {
  const key = adminKeyInput.value.trim();
  if (!key) { loginMessage.textContent = "Enter the admin passphrase."; return; }
  adminKey = key; loginButton.disabled = true; loginMessage.textContent = "Checking access…";
  try {
    await fetchState();
    sessionStorage.setItem("sa_admin_key", adminKey);
    loginPanel.classList.add("is-hidden"); adminPanel.classList.remove("is-hidden");
    loginMessage.textContent = "";
  } catch (error) { adminKey = ""; loginMessage.textContent = error.message; }
  finally { loginButton.disabled = false; }
}

loginButton.addEventListener("click", login);
adminKeyInput.addEventListener("keydown", e => { if (e.key === "Enter") login(); });
refreshButton.addEventListener("click", async () => { moduleMessage.textContent = "Refreshing…"; try { await fetchState(); moduleMessage.textContent = ""; } catch (e) { moduleMessage.textContent = e.message; } });
logoutButton.addEventListener("click", () => { sessionStorage.removeItem("sa_admin_key"); adminKey = ""; adminKeyInput.value = ""; adminPanel.classList.add("is-hidden"); loginPanel.classList.remove("is-hidden"); });

if (adminKey) {
  fetchState().then(() => { loginPanel.classList.add("is-hidden"); adminPanel.classList.remove("is-hidden"); }).catch(() => { sessionStorage.removeItem("sa_admin_key"); adminKey = ""; });
}
