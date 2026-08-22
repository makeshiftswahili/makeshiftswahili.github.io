from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CC = ROOT / "communities-crime"
RELEASE = "20260822-1"


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel, text):
    (ROOT / rel).write_text(text, encoding="utf-8")


def sub(text, pattern, replacement, label, flags=0, count=1):
    updated, n = re.subn(pattern, replacement, text, count=count, flags=flags)
    if n != count:
        raise RuntimeError(f"{label}: expected {count} replacement(s), got {n}")
    return updated


def remove_preview_help_and_swap_script(rel):
    s = read(rel)
    s = re.sub(r'\s*<p><strong>Legend preview:</strong>.*?</p>', '', s, flags=re.S)
    s = re.sub(
        r'<script src="\.\./legend-preview\.js\?v=[^"]+"></script>',
        f'<script src="../export-legend-strip.js?v={RELEASE}"></script>',
        s,
    )
    write(rel, s)


# ---------------------------------------------------------------------------
# HTML: remove legend-preview controls/help, keep the existing web legends,
# and load the compact export legend strip renderer instead.
# ---------------------------------------------------------------------------
for rel in [
    "communities-crime/social-disorganization/index.html",
    "communities-crime/political-economy/index.html",
    "communities-crime/segregation/index.html",
    "communities-crime/crime-analysis/index.html",
]:
    remove_preview_help_and_swap_script(rel)

# Crime Analysis has static preview-control slots; remove only those slots.
rel = "communities-crime/crime-analysis/index.html"
s = read(rel)
s = re.sub(r'\s*<span class="legend-control-slot" data-legend-controls-for="rate-[12]"></span>', '', s)
write(rel, s)

# Opportunity never loaded the preview helper statically. Add the export strip
# renderer before document.js so capture code can use it.
rel = "communities-crime/opportunity/index.html"
s = read(rel)
needle = f'<script src="../dark-basemap.js?v=20260821-11"></script>\n<script src="document.js?v=20260821-11"></script>'
if needle not in s:
    needle = re.search(r'<script src="\.\./dark-basemap\.js\?v=[^"]+"></script>\n<script src="document\.js\?v=[^"]+"></script>', s)
    if not needle:
        raise RuntimeError("Opportunity script insertion point not found")
    old = needle.group(0)
    new = old.split("\n")[0] + f'\n<script src="../export-legend-strip.js?v={RELEASE}"></script>\n' + old.split("\n")[1]
    s = s.replace(old, new, 1)
else:
    s = s.replace(needle, needle.split("\n")[0] + f'\n<script src="../export-legend-strip.js?v={RELEASE}"></script>\n' + needle.split("\n")[1], 1)
write(rel, s)


# ---------------------------------------------------------------------------
# Social Disorganization: retain the slick horizontal web legends, remove the
# preview controls, and prepend a compact horizontal legend strip to exports.
# ---------------------------------------------------------------------------
rel = "communities-crime/social-disorganization/app.js"
s = read(rel)
s = s.replace(
    'mapStatus.textContent="All six maps are ready. Adjust the framing and legend previews as needed; the Word document will use the street basemap."',
    'mapStatus.textContent="All six maps are ready. Adjust the framing as needed; the Word document will use the street basemap."',
)

