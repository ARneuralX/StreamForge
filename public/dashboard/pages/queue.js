import { readPreviewBackground, savePreviewBackground, setPreviewFrameBackground, withPreviewBackground } from "../preview-backgrounds.js";

const buildStages = ["Received", "Approved", "Planning", "Writing code", "Safety checks", "Live"];
let activeQueueTab = "pending";
if (!window.__streamForgeQueueLayoutListener) {
  window.__streamForgeQueueLayoutListener = true;
  window.addEventListener("message", (event) => {
    const frame = document.querySelector("#studio-frame");
    if (!frame || event.source !== frame.contentWindow || event.data?.kind !== "streamforge:layout-check" || !Number.isFinite(event.data.height)) return;
    frame.style.height = `${Math.max(48, Math.min(1080, Math.ceil(event.data.height)))}px`;
  });
}

export async function queue(root, state, refresh) {
  const requests = [...state.requests].sort((a, b) => (b.votes || 0) - (a.votes || 0) || b.createdAt.localeCompare(a.createdAt));
  const grouped = {
    pending: requests.filter((item) => !["live", "rolled_back"].includes(item.status)),
    live: requests.filter((item) => item.status === "live"),
    rolled_back: requests.filter((item) => item.status === "rolled_back"),
  };
  const visibleRequests = grouped[activeQueueTab];
  const active = requests.find((item) => ["building", "checking"].includes(item.status));
  const feed = state.buildFeed || [];
  const activeFeed = active && feed.find((item) => item.request?.id === active.id);
  const widget = state.widgets.find((item) => item.enabled) || state.widgets[0];
  const draft = state.draftPreview;
  const previewBackground = readPreviewBackground("build-studio", "dark");
  const mode = state.settings.buildMode || "mock";
  const buildActivity = mode === "codex" || mode === "replay";
  const currentStage = activeFeed?.stage || (active?.status === "checking" ? "Safety checks" : active ? "Writing code" : "");
  const currentIndex = buildStages.indexOf(currentStage);
  const elapsed = active ? Math.max(0, Math.floor((Date.now() - Date.parse(active.createdAt)) / 1000)) : 0;

  root.innerHTML = `
    <header class="page-head">
      <div><h1>Build Studio</h1><p>Review requests, follow safety checks, and preview isolated widget drafts.</p></div>
      <span class="mode-badge mode-badge-${escapeText(mode)}">${modeLabel(mode)}</span>
    </header>
    <section class="studio-grid build-studio-layout">
      <article class="card build-queue-panel">
        <div class="section-heading"><div><h2>Build queue</h2><p class="helper">Review each request and manage its overlay widget.</p></div><div class="row"><button class="secondary" type="button" data-clear-rolled-back ${grouped.rolled_back.length ? "" : "disabled"}>Clear all rolled back</button><span class="small" data-clear-result aria-live="polite"></span></div></div>
        <div class="request-tabs" role="tablist" aria-label="Request status">
          ${[["pending", "Pending"], ["live", "Live"], ["rolled_back", "Rolled back"]].map(([key, label]) => `<button type="button" role="tab" id="request-tab-${key}" aria-selected="${activeQueueTab === key}" aria-controls="request-tabpanel" data-request-tab="${key}">${label}<span class="tag">${grouped[key].length}</span></button>`).join("")}
        </div>
        ${active ? `<section class="active-build" aria-live="polite" data-build-state="${escapeText(active.status)}">
          <div class="active-build-heading"><div><span class="eyebrow">${mode === "replay" ? "RECORDED RUN" : "ACTIVE BUILD"}</span><h3>${escapeText(active.text)}</h3></div><span class="tag status-${escapeText(active.status)}">${friendlyStatus(active.status)}</span></div>
          <ol class="build-stepper" aria-label="Build progress">${buildStages.map((stage, index) => `<li class="${index < currentIndex ? "is-complete" : index === currentIndex ? "is-current" : ""}" ${index === currentIndex ? 'aria-current="step"' : ""}><span class="step-mark">${index < currentIndex ? "✓" : index + 1}</span><span>${escapeText(stage === "Live" ? "Live or rolled back" : stage)}</span></li>`).join("")}</ol>
          <div class="build-progress" role="progressbar" aria-label="Build progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.max(0, (currentIndex + 1) * 16)}"><span style="--progress:${Math.max(0, (currentIndex + 1) * 16)}%"></span></div>
          <div class="row build-timing"><span class="live-pulse" aria-hidden="true"></span><span><span data-elapsed>${elapsed}</span>s elapsed</span><span>${escapeText(activeFeed?.detail || "Waiting for the next build update.")}</span></div>
        </section>` : `<div class="empty-state compact-empty"><span class="empty-icon" aria-hidden="true">◇</span><strong>No build is running</strong><span>Approve a queued request to begin.</span></div>`}
        <div id="request-tabpanel" role="tabpanel" aria-labelledby="request-tab-${activeQueueTab}">${visibleRequests.length ? `<div class="request-list">${visibleRequests.map((item) => requestCard(item, state)).join("")}</div>` : `<div class="empty-state"><span class="empty-icon" aria-hidden="true">✳</span><strong>${activeQueueTab === "pending" ? "No pending requests" : activeQueueTab === "live" ? "No live widgets from requests" : "Nothing has been rolled back"}</strong><span>${activeQueueTab === "pending" ? "Add a widget idea from Overview and it will appear here." : "Requests in this status will appear here."}</span>${activeQueueTab === "pending" ? '<a class="button" href="#overview">Add an idea</a>' : ""}</div>`}</div>
      </article>

      <div class="studio-side-column">
        <article class="card studio-preview build-preview-panel ${draft ? "has-draft-preview" : ""}">
          <div class="section-heading"><div><h2>${draft ? "Draft preview" : "Sandbox preview"}</h2><p id="preview-badge" class="helper">${draft ? "Draft · scanned and isolated · not live yet" : widget ? "Current scene widget · isolated" : "Waiting for a widget"}</p></div>
            <label class="compact-select" for="preview-background">Background<select id="preview-background"><option value="dark" ${previewBackground === "dark" ? "selected" : ""}>Dark</option><option value="bright" ${previewBackground === "bright" ? "selected" : ""}>Bright</option><option value="checker" ${previewBackground === "checker" ? "selected" : ""}>Checker</option><option value="green" ${previewBackground === "green" ? "selected" : ""}>Green</option><option value="transparent" ${previewBackground === "transparent" ? "selected" : ""}>Transparent</option></select></label>
          </div>
          <p id="preview-state" class="small">${draft ? `One safety-checked draft: ${escapeText(draft.request?.text || "New widget")}. It is not in the live overlay.` : widget ? `Previewing ${escapeText(widget.title)} from the current scene.` : "Add a Library widget to preview it here."}</p>
          ${draft ? `<div class="draft-preview-card"><div class="draft-preview-heading"><span class="tag">DRAFT</span><strong>${escapeText(draft.request?.text || "New widget")}</strong></div><div class="device-frame"><div class="device-toolbar"><i></i><i></i><i></i><span>Sandbox · Preview only</span></div><div class="preview-skeleton" aria-hidden="true">Starting checked preview…</div><iframe id="studio-frame" class="library-preview" title="Draft widget preview" loading="lazy" sandbox="allow-scripts" src="${escapeText(withPreviewBackground(draft.url, previewBackground))}"></iframe></div><div class="draft-actions"><button class="primary" type="button" data-draft-action="approve">Go live</button><button class="secondary" type="button" data-draft-action="edit">Edit</button><button class="secondary danger" type="button" data-draft-action="delete">Discard</button></div><form class="draft-edit-form" data-draft-edit hidden><label for="draft-edit-text">Edit request<textarea id="draft-edit-text" maxlength="300">${escapeText(draft.request?.text || "")}</textarea></label><div class="row"><button class="primary" type="submit">Save and return to Pending</button><button class="secondary" type="button" data-draft-action="cancel-edit">Cancel</button></div></form><p class="small" data-draft-result aria-live="polite"></p></div>` : widget ? `<div class="device-frame"><div class="device-toolbar"><i></i><i></i><i></i><span>Sandbox · ${escapeText(widget.title)}</span></div><div class="preview-skeleton" aria-hidden="true">Starting sandbox preview…</div><iframe id="studio-frame" class="library-preview" title="Sandboxed widget preview" loading="lazy" sandbox="allow-scripts" src="${escapeText(withPreviewBackground(`/widgets/frame.html?id=${encodeURIComponent(widget.id)}`, previewBackground))}"></iframe></div><div class="preview-events"><div class="section-heading"><div><h3>Preview events</h3><p class="helper">Local events are simulated.</p></div><span class="tag">SIMULATED</span></div><div class="sim-grid">${["chat", "follow", "sub", "raid", "redeem"].map((event) => `<button type="button" data-simulate="${event}">${eventLabel(event)}</button>`).join("")}</div></div>` : `<div class="empty-state compact-empty"><span class="empty-icon" aria-hidden="true">▧</span><strong>No preview available</strong></div>`}
        </article>
        ${buildActivityPanel(buildActivity, feed, state, Boolean(active))}
      </div>
    </section>`;

  root.querySelectorAll("[data-action]").forEach((button) => button.onclick = async () => {
    button.disabled = true;
    try {
      const action = button.dataset.action;
      if (action === "delete" && !window.confirm("Delete this request and its request-owned widget, saved state, and live overlay entry?")) { button.disabled = false; return; }
      if (action === "retry" && !window.confirm("Retry the safety-checked build for this request?")) { button.disabled = false; return; }
      let response;
      if (action === "delete") response = await fetch(`/api/requests/${button.dataset.id}`, { method: "DELETE" });
      else if (action === "offline") response = await fetch(`/api/widgets/${encodeURIComponent(button.dataset.widgetId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: false }) });
      else if (action === "retry") response = await fetch(`/api/requests/${button.dataset.id}/retry`, { method: "POST" });
      else response = await fetch(`/api/requests/${button.dataset.id}/${action}`, { method: "POST" });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Could not update this request.");
      }
      await refresh();
    } catch (error) {
      button.disabled = false;
      const result = root.querySelector(`[data-action-result="${button.dataset.id}"]`);
      if (result) result.textContent = error.message || "Could not update this request. Try again.";
    }
  });

  root.querySelectorAll("[data-request-tab]").forEach((button) => button.onclick = () => { activeQueueTab = button.dataset.requestTab; void queue(root, state, refresh); });
  root.querySelector("[data-clear-rolled-back]")?.addEventListener("click", async (event) => {
    if (!grouped.rolled_back.length || !window.confirm(`Delete all ${grouped.rolled_back.length} rolled back requests and their request-owned files and state?`)) return;
    const button = event.currentTarget; button.disabled = true;
    const response = await fetch("/api/requests?status=rolled_back", { method: "DELETE" });
    if (!response.ok) { button.disabled = false; root.querySelector("[data-clear-result]").textContent = "Could not clear rolled back requests."; return; }
    await refresh();
  });

  root.querySelectorAll("[data-draft-action]").forEach((button) => button.onclick = async () => {
    const action = button.dataset.draftAction, draftId = draft?.request?.id || draft?.requestId;
    if (!draftId) return;
    if (action === "edit") { root.querySelector("[data-draft-edit]").hidden = false; root.querySelector("#draft-edit-text").focus(); return; }
    if (action === "cancel-edit") { root.querySelector("[data-draft-edit]").hidden = true; return; }
    if (action === "delete" && !window.confirm("Delete this draft and its request-owned files and saved state?")) return;
    const endpoint = action === "delete" ? `/api/requests/${draftId}` : `/api/requests/${draftId}/draft/approve`;
    const response = await fetch(endpoint, { method: action === "delete" ? "DELETE" : "POST" });
    const result = await response.json().catch(() => ({}));
    const status = root.querySelector("[data-draft-result]");
    if (!response.ok) { if (status) status.textContent = result.error || "Could not update this draft."; return; }
    if (action === "approve") { if (status) status.textContent = "Approved. The widget will go live after promotion."; }
    else await refresh();
  });
  root.querySelector("[data-draft-edit]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const draftId = draft?.request?.id || draft?.requestId;
    const response = await fetch(`/api/requests/${draftId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: root.querySelector("#draft-edit-text").value }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { root.querySelector("[data-draft-result]").textContent = result.error || "Could not edit this draft."; return; }
    await refresh();
  });

  root.querySelector("#preview-background")?.addEventListener("change", (event) => {
    const frame = root.querySelector("#studio-frame");
    savePreviewBackground("build-studio", event.target.value);
    if (frame && draft) frame.src = withPreviewBackground(draft.url, event.target.value);
    else if (frame && widget) frame.src = withPreviewBackground(`/widgets/frame.html?id=${encodeURIComponent(widget.id)}`, event.target.value);
    if (frame) setPreviewFrameBackground(frame, event.target.value);
  });
  const initialFrame = root.querySelector("#studio-frame");
  if (initialFrame) {
    setPreviewFrameBackground(initialFrame, previewBackground);
    initialFrame.addEventListener("load", () => {
      window.setTimeout(() => {
        if (!initialFrame.isConnected) return;
        initialFrame.closest(".device-frame")?.classList.add("preview-loaded");
      }, 450);
    }, { once: true });
    window.setTimeout(() => {
      if (!initialFrame.isConnected || initialFrame.closest(".device-frame")?.classList.contains("preview-loaded")) return;
      const placeholder = initialFrame.closest(".device-frame")?.querySelector(".preview-skeleton");
      if (placeholder) placeholder.textContent = "Preview is taking longer than expected. Refresh the page to retry.";
    }, 10_000);
  }
  if (active) {
    const startedAt = Date.parse(active.createdAt);
    const elapsedLabel = root.querySelector("[data-elapsed]");
    const timer = window.setInterval(() => {
      if (!root.isConnected) return window.clearInterval(timer);
      if (elapsedLabel) elapsedLabel.textContent = String(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
  }
  root.querySelectorAll("[data-simulate]").forEach((button) => button.onclick = async () => {
    const event = button.dataset.simulate;
    const payload = event === "chat" ? { message: "!attack", user: "Simulated viewer" } : { name: "Simulated viewer", viewers: 8, reward: "Build a widget" };
    try {
      await fetch(`/api/simulate/${event}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      root.querySelector("#studio-frame")?.contentWindow?.postMessage({ kind: "streamforge:event", event: { type: event, payload, simulated: true } }, "*");
    } catch {
      const stateText = root.querySelector("#preview-state");
      if (stateText) stateText.textContent = "Simulation could not be sent. Check that StreamForge is running.";
    }
  });
}

function requestCard(item, state) {
  const threshold = Math.max(1, Number(state.settings.autoBuildVotes) || 5);
  const votes = Math.max(0, Number(item.votes) || 0);
  const percent = Math.min(100, Math.round(votes / threshold * 100));
  const terminal = item.failure ? `<div class="request-outcome" role="status"><strong>${escapeText(friendlyStatus(item.status))}</strong><p>${escapeText(item.failure)}</p><small>${escapeText(nextStep(item.failure))}</small></div>` : "";
  const stepIndex = requestProgressIndex(item);
  const failedStep = ["failed", "rolled_back"].includes(item.status) ? stepIndex : -1;
  const requestSteps = ["Received", "Approved", "Built", "Live"];
  const progress = `<section class="request-progress" aria-label="Request progress"><ol class="request-stepper">${requestSteps.map((label,index)=>`<li class="${index<stepIndex?"is-complete":index===failedStep?"is-failed":index===stepIndex?"is-current":""}" ${index===stepIndex?'aria-current="step"':""}><span class="step-mark">${index<stepIndex?"✓":index+1}</span><span>${label}</span></li>`).join("")}</ol><p class="request-next-action">${escapeText(requestNextAction(item))}</p></section>`;
  const widgetId = item.widgetId || (item.kind !== "remix" ? `community-${item.id.slice(0, 8)}` : "");
  const reviewActions = item.status === "queued" ? `<details class="approve-menu"><summary class="primary"><span aria-hidden="true">✓</span> Approve &amp; build</summary><div class="approve-options"><button type="button" data-action="approve" data-id="${escapeText(item.id)}">Approve &amp; build</button><button type="button" data-action="approve-auto" data-id="${escapeText(item.id)}">Approve, build and go live when checks pass</button><small>Automatic promotion requires the eligible streamer/moderator setting and passing every check.</small></div></details>` : "";
  const statusActions = item.status === "live" ? `<button class="secondary" data-action="offline" data-id="${escapeText(item.id)}" data-widget-id="${escapeText(widgetId)}" ${!widgetId || state.widgets.find((candidate) => candidate.id === widgetId)?.enabled === false ? "disabled" : ""}>${!widgetId || state.widgets.find((candidate) => candidate.id === widgetId)?.enabled === false ? "Offline" : "Take offline"}</button>` : item.status === "rolled_back" || item.status === "failed" ? `<button class="primary" data-action="retry" data-id="${escapeText(item.id)}">Retry</button>` : "";
  const deleteAction = !["approved", "building", "checking"].includes(item.status) ? `<button class="secondary danger" data-action="delete" data-id="${escapeText(item.id)}">Delete</button>` : "";
  const actionButtons = [reviewActions, statusActions, deleteAction].filter(Boolean).join("");
  const actions = actionButtons ? `<div class="request-actions">${actionButtons}<span class="small" data-action-result="${escapeText(item.id)}" aria-live="polite"></span></div>` : "";
  return `<article class="request-card" data-request-status="${escapeText(item.status)}">
    <div class="request-card-head"><div class="request-avatar" aria-hidden="true">${initials(item.requester)}</div><div class="request-author"><strong>${escapeText(item.requester || "Viewer")}</strong><time datetime="${escapeText(item.createdAt)}" title="${escapeText(new Date(item.createdAt).toLocaleString())}">${escapeText(relativeTime(item.createdAt))}</time></div><span class="status-chip status-${escapeText(item.status)}"><i aria-hidden="true">${statusIcon(item.status)}</i>${escapeText(friendlyStatus(item.status))}</span></div>
    <p class="request-card-text">${escapeText(item.text)}</p>
    <div class="request-meta"><span class="tag">${escapeText(item.script || "Latin")}</span>${item.manualReview ? '<span class="tag">Manual review</span>' : ""}<span class="vote-summary">${votes} ${votes === 1 ? "vote" : "votes"}</span></div>
    <div class="vote-track" role="progressbar" aria-label="${votes} of ${threshold} votes" aria-valuemin="0" aria-valuemax="${threshold}" aria-valuenow="${Math.min(votes, threshold)}"><span style="--vote-progress:${percent}%"></span></div>
    ${progress}${terminal}${actions}
  </article>`;
}

function buildActivityPanel(enabled, feed, state, running) {
  if (!enabled || !feed.length) return `<article class="card build-activity-panel"><div class="section-heading"><div><h2>Build activity</h2><p class="helper">A live terminal appears during a Codex or replay run.</p></div><span class="tag">${modeLabel(state.settings.buildMode || "mock")}</span></div><div class="empty-state compact-empty"><span class="empty-icon" aria-hidden="true">⌁</span><strong>${enabled ? "No build activity yet" : "No live build feed"}</strong><span>${enabled ? "Approve a request to see real Codex or replay events here." : "Mock builds use the deterministic safe fixture."}</span></div></article>`;
  const lines = feed.slice(0, 12);
  return `<article class="card build-activity-panel"><div class="section-heading"><div><h2>Build activity</h2><p class="helper">Redacted progress from Codex or a recorded replay.</p></div>${running ? `<span class="live-chip"><i class="live-pulse" aria-hidden="true"></i>${state.settings.buildMode === "replay" ? "DEMO MODE" : "BUILDING"}</span>` : `<span class="tag">${state.settings.buildMode === "replay" ? "DEMO MODE" : "RECENT ACTIVITY"}</span>`}</div>
    <div class="terminal" role="log" aria-live="polite" aria-relevant="additions text"><div class="terminal-top"><span>STREAMFORGE / BUILD</span><span>${state.settings.buildMode === "replay" ? "RECORDED" : "LOCAL"}</span></div>
      ${lines.length ? lines.map((item, index) => `<p class="terminal-line" style="--line-order:${lines.length - index}" data-stage="${escapeText(item.stage)}"><time title="${escapeText(new Date(item.at).toLocaleString())}">${escapeText(relativeTime(item.at))}</time><span class="terminal-stage">${escapeText(item.stage)}</span><span>${escapeText(item.detail)}</span>${item.checks ? `<span class="check-ticks">${Object.entries(item.checks).map(([name, passed]) => `<span class="${passed ? "check-pass" : "check-fail"}" title="${escapeText(name)}: ${passed ? "passed" : "failed"}">${passed ? "✓" : "×"} ${escapeText(shortCheck(name))}</span>`).join("")}</span>` : ""}</p>`).join("") : `<p class="terminal-empty">Waiting for a Codex or replay build.</p>`}<span class="terminal-cursor" aria-hidden="true">▍</span>
    </div></article>`;
}

function nextStep(failure) {
  const text = String(failure).toLowerCase();
  if (text.includes("scan") || text.includes("external url")) return "Remove network access or external URLs from the request, then submit a safer revision.";
  if (text.includes("syntax")) return "Review the request and retry; the draft did not parse as a widget module.";
  if (text.includes("timed out")) return "Try a smaller request or increase the build timeout in Settings.";
  if (text.includes("logged in")) return "Sign in to Codex, verify it in Settings, then approve a new request.";
  if (text.includes("limit")) return "Wait for the Codex usage limit to reset before trying again.";
  if (text.includes("rolled back")) return "The previous live widget was preserved. Review the safety result before retrying.";
  return "Check the safety result and adjust the request before trying again.";
}

function requestProgressIndex(item) {
  if(item.status==="live")return 3;
  if(item.status==="checking"&&item.built===true)return 2;
  if(["failed","rolled_back"].includes(item.status))return item.built===true?2:1;
  if(["approved","building","checking"].includes(item.status))return 1;
  return 0;
}
function requestNextAction(item) {
  if(item.status==="queued")return "Waiting for your OK";
  if(item.status==="approved")return "Approved · the build is starting";
  if(item.status==="building")return "Building your widget";
  if(item.status==="checking")return item.built===true?"Ready for review":"Running safety checks";
  if(item.status==="live")return "Live now";
  if(item.status==="rolled_back")return "Rolled back safely. Review the reason, then retry if appropriate.";
  if(item.status==="failed")return "Blocked. Review the reason and adjust the request before retrying.";
  return "Request received";
}

function friendlyStatus(status) {
  return ({ queued: "Waiting for review", approved: "Approved", building: "Building", checking: "Safety checks", live: "Live now", failed: "Needs attention", rolled_back: "Rolled back safely" })[status] || status;
}
function statusIcon(status) { return ({ queued: "◷", approved: "✓", building: "◌", checking: "◈", live: "✓", failed: "!", rolled_back: "↶" })[status] || "·"; }
function eventLabel(event) { return ({ chat: "Chat", follow: "Follow", sub: "Subscription", raid: "Raid", redeem: "Redemption" })[event] || event; }
function modeLabel(mode) { return ({ mock: "MOCK MODE", codex: "CODEX MODE", replay: "DEMO MODE" })[mode] || "MOCK MODE"; }
function shortCheck(name) { return ({ syntax: "Syntax", network: "Network", forbiddenApis: "API scan", mockMount: "Mock mount" })[name] || name; }
function initials(value) { return String(value || "Viewer").trim().split(/\s+/u).slice(0, 2).map((part) => [...part][0] || "").join("").toLocaleUpperCase() || "V"; }
function relativeTime(value) { const date = new Date(value); const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000)); const label = seconds < 60 ? "just now" : seconds < 3600 ? `${Math.floor(seconds / 60)} minutes ago` : seconds < 86400 ? `${Math.floor(seconds / 3600)} hours ago` : `${Math.floor(seconds / 86400)} days ago`; return label; }
function escapeText(value) { const element = document.createElement("span"); element.textContent = String(value); return element.innerHTML; }
