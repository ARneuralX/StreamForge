import { readPreviewBackground, savePreviewBackground, setPreviewFrameBackground, withPreviewBackground } from "../preview-backgrounds.js";

let previewObserver;
const previews = new Map();
if (!window.__streamForgeWidgetPreviewListener) {
  window.__streamForgeWidgetPreviewListener = true;
  window.addEventListener("message", (event) => {
    const message = event.data;
    const preview = previews.get(message?.id);
    if (!preview || event.source !== preview.frame.contentWindow) return;
    if (message.kind === "streamforge:layout-check" && Number.isFinite(message.height)) preview.frame.style.height = `${Math.max(48, Math.min(1080, Math.ceil(message.height)))}px`;
    if (message.kind === "streamforge:mounted") setPreviewHealth(preview, "Mounted", "mounted");
    if (message.kind === "streamforge:runtime-error") setPreviewHealth(preview, "Runtime error", "error");
  });
}

export async function widgets(root, state, refresh = async () => {}) {
  previewObserver?.disconnect();
  previews.clear();
  const background = readPreviewBackground("widgets", "dark");
  root.innerHTML = `
    <header class="page-head"><div><h1>Widgets</h1><p>Preview, arrange, and manage the widgets used by your overlay.</p></div><div class="row"><label class="compact-select" for="widgets-preview-background">Preview background<select id="widgets-preview-background">${backgroundOptions(background)}</select></label></div></header>
    <section class="widget-grid" aria-label="Your widgets">${state.widgets.map((widget) => widgetCard(widget, background)).join("") || `<div class="empty-state"><span class="empty-icon" aria-hidden="true">▧</span><strong>No widgets yet</strong><a class="button" href="#library">Browse the Library</a></div>`}</section>`;

  root.querySelectorAll(".widget-preview-frame").forEach((frame) => {
    const widgetId = frame.dataset.widgetId;
    const badge = root.querySelector(`[data-widget-health="${cssEscape(widgetId)}"]`);
    previews.set(widgetId, { frame, badge });
    applyFrameBackground(frame, background);
    frame.addEventListener("load", () => {
      if (frame.dataset.paused === "true") return;
      if (frame.src.includes("about:blank")) return;
      setPreviewHealth(previews.get(widgetId), "Starting", "starting");
      window.setTimeout(() => {
        const preview = previews.get(widgetId);
        if (preview?.frame.isConnected && preview.badge?.dataset.state === "starting") setPreviewHealth(preview, "No response", "error");
      }, 10_000);
    });
  });
  previewObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const frame = entry.target;
      const preview = previews.get(frame.dataset.widgetId);
      if (!preview) continue;
      if (entry.isIntersecting) resumePreview(frame, preview);
      else pausePreview(frame, preview);
    }
    if (!root.isConnected) previewObserver?.disconnect();
  }, { rootMargin: "80px 0px" });
  root.querySelectorAll(".widget-preview-frame").forEach((frame) => previewObserver.observe(frame));
  window.setTimeout(() => { if (!root.isConnected) previewObserver?.disconnect(); }, 0);

  root.querySelector("#widgets-preview-background").onchange = (event) => {
    savePreviewBackground("widgets", event.target.value);
    root.querySelectorAll(".widget-preview-frame").forEach((frame) => {
      frame.dataset.previewSrc = withPreviewBackground(`/widgets/frame.html?id=${encodeURIComponent(frame.dataset.widgetId)}`, event.target.value);
      applyFrameBackground(frame, event.target.value);
      if (frame.dataset.paused !== "true") frame.src = frame.dataset.previewSrc;
    });
  };

  root.querySelectorAll("[data-toggle]").forEach((input) => input.onchange = async () => {
    const card = input.closest(".widget-card");
    try {
      const response = await fetch(`/api/widgets/${input.dataset.toggle}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: input.checked }) });
      if (!response.ok) throw new Error("Could not update scene state.");
      card.querySelector("[data-toggle-status]").textContent = input.checked ? "Shown on overlay" : "Hidden from overlay";
    } catch {
      input.checked = !input.checked;
      card.querySelector("[data-toggle-status]").textContent = "Could not save. Try again.";
    }
  });
  root.querySelectorAll("[data-position]").forEach((form) => form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    const inputs = form.querySelectorAll("input");
    button.disabled = true;
    try {
      const response = await fetch(`/api/widgets/${form.dataset.position}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ position: { x: Number(inputs[0].value), y: Number(inputs[1].value) } }) });
      const result = await response.json();
      form.querySelector("[data-position-result]").textContent = response.ok ? "Position saved." : result.error;
    } catch { form.querySelector("[data-position-result]").textContent = "Position could not be saved."; }
    finally { button.disabled = false; }
  });
  root.querySelectorAll("[data-undo]").forEach((button) => button.onclick = async () => {
    button.disabled = true;
    try {
      const response = await fetch(`/api/widgets/${button.dataset.undo}/undo`, { method: "POST" });
      const data = await response.json();
      root.querySelector(`[data-undo-result="${cssEscape(button.dataset.undo)}"]`).textContent = data.message || data.error;
    } catch { root.querySelector(`[data-undo-result="${cssEscape(button.dataset.undo)}"]`).textContent = "Undo could not be completed."; }
    finally { button.disabled = false; }
  });
  root.querySelectorAll("[data-open-remix]").forEach((button) => button.onclick = () => {
    const form = root.querySelector(`[data-remix="${cssEscape(button.dataset.openRemix)}"]`);
    form.hidden = !form.hidden;
    if (!form.hidden) form.querySelector("textarea").focus();
  });
  root.querySelectorAll("[data-remix]").forEach((form) => form.onsubmit = async (event) => {
    event.preventDefault();
    const textarea = form.querySelector("textarea");
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const response = await fetch(`/api/widgets/${form.dataset.remix}/remix`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ change: textarea.value }) });
      const data = await response.json();
      form.querySelector("[data-remix-result]").textContent = response.ok ? "Remix request added to the queue." : data.error;
    } catch { form.querySelector("[data-remix-result]").textContent = "Request could not be added."; }
    finally { button.disabled = false; }
  });
  root.querySelectorAll("[data-delete-widget]").forEach((button) => button.onclick = async () => {
    const widget = state.widgets.find((item) => item.id === button.dataset.deleteWidget);
    if (!window.confirm(`Permanently delete ${widget?.title || "this widget"} from your widget list and saved state? Git version history will remain available.`)) return;
    button.disabled = true;
    try {
      const response = await fetch(`/api/widgets/${button.dataset.deleteWidget}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Widget could not be removed.");
      await refresh();
    } catch {
      button.disabled = false;
      root.querySelector(`[data-widget-result="${cssEscape(button.dataset.deleteWidget)}"]`).textContent = "Could not remove the widget. Try again.";
    }
  });
}

function widgetCard(widget, background) {
  const previewUrl = withPreviewBackground(`/widgets/frame.html?id=${encodeURIComponent(widget.id)}`, background);
  const health = widget.passport?.scan?.passed ? "Safety checks passed" : "Safety status unavailable";
  return `<article class="card widget-card-rich" data-widget-id="${escapeText(widget.id)}">
    <div class="widget-preview-shell"><div class="widget-preview-top"><span class="widget-preview-name">${escapeText(widget.title)}</span><span class="preview-health" role="status" data-widget-health="${escapeText(widget.id)}" data-state="loading">Preview loading</span></div><div class="widget-preview-stage"><div class="preview-skeleton" data-label="Starting sandbox preview…" aria-hidden="true"></div><iframe class="widget-preview-frame" data-widget-id="${escapeText(widget.id)}" data-preview-src="${escapeText(previewUrl)}" title="Live preview: ${escapeText(widget.title)}" loading="lazy" sandbox="allow-scripts" referrerpolicy="no-referrer" src="${escapeText(previewUrl)}"></iframe></div></div>
    <div class="widget-card-body"><div class="widget-card-heading"><div><span class="eyebrow">${widget.enabled ? "ON OVERLAY" : "HIDDEN"}</span><h2>${escapeText(widget.title)}</h2></div><label class="switch-control" title="Show ${escapeText(widget.title)} on the overlay"><input type="checkbox" role="switch" data-toggle="${escapeText(widget.id)}" ${widget.enabled ? "checked" : ""}><span class="switch-track" aria-hidden="true"></span><span class="sr-only">Show on overlay</span></label></div>
      <p>${escapeText(widget.description)}</p><div class="widget-card-meta"><span class="health-pill ${widget.passport?.scan?.passed ? "health-good" : ""}"><i aria-hidden="true">${widget.passport?.scan?.passed ? "✓" : "·"}</i>${health}</span><span class="small" data-toggle-status>${widget.enabled ? "Shown on overlay" : "Hidden from overlay"}</span></div>
      <div class="widget-actions"><button type="button" data-open-remix="${escapeText(widget.id)}" title="Ask for a widget remix">${icon("wand")}<span>Remix</span></button><button type="button" data-export-widget="${escapeText(widget.id)}" title="Export this widget">${icon("download")}<span>Export</span></button><details class="icon-popover"><summary title="Widget versions">${icon("layers")}<span>Versions</span></summary><p>${Number(widget.versionCount) || 1} ${Number(widget.versionCount) === 1 ? "saved version" : "saved versions"} in local Git history.</p></details><button type="button" data-undo="${escapeText(widget.id)}" title="Restore the previous version" ${widget.canUndo ? "" : "disabled"}>${icon("undo")}<span>Undo</span></button><button type="button" data-delete-widget="${escapeText(widget.id)}" title="Permanently delete this widget; local Git version history is retained">${icon("trash")}<span>Delete</span></button></div>
      <form class="form-row remix-form" data-remix="${escapeText(widget.id)}" hidden><label>Describe a change<textarea maxlength="300" required placeholder="Add a teal glow when chat votes"></textarea></label><div class="row"><button class="primary" type="submit">Add remix request</button><span class="small" data-remix-result aria-live="polite"></span></div></form>
      <details class="passport passport-chips"><summary>Widget Passport · ${escapeText(widget.passport?.motionRisk || "unavailable")} motion risk</summary>${passportCard(widget.passport)}</details>
      <details class="position-popover"><summary>Position <span class="small">X ${widget.position?.x ?? widget.x} · Y ${widget.position?.y ?? widget.y}</span></summary><form class="position-form" data-position="${escapeText(widget.id)}"><label>X<input aria-label="${escapeText(widget.title)} horizontal position" type="number" min="0" max="1920" value="${widget.position?.x ?? widget.x}"></label><label>Y<input aria-label="${escapeText(widget.title)} vertical position" type="number" min="0" max="1080" value="${widget.position?.y ?? widget.y}"></label><button type="submit">Save position</button><span class="small" data-position-result aria-live="polite"></span></form></details>
      <span class="small" data-undo-result="${escapeText(widget.id)}" aria-live="polite">${widget.canUndo ? "Previous version available" : "First saved version"}</span><span class="small" data-widget-result="${escapeText(widget.id)}" aria-live="polite"></span>
    </div>
  </article>`;
}

function passportCard(passport) {
  if (!passport) return `<div class="passport-chips"><span class="tag">Passport unavailable</span></div>`;
  const uses = [passport.usesSound && "sound", passport.usesStorage && "storage", passport.usesTheme && "theme tokens", passport.usesHype && "hype"].filter(Boolean);
  return `<div class="passport-chips"><span class="tag">Events · ${passport.events.map(escapeText).join(", ") || "none detected"}</span><span class="tag">Motion risk · ${escapeText(passport.motionRisk)}</span><span class="tag">Scan · ${passport.scan.passed ? "passed" : "failed"}</span><span class="tag">Uses · ${uses.map(escapeText).join(", ") || "core API"}</span></div>`;
}

function setPreviewHealth(preview, text, state) {
  if (!preview?.badge) return;
  preview.badge.textContent = text;
  preview.badge.dataset.state = state;
  if (state === "mounted" || state === "error") preview.badge.closest(".widget-preview-shell")?.classList.add("preview-loaded");
}
function applyFrameBackground(frame, name) { setPreviewFrameBackground(frame, name); const stage = frame.parentElement; if (stage) { stage.style.backgroundColor = frame.style.backgroundColor; stage.style.backgroundImage = frame.style.backgroundImage; stage.style.backgroundSize = frame.style.backgroundSize; } }
function pausePreview(frame, preview) {
  if (frame.dataset.started !== "true" || frame.dataset.paused === "true") return;
  frame.dataset.paused = "true";
  frame.src = "about:blank";
  setPreviewHealth(preview, "Paused offscreen", "paused");
}
function resumePreview(frame, preview) {
  if (frame.dataset.paused === "true") {
    frame.dataset.paused = "false";
    frame.dataset.started = "true";
    setPreviewHealth(preview, "Preview loading", "loading");
    frame.src = frame.dataset.previewSrc;
  } else if (frame.dataset.started !== "true") {
    frame.dataset.started = "true";
  }
}
function backgroundOptions(selected) { return ["dark", "bright", "checker", "green", "transparent"].map((name) => `<option value="${name}" ${selected === name ? "selected" : ""}>${name[0].toUpperCase()}${name.slice(1)}</option>`).join(""); }
function icon(name) {
  const paths = { wand: '<path d="m15 4 5 5M4 20l11-11M4 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1zM18 14l1.2 2.8L22 18l-2.8 1.2L18 22l-1.2-2.8L14 18l2.8-1.2z"/>', download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v4h16v-4"/>', layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>', undo: '<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-2"/>', trash: '<path d="M4 7h16m-10 4v7m4-7v7M6 7l1 14h10l1-14M9 7V4h6v3"/>' };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}
function cssEscape(value) { return window.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9_-]/gu, "\\$&"); }
function escapeText(value) { const element = document.createElement("span"); element.textContent = String(value); return element.innerHTML; }
