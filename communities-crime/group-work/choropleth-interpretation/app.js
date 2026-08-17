const API_URL = "https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/choropleth-group";
const STORAGE_KEY = "cc4091_choropleth_group_token";
const UNLOCK_KEY = "cc4091_choropleth_group_unlocked";

const COLORS = {
  1: "#f7fcfd",
  2: "#ccece6",
  3: "#66c2a4",
  4: "#238b45",
  5: "#005824",
};

const clusteredSameValues = [
  2,2,2,3,3,2,2,
  2,2,3,3,2,2,2,
  3,3,3,2,2,2,2,
  5,5,4,2,1,1,2,
  5,5,4,2,1,1,2
];

const dispersedSameValues = [
  5,2,3,1,2,2,5,
  2,3,2,4,2,2,3,
  2,2,1,2,1,2,3,
  2,3,2,4,2,2,3,
  5,2,2,1,3,2,5
];

const scenes = [
  {
    title: "Start with level and location",
    prompt: "Before explaining anything, identify the overall level and where the relatively high and low values are located.",
    values: [
      4,4,4,5,5,4,4,
      3,4,4,4,4,3,3,
      2,3,3,3,3,2,2,
      1,2,2,2,2,2,1,
      1,1,1,2,2,1,1
    ],
    observations: [
      "Level: Values are mixed overall, ranging from very low to very high.",
      "Pattern: Higher values are concentrated across the northern portion, while lower values dominate the south.",
      "Location: The very highest values are near the north-central edge; the lowest values are concentrated along the southern edge."
    ],
    model: "Values are mixed across the neighborhood, with higher values concentrated in the north—especially near the north-central edge—and lower values concentrated along the southern edge."
  },
  {
    title: "Recognize clustering",
    prompt: "Now focus on whether similar values sit next to one another and be specific about where the clusters occur.",
    values: [
      5,5,4,2,3,2,2,
      5,5,4,2,2,3,2,
      4,4,3,2,3,2,2,
      2,3,2,3,2,1,1,
      2,2,3,2,1,1,1
    ],
    observations: [
      "Level: The neighborhood is internally mixed rather than uniformly high or low.",
      "Pattern: High and very-high values form a compact cluster, and the lowest values also cluster together.",
      "Location: The high-value cluster is in the northwestern corner; the low-value cluster is in the southeastern corner."
    ],
    model: "The neighborhood is internally mixed: high values are clustered in the northwestern corner, while the lowest values are clustered in the southeastern corner."
  },
  {
    title: "Same values, different spatial arrangement",
    prompt: "These maps contain exactly the same set of values. Only their locations have changed. What information does the map add that an average would miss?",
    compare: true,
    leftTitle: "Clustered arrangement",
    rightTitle: "Dispersed arrangement",
    left: clusteredSameValues,
    right: dispersedSameValues,
    showStats: true,
    observations: [
      "Level: The two maps have the same mean, range, and distribution of values.",
      "Pattern: In the first map, the highest values form a compact southwestern cluster; in the second, the highest values are dispersed around the neighborhood.",
      "Comparison: The two maps have identical overall values, but the first concentrates the highest values in the southwestern corner while the second disperses them across the neighborhood."
    ],
    modelLabel: "Big-picture takeaway",
    model: "Similar neighborhood averages can conceal very different internal spatial patterns."
  },
  {
    title: "Describe the main pattern without ignoring exceptions",
    prompt: "A neighborhood can have a dominant pattern and still contain an unusual tract or pocket that is worth mentioning.",
    values: [
      3,3,3,4,4,4,3,
      3,4,4,4,5,4,3,
      3,4,4,5,5,4,3,
      3,3,4,4,4,3,3,
      2,1,3,3,3,3,2
    ],
    observations: [
      "Level: Values are generally moderate to high across most of the neighborhood.",
      "Pattern: The highest values cluster around the center and north-central/eastern portion.",
      "Exception: A single very-low tract appears near the southwestern edge and does not fit the dominant pattern."
    ],
    model: "Values are generally moderate to high, with the highest values clustered near the center and north-central/eastern portion; however, one very-low tract near the southwestern edge is a clear exception."
  },
  {
    title: "Look for gradients, not only clusters",
    prompt: "Not every pattern forms a compact pocket. Sometimes values change gradually across space.",
    values: [
      2,2,3,4,4,5,5,
      1,2,3,3,4,5,5,
      1,2,2,3,4,4,5,
      1,1,2,3,3,4,4,
      1,1,1,2,3,3,4
    ],
    observations: [
      "Level: The neighborhood contains the full range from very low through very high.",
      "Pattern: Values form a diagonal gradient rather than a single compact cluster.",
      "Location: Values are lowest in the southwest and rise steadily toward the northeast."
    ],
    model: "Values form a southwest-to-northeast gradient, increasing from very low in the southwestern corner to very high in the northeastern corner."
  },
  {
    title: "Compare neighborhoods before theorizing",
    prompt: "A useful comparison addresses both overall level and internal spatial pattern.",
    compare: true,
    leftTitle: "Neighborhood A",
    rightTitle: "Neighborhood B",
    left: [
      4,4,4,4,4,4,4,
      4,4,5,4,4,5,4,
      4,4,4,4,4,4,4,
      3,4,4,4,4,4,3,
      3,3,4,4,4,3,3
    ],
    right: [
      2,2,2,2,1,1,1,
      2,2,3,2,1,1,1,
      2,3,3,3,2,2,2,
      4,5,5,4,2,2,2,
      4,5,5,4,2,2,2
    ],
    observations: [
      "Level: Neighborhood A is generally high overall, while Neighborhood B is more mixed and lower overall.",
      "Pattern: A has broadly elevated values with relatively little internal variation; B contains a distinct high-value cluster and a low-value cluster.",
      "Location: In B, the high-value cluster is in the southwest and the lowest values are concentrated in the northeast."
    ],
    model: "Neighborhood A has generally high values across most of its area, whereas Neighborhood B is lower and more internally mixed, with high values clustered in the southwest and low values concentrated in the northeast."
  }
];

