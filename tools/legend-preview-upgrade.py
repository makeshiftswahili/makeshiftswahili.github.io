from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
VERSION = "20260821-7"


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel, text):
    (ROOT / rel).write_text(text, encoding="utf-8")


def required_replace(text, old, new, label):
    if old not in text:
        raise RuntimeError(f"Expected text not found for {label}")
    return text.replace(old, new)


def required_regex(text, pattern, replacement, label, flags=0):
    updated, count = re.subn(pattern, replacement, text, flags=flags)
    if count != 1:
        raise RuntimeError(f"Expected exactly one regex match for {label}; found {count}")
    return updated


def bump_index(rel):
    text = read(rel)
    text = text.replace("?v=20260821-5", f"?v={VERSION}")
    write(rel, text)


LEGEND_HELP = (
    '        <p><strong>Legend preview:</strong> Use <strong>Legend preview</strong> to show approximately where the legend will sit in the Word figure. '
    'Use the <strong>−</strong> and <strong>+</strong> buttons to choose among a few small legend sizes. '
    'Hiding the preview does not remove the legend from the Word document.</p>\n'
)

# ---------------------------------------------------------------------------
# Neighborhood Description & City Context: remove PNG-only controls. These
# boundary figures do not have an embedded thematic legend, so no preview is
# added here.
# ---------------------------------------------------------------------------
rel = "communities-crime/neighborhood-description/index.html"
text = read(rel)
text = required_replace(
    text,
    'Your PNGs and Word document will always export the <strong>Street map</strong> basemap at the same zoom and position you selected.',
    'Your Word document will always use the <strong>Street map</strong> basemap at the same zoom and position you selected.',
    "neighborhood description export wording",
)
for button_id in ("downloadContext", "downloadOne", "downloadTwo"):
    text = required_regex(
        text,
        rf'\s*<button id="{button_id}" class="secondary small" type="button" disabled>Download PNG</button>',
        "",
        f"remove {button_id}",
    )
text = text.replace("?v=20260821-5", f"?v={VERSION}")
write(rel, text)

rel = "communities-crime/neighborhood-description/app.js"
text = read(rel)
for line in (
    'const downloadContext = document.getElementById("downloadContext");\n',
    'const downloadOne = document.getElementById("downloadOne");\n',
    'const downloadTwo = document.getElementById("downloadTwo");\n',
):
    text = required_replace(text, line, "", "remove neighborhood PNG button reference")
text = required_replace(
    text,
    '  [downloadContext, downloadOne, downloadTwo, buildDocument].forEach(button => button.disabled = !enabled);',
    '  buildDocument.disabled = !enabled;',
    "neighborhood setControls",
)
text = required_replace(text, '    if (!event.ctrlKey) return;', '    if (!(event.ctrlKey || event.metaKey)) return;', "neighborhood Cmd zoom")
text = text.replace(
    'All three maps are ready. Explore with satellite imagery if useful; exports will use the street basemap.',
    'All three maps are ready. Explore with satellite imagery if useful; the Word document will use the street basemap.',
)
text = required_regex(
    text,
    r'\nasync function downloadFigure\(key, number\) \{.*?\n\}\n\nfunction blobToDataUrl',
    '\nfunction blobToDataUrl',
    "remove neighborhood downloadFigure",
    flags=re.S,
)
for line in (
    'downloadContext.addEventListener("click", () => downloadFigure("context", 1));\n',
    'downloadOne.addEventListener("click", () => downloadFigure("one", 2));\n',
    'downloadTwo.addEventListener("click", () => downloadFigure("two", 3));\n',
):
    text = required_replace(text, line, "", "remove neighborhood PNG handler")
write(rel, text)

# ---------------------------------------------------------------------------
# Social Disorganization: replace each PNG button with a legend-preview toggle
# and size controls. The selected size also scales the legend drawn into Word.
# ---------------------------------------------------------------------------
rel = "communities-crime/social-disorganization/index.html"
text = read(rel)
text = required_replace(
    text,
    '        <p><strong>Satellite imagery is for exploration:</strong> Toggle to Satellite to inspect the built environment. Your PNGs and Word document will always export the <strong>Street map</strong> basemap at the same zoom and position you selected.</p>\n',
    '        <p><strong>Satellite imagery is for exploration:</strong> Toggle to Satellite to inspect the built environment. Your Word document will always use the <strong>Street map</strong> basemap at the same zoom and position you selected.</p>\n' + LEGEND_HELP,
    "SDT legend help",
)
text = text.replace("?v=20260821-5", f"?v={VERSION}")
text = required_replace(
    text,
    f'<script type="module" src="app.js?v={VERSION}"></script>',
    f'<script src="../legend-preview.js?v={VERSION}"></script>\n<script type="module" src="app.js?v={VERSION}"></script>',
    "SDT shared legend script",
)
write(rel, text)

