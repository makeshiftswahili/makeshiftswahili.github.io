from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
RELEASE = "20260821-9"


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel, text):
    (ROOT / rel).write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f"Expected text not found: {label}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Shared legend preview helper: support exact, rerendered previews rather than
# CSS-scaling an approximate DOM legend.
# ---------------------------------------------------------------------------
rel = "communities-crime/legend-preview.js"
s = read(rel)

s = replace_once(
    s,
    '''    .cc-legend-preview-overlay.is-hidden { display: none !important; }\n''',
    '''    .cc-legend-preview-overlay.is-hidden { display: none !important; }\n    .cc-legend-preview-overlay.cc-legend-preview-raw {\n      right: 0;\n      bottom: 0;\n      max-width: none;\n    }\n    .cc-legend-preview-overlay.cc-legend-preview-raw > * { display: block; }\n''',
    "raw preview CSS",
)

s = replace_once(
    s,
    '''  function makeLegendNode(render) {\n    const value = typeof render === "function" ? render() : render;\n''',
    '''  function makeLegendNode(render, scale = 1) {\n    const value = typeof render === "function" ? render(scale) : render;\n''',
    "scaled renderer",
)

s = replace_once(
    s,
    '''      entries.set(key, { key, scaleIndex: 1, visible: false, render: null, overlay: null, label: null, minus: null, plus: null, toggle: null });\n''',
    '''      entries.set(key, { key, scaleIndex: 1, visible: false, render: null, overlay: null, label: null, minus: null, plus: null, toggle: null, raw: false, rerenderOnScale: false });\n''',
    "legend state fields",
)

s = replace_once(
    s,
    '''    if (entry.overlay) {\n      entry.overlay.style.transform = `scale(${scale})`;\n      entry.overlay.classList.toggle("is-hidden", !entry.visible);\n    }\n''',
    '''    if (entry.overlay) {\n      entry.overlay.style.transform = entry.rerenderOnScale ? "none" : `scale(${scale})`;\n      entry.overlay.classList.toggle("is-hidden", !entry.visible);\n    }\n''',
    "rerender scale state",
)

s = replace_once(
    s,
    '''  function refresh(key) {\n    const entry = entries.get(key);\n    if (!entry?.overlay || !entry.render) return;\n    const card = entry.overlay.querySelector(".cc-legend-preview-card");\n    if (!card) return;\n    card.replaceChildren(makeLegendNode(entry.render));\n    applyState(entry);\n  }\n\n  function register({ key, controlsHost, mapHost, render, bare = false, defaultScaleIndex = 1 }) {\n''',
    '''  function refresh(key) {\n    const entry = entries.get(key);\n    if (!entry?.overlay || !entry.render) return;\n    const scale = SCALE_STEPS[entry.scaleIndex];\n    if (entry.raw) {\n      entry.overlay.replaceChildren(makeLegendNode(entry.render, scale));\n    } else {\n      const card = entry.overlay.querySelector(".cc-legend-preview-card");\n      if (!card) return;\n      card.replaceChildren(makeLegendNode(entry.render, scale));\n    }\n    applyState(entry);\n  }\n\n  function register({ key, controlsHost, mapHost, render, bare = false, raw = false, rerenderOnScale = false, defaultScaleIndex = 1 }) {\n''',
    "refresh and register signature",
)

s = replace_once(
    s,
    '''    entry.render = render;\n    entry.scaleIndex = Math.max(0, Math.min(SCALE_STEPS.length - 1, previous?.scaleIndex ?? defaultScaleIndex));\n    entry.visible = previous?.visible ?? false;\n\n    mapHost.classList.add("cc-legend-preview-host");\n    const overlay = document.createElement("div");\n    overlay.className = "cc-legend-preview-overlay is-hidden";\n    overlay.dataset.legendPreviewKey = key;\n    overlay.setAttribute("aria-hidden", "true");\n    const card = document.createElement("div");\n    card.className = `cc-legend-preview-card${bare ? " cc-bare" : ""}`;\n    card.appendChild(makeLegendNode(render));\n    overlay.appendChild(card);\n    mapHost.appendChild(overlay);\n''',
    '''    entry.render = render;\n    entry.raw = raw;\n    entry.rerenderOnScale = rerenderOnScale;\n    entry.scaleIndex = Math.max(0, Math.min(SCALE_STEPS.length - 1, previous?.scaleIndex ?? defaultScaleIndex));\n    entry.visible = previous?.visible ?? false;\n\n    mapHost.classList.add("cc-legend-preview-host");\n    const overlay = document.createElement("div");\n    overlay.className = `cc-legend-preview-overlay is-hidden${raw ? " cc-legend-preview-raw" : ""}`;\n    overlay.dataset.legendPreviewKey = key;\n    overlay.setAttribute("aria-hidden", "true");\n    const initialScale = SCALE_STEPS[entry.scaleIndex];\n    if (raw) {\n      overlay.appendChild(makeLegendNode(render, initialScale));\n    } else {\n      const card = document.createElement("div");\n      card.className = `cc-legend-preview-card${bare ? " cc-bare" : ""}`;\n      card.appendChild(makeLegendNode(render, initialScale));\n      overlay.appendChild(card);\n    }\n    mapHost.appendChild(overlay);\n''',
    "raw preview construction",
)

