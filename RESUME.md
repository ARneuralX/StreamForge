# UI redesign resume

## Scope and starting point

- Follow `prompts/ui-redesign.md`; this run is limited to stages 4–8.
- Starting checkpoint: `8938a26` (`Checkpoint before UI redesign`). The UI redesign stages 1–3 are not present in this checkout; they are not marked complete here.
- The Phase 4B project work is complete according to `PROGRESS.md`. Use mock/replay and isolated data for development. Real Codex builds and Twitch traffic remain out of scope.
- Existing page IDs, routes, data attributes, ARIA hooks and exports are preserved.

## Stage 4 — Build Studio and queue

- Done: redesigned queue cards with requester initials, friendly status chips, vote progress and actionable rollback/failure guidance. Added a stage stepper, elapsed time, safety-check ticks, a redacted terminal-style activity panel for Codex/replay only, and a device-framed sandbox preview with simulated event controls and a visible loading state.
- Mode honesty: mock mode shows an empty build activity state and never presents mock fixture events as a live terminal.
- Verification: `node --check public/dashboard/pages/queue.js`, `node --check public/dashboard/app.js`, `npx tsc --noEmit`, every existing `test:*` script, `npm run qa:phase3`, `npm run check:library`, and `npm run qa:ui` passed. UI QA covered 8 pages × 4 existing viewports plus the overlay, with 0 browser diagnostics, failed requests or layout/accessibility findings. Isolated server checks required running outside the sandbox because local `127.0.0.1` listeners were denied (`EPERM`).
- Commit/tag: `UI stage 4: build studio and queue`; `ui-s4`.

## Stage 5 — Widgets and Library

- Done: widget cards now use live sandboxed, lazy-loaded previews with the shared preview background, loading and health states, and offscreen render pausing. Added scene toggles, Remix/Export/Versions/Undo/Remove actions, a removal confirmation, position popovers, and expandable Passport chips.
- Done: Library now has text search, event-based category filters, a drag-and-drop import zone with the existing validation route, sandboxed preview cards, and animated Add-to-scene feedback. Existing IDs, routes, sandbox attributes, data hooks and exports remain in place.
- Verification: `npx tsc --noEmit`, all existing test scripts, `npm run check:library`, `npm run qa:phase3`, and `npm run qa:ui` passed. The Library check mounted 10 previews, delivered 16 Passport events, and verified concurrent Add/Remove/Import, duplicate-import messaging, Export and preview backgrounds. UI QA covered 8 pages × 4 existing viewports plus overlay with 0 browser diagnostics, failed requests, or layout/accessibility findings. Checks used mock mode, fake endpoints and isolated local data; no live Twitch traffic or real Codex build.
- Commit/tag: `UI stage 5: widgets and library`; `ui-s5`.

## Stage 6 — Other pages

- Done: grouped Settings controls, switch styling, five existing widget-theme swatches, an unsaved-changes status bar connected to existing approval and clip save actions, and clearer setup descriptions. Scenes show compact widget previews; session controls/history are grouped and the recap canvas is centred with portrait/landscape selection plus Download and Copy actions. Demo Director steps now form an accessible timeline with one active step at a time.
- Preserved existing page IDs, API routes, session/scene actions and exports. Theme swatches use the existing widget theme API; no new app theme system or server behavior was added.
- Verification: `npx tsc --noEmit`, all existing test scripts, `npm run check:library`, `npm run qa:phase3`, `npm run test:preview-backgrounds`, and `npm run qa:ui` passed. UI QA covered 8 pages × 4 viewports plus overlay with 0 browser diagnostics, failed requests, or layout/accessibility findings. Checks used mock/replay and isolated data; no live Twitch traffic or real Codex build.
- Commit/tag: `UI stage 6: other pages`; `ui-s6`.

## Stage 7 — Overlay HUD and layout

