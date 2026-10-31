PHASE 4 (Passport and Safe Mode, Hype Signal, Stream Recap, Scene Presets, opt-in Auto-Clips, multilingual requests, Demo Director). FIRST run git log and confirm the commits prefixed "Phase 3 stage" for all seven Phase 3 stages exist; if any is missing, stop and report it before doing anything else. Then read AGENTS.md, README.md, PROGRESS.md, docs/WIDGET_API.md, docs/HOW_WE_USED_CODEX.md and the source. AUDIT first: extend what exists (event bus, theme tokens, overlay kits, session and vote stores, mock API, scanner, error taxonomy) and never duplicate it. Write a short audit note under a "Phase 4" heading in PROGRESS.md.

GLOBAL RULES
- Security stays intact: sandboxed iframes without allow-same-origin, CSP blocking all network access, the static scan, mock-mount checks, git checkpoints and rollback, chat and build text treated as untrusted data, secrets only in .env, redaction of paths and usernames. Nothing here may weaken it.
- The Widget API stays backward compatible. New members are optional, documented in docs/WIDGET_API.md, supported by the mock API and the scanner allow-list.
- Privacy: hype and recap use aggregates only. Never store or transmit chat message text for them. Chatter display names appear in a recap only when the setting "Include chatter names" is on (default off) and are always escaped. No new telemetry; nothing leaves the machine except the Twitch API calls already in use.
- Honesty in the UI: simulated events and demo data are always labelled SIMULATED or DEMO MODE. Safe Mode and the Passport describe risk reduction and heuristic checks, never medical or absolute safety claims. Never show a feature as active when it is disabled or unavailable.
- Twitch API: verify every scope, endpoint and EventSub type against the official Twitch documentation before using it; never guess a name. If something cannot be verified, leave that feature disabled and say so in PROGRESS.md.
- Every capability that touches Twitch or Codex sits behind a setting with a safe default (Auto-Clips default OFF).
- No new npm dependencies unless unavoidable (justify in PROGRESS.md). No external fonts, CDNs or network calls from the overlay or widgets.
- Keep the dark glass style (purple, mint, pink, gold) and good accessibility: labels, visible focus, contrast.
- Usage discipline: no real Codex builds while developing; use the mock runner, recorded events and small targeted node tests. Per stage run only npx tsc --noEmit, JS syntax checks and targeted tests. Run ONE final end-to-end smoke test in the last stage. Use medium reasoning. Commit after each stage with the prefix "Phase 4 stage N:".

STAGE 1 - WIDGET PASSPORT AND SAFE MODE
- Passport: computed server-side from widget source and meta during the existing checks and recomputed on import, never trusted from files. Contents: events listened to (static detection of api.on calls), sound use, storage use, hype use, theme tokens used, declared size and anchor, scan summary, and a motion and flash risk level (low, medium, high) from heuristics such as timers or keyframes under 333 ms toggling large-area color or opacity, fast infinite animations and strobe-like patterns. Label it clearly as a heuristic.
- Show a compact passport card in Widgets and in Library, store it in widget metadata and the registry, and include it (informational only) in .sfwidget exports.
- Safe Mode with three levels (off, reduced, minimal) via a dashboard toggle, an overlay URL parameter and a moderator chat command. Widget API additions: api.safeMode, api.motionScale (1, 0.5, 0.15 by level) and an event when it changes.
- Update the starter widgets and Chat Runner to reduce particles, flashing and animation speed with motionScale and to never exceed 3 flashes per second at any level. Optional setting: in Safe Mode, ask via a toast before pausing widgets with high flash risk.
- Contrast check for theme tokens (WCAG ratio): warn in the dashboard below 4.5:1 and offer an auto-fix to the nearest accessible color.
- Document with honest wording in the README and docs.

STAGE 2 - HYPE SIGNAL
- Server engine from the event bus: messages per second over 10 s and 60 s windows, unique chatters, emote density (from IRC emote tags when available), command-use rate, plus boosts from follow, subscription, raid size and redemption. Normalize against a slow-moving per-channel baseline so small and large chats both reach the full range, smooth with an exponential moving average, apply decay, clamp 0 to 100. Use a ring buffer to keep CPU low.
- Output {value, level: calm|warm|hot|peak, trend: rising|steady|falling} with hysteresis so levels do not flicker. Settings: sensitivity (low, normal, high), manual boost and mute.
- Aggregates only; no usernames or message text in the signal.
- Widget API: optional read-only api.hype snapshot and api.on('hype') throttled to at most 4 updates per second over postMessage. Add to the mock API, the scanner allow-list and docs.
- Starter widgets react subtly when hypeReactive is true (boss bar rage, effect intensity, goal bar glow, countdown tint) and always scale with api.motionScale.
- Dashboard: live hype meter with a sparkline and a "simulate chat energy" slider (labelled SIMULATED when used). Optional overlay hype meter toggle.
- Tests with synthetic traffic: quiet, steady, spike, raid burst and decay.

