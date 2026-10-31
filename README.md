# StreamForge

StreamForge is a local dashboard and OBS browser overlay for community-driven stream widgets. Dashboard pages are separate modules, widgets run in isolated frames, and stream events can be simulated without contacting Twitch.

## Install and run

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and add only credentials you intend to use. Never commit `.env`.
3. Run `npm install`, then `npm start`.
4. StreamForge opens `http://localhost:3000/dashboard/` in Chrome when available. Set `OPEN_BROWSER=false` to suppress that. Set `PORT` to select another port; `npm run restart` restarts the local server.

The Twitch Developer Console redirect URL is `http://localhost:3000/auth/twitch/callback` (use the selected port if changed). The OBS browser source URL is `http://localhost:3000/overlay/`. The overlay defaults to a transparent background. Simulate controls are local and labelled; they do not contact Twitch.

## Dashboard features

- **Overview:** request form, setup checklist, simulated chat/follow/sub/raid/redeem events, theme presets, overlay kits, twelve prompt templates, and optional voice prompts.
- **Build queue / Build Studio:** approve or reject queued requests; view human-readable stages, a sandboxed scanned-draft preview, preview backgrounds, event simulation, and safety results.
- **Widgets:** toggle widgets, arrange their overlay positions, submit Remix requests and undo a prior Git version.
- **Library:** browse sandboxed previews, inspect the original prompt and creator, add/remove widgets, and import/export `.sfwidget` files. Imports must pass the static scan and mock mount.
- **Settings:** approval mode, vote/time thresholds, retry preference and timeout, Twitch redirect URL, and a non-secret service health panel.

The request queue supports `!build <idea>`, `!remix <widget> <change>`, `!vote N`, `vote N`, `+1`, and moderator `undo <slug>`. A moderator can also use `!theme <Halloween|Neon|Cozy|Retro|Clean>`. Voting is one per account per request. Auto-approval can use a vote threshold, elapsed time, or the simulated channel-point reward.

## Themes and kits

Five validated presets—Halloween, Neon, Cozy, Retro and Clean—update active overlay widgets without a rebuild. Theme suggestions choose a closest preset while Codex generation is unavailable. Three kits add existing Library widgets and apply a theme: Halloween, Cozy stream and Neon arcade. The Widget API documents validated theme tokens and compatibility.

## Widget Passport and Safe Mode

Widgets and Library cards show a server-computed Passport with detected event/API use, declared size and anchor, the current scan summary, and a motion-risk heuristic. It is informational, not a certification. Safe Mode is available as Off, Reduced or Minimal in Overview, via moderator `!safe-mode reduced`, or as an overlay URL override such as `?safeMode=minimal`. It scales down supported motion. Theme text contrast is checked against the 4.5:1 WCAG AA threshold, with an auto-fix for the text token when needed.

## Templates

Overview's **Start a build** gallery includes twelve categorized prompts. **Edit prompt** loads a prompt into the request box, theme chips append a visual hint, **Surprise me** selects a prompt, and **Build with Codex** queues the editable text through the approval flow. **Add instantly** enables the associated prebuilt Library widget where one exists.

## Chat Runner

Add Chat Runner from the Library. Viewers use `!jump`; the widget keeps a small top-50 score list with anonymous per-session player labels. Per-player cooldown and rate limits apply. Moderators can use:

- `!runner bg night|purple|forest|sunset`
- `!runner speed slow|normal|fast`
- `!runner obstacle add|remove spike|crate|rock`
- `!runner night on|off`

Only the listed values are accepted. Larger changes can be requested through Remix. The overlay and widget include a command hint.

## Voice prompts

When Web Speech recognition is supported, hold the microphone button beside the Overview request field and speak. Select a recognition language first. The transcript is placed in the request box for editing when you release the button; it is not queued until you press **Add to queue**. The browser may send audio to its speech service. Voice capture was not exercised during development.

