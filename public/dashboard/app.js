import { overview } from "./pages/overview.js";
import { queue } from "./pages/queue.js";
import { widgets } from "./pages/widgets.js";
import { library } from "./pages/library.js";
import { settings } from "./pages/settings.js";

const pages = { overview, queue, widgets, library, settings };
const root = document.querySelector("#page");
const links = [...document.querySelectorAll("[data-page]")];
let state = { requests: [], widgets: [], settings: {} };
let latestDraftPreview;
const hypeHistory=[];
function paintHype(hype){if(!hype)return;state.hype=hype;hypeHistory.push(hype.score);if(hypeHistory.length>48)hypeHistory.shift();const score=document.querySelector("#hype-score"),level=document.querySelector("#hype-level"),progress=document.querySelector("#hype-progress"),stats=document.querySelector("#hype-stats"),canvas=document.querySelector("#hype-sparkline");if(score)score.textContent=String(hype.score);if(level)level.textContent=hype.level;if(progress)progress.value=hype.score;if(stats)stats.textContent=`10s: ${hype.window10.messages} messages · ${hype.window10.uniqueChatters} chatters · 60s baseline ${hype.baselinePerMinute}/min`;if(canvas){const ctx=canvas.getContext("2d");if(ctx){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.strokeStyle="#8afff0";ctx.lineWidth=2;ctx.beginPath();hypeHistory.forEach((value,index)=>{const x=index/(Math.max(1,hypeHistory.length-1))*canvas.width;const y=canvas.height-(value/100)*(canvas.height-4)-2;if(index===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();}}}

async function refresh() { try { state = await (await fetch("/api/state")).json(); state.draftPreview=latestDraftPreview; } catch { /* page reports local API errors */ } }
async function render() {
  await refresh();
  const key = location.hash.slice(1) || "overview";
  const page = pages[key] || pages.overview;
  links.forEach((link) => link.setAttribute("aria-current", link.dataset.page === key ? "page" : "false"));
  root.replaceChildren();
  try {
    await page(root, state, render);
    root.querySelectorAll("iframe").forEach((frame)=>frame.addEventListener("load",()=>{
      if(state.settings.themeTokens)frame.contentWindow?.postMessage({kind:"streamforge:theme",tokens:state.settings.themeTokens},"*");
      frame.contentWindow?.postMessage({kind:"streamforge:safe-mode",level:state.settings.safeMode||"off"},"*");
    }));
    paintHype(state.hype);
  }
  catch { root.innerHTML = '<section class="card"><h2>This section could not load</h2><p>Please retry.</p><button id="retry">Retry</button></section>'; root.querySelector("#retry").onclick = render; }
}
window.addEventListener("hashchange", render);
render();

async function status() {
  try {
    const health = await (await fetch("/api/health")).json();
    const box = document.querySelector("#connections");
    const item = (label, ok, hint) => `<span class="status" title="${hint}"><i class="dot ${ok ? "ok" : ""}"></i>${label}</span>`;
    box.innerHTML = item("Twitch chat", false, "Set up Twitch credentials") + item("EventSub", false, "Authorize Twitch") + item("Codex", health.codex.state === "verified", health.codex.state === "verified" ? `Verified ${health.codex.time}` : "Sign in to Codex and verify");
  } catch { /* visible page remains usable offline */ }
}
status();
const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
socket.addEventListener("message", (event) => { try { const message=JSON.parse(event.data); if(message.type==="draftPreview")latestDraftPreview=message;if(message.type==="hype"){paintHype(message.hype);return;}if(message.type==="hypeSettings")return; } catch { /* ignore malformed transport data */ } render(); });
