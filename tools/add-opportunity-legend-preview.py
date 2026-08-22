from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / "communities-crime" / "opportunity" / "document.js"
INDEX = ROOT / "communities-crime" / "opportunity" / "index.html"


def required_replace(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Expected text not found for {label}")
    return text.replace(old, new, 1)


doc = DOC.read_text(encoding="utf-8")

if "oppDocRegisterLegendPreviews" not in doc:
    legend_type_block = '''  function oppDocLegendType(key) {
    if (key.startsWith("streetMap")) return "street";
    if (key.startsWith("landUseMap")) return "landuse";
    return "full";
  }
'''

    preview_block = legend_type_block + r'''

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
'''

    doc = required_replace(doc, legend_type_block, preview_block, "preview helper insertion")

    doc = required_replace(
        doc,
        '''  function oppDocSetReadyState() {
    const button = document.getElementById("buildDocument");''',
        '''  function oppDocSetReadyState() {
    oppDocEnsureLegendLibrary();
    oppDocRegisterLegendPreviews();
    const button = document.getElementById("buildDocument");''',
        "preview registration"
    )

    doc = required_replace(
        doc,
        '''  function oppDocDrawLegend(ctx, canvas, type) {
    const s = Math.max(0.92, canvas.width / 1100);''',
        '''  function oppDocDrawLegend(ctx, canvas, type, sizeMultiplier = 1) {
    const s = Math.max(0.92, canvas.width / 1100) * sizeMultiplier;''',
        "legend scale multiplier"
    )

    doc = required_replace(
        doc,
        '''    oppDocDrawLegend(ctx, canvas, oppDocLegendType(key));''',
        '''    oppDocDrawLegend(ctx, canvas, oppDocLegendType(key), window.CC_LEGEND_PREVIEW?.getScale(key) ?? 1);''',
        "export legend scale"
    )

DOC.write_text(doc, encoding="utf-8")

index = INDEX.read_text(encoding="utf-8")
index = index.replace('document.js?v=20260821-5', 'document.js?v=20260821-8')
INDEX.write_text(index, encoding="utf-8")