rel = "communities-crime/social-disorganization/app.js"
text = read(rel)
text = required_replace(
    text,
    'function setControls(ok){document.querySelectorAll(".download-map").forEach(b=>b.disabled=!ok);buildDocument.disabled=!ok;documentStatus.textContent=ok?"Ready to build your Word assignment.":"Maps must finish loading first."}',
    'function setControls(ok){buildDocument.disabled=!ok;documentStatus.textContent=ok?"Ready to build your Word assignment.":"Maps must finish loading first."}',
    "SDT setControls",
)
text = required_replace(text, 'if(!e.ctrlKey)return;', 'if(!(e.ctrlKey||e.metaKey))return;', "SDT Cmd zoom")
text = text.replace(
    'All six maps are ready. Adjust the framing as needed; exports will use the street basemap.',
    'All six maps are ready. Adjust the framing and legend previews as needed; the Word document will use the street basemap.',
)
text = required_replace(
    text,
    '<button type="button" class="secondary small download-map" data-map-key="${key}" data-figure="${num}" disabled>Download PNG</button>',
    '<span class="legend-control-slot" data-legend-controls-for="${key}"></span>',
    "SDT legend control slot",
)
text = required_replace(
    text,
    '<div class="map-shell"><div id="map-${key}" class="map" aria-label="${v.title} map for ${n}"></div><img class="map-legend" src="${DATA_BASE}${v.legend}" alt=""></div>',
    '<div class="map-shell"><div id="map-${key}" class="map" aria-label="${v.title} map for ${n}"></div></div>',
    "SDT remove always-on map legend",
)
text = required_replace(
    text,
    'document.querySelectorAll(".download-map").forEach(b=>b.addEventListener("click",()=>downloadFigure(b.dataset.mapKey,Number(b.dataset.figure))))',
    'document.querySelectorAll("[data-legend-controls-for]").forEach(slot=>{const key=slot.dataset.legendControlsFor,cfg=configForKey(key),mapHost=document.getElementById(`map-${key}`)?.parentElement;if(!cfg||!mapHost)return;window.CC_LEGEND_PREVIEW?.register({key,controlsHost:slot,mapHost,bare:true,render:()=>{const img=document.createElement("img");img.src=`${DATA_BASE}${cfg.legend}`;img.alt=`${cfg.title} legend`;return img}})})',
    "SDT wire legend preview",
)
text = required_replace(
    text,
    'legendScale=1.25;',
    'legendScale=1.25*(window.CC_LEGEND_PREVIEW?.getScale(key)??1);',
    "SDT export legend scale",
)
text = required_regex(
    text,
    r'\nasync function downloadFigure\(key,num\)\{.*?\}\nfunction blobToDataUrl',
    '\nfunction blobToDataUrl',
    "remove SDT downloadFigure",
    flags=re.S,
)
write(rel, text)

# ---------------------------------------------------------------------------
# Political Economy
# ---------------------------------------------------------------------------
rel = "communities-crime/political-economy/index.html"
text = read(rel)
anchor = '        <p><strong>Mortgage-investment maps:</strong> the measure follows the count-based logic used by Velez, Lyons, and Boursaw (2012), adapted to a four-year window: total 2018–2021 home-purchase mortgage originations per 1,000 owner-occupied housing units in 2020. Tracts are divided into city-specific quintiles labeled <strong>Very Low, Low, Moderate, High,</strong> and <strong>Very High</strong>. These are relative positions within your city, not absolute thresholds, and the same class breaks are used for both neighborhoods. Tracts shown with black diagonal hatching have 0 owner-occupied housing units in 2020, so a mortgage-investment rate cannot be calculated.</p>\n'
text = required_replace(text, anchor, anchor + LEGEND_HELP, "PE legend help")
text = text.replace("?v=20260821-5", f"?v={VERSION}")
text = required_replace(
    text,
    f'<script type="module" src="app.js?v={VERSION}"></script>',
    f'<script src="../legend-preview.js?v={VERSION}"></script>\n<script type="module" src="app.js?v={VERSION}"></script>',
    "PE shared legend script",
)
write(rel, text)

