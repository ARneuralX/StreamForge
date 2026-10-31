import { readPreviewBackground, savePreviewBackground, setPreviewFrameBackground, withPreviewBackground } from "../preview-backgrounds.js";

const buildStages = ["Received", "Approved", "Planning", "Writing code", "Safety checks", "Live"];

export async function queue(root, state, refresh) {
  const requests = [...state.requests].sort((a, b) => (b.votes || 0) - (a.votes || 0) || b.createdAt.localeCompare(a.createdAt));
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
        <div class="section-heading"><div><h2>Build queue</h2><p class="helper">Requests stay visible with their review status and vote progress.</p></div><span class="tag">${requests.filter((item) => item.status === "queued").length} waiting</span></div>
        ${active ? `<section class="active-build" aria-live="polite" data-build-state="${escapeText(active.status)}">
          <div class="active-build-heading"><div><span class="eyebrow">${mode === "replay" ? "RECORDED RUN" : "ACTIVE BUILD"}</span><h3>${escapeText(active.text)}</h3></div><span class="tag status-${escapeText(active.status)}">${friendlyStatus(active.status)}</span></div>
          <ol class="build-stepper" aria-label="Build progress">${buildStages.map((stage, index) => `<li class="${index < currentIndex ? "is-complete" : index === currentIndex ? "is-current" : ""}" ${index === currentIndex ? 'aria-current="step"' : ""}><span class="step-mark">${index < currentIndex ? "✓" : index + 1}</span><span>${escapeText(stage === "Live" ? "Live or rolled back" : stage)}</span></li>`).join("")}</ol>
          <div class="build-progress" role="progressbar" aria-label="Build progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.max(0, (currentIndex + 1) * 16)}"><span style="--progress:${Math.max(0, (currentIndex + 1) * 16)}%"></span></div>
          <div class="row build-timing"><span class="live-pulse" aria-hidden="true"></span><span><span data-elapsed>${elapsed}</span>s elapsed</span><span>${escapeText(activeFeed?.detail || "Waiting for the next build update.")}</span></div>
        </section>` : `<div class="empty-state compact-empty"><span class="empty-icon" aria-hidden="true">◇</span><strong>No build is running</strong><span>Approve a queued request to begin.</span></div>`}
        ${requests.length ? `<div class="request-list">${requests.map((item) => requestCard(item, state)).join("")}</div>` : `<div class="empty-state"><span class="empty-icon" aria-hidden="true">✳</span><strong>Your queue is clear</strong><span>Add a widget idea from Overview and it will appear here.</span><a class="button" href="#overview">Add an idea</a></div>`}
      </article>

      <div class="studio-side-column">
        <article class="card studio-preview build-preview-panel">
          <div class="section-heading"><div><h2>Sandbox preview</h2><p id="preview-badge" class="helper">${draft ? "Preview - not live yet" : widget ? "Current scene widget · isolated" : "Waiting for a widget"}</p></div>
            <label class="compact-select" for="preview-background">Background<select id="preview-background"><option value="dark" ${previewBackground === "dark" ? "selected" : ""}>Dark</option><option value="bright" ${previewBackground === "bright" ? "selected" : ""}>Bright</option><option value="checker" ${previewBackground === "checker" ? "selected" : ""}>Checker</option><option value="green" ${previewBackground === "green" ? "selected" : ""}>Green</option><option value="transparent" ${previewBackground === "transparent" ? "selected" : ""}>Transparent</option></select></label>
          </div>
          <p id="preview-state" class="small">${draft ? "Safety-checked draft · not live yet" : widget ? `Previewing ${escapeText(widget.title)} from the current scene.` : "Add a Library widget to preview it here."}</p>
          ${draft ? `<div class="device-frame"><div class="device-toolbar"><i></i><i></i><i></i><span>Sandbox · Preview only</span></div><div class="preview-skeleton" aria-hidden="true">Starting checked preview…</div><iframe id="studio-frame" class="library-preview" title="Preview - not live yet" loading="lazy" sandbox="allow-scripts" src="${escapeText(withPreviewBackground(draft.url, previewBackground))}"></iframe></div>` : widget ? `<div class="device-frame"><div class="device-toolbar"><i></i><i></i><i></i><span>Sandbox · ${escapeText(widget.title)}</span></div><div class="preview-skeleton" aria-hidden="true">Starting sandbox preview…</div><iframe id="studio-frame" class="library-preview" title="Sandboxed widget preview" loading="lazy" sandbox="allow-scripts" src="${escapeText(withPreviewBackground(`/widgets/frame.html?id=${encodeURIComponent(widget.id)}`, previewBackground))}"></iframe></div>` : `<div class="empty-state compact-empty"><span class="empty-icon" aria-hidden="true">▧</span><strong>No preview available</strong></div>`}
          <div class="preview-events"><div class="section-heading"><div><h3>Preview events</h3><p class="helper">Local events are simulated.</p></div><span class="tag">SIMULATED</span></div><div class="sim-grid">${["chat", "follow", "sub", "raid", "redeem"].map((event) => `<button type="button" data-simulate="${event}">${eventLabel(event)}</button>`).join("")}</div></div>
        </article>
        ${buildActivityPanel(buildActivity, feed, state, Boolean(active))}
      </div>
    </section>`;

  root.querySelectorAll("[data-action]").forEach((button) => button.onclick = async () => {
    button.disabled = true;
    try {
      const response = await fetch(`/api/requests/${button.dataset.id}/${button.dataset.action}`, { method: "POST" });
      if (!response.ok) button.disabled = false;
      await refresh();
    } catch {
      button.disabled = false;
      const result = root.querySelector(`[data-action-result="${button.dataset.id}"]`);
      if (result) result.textContent = "Could not update this request. Try again.";
    }
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
  const reviewActions = item.status === "queued" ? `<div class="request-actions"><button class="primary" data-action="approve" data-id="${escapeText(item.id)}"><span aria-hidden="true">✓</span> Approve</button><button class="secondary" data-action="reject" data-id="${escapeText(item.id)}"><span aria-hidden="true">×</span> Reject</button><span class="small" data-action-result="${escapeText(item.id)}" aria-live="polite"></span></div>` : "";
  return `<article class="request-card" data-request-status="${escapeText(item.status)}">
    <div class="request-card-head"><div class="request-avatar" aria-hidden="true">${initials(item.requester)}</div><div class="request-author"><strong>${escapeText(item.requester || "Viewer")}</strong><time datetime="${escapeText(item.createdAt)}" title="${escapeText(new Date(item.createdAt).toLocaleString())}">${escapeText(relativeTime(item.createdAt))}</time></div><span class="status-chip status-${escapeText(item.status)}"><i aria-hidden="true">${statusIcon(item.status)}</i>${escapeText(friendlyStatus(item.status))}</span></div>
    <p class="request-card-text">${escapeText(item.text)}</p>
    <div class="request-meta"><span class="tag">${escapeText(item.script || "Latin")}</span>${item.manualReview ? '<span class="tag">Manual review</span>' : ""}<span class="vote-summary">${votes} ${votes === 1 ? "vote" : "votes"}</span></div>
    <div class="vote-track" role="progressbar" aria-label="${votes} of ${threshold} votes" aria-valuemin="0" aria-valuemax="${threshold}" aria-valuenow="${Math.min(votes, threshold)}"><span style="--vote-progress:${percent}%"></span></div>
    ${terminal}${reviewActions}
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
