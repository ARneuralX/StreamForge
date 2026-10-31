PHASE 2B. Phase 2A is done and verified. Now add the features that make StreamForge unique and useful for any streamer. Work in stages, verify each by running the server, commit after each stage, keep the security model intact (sandboxed iframes, no network, static scan, rollback, redaction of paths).

1) REMIX
- Add a chat command named remix (same exclamation prefix as build and vote): remix <widget name or id> <requested change>. It goes through the same queue, voting and approval flow as a build request.
- For a remix, Codex receives the existing widget source as its starting point and may edit only that widget's own folder. The previous version stays in version history so Undo works.
- Give every widget a short human-friendly name and slug so viewers can type it easily. Show the names in the dashboard and in a small overlay hint card ("Remix any widget: remix <name> <change>").
- Dashboard widget cards get a Remix button that opens a text box.

2) STARTER PACK
- First audit the widgets already in library/. Replace or upgrade any that are weak. The final pack must contain 6 polished widgets built on the Widget API, each passing the same static scan and mock-mount checks: (a) prediction scoreboard where chat votes for option A or B with chat commands, (b) boss bar that chat damages and heals with chat commands, resets at zero or full, (c) follower and subscriber goal bar driven by follow and subscription events, (d) live chat poll with chat commands, (e) celebration effects for follow, subscription and raid (confetti, rain, fireworks, with synthesized WebAudio sounds), (f) countdown timer with an extend-time chat command.
- Each widget: beautiful modern design, smooth animations, readable on a dark or bright stream, declares size and anchor for the auto-layout engine, responds to the dashboard simulate buttons so it can be demoed without live traffic.
- One-click Add to scene from the Library tab.

3) LIBRARY IMPORT AND EXPORT
- Export a widget as a single .sfwidget file (JSON with code, meta, the original prompt, version).
- Import through a dashboard upload; imported code must pass the same safety scans and mock mount before it goes live. Reject unsafe files with a clear reason.
- Library cards show a live preview in a sandboxed iframe, the original prompt, and the creator name.

4) VERIFY
- Run the server, simulate every event type, test each widget with the mock api, test the export-import round trip, test a remix end to end with a real Codex build, run npx tsc --noEmit, update README.md and PROGRESS.md, and give me a short summary with how to test each feature in the browser.
