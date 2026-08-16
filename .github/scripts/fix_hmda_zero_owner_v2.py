from pathlib import Path
import re

app = Path('communities-crime/political-economy/app.js')
s = app.read_text()

s = s.replace('const HMDA_DATA_VERSION="20260816-hmda-alltracts-v2";', 'const HMDA_DATA_VERSION="20260816-hmda-alltracts-v3";', 1)

# Correct quintile calculation: only actual HMDA records carry finite loanrate values.
s, n = re.subn(
    r'function hmdaBreaks\(data\)\{.*?\}\nfunction evictionPositiveBreaks',
    'function hmdaBreaks(data){const v=sortedValues(data,"loanrate");let b=uniqueAscending([.2,.4,.6,.8].map(q=>quantile(v,q)));if(b.length<4)b=fallbackBreaks(v,4);return b.slice(0,4)}\nfunction evictionPositiveBreaks',
    s,
    count=1,
    flags=re.S,
)
if n != 1:
    raise SystemExit(f'Could not replace hmdaBreaks: {n}')

# No-owner features are explicitly tagged after reconstructing the omitted geometries.
expr = re.search(r'function hmdaExpression\(b\)\{.*?\}\n\nfunction renterLegendItems', s, flags=re.S)
if not expr:
    raise SystemExit('Could not find hmdaExpression')
new_expr = 'function hmdaExpression(b){return["case",["==",["get","_noOwner"],true],"#ffffff",["any",["!",["has","loanrate"]],["==",["get","loanrate"],null]],"rgba(0,0,0,0)",["step",["to-number",["get","loanrate"],-999],palettes.hmda[0],b[0],palettes.hmda[1],b[1],palettes.hmda[2],b[2],palettes.hmda[3],b[3],palettes.hmda[4]]]}\n\nfunction renterLegendItems'
s = s[:expr.start()] + new_expr + s[expr.end():]

old_popup = 'if(num(p.numownunits)===0)return `<div class="value-popup"><strong>Tract ${p.GEOID10||p.trctidfp10||""}</strong><dl><dt>Relative mortgage investment</dt><dd>No data</dd><dt>Owner-occupied units (2020)</dt><dd>0</dd></dl><small>No mortgage-investment rate can be calculated because the tract has 0 owner-occupied housing units.</small></div>`;'
new_popup = 'if(p._noOwner===true||p._noOwner==="true")return `<div class="value-popup"><strong>Tract ${p.GEOID10||p.trctidfp10||""}</strong><dl><dt>Relative mortgage investment</dt><dd>No data</dd><dt>Owner-occupied units (2020)</dt><dd>0</dd></dl><small>No mortgage-investment rate can be calculated because the tract has 0 owner-occupied housing units.</small></div>`;'
if old_popup not in s:
    raise SystemExit('Could not find old no-owner popup condition')
s = s.replace(old_popup, new_popup, 1)

layer = re.search(r'function addThematicLayer\(map,data,type,breaks\)\{.*?\}\n\nfunction createReferenceMap', s, flags=re.S)
if not layer:
    raise SystemExit('Could not find addThematicLayer')
new_layer = '''function addThematicLayer(map,data,type,breaks){
 map.addSource("thematic",{type:"geojson",data});
 let color;if(type==="renter")color=renterExpression();else if(type==="eviction")color=evictionExpression(breaks);else color=hmdaExpression(breaks);
 map.addLayer({id:"thematic-fill",type:"fill",source:"thematic",paint:{"fill-color":color,"fill-opacity":1}});
 if(type==="hmda"){
   const noOwner=featureCollection(data.features.filter(f=>f?.properties?._noOwner===true));
   ensureNoOwnerPattern(map);
   map.addSource("hmda-no-owner",{type:"geojson",data:noOwner});
   map.addLayer({id:"hmda-no-owner-hatch",type:"fill",source:"hmda-no-owner",paint:{"fill-pattern":"no-owner-hatch","fill-opacity":1}});
 }
 map.addLayer({id:"thematic-line",type:"line",source:"thematic",paint:{"line-color":"#777777","line-width":.6,"line-opacity":.72}});
 addPopup(map,"thematic-fill",type)
}

function createReferenceMap'''
s = s[:layer.start()] + new_layer + s[layer.end():]

load = re.search(r'async function loadDatasets\(slug\)\{.*?\}\nasync function loadProject', s, flags=re.S)
if not load:
    raise SystemExit('Could not find loadDatasets')
new_load = '''async function loadDatasets(slug){
 const [e,h,d]=await Promise.all([
   fetch(`${DATA_BASE}pe_evict_${slug}.geojson`,{cache:"force-cache"}),
   fetch(`${DATA_BASE}pe_hmda_${slug}.geojson?v=${HMDA_DATA_VERSION}`,{cache:"force-cache"}),
   fetch(`${DATA_BASE}pe_denials_${slug}.geojson?v=${HMDA_DATA_VERSION}`,{cache:"force-cache"})
 ]);
 if(!e.ok)throw new Error(`Eviction data for this city are not available yet (${slug}).`);
 if(!h.ok)throw new Error(`HMDA data for this city are not available yet (${slug}).`);
 if(!d.ok)throw new Error(`HMDA tract scaffold for this city is not available yet (${slug}).`);
 const [evict,hmda,scaffold]=await Promise.all([e.json(),h.json(),d.json()]);
 if(!evict?.features?.length)throw new Error("The eviction file is empty.");
 if(!hmda?.features?.length)throw new Error("The HMDA file is empty.");
 const id=f=>String(f?.properties?.GEOID10||f?.properties?.trctidfp10||"");
 const hmdaIds=new Set(hmda.features.map(id).filter(Boolean));
 const noOwner=(scaffold?.features||[]).filter(f=>{const g=id(f);return g&&!hmdaIds.has(g)}).map(f=>({type:"Feature",geometry:f.geometry,properties:{GEOID10:f?.properties?.GEOID10||f?.properties?.trctidfp10||"",trctidfp10:f?.properties?.trctidfp10||f?.properties?.GEOID10||"",loanrate:null,_noOwner:true}}));
 evictionData=evict;
 hmdaData=featureCollection([...hmda.features,...noOwner]);
}
async function loadProject'''
s = s[:load.start()] + new_load + s[load.end():]

app.write_text(s)

idx = Path('communities-crime/political-economy/index.html')
h = idx.read_text()
h, n = re.subn(r'app\.js\?v=[^"\x27]+', 'app.js?v=20260816-pe8', h, count=1)
if n != 1:
    raise SystemExit(f'Could not update cache buster: {n}')
idx.write_text(h)
