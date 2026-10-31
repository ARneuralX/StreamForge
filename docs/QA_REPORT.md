# Phase 4B QA Report

## Stage 1 baseline

- Runner: `npm run qa:ui` builds the server, starts a mock server on a free localhost port with a temporary data directory, reuses one installed headless Google Chrome instance through CDP, and saves full-page screenshots and machine-readable results under ignored `qa-artifacts/`.
- Dashboard pages: Overview, Build Studio, Widgets, Widget library, Settings, Stream sessions, Scene presets and Demo Director.
- Viewports: 1024×768, 1280×720, 1440×900 and 1920×1080. Overlay: 1920×1080.
- Current baseline: 0 browser errors or warnings, 0 failed requests, 0 horizontal overflow, 0 detected clipped text, 0 undersized targets, 0 non-contained card overlaps, and 0 contrast findings from computed foreground/background samples.
- Stage 2 Overview audit: added structural assertions for a three-column stats row, two-column Hype/Scene area, separated disclosure summaries, a collapsible Demo Director, and recap containment. The pre-fix capture failed the first three assertions. After the CSS repair all assertions pass at 1024×768, 1280×720, 1440×900 and 1920×1080; the existing layout audit remains at zero findings.
- Stage 3 theme proof: `npm run test:theme-frames` checks all five API token sets, source-verified frame acknowledgements from all nine real sandboxed widget frames, screenshot pixel changes across every widget/preset pair, the recap overlay's live redraw, shared CSS token consumption, and an exact allowlist for Chat Runner's selectable background colors. Current result: all widget and recap comparisons pass.
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