s = replace_once(
    s,
    '''    minus.addEventListener("click", () => {\n      if (entry.scaleIndex > 0) entry.scaleIndex -= 1;\n      applyState(entry);\n    });\n    plus.addEventListener("click", () => {\n      if (entry.scaleIndex < SCALE_STEPS.length - 1) entry.scaleIndex += 1;\n      applyState(entry);\n    });\n''',
    '''    minus.addEventListener("click", () => {\n      if (entry.scaleIndex > 0) entry.scaleIndex -= 1;\n      if (entry.rerenderOnScale) refresh(key); else applyState(entry);\n    });\n    plus.addEventListener("click", () => {\n      if (entry.scaleIndex < SCALE_STEPS.length - 1) entry.scaleIndex += 1;\n      if (entry.rerenderOnScale) refresh(key); else applyState(entry);\n    });\n''',
    "rerender buttons",
)
write(rel, s)


# ---------------------------------------------------------------------------
# Shared map attribution: move credits off the map surface instead of deleting
# required credits. Suppress library attribution controls and add one legible
# source line adjacent to each map section.
# ---------------------------------------------------------------------------
rel = "communities-crime/dark-basemap.js"
s = read(rel)

s = replace_once(
    s,
    '''        const nextOptions = { ...options, style: patched.style };\n        if (patched.blankStyle && options.attributionControl === false) {\n          nextOptions.attributionControl = true;\n        }\n        super(nextOptions);\n''',
    '''        const nextOptions = { ...options, style: patched.style, attributionControl: false };\n        super(nextOptions);\n''',
    "disable on-map MapLibre attribution",
)

marker = '''  function installPageEnhancements() {\n    installMapHelpText();\n    installSegregationPalette();\n    installProjectPasswordCompatibility();\n  }\n'''
replacement = '''  function installOffMapAttribution() {\n    if (!document.getElementById("cc-map-credit-style")) {\n      const style = document.createElement("style");\n      style.id = "cc-map-credit-style";\n      style.textContent = `\n        .maplibregl-ctrl-attrib, .leaflet-control-attribution { display: none !important; }\n        .cc-map-source-note {\n          margin: 10px 0 0;\n          color: #9f9f9f;\n          font-size: .78rem;\n          line-height: 1.4;\n        }\n        .cc-map-source-note a { color: #bdbdbd; text-decoration: underline; text-underline-offset: 2px; }\n      `;\n      document.head.appendChild(style);\n    }\n\n    const creditHtml = 'Map/data credits: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>. Basemap tiles where used: <a href="https://stadiamaps.com/" target="_blank" rel="noopener noreferrer">Stadia Maps</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a>. Satellite imagery where shown: © Esri.';\n\n    const placeCredits = () => {\n      const containers = new Set();\n      document.querySelectorAll(".map, .leaflet-container, .maplibregl-map").forEach(mapNode => {\n        const container = mapNode.closest(".variable-section, .stage-panel, .panel");\n        if (container) containers.add(container);\n      });\n      containers.forEach(container => {\n        if (container.querySelector(":scope > .cc-map-source-note")) return;\n        const note = document.createElement("p");\n        note.className = "cc-map-source-note";\n        note.innerHTML = creditHtml;\n        container.appendChild(note);\n      });\n    };\n\n    placeCredits();\n    const observer = new MutationObserver(placeCredits);\n    observer.observe(document.body, { childList: true, subtree: true });\n  }\n\n  function installPageEnhancements() {\n    installMapHelpText();\n    installSegregationPalette();\n    installProjectPasswordCompatibility();\n    installOffMapAttribution();\n  }\n'''
s = replace_once(s, marker, replacement, "off-map attribution installer")
write(rel, s)


# ---------------------------------------------------------------------------
# Social Disorganization: preview the exact export legend footprint and remove
# the manually burned-in OSM text from the map image.
# ---------------------------------------------------------------------------
rel = "communities-crime/social-disorganization/app.js"
s = read(rel)
old_reg = '''window.CC_LEGEND_PREVIEW?.register({key,controlsHost:slot,mapHost,bare:true,render:()=>{const img=document.createElement("img");img.src=`${DATA_BASE}${cfg.legend}`;img.alt=`${cfg.title} legend`;return img}})'''
new_reg = '''window.CC_LEGEND_PREVIEW?.register({key,controlsHost:slot,mapHost,raw:true,rerenderOnScale:true,render:scale=>sdtLegendPreviewNode(key,scale)})'''
s = replace_once(s, old_reg, new_reg, "SDT exact preview registration")

