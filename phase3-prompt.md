PHASE 3 (six features + final polish). Phases 2A and 2B are complete and committed. Read AGENTS.md, README.md, PROGRESS.md, docs/WIDGET_API.md and the existing source first. AUDIT before building: several of these features already exist in part (live overlay, Build Feed v2, library preview, Add to scene, remix, voting). Extend what exists; never duplicate it. Write a short audit note under a "Phase 3" heading in PROGRESS.md.

GLOBAL RULES
- Keep the security model intact: sandboxed iframes without allow-same-origin, a CSP that blocks all network access, the static scan of forbidden APIs, mock-mount checks, git checkpoints and rollback, chat and build text treated as untrusted data, secrets only in .env, path and username redaction everywhere. Nothing in this phase may weaken it. Any widget code that runs in a preview or on the overlay must pass the static scan first.
- Keep the Widget API stable. Any extension (theme tokens, game state) must be backward compatible, documented in docs/WIDGET_API.md, and supported by the mock API and the static scanner.
- No new npm dependencies unless truly unavoidable; if you add one, justify it in PROGRESS.md.
- Keep the existing dark glass UI style (purple, mint, pink, gold). Use clear labels, visible keyboard focus states and aria labels.
- Be honest in the UI: never show a message claiming a retry, a live build, or Codex activity unless that really is happening. Replay mode must keep working and keep its visible DEMO MODE badge.
- Usage discipline: do NOT start real Codex builds while developing. Use the mock runner, recorded replay events and unit-style tests. Verify each stage with npx tsc --noEmit, JavaScript syntax checks and small targeted node tests. Do not run repeated browser or end-to-end sessions per stage; run ONE final end-to-end smoke test in the last stage. Use medium reasoning and avoid re-reading large files without need.
- Commit after each stage with the message prefix "Phase 3 stage N:". Update README.md and PROGRESS.md as you go.

STAGE 1 - ERROR HANDLING AND RESILIENCE (feature 6)
- Define a typed error taxonomy with stable codes and friendly, plain-language messages: CODEX_NOT_LOGGED_IN, CODEX_LIMIT_REACHED, CODEX_TIMEOUT, CODEX_BAD_OUTPUT, CHECKS_FAILED, ROLLED_BACK, TWITCH_TOKEN_EXPIRED, CHAT_DISCONNECTED, EVENTSUB_DISCONNECTED, QUEUE_FULL, REQUEST_REJECTED, WIDGET_RUNTIME_ERROR.
- Detect Codex usage-limit and auth failures from the SDK error output. When the limit is reached, pause real builds, show a clear message with next steps, and offer the Library and Replay fallback, clearly labelled. Never loop.
- Automatic retry is OFF by default. Add a dashboard setting "Retry a failed build once" (default off). Only show retrying wording when a retry really runs. Add a build timeout setting with a sensible default.
- Runtime widget error boundary: iframes report uncaught errors and unhandled rejections to the host through postMessage. The host disables the widget, shows a toast, logs the redacted error, and offers one-click Undo.
- Health panel in the dashboard plus GET /api/health: Twitch chat, EventSub, token expiry, Codex availability, queue depth, last error. Calm, friendly wording; never expose secrets, paths or stack traces.
- Global error boundaries for the overlay and dashboard so a failure shows a small friendly card instead of a blank screen. Make Twitch reconnects use quiet exponential backoff.

STAGE 2 - LIVE BUILD STUDIO (feature 1, dynamic visual live preview)
- In the dashboard add a split "Build Studio" view. Left: the human-readable build stages (redacted, no raw shell output). Right: a live preview iframe of the widget being built, plus the sandbox simulate buttons (chat, follow, sub, raid, redeem) wired to the mock API.
- As soon as a draft widget file exists, run the static scan; if it passes, render it in the sandboxed preview with a clear badge "Preview - not live yet". If the scan fails, show "Blocked by safety check" with the redacted reason. A preview never reaches the real overlay until all checks pass and the streamer (or auto mode) promotes it.
- Background toggle for the preview (dark, bright, checker). Smooth transition when the final version replaces the draft. Add a compact "Now building" card to the overlay Build Feed that shows the stage and, when safe, a small preview thumbnail.
- Works in Replay mode with recorded events and is labelled DEMO MODE.

