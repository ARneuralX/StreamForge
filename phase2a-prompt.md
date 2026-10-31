PHASE 2A. The prototype works end to end (Twitch chat build command -> approval -> Codex -> checks -> live widget). Now make it demo-grade. Work in stages, verify each by running the server, and commit after each stage. Keep the security model (sandboxed iframes, no network, static scan, rollback) intact.

1) RELIABILITY
- Persist the build queue, request history, and widget metadata to disk (SQLite or JSON in data/, git-ignored) so restarting the server or refreshing the dashboard loses nothing.
- Use a clear build state machine: queued -> approved -> building -> checking -> live | failed | rolled_back.

2) OVERLAY AUTO-LAYOUT
- Widgets currently overlap (the WELCOME banner is hidden behind the dice roller). Build a layout engine in the overlay host: each widget declares its size and a preferred anchor (top-left, top-right, bottom-left, bottom-right, center); the host packs widgets into non-overlapping slots inside the 1920x1080 canvas, and shifts them automatically when a widget is added or removed. Add a manual position override stored per widget.

3) BUILD FEED V2 (this will be on stream and in the demo video, so it must look great)
- Translate raw Codex events into human stages with a progress bar: Received -> Approved -> Planning -> Writing code -> Safety checks -> Live (or Rolled back).
- Show the request text, requester name, elapsed time, and the safety checks as ticks (syntax, no network access, no forbidden APIs, mounts without errors).
- NEVER show absolute file paths, usernames, or shell commands on the overlay. Redact them everywhere (overlay and dashboard). Raw logs go only into a collapsed dashboard debug panel, with paths redacted.
- Smooth animations, success and failure states.

4) CHAT VOTING
- Viewers vote on queued requests with the chat command "vote <n>" or "+1" (exclamation-mark prefix for commands, same as the existing build command). One vote per user per request, ignore bots. The queue sorts by votes.
- Overlay "Up next" card shows the top 3 requests with live vote counts.
- Dashboard setting for the build mode: manual approval | auto-build the top request after N votes or T seconds | auto for channel-point requests.

5) UNDO
- Keep per-widget version history via git commits. Add Undo/Rollback buttons per widget in the dashboard, and a mods-only "undo" chat command.

6) CHECK THE DICE ROLLER
- Verify that a natural 20 visibly triggers fireworks and not only text. Fix it if not.

Finish by updating README.md and PROGRESS.md, run npx tsc --noEmit, and give me a short summary of what changed and how to test each feature in the browser.