## Widget security and development mode

Widgets export `default { meta, mount(api) }`; see [docs/WIDGET_API.md](docs/WIDGET_API.md). Frames use `sandbox="allow-scripts"` without `allow-same-origin`, and the widget CSP blocks network connections. The static scan blocks unsafe APIs, imports must pass a VM mock mount, widget changes use Git checkpoints, and rollback rechecks source. Widget event text is untrusted and rendered as text. Widget storage is mediated by the host, validated and size-limited.

This development run uses the deterministic mock runner and simulated events. It does not run real Codex builds or real Twitch traffic. The mock runner uses a fixed safe fixture; it does not turn a request into custom source. Twitch OAuth, token storage, IRC, and EventSub client code are implemented. Real Codex builds and stream-status checks remain; no live connection has been exercised. The Settings retry and timeout values are persisted for a future live runner; they do not produce a retry/timeout cycle in the deterministic mock path. Codex theme suggestions use preset fallback.

## Checks and screenshots

Run `npx tsc --noEmit`, `npm run test:widgets`, and `npm run test:templates`. To capture a dashboard or overlay image, start StreamForge, open the target page in Chrome, set the browser viewport to the desired size, then use Chrome DevTools **Capture screenshot** or macOS screenshot controls. Keep screenshots outside the repository unless they are intentional product assets.

The Codex SDK Step 0 gate was run by the user. The SDK verification task and real build flow have not been exercised in this development session.

The Hype meter uses rolling aggregate chat and event activity with calm/warm/hot/peak levels, a trend indicator, sensitivity, manual boost, mute, and reactive-widget controls. The separate chat-energy slider is marked SIMULATED and expires after 15 seconds. It exposes no chatter names; simulated activity never contacts Twitch.

Stream sessions auto-start on first activity and store aggregate JSON under ignored `data/sessions/`. The Sessions & Recap page exports themed portrait/landscape PNGs, recap JSON, and an end-of-stream overlay. Chatter names are excluded unless explicitly enabled.

Scene Presets include Starting Soon, Be Right Back, Hype Mode and Ending. Built-ins are read-only; custom copies live under ignored `data/scenes.json`. Switching scenes preserves every widget record and can be undone.

## Phase 4 stream tools

- **Hype Signal:** Overview shows aggregate chat energy, trend, settings and a time-limited simulated energy control. Hype uses aggregate counters only; it does not store chat text or names.
- **Sessions & Recap:** sessions auto-start on activity or can be started/ended from the Sessions & Recap page. Export portrait or landscape PNGs, recap JSON, and an overlay recap. Chatter names default off.
- **Scenes:** use Starting Soon, Be Right Back, Hype Mode or Ending in the Scenes page. Duplicate a built-in before editing. Scene switching remembers the previous state and Undo restores it.
- **Auto-Clips:** Settings has individually toggleable triggers and cooldown/cap preferences. Auto-Clips stays OFF because stream-status checks and clip creation are not implemented yet. Only the explicit reauthorization link requests `clips:edit`; no clip is created by mock events. See [docs/AUTO_CLIPS.md](docs/AUTO_CLIPS.md).
- **Multilingual requests:** text is normalized and checked by Unicode code points. Build Studio shows a script chip. The default-on “Require manual approval for non-English viewer requests” setting prevents auto-vote/timer approval of likely non-English viewer requests. Script and language detection are heuristics.
- **Demo Director:** open the Demo Director page and choose **Run demo sequence**. Use Speed to change pacing or **Stop and restore** to stop and restore the previous theme, scene, Safe Mode, hype sensitivity and widget set. The sequence is stored at `public/dashboard/demo-sequence.json`, runs only simulated local events, and marks the active session recap SIMULATED.

Useful focused checks: `npm run test:clips`, `npm run test:multilingual`, `npm run test:demo`, `npm run test:sessions`, `npm run test:scenes`, and `npx tsc --noEmit`.
