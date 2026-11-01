UI REDESIGN (presentation only). Goal: every dashboard page must look and feel like a polished, finished product app. Today the pages look flat: no animation, nested double borders, tiny placeholder previews, plain numbered lists, raw codes and ISO timestamps, no icons, no live build terminal feel, and the overlay HUD pills overlap widgets. Read AGENTS.md and RESUME.md first and obey them. Never read or print .env or .streamforge/.

HARD RULES
- Presentation layer only. Do not change server logic, API routes or payloads, the event bus, Twitch or Codex code, the widget runtime, the scanner or any safety check. Keep every existing element id, data attribute, ARIA hook, route and exported function that scripts or tests use; if one must be renamed, update every usage and test in the same commit.
- No new dependencies (existing devDependencies are fine). No external fonts, CDNs or network images; draw your own inline SVG icons.
- Keep the design tokens and the four app themes (Midnight, Daylight, Aurora, Ember) plus Auto; no raw colors outside the theme file; AA contrast in every theme. Every animation must honour prefers-reduced-motion and Safe Mode with a static fallback.
- Honesty: never animate or label activity that is not real. A "Codex is building" chip or live terminal feed appears only during a real or replayed build, and the MOCK MODE, DEMO MODE and SIMULATED badges stay. Decorative motion (ambient glow, orb) must make no claims.
- Performance: animate only transform and opacity, pause animations that are off-screen, lazy-load previews, avoid layout thrash. The app must stay smooth with nine widgets.
- Never run git clean, git reset --hard or git checkout .; never delete directories other than generated output. After every stage run npx tsc --noEmit, the existing tests and npm run qa:ui, then commit "UI stage N: ...", tag ui-s<N> and update RESUME.md. If a usage or context limit is near, finish the current commit, update RESUME.md and stop.
- Session scope: the human tells you which stage range to run. If no range is given, run stages 1 to 3 only, then stop and print a summary.

BASELINE (before stage 1)
Run the existing checks, capture screenshots of every page into docs/screens/before/ and record the results in RESUME.md. If a check already fails, report it honestly.

STAGE 1 - DESIGN AND MOTION SYSTEM
- Single-layer cards (no nested double borders), an elevation scale, soft glow and gradient-border options for key cards, consistent radius and spacing, page-header component (title, subtitle, actions) and section components.
- Motion tokens (durations, easing) and utilities: reveal on scroll via IntersectionObserver, staggered entrance, hover lift, animated focus ring, skeleton shimmer, live pulse dot, count-up numbers, typewriter line appear, progress bars and rings.
- A subtle ambient background (CSS gradient mesh) behind the app shell, a small inline SVG icon set, friendly empty-state illustrations in SVG, toast and tooltip components.
- Human-friendly formatting helpers: relative times ("12 minutes ago" with the exact time on hover), friendly names for states (rolled_back becomes "Rolled back safely", live becomes "Live now"), thousands and percent formatting.

STAGE 2 - APP SHELL
- Sidebar with icons, grouped sections (Create: Overview, Build queue, Widgets, Library; Stream: Scenes, Demo Director, Sessions & Recap; Setup: Settings), an animated active indicator and collapse to an icon rail. Top bar with live status chips (Twitch chat, EventSub, Codex) with pulse dots, a clear mode badge (MOCK, CODEX, REPLAY or DEMO) and the theme switcher.
- Short, tasteful page transitions. Responsive: icon rail below 1100 px and a drawer below 768 px.

STAGE 3 - OVERVIEW
- Hero ("Imagine it. StreamForge it.") with an animated ring or orb and floating chips that reflect REAL state: "Idle, ready" normally, "Codex is building" only during an actual build, "Widget ready" only right after one went live.
- Health strip, key stats with count-up and small sparklines (aggregates only), a Quick start stepper with a progress ring (the setup checklist), a Quick controls card row (chat, follow, subscription, raid, redeem) with icons and a SIMULATED badge, an idea composer with template chips and the mic button, a recent-activity timeline, the Hype Signal meter, Scene Preset cards, the Demo Director card and the Recap preview.
- Fix every overlap on this page (for example the Hype slider overlapping Scene Presets) by using a clean grid with a spacing scale and no absolute positioning for flow content.
- Replace raw timestamps and codes with the friendly formatting from stage 1.

STAGE 4 - BUILD STUDIO AND QUEUE
- Live terminal-style build feed: redacted, human-readable lines that appear with a typewriter effect, a stage stepper (Received, Approved, Planning, Writing code, Safety checks, Live or Rolled back) with a progress bar, ticks for each safety check, an elapsed timer and a blinking cursor. It is shown only for real or replayed builds.
- Request cards with initials avatars, vote bars, status chips with icons and friendly text, clear primary (Approve) and secondary (Reject) actions, and a "what happened and what to do next" card for blocked or rolled-back builds, for example a safety-scan block for an external URL.
- Sandbox preview in a device-style frame with a working background toggle and simulate-event buttons; polished empty, loading and error states.

STAGE 5 - WIDGETS AND LIBRARY
- Rich cards in a grid with a real live preview thumbnail (sandboxed iframe, scaled, lazy-loaded with a skeleton while loading, paused when off-screen). Never show a blank white preview: apply the shared background setting.
- Primary on/off toggle switch, icon buttons with tooltips for Remix, Export, Versions and Undo, Delete with a confirm dialog, and the X/Y position inside a small popover instead of always-visible inputs. The Widget Passport becomes expandable chips (events, motion risk, scan result) and the health badge stays.
- Library: search, category filters, a drag-and-drop import zone, and "Add to scene" with a small success animation.

STAGE 6 - OTHER PAGES
- Settings: grouped sections, toggles and segmented controls instead of raw checkboxes where suitable, theme swatches, helpful descriptions and a sticky save bar with an unsaved-changes indicator.
- Scenes as cards with mini previews, Sessions & Recap with the rendered card centred plus download and copy actions, and the Demo Director as a step-by-step timeline player that highlights the running step.
- Any other existing page gets the same page header, cards and states.

STAGE 7 - OVERLAY HUD AND LAYOUT
- The hint pills, the Hype meter, the build-mode pill and the Up-next card overlap widgets today. Move them into reserved HUD zones with collision avoidance so they never cover a widget, even with all nine widgets on scene. The overlay stays fully transparent by default and keeps its existing URL parameters.

STAGE 8 - QA, REGRESSION AND DOCS
- Add npm run ui:smoke: a click-through in mock mode (open every nav page, add an idea to the queue, simulate each event type, switch every theme, add a library widget to the scene, undo, toggle Safe Mode) that fails on console errors.
- Extend qa:ui to every page, all four themes, widths 1024, 1440 and 1920, plus 390 for Overview, Queue, Widgets and Library. Zero overlaps, zero overflow, AA contrast. Add an overlay overlap test with nine widgets and a reduced-motion test confirming no animations run.
- Capture docs/screens/after/, update README.md and docs/QA_REPORT.md, tick RESUME.md, and print a before and after summary.

DEFINITION OF DONE
Every page has a page header, consistent single-layer cards, at least one purposeful animation, empty, loading and error states, keyboard focus, AA contrast in all themes and no overlaps. All existing tests and checks still pass and every previous feature behaves exactly as before.
