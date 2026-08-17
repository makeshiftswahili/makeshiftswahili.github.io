const API_URL = "https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/choropleth-group";
const STORAGE_KEY = "cc4091_choropleth_group_token";

const COLORS = {
  1: "#f7fcfd",
  2: "#ccece6",
  3: "#66c2a4",
  4: "#238b45",
  5: "#005824",
};

const clusterValues = [1,1,2,2,2, 1,2,2,3,3, 2,2,3,4,4, 2,3,4,5,5];
const dispersedValues = [5,1,3,2,4, 1,4,2,5,2, 3,2,1,4,2, 2,5,3,1,2];

const scenes = [
  {
    title: "Start with level and location",
    prompt: "Before explaining anything, identify where the relatively high and low values are located.",
    values: [2,2,3,3,4, 2,2,3,4,4, 1,2,3,4,5, 1,2,3,4,5],
    observations: [
      "Level: Values are mixed rather than uniformly high or low.",
      "Pattern: Higher values are more common on the eastern side of the neighborhood.",
      "Location: The lowest values are concentrated toward the western side.",
    ],
    model: "Values are mixed across the neighborhood, with lower values concentrated in the west and higher values concentrated toward the east."
  },
  {
    title: "Recognize clustering",
    prompt: "Now focus on whether similar values sit next to one another.",
    values: clusterValues,
    observations: [
      "Level: The neighborhood contains the full range of values.",
      "Pattern: High and very high values are clustered together rather than scattered randomly.",
      "Location: The high-value cluster is concentrated in the southeastern portion of the neighborhood.",
    ],
    model: "Values vary across the neighborhood, but the highest values are clustered in the southeastern portion while lower values are concentrated farther west."
  },
  {
    title: "Same values, different spatial arrangement",
    prompt: "These two maps contain the same set of values. Only their locations have changed. What information does the map add that an average would miss?",
    compare: true,
    leftTitle: "Clustered arrangement",
    rightTitle: "Dispersed arrangement",
    left: clusterValues,
    right: dispersedValues,
    showStats: true,
    observations: [
      "Level: The two neighborhoods have the same mean, range, and distribution of values.",
      "Pattern: In the first map, high values form a clear cluster. In the second, high values are dispersed throughout the neighborhood.",
      "Comparison: Similar neighborhood averages can conceal very different internal spatial patterns.",
    ],
    model: "The two maps have identical overall values, but the first concentrates high values in one area while the second disperses them throughout the neighborhood."
  },
  {
    title: "Describe the main pattern without ignoring exceptions",
    prompt: "A neighborhood can have a dominant pattern and still contain an unusual tract or pocket.",
    values: [1,1,2,2,2, 1,5,2,2,3, 1,2,2,3,3, 2,2,3,4,4],
    observations: [
      "Level: Most tracts are low to moderate.",
      "Pattern: Values generally increase toward the southeast.",
      "Exception: One very-high tract appears in the north-central area and does not fit the dominant pattern.",
    ],
    model: "The neighborhood is mostly low to moderate, with values generally increasing toward the southeast; however, one isolated very-high tract appears in the north-central area."
  },
  {
    title: "Look for gradients, not only clusters",
    prompt: "Not every pattern has a sharp boundary. Sometimes values change gradually across space.",
    values: [1,2,3,4,5, 1,2,3,4,5, 1,2,3,4,5, 1,2,3,4,5],
    observations: [
      "Level: The neighborhood contains values from very low through very high.",
      "Pattern: The values form a clear west-to-east gradient.",
      "Location: Low values dominate the west and steadily rise toward the east.",
    ],
    model: "Values form a west-to-east gradient, increasing steadily from very low in the western portion to very high in the eastern portion."
  },
  {
    title: "Compare neighborhoods before theorizing",
    prompt: "A useful comparison addresses both overall level and internal spatial pattern.",
    compare: true,
    leftTitle: "Neighborhood A",
    rightTitle: "Neighborhood B",
    left: [4,4,4,5,5, 3,4,4,5,5, 3,3,4,4,5, 2,3,3,4,4],
    right: [2,2,3,3,4, 2,3,3,4,4, 1,2,3,4,5, 1,2,3,4,5],
    observations: [
      "Level: Neighborhood A is generally higher overall than Neighborhood B.",
      "Pattern: A has broadly elevated values, while B shows greater internal variation and a west-to-east increase.",
      "Comparison: A strong comparison describes both the difference in overall level and the difference in spatial organization.",
    ],
    model: "Neighborhood A has generally higher values across most tracts, while Neighborhood B is more internally mixed and shows a clear increase from west to east."
  }
];

