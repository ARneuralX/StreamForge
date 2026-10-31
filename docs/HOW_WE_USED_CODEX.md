# How Codex was used in StreamForge

This summary follows the repository commit history. It distinguishes the SDK verification gate from widget builds: the user ran the Step 0 verification script, while this development run did not invoke a real Codex build or contact Twitch.

## Build history

| Stage | Commit | Work recorded in Git |
| --- | --- | --- |
| Repository bootstrap | `26c5372` | Added the project rules, progress log, ignore rules and initial configuration. |
| SDK Step 0 gate | `03fe31d` | Added `scripts/codex-check.mjs` using the installed SDK thread options. The user ran the gate and reported “Step 0 passed.” |
| Master baseline | `c610012` | Added the Express/TypeScript dashboard, mock event path, overlay host, starter widget frames and Widget API docs. |
| Phase 2A stages 1–6 | `72a53b4`, `2d693e9`, `44eb7f2`, `8447d78`, `28bb12c`, `f0c5000`, `02f6927` | Added persistent queue/build state, layout, build feed, voting/approval, Git rollback, dice fireworks and a phase smoke checkpoint. |
| Phase 2B remix and verification | `f8a9ae5`, `d571d72`, `0b6bd8b` | Added safe queued remix support. The two widget commits record a mock remix and its Undo restore. |
| Phase 2B Library | `89ad41d`, `2055159` | Added six curated Library widgets, previews and idempotent scene actions, then `.sfwidget` import/export with static and mock checks. |
| Phase 3 stage 1 | `becbdeb` | Added the stable error vocabulary, health endpoint/panel, runtime failure reporting and fallback UI. |
| Phase 3 stage 2 | `f997cd4` | Added Build Studio and a preview route available only after static scan and mock mount pass. |
| Phase 3 stage 3 | `ed91d7e` | Added validated theme tokens, five presets, moderator theme changes and three one-click kits. |
| Phase 3 stage 4 | `bdf5110` | Added twelve validated prompt templates, editable prompt selection, style chips and instant Library actions. |
| Phase 3 stage 5 | `85f4365` | Added the Chat Runner game, rate-limited commands, anonymous player scores and host-mediated widget storage. |
| Phase 3 stage 6 | `b3a486d` | Added feature-detected push-to-talk voice prompts with an explicit edit-and-submit step. |
| Phase 3 stage 7 | `1881a6c` | Updated feature documentation and added the isolated end-to-end browser smoke. |

## Phase 4 implementation history

| Stage | Commit | Work recorded in Git |
| --- | --- | --- |
| Stage 1 | `eb5c563` | Added server-computed Widget Passports, heuristic risk summaries and Safe Mode. |
| Stage 2 | `3a7b303`, `417c256` | Added aggregate Hype Signal and aligned its schema, controls and widget API. |
| Stage 3 | `f582df2` | Added persisted stream sessions, aggregate recaps and canvas exports. |
| Stage 4 | `19db867` | Added read-only scenes, saved duplicates, switching and Undo. |
| Stage 5 | `68b8790` | Added Auto-Clips preferences, explicit optional scope request and validated widget moments. Clip creation remains disabled because OAuth exchange and live status are unavailable. |
| Stage 6 | `5a13ea7` | Added Unicode normalization, heuristic script chips and a manual-review gate for likely non-English requests. |
| Stage 7 | `Phase 4 stage 7: add Demo Director and final polish` | Added a JSON-driven simulated sequence, local replay feed, settings restoration, recap SIMULATED marking and Phase 4 documentation. |

Phase 4 uses the deterministic mock path. No real Codex build or Twitch API traffic was run. Auto-Clips remains OFF because the local OAuth callback does not exchange tokens and channel live-state checking is absent; language identification remains heuristic.

## Safety model in the repository

Widget frames are sandboxed with scripts enabled and same-origin access disabled. Their CSP blocks network connections. The server statically scans widget source, then runs a VM mock mount before promoting imports or builds. Widget changes use Git checkpoints and the Undo path safety-checks the restored source. Chat and widget text is rendered as text, public activity redacts paths and usernames, and widget storage requests pass through the host with safe keys and a size limit.

The mock runner writes a fixed safe fixture rather than converting a user prompt into source. Real Codex builds, live Twitch traffic, OAuth token exchange, IRC and EventSub were not run or claimed as verified in this development history. Codex theme suggestions choose a validated preset fallback while generation is unavailable.
