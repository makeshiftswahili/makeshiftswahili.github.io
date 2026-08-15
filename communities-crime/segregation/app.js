const API_URL="https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/neighborhood-selection";
const DOC_URL="https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/segregation-assignment-doc";
const DATA_BASE="../data/";

const citySlug={NewOrleans:"neworleans",LA:"losangeles",Philadelphia:"philadelphia",Chicago:"chicago",Houston:"houston",SanFrancisco:"sanfrancisco",Atlanta:"atlanta",Milwaukee:"milwaukee",Detroit:"detroit",Denver:"denver",Seattle:"seattle"};
const dataFolderRace=new Set(["atlanta","chicago","denver","detroit","houston"]);
const raceColors={white:"#2b83ba",latino:"#4daf4a",black:"#984ea3",asian:"#e31a1c",none:"#d9d9d9"};
const raceLabels={white:"Majority White",latino:"Majority Latino",black:"Majority Black",asian:"Majority Asian",none:"No population/data"};
const condis={
  1:{label:"Very Low Disadvantage",color:"#1f78b4"},
  2:{label:"Low Disadvantage",color:"#a6cee3"},
  3:{label:"Average",color:"#ffffff"},
  4:{label:"High Disadvantage",color:"#f4a340"},
  5:{label:"Very High Disadvantage",color:"#e31a1c"}
};
const SHARP="#f28e2b",FUZZY="#111111";

const lsuId=document.getElementById("lsuId"),loadButton=document.getElementById("loadButton"),lookupMessage=document.getElementById("lookupMessage"),projectContent=document.getElementById("projectContent"),cityName=document.getElementById("cityName"),neighborhoodOne=document.getElementById("neighborhoodOne"),neighborhoodTwo=document.getElementById("neighborhoodTwo"),figureSections=document.getElementById("figureSections"),mapStatus=document.getElementById("mapStatus"),buildDocument=document.getElementById("buildDocument"),documentStatus=document.getElementById("documentStatus");

let currentProject=null,raceData=null,cityBoundary=null,condisData=null,maps={},readyMaps=new Set(),drawStates={};

