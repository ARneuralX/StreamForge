import { computeLayout } from "/overlay/layout.js";
import { drawRecap } from "/dashboard/recap.js";
import { applyPreviewBackground, previewBackgrounds, setPreviewFrameBackground, withPreviewBackground } from "/dashboard/preview-backgrounds.js";

const params = new URLSearchParams(location.search);
const bg = params.get("bg");
const previewBackground = Object.hasOwn(previewBackgrounds, bg) ? bg : undefined;
if (previewBackground) applyPreviewBackground(document.body, previewBackground);
let safeModeLevel=["off","reduced","minimal"].includes(params.get("safeMode"))?params.get("safeMode"):"off";
if (params.has("feed")) document.querySelector("#feed").hidden = false;
const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
let frames = new Map();
let layoutItems = [];
let themeTokens;
let recapSession;
let overlayHypeMeter=false;
function updateHype(hype){for(const frame of frames.values())frame.contentWindow?.postMessage({kind:"streamforge:hype",hype},"*");if(overlayHypeMeter){document.querySelector("#hype-meter").hidden=false;document.querySelector("#hype-value").textContent=String(hype.value);document.querySelector("#hype-progress").value=hype.value;positionFrames();}}
function applyScene(id,name=""){const canvas=document.querySelector("#canvas"),banner=document.querySelector("#scene-banner");canvas.dataset.scene=id||"";const titles={"starting-soon":"Starting Soon","be-right-back":"Be Right Back","hype-mode":"Hype Mode",ending:"Thanks for watching"};banner.textContent=titles[id]||name||"";banner.hidden=!banner.textContent;canvas.classList.remove("scene-transition");void canvas.offsetWidth;canvas.classList.add("scene-transition");setTimeout(()=>canvas.classList.remove("scene-transition"),750);positionFrames();}
const toast = document.createElement("section");
toast.className = "feed overlay-toast"; toast.hidden = true; toast.setAttribute("role", "alert"); document.querySelector("#canvas").append(toast);
function positionFrames() {
  const scale = Math.min(innerWidth / 1920, innerHeight / 1080);
  positionHudPanels();
  const zones = [...document.querySelectorAll("#badge,#remix-hint,#runner-hint,#hype-meter,#up-next,#feed,#simulated-badge,#scene-banner,.overlay-toast")].filter(isVisible).map((element) => hudZone(element, scale));
  for (const position of computeLayout(layoutItems, { zones })) {
    const frame = frames.get(position.id); if (!frame) continue;
    frame.style.left = `${position.x * scale}px`; frame.style.top = `${position.y * scale}px`;
    frame.style.width = `${position.width * scale}px`; frame.style.height = `${position.height * scale}px`;
  }
}
function isVisible(element) { const style=getComputedStyle(element);return !element.hidden&&style.display!=="none"&&style.visibility!=="hidden"; }
function hudZone(element,scale) { const rect=element.getBoundingClientRect(),padding=10;const left=Math.max(0,rect.left/scale-padding),top=Math.max(0,rect.top/scale-padding),right=Math.min(1920,rect.right/scale+padding),bottom=Math.min(1080,rect.bottom/scale+padding);return{x:left,y:top,width:Math.max(0,right-left),height:Math.max(0,bottom-top)}; }
function positionHudPanels() {
  const feed=document.querySelector("#feed"),upNext=document.querySelector("#up-next"),toast=document.querySelector(".overlay-toast");
  if(innerWidth>700){for(const panel of [feed,upNext,toast])if(panel)panel.style.bottom="";if(upNext)upNext.style.top="";return;}
  let bottom=20;
  if(upNext)upNext.style.top="auto";
  for(const panel of [feed,upNext,toast])if(panel&&isVisible(panel)){panel.style.bottom=`${bottom}px`;bottom+=panel.getBoundingClientRect().height+12;}else if(panel)panel.style.bottom="";
}
async function load() {
 try {
  const data = await (await fetch("/api/state")).json();
  if(params.get("recap")==="1"){const history=await(await fetch("/api/sessions")).json();recapSession=history.current||history.sessions?.[0]||{requests:0,liveBuilds:0,uniqueChatters:0,hypeSeries:[],topContributors:[]};document.querySelector("#canvas").classList.add("recap-mode");document.querySelector("#recap-overlay").hidden=false;document.querySelector("#widgets").hidden=true;drawRecap(document.querySelector("#recap-canvas"),recapSession,data.settings.themeTokens,"landscape");return;}
  themeTokens=data.settings.themeTokens;
  document.body.dataset.safeMode=data.settings.safeMode||"off";if(data.settings.activeScene)applyScene(data.settings.activeScene);
  overlayHypeMeter=data.settings.overlayHypeMeter===true;document.querySelector("#hype-meter").hidden=!overlayHypeMeter;if(data.hype)updateHype(data.hype);
  if(!["off","reduced","minimal"].includes(params.get("safeMode")))safeModeLevel=data.settings.safeMode||"off";
  const mode=data.settings.buildMode;
  document.querySelector("#badge").textContent=mode==="replay"?"DEMO MODE · recorded build":mode==="codex"?"LIVE BUILD MODE":"MOCK MODE · simulated events";
  const region = document.querySelector("#widgets"); region.replaceChildren(); frames = new Map();
  layoutItems = data.widgets.filter((item)=>item.enabled);
  for (const widget of layoutItems) {
    const frame = document.createElement("iframe");
    frame.className = "widget-frame"; frame.title = widget.title;
    frame.setAttribute("sandbox", "allow-scripts"); const frameUrl=`/widgets/frame.html?id=${encodeURIComponent(widget.id)}`;frame.src=previewBackground?withPreviewBackground(frameUrl,previewBackground):frameUrl;if(previewBackground)setPreviewFrameBackground(frame,previewBackground);
    frame.addEventListener("load",async()=>{if(themeTokens)frame.contentWindow?.postMessage({kind:"streamforge:theme",tokens:themeTokens},"*");frame.contentWindow?.postMessage({kind:"streamforge:safe-mode",level:safeModeLevel},"*");if(data.hype)frame.contentWindow?.postMessage({kind:"streamforge:hype",hype:data.hype},"*");try{const saved=await(await fetch(`/api/widgets/${encodeURIComponent(widget.id)}/storage`)).json();frame.contentWindow?.postMessage({kind:"streamforge:storage:init",storage:saved.storage||{}},"*");}catch{/* widgets keep their safe defaults if storage is unavailable */}});
    region.append(frame); frames.set(widget.id, frame);
  }
  const queued = data.requests.filter((item)=>item.status === "queued").sort((a,b)=>(b.votes||0)-(a.votes||0)).slice(0,3);
  const card=document.querySelector("#up-next");card.hidden=queued.length===0;
  document.querySelector("#up-next-list").innerHTML=queued.map((item)=>`<li>${escapeText(item.text)} <b>· ${item.votes||0} votes</b></li>`).join("");
  positionFrames();
 } catch {
   const region = document.querySelector("#widgets"); region.replaceChildren();
   const card = document.createElement("section"); card.className = "feed"; card.setAttribute("role", "alert"); card.textContent = "The overlay could not load. Check that StreamForge is running, then refresh this browser source."; region.append(card);
 }
}
function escapeText(value) { const element=document.createElement("span");element.textContent=String(value);return element.innerHTML; }
addEventListener("resize", positionFrames);
load();
fetch("/api/demo/status").then(response=>response.json()).then(status=>{document.querySelector("#simulated-badge").hidden=!status.active;positionFrames();}).catch(()=>{});
socket.addEventListener("message", (event) => {
  let message; try { message = JSON.parse(event.data); } catch { return; }
  if (message.type === "event") {
    for (const frame of frames.values()) frame.contentWindow?.postMessage({kind:"streamforge:event",event:message.event},"*");
  }
  if(message.type==="theme"){themeTokens=message.tokens;if(recapSession)drawRecap(document.querySelector("#recap-canvas"),recapSession,themeTokens,"landscape");for(const frame of frames.values())frame.contentWindow?.postMessage({kind:"streamforge:theme",tokens:themeTokens},"*");}
  if(message.type==="safeMode"){safeModeLevel=message.level;document.body.dataset.safeMode=safeModeLevel;for(const frame of frames.values())frame.contentWindow?.postMessage({kind:"streamforge:safe-mode",level:safeModeLevel},"*");}
  if(message.type==="scene"&&message.scene)applyScene(message.scene.id,message.scene.name);
  if(message.type==="demoStatus"){document.querySelector("#simulated-badge").hidden=!message.active;positionFrames();}
  if(message.type==="hype")updateHype(message.hype);
  if(message.type==="hypeSettings"&&message.settings){overlayHypeMeter=message.settings.overlayMeter===true;document.querySelector("#hype-meter").hidden=!overlayHypeMeter;positionFrames();}
  if (message.type === "widgets") load();
  if (message.type === "event" && document.querySelector("#feed").hidden === false) {
    const item=document.createElement("div");item.className="feed-item";item.textContent=`${message.event.simulated?"SIMULATED · ":""}${message.event.type} event received`;document.querySelector("#feed-items").prepend(item);positionFrames();
  }
  if (message.type === "buildFeed" && document.querySelector("#feed").hidden === false) {
    const labels={Received:10,Approved:20,Planning:35,"Writing code":55,"Safety checks":80,Live:100,"Rolled back":100};
    const item=document.createElement("div");item.className="feed-item";
    const elapsed=Math.max(0,Math.floor((Date.now()-Date.parse(message.request.createdAt))/1000));
    const checks=message.checks?`<div class="small">${Object.entries(message.checks).map(([name,ok])=>`${ok?"✓":"○"} ${escapeText(({syntax:"Syntax",network:"No network access",forbiddenApis:"No forbidden APIs",mockMount:"Mounts without errors"})[name]||name)}`).join(" · ")}</div>`:"";
    item.innerHTML=`<strong>${message.request.simulated?"SIMULATED · ":""}${escapeText(message.request.text)}</strong><br><span>${escapeText(message.request.requester)} · ${escapeText(message.stage)} · ${elapsed}s</span><div>${escapeText(message.detail)}</div>${checks}<div class="progress"><i style="width:${labels[message.stage]||15}%"></i></div>`;
    document.querySelector("#feed-items").prepend(item);positionFrames();
  }
  if (message.type === "draftPreview" && document.querySelector("#feed").hidden === false) {
    const item=document.createElement("div");item.className="feed-item";item.textContent=`Now building · ${message.request?.text||"Safe draft"} · Preview - not live yet`;
    const frame=document.createElement("iframe");frame.className="draft-thumbnail";frame.title="Preview - not live yet";frame.setAttribute("sandbox","allow-scripts");frame.src=message.url;item.append(frame);document.querySelector("#feed-items").prepend(item);
  }
  if (message.type === "request" || message.type === "queue") load();
});
window.addEventListener("message", async (event) => {
  const message = event.data;
  if(message?.kind==="streamforge:storage:set"){
    const widgetId=[...frames.entries()].find(([,frame])=>frame.contentWindow===event.source)?.[0];
    if(!widgetId||widgetId!==message.id)return;
    await fetch(`/api/widgets/${encodeURIComponent(widgetId)}/storage`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({key:message.key,value:message.value})}).catch(()=>{});
    return;
  }
  if(message?.kind==="streamforge:moment"){
    const widgetId=[...frames.entries()].find(([,frame])=>frame.contentWindow===event.source)?.[0];
    if(!widgetId||widgetId!==message.id)return;
    await fetch(`/api/widgets/${encodeURIComponent(widgetId)}/moment`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:message.moment?.kind})});
    return;
  }
  if (!message || message.kind !== "streamforge:runtime-error") return;
  const frame = frames.get(message.id);
  if (!frame || event.source !== frame.contentWindow) return;
  frame.remove(); frames.delete(message.id);
  const response = await fetch(`/api/widgets/${encodeURIComponent(message.id)}/runtime-error`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ detail: String(message.detail || "").slice(0, 180) }) });
  const result = await response.json().catch(() => ({}));
  toast.hidden = false; toast.replaceChildren();positionFrames();
  const text = document.createElement("p"); text.textContent = result.message || "A widget stopped after a runtime error."; toast.append(text);
  const undo = document.createElement("button"); undo.textContent = "Undo widget"; undo.setAttribute("aria-label", `Undo ${message.id}`); undo.onclick = async () => {
    const restored = await fetch(`/api/widgets/${encodeURIComponent(message.id)}/undo`, { method: "POST" });
    if (restored.ok) { await fetch(`/api/widgets/${encodeURIComponent(message.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: true }) }); toast.textContent = "Previous widget version restored."; }
    else toast.textContent = (await restored.json()).error || "No earlier version is available.";
  }; toast.append(undo);positionFrames();
});