rel = "communities-crime/political-economy/app.js"
text = read(rel)
text = required_replace(
    text,
    'function setControls(ok){document.querySelectorAll(".download-map").forEach(b=>b.disabled=!ok);buildDocument.disabled=!ok;documentStatus.textContent=ok?"Ready to build your Word assignment.":"Maps must finish loading first."}',
    'function setControls(ok){buildDocument.disabled=!ok;documentStatus.textContent=ok?"Ready to build your Word assignment.":"Maps must finish loading first."}',
    "PE setControls",
)
text = required_replace(text, 'if(!e.ctrlKey)return;', 'if(!(e.ctrlKey||e.metaKey))return;', "PE Cmd zoom")
text = required_replace(
    text,
    '<button type="button" class="secondary small download-map" data-map-key="${key}" data-figure="${num}" disabled>Download PNG</button>',
    '<span class="legend-control-slot" data-legend-controls-for="${key}"></span>',
    "PE legend control slot",
)
text = required_replace(
    text,
    'document.querySelectorAll(".download-map").forEach(b=>b.addEventListener("click",()=>downloadFigure(b.dataset.mapKey,Number(b.dataset.figure))))',
    'document.querySelectorAll("[data-legend-controls-for]").forEach(slot=>{const key=slot.dataset.legendControlsFor,card=slot.closest(".figure-card"),mapHost=card?.querySelector(".map-shell"),source=card?.querySelector(".map-legend");if(!mapHost||!source)return;window.CC_LEGEND_PREVIEW?.register({key,controlsHost:slot,mapHost,render:()=>source})})',
    "PE wire legend preview",
)
text = required_replace(
    text,
    'drawExportLegend(ctx,canvas,legendForKey(key),Math.max(window.devicePixelRatio||1,1));',
    'drawExportLegend(ctx,canvas,legendForKey(key),Math.max(window.devicePixelRatio||1,1)*(window.CC_LEGEND_PREVIEW?.getScale(key)??1));',
    "PE export legend scale",
)
text = required_regex(
    text,
    r'\nasync function downloadFigure\(key,num\)\{.*?\}\nfunction blobToDataUrl',
    '\nfunction blobToDataUrl',
    "remove PE downloadFigure",
    flags=re.S,
)
write(rel, text)

# ---------------------------------------------------------------------------
# Segregation
# ---------------------------------------------------------------------------
rel = "communities-crime/segregation/index.html"
text = read(rel)
anchor = '        <p><strong>Boundary figures:</strong> Use <strong>Draw sharp</strong> for solid orange boundaries and <strong>Draw fuzzy</strong> for black zig-zag boundaries. Click to add vertices and double-click to finish. Not every neighborhood must contain either type of boundary.</p>\n'
text = required_replace(text, anchor, anchor + LEGEND_HELP, "segregation legend help")
text = text.replace("?v=20260821-5", f"?v={VERSION}")
text = required_replace(
    text,
    f'<script type="module" src="app.js?v={VERSION}"></script>',
    f'<script src="../legend-preview.js?v={VERSION}"></script>\n<script type="module" src="app.js?v={VERSION}"></script>',
    "segregation shared legend script",
)
write(rel, text)

rel = "communities-crime/segregation/app.js"
text = read(rel)
text = required_replace(
    text,
    'function setControls(ok){document.querySelectorAll(".download-map").forEach(b=>b.disabled=!ok);buildDocument.disabled=!ok;documentStatus.textContent=ok?"Ready to build your Word assignment.":"Maps must finish loading first."}',
    'function setControls(ok){buildDocument.disabled=!ok;documentStatus.textContent=ok?"Ready to build your Word assignment.":"Maps must finish loading first."}',
    "segregation setControls",
)
text = required_replace(
    text,
    '<button type="button" class="secondary small download-map" data-map-key="${key}" data-figure="${num}" disabled>Download PNG</button>',
    '<span class="legend-control-slot" data-legend-controls-for="${key}"></span>',
    "segregation legend control slot",
)
text = required_replace(
    text,
    'document.querySelectorAll(".download-map").forEach(b=>b.addEventListener("click",()=>downloadFigure(b.dataset.mapKey,Number(b.dataset.figure))));',
    'document.querySelectorAll("[data-legend-controls-for]").forEach(slot=>{const key=slot.dataset.legendControlsFor,card=slot.closest(".figure-card"),mapHost=card?.querySelector(".map-shell"),source=card?.querySelector(".map-legend");if(!mapHost||!source)return;window.CC_LEGEND_PREVIEW?.register({key,controlsHost:slot,mapHost,render:()=>source})});',
    "segregation wire legend preview",
)
text = required_replace(
    text,
    'drawExportLegend(ctx,canvas,legendTypeForKey(key),scale);',
    'drawExportLegend(ctx,canvas,legendTypeForKey(key),scale*(window.CC_LEGEND_PREVIEW?.getScale(key)??1));',
    "segregation export legend scale",
)
text = required_regex(
    text,
    r'\nasync function downloadFigure\(key,num\)\{.*?\}\nfunction blobToDataUrl',
    '\nfunction blobToDataUrl',
    "remove segregation downloadFigure",
    flags=re.S,
)
write(rel, text)