function racePath(slug){return dataFolderRace.has(slug)?`${DATA_BASE}seg_${slug}.geojson`:`../../seg_${slug}.geojson`}
function cityPath(slug){return `${DATA_BASE}${slug}.geojson`}
function baseStyle(){return{version:8,sources:{osm:{type:"raster",tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,attribution:"© OpenStreetMap contributors"}},layers:[{id:"osm",type:"raster",source:"osm"}]}}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
function dominantInfo(props){
 const vals={white:num(props.gwhite20),latino:num(props.glatino20),black:num(props.gblack20),asian:num(props.gasian20)};
 const totalNamed=vals.white+vals.latino+vals.black+vals.asian;
 const other=Math.max(0,100-totalNamed);
 const pop=num(props.gpop20);
 let dominant="none",share=0;
 if(pop>0||totalNamed>0){for(const k of ["white","latino","black","asian"]){if(vals[k]>share){dominant=k;share=vals[k]}}}
 return{...vals,other,dominant,share,pop};
}
function enrichRace(data){
 data.features.forEach(f=>{const d=dominantInfo(f.properties||{});f.properties={...(f.properties||{}),_dominant:d.dominant,_dominantShare:d.share,_other:d.other}});
 return data;
}
function raceColorExpression(){return["match",["get","_dominant"],"white",raceColors.white,"latino",raceColors.latino,"black",raceColors.black,"asian",raceColors.asian,raceColors.none]}
function condisColorExpression(){return["match",["to-number",["get","dis5"]],1,condis[1].color,2,condis[2].color,3,condis[3].color,4,condis[4].color,5,condis[5].color,"#999999"]}
function setControls(ok){document.querySelectorAll(".download-map").forEach(b=>b.disabled=!ok);buildDocument.disabled=!ok;documentStatus.textContent=ok?"Ready to build your Word assignment.":"Maps must finish loading first."}
function destroyMaps(){Object.values(maps).forEach(m=>m.remove());maps={};readyMaps=new Set();drawStates={};setControls(false)}
function findFeatureByName(geojson,name){return geojson.features.find(f=>Object.values(f?.properties||{}).some(v=>String(v).trim()===name))}
function geomCoords(geometry,out=[]){const walk=v=>{if(!Array.isArray(v))return;if(typeof v[0]==="number"&&typeof v[1]==="number")out.push([v[0],v[1]]);else v.forEach(walk)};if(geometry)walk(geometry.coordinates);return out}
function bboxThing(thing){const features=thing?.type==="FeatureCollection"?thing.features:[thing];const coords=[];features.filter(Boolean).forEach(f=>geomCoords(f.geometry,coords));if(!coords.length)throw new Error("Could not determine map extent.");const xs=coords.map(v=>v[0]),ys=coords.map(v=>v[1]);return[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]}
function expandBox(b,f=.78){const w=b[2]-b[0],h=b[3]-b[1],px=Math.max(w*f,.006),py=Math.max(h*f,.006);return[b[0]-px,b[1]-py,b[2]+px,b[3]+py]}
function overlaps(a,b){return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1]}
function filteredPolygons(data,box){return{type:"FeatureCollection",features:data.features.filter(f=>{try{return overlaps(bboxThing(f),box)}catch{return false}})}}
function filteredPoints(data,box){return{type:"FeatureCollection",features:data.features.filter(f=>{const c=f?.geometry?.coordinates;return Array.isArray(c)&&c[0]>=box[0]&&c[0]<=box[2]&&c[1]>=box[1]&&c[1]<=box[3]})}}
function featureCollection(features){return{type:"FeatureCollection",features}}
function addFineZoom(map){map.scrollZoom.disable();map.getCanvas().addEventListener("wheel",e=>{if(!e.ctrlKey)return;e.preventDefault();e.stopPropagation();map.jumpTo({zoom:Math.max(0,Math.min(22,map.getZoom()+(e.deltaY<0?.08:-.08)))})},{passive:false})}
function fit(map,b,padding=22,maxZoom=14){map.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding,duration:0,maxZoom})}
function markReady(key){readyMaps.add(key);if(readyMaps.size===5){setControls(true);mapStatus.textContent="All five maps are ready. Adjust the framing, inspect block-group popups, and annotate any sharp/fuzzy boundaries before building the Word document."}}
function addRaceLayers(map,data){
 map.addSource("race",{type:"geojson",data});
 map.addLayer({id:"race-fill",type:"fill",source:"race",paint:{"fill-color":raceColorExpression(),"fill-opacity":1}});
 map.addLayer({id:"race-line",type:"line",source:"race",paint:{"line-color":"#6f6f6f","line-width":.55,"line-opacity":.8}});
}
function addNeighborhoodOutline(map,feature,prefix="nh",color="#111111",halo="#ffffff",width=3.5){
 map.addSource(prefix,{type:"geojson",data:featureCollection([feature])});
 map.addLayer({id:`${prefix}-halo`,type:"line",source:prefix,paint:{"line-color":halo,"line-width":width+3,"line-opacity":1}});
 map.addLayer({id:`${prefix}-line`,type:"line",source:prefix,paint:{"line-color":color,"line-width":width,"line-opacity":1}});
}
function popupHtml(props){
 const d=dominantInfo(props||{}),pct=v=>`${v.toFixed(1)}%`;
 return `<div class="race-popup"><strong>Block group ${props.GEOID10||props.bgidfp10||""}</strong><div class="popup-dominant">Mapped category: ${raceLabels[d.dominant]} (${pct(d.share)})</div><dl><dt>White</dt><dd>${pct(d.white)}</dd><dt>Latino</dt><dd>${pct(d.latino)}</dd><dt>Black</dt><dd>${pct(d.black)}</dd><dt>Asian</dt><dd>${pct(d.asian)}</dd><dt>Other / Multiracial</dt><dd>${pct(d.other)}</dd>${d.pop?`<dt>2020 population</dt><dd>${Math.round(d.pop).toLocaleString()}</dd>`:""}</dl><small>The mapped category is the largest of the four named groups; Other/Multiracial is reported here but is not used as a map category.</small></div>`;
}
function addRacePopup(map,key){
 map.on("mouseenter","race-fill",()=>{if(!drawStates[key]?.mode)map.getCanvas().style.cursor="pointer"});
 map.on("mouseleave","race-fill",()=>{if(!drawStates[key]?.mode)map.getCanvas().style.cursor=""});
 map.on("click","race-fill",e=>{
   if(drawStates[key]?.mode)return;
   const f=e.features?.[0];if(!f)return;
   new maplibregl.Popup({closeButton:true,maxWidth:"300px"}).setLngLat(e.lngLat).setHTML(popupHtml(f.properties||{})).addTo(map);
 });
}
function raceLegendRows(){return ["white","latino","black","asian"].map(k=>`<div class="legend-row"><span class="legend-square" style="background:${raceColors[k]}"></span><span>${raceLabels[k]}</span></div>`).join("")}
function condisLegendRows(){return [1,2,3,4,5].map(k=>`<div class="legend-row"><span class="legend-dot" style="background:${condis[k].color}"></span><span>${condis[k].label}</span></div>`).join("")}
function boundaryLegendRows(){return `<div class="legend-row"><span class="legend-sharp"></span><span>Sharp boundary</span></div><div class="legend-row"><span class="legend-fuzzy">⌁⌁⌁</span><span>Fuzzy boundary</span></div>`}
function legendMarkup(type){let extra="";if(type==="disadvantage")extra=`<div class="legend-subtitle">Concentrated Disadvantage - 2020</div>${condisLegendRows()}`;if(type==="boundary")extra=`<div class="legend-subtitle">Boundary annotation</div>${boundaryLegendRows()}`;return `<div class="map-legend"><div class="legend-title">Predominant Racial-Ethnic Group</div>${raceLegendRows()}${extra}<div class="legend-note">Click a block group for exact racial-ethnic shares.</div></div>`}
function figureCard({num,title,caption,key,type,boundary=false}){return `<article class="figure-card"><div class="figure-heading"><div><span class="figure-number">Figure ${num}</span><h3>${title}</h3></div><div class="figure-controls">${boundary?`<div class="draw-tools" data-map-key="${key}"><button type="button" class="draw-mode" data-mode="sharp">Draw sharp</button><button type="button" class="draw-mode" data-mode="fuzzy">Draw fuzzy</button><button type="button" class="secondary small draw-undo">Undo</button><button type="button" class="secondary small draw-clear">Clear</button></div>`:""}<button type="button" class="secondary small download-map" data-map-key="${key}" data-figure="${num}" disabled>Download PNG</button></div></div>${boundary?`<p class="drawing-help">Select a boundary type, click along the boundary, and double-click to finish. Sharp boundaries are solid orange; fuzzy boundaries are black zig-zag lines. Finish your framing before drawing fuzzy boundaries so the zig-zag scale stays consistent.</p>`:""}<div class="map-shell"><div id="map-${key}" class="map" aria-label="${title}"></div>${legendMarkup(type)}</div><p class="caption">${caption}</p></article>`}
function renderSections(){
 const[n1,n2]=currentProject.neighborhoods,city=currentProject.city.split(",")[0];
 figureSections.innerHTML=`
 <section class="variable-section"><div class="variable-header"><div><div class="figure-number">CITYWIDE PATTERN</div><h2>Citywide Racial-Ethnic Segregation</h2><p>Start with the city as a whole, then locate your two neighborhoods within that larger racial-spatial pattern.</p></div></div><div class="single-map-grid">${figureCard({num:1,title:`${city} citywide pattern`,caption:`Figure 1. Block Group Racial-Ethnic Composition, ${city}`,key:"citywide",type:"race"})}</div></section>
 <section class="variable-section"><div class="variable-header"><div><div class="figure-number">DIVERGENT SOCIAL WORLDS</div><h2>Racial-Ethnic Composition & Concentrated Disadvantage</h2><p>Compare racial-spatial divisions with the city-specific concentrated disadvantage categories.</p></div></div><div class="map-grid">${figureCard({num:2,title:n1,caption:`Figure 2. Racial-Ethnic Composition & Concentrated Disadvantage – ${n1}, ${city}`,key:"disadvantage-1",type:"disadvantage"})}${figureCard({num:3,title:n2,caption:`Figure 3. Racial-Ethnic Composition & Concentrated Disadvantage – ${n2}, ${city}`,key:"disadvantage-2",type:"disadvantage"})}</div></section>
 <section class="variable-section"><div class="variable-header"><div><div class="figure-number">RACIAL-ETHNIC BOUNDARIES</div><h2>Identify Sharp & Fuzzy Boundaries</h2><p>Use the popup percentages to assess transitions, then draw only the boundaries you can justify from the map.</p></div></div><div class="map-grid">${figureCard({num:4,title:n1,caption:`Figure 4. Racial-Ethnic Boundaries – ${n1}, ${city}`,key:"boundary-1",type:"boundary",boundary:true})}${figureCard({num:5,title:n2,caption:`Figure 5. Racial-Ethnic Boundaries – ${n2}, ${city}`,key:"boundary-2",type:"boundary",boundary:true})}</div></section>`;
 document.querySelectorAll(".download-map").forEach(b=>b.addEventListener("click",()=>downloadFigure(b.dataset.mapKey,Number(b.dataset.figure))));
 document.querySelectorAll(".draw-tools").forEach(tool=>wireDrawTools(tool.dataset.mapKey,tool));
}
function createCitywideMap(n1f,n2f){
 const key="citywide",map=new maplibregl.Map({container:`map-${key}`,style:baseStyle(),interactive:true,attributionControl:true,canvasContextAttributes:{preserveDrawingBuffer:true}});
 map.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-right");addFineZoom(map);
 map.on("load",()=>{
   addRaceLayers(map,raceData);
   map.addSource("city",{type:"geojson",data:cityBoundary});
   map.addLayer({id:"city-halo",type:"line",source:"city",paint:{"line-color":"#ffffff","line-width":5,"line-opacity":1}});
   map.addLayer({id:"city-line",type:"line",source:"city",paint:{"line-color":"#111111","line-width":3,"line-opacity":1}});
   addNeighborhoodOutline(map,n1f,"n1","#ffd92f","#111111",3);
   addNeighborhoodOutline(map,n2f,"n2","#ffd92f","#111111",3);
   fit(map,bboxThing(cityBoundary),30,11.5);addRacePopup(map,key);
   map.once("idle",()=>markReady(key));setTimeout(()=>{if(!readyMaps.has(key))markReady(key)},6500);
 });maps[key]=map;
}
function createNeighborhoodMap(key,feature,withDisadvantage,boundaryMode){
 const nbox=bboxThing(feature),view=expandBox(nbox,.72),localRace=filteredPolygons(raceData,view),map=new maplibregl.Map({container:`map-${key}`,style:baseStyle(),interactive:true,attributionControl:true,canvasContextAttributes:{preserveDrawingBuffer:true}});
 map.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-right");addFineZoom(map);
 map.on("load",()=>{
   addRaceLayers(map,localRace);
   if(withDisadvantage){const localCondis=filteredPoints(condisData,view);map.addSource("condis",{type:"geojson",data:localCondis});map.addLayer({id:"condis-points",type:"circle",source:"condis",paint:{"circle-radius":5.2,"circle-color":condisColorExpression(),"circle-stroke-color":"#5c5c5c","circle-stroke-width":1.3,"circle-opacity":1}})}
   addNeighborhoodOutline(map,feature,"neighborhood","#111111","#ffffff",3.5);
   if(boundaryMode)initDrawing(key,map);
   fit(map,view,18,14);addRacePopup(map,key);
   map.once("idle",()=>markReady(key));setTimeout(()=>{if(!readyMaps.has(key))markReady(key)},6500);
 });maps[key]=map;
}
function renderMaps(){
 const[n1,n2]=currentProject.neighborhoods,n1f=findFeatureByName(currentProject.geojson,n1),n2f=findFeatureByName(currentProject.geojson,n2);if(!n1f||!n2f)throw new Error("Your saved neighborhood boundaries could not be matched.");
 destroyMaps();renderSections();mapStatus.textContent="Rendering five segregation maps…";
 requestAnimationFrame(()=>{createCitywideMap(n1f,n2f);createNeighborhoodMap("disadvantage-1",n1f,true,false);createNeighborhoodMap("disadvantage-2",n2f,true,false);createNeighborhoodMap("boundary-1",n1f,false,true);createNeighborhoodMap("boundary-2",n2f,false,true)});
}
async function loadDatasets(slug){
 const [rRace,rCity,rCondis]=await Promise.all([fetch(racePath(slug),{cache:"force-cache"}),fetch(cityPath(slug),{cache:"force-cache"}),fetch("../../SEG_condis.geojson",{cache:"force-cache"})]);
 if(!rRace.ok)throw new Error("Could not load racial-ethnic composition data for your city.");if(!rCity.ok)throw new Error("Could not load the city boundary.");if(!rCondis.ok)throw new Error("Could not load concentrated disadvantage centroids.");
 const [race,city,cd]=await Promise.all([rRace.json(),rCity.json(),rCondis.json()]);raceData=enrichRace(race);cityBoundary=city;condisData=cd;
}
async function loadProject(){
 const id=lsuId.value.trim();if(id.length<4){lookupMessage.textContent="Enter a valid LSU ID.";lsuId.focus();return}loadButton.disabled=true;lookupMessage.textContent="Loading your project and segregation data…";projectContent.classList.add("is-hidden");destroyMaps();
 try{const r=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"moduleLookup",lsuId:id})});const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.error||"Could not load your project.");const slug=citySlug[p.cityKey];if(!slug)throw new Error("Your city is not configured for this module.");currentProject=p;cityName.textContent=p.city;neighborhoodOne.textContent=p.neighborhoods[0];neighborhoodTwo.textContent=p.neighborhoods[1];await loadDatasets(slug);projectContent.classList.remove("is-hidden");renderMaps();lookupMessage.textContent=""}catch(e){console.error(e);lookupMessage.textContent=e.message}finally{loadButton.disabled=false}
}