render_re = r'function renderSections\(\)\{.*?\nfunction sdtLegendPreviewNode\(.*?\nasync function loadDatasets'
render_new = r'''function renderSections(){const[n1,n2]=currentProject.neighborhoods,city=currentProject.city.split(",")[0];variableSections.innerHTML=variables.map((v,vi)=>`<section class="variable-section"><div class="variable-header"><div><div class="figure-number">VARIABLE ${vi+1}</div><h2>${v.title}</h2><p>Compare the spatial distribution within and immediately surrounding both neighborhoods.</p></div></div><div class="map-grid">${[n1,n2].map((n,ni)=>{const key=`${v.key}-${ni+1}`,num=figureNumber(vi,ni);return`<article class="figure-card"><div class="figure-heading"><div><span class="figure-number">Figure ${num}</span><h3>${n}</h3></div><div class="figure-controls"><div class="basemap-toggle" role="group" aria-label="Figure ${num} basemap"><button type="button" class="basemap-option active" data-map-key="${key}" data-basemap="street">Street map</button><button type="button" class="basemap-option" data-map-key="${key}" data-basemap="satellite">Satellite</button></div></div></div><div class="map-shell"><div id="map-${key}" class="map" aria-label="${v.title} map for ${n}"></div></div><p class="caption">Figure ${num}. ${v.mapTitle} – ${n}, ${city}</p></article>`}).join("")}</div></section>`).join("");document.querySelectorAll("[data-map-key][data-basemap]").forEach(b=>b.addEventListener("click",()=>setBasemap(b.dataset.mapKey,b.dataset.basemap)))}
function sdtExportLegendConfig(cfg){const labels=cfg.key==="poverty"?["<10%","10–<20%","20–<30%","30–<40%","40%+"]:cfg.key==="stability"?["<20%","20–<40%","40–<60%","60–<80%","80%+"]:["<15","15–<30","30–<50","50–<65","65+"];return{title:cfg.title,rows:[{items:cfg.colors.map((color,i)=>({color,label:labels[i]}))}],note:cfg.key==="heterogeneity"?"Higher values indicate greater racial-ethnic heterogeneity.":""}}
async function loadDatasets'''
s = sub(s, render_re, render_new, "SDT render/preview replacement", flags=re.S)

capture_re = r'async function captureMap\(key\)\{.*?\}\nfunction safe'
capture_new = r'''async function captureMap(key){const map=maps[key],cfg=configForKey(key);if(!map||!cfg)throw new Error("Map is not ready.");const previous=basemapState[key]||"street";try{if(previous!=="street"){setBasemap(key,"street");await waitForIdle(map)}else await waitForIdle(map);map.triggerRepaint();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const src=map.getCanvas();const canvas=window.CC_EXPORT_LEGEND.compose(src,sdtExportLegendConfig(cfg));const blob=await new Promise((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(new Error("Could not export map image.")),"image/png"));return{blob,width:canvas.width,height:canvas.height}}finally{if(previous!=="street")setBasemap(key,previous)}}
function safe'''
s = sub(s, capture_re, capture_new, "SDT capture replacement", flags=re.S)
write(rel, s)


# ---------------------------------------------------------------------------
# Political Economy: leave the on-page map-legend elements intact, remove the
# preview-control slot, and use compact export header legends.
# ---------------------------------------------------------------------------
rel = "communities-crime/political-economy/app.js"
s = read(rel)
s = s.replace(
    '<div class="figure-controls"><span class="legend-control-slot" data-legend-controls-for="${key}"></span></div>',
    '',
)
s = re.sub(
    r';document\.querySelectorAll\("\[data-legend-controls-for\]"\)\.forEach\(slot=>\{.*?CC_LEGEND_PREVIEW.*?\}\)\}',
    '}',
    s,
    count=1,
    flags=re.S,
)
insert = '''function peExportLegendConfig(key){const info=legendForKey(key);if(key.startsWith("eviction"))return{title:info.title,rows:[{items:info.items.map(i=>({color:i.c,label:i.t}))}],note:"Positive rates use city-specific quartiles; zero is shown separately."};const main=info.items.slice(0,5).map(i=>({color:i.c,label:i.t})),nodata=info.items[5];return{title:info.title,rows:[{items:main},{label:"No data",items:[{color:nodata.c,label:"0 owner-occupied units",hatch:true}]}],note:"City-specific quintiles of mortgage investment."}}
'''
needle = 'function drawExportSwatch'
if needle not in s:
    raise RuntimeError("PE export insertion point not found")
s = s.replace(needle, insert + needle, 1)

capture_re = r'async function captureMap\(key\)\{.*?\}\nfunction safe'
capture_new = r'''async function captureMap(key){const map=maps[key];if(!map)throw new Error("Map is not ready.");await waitForIdle(map);map.triggerRepaint();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const src=map.getCanvas();const canvas=window.CC_EXPORT_LEGEND.compose(src,peExportLegendConfig(key));const blob=await new Promise((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(new Error("Could not export map image.")),"image/png"));return{blob,width:canvas.width,height:canvas.height}}
function safe'''
s = sub(s, capture_re, capture_new, "PE capture replacement", flags=re.S)
write(rel, s)


