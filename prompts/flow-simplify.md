FLOW SIMPLIFICATION (small, safe). Today a request needs several manual clicks: approve to build, approve again in the sandbox preview, put it on the scene, and a trip to the dashboard to remove it. Make the flow faster WITHOUT weakening any safety rule. Read AGENTS.md and RESUME.md first and obey them. Never read or print .env or .streamforge/.

HARD RULES
- All safety stays: sandboxed iframes, network-blocking CSP, static scan, mock-mount check, rollback, redaction, untrusted chat text. A widget never reaches the real overlay unless every check passed. The preview step remains the DEFAULT for requests from chat viewers; auto go-live is allowed only for dashboard (streamer) and moderator requests, only when the setting is on, and never for a failed check.
- Presentation and small flow changes only; keep existing ids, routes, hooks and payloads, or update every usage and test. No new dependencies. Honest labels stay (MOCK, DEMO, SIMULATED). Reduced motion respected.
- After every stage run npx tsc --noEmit, the existing tests, npm run qa:ui and npm run ui:smoke if present; commit "Flow stage N: ...", tag flow-s<N>, update RESUME.md. Stop cleanly at any usage limit. No real Codex builds during development (use the mock runner).

STAGE 1 - ONE-CLICK PATH
- Request cards get a split button: "Approve & build" plus a menu item "Approve, build and go live when checks pass". After a successful build the draft shows a clear primary "Go live" and a secondary "Discard" in Build Studio.
- New setting "After checks pass": Ask me (default), Go live automatically for streamer and moderators, Never automatically. The server enforces it; the UI cannot bypass it. Chat requests from non-moderators always stop at the preview.
- Whatever goes live shows a toast with "Undo" (10 seconds), then "Remove".

STAGE 2 - EASY REMOVAL
- A compact "On scene" tray in the header listing live widgets with toggle-off and remove icons and tooltips. "Remove from scene" turns the widget off and keeps it restorable (Restore); permanent Delete stays on the Widgets page with a confirm dialog and keeps version history.
- Moderator-only chat command "remove <widget name>" (exclamation prefix like the others) that only turns a widget off, with a reply or toast and an Undo.

STAGE 3 - CLEAR STEPS
- Every request card shows a four-step stepper (Received, Approved, Built, Live) with the current step highlighted and a one-line next action in plain words ("Waiting for your OK", "Ready for review", "Live now"). Friendly text for rolled-back or blocked requests with what to do next.

STAGE 4 - TESTS AND DOCS
- Tests: auto go-live never triggers for a non-moderator chat request, never when any check fails, never when the setting is off; undo and restore round trips; the remove command is moderator-only; the tray reflects real state.
- Update README.md and RESUME.md. Print a short summary and how to try each change.
