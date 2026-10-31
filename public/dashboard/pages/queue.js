export async function queue(root, state, refresh) {
  const requests = [...state.requests].sort((a, b) => (b.votes || 0) - (a.votes || 0) || b.createdAt.localeCompare(a.createdAt));
  const active = requests.find((item) => ["building", "checking"].includes(item.status));
  const activeFeed = state.buildFeed?.find((item) => item.request?.id === active?.id);
  const widget = state.widgets.find((item) => item.enabled) || state.widgets[0];
  const draft = state.draftPreview;
  const buildFeed = state.buildFeed || [];

  root.innerHTML = `<header class="page-head"><div><h1>Build Studio</h1><p>Review the live, redacted build stages and preview checked drafts in an isolated frame.</p></div>${state.settings.buildMode === "replay" ? '<span class="tag">DEMO MODE</span>' : state.settings.buildMode === "codex" ? '<span class="tag">LIVE BUILD MODE</span>' : '<span class="tag">MOCK MODE</span>'}</header>
  <section class="studio-grid">
    <article class="card">
      <h2>Build stages</h2><p>Paths, shell output and private identifiers are never shown.</p>
      ${active ? `<div class="request"><strong>${escapeText(active.text)}</strong><span class="tag">${escapeText(activeFeed?.stage || (active.status === "checking" ? "Safety checks" : "Writing code"))}</span><span class="small">${Math.max(0, Math.floor((Date.now() - Date.parse(active.createdAt)) / 1000))} seconds · ${escapeText(activeFeed?.detail || (draft ? "Draft passed safety checks; preview is not live yet." : "Waiting for the next build update."))}</span></div>` : '<div class="empty">No build is running. Queued requests appear below for moderator review.</div>'}
      <div class="stage-list"><span>1 · Received</span><span>2 · Approved</span><span>3 · Planning</span><span>4 · Writing code</span><span>5 · Safety checks</span><span>6 · Live or rolled back</span></div>
      <h3>Requests</h3>${requests.length ? requests.map((item) => `<article class="request"><div class="request-text">${escapeText(item.text)}</div><div class="row"><span class="tag">${escapeText(item.status)}</span><span class="tag">${escapeText(item.script || "Latin")}</span>${item.manualReview ? '<span class="tag">Manual review</span>' : ""}<span class="tag">${item.votes || 0} votes</span><span class="small">${escapeText(item.requester)} · ${new Date(item.createdAt).toLocaleString()}</span></div>${item.failure ? `<p class="small">${escapeText(item.failure)}</p>` : ""}${item.status === "queued" ? `<div class="row"><button data-action="approve" data-id="${item.id}">Approve</button><button data-action="reject" data-id="${item.id}">Reject</button></div>` : ""}</article>`).join("") : '<div class="empty">No requests yet. Add an idea from Overview to start.</div>'}
    </article>
    <article class="card studio-preview"><div class="row spread"><div><h2>Sandbox preview</h2><p id="preview-badge">${draft ? "Preview - not live yet" : "Current widget · isolated"}</p></div><label for="preview-background">Background<select id="preview-background"><option value="dark">Dark</option><option value="bright">Bright</option><option value="checker">Checker</option><option value="green">Green</option><option value="transparent">Transparent</option></select></label></div>
      <p id="preview-state" class="small">${draft ? "Safety-checked draft preview." : widget ? `Previewing ${escapeText(widget.title)}. This is a current widget, not a build draft.` : "No widgets are available to preview."}</p>
      ${draft ? `<iframe id="studio-frame" class="library-preview" title="Preview - not live yet" sandbox="allow-scripts" src="${escapeText(draft.url)}"></iframe>` : widget ? `<iframe id="studio-frame" class="library-preview" title="Sandboxed widget preview" sandbox="allow-scripts" src="/widgets/frame.html?id=${encodeURIComponent(widget.id)}&preview=1"></iframe>` : '<div class="empty">Add a Library widget to preview it here.</div>'}
      <h3>Simulate an event</h3><div class="sim-grid">${["chat", "follow", "sub", "raid", "redeem"].map((event) => `<button data-simulate="${event}">${event}</button>`).join("")}</div>
      <details class="card" style="margin-top:14px"><summary>Build activity and safety checks</summary><div id="build-activity">${buildFeed.length ? buildFeed.map((item) => `<p class="small">${escapeText(item.request?.simulated ? "DEMO MODE" : item.stage)} · ${escapeText(item.detail)}${item.checks ? ` · ${Object.values(item.checks).every(Boolean) ? "All checks passed" : "Check result recorded"}` : ""}</p>`).join("") : state.requestHistory.slice(0, 12).map((item) => `<p class="small">${escapeText(item.status)} · ${escapeText(item.text)}</p>`).join("") || '<p class="small">No build activity yet.</p>'}</div></details>
    </article>
  </section>`;

  root.querySelectorAll("[data-action]").forEach((button) => button.onclick = async () => {
    await fetch(`/api/requests/${button.dataset.id}/${button.dataset.action}`, { method: "POST" });
    await refresh();
  });
  root.querySelector("#preview-background")?.addEventListener("change", (event) => {
    const frame = root.querySelector("#studio-frame");
    if (frame && draft) frame.src = `${draft.url}?bg=${event.target.value}`;
    else if (frame && widget) frame.src = `/widgets/frame.html?id=${encodeURIComponent(widget.id)}&preview=1&bg=${event.target.value}`;
  });
  root.querySelectorAll("[data-simulate]").forEach((button) => button.onclick = async () => {
    const event = button.dataset.simulate;
    const payload = event === "chat" ? { message: "!attack", user: "Simulated viewer" } : { name: "Simulated viewer", viewers: 8, reward: "Build a widget" };
    await fetch(`/api/simulate/${event}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    root.querySelector("#studio-frame")?.contentWindow?.postMessage({ kind: "streamforge:event", event: { type: event, payload, simulated: true } }, "*");
  });
}

function escapeText(value) {
  const element = document.createElement("span");
  element.textContent = String(value);
  return element.innerHTML;
}