insert_before = '''async function loadDatasets(slug){'''
preview_fn = '''function sdtLegendPreviewNode(key,sizeMultiplier=1){const cfg=configForKey(key),legendScale=1.25*sizeMultiplier,targetW=118*legendScale,pad=12*legendScale,outer=document.createElement("div"),box=document.createElement("div"),img=document.createElement("img");outer.style.cssText=`box-sizing:border-box;padding:0 ${pad}px ${pad}px 0`;box.style.cssText=`box-sizing:border-box;display:block;background:rgba(255,255,255,.96);padding:${pad}px 0 0 ${pad}px`;img.src=`${DATA_BASE}${cfg.legend}`;img.alt=`${cfg.title} legend`;img.style.cssText=`display:block;width:${targetW}px;height:auto;max-width:none;max-height:none`;box.appendChild(img);outer.appendChild(box);return outer}\n'''
s = replace_once(s, insert_before, preview_fn + insert_before, "SDT preview renderer")

s, count = re.subn(r'const label="© OpenStreetMap contributors";const font=.*?ctx\.fillText\(label,pad\+Math\.round\(pad/2\),canvas\.height-pad-Math\.round\(font\*\.15\)\);', '', s, count=1)
if count != 1:
    raise RuntimeError("Expected SDT burned attribution block not found")
write(rel, s)


# ---------------------------------------------------------------------------
# Political Economy: render the same canvas legend used by the export.
# ---------------------------------------------------------------------------
rel = "communities-crime/political-economy/app.js"
s = read(rel)
old_reg = '''window.CC_LEGEND_PREVIEW?.register({key,controlsHost:slot,mapHost,render:()=>source})'''
new_reg = '''window.CC_LEGEND_PREVIEW?.register({key,controlsHost:slot,mapHost,raw:true,rerenderOnScale:true,render:scale=>renderExportLegendPreview(key,scale)})'''
s = replace_once(s, old_reg, new_reg, "PE exact preview registration")
needle = '''async function captureMap(key){'''
fn = '''function renderExportLegendPreview(key,sizeMultiplier=1){const info=legendForKey(key),s=sizeMultiplier*1.25,width=235*s,height=(46+info.items.length*17+20)*s,edge=12*s,canvas=document.createElement("canvas");canvas.width=Math.ceil(width+edge);canvas.height=Math.ceil(height+edge);drawExportLegend(canvas.getContext("2d"),canvas,info,sizeMultiplier);canvas.style.width=`${canvas.width}px`;canvas.style.height=`${canvas.height}px`;return canvas}\n'''
s = replace_once(s, needle, fn + needle, "PE preview renderer")
write(rel, s)


# ---------------------------------------------------------------------------
# Segregation: same export canvas legend in the preview.
# ---------------------------------------------------------------------------
rel = "communities-crime/segregation/app.js"
s = read(rel)
old_reg = '''window.CC_LEGEND_PREVIEW?.register({key,controlsHost:slot,mapHost,render:()=>source})'''
new_reg = '''window.CC_LEGEND_PREVIEW?.register({key,controlsHost:slot,mapHost,raw:true,rerenderOnScale:true,render:scale=>renderExportLegendPreview(key,scale)})'''
s = replace_once(s, old_reg, new_reg, "segregation exact preview registration")
needle = '''async function captureMap(key){'''
fn = '''function renderExportLegendPreview(key,sizeMultiplier=1){const type=legendTypeForKey(key),s=sizeMultiplier*1.25,rows=4+(type==="disadvantage"?6:type==="boundary"?3:0),width=210*s,height=(55+rows*16+(type==="race"?8:18))*s,edge=10*s,canvas=document.createElement("canvas");canvas.width=Math.ceil(width+edge);canvas.height=Math.ceil(height+edge);drawExportLegend(canvas.getContext("2d"),canvas,type,sizeMultiplier);canvas.style.width=`${canvas.width}px`;canvas.style.height=`${canvas.height}px`;return canvas}\n'''
s = replace_once(s, needle, fn + needle, "segregation preview renderer")
write(rel, s)


# ---------------------------------------------------------------------------
# Crime Analysis rate maps: account for the export's 1400px cap and render the
# exact exported legend at the corresponding live-map footprint.
# ---------------------------------------------------------------------------
rel = "communities-crime/crime-analysis/app.js"
s = read(rel)
old = '''  const source = document.querySelector(".crime-legend");\n  if (!mapHost || !controlsHost || !source) return;\n  window.CC_LEGEND_PREVIEW?.register({ key, controlsHost, mapHost, render: () => source });\n'''
new = '''  if (!mapHost || !controlsHost) return;\n  window.CC_LEGEND_PREVIEW?.register({ key, controlsHost, mapHost, raw: true, rerenderOnScale: true, render: scale => renderRateLegendPreview(key, scale) });\n'''
s = replace_once(s, old, new, "crime exact preview registration")