STAGE 3 - STREAM SESSIONS AND RECAP CARD
- Session lifecycle: start and end (auto-start on first event, optional auto-end after idle minutes), persisted as JSON under data/sessions (git-ignored).
- Track aggregates: requests, approvals, live builds, rollbacks, remixes, votes, unique chatters, commands by type, follows, subs, raids, redemptions, hype peak with time, a hype series downsampled to 120 points, clips created (stage 5) and total build time. Top contributors only when "Include chatter names" is on.
- Recap generator, client-side with no dependencies: canvas renders a shareable PNG in portrait (1080x1350) and landscape (1920x1080), themed by the current theme tokens, with a hype sparkline, a headline such as "Chat built N widgets", a stats grid, optional shout-outs and the StreamForge wordmark. Download PNG and Copy image buttons, plus an animated end-of-stream overlay scene at /overlay/?recap=1.
- Handle empty sessions ("No activity yet"), long names, Unicode and RTL via system font stacks, and high-DPI screens.
- API: GET /api/sessions, GET /api/sessions/:id, GET /api/sessions/:id/recap.json, delete session, export JSON. Test with synthetic sessions: empty, tiny, huge, Unicode names.

STAGE 4 - SCENE PRESETS
- Presets: Starting Soon, Be Right Back, Hype Mode, Ending. Each combines a widget set (reusing Overlay Kits), a theme, a Safe Mode level and optional hype sensitivity. Built-ins are read-only; users can duplicate and edit, saved under data.
- One-click switching in the dashboard, a moderator chat command "scene <name>", smooth transitions and Undo for the last switch.
- Switching only toggles which widgets are on scene and remembers the previous state; it never deletes user widgets. Starting Soon includes a countdown; Be Right Back includes a calm animation.

STAGE 5 - AUTO-CLIPS (OPT-IN)
- Verify the Create Clip endpoint, required scope and rate limits in the official docs. Add the extra scope only through an explicit "Enable auto-clips" re-authorization flow with a clear explanation. Default OFF; existing tokens keep working without it.
- Triggers, each toggleable: hype at peak for N seconds, widget moments, a manual dashboard button and a moderator chat command. Global cooldown (default 120 s), per-session cap (default 10), only while the channel is live (check stream status; if not live, say so and do nothing).
- Widget-to-host event api.emit('moment', {kind, label}) with an allow-listed set of kinds, rate-limited and validated, no free-form data. Update the dice roller (natural 20) and goal bar (goal reached) to emit moments.
- Show created clip links in the dashboard and the session recap. Handle missing scope, not live, rate limit and API errors with friendly messages from the error taxonomy. Never retry in a loop.

STAGE 6 - MULTILINGUAL REQUESTS
- Normalize request text (Unicode NFKC, strip control and bidi-override characters, collapse whitespace), measure length in code points, keep the 300 limit, and run the blocklist on normalized text with simple homoglyph and leetspeak folding.
- Detect the script heuristically without dependencies (Latin, Bengali, Arabic, Cyrillic, CJK and so on), show it as a chip on the request card, and pass it to the Codex prompt with an instruction to keep widget text in the requester's language when it fits while code identifiers and comments stay English.
- The blocklist is strongest for English, so non-English requests from non-moderators always need manual approval (setting, default on), even in auto-build or vote-threshold modes.
- Dashboard and overlay font stacks must render Bengali, Arabic (RTL) and CJK correctly. Test Bengali, Arabic, Spanish and Japanese samples, including injection-style text, to confirm it is still treated as untrusted.

STAGE 7 - DEMO DIRECTOR AND FINAL POLISH
- Demo Director: a dashboard panel with a "Run demo sequence" button that plays a repeatable scripted sequence of SIMULATED events (chat energy ramp, natural 20, follow, subscription, raid, theme switch, scene change, a replayed build). Show a visible SIMULATED badge on the overlay and in recaps. Stop and speed controls. The script lives in a JSON file. It never contacts Twitch or Codex.
- Cleanup: remove leftover test artifacts and dead code; make sure .gitignore covers .env, .streamforge/ and data/sessions; stage no secrets.
- Docs: update README.md (features, settings, commands, privacy notes, how to record screenshots), docs/WIDGET_API.md (api.hype, api.safeMode, api.motionScale, api.emit), docs/HOW_WE_USED_CODEX.md (append Phase 4 from git history, facts only) and PROGRESS.md (tick every item truthfully).
- ONE final end-to-end smoke test in replay or mock mode: simulate every event type, hype meter, Safe Mode levels, passports, recap PNG generation, scene switching, the disabled Auto-Clips message, multilingual validation and the demo sequence. Confirm no console errors, run npx tsc --noEmit, commit.
- Finish with a concise per-stage summary, exactly how to try each feature in the browser, and a list of anything left disabled or unverified.
