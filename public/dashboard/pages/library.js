import { readPreviewBackground, savePreviewBackground, setPreviewFrameBackground, withPreviewBackground } from "../preview-backgrounds.js";

const activePreviews = new Map();
let previewObserver;
window.addEventListener("message", (event) => {
  const message = event.data;
  const preview = activePreviews.get(message?.id);
  if (!preview || event.source !== preview.frame.contentWindow) return;
  if (message.kind === "streamforge:mounted") setHealth(preview.badge, "Mounted", "mounted");
  else if (message.kind === "streamforge:runtime-error") { setHealth(preview.badge, "Runtime error", "error"); preview.badge.title = "The sandboxed widget reported a runtime error."; }
  else if (message.kind === "streamforge:event-delivered") preview.badge.dataset.lastEventType = message.eventType;
});

export async function library(root, state, refresh) {
  previewObserver?.disconnect();
  activePreviews.clear();
  const sceneIds = new Set(state.widgets.filter((widget) => widget.enabled).map((widget) => widget.id));
  const previewBackground = readPreviewBackground("library", "dark");
  root.innerHTML = `<header class="page-head"><div><h1>Widget library</h1><p>${state.library.length} starter and imported widgets, each with a sandboxed live preview.</p></div></header>
    <section class="library-tools"><label class="library-search" for="library-search">Search widgets<input id="library-search" type="search" placeholder="Search names and descriptions"></label><label for="library-category">Category<select id="library-category"><option value="all">All categories</option><option value="chat">Chat</option><option value="community">Community</option><option value="stream">Stream</option><option value="utility">Utility</option></select></label><label class="compact-select" for="library-preview-background">Preview background<select id="library-preview-background">${backgroundOptions(previewBackground)}</select></label></section>
    <section class="import-dropzone" tabindex="0" role="group" aria-label="Import a widget file"><span class="import-drop-icon" aria-hidden="true">↥</span><div><strong>Drop a .sfwidget file here</strong><p>We’ll scan it and mock-mount it before adding it to your library.</p></div><form id="import-form"><label for="widget-file">Choose a .sfwidget file<input id="widget-file" type="file" accept=".sfwidget,application/json" required></label><button class="primary" type="submit">Validate and import</button></form><span id="import-result" class="small" aria-live="polite"></span></section>
    <section class="library-grid" aria-label="Available widgets">${state.library.map((entry) => libraryCard(entry, sceneIds, previewBackground)).join("") || '<div class="empty">No library widgets are available.</div>'}</section>`;

  const frames = [...root.querySelectorAll(".library-card iframe")];
  for (const frame of frames) {
    const widgetId = frame.dataset.widgetId;
    const badge = root.querySelector(`[data-preview-health="${cssEscape(widgetId)}"]`);
    activePreviews.set(widgetId, { widgetId, badge, frame });
    setPreviewFrameBackground(frame, previewBackground);
    frame.addEventListener("load", () => {
      if (frame.dataset.paused === "true" || frame.src === "about:blank") return;
      setHealth(badge, "Starting", "starting");
      window.setTimeout(() => { if (badge.dataset.state === "starting") setHealth(badge, "No response", "error"); }, 10_000);
    });
  }
  previewObserver = new IntersectionObserver((entries) => entries.forEach(({ target, isIntersecting }) => {
    const preview = activePreviews.get(target.dataset.widgetId);
    if (!preview) return;
    if (isIntersecting) resumePreview(target, preview);
    else pausePreview(target, preview);
  }), { rootMargin: "100px 0px" });
  frames.forEach((frame) => previewObserver.observe(frame));

  const cards = [...root.querySelectorAll(".library-card")];
  const applyFilters = () => {
    const query = root.querySelector("#library-search").value.trim().toLocaleLowerCase();
    const category = root.querySelector("#library-category").value;
    cards.forEach((card) => { card.hidden = !(card.dataset.search.includes(query) && (category === "all" || card.dataset.category === category)); });
  };
  root.querySelector("#library-search").addEventListener("input", applyFilters);
  root.querySelector("#library-category").addEventListener("change", applyFilters);
  root.querySelector("#library-preview-background").onchange = (event) => {
    savePreviewBackground("library", event.target.value);
    frames.forEach((frame) => {
      frame.dataset.previewSrc = withPreviewBackground(`/widgets/frame.html?id=${encodeURIComponent(frame.dataset.widgetId)}`, event.target.value);
      setPreviewFrameBackground(frame, event.target.value);
      if (frame.dataset.paused !== "true") frame.src = frame.dataset.previewSrc;
    });
  };
  const dropzone = root.querySelector(".import-dropzone");
  dropzone.addEventListener("dragover", (event) => { event.preventDefault(); dropzone.classList.add("is-dragging"); });
  dropzone.addEventListener("dragleave", (event) => { if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove("is-dragging"); });
  dropzone.addEventListener("drop", (event) => { event.preventDefault(); dropzone.classList.remove("is-dragging"); const file = event.dataTransfer.files[0]; if (file) { const transfer = new DataTransfer(); transfer.items.add(file); root.querySelector("#widget-file").files = transfer.files; root.querySelector("#import-form").requestSubmit(); } });

  root.querySelectorAll("[data-add]").forEach((button) => button.onclick = async () => {
    button.disabled = true;
    const status = root.querySelector(`[data-result="${cssEscape(button.dataset.add)}"]`);
    try {
      const response = await fetch(`/api/library/${button.dataset.add}/add`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not add widget.");
      button.textContent = "In scene";
      const remove = root.querySelector(`[data-remove="${cssEscape(result.widget.id)}"]`);
      if (remove) remove.disabled = false;
      status.textContent = "Added to overlay";
      status.closest(".library-card").classList.add("was-added");
      window.setTimeout(() => status.closest(".library-card")?.classList.remove("was-added"), 850);
    } catch (error) { button.disabled = false; status.textContent = error.message || "Could not add widget."; }
  });
  root.querySelectorAll("[data-remove]").forEach((button) => button.onclick = async () => {
    button.disabled = true;
    const card = button.closest(".library-card"), status = card.querySelector("[data-result]");
    try {
      const response = await fetch(`/api/widgets/${button.dataset.remove}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      const add = card.querySelector("[data-add]"); add.disabled = false; add.textContent = "Add to scene"; status.textContent = "Removed from overlay";
    } catch { button.disabled = false; status.textContent = "Could not remove widget."; }
  });
  root.querySelectorAll("[data-export]").forEach((button) => button.onclick = async () => {
    const response = await fetch(`/api/widgets/${button.dataset.export}/export`);
    if (!response.ok) { root.querySelector(`[data-result="${cssEscape(button.dataset.entry)}"]`).textContent = "Export failed"; return; }
    const url = URL.createObjectURL(await response.blob()), link = document.createElement("a"); link.href = url; link.download = `${button.dataset.export}.sfwidget`; link.click(); URL.revokeObjectURL(url);
  });
  root.querySelector("#import-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = root.querySelector("#import-form"), button = form.querySelector("button[type=submit]"), result = root.querySelector("#import-result"), file = root.querySelector("#widget-file").files[0];
    if (!file) return;
    button.disabled = true;
    try {
      const artifact = JSON.parse(await file.text());
      const response = await fetch("/api/library/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(artifact) });
      const data = await response.json();
      result.textContent = response.ok ? (data.alreadyImported ? "This widget is already in the library" : "Widget imported and safety checked") : data.error;
      if (response.ok && !data.alreadyImported) await refresh();
    } catch { result.textContent = "Choose a valid .sfwidget JSON file."; }
    finally { button.disabled = false; }
  };
}

function libraryCard(entry, sceneIds, background) {
  const widgetId = entry.widgetId;
  const category = categorize(entry);
  const src = withPreviewBackground(`/widgets/frame.html?id=${encodeURIComponent(widgetId)}`, background);
  return `<article class="card library-card" data-widget-id="${escapeText(widgetId)}" data-category="${category}" data-search="${escapeText(`${entry.title} ${entry.description} ${entry.creator} ${category}`.toLocaleLowerCase())}"><div class="library-preview-shell"><div class="preview-skeleton" data-label="Starting sandbox preview…" aria-hidden="true"></div><iframe class="library-preview" data-widget-id="${escapeText(widgetId)}" data-preview-src="${escapeText(src)}" title="Preview: ${escapeText(entry.title)}" loading="lazy" sandbox="allow-scripts" referrerpolicy="no-referrer" src="${escapeText(src)}"></iframe></div><div class="library-card-body"><div class="row"><span class="tag preview-health" role="status" aria-live="polite" data-preview-health="${escapeText(widgetId)}" data-state="loading">Preview loading</span><span class="tag">Static scan ${entry.passport?.scan?.passed ? "passed" : "unavailable"}</span></div><h2>${escapeText(entry.title)}</h2><p>${escapeText(entry.description)}</p><span class="small">By ${escapeText(entry.creator)}</span>${passportCard(entry.passport)}<details><summary>Original prompt</summary><p>${escapeText(entry.originalPrompt)}</p></details><div class="row library-card-actions"><button data-add="${escapeText(entry.id)}" ${sceneIds.has(widgetId) ? "disabled" : ""}>${sceneIds.has(widgetId) ? "In scene" : "Add to scene"}</button><button data-remove="${escapeText(widgetId)}" ${sceneIds.has(widgetId) ? "" : "disabled"}>Remove</button><button data-export="${escapeText(widgetId)}" data-entry="${escapeText(entry.id)}">Export .sfwidget</button><span class="small" aria-live="polite" data-result="${escapeText(entry.id)}"></span></div></div></article>`;
}
function categorize(entry) {
  const events = entry.passport?.events || [];
  if (events.some((event) => ["chat", "redeem"].includes(event))) return "chat";
  if (events.some((event) => ["follow", "subscription", "raid"].includes(event))) return "community";
  if (events.some((event) => ["hype", "stream", "clip"].includes(event))) return "stream";
  return "utility";
}
function setHealth(badge, text, state) { if (badge) { badge.textContent = text; badge.dataset.state = state; if (state === "mounted") badge.closest(".library-preview-shell")?.classList.add("preview-loaded"); } }
function pausePreview(frame, preview) { if (frame.dataset.started !== "true" || frame.dataset.paused === "true") return; frame.dataset.paused = "true"; frame.style.contentVisibility = "hidden"; setHealth(preview.badge, "Paused offscreen", "paused"); }
function resumePreview(frame, preview) { if (frame.dataset.paused === "true") { frame.dataset.paused = "false"; frame.style.contentVisibility = "visible"; setHealth(preview.badge, "Preview loading", "loading"); } frame.dataset.started = "true"; }
function backgroundOptions(selected) { return ["dark", "bright", "checker", "green", "transparent"].map((name) => `<option value="${name}" ${selected === name ? "selected" : ""}>${name[0].toUpperCase()}${name.slice(1)}</option>`).join(""); }
function escapeText(value) { const element = document.createElement("span"); element.textContent = String(value ?? ""); return element.innerHTML; }
function cssEscape(value) { return window.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9_-]/gu, "\\$&"); }
function passportCard(passport) { if (!passport) return '<details class="passport"><summary>Widget Passport · unavailable</summary></details>'; const uses = [passport.usesSound && "sound", passport.usesStorage && "storage", passport.usesTheme && "theme tokens", passport.usesHype && "hype"].filter(Boolean); return `<details class="passport"><summary>Widget Passport · ${escapeText(passport.motionRisk)} motion risk</summary><div class="passport-chips"><span class="tag">Events · ${passport.events.map(escapeText).join(", ") || "none detected"}</span><span class="tag">Scan · ${passport.scan.passed ? "passed" : "failed"}</span><span class="tag">Uses · ${uses.join(", ") || "core API"}</span></div></details>`; }