function emptyDrawFC(){return{type:"FeatureCollection",features:[]}}
function initDrawing(key,map){
 drawStates[key]={mode:null,current:[],features:[],sequence:0};
 map.addSource("annotations",{type:"geojson",data:emptyDrawFC()});
 map.addSource("drawing-preview",{type:"geojson",data:emptyDrawFC()});
 map.addLayer({id:"sharp-lines",type:"line",source:"annotations",filter:["==",["get","kind"],"sharp"],paint:{"line-color":SHARP,"line-width":4.5,"line-opacity":1}});
 map.addLayer({id:"fuzzy-lines",type:"line",source:"annotations",filter:["==",["get","kind"],"fuzzy"],paint:{"line-color":FUZZY,"line-width":2.7,"line-opacity":1}});
 map.addLayer({id:"preview-line",type:"line",source:"drawing-preview",paint:{"line-color":["case",["==",["get","kind"],"sharp"],SHARP,FUZZY],"line-width":3,"line-dasharray":[1.5,1.2],"line-opacity":1}});
 map.doubleClickZoom.disable();
 map.on("click",e=>{const s=drawStates[key];if(!s?.mode)return;s.current.push([e.lngLat.lng,e.lngLat.lat]);updatePreview(key)});
 map.on("dblclick",e=>{const s=drawStates[key];if(!s?.mode)return;e.preventDefault();finishDrawing(key)});
}
function wireDrawTools(key,tool){
 tool.querySelectorAll(".draw-mode").forEach(b=>b.addEventListener("click",()=>setDrawMode(key,b.dataset.mode)));
 tool.querySelector(".draw-undo").addEventListener("click",()=>undoDrawing(key));tool.querySelector(".draw-clear").addEventListener("click",()=>clearDrawing(key));
}
function syncDrawButtons(key){document.querySelectorAll(`.draw-tools[data-map-key="${key}"] .draw-mode`).forEach(b=>b.classList.toggle("active",b.dataset.mode===drawStates[key]?.mode))}
function setDrawMode(key,mode){const s=drawStates[key],map=maps[key];if(!s||!map)return;if(s.current.length>=2)finishDrawing(key);else{s.current=[];updatePreview(key)}s.mode=s.mode===mode?null:mode;map.getCanvas().style.cursor=s.mode?"crosshair":"";syncDrawButtons(key);mapStatus.textContent=s.mode?`Drawing ${s.mode} boundary: click to add vertices, then double-click to finish.`:"Boundary drawing paused."}
function updatePreview(key){const s=drawStates[key],map=maps[key];if(!s||!map?.getSource("drawing-preview"))return;const features=s.current.length>=2?[{type:"Feature",properties:{kind:s.mode},geometry:{type:"LineString",coordinates:s.current}}]:[];map.getSource("drawing-preview").setData(featureCollection(features))}
function zigzagCoords(map,coords){
 if(coords.length<2)return coords;const out=[];let flip=1;const step=9,amp=3.2;
 for(let si=0;si<coords.length-1;si++){
   const a=map.project(coords[si]),b=map.project(coords[si+1]),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(!len)continue;const nx=-dy/len,ny=dx/len,n=Math.max(1,Math.floor(len/step));
   for(let i=si===0?0:1;i<=n;i++){const t=i/n;let x=a.x+dx*t,y=a.y+dy*t;if(i>0&&i<n){x+=nx*amp*flip;y+=ny*amp*flip;flip*=-1}const ll=map.unproject([x,y]);out.push([ll.lng,ll.lat])}
 }
 return out.length>=2?out:coords;
}
function refreshAnnotations(key){const s=drawStates[key],map=maps[key];if(!s||!map?.getSource("annotations"))return;map.getSource("annotations").setData(featureCollection(s.features))}
function finishDrawing(key){const s=drawStates[key],map=maps[key];if(!s||!map)return;if(s.current.length>=2){const coords=s.mode==="fuzzy"?zigzagCoords(map,s.current):s.current.slice();s.features.push({type:"Feature",properties:{kind:s.mode,id:++s.sequence},geometry:{type:"LineString",coordinates:coords}});refreshAnnotations(key)}s.current=[];updatePreview(key)}
function undoDrawing(key){const s=drawStates[key];if(!s)return;if(s.current.length){s.current.pop();updatePreview(key)}else{s.features.pop();refreshAnnotations(key)}mapStatus.textContent="Last boundary edit undone."}
function clearDrawing(key){const s=drawStates[key];if(!s)return;s.current=[];s.features=[];updatePreview(key);refreshAnnotations(key);mapStatus.textContent="Boundary annotations cleared."}
function hasUnfinishedDrawing(key){return Boolean(drawStates[key]?.current?.length)}

