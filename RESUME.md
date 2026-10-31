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

## Next

- Stage 5: Widgets and Library presentation.
- Stage 6: Settings, Scenes, Sessions and Demo Director presentation.
- Stage 7: reserve overlay HUD space and prevent widget collisions.
- Stage 8: UI smoke, expanded QA, screenshots, documentation and regression.

## Known prerequisite gap

- The prompt's design/motion system, four app themes plus Auto, app shell redesign and Overview redesign from stages 1–3 are absent at the starting checkpoint. This run does not claim or backfill those stages. Any stage 8 requirement that depends on those missing app themes must be recorded accurately.