const taskPatterns = {
  task1: [5,5,4,2,2, 5,4,4,2,1, 4,4,3,2,1, 3,3,2,1,1],
  task2: [2,5,2,2,3, 2,2,2,3,3, 1,2,3,4,4, 1,2,4,5,5],
  task3a: clusterValues,
  task3b: dispersedValues,
  task4: [1,1,2,4,5, 1,2,3,4,5, 2,2,3,4,5, 2,3,3,4,4]
};

let currentScene = 0;
let revealCount = 0;
let session = null;
let saveTimer = null;
let saving = false;
let pendingSave = false;
let submitted = false;

function seededOffset(seed, x, y) {
  const n = Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233 + seed * 37.719) * 43758.5453;
  return (n - Math.floor(n) - 0.5) * 10;
}

function makeGeometry(seed = 1) {
  const cols = 5;
  const rows = 4;
  const width = 500;
  const height = 330;
  const mx = 25;
  const my = 20;
  const cellW = (width - mx * 2) / cols;
  const cellH = (height - my * 2) / rows;
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
  return { width, height, cells };
}

function valuesStats(values) {
  const mean = values.reduce((a,b) => a + b, 0) / values.length;
  return { mean: mean.toFixed(2), min: Math.min(...values), max: Math.max(...values) };
}

function svgMarkup(values, seed = 1, statsLabel = "") {
  const g = makeGeometry(seed);
  const polys = g.cells.map((cell, i) => {
    const points = cell.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    return `<polygon points="${points}" fill="${COLORS[values[i]]}" data-value="${values[i]}"><title>Class ${values[i]} of 5</title></polygon>`;
  }).join("");
  const stats = statsLabel ? `<text x="25" y="322">${statsLabel}</text>` : "";
  return `<svg class="toy-map" viewBox="0 0 ${g.width} ${g.height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fictional neighborhood choropleth map">${polys}<rect class="outer" x="25" y="20" width="450" height="290"/>${stats}</svg>`;
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
    if (revealCount === scene.observations.length) document.getElementById("revealObservation").textContent = "Reveal model description";
    return;
  }
  const model = document.getElementById("modelSentence");
  model.innerHTML = `<strong>Model description:</strong> ${scene.model}`;
  model.classList.remove("is-hidden");
  document.getElementById("revealObservation").textContent = "Reset observations";
  revealCount++;
  if (revealCount > scene.observations.length + 1) renderScene();
}

function setMode(mode) {
  document.querySelectorAll(".mode-tab").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  document.getElementById("walkthroughMode").classList.toggle("is-hidden", mode !== "walkthrough");
  document.getElementById("groupMode").classList.toggle("is-hidden", mode !== "group");
  if (mode === "group") window.scrollTo({ top: 0, behavior: "smooth" });
}