const matchingPatterns = {
  a: [
    2,2,2,3,4,5,5,
    2,2,3,3,4,5,5,
    2,3,3,3,3,4,4,
    2,2,3,3,2,2,2,
    2,2,2,3,2,2,2
  ],
  b: [
    3,3,3,3,3,3,4,
    3,3,3,3,3,4,4,
    3,3,3,3,3,3,3,
    1,1,2,3,3,3,3,
    1,1,2,3,3,3,3
  ],
  c: [
    1,1,1,1,1,1,1,
    2,2,2,2,2,2,2,
    3,3,3,3,3,3,3,
    4,4,4,4,4,4,4,
    5,5,5,5,5,5,5
  ],
  d: [
    5,2,2,3,2,2,5,
    2,3,4,2,3,2,2,
    2,2,2,5,2,4,2,
    3,5,2,2,3,2,2,
    2,2,4,2,2,5,3
  ]
};

const DESCRIPTION_DEFS = {
  ne_high: "The highest values form a compact cluster in the northeastern corner.",
  sw_low: "The lowest values are clustered in the southwestern corner while most of the neighborhood is moderate.",
  ns_gradient: "Values increase steadily from north to south, forming a clear gradient.",
  dispersed_high: "High values are dispersed across the neighborhood rather than concentrated in one area.",
  distractor: "Most values are low, with one isolated very-high pocket near the center."
};

const MAP_ANSWER_KEYS = {
  match_a: "ne_high",
  match_b: "sw_low",
  match_c: "ns_gradient",
  match_d: "dispersed_high"
};

