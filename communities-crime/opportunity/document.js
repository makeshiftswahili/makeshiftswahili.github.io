(() => {
  const OPP_DOC_LOOKUP_URL = "https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/neighborhood-selection";
  const OPP_DOC_URL = "https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/opportunity-assignment-doc";
  const OPP_DOC_KEYS = [
    "streetMapOne", "streetMapTwo",
    "landUseMapOne", "landUseMapTwo",
    "barsMapOne", "barsMapTwo",
    "microMapOne", "microMapTwo"
  ];
  const OPP_DOC_ROADS = [
    { label: "Residential / local street", color: "#f2efe9", width: 1.2 },
    { label: "Secondary street", color: "#e8d45d", width: 2 },
    { label: "Major arterial", color: "#ef9a3b", width: 3 },
    { label: "Freeway", color: "#df6072", width: 4 }
  ];
  const OPP_DOC_LAND = [
    { label: "Commercial", color: "#39b7a5" },
    { label: "Industrial", color: "#9a78cf" },
    { label: "Government", color: "#5d91d7" },
    { label: "Education", color: "#79c96b" }
  ];

  // All Opportunity maps need a preserved WebGL drawing buffer so the final
  // Word builder can capture the exact framing chosen by the student.
  const OriginalMap = maplibregl.Map;
  maplibregl.Map = class OpportunityExportMap extends OriginalMap {
    constructor(options) {
      super({
        ...options,
        canvasContextAttributes: {
          ...(options?.canvasContextAttributes || {}),
          preserveDrawingBuffer: true
        }
      });
    }
  };

  function oppDocMapStore() {
    try {
      return mapsByContainer;
    } catch {
      return null;
    }
  }

  function oppDocReady() {
    const store = oppDocMapStore();
    if (!store) return false;
    return OPP_DOC_KEYS.every(key => {
      const map = store[key];
      return Boolean(map && map.isStyleLoaded && map.isStyleLoaded());
    });
  }

  function oppDocSetReadyState() {
    oppDocEnsureLegendLibrary();
    oppDocRegisterLegendPreviews();
    const button = document.getElementById("buildDocument");
    const status = document.getElementById("documentStatus");
    if (!button || !status) return;
    const ready = oppDocReady();
    if (button.dataset.building === "true") return;
    button.disabled = !ready;
    status.textContent = ready
      ? "Ready. Frame the two final micro-place maps exactly as you want them to appear, then build your Word assignment."
      : "All eight maps must finish loading before the Word assignment can be built.";
  }

  function oppDocWaitForIdle(map) {
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      map.once("idle", finish);
      map.triggerRepaint();
      setTimeout(finish, 2500);
    });
  }

  function oppDocLegendType(key) {
    if (key.startsWith("streetMap")) return "street";
    if (key.startsWith("landUseMap")) return "landuse";
    return "full";
  }


  const oppDocPreviewMaps = new Map();
  let oppDocLegendLibraryRequested = false;

  function oppDocPreviewLine(color, width) {
    return `<span aria-hidden="true" style="display:inline-block;width:34px;height:0;border-top:${Math.max(1.5, width)}px solid ${color};border-radius:2px"></span>`;
  }

  function oppDocPreviewSquare(color) {
    return `<span aria-hidden="true" style="display:inline-block;width:12px;height:12px;background:${color};border:1px solid #555"></span>`;
  }

  function oppDocPreviewDot(color) {
    return `<span aria-hidden="true" style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${color};border:1.5px solid #222"></span>`;
  }

  function oppDocPreviewLegend(type) {
    const root = document.createElement("div");
    root.className = "map-legend";
    const title = type === "street" ? "Street hierarchy" : type === "landuse" ? "Street network + land use" : "Opportunity layers";
    const roads = [...OPP_DOC_ROADS].reverse().map(item =>
      `<div class="legend-row">${oppDocPreviewLine(item.color, item.width)}<span>${item.label}</span></div>`
    ).join("");
    const land = type === "street" ? "" : `
      <div class="legend-group">
        <div class="legend-subtitle">Nonresidential building use</div>
        ${OPP_DOC_LAND.map(item => `<div class="legend-row">${oppDocPreviewSquare(item.color)}<span>${item.label}</span></div>`).join("")}
      </div>`;
    const bar = type === "full"
      ? `<div class="legend-row">${oppDocPreviewDot("#ff5ca8")}<span>Bar / pub / nightclub / biergarten</span></div>`
      : "";
    root.innerHTML = `
      <div class="legend-group">
        <div class="legend-title">${title}</div>
        ${roads}
      </div>
      ${land}
      ${bar}
      <div class="legend-row">${oppDocPreviewLine("#2CA25F", 5)}<span>Selected neighborhood boundary</span></div>`;
    return root;
  }

  function oppDocEnsureLegendLibrary() {
    if (window.CC_LEGEND_PREVIEW || oppDocLegendLibraryRequested) return;
    oppDocLegendLibraryRequested = true;
    const script = document.createElement("script");
    script.src = "../legend-preview.js?v=20260821-8";
    script.dataset.opportunityLegendPreview = "true";
    script.onload = () => oppDocRegisterLegendPreviews();
    script.onerror = () => { oppDocLegendLibraryRequested = false; };
    document.head.appendChild(script);
  }

  function oppDocRegisterLegendPreviews() {
    if (!window.CC_LEGEND_PREVIEW) return;
    const store = oppDocMapStore();
    if (!store) return;

    for (const key of OPP_DOC_KEYS) {
      const map = store[key];
      if (!map || oppDocPreviewMaps.get(key) === map) continue;

      const mapHost = document.getElementById(key);
      const heading = mapHost?.closest(".figure-card")?.querySelector(".figure-heading");
      if (!mapHost || !heading) continue;

      window.CC_LEGEND_PREVIEW.clear(key);
      let controlsHost = heading.querySelector(`[data-legend-controls-for="${key}"]`);
      if (!controlsHost) {
        controlsHost = document.createElement("span");
        controlsHost.className = "legend-control-slot";
        controlsHost.dataset.legendControlsFor = key;
        heading.appendChild(controlsHost);
      }

      window.CC_LEGEND_PREVIEW.register({
        key,
        controlsHost,
        mapHost,
        render: () => oppDocPreviewLegend(oppDocLegendType(key))
      });
      oppDocPreviewMaps.set(key, map);
    }
  }

  function oppDocLine(ctx, x, y, w, color, lineWidth) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();
    ctx.restore();
  }

  function oppDocSquare(ctx, x, y, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    ctx.restore();
  }

  function oppDocDot(ctx, x, y, r, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function oppDocDrawLegend(ctx, canvas, type, sizeMultiplier = 1) {
    const s = Math.max(0.92, canvas.width / 1100) * sizeMultiplier;
    const pad = 13 * s;
    const font = 13 * s;
    const small = 12 * s;
    const row = 21 * s;
    const sw = 12 * s;
    const rows = type === "street" ? 5 : type === "landuse" ? 10 : 11;
    const width = 315 * s;
    const height = (50 + rows * 21) * s;
    const x = canvas.width - width - 12 * s;
    const y = canvas.height - height - 12 * s;

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,.96)";
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = "#bdbdbd";
    ctx.lineWidth = 1 * s;
    ctx.strokeRect(x + 0.5 * s, y + 0.5 * s, width - s, height - s);
    ctx.fillStyle = "#1d1d1d";
    ctx.font = `600 ${font}px Arial, sans-serif`;
    ctx.fillText(
      type === "street" ? "Street hierarchy" : type === "landuse" ? "Street network + land use" : "Opportunity layers",
      x + pad,
      y + 21 * s
    );

    let yy = y + 45 * s;
    ctx.font = `${small}px Arial, sans-serif`;
    for (const item of [...OPP_DOC_ROADS].reverse()) {
      oppDocLine(ctx, x + pad, yy - 4 * s, 34 * s, item.color, item.width * s);
      ctx.fillStyle = "#333";
      ctx.fillText(item.label, x + pad + 46 * s, yy);
      yy += row;
    }

    if (type !== "street") {
      yy += 3 * s;
      ctx.font = `600 ${small}px Arial, sans-serif`;
      ctx.fillText("Nonresidential building use", x + pad, yy);
      yy += 18 * s;
      ctx.font = `${small}px Arial, sans-serif`;
      for (const item of OPP_DOC_LAND) {
        oppDocSquare(ctx, x + pad, yy - sw + 2 * s, sw, item.color);
        ctx.fillStyle = "#333";
        ctx.fillText(item.label, x + pad + 20 * s, yy);
        yy += row;
      }
    }

    if (type === "full") {
      oppDocDot(ctx, x + pad + 6 * s, yy - 4 * s, 5 * s, "#ff5ca8");
      ctx.fillStyle = "#333";
      ctx.font = `${small}px Arial, sans-serif`;
      ctx.fillText("Bar / pub / nightclub / biergarten", x + pad + 20 * s, yy);
      yy += row;
    }

    oppDocLine(ctx, x + pad, yy - 4 * s, 34 * s, "#2CA25F", 5 * s);
    ctx.fillStyle = "#333";
    ctx.font = `${small}px Arial, sans-serif`;
    ctx.fillText("Selected neighborhood boundary", x + pad + 46 * s, yy);
    ctx.restore();
  }

  async function oppDocCapture(key) {
    const store = oppDocMapStore();
    const map = store?.[key];
    if (!map) throw new Error(`Map ${key} is not ready.`);
    await oppDocWaitForIdle(map);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const src = map.getCanvas();
    const maxWidth = 1200;
    const width = Math.min(src.width, maxWidth);
    const height = Math.round(src.height * width / src.width);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(src, 0, 0, width, height);
    oppDocDrawLegend(ctx, canvas, oppDocLegendType(key), window.CC_LEGEND_PREVIEW?.getScale(key) ?? 1);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not export a map image.")), "image/png");
    });
    return { blob, width, height };
  }

  function oppDocDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not encode image."));
      reader.readAsDataURL(blob);
    });
  }

  async function oppDocFigure(image, width = 525) {
    return {
      data: await oppDocDataUrl(image.blob),
      width,
      height: Math.round(width * image.height / image.width)
    };
  }

  async function oppDocLogo() {
    const response = await fetch("../4091logo_bw.png");
    if (!response.ok) throw new Error("Could not load course logo.");
    return oppDocDataUrl(await response.blob());
  }

  function oppDocSafe(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() || "opportunity";
  }

  function oppDocDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function oppDocProject(id) {
    const response = await fetch(OPP_DOC_LOOKUP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "moduleLookup", lsuId: id })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not reload your neighborhood selection for the document.");
    return data;
  }

  async function oppDocBuild() {
    const button = document.getElementById("buildDocument");
    const status = document.getElementById("documentStatus");
    const input = document.getElementById("lsuId");
    if (!button || !status || !input || !oppDocReady()) return;

    const id = input.value.trim();
    button.dataset.building = "true";
    button.disabled = true;

    try {
      const project = await oppDocProject(id);
      const captured = [];
      for (let i = 0; i < OPP_DOC_KEYS.length; i++) {
        status.textContent = `Capturing Figure ${i + 1} of 8…`;
        captured.push(await oppDocCapture(OPP_DOC_KEYS[i]));
      }

      const figures = [];
      for (const image of captured) figures.push(await oppDocFigure(image));
      const logo = await oppDocLogo();
      status.textContent = "Building your Word assignment…";

      const response = await fetch(OPP_DOC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lsuId: id,
          project,
          logo,
          figures: {
            streetOne: figures[0],
            streetTwo: figures[1],
            landUseOne: figures[2],
            landUseTwo: figures[3],
            barsOne: figures[4],
            barsTwo: figures[5],
            microOne: figures[6],
            microTwo: figures[7]
          }
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Could not build the Word assignment.");
      }

      oppDocDownload(await response.blob(), `${oppDocSafe(id)}_opportunity.docx`);
      status.textContent = "Word assignment downloaded. Delete all red/bracketed prompts before submitting.";
    } catch (error) {
      console.error(error);
      status.textContent = error instanceof Error ? error.message : "Could not build the Word assignment.";
    } finally {
      button.dataset.building = "false";
      button.disabled = !oppDocReady();
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    const button = document.getElementById("buildDocument");
    if (button) button.addEventListener("click", oppDocBuild);
    oppDocSetReadyState();
    setInterval(oppDocSetReadyState, 750);
  });
})();
