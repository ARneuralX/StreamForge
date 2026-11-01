# StreamForge

StreamForge is a local dashboard and OBS browser overlay for community-driven stream widgets. Dashboard pages are separate modules, widgets run in isolated frames, and stream events can be simulated without contacting Twitch.

## Install and run

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and add only credentials you intend to use. Never commit `.env`.
3. Run `npm install`, then `npm start`.
4. StreamForge opens `http://localhost:3000/dashboard/` in Chrome when available. Set `OPEN_BROWSER=false` to suppress that. Set `PORT` to select another port; `npm run restart` restarts the local server.

The Twitch Developer Console redirect URL is `http://localhost:3000/auth/twitch/callback` (use the selected port if changed). The OBS browser source URL is `http://localhost:3000/overlay/`. The overlay defaults to a transparent background. Simulate controls are local and labelled; they do not contact Twitch.

For Twitch, set `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_CHANNEL`, and `TWITCH_LIVE_ENABLED=true` in your local `.env`, then use **Connect Twitch**. The callback validates the authorization and stores its token privately. Chat and EventSub connect on app start after authorization. Do not set the live switch while developing with mock events.

## Dashboard features

- **Overview:** request form, setup checklist, simulated chat/follow/sub/raid/redeem events, theme presets, overlay kits, twelve prompt templates, and optional voice prompts.
- **Build queue / Build Studio:** approve or reject queued requests; view human-readable stages, a sandboxed scanned-draft preview, preview backgrounds, event simulation, and safety results.
- **Widgets:** toggle widgets, arrange their overlay positions, submit Remix requests and undo a prior Git version.
- **Library:** browse sandboxed previews with per-widget mount/error badges, inspect the original prompt and creator, add/remove widgets, and import/export `.sfwidget` files. Imports must pass the static scan and mock mount.
- **Settings:** approval mode, vote/time thresholds, retry preference and timeout, Twitch redirect URL, and a non-secret service health panel.

The request queue supports `!build <idea>`, `!remix <widget> <change>`, `!vote N`, `vote N`, `+1`, and moderator `undo <slug>`. A moderator can also use `!theme <Halloween|Neon|Cozy|Retro|Clean>`. Voting is one per account per request. Auto-approval can use a vote threshold, elapsed time, or the simulated channel-point reward.

## Themes and kits

Five validated presets—Halloween, Neon, Cozy, Retro and Clean—update active overlay widgets without a rebuild. Theme suggestions choose a closest preset while Codex generation is unavailable. Three kits add existing Library widgets and apply a theme: Halloween, Cozy stream and Neon arcade. The Widget API documents validated theme tokens and compatibility.

## Preview backgrounds

Overlay previews accept `?bg=dark|bright|checker|green|transparent`. Build Studio and Library have independent saved preview choices. The shared colors, checker tile size and transparent OBS default are documented in [docs/PREVIEW_BACKGROUNDS.md](docs/PREVIEW_BACKGROUNDS.md). Preview backgrounds affect only the preview surface; the default OBS source remains transparent.

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

Choose `BUILD_MODE=mock`, `replay`, or `codex` in `.env`. Mock uses a fixed safe fixture. Codex runs the installed SDK only when an approved request is built, in an isolated hidden draft directory with network disabled; it promotes output only after syntax, static scan and VM mock-mount checks. It streams redacted progress to Build Studio and the overlay. Successful and failed Codex runs are recorded without widget source or tokens in ignored `replay/*.json`; replay mode plays the latest successful recording and labels it DEMO MODE. This development session tested the SDK runner with a fake SDK and did not run a real Codex build or contact Twitch. Codex theme suggestions use preset fallback.

## Checks and screenshots

Run `npx tsc --noEmit`, `npm run test:widgets`, `npm run test:templates`, `npm run test:theme-frames`, `npm run test:preview-backgrounds`, `npm run check:library`, `npm run ui:smoke`, and `OPEN_BROWSER=false npm run qa:ui`. The UI smoke and QA runs use an isolated mock server and headless Chrome; QA covers all eight dashboard pages, the five existing widget theme presets, 1024/1440/1920 desktop widths, and 390px mobile widths for Overview, Build Studio, Widgets, and Library. These checks do not require real Twitch traffic or a real Codex build. QA artifacts are written to ignored `qa-artifacts/`; selected Stage 8 screenshots are in [docs/screens/after](docs/screens/after/). The four app themes and Auto described in the earlier redesign stages are not present in this stage 4–8 checkout. To capture another dashboard or overlay image, start StreamForge, open the target page in Chrome, set the browser viewport to the desired size, then use Chrome DevTools **Capture screenshot** or macOS screenshot controls.

