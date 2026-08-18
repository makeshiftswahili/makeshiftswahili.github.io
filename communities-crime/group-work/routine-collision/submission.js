(() => {
  const API_URL = "https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/microspatial-convergence";
  const TOKEN_KEY = "cc_microspatial_convergence_token_v1";
  const data = window.ROUTINE_COLLISION_DATA;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  let accessToken = localStorage.getItem(TOKEN_KEY) || "";
  let sessionStatus = "none";
  let lsuIds = [];
  let savedResponses = {};
  let hotspotNotes = {};
  let saveTimer = null;
  let restoring = false;
  let editMode = false;

  const groupSetup = $("#groupSetup");
  const groupIdentityBar = $("#groupIdentityBar");
  const groupIdList = $("#groupIdList");
  const memberRows = $("#memberRows");
  const setupMessage = $("#setupMessage");
  const startSessionButton = $("#startSessionButton");
  const saveMembersButton = $("#saveMembersButton");
  const cancelEditMembers = $("#cancelEditMembers");
  const addMemberButton = $("#addMemberButton");
  const editMembersButton = $("#editMembersButton");
  const saveState = $("#saveState");
  const submitActivity = $("#submitActivity");
  const submitMessage = $("#submitMessage");
  const finalSubmissionPanel = $("#finalSubmissionPanel");

  if (!groupSetup || !data) return;

  function cleanId(value) {
    return String(value || "").trim().replace(/\s+/g, "").slice(0, 30);
  }

  function api(action, extra = {}) {
    return fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, accessToken, ...extra })
    }).then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Request failed");
      return payload;
    });
  }

  function memberInputRow(value = "") {
    const row = document.createElement("div");
    row.className = "member-row";
    row.innerHTML = `
      <input type="text" inputmode="text" autocomplete="off" maxlength="30" placeholder="LSU ID" value="${String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">
      <button type="button" class="member-remove" aria-label="Remove group member">×</button>
    `;
    row.querySelector(".member-remove").addEventListener("click", () => {
      if (memberRows.children.length <= 2) return;
      row.remove();
      refreshRemoveButtons();
    });
    return row;
  }

  function refreshRemoveButtons() {
    const disabled = memberRows.children.length <= 2;
    memberRows.querySelectorAll(".member-remove").forEach(button => {
      button.disabled = disabled;
      button.style.visibility = disabled ? "hidden" : "visible";
    });
    addMemberButton.disabled = memberRows.children.length >= 6;
  }

  function renderMemberInputs(ids = []) {
    memberRows.innerHTML = "";
    const values = ids.length ? ids : ["", ""];
    values.slice(0, 6).forEach(value => memberRows.appendChild(memberInputRow(value)));
    while (memberRows.children.length < 2) memberRows.appendChild(memberInputRow(""));
    refreshRemoveButtons();
  }

  function readMemberIds() {
    const ids = [...memberRows.querySelectorAll("input")].map(input => cleanId(input.value)).filter(Boolean);
    return [...new Set(ids)];
  }

  function validateMemberIds(ids) {
    if (ids.length < 2 || ids.length > 6) return "Enter LSU IDs for 2–6 group members.";
    if (ids.some(id => id.length < 4)) return "One or more LSU IDs are invalid.";
    return "";
  }

  function setSetupMessage(message, error = false) {
    setupMessage.textContent = message || "";
    setupMessage.classList.toggle("error", error);
  }

  function showIdentity() {
    groupIdList.textContent = lsuIds.join(" · ");
    groupIdentityBar.classList.remove("is-hidden");
    groupSetup.classList.add("is-hidden");
    document.body.classList.remove("session-locked");
  }

  function showSetupForEdit() {
    if (sessionStatus === "submitted") return;
    editMode = true;
    renderMemberInputs(lsuIds);
    setSetupMessage("");
    startSessionButton.classList.add("is-hidden");
    saveMembersButton.classList.remove("is-hidden");
    cancelEditMembers.classList.remove("is-hidden");
    groupSetup.classList.remove("is-hidden");
    groupIdentityBar.classList.add("is-hidden");
    groupSetup.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showSetupForStart() {
    editMode = false;
    renderMemberInputs([]);
    startSessionButton.classList.remove("is-hidden");
    saveMembersButton.classList.add("is-hidden");
    cancelEditMembers.classList.add("is-hidden");
    groupSetup.classList.remove("is-hidden");
    groupIdentityBar.classList.add("is-hidden");
    document.body.classList.add("session-locked");
  }

  function effectLabel(value) {
    return {
      lower: "Lower opportunity",
      higher: "Higher opportunity",
      ambiguous: "Ambiguous / mixed"
    }[value] || value || "Not recorded";
  }

  function syncCurrentHotspotNotes() {
    const label = $("#selectedHotspotLabel")?.textContent || "";
    const match = label.match(/(\d+)/);
    if (!match) return;
    const rank = match[1];
    const stats = $("#selectedHotspotStats")?.textContent || "";
    const [locationPart = "", countPart = ""] = stats.split("·").map(item => item.trim());
    hotspotNotes[rank] = hotspotNotes[rank] || {};
    hotspotNotes[rank].location = locationPart;
    hotspotNotes[rank].countLabel = countPart;
    $("#hotspotObservationPanel")?.querySelectorAll("[data-hotspot-note]").forEach(textarea => {
      hotspotNotes[rank][textarea.dataset.hotspotNote] = textarea.value.trim();
    });
  }

  function snapshotResponses() {
    syncCurrentHotspotNotes();

    const observed = [...$("#observationGrid")?.querySelectorAll("input:checked") || []]
      .map(input => data.observations[Number(input.value)])
      .filter(Boolean);

    const timeIndex = Number($("#timeSlider")?.value || 0);
    const selectedTime = data.timeline?.[timeIndex]?.label || $("#selectedTime")?.textContent || "";

    const collisionSelected = [...$("#collisionChoices")?.querySelectorAll(".collision-choice") || []]
      .find(button => button.dataset.submissionSelected === "true");

    const interventions = $$(".intervention-card").map(card => {
      const selected = [...card.querySelectorAll(".effect-choice")].find(button => button.classList.contains("selected"));
      return {
        id: card.dataset.intervention || "",
        title: card.querySelector("h3")?.textContent?.trim() || "Intervention",
        choiceCode: selected?.dataset.effect || "",
        choice: effectLabel(selected?.dataset.effect || "")
      };
    }).filter(item => item.choiceCode);

    const predictionButton = [...$("#predictionChoices")?.querySelectorAll(".prediction-choice") || []]
      .find(button => button.classList.contains("selected"));
    const siteId = predictionButton?.dataset.prediction || "";
    const site = siteId ? data.sites?.[siteId] : null;
    const mechanism = $("#predictionReason");

    const robberyCounts = {};
    const revealSites = data.comparison?.crimeReveal?.sites || {};
    Object.entries(revealSites).forEach(([id, stat]) => {
      const label = data.sites?.[id] ? `Site ${id} · ${data.sites[id].name}` : id;
      robberyCounts[label] = stat;
    });

    return {
      stage1: {
        observed,
        initialRisk: Number($("#initialRisk")?.value || 3)
      },
      stage2: {
        timeIndex,
        selectedTime,
        opportunityRating: Number($("#clockRisk")?.value || 3)
      },
      stage3: {
        convergenceChoiceId: collisionSelected?.dataset.collisionChoice || "",
        convergencePoint: collisionSelected?.textContent?.trim() || "Not recorded"
      },
      stage4: { interventions },
      stage5: {
        predictedSiteId: siteId,
        predictedSiteLabel: site ? `Site ${siteId} · ${site.name}` : "Not recorded",
        mechanismCode: mechanism?.value || "",
        mechanismLabel: mechanism?.selectedOptions?.[0]?.textContent || "Not recorded",
        robberyCounts
      },
      stage6: { hotspots: hotspotNotes }
    };
  }

  function setSaveState(message) {
    saveState.textContent = message || "";
  }

  async function saveResponses() {
    if (!accessToken || sessionStatus !== "in_progress" || restoring) return;
    const responses = snapshotResponses();
    savedResponses = responses;
    setSaveState("Saving…");
    try {
      const payload = await api("save", { responses });
      const date = new Date(payload.savedAt);
      setSaveState(Number.isNaN(date.getTime()) ? "Saved" : `Saved ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
    } catch (error) {
      setSaveState(error.message || "Save failed");
    }
  }

  function scheduleSave() {
    if (restoring || sessionStatus !== "in_progress") return;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveResponses, 700);
  }

  function restoreResponses(responses = {}) {
    savedResponses = responses || {};
    hotspotNotes = { ...(responses.stage6?.hotspots || {}) };
    restoring = true;

    const observed = new Set(responses.stage1?.observed || []);
    $("#observationGrid")?.querySelectorAll("input").forEach(input => {
      input.checked = observed.has(data.observations[Number(input.value)]);
    });

    if (responses.stage1?.initialRisk) {
      $("#initialRisk").value = String(responses.stage1.initialRisk);
      $("#initialRisk").dispatchEvent(new Event("input", { bubbles: true }));
    }

    if (Number.isInteger(responses.stage2?.timeIndex)) {
      $("#timeSlider").value = String(responses.stage2.timeIndex);
      $("#timeSlider").dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (responses.stage2?.opportunityRating) {
      $("#clockRisk").value = String(responses.stage2.opportunityRating);
      $("#clockRisk").dispatchEvent(new Event("input", { bubbles: true }));
    }

    if (responses.stage3?.convergenceChoiceId) {
      const button = $(`[data-collision-choice="${CSS.escape(responses.stage3.convergenceChoiceId)}"]`);
      if (button) button.click();
    }

    (responses.stage4?.interventions || []).forEach(item => {
      const card = $(`.intervention-card[data-intervention="${CSS.escape(item.id || "")}"]`);
      const button = card?.querySelector(`.effect-choice[data-effect="${CSS.escape(item.choiceCode || "")}"]`);
      if (button) button.click();
    });

    if (responses.stage5?.predictedSiteId) {
      const button = $(`.prediction-choice[data-prediction="${CSS.escape(responses.stage5.predictedSiteId)}"]`);
      if (button) button.click();
    }
    if (responses.stage5?.mechanismCode) {
      $("#predictionReason").value = responses.stage5.mechanismCode;
      $("#predictionReason").dispatchEvent(new Event("change", { bubbles: true }));
    }

    window.setTimeout(() => { restoring = false; }, 0);
  }

  function lockSubmitted(submittedAt) {
    sessionStatus = "submitted";
    document.body.classList.add("activity-submitted");
    finalSubmissionPanel?.classList.add("submitted");
    submitActivity.disabled = true;
    submitActivity.textContent = "Submitted";
    editMembersButton.disabled = true;
    const date = submittedAt ? new Date(submittedAt) : null;
    submitMessage.textContent = date && !Number.isNaN(date.getTime())
      ? `Submission received ${date.toLocaleString()}. Your instructor can download the group summary from the course admin page.`
      : "Submission received. Your instructor can download the group summary from the course admin page.";
    setSaveState("Submitted");
  }

  async function startSession() {
    const ids = readMemberIds();
    const validation = validateMemberIds(ids);
    if (validation) return setSetupMessage(validation, true);
    startSessionButton.disabled = true;
    setSetupMessage("Starting group session…");
    try {
      const payload = await api("start", { lsuIds: ids });
      accessToken = payload.session.access_token;
      localStorage.setItem(TOKEN_KEY, accessToken);
      lsuIds = payload.session.lsu_ids || ids;
      sessionStatus = payload.session.status || "in_progress";
      restoreResponses(payload.session.responses || {});
      showIdentity();
      setSaveState("Autosave on");
    } catch (error) {
      setSetupMessage(error.message, true);
    } finally {
      startSessionButton.disabled = false;
    }
  }

  async function updateMembers() {
    const ids = readMemberIds();
    const validation = validateMemberIds(ids);
    if (validation) return setSetupMessage(validation, true);
    saveMembersButton.disabled = true;
    setSetupMessage("Saving LSU IDs…");
    try {
      const payload = await api("updateMembers", { lsuIds: ids });
      lsuIds = payload.session.lsu_ids || ids;
      editMode = false;
      showIdentity();
      setSaveState("IDs updated");
    } catch (error) {
      setSetupMessage(error.message, true);
    } finally {
      saveMembersButton.disabled = false;
    }
  }

  async function submitFinal() {
    if (!accessToken || sessionStatus !== "in_progress") return;
    clearTimeout(saveTimer);
    const responses = snapshotResponses();
    submitActivity.disabled = true;
    submitMessage.classList.remove("error");
    submitMessage.textContent = "Submitting group activity…";
    try {
      const payload = await api("submit", { responses });
      savedResponses = responses;
      lockSubmitted(payload.session?.submitted_at);
    } catch (error) {
      submitActivity.disabled = false;
      submitMessage.classList.add("error");
      submitMessage.textContent = error.message || "Could not submit the activity.";
    }
  }

  async function loadExistingSession() {
    if (!accessToken) return showSetupForStart();
    setSetupMessage("Restoring your group session…");
    try {
      const payload = await api("load");
      lsuIds = payload.session.lsu_ids || [];
      sessionStatus = payload.session.status || "in_progress";
      restoreResponses(payload.session.responses || {});
      showIdentity();
      if (sessionStatus === "submitted") lockSubmitted(payload.session.submitted_at);
      else setSaveState("Autosave on");
    } catch (error) {
      localStorage.removeItem(TOKEN_KEY);
      accessToken = "";
      showSetupForStart();
      setSetupMessage("The previous session could not be restored. Enter your LSU IDs to begin.", false);
    }
  }

  function hydrateSelectedHotspot() {
    const label = $("#selectedHotspotLabel")?.textContent || "";
    const match = label.match(/(\d+)/);
    if (!match) return;
    const rank = match[1];
    const item = hotspotNotes[rank];
    if (!item) return;
    $("#hotspotObservationPanel")?.querySelectorAll("[data-hotspot-note]").forEach(textarea => {
      textarea.value = item[textarea.dataset.hotspotNote] || "";
    });
  }

  addMemberButton.addEventListener("click", () => {
    if (memberRows.children.length >= 6) return;
    memberRows.appendChild(memberInputRow(""));
    refreshRemoveButtons();
    memberRows.lastElementChild?.querySelector("input")?.focus();
  });
  startSessionButton.addEventListener("click", startSession);
  saveMembersButton.addEventListener("click", updateMembers);
  cancelEditMembers.addEventListener("click", () => {
    editMode = false;
    showIdentity();
  });
  editMembersButton.addEventListener("click", showSetupForEdit);
  submitActivity.addEventListener("click", submitFinal);

  document.addEventListener("click", event => {
    const target = event.target.closest?.(".collision-choice, .effect-choice, .prediction-choice, #checkClock, #lockPrediction");
    if (!target) return;
    if (target.classList.contains("collision-choice")) {
      $$(".collision-choice").forEach(button => button.dataset.submissionSelected = "false");
      target.dataset.submissionSelected = "true";
    }
    window.setTimeout(scheduleSave, 0);
  });

  document.addEventListener("input", event => {
    if (event.target.matches?.("#initialRisk, #timeSlider, #clockRisk, [data-hotspot-note]")) scheduleSave();
  });
  document.addEventListener("change", event => {
    if (event.target.matches?.("#observationGrid input, #predictionReason")) scheduleSave();
  });

  const hotspotLabel = $("#selectedHotspotLabel");
  if (hotspotLabel) {
    new MutationObserver(() => {
      window.setTimeout(() => {
        hydrateSelectedHotspot();
        scheduleSave();
      }, 0);
    }).observe(hotspotLabel, { childList: true, characterData: true, subtree: true });
  }

  renderMemberInputs([]);
  loadExistingSession();
})();