STAGE 3 - THEMES AND OVERLAY KITS (feature 4, AI-powered dynamic stream overlays)
- Extend the Widget API with optional theme tokens: api.theme exposes validated CSS variables (accent, accent2, background, text, glow, radius, fontStack from a safe system-font list, animationSpeed). Widgets that ignore tokens keep working. Update the six starter widgets to use tokens, plus the mock API and the scanner.
- Theme system: presets (Halloween, Neon, Cozy, Retro, Clean) applied live and instantly to every widget with no rebuild. A moderator chat command and a dashboard control apply a theme.
- AI theme generation: a request such as "a spooky rainy night theme" may ask Codex to return ONLY a JSON theme object, never code. Validate it strictly against a schema (hex colors, bounded numbers, fonts only from the allowed list) and reject anything else. If Codex is unavailable, fall back to the closest preset and say so.
- Overlay Kits: one-click kits that add several prebuilt library widgets plus a theme (Halloween kit: spooky alerts, ghost effect, countdown; Cozy kit; Neon kit). Kits reuse existing library widgets and cost no Codex usage. Add 3 kits with good-looking previews.

STAGE 4 - PROMPT-TO-ASSET TEMPLATES (feature 2)
- Add a template gallery to "Start a build". Config in templates.json: category (Alerts, Games, Polls, Timers, Seasonal, Utility), title, short description, the build prompt, an estimated build time label, and an optional prebuilt library widget id.
- Each card has two actions: "Add instantly" (uses the prebuilt library widget, no Codex) and "Build with Codex" (queues the prompt through the normal approval flow). Add 12 good templates, a "Surprise me" button, and theme chips that append a style hint to the prompt. Users can edit the prompt before queueing.
- Template prompts must be short, safe and Widget-API-aware. Add a test that every template prompt passes the request validator.

STAGE 5 - CHAT-CONTROLLED LIVE GAME (feature 3)
- Add a starter widget "Chat Runner": a dependency-free dodge or runner game with a score and a chat leaderboard. Chat plays with a jump command; obstacles, speed and background are driven by a small validated game-state config kept in widget storage.
- Instant safe game commands, no Codex needed, with cooldowns and per-user limits: change background color from an allowed palette, speed (slow, normal, fast), add or remove an obstacle type from a preset list, toggle night mode. Validate every parameter; unknown input gets a friendly reply or is ignored.
- Big creative changes go through the existing remix flow (with voting). Show a small ticker on the widget with the last accepted change, for example "mod: speed fast - by name".
- Document the commands in the in-overlay hint card and the README. Keep widget code readable and API-only.

STAGE 6 - VOICE PROMPTS (feature 5)
- Add a microphone button next to the build text box using the browser Web Speech API with feature detection; hide it when unsupported. Push-to-talk, a language selector (default en-US), a live interim transcript, and a mandatory confirm step: the transcript lands in the text box for editing and nothing is queued until the user presses Add to queue.
- Friendly handling of permission denied, no speech, and network errors. Add a short privacy note in the UI and README that the browser may send audio to its speech service.

STAGE 7 - FINAL POLISH AND DOCS
- Remove leftover test artifacts, including the caption "Remix verification passed." in the dice roller widget and any stray demo text.
- Make sure .gitignore protects .env and .streamforge/. Do not stage secrets.
- Update README.md with every new feature, commands, settings and how to capture screenshots. Update docs/WIDGET_API.md. Tick every item in PROGRESS.md truthfully, including the old unchecked real-chat item.
- Create docs/HOW_WE_USED_CODEX.md from the git history: the stages, commit hashes, what Codex built, and how the safety model works. Only state facts visible in the repository.
- Run ONE final end-to-end smoke test: start the server in replay or mock mode, simulate every event type, confirm the Build Studio, themes, templates, game commands, voice button visibility and error panels load without errors; run npx tsc --noEmit. Commit.
- Finish with a short summary of what changed per stage and exactly how to try each feature in the browser.