The Codex SDK Step 0 gate was run by the user. Real SDK login, Verify Codex, a real build and Twitch authorization still need the user's manual check in their own Terminal.

The Hype meter uses rolling aggregate chat and event activity with calm/warm/hot/peak levels, a trend indicator, sensitivity, manual boost, mute, and reactive-widget controls. The separate chat-energy slider is marked SIMULATED and expires after 15 seconds. It exposes no chatter names; simulated activity never contacts Twitch.

Stream sessions auto-start on first activity and store aggregate JSON under ignored `data/sessions/`. The Sessions & Recap page exports themed portrait/landscape PNGs, recap JSON, and an end-of-stream overlay. Chatter names are excluded unless explicitly enabled.

Scene Presets include Starting Soon, Be Right Back, Hype Mode and Ending. Built-ins are read-only; custom copies live under ignored `data/scenes.json`. Switching scenes preserves every widget record and can be undone.

## Phase 4 stream tools

- **Hype Signal:** Overview shows aggregate chat energy, trend, settings and a time-limited simulated energy control. Hype uses aggregate counters only; it does not store chat text or names.
- **Sessions & Recap:** sessions auto-start on activity or can be started/ended from the Sessions & Recap page. Export portrait or landscape PNGs, recap JSON, and an overlay recap. Chatter names default off.
- **Scenes:** use Starting Soon, Be Right Back, Hype Mode or Ending in the Scenes page. Duplicate a built-in before editing. Scene switching remembers the previous state and Undo restores it.
- **Auto-Clips:** OFF by default. Enabling requires `TWITCH_LIVE_ENABLED=true` and explicit Twitch reauthorization with `clips:edit`. StreamForge checks Get Streams before a clip request and applies a global cooldown and per-session cap; mock events never create clips. See [docs/AUTO_CLIPS.md](docs/AUTO_CLIPS.md).
- **Multilingual requests:** text is normalized and checked by Unicode code points. Build Studio shows a script chip. The default-on “Require manual approval for non-English viewer requests” setting prevents auto-vote/timer approval of likely non-English viewer requests. Script and language detection are heuristics.
- **Demo Director:** open the Demo Director page and choose **Run demo sequence**. Use Speed to change pacing or **Stop and restore** to stop and restore the previous theme, scene, Safe Mode, hype sensitivity and widget set. The sequence is stored at `public/dashboard/demo-sequence.json`, runs only simulated local events, and marks the active session recap SIMULATED.

Useful focused checks: `npm run test:clips`, `npm run test:multilingual`, `npm run test:demo`, `npm run test:sessions`, `npm run test:scenes`, and `npx tsc --noEmit`.
## Flow simplification

Dashboard requests now offer **Approve & build** and **Approve, build and go live when checks pass**. The latter is an intent only: the server also requires the eligible automatic-promotion setting, an allowed dashboard/moderator source, and all four checks passing. Chat viewer requests always wait at the sandbox preview. In Settings, **After checks pass** defaults to **Ask me**; the other choices allow eligible automatic promotion or disable it. A checked draft offers **Go live** and **Discard**. Live promotion shows an Undo action for 10 seconds, followed by Remove.

To try the build path safely, use MOCK MODE, submit a request in Overview, open Build queue, choose **Approve & build**, review its sandbox preview, then choose **Go live** or **Discard**. For the optional automatic path, choose **Go live automatically for streamer and moderators** in Settings and use the second approval menu item on a dashboard request. Viewer chat requests still stop at preview. No real Codex build is needed.

The shared **On scene** tray lists enabled widgets and provides separate Turn off and Remove from scene controls. Off widgets stay available in the tray’s Restore list. The Library’s **Remove from scene** action uses the same reversible behavior. Permanent **Delete** remains on Widgets and keeps local Git version history. Moderators can use `!remove <widget name>`; it takes the widget off scene and provides a 10-second Undo notification. Use `npm run test:flow` for a local moderator/streamer behavior check without Twitch traffic.

Every Build queue card shows **Received → Approved → Built → Live** with the current milestone and a plain next action. Blocked and rolled-back cards explain the outcome and the next safe action. `npm run test:flow`, `npm run qa:ui` and `npm run ui:smoke` cover the flow policy, page layout and tray interactions in mock mode.