const taskPatterns = {
  task2: [
    5,5,4,1,2,1,2,
    5,4,4,2,1,2,1,
    3,2,1,2,1,2,1,
    2,1,2,1,2,1,2,
    1,2,1,2,1,2,1
  ],
  task3: [
    2,2,5,2,2,2,1,
    2,2,2,2,3,2,2,
    1,2,2,3,3,3,2,
    1,2,2,3,4,5,5,
    1,1,2,3,4,5,5
  ],
  task4a: [
    2,2,2,2,2,2,2,
    2,1,2,2,3,4,4,
    1,1,2,3,4,5,5,
    1,2,2,3,4,5,5,
    2,2,2,2,3,4,4
  ],
  task4b: [
    1,1,2,3,4,4,3,
    1,1,2,3,4,5,4,
    2,2,3,4,4,4,5,
    3,3,4,4,3,4,4,
    3,4,4,5,4,4,3
  ]
};

let currentScene = 0;
let revealCount = 0;
let session = null;
let saveTimer = null;
let saving = false;
let pendingSave = false;
let submitted = false;
let labelToDescriptionKey = {};
let descriptionKeyToLabel = {};

function seededOffset(seed, x, y) {
  const n = Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233 + seed * 37.719) * 43758.5453;
  return (n - Math.floor(n) - 0.5) * 8;
}

function makeGeometry(seed = 1) {
  const cols = 7;
  const rows = 5;
  const width = 560;
  const height = 400;
  const mx = 25;
  const my = 20;
  const cellW = (width - mx * 2) / cols;
  const cellH = (height - my * 2 - 18) / rows;
  const pts = [];
  for (let y = 0; y <= rows; y++) {
    pts[y] = [];
    for (let x = 0; x <= cols; x++) {
      const edge = x === 0 || x === cols || y === 0 || y === rows;
      pts[y][x] = {
        x: mx + x * cellW + (edge ? 0 : seededOffset(seed, x, y)),
        y: my + y * cellH + (edge ? 0 : seededOffset(seed + 8, y, x))
      };
    }
  }
  const cells = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      cells.push([pts[y][x], pts[y][x + 1], pts[y + 1][x + 1], pts[y + 1][x]]);
    }
  }
  return { width, height, cells, outerWidth: cellW * cols, outerHeight: cellH * rows };
}

function valuesStats(values) {
  const mean = values.reduce((a,b) => a + b, 0) / values.length;
  return { mean: mean.toFixed(2), min: Math.min(...values), max: Math.max(...values) };
}

function svgMarkup(values, seed = 1, statsLabel = "") {
  const g = makeGeometry(seed);
  if (values.length !== g.cells.length) throw new Error(`Map needs ${g.cells.length} values; received ${values.length}.`);
  const polys = g.cells.map((cell, i) => {
    const points = cell.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    return `<polygon points="${points}" fill="${COLORS[values[i]]}" data-value="${values[i]}"><title>Class ${values[i]} of 5</title></polygon>`;
  }).join("");
  const stats = statsLabel ? `<text x="25" y="394">${statsLabel}</text>` : "";
  return `<svg class="toy-map" viewBox="0 0 ${g.width} ${g.height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fictional neighborhood choropleth map">${polys}<rect class="outer" x="25" y="20" width="${g.outerWidth}" height="${g.outerHeight}"/>${stats}</svg>`;
}

function renderMapInto(element, values, title = "Fictional neighborhood", seed = 1, showStats = false) {
  const s = valuesStats(values);
  const statText = showStats ? `Mean ${s.mean} · Range ${s.min}–${s.max}` : "";
  element.innerHTML = `<div class="map-wrap"><p class="map-title">${title}</p>${svgMarkup(values, seed, statText)}</div>`;
}