# ---------------------------------------------------------------------------
# Crime Analysis: rate maps get legend preview/size controls; incident maps do
# not have an embedded legend, so their old PNG buttons simply disappear.
# ---------------------------------------------------------------------------
rel = "communities-crime/crime-analysis/index.html"
text = read(rel)
rate_help_anchor = '        <p><strong>Keep the inference descriptive:</strong> these maps can support, complicate, or contradict your earlier predictions, but they do not show that any neighborhood characteristic caused crime.</p>\n'
text = required_replace(text, rate_help_anchor, rate_help_anchor + LEGEND_HELP, "crime rate legend help")
for key, figure in (("rate-1", "1"), ("rate-2", "2")):
    text = required_replace(
        text,
        f'<button type="button" class="secondary small download-map" data-map-key="{key}" data-figure="{figure}" disabled>Download PNG</button>',
        f'<span class="legend-control-slot" data-legend-controls-for="{key}"></span>',
        f"crime rate legend slot {key}",
    )
for key, figure in (("incident-1", "3"), ("incident-2", "4")):
    text = required_regex(
        text,
        rf'\s*<button type="button" class="secondary small download-map" data-map-key="{key}" data-figure="{figure}" disabled>Download PNG</button>',
        "",
        f"remove crime incident PNG {key}",
    )
text = text.replace("?v=20260821-5", f"?v={VERSION}")
text = required_replace(
    text,
    f'<script src="document.js?v={VERSION}"></script>',
    f'<script src="../legend-preview.js?v={VERSION}"></script>\n<script src="document.js?v={VERSION}"></script>',
    "crime shared legend script",
)
write(rel, text)

rel = "communities-crime/crime-analysis/app.js"
text = read(rel)
text = required_replace(text, '    if (!event.ctrlKey) return;', '    if (!(event.ctrlKey || event.metaKey)) return;', "crime Cmd zoom")
text = required_replace(
    text,
    '''function markReady(key) {
  mapReady.add(key);
  updateDownloadButtons();
  updateDocumentState();
}''',
    '''function registerRateLegendPreview(key) {
  const mapHost = maps[key]?.getContainer?.();
  const controlsHost = document.querySelector(`[data-legend-controls-for="${key}"]`);
  const source = document.querySelector(".crime-legend");
  if (!mapHost || !controlsHost || !source) return;
  window.CC_LEGEND_PREVIEW?.register({ key, controlsHost, mapHost, render: () => source });
}

function markReady(key) {
  mapReady.add(key);
  if (key.startsWith("rate-")) registerRateLegendPreview(key);
  updateDocumentState();
}''',
    "crime markReady legend registration",
)
text = required_regex(
    text,
    r'\nfunction updateDownloadButtons\(\) \{.*?\n\}\n',
    '\n',
    "remove crime updateDownloadButtons",
    flags=re.S,
)
text = required_replace(text, '  updateDownloadButtons();\n  updateDocumentState();', '  updateDocumentState();', "crime incident state")
text = required_replace(
    text,
    '  if (includeLegend) drawRateLegend(ctx, canvas);',
    '  if (includeLegend) drawRateLegend(ctx, canvas, window.CC_LEGEND_PREVIEW?.getScale(key) ?? 1);',
    "crime export legend scale call",
)
text = required_replace(text, 'function drawRateLegend(ctx, canvas) {', 'function drawRateLegend(ctx, canvas, sizeMultiplier = 1) {', "crime legend signature")
text = required_replace(
    text,
    '  const scale = Math.max(0.9, canvas.width / 1150);',
    '  const scale = Math.max(0.9, canvas.width / 1150) * sizeMultiplier;',
    "crime legend scale",
)
text = required_regex(
    text,
    r'\nfunction downloadBlob\(blob, filename\) \{.*?\n\}\n\nasync function downloadFigure\(button\) \{.*?\n\}\n',
    '\n',
    "remove crime PNG download helpers",
    flags=re.S,
)
text = required_replace(
    text,
    'document.querySelectorAll(".download-map").forEach(button => button.addEventListener("click", () => downloadFigure(button)));\n',
    '',
    "remove crime PNG listeners",
)
write(rel, text)

# Bump the first-party references in all changed module pages one final time.
for page in (
    "communities-crime/neighborhood-description/index.html",
    "communities-crime/social-disorganization/index.html",
    "communities-crime/political-economy/index.html",
    "communities-crime/segregation/index.html",
    "communities-crime/crime-analysis/index.html",
):
    bump_index(page)

print("Legend preview upgrade applied.")