s = replace_once(
    s,
    '''function drawRateLegend(ctx, canvas, sizeMultiplier = 1) {\n  const scale = Math.max(0.9, canvas.width / 1150) * sizeMultiplier;\n''',
    '''function drawRateLegend(ctx, canvas, sizeMultiplier = 1, forcedScale = null) {\n  const scale = forcedScale ?? (Math.max(0.9, canvas.width / 1150) * sizeMultiplier);\n''',
    "crime forced legend scale",
)

needle = '''function drawRateLegend(ctx, canvas, sizeMultiplier = 1, forcedScale = null) {'''
# Add renderer immediately before the draw function so its declaration is easy to audit.
renderer = '''function renderRateLegendPreview(key,sizeMultiplier=1){const map=maps[key];if(!map)return document.createElement("span");const src=map.getCanvas(),exportWidth=Math.min(src.width,1400),legendScale=Math.max(.9,exportWidth/1150)*sizeMultiplier,width=290*legendScale,height=184*legendScale,edge=12*legendScale,canvas=document.createElement("canvas");canvas.width=Math.ceil(width+edge);canvas.height=Math.ceil(height+edge);drawRateLegend(canvas.getContext("2d"),canvas,sizeMultiplier,legendScale);const liveWidth=map.getContainer().getBoundingClientRect().width||1,factor=liveWidth/exportWidth;canvas.style.width=`${canvas.width*factor}px`;canvas.style.height=`${canvas.height*factor}px`;return canvas}\n\n'''
s = replace_once(s, needle, renderer + needle, "crime exact preview renderer")
write(rel, s)


# ---------------------------------------------------------------------------
# Opportunity: render the actual export legend (all eight maps) and account for
# the 1200px export cap rather than approximating it with a DOM legend.
# ---------------------------------------------------------------------------
rel = "communities-crime/opportunity/document.js"
s = read(rel)
old = '''      window.CC_LEGEND_PREVIEW.register({\n        key,\n        controlsHost,\n        mapHost,\n        render: () => oppDocPreviewLegend(oppDocLegendType(key))\n      });\n'''
new = '''      window.CC_LEGEND_PREVIEW.register({\n        key,\n        controlsHost,\n        mapHost,\n        raw: true,\n        rerenderOnScale: true,\n        render: scale => oppDocRenderLegendPreview(key, scale)\n      });\n'''
s = replace_once(s, old, new, "Opportunity exact preview registration")

s = replace_once(
    s,
    '''  function oppDocDrawLegend(ctx, canvas, type, sizeMultiplier = 1) {\n    const s = Math.max(0.92, canvas.width / 1100) * sizeMultiplier;\n''',
    '''  function oppDocDrawLegend(ctx, canvas, type, sizeMultiplier = 1, forcedScale = null) {\n    const s = forcedScale ?? (Math.max(0.92, canvas.width / 1100) * sizeMultiplier);\n''',
    "Opportunity forced legend scale",
)

needle = '''  function oppDocDrawLegend(ctx, canvas, type, sizeMultiplier = 1, forcedScale = null) {'''
renderer = '''  function oppDocRenderLegendPreview(key, sizeMultiplier = 1) {\n    const store = oppDocMapStore();\n    const map = store?.[key];\n    if (!map) return document.createElement("span");\n    const src = map.getCanvas();\n    const exportWidth = Math.min(src.width, 1200);\n    const type = oppDocLegendType(key);\n    const s = Math.max(0.92, exportWidth / 1100) * sizeMultiplier;\n    const rows = type === "street" ? 5 : type === "landuse" ? 10 : 11;\n    const width = 315 * s;\n    const height = (50 + rows * 21) * s;\n    const edge = 12 * s;\n    const canvas = document.createElement("canvas");\n    canvas.width = Math.ceil(width + edge);\n    canvas.height = Math.ceil(height + edge);\n    oppDocDrawLegend(canvas.getContext("2d"), canvas, type, sizeMultiplier, s);\n    const liveWidth = map.getContainer().getBoundingClientRect().width || 1;\n    const factor = liveWidth / exportWidth;\n    canvas.style.width = `${canvas.width * factor}px`;\n    canvas.style.height = `${canvas.height * factor}px`;\n    return canvas;\n  }\n\n'''
s = replace_once(s, needle, renderer + needle, "Opportunity preview renderer")
s = s.replace('../legend-preview.js?v=20260821-8', f'../legend-preview.js?v={RELEASE}')
write(rel, s)

print("Patched exact legend previews, moved map attribution off-map, and removed the SDT burned attribution label.")