function waitForIdle(map){return new Promise(resolve=>{let done=false;const finish=()=>{if(!done){done=true;resolve()}};map.once("idle",finish);setTimeout(finish,2500)})}
function legendTypeForKey(key){if(key==="citywide")return"race";if(key.startsWith("disadvantage"))return"disadvantage";return"boundary"}
function drawSquare(ctx,x,y,size,color){ctx.fillStyle=color;ctx.fillRect(x,y,size,size);ctx.strokeStyle="#666";ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,size-1,size-1)}
function drawDot(ctx,x,y,r,color){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.strokeStyle="#555";ctx.lineWidth=1;ctx.stroke()}
function drawZig(ctx,x,y,w){ctx.beginPath();const amp=3,step=7;ctx.moveTo(x,y);let flip=1;for(let px=x+step;px<x+w;px+=step){ctx.lineTo(px,y+amp*flip);flip*=-1}ctx.lineTo(x+w,y);ctx.strokeStyle=FUZZY;ctx.lineWidth=2;ctx.stroke()}
function drawExportLegend(ctx,canvas,type,scale){
 const s=scale,font=Math.max(10*s,10),small=Math.max(8.5*s,8.5),lineH=18*s,pad=11*s,sw=10*s;let rows=4+(type==="disadvantage"?6:type==="boundary"?3:0);const width=238*s,height=(48+rows*18+(type==="race"?8:18))*s,x=canvas.width-width-12*s,y=canvas.height-height-12*s;
 ctx.save();ctx.fillStyle="#ffffff";ctx.fillRect(x,y,width,height);ctx.strokeStyle="#c8c8c8";ctx.lineWidth=1*s;ctx.strokeRect(x+.5*s,y+.5*s,width-1*s,height-1*s);ctx.fillStyle="#222";ctx.font=`600 ${font}px Arial,sans-serif`;ctx.fillText("Predominant Racial-Ethnic Group",x+pad,y+19*s);ctx.font=`${small}px Arial,sans-serif`;let yy=y+38*s;
 for(const k of ["white","latino","black","asian"]){drawSquare(ctx,x+pad,yy-sw+2*s,sw,raceColors[k]);ctx.fillStyle="#333";ctx.fillText(raceLabels[k],x+pad+16*s,yy);yy+=lineH}
 if(type==="disadvantage"){
   yy+=5*s;ctx.font=`600 ${small}px Arial,sans-serif`;ctx.fillText("Concentrated Disadvantage - 2020",x+pad,yy);yy+=16*s;ctx.font=`${small}px Arial,sans-serif`;
   for(const k of [1,2,3,4,5]){drawDot(ctx,x+pad+5*s,yy-3*s,4.2*s,condis[k].color);ctx.fillStyle="#333";ctx.fillText(condis[k].label,x+pad+16*s,yy);yy+=lineH}
 }else if(type==="boundary"){
   yy+=5*s;ctx.font=`600 ${small}px Arial,sans-serif`;ctx.fillText("Boundary annotation",x+pad,yy);yy+=17*s;ctx.strokeStyle=SHARP;ctx.lineWidth=4*s;ctx.beginPath();ctx.moveTo(x+pad,yy-4*s);ctx.lineTo(x+pad+32*s,yy-4*s);ctx.stroke();ctx.font=`${small}px Arial,sans-serif`;ctx.fillStyle="#333";ctx.fillText("Sharp boundary",x+pad+42*s,yy);yy+=lineH;drawZig(ctx,x+pad,yy-5*s,32*s);ctx.fillStyle="#333";ctx.fillText("Fuzzy boundary",x+pad+42*s,yy)
 }
 ctx.restore();
}
async function captureMap(key){
 const map=maps[key];if(!map)throw new Error("Map is not ready.");if(hasUnfinishedDrawing(key))throw new Error("Finish the active boundary line by double-clicking before exporting.");await waitForIdle(map);map.triggerRepaint();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const src=map.getCanvas(),canvas=document.createElement("canvas");canvas.width=src.width;canvas.height=src.height;const ctx=canvas.getContext("2d");ctx.drawImage(src,0,0);const scale=Math.max(window.devicePixelRatio||1,1);drawExportLegend(ctx,canvas,legendTypeForKey(key),scale);const label="© OpenStreetMap contributors";const font=Math.max(Math.round(9*scale),9),pad=Math.round(10*scale);ctx.font=`${font}px Arial,sans-serif`;const tw=ctx.measureText(label).width;ctx.fillStyle="rgba(255,255,255,.95)";ctx.fillRect(pad,canvas.height-font-pad*2,tw+pad,font+pad);ctx.fillStyle="#333";ctx.fillText(label,pad+Math.round(pad/2),canvas.height-pad-Math.round(font*.15));const blob=await new Promise((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(new Error("Could not export map image.")),"image/png"));return{blob,width:canvas.width,height:canvas.height};
}
function safe(v){return String(v||"").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g,"_").replace(/^_+|_+$/g,"").toLowerCase()||"map"}
function downloadBlob(blob,name){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}
async function downloadFigure(key,num){const b=document.querySelector(`.download-map[data-map-key="${key}"]`);b.disabled=true;mapStatus.textContent=`Exporting Figure ${num}…`;try{const image=await captureMap(key);downloadBlob(image.blob,`${safe(lsuId.value)}_seg_figure${num}.png`);mapStatus.textContent=`Figure ${num} downloaded.`}catch(e){console.error(e);mapStatus.textContent=`Could not export Figure ${num}. ${e.message}`}finally{b.disabled=false}}
function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error("Could not encode image."));r.readAsDataURL(blob)})}
async function figureData(image,width=520){return{data:await blobToDataUrl(image.blob),width,height:Math.round(width*image.height/image.width)}}
async function logoData(){const r=await fetch("../4091logo_bw.png");if(!r.ok)throw new Error("Could not load course logo.");return blobToDataUrl(await r.blob())}
async function buildWord(){
 if(!currentProject||readyMaps.size!==5)return;for(const key of ["boundary-1","boundary-2"]){if(hasUnfinishedDrawing(key)){documentStatus.textContent="Finish any active boundary lines by double-clicking before building the document.";return}}
 setControls(false);documentStatus.textContent="Capturing five map figures and building your Word document…";
 try{const keys=["citywide","disadvantage-1","disadvantage-2","boundary-1","boundary-2"],captured=await Promise.all(keys.map(captureMap)),figures=await Promise.all(captured.map((i,idx)=>figureData(i,idx===0?570:525))),logo=await logoData();const payload={lsuId:lsuId.value.trim(),project:currentProject,logo,figures:{citywide:figures[0],disadvantageOne:figures[1],disadvantageTwo:figures[2],boundaryOne:figures[3],boundaryTwo:figures[4]}};const r=await fetch(DOC_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});if(!r.ok){const p=await r.json().catch(()=>({}));throw new Error(p.error||"Could not build the Word document.")}downloadBlob(await r.blob(),`${safe(lsuId.value)}_segregation.docx`);documentStatus.textContent="Word assignment downloaded."}catch(e){console.error(e);documentStatus.textContent=e.message}finally{setControls(true)}
}

loadButton.addEventListener("click",loadProject);lsuId.addEventListener("keydown",e=>{if(e.key==="Enter")loadProject()});buildDocument.addEventListener("click",buildWord);setControls(false);