# ---------------------------------------------------------------------------
# Segregation: preserve the existing web legends; export race alone on one row
# and use a second compact row for disadvantage or boundary annotation.
# ---------------------------------------------------------------------------
rel = "communities-crime/segregation/app.js"
s = read(rel)
s = s.replace('<span class="legend-control-slot" data-legend-controls-for="${key}"></span>', '')
s = re.sub(
    r'\n document\.querySelectorAll\("\[data-legend-controls-for\]"\)\.forEach\(slot=>\{.*?CC_LEGEND_PREVIEW.*?\}\);',
    '',
    s,
    count=1,
    flags=re.S,
)
insert = '''function segExportLegendConfig(key){const type=legendTypeForKey(key),raceItems=["white","latino","black","asian"].map(k=>({color:raceColors[k],label:raceLabels[k]})),rows=[{label:"Predominant group",items:raceItems}];if(type==="disadvantage")rows.push({label:"Disadvantage",items:[1,2,3,4,5].map(k=>({type:"dot",color:condis[k].color,label:condis[k].label.replace(" Disadvantage","")}))});if(type==="boundary")rows.push({label:"Boundary",items:[{type:"line",color:SHARP,width:3.5,label:"Sharp"},{type:"zigzag",color:FUZZY,label:"Fuzzy"}]});return{title:type==="race"?"Racial-ethnic composition":type==="disadvantage"?"Racial-ethnic composition + concentrated disadvantage":"Racial-ethnic composition + boundary annotation",rows,note:"Color opacity increases with the predominant-group share."}}
'''
needle = 'function drawExportSwatch'
if needle not in s:
    raise RuntimeError("Segregation export insertion point not found")
s = s.replace(needle, insert + needle, 1)

capture_re = r'async function captureMap\(key\)\{.*?\}\nfunction safe'
capture_new = r'''async function captureMap(key){const map=maps[key];if(!map)throw new Error("Map is not ready.");if(hasUnfinishedDrawing(key))throw new Error("Finish the active boundary line by double-clicking before exporting.");await waitForIdle(map);map.triggerRepaint();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const src=map.getCanvas();const canvas=window.CC_EXPORT_LEGEND.compose(src,segExportLegendConfig(key));const blob=await new Promise((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(new Error("Could not export map image.")),"image/png"));return{blob,width:canvas.width,height:canvas.height}}
function safe'''
s = sub(s, capture_re, capture_new, "Segregation capture replacement", flags=re.S)
write(rel, s)


# ---------------------------------------------------------------------------
# Crime Analysis: all four exported maps now get a top legend strip. Rate maps
# retain the on-page rate legend; incident maps retain the on-page incident key.
# ---------------------------------------------------------------------------
rel = "communities-crime/crime-analysis/app.js"
s = read(rel)
s = re.sub(
    r'function markReady\(key\) \{\s*mapReady\.add\(key\);\s*if \(key\.startsWith\("rate-"\)\) registerRateLegendPreview\(key\);\s*updateDocumentState\(\);\s*\}',
    'function markReady(key) {\n  mapReady.add(key);\n  updateDocumentState();\n}',
    s,
    count=1,
    flags=re.S,
)

