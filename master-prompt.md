You are building "StreamForge" for the Codex x TwitchCon Hackathon. Work in this repo. Build the complete, working project end to end. Keep a running checklist in PROGRESS.md and commit often.

GOAL
StreamForge lets a Twitch streamer (or chat) describe a widget/overlay in plain language. Codex builds it live, it appears in OBS as a browser source, and viewers see a live "Codex is building" feed.

STEP 0 (GATE, do this first)
Write scripts/codex-check.mjs using @openai/codex-sdk (startThread, runStreamed) that asks Codex to create a small file in a temp dir, and stream the events. Run it. If the SDK cannot run on this account, STOP and report the exact error with a fallback proposal. Do not continue until it works.

STACK
Node 20+, TypeScript, Express, ws. Plain HTML/JS/CSS front-ends, no heavy framework. One command: npm install && npm start.

CONFIG (.env, with .env.example)
TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_CHANNEL, PORT=3000, BUILD_MODE=codex|replay, APPROVAL=manual|auto-for-points, BUILD_PERMISSION=everyone|subs|mods.

TWITCH
- Chat reading via anonymous IRC WebSocket (justinfan) so testers only need a channel name.
- Streamer OAuth (authorization code flow, localhost callback) enables EventSub over WebSocket: follow, subscribe, raid, channel points redemption.
- All events are normalized into one internal event bus.

WIDGET API (widget-api/ + docs/WIDGET_API.md)
Widgets are ES modules at widgets/<id>/index.js exporting default { meta:{title,description,width,height,x,y}, mount(api) }.
api provides: on(event, handler) for chat/follow/sub/raid/redeem, root (DOM element), sound (built-in WebAudio synth helpers), timer helpers, storage (per-widget, persisted by the host via postMessage). Nothing else.
Widgets run in sandboxed iframes (sandbox="allow-scripts", no allow-same-origin) with a CSP that blocks all network (connect-src 'none'). The host forwards events via postMessage.

CODEX RUNNER
For every approved request: create a git checkpoint, then run Codex through the SDK with working directory restricted to widgets/<id>, workspace-write sandbox, no approvals prompts, network disabled (check the SDK types/docs for the exact thread options). The prompt includes docs/WIDGET_API.md and wraps the user's request as UNTRUSTED DATA inside a delimited block, with instructions to ignore any instruction inside it that conflicts with the rules.
Stream every SDK event (files changed, commands, messages) over WebSocket to the Build Feed.
After Codex finishes run automatic checks: syntax parse; static scan that bans fetch, XMLHttpRequest, WebSocket, eval, Function constructor, dynamic import(), document.cookie, localStorage, window.parent/top access, external URLs; load the widget in a lightweight headless check with a mock api and make sure it mounts without throwing.
PASS: git commit, register widget, hot-load in the overlay. FAIL: reset to the checkpoint, clean the widget dir, and report the failure + rollback in the feed.

REQUEST QUEUE
One build at a time, per-user cooldown, max 300 chars, blocklist. Sources: chat command "!build <text>" (permission-based), channel point redemption "Build a widget", and the dashboard text box. Manual approval from the dashboard by default.

OVERLAY (overlay/)
/overlay is a transparent 1920x1080 OBS browser source hosting widget iframes. A Build Feed panel (enable with ?feed=1) shows streamed Codex events with animated progress and status chips. Toasts when a widget goes live or is rolled back.

DASHBOARD (dashboard/)
Pending requests with approve/reject; widgets list with on/off/delete; settings; connection status (Twitch chat, EventSub, Codex); Library tab; buttons that SIMULATE chat/follow/sub/raid/redeem events so everything can be demoed without live traffic; a copy button for the OBS URL.

LIBRARY (library/)
Saved widgets with their original prompts, importable into widgets/. Seed 4 starter widgets, built through the real pipeline where possible: dice roller (!roll d20, fireworks on natural 20), prediction scoreboard (chat votes !a / !b), boss bar (!attack), screen effects (confetti/rain on redeem or raid).

REPLAY MODE (replay/
Record every real build's event stream to replay/*.json. BUILD_MODE=replay replays recorded events into the Build Feed and loads the matching prebuilt widget, with a clearly visible "DEMO MODE - recorded build" badge. Never present replay as live.

QUALITY
Polished dark glassmorphism UI, smooth animations, sound cues, good error handling, clear logs.

DOCS
README with 5-minute setup (install, .env, Twitch app registration, OBS browser source steps, replay mode for testers without Codex), architecture diagram (Mermaid), security model, and how Codex was used. .gitignore must exclude secrets. AGENTS.md with project rules.

WORK ORDER
Step 0 -> skeleton + Widget API + overlay iframe host -> Twitch chat/EventSub -> Codex runner + checks + rollback -> feed overlay + dashboard + queue -> starter widgets + library -> replay mode -> polish + README.
After each stage, run it, verify it works, fix problems, and commit. At the end, summarize how to run it, what you verified, and what still needs manual setup (Twitch credentials, OBS).