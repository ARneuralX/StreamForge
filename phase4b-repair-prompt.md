PHASE 4B REPAIR AND QUALITY PASS. Phase 4 is committed but several things are broken or messy in the real UI. Do not add new features. Reproduce each defect, find the root cause, fix it, and prove the fix with automated checks. First run git log and confirm the commits prefixed "Phase 4 stage" exist. Read AGENTS.md, README.md, PROGRESS.md, docs/WIDGET_API.md and the source. Write an audit note under a "Phase 4B" heading in PROGRESS.md listing every reproduced defect with its root cause.

REPORTED DEFECTS (reproduce all of them first)
A) The Overview page is cluttered: sections overlap (the Hype Signal slider overlaps the Scene Presets heading, the Demo Director controls overlap, the Recap card collides with its neighbours), spacing is inconsistent and the page does not look like a finished app.
B) The overlay theme presets (Halloween, Neon, Cozy, Retro, Clean) do not visibly change the widgets.
C) The preview background control does not work correctly: the chosen background does not change or shows wrong colors (overlay ?bg parameter, Build Studio preview, Library previews).
D) Some Library widgets do not work reliably (Add to scene, preview, or runtime behaviour).

GLOBAL RULES
- Keep the security model intact: sandboxed iframes, CSP blocking all network access, the static scan, mock-mount checks, rollback, redaction, untrusted chat text, secrets only in .env. Keep the Widget API backward compatible. Never weaken a check to make a test pass.
- No new features. No real Codex builds and no real Twitch traffic in this pass. Run the QA server on a free port in mock or replay mode with an isolated temporary data directory so real tokens, queue and data are never touched.
- Dependencies: prefer what is installed. If a headless browser driver is truly needed, add exactly one devDependency (puppeteer-core or playwright-core) that drives the already installed Google Chrome, with no bundled browser download, and justify it in PROGRESS.md. Nothing from devDependencies may ship at runtime.
- Keep the dark glass style, visible focus states, labels and AA contrast. SIMULATED and DEMO MODE labels must stay and stay honest.
- Root cause first: for every defect write a failing automated check, then fix it and show the check passing.
- Commit after each stage with the prefix "Phase 4B stage N:".

STAGE 1 - QA HARNESS
- Add npm run qa:ui. It starts the server in mock or replay mode with isolated data, opens every dashboard page (Overview, Build queue, Widgets, Library, Settings) at 1024x768, 1280x720, 1440x900 and 1920x1080, and the overlay at 1920x1080, in headless Chrome, captures full-page screenshots into qa-artifacts/ (git-ignored), and fails on: console errors or warnings, failed requests, horizontal overflow, text clipped by its container, overlapping visible elements that are not marked as intentional layers (data-layer attribute), interactive targets smaller than 32 px, and contrast below 4.5:1 for text (3:1 for large text).
- Write docs/QA_REPORT.md (text only: checks, results, viewports, known limits). Keep it deterministic and fast; reuse one browser instance.

STAGE 2 - OVERVIEW REDESIGN
- Rebuild the Overview on a clean CSS grid with a spacing scale: no absolute positioning for flow content, no negative margins, no z-index hacks. Order: status strip, quick start, key stats row, a two-column area with Hype Signal and Scene Presets, Demo Director, Recap card, then widgets at a glance.
- Every section is its own card with a title, short helper text, consistent padding, clear separation and a collapse toggle (remembered). The hype meter and slider, the Scene buttons, the Demo Director controls (speed, run, stop) and the Recap controls (session, format, download, copy) get proper labels, aligned rows and sensible wrapping at narrow widths.
- The Recap preview scales to fit its card without overlapping anything. Add subtle entrance transitions that respect reduced motion. The stage-1 audit must show zero overlaps and zero overflow on Overview at every viewport.

STAGE 3 - OVERLAY THEME PRESETS
- Diagnose why the presets do nothing: trace the preset selection to the host, to the token delivery over postMessage, to api.theme inside each widget iframe, to the CSS variables each widget really uses. Fix the root cause, not the symptom.
- Every starter widget, library widget, the Chat Runner and the recap overlay must visibly respond to all five presets through tokens, update live when the preset changes (no reload) and start with correct values on load. Add a theme preview strip with real swatches in the dashboard that reflects the active preset.
- Automated proof: for each widget and each preset, render the widget in a real sandboxed iframe, read the delivered token values and compare screenshots. Fail if two different presets give identical pixels for a widget that declares token use, and fail if a widget hardcodes colors that ignore tokens (static check with a clear allowlist).
- Fix any widget that fails by correcting its source, not by loosening the check.

STAGE 4 - PREVIEW BACKGROUNDS
- Fix the overlay parameter (?bg=dark|bright|checker|green|transparent), the Build Studio preview toggle and the Library preview toggle. They must share one implementation with exact, documented colors, apply instantly, persist per surface, and never leak into the real OBS output (the default stays fully transparent).
- Check that widget text stays readable on each background and that the checker pattern is correct at any scale. Tests sample the real background pixel color for every option.

STAGE 5 - LIBRARY RELIABILITY
- Audit every library widget: mount it with the mock API in the real sandboxed iframe, simulate every event it declares (chat commands, follow, subscription, raid, redemption, hype, Safe Mode, theme change) and record console errors, thrown exceptions and visual failures. Fix each failing widget in its own source, never by loosening the scanner.
- Make Add to scene, Remove, Import and Preview idempotent and race-free, with friendly messages from the error taxonomy and no silent failures. Show a small health badge on each Library card computed from the automated check.
- Add npm run check:library, which runs the audit and writes the results into docs/QA_REPORT.md.

STAGE 6 - REGRESSION AND CLOSE
- Run npm run qa:ui, npm run check:library, npx tsc --noEmit and the existing tests, and fix everything they report. Confirm the Phase 3 and Phase 4 features still work in mock mode (Build Studio, templates, Chat Runner commands, voice button visibility, Safe Mode, Hype Signal, Recap, Scene Presets, Demo Director).
- Update README.md, PROGRESS.md and docs/HOW_WE_USED_CODEX.md with facts only. Commit. Finish with a short per-stage summary, the QA report highlights and anything still unverified.
