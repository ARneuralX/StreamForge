import { computeLayout } from "/overlay/layout.js";

const params = new URLSearchParams(location.search);
const bg = params.get("bg");
const backgrounds = { dark: "#17151f", bright: "#f5f5f5", green: "#00ff00", transparent: "transparent" };
if (bg === "checker") document.body.style.backgroundImage = "conic-gradient(#777 25%, #fff 0 50%, #777 0 75%, #fff 0) 0 / 24px 24px";
else if (backgrounds[bg]) document.body.style.background = backgrounds[bg];
if (params.has("feed")) document.querySelector("#feed").hidden = false;
const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
let frames = new Map();
let layoutItems = [];
let themeTokens;
const toast = document.createElement("section");
toast.className = "feed"; toast.hidden = true; toast.setAttribute("role", "alert"); document.querySelector("#canvas").append(toast);
function positionFrames() {
  const scale = Math.min(innerWidth / 1920, innerHeight / 1080);
  for (const position of computeLayout(layoutItems)) {
    const frame = frames.get(position.id); if (!frame) continue;
    frame.style.left = `${position.x * scale}px`; frame.style.top = `${position.y * scale}px`;
    frame.style.width = `${position.width * scale}px`; frame.style.height = `${position.height * scale}px`;
  }
}
async function load() {
 try {
  const data = await (await fetch("/api/state")).json();
  themeTokens=data.settings.themeTokens;
  const mode=data.settings.buildMode;
  document.querySelector("#badge").textContent=mode==="replay"?"DEMO MODE · recorded build":mode==="codex"?"LIVE BUILD MODE":"MOCK MODE · simulated events";
  const region = document.querySelector("#widgets"); region.replaceChildren(); frames = new Map();
  layoutItems = data.widgets.filter((item)=>item.enabled);
  for (const widget of layoutItems) {
    const frame = document.createElement("iframe");
    frame.className = "widget-frame"; frame.title = widget.title;
    frame.setAttribute("sandbox", "allow-scripts"); frame.src = `/widgets/frame.html?id=${encodeURIComponent(widget.id)}`;
    frame.addEventListener("load",async()=>{if(themeTokens)frame.contentWindow?.postMessage({kind:"streamforge:theme",tokens:themeTokens},"*");try{const saved=await(await fetch(`/api/widgets/${encodeURIComponent(widget.id)}/storage`)).json();frame.contentWindow?.postMessage({kind:"streamforge:storage:init",storage:saved.storage||{}},"*");}catch{/* widgets keep their safe defaults if storage is unavailable */}});
    region.append(frame); frames.set(widget.id, frame);
  }
  positionFrames();
  const queued = data.requests.filter((item)=>item.status === "queued").sort((a,b)=>(b.votes||0)-(a.votes||0)).slice(0,3);
  const card=document.querySelector("#up-next");card.hidden=queued.length===0;
  document.querySelector("#up-next-list").innerHTML=queued.map((item)=>`<li>${escapeText(item.text)} <b>· ${item.votes||0} votes</b></li>`).join("");
 } catch {
   const region = document.querySelector("#widgets"); region.replaceChildren();
   const card = document.createElement("section"); card.className = "feed"; card.setAttribute("role", "alert"); card.textContent = "The overlay could not load. Check that StreamForge is running, then refresh this browser source."; region.append(card);
 }
}
function escapeText(value) { const element=document.createElement("span");element.textContent=String(value);return element.innerHTML; }
addEventListener("resize", positionFrames);
load();
socket.addEventListener("message", (event) => {
  let message; try { message = JSON.parse(event.data); } catch { return; }
  if (message.type === "event") {
    for (const frame of frames.values()) frame.contentWindow?.postMessage({kind:"streamforge:event",event:message.event},"*");
  }
  if(message.type==="theme"){themeTokens=message.tokens;for(const frame of frames.values())frame.contentWindow?.postMessage({kind:"streamforge:theme",tokens:themeTokens},"*");}
  if (message.type === "widgets") load();
  if (message.type === "event" && document.querySelector("#feed").hidden === false) {
    const item=document.createElement("div");item.className="feed-item";item.textContent=`${message.event.simulated?"SIMULATED · ":""}${message.event.type} event received`;document.querySelector("#feed-items").prepend(item);
  }
  if (message.type === "buildFeed" && document.querySelector("#feed").hidden === false) {
    const labels={Received:10,Approved:20,Planning:35,"Writing code":55,"Safety checks":80,Live:100,"Rolled back":100};
    const item=document.createElement("div");item.className="feed-item";
    const elapsed=Math.max(0,Math.floor((Date.now()-Date.parse(message.request.createdAt))/1000));
    const checks=message.checks?`<div class="small">${Object.entries(message.checks).map(([name,ok])=>`${ok?"✓":"○"} ${escapeText(({syntax:"Syntax",network:"No network access",forbiddenApis:"No forbidden APIs",mockMount:"Mounts without errors"})[name]||name)}`).join(" · ")}</div>`:"";
    item.innerHTML=`<strong>${escapeText(message.request.text)}</strong><br><span>${escapeText(message.request.requester)} · ${escapeText(message.stage)} · ${elapsed}s</span><div>${escapeText(message.detail)}</div>${checks}<div class="progress"><i style="width:${labels[message.stage]||15}%"></i></div>`;
    document.querySelector("#feed-items").prepend(item);
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
  if (!message || message.kind !== "streamforge:runtime-error") return;
  const frame = frames.get(message.id);
  if (!frame || event.source !== frame.contentWindow) return;
  frame.remove(); frames.delete(message.id);
  const response = await fetch(`/api/widgets/${encodeURIComponent(message.id)}/runtime-error`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ detail: String(message.detail || "").slice(0, 180) }) });
  const result = await response.json().catch(() => ({}));
  toast.hidden = false; toast.replaceChildren();
  const text = document.createElement("p"); text.textContent = result.message || "A widget stopped after a runtime error."; toast.append(text);
  const undo = document.createElement("button"); undo.textContent = "Undo widget"; undo.setAttribute("aria-label", `Undo ${message.id}`); undo.onclick = async () => {
    const restored = await fetch(`/api/widgets/${encodeURIComponent(message.id)}/undo`, { method: "POST" });
    if (restored.ok) { await fetch(`/api/widgets/${encodeURIComponent(message.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: true }) }); toast.textContent = "Previous widget version restored."; }
    else toast.textContent = (await restored.json()).error || "No earlier version is available.";
  }; toast.append(undo);
});
