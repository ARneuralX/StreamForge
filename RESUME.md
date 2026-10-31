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

## Next

- Stage 8: UI smoke, expanded QA, screenshots, documentation and regression.

## Known prerequisite gap

- The prompt's design/motion system and four app themes plus Auto from stages 1–2 are absent at the starting checkpoint. The shell and Overview already have project UI work, but stages 1–3 are not claimed or backfilled as part of this range. Any stage 8 requirement that depends on the missing app themes must be recorded accurately.
