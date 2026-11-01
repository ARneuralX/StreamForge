# Phase 4B QA Report

## Stage 1 baseline

- Runner: `npm run qa:ui` builds the server, starts a mock server on a free localhost port with a temporary data directory, reuses one installed headless Google Chrome instance through CDP, and saves full-page screenshots and machine-readable results under ignored `qa-artifacts/`.
- Dashboard pages: Overview, Build Studio, Widgets, Widget library, Settings, Stream sessions, Scene presets and Demo Director.
- Viewports: 1024×768, 1280×720, 1440×900 and 1920×1080. Overlay: 1920×1080.
- Current baseline: 0 browser errors or warnings, 0 failed requests, 0 horizontal overflow, 0 detected clipped text, 0 undersized targets, 0 non-contained card overlaps, and 0 contrast findings from computed foreground/background samples.
- Stage 2 Overview audit: added structural assertions for a three-column stats row, two-column Hype/Scene area, separated disclosure summaries, a collapsible Demo Director, and recap containment. The pre-fix capture failed the first three assertions. After the CSS repair all assertions pass at 1024×768, 1280×720, 1440×900 and 1920×1080; the existing layout audit remains at zero findings.
- Stage 3 theme proof: `npm run test:theme-frames` checks all five API token sets, source-verified frame acknowledgements from all nine real sandboxed widget frames, screenshot pixel changes across every widget/preset pair, the recap overlay's live redraw, shared CSS token consumption, and an exact allowlist for Chat Runner's selectable background colors. The Phase 4B checkpoint passed; the Flow simplification rerun below records current findings.
- Stage 4 preview backgrounds: `npm run test:preview-backgrounds` pixel-samples all five choices on overlay, Build Studio and Library, checks transparent frame styling, independently persisted dashboard choices, and the default transparent OBS canvas. It exposed and fixed a malformed checker `background-image` value; tile size is now set separately. The preview message carries only validated visual background data into the opaque widget sandbox.
- Browser dependency: no new package. The harness drives the installed Chrome with the DevTools Protocol.

## Stage 5 Library reliability

- `npm run check:library` passes: 10 sandboxed Library previews mounted; 16 passport-declared events were delivered through the runtime bridge; Add/Remove stayed idempotent under eight concurrent requests; eight simultaneous imports converged on one entry; the UI duplicate-import message and rapid Preview selection passed.
- Per-card health badges report runtime mount/error messages, including a simulated event-handler failure. This run used a copied widget tree, isolated state, mock BUILD_MODE, no browser launch and no Twitch connection.
- The earlier Library screenshot captured frames before lazy modules mounted. This check scrolls each frame into view and waits for a mount or error report.

## Known limits

- Screenshot results are ignored build artifacts and are not committed. The harness contrast check samples computed colors and estimates gradient contrast at the midpoint; Phase 4B adds pixel-level theme and preview-background checks.

## Stage 6 final regression

- All runnable `test:*`, `check:library`, `qa:phase3`, and `OPEN_BROWSER=false npm run qa:ui` checks passed. The required startup smoke passes in isolated mock mode. `codex:check` was excluded by the project rule; no real Codex build or Twitch connection was made.
- Final UI result: 8 dashboard pages × 4 viewports plus overlay at 1920×1080; 0 browser diagnostics, failed requests, or layout/accessibility failures.
- Final Library result: 10 sandboxed previews, all 16 declared events, concurrent Add/Remove/Import, error badge, Export, and rapid Preview selection passed.

## Flow simplification final regression

- `npm run test:flow` passes with mock BUILD_MODE, copied widgets and isolated state. It checks the server promotion policy against each failed check, non-moderator chat, Ask me/Never settings, dashboard intent and moderator eligibility; exercises viewer chat stopping at preview, moderator auto-promotion, moderator-only `!remove`, 10-second Undo, restore state, and the tray route.
- `npm run qa:ui` and `npm run ui:smoke` pass: zero browser diagnostics, failed requests or layout/accessibility findings. UI smoke verifies Library remove/restore and the live header tray reflects server state after remove and restore.
- The full existing test batch passed except `npm run test:theme-frames`, which still reports zero changed pixels for Chat Runner across theme changes and flags committed `community-8a47430f` source color `#a855f7`. No theme rules or scans were loosened. No real Codex build or Twitch traffic was used.

## Stage 8 UI regression

- `npm run ui:smoke` runs an isolated mock server and headless Chrome click-through. It opened all eight nav pages, added an Overview idea, simulated chat/follow/sub/raid/redeem, applied all five existing widget theme presets, added a Library widget after removing it from the scene, applied and undid a scene, and toggled Safe Mode. Result: zero browser console errors and failed requests.
- `npm run qa:ui` checks every dashboard page with each of the five existing widget theme presets at 1024×768, 1440×900 and 1920×1080, plus 390×844 on Overview, Build Studio, Widgets and Library. It audits overflow, clipped content, target sizes, card overlap and sampled AA contrast. It also runs a nine-widget overlay layout fixture against reserved HUD zones and checks running animations under `prefers-reduced-motion: reduce` in the overlay and sandbox frames.
- Selected screenshots are committed under `docs/screens/after/`; detailed per-theme captures and machine-readable results remain ignored under `qa-artifacts/`.
- Theme scope limitation: Stage 8 requests all four app themes from stages 1–2, but stages 1–3 were absent at the starting checkpoint and this requested run is limited to stages 4–8. The checkout contains five widget theme presets, which are covered above; it has no separate four-theme app layer. No app themes were invented or reported as tested.
- Before/after evidence limitation: no baseline screenshot set was present in the starting checkout. The written comparison in `RESUME.md` uses the recorded stage 4–7 changes and does not claim pixel comparisons against missing images.
