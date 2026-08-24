from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "communities-crime" / "group-work" / "routine-collision"

# 1) Insert required Reflection prompt immediately before final submission.
index = BASE / "index.html"
s = index.read_text(encoding="utf-8")
anchor = '''      <div id="finalSubmissionPanel" class="final-submission-panel">'''
block = '''      <div class="question-block reflection-block">
        <div class="stage-kicker">Reflection</div>
        <h3>Reflect on your predictions</h3>
        <label for="finalReflection"><strong>Which two or three environmental cues most influenced your predictions? Did you consciously weigh them, or did some locations immediately appear more crime-prone (and if so, why)?</strong></label>
        <p class="helper">Required before your group can submit the activity.</p>
        <textarea id="finalReflection" rows="5" maxlength="3000" required placeholder="Enter your group’s reflection here."></textarea>
      </div>

'''
if 'id="finalReflection"' not in s:
    if anchor not in s:
        raise RuntimeError("Final submission anchor not found")
    s = s.replace(anchor, block + anchor, 1)
for old in ["20260822-2", "20260822-1"]:
    s = s.replace(f"styles.css?v={old}", "styles.css?v=20260824-1")
    s = s.replace(f"hotspots.css?v={old}", "hotspots.css?v=20260824-1")
    s = s.replace(f"submission.css?v={old}", "submission.css?v=20260824-1")
    s = s.replace(f"data.js?v={old}", "data.js?v=20260824-1")
    s = s.replace(f"app.js?v={old}", "app.js?v=20260824-1")
    s = s.replace(f"hotspots.js?v={old}", "hotspots.js?v=20260824-1")
    s = s.replace(f"submission.js?v={old}", "submission.js?v=20260824-1")
index.write_text(s, encoding="utf-8")

# 2) Save/restore the response and prevent client-side submission if blank.
js = BASE / "submission.js"
s = js.read_text(encoding="utf-8")
s = s.replace(
    'stage6: { hotspots: hotspotNotes }',
    'stage6: { hotspots: hotspotNotes, reflection: $("#finalReflection")?.value.trim() || "" }',
    1,
)
restore_anchor = '''    if (responses.stage5?.mechanismCode) {
      $("#predictionReason").value = responses.stage5.mechanismCode;
      $("#predictionReason").dispatchEvent(new Event("change", { bubbles: true }));
    }

    window.setTimeout(() => { restoring = false; }, 0);'''
restore_new = '''    if (responses.stage5?.mechanismCode) {
      $("#predictionReason").value = responses.stage5.mechanismCode;
      $("#predictionReason").dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (typeof responses.stage6?.reflection === "string") {
      $("#finalReflection").value = responses.stage6.reflection;
    }

    window.setTimeout(() => { restoring = false; }, 0);'''
if restore_anchor not in s:
    raise RuntimeError("Response restore anchor not found")
s = s.replace(restore_anchor, restore_new, 1)
submit_anchor = '''    clearTimeout(saveTimer);
    const responses = snapshotResponses();
    submitActivity.disabled = true;'''
submit_new = '''    clearTimeout(saveTimer);
    const responses = snapshotResponses();
    const reflection = responses.stage6?.reflection || "";
    if (!reflection) {
      submitMessage.classList.add("error");
      submitMessage.textContent = "Complete the required Reflection prompt before submitting.";
      $("#finalReflection")?.focus();
      $("#finalReflection")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    submitActivity.disabled = true;'''
if submit_anchor not in s:
    raise RuntimeError("Submit anchor not found")
s = s.replace(submit_anchor, submit_new, 1)
s = s.replace(
    '#initialRisk, #timeSlider, #clockRisk, [data-hotspot-note]',
    '#initialRisk, #timeSlider, #clockRisk, [data-hotspot-note], #finalReflection',
    1,
)
js.write_text(s, encoding="utf-8")

# 3) Style the Reflection textarea consistently with existing hotspot notes.
css = BASE / "hotspots.css"
s = css.read_text(encoding="utf-8")
style = '''
.reflection-block {
  margin-top: 24px;
}
.reflection-block .stage-kicker {
  margin-bottom: 5px;
}
.reflection-block textarea {
  display: block;
  width: 100%;
  min-height: 132px;
  margin-top: 10px;
  resize: vertical;
  padding: 11px 12px;
  border: 1px solid var(--line-strong);
  background: #181818;
  color: var(--text);
  font: inherit;
  line-height: 1.5;
}
.reflection-block textarea:focus {
  outline: 2px solid var(--green);
  outline-offset: 1px;
}
'''
if '.reflection-block textarea' not in s:
    s = s.rstrip() + "\n" + style
css.write_text(s, encoding="utf-8")

print("Boston reflection prompt added and wired into autosave/submission.")
