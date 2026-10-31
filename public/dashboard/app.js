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

async function refresh() { try { state = await (await fetch("/api/state")).json(); state.draftPreview=latestDraftPreview; } catch { /* page reports local API errors */ } }
async function render() {
  await refresh();
  const key = location.hash.slice(1) || "overview";
  const page = pages[key] || pages.overview;
  links.forEach((link) => link.setAttribute("aria-current", link.dataset.page === key ? "page" : "false"));
  root.replaceChildren();
  try { await page(root, state, render); }
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
socket.addEventListener("message", (event) => { try { const message=JSON.parse(event.data); if(message.type==="draftPreview")latestDraftPreview=message; } catch { /* ignore malformed transport data */ } render(); });