capture_re = r'async function captureMap\(key, includeLegend\) \{.*?\n\}\n\nfunction renderRateLegendPreview'
capture_new = r'''function crimeExportLegendConfig(key){if(key.startsWith("rate-"))return{title:"City-relative violent crime rate",rows:[{items:[["Very Low","very low"],["Low","low"],["Moderate","moderate"],["High","high"],["Very High","very high"]].map(([label,k])=>({color:RATE_COLORS[k],label}))},{label:"Boundary",items:[{type:"line",color:"#111111",width:4,label:"Selected neighborhood"}]}]};const info=currentIncidentType?INCIDENT_INFO[currentIncidentType]:null;return{title:info?`${info.label} incidents, ${info.period}`:"Incident pattern",rows:[{items:[{type:"dot",color:"#e63946",label:info?.label||"Incident"},{type:"line",color:"#111111",width:4,label:"Selected neighborhood boundary"}]}]}}

async function captureMap(key) {
  const map = maps[key];
  if (!map || !mapReady.has(key)) throw new Error("That map is not ready yet.");
  await waitForIdle(map);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const src = map.getCanvas();
  const maxWidth = 1400;
  const width = Math.min(src.width, maxWidth);
  const height = Math.round(src.height * width / src.width);
  const base = document.createElement("canvas");
  base.width = width; base.height = height;
  base.getContext("2d").drawImage(src, 0, 0, width, height);
  const cssWidth = map.getContainer().getBoundingClientRect().width || width;
  const canvas = window.CC_EXPORT_LEGEND.compose(base, {...crimeExportLegendConfig(key), pixelRatio: width / cssWidth});
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not export the map image.")), "image/png"));
}

function renderRateLegendPreview'''
s = sub(s, capture_re, capture_new, "Crime capture replacement", flags=re.S)
write(rel, s)


# ---------------------------------------------------------------------------
# Opportunity: stop creating preview controls. Each of the eight exported maps
# gets a compact header strip; complex legends use two or three rows.
# ---------------------------------------------------------------------------
rel = "communities-crime/opportunity/document.js"
s = read(rel)
s = s.replace('    oppDocEnsureLegendLibrary();\n    oppDocRegisterLegendPreviews();\n', '')
insert = '''  function oppDocExportLegendConfig(key) {
    const type = oppDocLegendType(key);
    const roadItems = [...OPP_DOC_ROADS].reverse().map(item => ({ type: "line", color: item.color, width: item.width, label: item.label }));
    const landItems = OPP_DOC_LAND.map(item => ({ color: item.color, label: item.label }));
    if (type === "street") return {
      title: "Street hierarchy",
      rows: [
        { label: "Roads", items: roadItems },
        { label: "Boundary", items: [{ type: "line", color: "#2CA25F", width: 5, label: "Selected neighborhood" }] }
      ]
    };
    if (type === "landuse") return {
      title: "Street network + land use",
      rows: [
        { label: "Roads", items: roadItems },
        { label: "Building use", items: landItems },
        { label: "Boundary", items: [{ type: "line", color: "#2CA25F", width: 5, label: "Selected neighborhood" }] }
      ]
    };
    return {
      title: "Opportunity layers",
      rows: [
        { label: "Roads", items: roadItems },
        { label: "Building use", items: landItems },
        { label: "Activity", items: [
          { type: "dot", color: "#ff5ca8", label: "Bar / pub / nightclub / biergarten" },
          { type: "line", color: "#2CA25F", width: 5, label: "Selected neighborhood boundary" }
        ] }
      ]
    };
  }

'''
needle = '  async function oppDocCapture(key) {'
if needle not in s:
    raise RuntimeError("Opportunity capture insertion point not found")
s = s.replace(needle, insert + needle, 1)

capture_re = r'  async function oppDocCapture\(key\) \{.*?\n  \}\n\n  function oppDocDataUrl'
capture_new = r'''  async function oppDocCapture(key) {
    const store = oppDocMapStore();
    const map = store?.[key];
    if (!map) throw new Error(`Map ${key} is not ready.`);
    await oppDocWaitForIdle(map);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const src = map.getCanvas();
    const maxWidth = 1200;
    const width = Math.min(src.width, maxWidth);
    const height = Math.round(src.height * width / src.width);
    const base = document.createElement("canvas");
    base.width = width;
    base.height = height;
    base.getContext("2d").drawImage(src, 0, 0, width, height);
    const cssWidth = map.getContainer().getBoundingClientRect().width || width;
    const canvas = window.CC_EXPORT_LEGEND.compose(base, {...oppDocExportLegendConfig(key), pixelRatio: width / cssWidth});

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not export a map image.")), "image/png");
    });
    return { blob, width: canvas.width, height: canvas.height };
  }

  function oppDocDataUrl'''
s = sub(s, capture_re, capture_new, "Opportunity capture replacement", flags=re.S)
write(rel, s)

print("Switched exported map legends to non-overlapping horizontal header strips while retaining web-page legends.")