- Done: the overlay measures each visible HUD element and reserves its rectangle when positioning sandboxed widgets. This includes mode/remix/runner pills, hype, simulated badge, Up Next, build feed, runtime-error toast and scene banner. The top HUD elements now occupy distinct positions; Up Next and the build feed sit in compact reserved zones, with panels stacked on narrow screens.
- Layout retains the 1920×1080 coordinate system, honors manual positions when they do not collide, and keeps the canvas transparent by default. Existing `bg`, `safeMode`, `feed` and `recap` URL parameters and sandbox attributes are preserved. Safe Mode and reduced-motion styles keep overlay transitions static when requested.
- Verification: `npx tsc --noEmit`, all existing test scripts, `npm run check:library`, `npm run qa:phase3`, `npm run test:preview-backgrounds`, and `npm run qa:ui` passed. UI QA covered 8 pages × 4 viewports plus the transparent overlay; 0 browser diagnostics, failed requests, or layout/accessibility findings. A nine-widget layout fixture placed all nine widgets around the mode/hint zones and Up Next.
- Commit/tag: `UI stage 7: overlay HUD and layout`; `ui-s7`.

## Known prerequisite gap

- The prompt's design/motion system and four app themes plus Auto from stages 1–2 are absent at the starting checkpoint. The shell and Overview already have project UI work, but stages 1–3 are not claimed or backfilled as part of this range. Any stage 8 requirement that depends on the missing app themes must be recorded accurately.

## Stage 8 — QA, regression and docs

- Done: added `npm run ui:smoke` for mock-mode click-through of all eight nav pages, Overview queue submission, all five simulated event types, all five existing widget themes, Library add, scene Apply/Undo and Safe Mode. It fails on browser console errors and failed requests.
- Done: expanded `qa:ui` to five existing widget theme presets × eight pages × 1024/1440/1920 widths, plus 390×844 on Overview, Build Studio, Widgets and Library. Audits include overflow, clipped content, undersized targets, card overlaps, sampled AA contrast, a nine-widget layout fixture checked against reserved HUD zones, and reduced-motion running-animation checks.
- Captures: selected Clean-theme page screenshots and overlay are under `docs/screens/after/`; full QA captures and JSON results are ignored in `qa-artifacts/`.
- Before/after summary: the pre-redesign shell had denser queue cards and less explicit status; Stage 4 adds clear queue/build progress and sandbox preview. Stage 5 adds live widget/Library previews and direct scene controls. Stage 6 groups settings, session recap and scene controls. Stage 7 reserves HUD space during overlay widget layout. Stage 8 adds repeatable browser regression and after screenshots. No before screenshot files existed at the starting checkpoint, so this is a feature summary, not a pixel comparison.
- Theme limitation: this run has five existing widget presets and tests each. The four app themes plus Auto requested by stages 1–2 are absent because the task scope starts at stage 4; Stage 8's app-theme coverage cannot be met within this authorized range. No app theme layer was added.
- Verification: `npm run ui:smoke`, `npm run qa:ui`, `npx tsc --noEmit`, every existing runnable `test:*` script, `npm run check:library`, and `npm run qa:phase3` passed in mock/replay mode with isolated data. No live Twitch traffic or real Codex build.
- Commit/tag: `UI stage 8: QA, regression and docs`; `ui-s8`.

## Before / after summary

| Area | Before | After stages 4–8 |
| --- | --- | --- |
| Build Studio | Compact queue/build status | Requester/status cards, progress steps, safety ticks, redacted activity and sandbox preview |
| Widgets and Library | Basic lists | Lazy sandbox previews, health/status details, scene controls, search and import drop zone |
| Settings and stream tools | Dense page sections | Grouped controls, theme swatches, session recap, scene previews and Demo timeline |
| Overlay | Widgets positioned without measured HUD reservations | HUD-aware placement and responsive panel positioning |
| Regression evidence | Existing QA harness and no tracked baseline captures | Mock click-through, expanded multi-theme responsive QA and selected after screenshots |

## Complete

- Requested stage range 4–8 is complete. Earlier stages remain unclaimed; app-theme prerequisite gap is documented above.

## Flow simplification continuation