function renderScene() {
  const scene = scenes[currentScene];
  revealCount = 0;
  document.getElementById("sceneNumber").textContent = `Scene ${currentScene + 1} of ${scenes.length}`;
  document.getElementById("sceneTitle").textContent = scene.title;
  document.getElementById("scenePrompt").textContent = scene.prompt;
  const area = document.getElementById("sceneMapArea");
  area.classList.toggle("two-maps", !!scene.compare);
  area.innerHTML = "";
  if (scene.compare) {
    const left = document.createElement("div");
    const right = document.createElement("div");
    area.append(left, right);
    renderMapInto(left, scene.left, scene.leftTitle, 1, scene.showStats);
    renderMapInto(right, scene.right, scene.rightTitle, scene.showStats ? 1 : 3, scene.showStats);
  } else {
    renderMapInto(area, scene.values, "Fictional neighborhood", 1, false);
  }
  document.getElementById("observationList").innerHTML = "";
  document.getElementById("modelSentence").classList.add("is-hidden");
  document.getElementById("modelSentence").innerHTML = "";
  document.getElementById("revealObservation").textContent = "Reveal next observation";
  document.getElementById("prevScene").disabled = currentScene === 0;
  document.getElementById("nextScene").disabled = currentScene === scenes.length - 1;
}

function revealNext() {
  const scene = scenes[currentScene];
  const list = document.getElementById("observationList");
  if (revealCount < scene.observations.length) {
    const li = document.createElement("li");
    li.textContent = scene.observations[revealCount];
    list.appendChild(li);
    revealCount++;
    if (revealCount === scene.observations.length) document.getElementById("revealObservation").textContent = `Reveal ${scene.modelLabel ? scene.modelLabel.toLowerCase() : "model description"}`;
    return;
  }
  const model = document.getElementById("modelSentence");
  model.innerHTML = `<strong>${scene.modelLabel || "Model description"}:</strong> ${scene.model}`;
  model.classList.remove("is-hidden");
  document.getElementById("revealObservation").textContent = "Reset observations";
  revealCount++;
  if (revealCount > scene.observations.length + 1) renderScene();
}

function groupUnlocked() {
  return sessionStorage.getItem(UNLOCK_KEY) === "yes";
}

function updateGroupGate() {
  const unlocked = groupUnlocked();
  document.getElementById("passwordGate").classList.toggle("is-hidden", unlocked);
  document.getElementById("groupWorkspace").classList.toggle("is-hidden", !unlocked);
}

