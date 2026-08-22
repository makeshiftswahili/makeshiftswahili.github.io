(() => {
  const SCALE_STEPS = [0.85, 1, 1.15, 1.3];
  const entries = new Map();

  const style = document.createElement("style");
  style.textContent = `
    .cc-legend-preview-host { position: relative; }
    .cc-legend-preview-overlay {
      position: absolute;
      right: 12px;
      bottom: 12px;
      z-index: 20;
      transform-origin: right bottom;
      pointer-events: none;
      max-width: 52%;
    }
    .cc-legend-preview-overlay.is-hidden { display: none !important; }
    .cc-legend-preview-overlay.cc-legend-preview-raw {
      right: 0;
      bottom: 0;
      max-width: none;
    }
    .cc-legend-preview-overlay.cc-legend-preview-raw > * { display: block; }
    .cc-legend-preview-card {
      box-sizing: border-box;
      max-width: 280px;
      padding: 9px 11px;
      border: 1px solid #bdbdbd;
      background: rgba(255,255,255,.96);
      color: #222;
      font: 11px/1.28 Arial, Helvetica, sans-serif;
      box-shadow: 0 1px 4px rgba(0,0,0,.18);
    }
    .cc-legend-preview-card.cc-bare { padding: 5px; }
    .cc-legend-preview-card img {
      display: block;
      width: auto;
      max-width: 190px;
      max-height: 180px;
    }
    .cc-legend-preview-card .map-legend,
    .cc-legend-preview-card .crime-legend,
    .cc-legend-preview-card .road-legend,
    .cc-legend-preview-card .landuse-legend,
    .cc-legend-preview-card .bar-legend,
    .cc-legend-preview-card .incident-key,
    .cc-legend-preview-card .boundary-key,
    .cc-legend-preview-card .key {
      display: flex !important;
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: 5px !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      color: #222 !important;
      box-shadow: none !important;
      min-width: 0 !important;
      max-width: none !important;
      width: auto !important;
      font: inherit !important;
    }
    .cc-legend-preview-card .legend-title,
    .cc-legend-preview-card .legend-subtitle {
      display: block !important;
      margin: 0 0 2px !important;
      color: #222 !important;
      font-weight: 700 !important;
      font-size: 1em !important;
      line-height: 1.2 !important;
    }
    .cc-legend-preview-card .legend-group {
      display: flex !important;
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: 4px !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .cc-legend-preview-card .legend-group + .legend-group { margin-top: 6px !important; }
    .cc-legend-preview-card .legend-row,
    .cc-legend-preview-card .legend-item,
    .cc-legend-preview-card .crime-legend > span:not(.legend-title),
    .cc-legend-preview-card .road-legend > span:not(.legend-title),
    .cc-legend-preview-card .landuse-legend > span:not(.legend-title),
    .cc-legend-preview-card .bar-legend > span:not(.legend-title),
    .cc-legend-preview-card .incident-key > span,
    .cc-legend-preview-card .boundary-key,
    .cc-legend-preview-card .key {
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      color: #333 !important;
      font-size: 1em !important;
      line-height: 1.2 !important;
    }
    .cc-legend-preview-card .legend-note {
      display: block !important;
      margin-top: 5px !important;
      color: #666 !important;
      font-size: .9em !important;
      line-height: 1.25 !important;
    }
    .cc-legend-controls {
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 5px;
    }
    .cc-legend-controls button {
      min-width: 0;
      white-space: nowrap;
    }
    .cc-legend-toggle[aria-pressed="true"] {
      border-color: var(--green, #2CA25F) !important;
      color: #fff !important;
    }
    .cc-legend-size {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding-left: 2px;
    }
    .cc-legend-size button {
      width: 30px;
      height: 30px;
      padding: 0 !important;
      font-size: 1rem;
      line-height: 1;
    }
    .cc-legend-size-label {
      min-width: 40px;
      color: var(--muted, #b8b8b8);
      font-size: .72rem;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    @media (max-width: 700px) {
      .cc-legend-preview-overlay { right: 8px; bottom: 8px; max-width: 62%; }
      .cc-legend-preview-card { max-width: 225px; font-size: 10px; }
    }
  `;
  document.head.appendChild(style);

  function stripIds(node) {
    if (!(node instanceof Element)) return;
    node.removeAttribute("id");
    node.querySelectorAll("[id]").forEach(child => child.removeAttribute("id"));
  }

  function makeLegendNode(render, scale = 1) {
    const value = typeof render === "function" ? render(scale) : render;
    if (value instanceof Node) {
      const clone = value.cloneNode(true);
      stripIds(clone);
      return clone;
    }
    const wrap = document.createElement("div");
    wrap.innerHTML = String(value ?? "");
    return wrap;
  }

  function stateFor(key) {
    if (!entries.has(key)) {
      entries.set(key, { key, scaleIndex: 1, visible: false, render: null, overlay: null, label: null, minus: null, plus: null, toggle: null, raw: false, rerenderOnScale: false });
    }
    return entries.get(key);
  }

  function applyState(entry) {
    const scale = SCALE_STEPS[entry.scaleIndex];
    if (entry.overlay) {
      entry.overlay.style.transform = entry.rerenderOnScale ? "none" : `scale(${scale})`;
      entry.overlay.classList.toggle("is-hidden", !entry.visible);
    }
    if (entry.label) entry.label.textContent = `${Math.round(scale * 100)}%`;
    if (entry.minus) entry.minus.disabled = entry.scaleIndex === 0;
    if (entry.plus) entry.plus.disabled = entry.scaleIndex === SCALE_STEPS.length - 1;
    if (entry.toggle) {
      entry.toggle.setAttribute("aria-pressed", entry.visible ? "true" : "false");
      entry.toggle.textContent = entry.visible ? "Hide legend preview" : "Legend preview";
    }
  }

  function refresh(key) {
    const entry = entries.get(key);
    if (!entry?.overlay || !entry.render) return;
    const scale = SCALE_STEPS[entry.scaleIndex];
    if (entry.raw) {
      entry.overlay.replaceChildren(makeLegendNode(entry.render, scale));
    } else {
      const card = entry.overlay.querySelector(".cc-legend-preview-card");
      if (!card) return;
      card.replaceChildren(makeLegendNode(entry.render, scale));
    }
    applyState(entry);
  }

  function register({ key, controlsHost, mapHost, render, bare = false, raw = false, rerenderOnScale = false, defaultScaleIndex = 1 }) {
    if (!key || !(controlsHost instanceof Element) || !(mapHost instanceof Element) || !render) return null;

    const previous = entries.get(key);
    previous?.overlay?.remove();
    previous?.controls?.remove();

    const entry = stateFor(key);
    entry.render = render;
    entry.raw = raw;
    entry.rerenderOnScale = rerenderOnScale;
    entry.scaleIndex = Math.max(0, Math.min(SCALE_STEPS.length - 1, previous?.scaleIndex ?? defaultScaleIndex));
    entry.visible = previous?.visible ?? false;

    mapHost.classList.add("cc-legend-preview-host");
    const overlay = document.createElement("div");
    overlay.className = `cc-legend-preview-overlay is-hidden${raw ? " cc-legend-preview-raw" : ""}`;
    overlay.dataset.legendPreviewKey = key;
    overlay.setAttribute("aria-hidden", "true");
    const initialScale = SCALE_STEPS[entry.scaleIndex];
    if (raw) {
      overlay.appendChild(makeLegendNode(render, initialScale));
    } else {
      const card = document.createElement("div");
      card.className = `cc-legend-preview-card${bare ? " cc-bare" : ""}`;
      card.appendChild(makeLegendNode(render, initialScale));
      overlay.appendChild(card);
    }
    mapHost.appendChild(overlay);

    const controls = document.createElement("div");
    controls.className = "cc-legend-controls";
    controls.dataset.legendControlsKey = key;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "secondary small cc-legend-toggle";
    toggle.setAttribute("aria-pressed", "false");
    toggle.title = "Show or hide a preview matching the legend footprint in the Word figure.";

    const sizeWrap = document.createElement("span");
    sizeWrap.className = "cc-legend-size";

    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "secondary small";
    minus.textContent = "−";
    minus.setAttribute("aria-label", "Decrease legend size");
    minus.title = "Decrease legend size";

    const label = document.createElement("span");
    label.className = "cc-legend-size-label";
    label.setAttribute("aria-live", "polite");

    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "secondary small";
    plus.textContent = "+";
    plus.setAttribute("aria-label", "Increase legend size");
    plus.title = "Increase legend size";

    sizeWrap.append(minus, label, plus);
    controls.append(toggle, sizeWrap);
    controlsHost.replaceChildren(controls);

    toggle.addEventListener("click", () => {
      entry.visible = !entry.visible;
      if (entry.visible) refresh(key);
      else applyState(entry);
    });
    minus.addEventListener("click", () => {
      if (entry.scaleIndex > 0) entry.scaleIndex -= 1;
      if (entry.rerenderOnScale) refresh(key); else applyState(entry);
    });
    plus.addEventListener("click", () => {
      if (entry.scaleIndex < SCALE_STEPS.length - 1) entry.scaleIndex += 1;
      if (entry.rerenderOnScale) refresh(key); else applyState(entry);
    });

    Object.assign(entry, { overlay, controls, toggle, minus, plus, label });
    applyState(entry);
    return entry;
  }

  function getScale(key) {
    const entry = entries.get(key);
    return entry ? SCALE_STEPS[entry.scaleIndex] : 1;
  }

  function getScalePercent(key) {
    return Math.round(getScale(key) * 100);
  }

  function clear(key) {
    const entry = entries.get(key);
    entry?.overlay?.remove();
    entry?.controls?.remove();
    entries.delete(key);
  }

  function clearAll() {
    [...entries.keys()].forEach(clear);
  }

  window.CC_LEGEND_PREVIEW = {
    register,
    refresh,
    getScale,
    getScalePercent,
    clear,
    clearAll,
    scales: SCALE_STEPS.slice()
  };
})();
