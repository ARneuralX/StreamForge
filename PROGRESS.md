# StreamForge progress

## Master baseline

- Done: Read the master run and master spec. The Step 0 script passed when run by the user; it was not rerun here.
- Done: Added Express/TypeScript server, JSON persistence with atomic writes, dashboard page modules, mock event API and WebSocket bus, transparent overlay, sandboxed widget frames, Widget API documentation and five starter widgets.
- Done: `npm install`, `npx tsc --noEmit`, isolated mock API checks, and headless Chrome checks for Overview and overlay.
- Phase 2A stage 1 done: persistent queue/history/widget metadata, explicit build state transitions, request cooldown and blocklist, one-vote-per-user handling, redacted activity output, and mock-only approval pipeline with syntax/static-scan/mock-mount checks. Verified with isolated HTTP checks and a server restart.
- Phase 2A stage 2 done: anchor-based layout packs all five starter widgets without collisions; manual coordinates persist, stay within the canvas bounds, and are used before automatic slots. Geometry check and 1920 × 1080 Chrome screenshot passed.
- Phase 2A stage 3 done: the WebSocket feed emitted Received → Approved → Planning → Writing code → Safety checks → Live; the final frame included all four successful safety flags, elapsed time, request and requester. A path-bearing request was redacted before broadcast. Up-next renders the three highest-voted queued requests.
- Phase 2A stage 4 done: `!vote N`, `vote N` and `+1` work with bot filtering and one vote per account per request. Settings save manual, vote/time threshold and channel-point modes. Isolated checks passed for vote threshold, time threshold and simulated point-redemption builds.
- Phase 2A stage 5 done: Undo/Rollback controls query per-widget Git history; rollback restores the previous source only after safety checks and commits the restore. A mods-only `undo <slug>` chat command uses the same handler. Verified the no-history response and disabled control; the success path needs a second-version integration test.
- Next: finish and verify the natural-20 fireworks check, then read Phase 2B.
- Known issues: Twitch OAuth callback/token exchange and automatic Twitch connections are not implemented. Real Codex builds remain disabled for this run. Mock pipeline builds a fixed safe fixture and does not interpret requests into custom source. Undo/version history and countdown/time-trigger auto-build are incomplete.
- Unverified: Chrome emitted macOS headless display warnings; no full browser console audit has been run. No real Twitch traffic or real Codex build was run.
