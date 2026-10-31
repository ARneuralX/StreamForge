# Phase 4B QA Report

## Stage 1 baseline

- Runner: `npm run qa:ui` builds the server, starts a mock server on a free localhost port with a temporary data directory, reuses one installed headless Google Chrome instance through CDP, and saves full-page screenshots and machine-readable results under ignored `qa-artifacts/`.
- Dashboard pages: Overview, Build Studio, Widgets, Widget library, Settings, Stream sessions, Scene presets and Demo Director.
- Viewports: 1024×768, 1280×720, 1440×900 and 1920×1080. Overlay: 1920×1080.
- Current baseline: 0 browser errors or warnings, 0 failed requests, 0 horizontal overflow, 0 detected clipped text, 0 undersized targets, 0 non-contained card overlaps, and 0 contrast findings from computed foreground/background samples.
- Stage 2 Overview audit: added structural assertions for a three-column stats row, two-column Hype/Scene area, separated disclosure summaries, a collapsible Demo Director, and recap containment. The pre-fix capture failed the first three assertions. After the CSS repair all assertions pass at 1024×768, 1280×720, 1440×900 and 1920×1080; the existing layout audit remains at zero findings.
- Stage 3 theme proof: `npm run test:theme-frames` checks all five API token sets, source-verified frame acknowledgements from all nine real sandboxed widget frames, screenshot pixel changes across every widget/preset pair, the recap overlay's live redraw, shared CSS token consumption, and an exact allowlist for Chat Runner's selectable background colors. Current result: all widget and recap comparisons pass.
- Browser dependency: no new package. The harness drives the installed Chrome with the DevTools Protocol.

## Known limits

- Screenshot results are ignored build artifacts and are not committed. The harness contrast check samples computed colors and estimates gradient contrast at the midpoint; Phase 4B adds pixel-level theme and preview-background checks.
- The initial Library screenshot captured frames before lazy widget modules finished mounting. Stage 5 checks explicitly wait for each sandbox preview to report mount or failure.
