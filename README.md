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

This development run uses the deterministic mock runner and simulated events. It does not run real Codex builds or real Twitch traffic. The mock runner uses a fixed safe fixture; it does not turn a request into custom source. OAuth token exchange, Twitch IRC and EventSub connections remain unimplemented. The Settings retry and timeout values are persisted for a future live runner; they do not produce a retry/timeout cycle in the deterministic mock path. Codex theme suggestions use preset fallback.

## Checks and screenshots

Run `npx tsc --noEmit`, `npm run test:widgets`, and `npm run test:templates`. To capture a dashboard or overlay image, start StreamForge, open the target page in Chrome, set the browser viewport to the desired size, then use Chrome DevTools **Capture screenshot** or macOS screenshot controls. Keep screenshots outside the repository unless they are intentional product assets.

The Codex SDK Step 0 gate was run by the user. The verification task and real build button were not exercised during development.
