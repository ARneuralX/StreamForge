You are the lead engineer building "StreamForge" for the Codex x TwitchCon Hackathon from scratch in this empty repo. The goal is a finished, polished, fully working product: every dashboard page separate, every section working, nothing broken, overlapping, blank or misleading.

SPEC FILES (repo root, no /prompts folder)
master-prompt.md, phase2a-prompt-1.md (or phase2a-prompt.md), phase2b-prompt.md, phase3-prompt.md, phase4-prompt.md, phase4b-repair-prompt.md. List the root to find the exact names. Do NOT read or run phase5-prompt.md.
Read each spec only when you start that phase (saves usage). Follow each spec fully, including its own rules, commit prefixes and audit notes.

SCOPE
Execute in order: master -> 2a -> 2b -> 3 -> 4 -> 4b. Stop after Phase 4B closes. Do not start Phase 5.

BOOTSTRAP FIRST
Repo is empty. git init if needed. Create AGENTS.md, PROGRESS.md, .gitignore (.env, .streamforge/, data/, qa-artifacts/, node_modules/, dist/), .env.example, then an initial commit. Never open, print or commit .env.

STEP 0 (CODEX SDK GATE), IMPORTANT
Write scripts/codex-check.mjs exactly as master-prompt.md says, using the exact ThreadOptions names from the installed SDK types (workingDirectory, sandboxMode, approvalPolicy, skipGitRepoCheck). DO NOT run it: the SDK cannot start inside your sandbox. Print the command "node scripts/codex-check.mjs", tell me to run it in my own Terminal, and wait. Continue only after I reply "Step 0 passed". After Step 0, never run it again and never run a real Codex build. All development uses the mock runner and replay mode. No real Twitch traffic either.

DESIGN RULES THAT MUST BE BUILT IN FROM THE START (lessons from an earlier attempt)
1. One-command start: plain `npm start` runs everything and auto-opens http://localhost:PORT/dashboard/ in the browser (open -a "Google Chrome", fall back to open; env OPEN_BROWSER=false disables it and every test script sets it false). If the port is busy print one clear line and exit; add `npm run restart`.
2. .env parsing tolerates quotes and spaces after "=". TWITCH_LIVE_ENABLED=true is the ONLY switch for live Twitch; do not require NODE_ENV=production. BUILD_MODE=codex|replay|mock.
3. Twitch OAuth redirect default is http://localhost:3000/auth/twitch/callback (build it from PORT). Show this exact URL in Settings with a copy button and in the README, because it must match the Twitch Developer Console. Verify scopes, IRC and EventSub details in official Twitch docs; never guess names. IRC chat reading uses an OAuth user token with chat:read. When connecting to the IRC WebSocket send CAP REQ, PASS, NICK and JOIN as SEPARATE WebSocket frames, never one batched frame.
4. Persist the Twitch token in data/twitch-token.json (git-ignored, file mode 0600, atomic write). Load at start, refresh before expiry, auto-connect chat and EventSub on start with no clicks, add a Disconnect Twitch button that deletes it. Never log or expose tokens in any API, UI, error or health output. Keep chat errors and EventSub errors in separate fields so one never hides the other.
5. Codex status: persist the verification result (time, ok) under data/ without secrets. Add a "Verify Codex" button (Overview and Settings): on click only, it runs one tiny SDK task in a temp dir and shows Verified with time or the exact error code. After restart show "Verified earlier at <time>". Never claim verified without a stored real success.
6. Codex runner: use the exact SDK option names, write drafts to a hidden per-widget draft folder, give Codex the exact output path and the required `export default { meta, mount }` shape plus docs/WIDGET_API.md, promote to the live widget path only after scan, syntax and mock-mount pass. Never use one generic error for everything: report specific redacted reasons (no file written, wrong location, syntax error, missing meta or default export, scan blocked with the rule, mock mount threw, timeout, not logged in, limit reached). The real redacted reason must appear on the request card.
7. Live building must be real: stream every real SDK event as readable steps to the Build Feed (overlay), Build Studio and the dashboard; render the draft in a sandboxed preview as soon as it passes the static scan, refresh as the file changes, with the badge "Preview - not live yet". Show elapsed time and current step. Never show paths, usernames or shell commands. Never show activity that is not really happening.
8. A persistent top status bar on every page: Connect Twitch button and dots for Twitch chat, EventSub and Codex with honest states (green connected, amber needs setup, red error) and the exact missing item with a fix hint. Overview has a Setup checklist card: .env credentials, Authorize with Twitch, Codex login and verify, OBS browser source URL, each with a tick.
9. Isolation: each dashboard page is its own module with its own render function and state. Each section inside a page sits in an error boundary; one failing section shows a small friendly card with Retry and never blanks the page.
10. Layout: CSS grid/flex with a spacing scale, no absolute positioning for flow content, no negative margins, no z-index hacks. No overlaps (except data-layer), no horizontal overflow, no clipped text, 32px targets, AA contrast, tested at 1024x768, 1280x720, 1440x900, 1920x1080. Build every page correctly the first time.
11. Consistent states: loading, empty and error states never contradict each other (no "Starter widgets are on the way" next to widgets, no "No recordings" next to recordings).
12. Honesty: show connected or ready only when true. Expired token must show "Token expired, reconnect", never "connected". Never show "Retrying" unless a retry really ran. Replay is labelled DEMO MODE, simulated events SIMULATED.
13. Clean data: no test artifacts in the product (no "Remix verification passed", no "demo" requests). Deduplicate replay recordings, readable titles, never show a redacted command as a title.
14. Library: every widget has a live preview (no blank cards), mounts with the mock API, handles every event it declares, uses theme tokens, and has a health badge. Add/Remove/Import/Preview are idempotent and race-free.
15. Themes and backgrounds: the five overlay presets (Halloween, Neon, Cozy, Retro, Clean) visibly change every widget live without reload. Preview backgrounds (dark, bright, checker, green, transparent) share one implementation with exact colors, persist per surface and never leak into OBS output (default fully transparent).
16. Security stays intact at all times: sandboxed iframes without allow-same-origin, CSP blocking all network, static scan, mock-mount checks, git checkpoint and rollback, untrusted chat text, secrets only in .env, path and username redaction. Never weaken a check to make a test pass. Keep the Widget API backward compatible.

QUALITY GATE after EVERY phase before the next
1. npx tsc --noEmit passes. 2. The server starts in mock or replay mode with an isolated temp data dir and every page loads with zero console errors. 3. Earlier features still work. 4. Commit with the spec's prefix and update PROGRESS.md truthfully (done, next, known issues, unverified).

USAGE DISCIPLINE
My Codex usage is limited. Do not re-read large files without need, use medium reasoning, run focused checks per stage and one browser smoke per phase. If one dev dependency is truly needed for headless QA (puppeteer-core or playwright-core driving installed Chrome), justify it in PROGRESS.md.

RESUME PROTOCOL
After every stage commit and update PROGRESS.md (phase, stage, done, next, known issues). At the start of a new session read PROGRESS.md and git log and continue; never redo finished stages.

PHASE 4B ACCEPTANCE
npm run qa:ui passes (zero overlaps, overflow, console errors, AA contrast at all viewports), npm run check:library passes and writes docs/QA_REPORT.md, theme presets and preview backgrounds are proven by automated pixel checks, Overview is a clean card grid.

FINAL REPORT
Per-phase summary, commands (npm install, npm start, npm run qa:ui, npm run check:library), how to try each feature in the browser, QA highlights, and everything unverified or needing manual setup (Twitch credentials, OBS, codex login, real builds). Then stop; do not begin Phase 5.