function addIdField(value = "") {
  const container = document.getElementById("idFields");
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

function renderTaskMaps() {
  renderMapInto(document.getElementById("task1Map"), taskPatterns.task1, "Index score", 6);
  renderMapInto(document.getElementById("task2Map"), taskPatterns.task2, "Index score", 11);
  renderMapInto(document.getElementById("task3MapA"), taskPatterns.task3a, "", 1, true);
  renderMapInto(document.getElementById("task3MapB"), taskPatterns.task3b, "", 1, true);
  renderMapInto(document.getElementById("task4Map"), taskPatterns.task4, "Concentrated disadvantage", 15);
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

function showExercise(loadedSession) {
  session = loadedSession;
  submitted = loadedSession.status === "submitted";
  localStorage.setItem(STORAGE_KEY, loadedSession.access_token);
  document.getElementById("groupSetup").classList.add("is-hidden");
  document.getElementById("exerciseContent").classList.remove("is-hidden");
  document.getElementById("groupIds").textContent = loadedSession.lsu_ids.join(" · ");
  populateResponses(loadedSession.responses || {});
  renderTaskMaps();
  document.querySelectorAll("[data-response]").forEach(el => el.disabled = submitted);
  if (submitted) {
    document.getElementById("saveStatus").textContent = "Submitted";
    document.getElementById("finalizeButton").disabled = true;
    document.getElementById("finalizeButton").textContent = "Submitted";
    document.getElementById("downloadPdfButton").classList.remove("is-hidden");
    showMessage(document.getElementById("submitMessage"), "This group session is finalized. You can download the PDF again if needed.", "success");
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

function validateResponses() {
  const required = ["task1_level","task1_pattern","task1_location","task1_description","task2_description","task3_comparison","task4_description","task4_theory"];
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
      canvas.height = 792;
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
    t1: await svgToPng(document.querySelector("#task1Map svg")),
    t2: await svgToPng(document.querySelector("#task2Map svg")),
    t3a: await svgToPng(document.querySelector("#task3MapA svg")),
    t3b: await svgToPng(document.querySelector("#task3MapB svg")),
    t4: await svgToPng(document.querySelector("#task4Map svg")),
  };

  doc.setFont("helvetica","bold"); doc.setFontSize(18); doc.setTextColor(20,20,20);
  doc.text("SOCL4091 — Communities & Crime", 18, 20);
  doc.setFontSize(15); doc.text("Interpreting Choropleth Maps", 18, 29);
  doc.setDrawColor(44,162,95); doc.setLineWidth(.8); doc.line(18,34,198,34);
  let y = 43;
  y = addWrappedText(doc, `LSU IDs: ${session.lsu_ids.join(", ")}`, 18, y, 180, 10, true);
  y = addWrappedText(doc, `Group session: ${session.id}`, 18, y, 180, 8, false);
  y += 3;

  const section = async (number, title, imageData, responseBlocks, secondImage = null) => {
    y = ensureSpace(doc, y, 70);
    doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.text(`${number}. ${title}`,18,y); y += 6;
    if (secondImage) {
      doc.addImage(imageData,"PNG",18,y,84,55);
      doc.addImage(secondImage,"PNG",108,y,84,55);
      y += 61;
    } else {
      doc.addImage(imageData,"PNG",36,y,144,95);
      y += 101;
    }
    for (const block of responseBlocks) {
      y = ensureSpace(doc, y, 25);
      y = addWrappedText(doc, block.label, 18, y, 180, 9, true);
      y = addWrappedText(doc, block.text, 18, y, 180, 10, false);
      y += 2;
    }
  };

  await section(1,"Describe the pattern",maps.t1,[
    {label:"Scaffold", text:`${responses.task1_level}; ${responses.task1_pattern}; ${responses.task1_location}`},
    {label:"Group description", text:responses.task1_description}
  ]);
  await section(2,"Handle a more complicated map",maps.t2,[{label:"Group description",text:responses.task2_description}]);
  await section(3,"Compare two neighborhoods",maps.t3a,[{label:"Group comparison",text:responses.task3_comparison}],maps.t3b);
  await section(4,"From map description to theory",maps.t4,[
    {label:"A. Empirical description",text:responses.task4_description},
    {label:"B. Theoretical interpretation",text:responses.task4_theory}
  ]);

  doc.setFontSize(8); doc.setTextColor(100,100,100);
  doc.text("Generated by the SOCL4091 Communities & Crime in-class activity.",18,272);
  const filename = `SOCL4091_choropleth_group_${session.lsu_ids[0]}.pdf`;
  doc.save(filename);
}

async function finalize() {
  if (!validateResponses() || !session || submitted) return;
  if (!window.confirm("Finalize this group session? Your saved responses will be locked after submission.")) return;
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
    document.querySelectorAll("[data-response]").forEach(el => el.disabled = true);
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

// Instructor walkthrough controls
document.querySelectorAll(".mode-tab").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
document.getElementById("prevScene").addEventListener("click", () => { if (currentScene > 0) { currentScene--; renderScene(); } });
document.getElementById("nextScene").addEventListener("click", () => { if (currentScene < scenes.length - 1) { currentScene++; renderScene(); } });
document.getElementById("revealObservation").addEventListener("click", revealNext);
document.getElementById("beginGroup").addEventListener("click", () => setMode("group"));

// Group setup and work
document.getElementById("addMember").addEventListener("click", () => addIdField());
document.getElementById("startSession").addEventListener("click", startSession);
document.getElementById("resumeSession").addEventListener("click", resumeSession);
document.getElementById("finalizeButton").addEventListener("click", finalize);
document.getElementById("downloadPdfButton").addEventListener("click", generatePdf);
document.addEventListener("input", e => { if (e.target.matches("[data-response]")) scheduleSave(); });
document.addEventListener("change", e => { if (e.target.matches("[data-response]")) scheduleSave(); });

addIdField(); addIdField(); addIdField();
if (localStorage.getItem(STORAGE_KEY)) document.getElementById("resumeArea").classList.remove("is-hidden");
renderScene();
