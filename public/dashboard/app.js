import { overview } from "./pages/overview.js";
import { queue } from "./pages/queue.js";
import { widgets } from "./pages/widgets.js";
import { library } from "./pages/library.js";
import { settings } from "./pages/settings.js";
import { sessions } from "./pages/sessions.js";
import { scenes } from "./pages/scenes.js";
import { demo } from "./pages/demo.js";

const pages = { overview, queue, widgets, library, settings, sessions, scenes, demo };
let root = document.querySelector("#page");
const links = [...document.querySelectorAll("[data-page]")];
let state = { requests: [], widgets: [], settings: {} };
let renderRevision=0,stateRevision=0;
let latestDraftPreview;
let latestBuildFeed=[];
const hypeHistory=[];
function paintHype(hype){if(!hype)return;state.hype=hype;hypeHistory.push(hype.value);if(hypeHistory.length>48)hypeHistory.shift();const score=document.querySelector("#hype-score"),level=document.querySelector("#hype-level"),progress=document.querySelector("#hype-progress"),stats=document.querySelector("#hype-stats"),canvas=document.querySelector("#hype-sparkline");if(score)score.textContent=String(hype.value);if(level)level.textContent=`${hype.level} · ${hype.trend}`;if(progress)progress.value=hype.value;if(stats)stats.textContent=`10s: ${hype.window10.messagesPerSecond}/s · ${hype.window10.uniqueChatters} chatters · 60s baseline ${hype.baselinePerMinute}/min`;if(canvas){const ctx=canvas.getContext("2d");if(ctx){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.strokeStyle="#8afff0";ctx.lineWidth=2;ctx.beginPath();hypeHistory.forEach((value,index)=>{const x=index/(Math.max(1,hypeHistory.length-1))*canvas.width;const y=canvas.height-(value/100)*(canvas.height-4)-2;if(index===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();}}}

async function refresh() { const revision=++stateRevision;try { const next=await (await fetch("/api/state")).json();if(revision===stateRevision){state=next;state.draftPreview=latestDraftPreview;state.buildFeed=latestBuildFeed;} } catch { /* page reports local API errors */ } }
async function render() {
  const revision=++renderRevision;
  await refresh();
  if(revision!==renderRevision)return;
  await status();
  if(revision!==renderRevision)return;
  const key = location.hash.slice(1) || "overview";
  document.body.dataset.safeMode = state.settings.safeMode || "off";
  const page = pages[key] || pages.overview;
  links.forEach((link) => link.setAttribute("aria-current", link.dataset.page === key ? "page" : "false"));
  const pageRoot=root.cloneNode(false);
  try {
    await page(pageRoot, state, render);
    if(revision!==renderRevision)return;
    pageRoot.querySelectorAll("iframe").forEach((frame)=>frame.addEventListener("load",()=>{
      if(state.settings.themeTokens)frame.contentWindow?.postMessage({kind:"streamforge:theme",tokens:state.settings.themeTokens},"*");
      frame.contentWindow?.postMessage({kind:"streamforge:safe-mode",level:state.settings.safeMode||"off"},"*");
    }));
    root.replaceWith(pageRoot);root=pageRoot;
    paintHype(state.hype);
  }
  catch { if(revision!==renderRevision)return;root.innerHTML = '<section class="card"><h2>This section could not load</h2><p>Please retry.</p><button id="retry">Retry</button></section>'; root.querySelector("#retry").onclick = render; }
}
window.addEventListener("hashchange", render);
render();

async function status() {
  try {
    const health = await (await fetch("/api/health")).json();
    const box = document.querySelector("#connections");
    const escape = value => String(value).replace(/[&<>"']/gu, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
    const item = (label, state, hint) => `<span class="status" title="${escape(hint)}" aria-label="${escape(`${label}: ${state}. ${hint}`)}"><i class="dot ${state === "connected" ? "ok" : state === "error" ? "error" : ""}"></i>${label}</span>`;
    const twitch=health.twitch, token=twitch.token;
    let chatState="needs setup",chatHint;
    if(token.expired){chatState="error";chatHint="Twitch token expired. Click Connect Twitch and authorize again.";}
    else if(twitch.chat==="error"||token.refreshError){chatState="error";chatHint=twitch.chatError||"Twitch token refresh failed. Reconnect Twitch.";}
    else if(twitch.chat==="connected"){chatState="connected";chatHint="Twitch IRC chat is connected.";}
    else if(!twitch.configured){chatHint="Missing Twitch Client ID, Client Secret, or Channel in .env. Add them and restart StreamForge.";}
    else if(!twitch.enabled){chatHint="TWITCH_LIVE_ENABLED is not true. Set it in .env and restart StreamForge.";}
    else if(!token.connected){chatHint="Twitch is not authorized. Click Connect Twitch and complete authorization.";}
    else {chatHint="Twitch chat is connecting. Check the channel name and granted chat:read scope in Settings.";}
    let eventsState="needs setup",eventsHint;
    if(token.expired){eventsState="error";eventsHint="Twitch token expired. Click Connect Twitch and authorize again.";}
    else if(twitch.eventSub==="error"||token.refreshError){eventsState="error";eventsHint=twitch.eventSubError||"Twitch token refresh failed. Reconnect Twitch.";}
    else if(twitch.eventSub==="connected"){eventsState="connected";eventsHint="Twitch EventSub is connected.";}
    else if(!twitch.configured){eventsHint="Missing Twitch Client ID, Client Secret, or Channel in .env. Add them and restart StreamForge.";}
    else if(!twitch.enabled){eventsHint="TWITCH_LIVE_ENABLED is not true. Set it in .env and restart StreamForge.";}
    else if(!token.connected){eventsHint="Twitch is not authorized. Click Connect Twitch and complete authorization.";}
    else {eventsHint="EventSub is connecting. Check required scopes in Settings.";}
    const codexState=health.codex.state==="verified"?"connected":health.codex.state==="error"?"error":"needs setup";
    const codexHint=codexState==="connected"?`Verified earlier at ${health.codex.time}.`:codexState==="error"?`Verification failed (${health.codex.error}). Sign in to Codex, then click Verify Codex in Settings.`:"Missing Codex login or verification. Sign in to Codex, then click Verify Codex in Settings.";
    box.innerHTML = item("Twitch chat", chatState, chatHint) + item("EventSub", eventsState, eventsHint) + item("Codex", codexState, codexHint);
  } catch { /* visible page remains usable offline */ }
}
status();
setInterval(status, 10_000);
const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
socket.addEventListener("message", (event) => { try { const message=JSON.parse(event.data); if(message.type==="draftPreview")latestDraftPreview=message;if((message.type==="draftResolved"||message.type==="requestDeleted")&&(latestDraftPreview?.requestId===message.requestId||latestDraftPreview?.request?.id===message.requestId))latestDraftPreview=undefined;if(message.type==="liveToast"){showLiveToast(message);render();return;}if(message.type==="buildFeed"){latestBuildFeed.unshift(message);latestBuildFeed=latestBuildFeed.slice(0,40);render();return;}if(message.type==="hype"){paintHype(message.hype);return;}if(message.type==="hypeSettings")return; } catch { /* ignore malformed transport data */ } render(); });

function showLiveToast(message){
  document.querySelector("#live-toast")?.remove();
  const toast=document.createElement("div");toast.id="live-toast";toast.className="live-toast";toast.setAttribute("role","status");
  const label=document.createElement("span");label.textContent=`${message.title} is live.`;
  const action=document.createElement("button");action.className="primary";action.textContent="Undo";action.setAttribute("aria-label",`Undo ${message.title} going live`);
  const close=document.createElement("button");close.textContent="Dismiss";close.setAttribute("aria-label","Dismiss live notification");close.onclick=()=>toast.remove();
  action.onclick=async()=>{action.disabled=true;try{const response=await fetch(`/api/widgets/${encodeURIComponent(message.widgetId)}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({enabled:false})});if(!response.ok)throw new Error();toast.remove();await render();}catch{action.disabled=false;label.textContent="Could not take the widget off scene.";}};
  toast.append(label,action,close);document.body.append(toast);
  window.setTimeout(()=>{if(toast.isConnected&&action.textContent==="Undo"){action.textContent="Remove";action.setAttribute("aria-label",`Remove ${message.title} from scene`);}},Math.max(1,Number(message.undoSeconds)||10)*1000);
}
