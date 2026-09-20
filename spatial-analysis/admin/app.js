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
const meetingRows = document.getElementById("meetingRows");
const meetingMessage = document.getElementById("meetingMessage");
const bookingCount = document.getElementById("bookingCount");

let adminKey = sessionStorage.getItem("sa_admin_key") || "";
let modules = [];
let meetingBookings = [];
let meetingSlots = [];

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

function adminOutlookUrl(booking) {
  const isZoom = booking.modality === "Zoom";
  const bodyParts = [
    `Student: ${booking.student_name}`,
    `Format: ${booking.modality}`
  ];

  if (booking.questions) bodyParts.push(`Advance questions: ${booking.questions}`);
  if (isZoom) {
    bodyParts.push("Zoom meeting ID: 828 756 0198");
    bodyParts.push("Student will enter the waiting room when joining.");
  }

  return window.SACalendar.outlookUrl({
    slotKey: booking.slot_key || booking.key,
    subject: `SOCL7213: ${booking.student_name} (${booking.modality})`,
    body: bodyParts.join("\n\n"),
    location: isZoom ? "Zoom — Meeting ID 828 756 0198" : "In person"
  });
}

function renderMeetings() {
  bookingCount.textContent = `${meetingBookings.length} of ${meetingSlots.length || 12} booked`;
  if (!meetingBookings.length) {
    meetingRows.innerHTML = '<div class="empty-state">No meeting reservations yet.</div>';
    return;
  }

  meetingRows.innerHTML = meetingBookings.map(booking => `
    <article class="meeting-row">
      <div class="meeting-time">
        <strong>${escapeHtml(booking.date)}</strong>
        <span>${escapeHtml(booking.time)} · ${escapeHtml(booking.modality)}</span>
      </div>
      <div class="meeting-student">
        <strong>${escapeHtml(booking.student_name)}</strong>
        ${booking.questions ? `<p>${escapeHtml(booking.questions)}</p>` : '<p class="no-questions">No advance questions.</p>'}
      </div>
      <div class="meeting-actions">
        <a class="outlook-button" href="${escapeHtml(adminOutlookUrl(booking))}" target="_blank" rel="noopener noreferrer">Add to Outlook</a>
        <button type="button" class="danger-button" data-booking-id="${booking.id}" data-student="${escapeHtml(booking.student_name)}">Cancel reservation</button>
      </div>
    </article>`).join("");

  document.querySelectorAll("[data-booking-id]").forEach(button => {
    button.addEventListener("click", () => cancelMeeting(button));
  });
}

async function fetchState() {
  const response = await fetch(API_URL, { method: "GET", headers: headers(), cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not load course admin");
  modules = payload.modules || [];
  meetingBookings = payload.meetingBookings || [];
  meetingSlots = payload.meetingSlots || [];
  renderModules();
  renderMeetings();
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

async function cancelMeeting(button) {
  const student = button.dataset.student || "this student";
  if (!window.confirm(`Cancel the meeting reservation for ${student}? The time will immediately become available to students again.`)) return;
  button.disabled = true;
  meetingMessage.textContent = "Canceling reservation…";
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ action: "cancel-meeting", bookingId: Number(button.dataset.bookingId) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not cancel reservation.");
    meetingBookings = payload.meetingBookings || [];
    renderMeetings();
    meetingMessage.textContent = "Reservation canceled; the time is available again.";
  } catch (error) {
    meetingMessage.textContent = error.message;
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
refreshButton.addEventListener("click", async () => {
  moduleMessage.textContent = "Refreshing…";
  meetingMessage.textContent = "";
  try { await fetchState(); moduleMessage.textContent = ""; }
  catch (e) { moduleMessage.textContent = e.message; }
});
logoutButton.addEventListener("click", () => {
  sessionStorage.removeItem("sa_admin_key");
  adminKey = "";
  adminKeyInput.value = "";
  adminPanel.classList.add("is-hidden");
  loginPanel.classList.remove("is-hidden");
});

if (adminKey) {
  fetchState().then(() => {
    loginPanel.classList.add("is-hidden");
    adminPanel.classList.remove("is-hidden");
  }).catch(() => {
    sessionStorage.removeItem("sa_admin_key");
    adminKey = "";
  });
}