function setMode(mode) {
  document.querySelectorAll(".mode-tab").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  document.getElementById("walkthroughMode").classList.toggle("is-hidden", mode !== "walkthrough");
  document.getElementById("groupMode").classList.toggle("is-hidden", mode !== "group");
  if (mode === "group") {
    updateGroupGate();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function addIdFieldTo(containerId, value = "") {
  const container = document.getElementById(containerId);
  if (container.children.length >= 6) return;
  const row = document.createElement("div");
  row.className = "member-row";
  row.innerHTML = `<input type="text" inputmode="numeric" autocomplete="off" placeholder="LSU ID" value="${value.replace(/"/g, "&quot;")}"><button type="button" aria-label="Remove group member">×</button>`;
  row.querySelector("button").addEventListener("click", () => {
    if (container.children.length <= 2) return;
    row.remove();
  });
  container.appendChild(row);
}

async function api(payload) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function showMessage(el, text, type = "") {
  el.textContent = text;
  el.className = `status-message ${type}`.trim();
}

async function unlockGroup() {
  const input = document.getElementById("groupPassword");
  const message = document.getElementById("passwordMessage");
  const button = document.getElementById("unlockGroup");
  button.disabled = true;
  showMessage(message, "Checking password…");
  try {
    await api({ action: "unlock", password: input.value });
    sessionStorage.setItem(UNLOCK_KEY, "yes");
    input.value = "";
    updateGroupGate();
  } catch (e) {
    showMessage(message, e.message, "error");
    input.select();
  } finally {
    button.disabled = false;
  }
}

function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, seed) {
  const out = [...items];
  const rand = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function configureMatchingForSession() {
  const semanticKeys = Object.keys(DESCRIPTION_DEFS);
  const seed = hashString(session?.access_token || session?.id || "fallback");
  const assignedKeys = shuffled(semanticKeys, seed);
  labelToDescriptionKey = {};
  descriptionKeyToLabel = {};
  assignedKeys.forEach((key, index) => {
    const label = String(index + 1);
    labelToDescriptionKey[label] = key;
    descriptionKeyToLabel[key] = label;
  });

  const displayLabels = shuffled(["1","2","3","4","5"], seed ^ 0x9e3779b9);
  const bank = document.getElementById("descriptionBank");
  bank.innerHTML = displayLabels.map(label => `<div><strong>${label}</strong><span>${DESCRIPTION_DEFS[labelToDescriptionKey[label]]}</span></div>`).join("");

  document.querySelectorAll("[data-match-select]").forEach(select => {
    const savedValue = select.value;
    select.innerHTML = `<option value="">Choose…</option>` + ["1","2","3","4","5"].map(label => `<option value="${label}">Description ${label}</option>`).join("");
    if (savedValue) select.value = savedValue;
  });
}

function correctMatchLabels() {
  return Object.fromEntries(Object.entries(MAP_ANSWER_KEYS).map(([responseKey, descriptionKey]) => [responseKey, descriptionKeyToLabel[descriptionKey]]));
}

function descriptionTextForLabel(label) {
  return DESCRIPTION_DEFS[labelToDescriptionKey[label]] || "";
}

function renderTaskMaps() {
  renderMapInto(document.getElementById("matchMapA"), matchingPatterns.a, "", 20);
  renderMapInto(document.getElementById("matchMapB"), matchingPatterns.b, "", 21);
  renderMapInto(document.getElementById("matchMapC"), matchingPatterns.c, "", 22);
  renderMapInto(document.getElementById("matchMapD"), matchingPatterns.d, "", 23);
  renderMapInto(document.getElementById("task2Map"), taskPatterns.task2, "Index score", 6);
  renderMapInto(document.getElementById("task3Map"), taskPatterns.task3, "Index score", 11);
  renderMapInto(document.getElementById("task4MapA"), taskPatterns.task4a, "", 31);
  renderMapInto(document.getElementById("task4MapB"), taskPatterns.task4b, "", 32);
}

function collectResponses() {
  const out = {};
  document.querySelectorAll("[data-response]").forEach(el => out[el.dataset.response] = el.value.trim());
  return out;
}

function populateResponses(responses = {}) {
  document.querySelectorAll("[data-response]").forEach(el => el.value = responses[el.dataset.response] || "");
}

function scheduleSave() {
  if (!session || submitted) return;
  clearTimeout(saveTimer);
  document.getElementById("saveStatus").textContent = "Unsaved changes…";
  saveTimer = setTimeout(saveResponses, 900);
}

async function saveResponses() {
  if (!session || submitted) return;
  if (saving) { pendingSave = true; return; }
  saving = true;
  document.getElementById("saveStatus").textContent = "Saving…";
  try {
    const data = await api({ action: "save", accessToken: session.access_token, responses: collectResponses() });
    const time = new Date(data.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    document.getElementById("saveStatus").textContent = `Saved ${time}`;
  } catch (e) {
    document.getElementById("saveStatus").textContent = "Save failed — keep this page open";
  } finally {
    saving = false;
    if (pendingSave) { pendingSave = false; saveResponses(); }
  }
}

function refreshGroupIds() {
  document.getElementById("groupIds").textContent = session?.lsu_ids?.join(" · ") || "";
}

function showExercise(loadedSession) {
  session = loadedSession;
  submitted = loadedSession.status === "submitted";
  localStorage.setItem(STORAGE_KEY, loadedSession.access_token);
  document.getElementById("groupSetup").classList.add("is-hidden");
  document.getElementById("exerciseContent").classList.remove("is-hidden");
  document.getElementById("memberEditor").classList.add("is-hidden");
  refreshGroupIds();
  configureMatchingForSession();
  populateResponses(loadedSession.responses || {});
  renderTaskMaps();
  document.querySelectorAll("[data-response]").forEach(el => el.disabled = submitted);
  document.getElementById("editMembers").disabled = submitted;
  if (submitted) {
    document.getElementById("saveStatus").textContent = "Submitted";
    document.getElementById("finalizeButton").disabled = true;
    document.getElementById("finalizeButton").textContent = "Submitted";
    document.getElementById("downloadPdfButton").classList.remove("is-hidden");
    showMessage(document.getElementById("submitMessage"), "This group session is finalized. You can download the PDF again if needed.", "success");
  } else {
    document.getElementById("finalizeButton").disabled = false;
    document.getElementById("finalizeButton").textContent = "Finalize & generate PDF";
    document.getElementById("downloadPdfButton").classList.add("is-hidden");
  }
}

async function startSession() {
  const message = document.getElementById("setupMessage");
  const ids = [...document.querySelectorAll("#idFields input")].map(i => i.value.trim()).filter(Boolean);
  document.getElementById("startSession").disabled = true;
  showMessage(message, "Starting group session…");
  try {
    const data = await api({ action: "start", lsuIds: ids });
    showExercise(data.session);
  } catch (e) {
    showMessage(message, e.message, "error");
  } finally {
    document.getElementById("startSession").disabled = false;
  }
}

async function resumeSession() {
  const token = localStorage.getItem(STORAGE_KEY);
  if (!token) return;
  const message = document.getElementById("setupMessage");
  showMessage(message, "Loading saved session…");
  try {
    const data = await api({ action: "load", accessToken: token });
    showExercise(data.session);
  } catch (e) {
    localStorage.removeItem(STORAGE_KEY);
    document.getElementById("resumeArea").classList.add("is-hidden");
    showMessage(message, "The saved session could not be loaded. Start a new group session.", "error");
  }
}

function openMemberEditor() {
  if (!session || submitted) return;
  const container = document.getElementById("memberEditFields");
  container.innerHTML = "";
  session.lsu_ids.forEach(id => addIdFieldTo("memberEditFields", id));
  while (container.children.length < 2) addIdFieldTo("memberEditFields");
  showMessage(document.getElementById("memberEditMessage"), "");
  document.getElementById("memberEditor").classList.remove("is-hidden");
  document.getElementById("memberEditor").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function saveMembers() {
  if (!session || submitted) return;
  const ids = [...document.querySelectorAll("#memberEditFields input")].map(i => i.value.trim()).filter(Boolean);
  const button = document.getElementById("saveMembers");
  const message = document.getElementById("memberEditMessage");
  button.disabled = true;
  showMessage(message, "Saving group members…");
  try {
    const data = await api({ action: "updateMembers", accessToken: session.access_token, lsuIds: ids });
    session = { ...session, ...data.session };
    refreshGroupIds();
    document.getElementById("memberEditor").classList.add("is-hidden");
  } catch (e) {
    showMessage(message, e.message, "error");
  } finally {
    button.disabled = false;
  }
}

function checkMatches() {
  const r = collectResponses();
  const correctMap = correctMatchLabels();
  const keys = Object.keys(correctMap);
  const picks = keys.map(k => r[k]).filter(Boolean);
  const message = document.getElementById("matchMessage");
  if (picks.length < 4) {
    message.textContent = "Choose a description for all four maps first.";
    message.className = "inline-message error";
    return;
  }
  if (new Set(picks).size < 4) {
    message.textContent = "Use each description at most once. One description should be left unused.";
    message.className = "inline-message error";
    return;
  }
  const correct = keys.filter(k => r[k] === correctMap[k]).length;
  if (correct === 4) {
    message.textContent = "All four matches are correct. One description is correctly left unused.";
    message.className = "inline-message success";
  } else {
    message.textContent = `${correct} of 4 matches are correct. Recheck the maps and try again.`;
    message.className = "inline-message error";
  }
}

function validateResponses() {
  const required = ["match_a","match_b","match_c","match_d","task2_level","task2_pattern","task2_location","task2_description","task3_description","task4_comparison"];
  const r = collectResponses();
  const missing = required.filter(k => !r[k]);
  if (!missing.length) return true;
  const first = document.querySelector(`[data-response="${missing[0]}"]`);
  first?.scrollIntoView({ behavior: "smooth", block: "center" });
  first?.focus();
  showMessage(document.getElementById("submitMessage"), "Complete every response before finalizing the group activity.", "error");
  return false;
}

function svgToPng(svg) {
  return new Promise((resolve, reject) => {
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const source = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 857;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function addWrappedText(doc, text, x, y, width, fontSize = 10, bold = false) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(30,30,30);
  const lines = doc.splitTextToSize(text || "", width);
  doc.text(lines, x, y);
  return y + lines.length * (fontSize * 0.42) + 3;
}

function ensureSpace(doc, y, needed = 35) {
  if (y + needed <= 275) return y;
  doc.addPage();
  return 18;
}

async function generatePdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const responses = collectResponses();
  const maps = {
    ma: await svgToPng(document.querySelector("#matchMapA svg")),
    mb: await svgToPng(document.querySelector("#matchMapB svg")),
    mc: await svgToPng(document.querySelector("#matchMapC svg")),
    md: await svgToPng(document.querySelector("#matchMapD svg")),
    t2: await svgToPng(document.querySelector("#task2Map svg")),
    t3: await svgToPng(document.querySelector("#task3Map svg")),
    t4a: await svgToPng(document.querySelector("#task4MapA svg")),
    t4b: await svgToPng(document.querySelector("#task4MapB svg")),
  };

  doc.setFont("helvetica","bold"); doc.setFontSize(18); doc.setTextColor(20,20,20);
  doc.text("SOCL4091 — Communities & Crime", 18, 20);
  doc.setFontSize(15); doc.text("Interpreting Choropleth Maps", 18, 29);
  doc.setDrawColor(44,162,95); doc.setLineWidth(.8); doc.line(18,34,198,34);
  let y = 43;
  y = addWrappedText(doc, `LSU IDs: ${session.lsu_ids.join(", ")}`, 18, y, 180, 10, true);
  y = addWrappedText(doc, `Group session: ${session.id}`, 18, y, 180, 8, false);
  y += 3;

  y = ensureSpace(doc, y, 125);
  doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.text("1. Match the pattern to the description",18,y); y += 7;
  const mini = [[maps.ma,"A",18,y],[maps.mb,"B",108,y],[maps.mc,"C",18,y+62],[maps.md,"D",108,y+62]];
  mini.forEach(([img,label,x,yy]) => {
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.text(`Map ${label}`, x, yy);
    doc.addImage(img,"PNG",x,yy+3,84,54);
  });
  y += 124;
  ["a","b","c","d"].forEach(letter => {
    const choice = responses[`match_${letter}`];
    y = addWrappedText(doc, `Map ${letter.toUpperCase()} → Description ${choice}: ${descriptionTextForLabel(choice)}`, 18, y, 180, 9, false);
  });
  y += 3;

  const section = async (number, title, imageData, responseBlocks, secondImage = null) => {
    y = ensureSpace(doc, y, secondImage ? 75 : 110);
    doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.text(`${number}. ${title}`,18,y); y += 6;
    if (secondImage) {
      doc.addImage(imageData,"PNG",18,y,84,60);
      doc.addImage(secondImage,"PNG",108,y,84,60);
      y += 66;
    } else {
      doc.addImage(imageData,"PNG",40,y,136,97);
      y += 103;
    }
    for (const block of responseBlocks) {
      y = ensureSpace(doc, y, 25);
      y = addWrappedText(doc, block.label, 18, y, 180, 9, true);
      y = addWrappedText(doc, block.text, 18, y, 180, 10, false);
      y += 2;
    }
  };

  await section(2,"Build a clear description",maps.t2,[
    {label:"Scaffold", text:`${responses.task2_level}; ${responses.task2_pattern}; ${responses.task2_location}`},
    {label:"Group description", text:responses.task2_description}
  ]);
  await section(3,"Handle a more complicated map",maps.t3,[{label:"Group description",text:responses.task3_description}]);
  await section(4,"Compare two neighborhoods",maps.t4a,[{label:"Group comparison",text:responses.task4_comparison}],maps.t4b);

  doc.setFontSize(8); doc.setTextColor(100,100,100);
  doc.text("Generated by the SOCL4091 Communities & Crime in-class activity.",18,272);
  const filename = `SOCL4091_choropleth_group_${session.lsu_ids[0]}.pdf`;
  doc.save(filename);
}

async function finalize() {
  if (!validateResponses() || !session || submitted) return;
  if (!window.confirm("Finalize this group session? Your saved responses and group member list will be locked after submission.")) return;
  const button = document.getElementById("finalizeButton");
  button.disabled = true;
  button.textContent = "Finalizing…";
  showMessage(document.getElementById("submitMessage"), "Saving and generating your PDF…");
  try {
    const responses = collectResponses();
    const data = await api({ action: "submit", accessToken: session.access_token, responses });
    submitted = true;
    session.status = "submitted";
    session.submitted_at = data.session.submitted_at;
    session.lsu_ids = data.session.lsu_ids;
    document.querySelectorAll("[data-response]").forEach(el => el.disabled = true);
    document.getElementById("editMembers").disabled = true;
    document.getElementById("saveStatus").textContent = "Submitted";
    button.textContent = "Submitted";
    document.getElementById("downloadPdfButton").classList.remove("is-hidden");
    await generatePdf();
    showMessage(document.getElementById("submitMessage"), "Submitted successfully. Your group PDF has been generated.", "success");
  } catch (e) {
    button.disabled = false;
    button.textContent = "Finalize & generate PDF";
    showMessage(document.getElementById("submitMessage"), e.message || "Could not finalize the activity.", "error");
  }
}

document.querySelectorAll(".mode-tab").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
document.getElementById("prevScene").addEventListener("click", () => { if (currentScene > 0) { currentScene--; renderScene(); } });
document.getElementById("nextScene").addEventListener("click", () => { if (currentScene < scenes.length - 1) { currentScene++; renderScene(); } });
document.getElementById("revealObservation").addEventListener("click", revealNext);
document.getElementById("beginGroup").addEventListener("click", () => setMode("group"));

document.getElementById("unlockGroup").addEventListener("click", unlockGroup);
document.getElementById("groupPassword").addEventListener("keydown", e => { if (e.key === "Enter") unlockGroup(); });

document.getElementById("addMember").addEventListener("click", () => addIdFieldTo("idFields"));
document.getElementById("startSession").addEventListener("click", startSession);
document.getElementById("resumeSession").addEventListener("click", resumeSession);
document.getElementById("editMembers").addEventListener("click", openMemberEditor);
document.getElementById("addMemberEdit").addEventListener("click", () => addIdFieldTo("memberEditFields"));
document.getElementById("cancelMemberEdit").addEventListener("click", () => document.getElementById("memberEditor").classList.add("is-hidden"));
document.getElementById("saveMembers").addEventListener("click", saveMembers);
document.getElementById("checkMatches").addEventListener("click", checkMatches);
document.getElementById("finalizeButton").addEventListener("click", finalize);
document.getElementById("downloadPdfButton").addEventListener("click", generatePdf);
document.addEventListener("input", e => { if (e.target.matches("[data-response]")) scheduleSave(); });
document.addEventListener("change", e => { if (e.target.matches("[data-response]")) scheduleSave(); });

addIdFieldTo("idFields"); addIdFieldTo("idFields"); addIdFieldTo("idFields");
if (localStorage.getItem(STORAGE_KEY)) document.getElementById("resumeArea").classList.remove("is-hidden");
updateGroupGate();
renderScene();