- Starting checkpoint: `9bc83ae` (`Checkpoint before flow simplification`). Follow `prompts/flow-simplify.md` stages 1–4 in order; this work remains within completed Phase 4B and does not start Phase 5.
- Stage 1 implementation: queue approval now has explicit build and build-with-auto-promotion choices; Settings persists `afterChecksPass` (`ask` by default, `eligible`, or `never`); the server gates automatic promotion by setting, request origin and successful completion of all existing checks. Non-moderator chat requests always wait at the checked draft. Build Studio labels the final actions Go live and Discard, and live promotion emits a 10-second Undo notification that then reads Remove.
- Stage 1 verification: `npx tsc --noEmit`, fake service tests through `test:twitch-clips`, and startup passed. The full regression exposed the pre-existing theme-frame audit findings (Chat Runner theme pixels and a committed community-widget hardcoded color); `check:library` initially still expected permanent removal, then passed after the Stage 2 behavior and fixture were updated. No real Codex build or Twitch traffic was used.
- Stage 1 commit/tag: `a160f9c`; `flow-s1`.

### Stage 2 — Easy removal

- Done: added the shared On scene tray with per-widget Turn off and Remove from scene controls, plus a Restore list. Library removal now disables the widget and preserves it; permanent Delete remains on Widgets with a confirmation and local Git history retained. Added moderator-only `!remove <widget name>` with off-scene behavior, dashboard notification, 10-second Undo and later Restore.
- Verification: `npx tsc --noEmit`, `qa:ui` (all pages/viewports, overlay and reduced motion), `ui:smoke`, and the updated `check:library` passed, including concurrent reversible removal, restore, ten sandboxed previews and 16 passport events. In the full test batch, `test:theme-frames` still failed on the pre-existing Chat Runner theme response and committed community-widget hardcoded color. The batch stalled in `test:sessions`; other checks before it passed.
- Next: Stage 3 request stepper and plain next actions, then Stage 4 focused policy/undo/tray tests and docs.

### Stage 3 — Clear steps

- Done: every request card now shows Received → Approved → Built → Live, with a state-specific next action. The `built` milestone is recorded only after the four existing checks pass. Failed and rolled-back requests show a friendly action line alongside the redacted reason.
- Done: automatic promotion is enforced by a server-only policy requiring the eligible setting, an eligible request origin, explicit dashboard intent when applicable, and all four safety checks true.
- Verification: `npx tsc --noEmit`, `qa:ui` (5 widget themes × 8 pages at three desktop widths plus mobile Overview/Build Studio/Widgets/Library, overlay and reduced motion), and `ui:smoke` passed with zero diagnostics, failed requests or layout/accessibility findings. Stage 2’s full test batch was interrupted in `test:sessions`; the theme-frame findings remain recorded.
- Next: Stage 4 tests for non-moderator chat, failed checks, disabled setting, undo/restore, moderator-only remove and tray state; update handoff docs and run final regression.

### Stage 4 — Tests and docs

- Done: added `npm run test:flow`. The mock integration check verifies viewer chat cannot auto-promote, each individual failed check blocks promotion, Ask me/Never block it, explicit eligible dashboard promotion and eligible moderator promotion work, moderator-only removal, 10-second Undo, restore round trips and server-backed scene state. `ui:smoke` now exercises the header tray against live API state.
- Done: updated the session and Phase 3 smoke drivers to approve the checked draft instead of waiting forever for the previous implicit promotion behavior. Updated README, PROGRESS, this resume file and the QA report.
- Verified: `npx tsc --noEmit`, every existing `test:*` script, `check:library`, `qa:phase3`, `qa:ui`, and `ui:smoke` were run in mock/replay mode. All passed except the existing `test:theme-frames` result: Chat Runner has 0 theme-changed pixels for four presets and committed `community-8a47430f` contains `#a855f7` outside the allowlist. No scans or theme restrictions were weakened. No real Codex build or Twitch traffic.
- Commits/tags: Stage 1 `a160f9c` / `flow-s1`; Stage 2 `2441f05` / `flow-s2`; Stage 3 `d25f84e` / `flow-s3`; Stage 4 `Flow stage 4: tests and docs` / `flow-s4`.
- Complete: Flow simplification stages 1–4 are implemented; Phase 5 remains unstarted.
