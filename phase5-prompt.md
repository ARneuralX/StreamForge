PHASE 5 (app themes and user profile). First verify with git log that the commits prefixed "Phase 4B stage" exist and that npm run qa:ui and npm run check:library pass; if not, stop and report. Read AGENTS.md, README.md, PROGRESS.md, docs/ and the source. Write a short audit note under a "Phase 5" heading in PROGRESS.md.

GLOBAL RULES
- Keep the security model intact (sandboxed iframes, CSP blocking network, static scan, rollback, redaction, untrusted text, secrets only in .env). Keep the Widget API backward compatible. Never weaken a check to make a test pass.
- No real Codex builds and no real Twitch traffic while developing; use mock and replay modes with an isolated temporary data directory for tests. No new runtime dependencies; a devDependency only if already justified in Phase 4B.
- Keep SIMULATED and DEMO MODE labels honest. Respect reduced motion and Safe Mode for every animation. Keep visible focus states, labels and AA contrast in every theme.
- Privacy: profile data stays on this computer, with no external requests, no Gravatar, no analytics.
- Run focused checks per stage and the full npm run qa:ui at the end of every stage. Commit after each stage with the prefix "Phase 5 stage N:".

STAGE 1 - TOKENIZE THE DASHBOARD STYLES
- Move every hard-coded color, shadow, radius and spacing value in the dashboard CSS into semantic CSS variables (surface, surface-raised, border, text, text-muted, accent, accent-2, success, warning, danger, focus ring, glass blur, gradients). Add a static check that fails on raw color literals outside the theme file. The current dark purple look becomes the theme "Midnight" with an identical appearance.

STAGE 2 - APP THEMES (at least four)
- Add four app themes plus Auto: Midnight (current dark purple), Daylight (light, clean, soft purple accents), Aurora (dark teal and mint) and Ember (dark warm, rose and amber accents). Auto follows prefers-color-scheme (Daylight or Midnight).
- A theme switcher in the header with live swatch previews and keyboard support, a smooth cross-fade (respecting reduced motion), persistence in localStorage and in the profile, and application before first paint so there is no flash. It must work on every page, modal, toast, the Library preview chrome and the recap controls.
- App themes affect only the dashboard chrome. The overlay stays transparent and keeps its own widget presets.
- qa:ui must pass in all four themes with AA contrast and zero overlap, and it generates the screenshot set per theme.

STAGE 3 - PROFILE BACKEND
- Local only. Store in data/profile (git-ignored): profile.json and an optional avatar file. Fields: firstName, lastName, email, displayName (optional), avatar, createdAt, updatedAt, preferences (theme).
- Routes: GET /api/profile, PUT /api/profile, POST /api/profile/avatar, DELETE /api/profile/avatar, GET /api/profile/export, DELETE /api/profile. Same-origin only, with the same origin and CSRF protection as the other mutating routes, atomic file writes and rate limits.
- Strict validation: names 1 to 40 code points after Unicode normalization (Latin, Bengali, Arabic, CJK allowed), control and bidi-override characters stripped; email format check with a 254 character limit and no network verification (label it Email, with Gmail as the example); avatar PNG, JPEG or WebP only, verified by magic bytes, at most 2 MB upload, re-encoded client-side to 256x256 WebP, anything else rejected. Escape all user data on render and never use innerHTML with it.

STAGE 4 - PROFILE PAGE UI
- A new Profile page in the sidebar. A hero card with an animated avatar ring (soft gradient glow, subtle hover), the name, email, member-since date and a theme picker shortcut. An edit form with first name, last name, email and an avatar drop zone with drag and drop, file picker, circular crop and zoom with keyboard controls, live preview and an initials fallback on a gradient.
- Save, cancel and an unsaved-changes guard, friendly inline validation, a success toast, the privacy note "Stored only on this computer, not linked to Google or Twitch", export my data and delete my profile with a confirm dialog. Provide empty, loading and error states everywhere, full keyboard access and AA contrast in all four themes.

STAGE 5 - ACTIVITY, STATS AND BADGES
- From real data (build history, widget git history, sessions, votes, clips) show: widgets built, live builds, remixes, rollbacks, streams run, best hype peak, total chat contributors (an aggregate count only), clips created and the most-used widget.
- A timeline of the last 15 activities (redacted, never chat text), a 7-day activity mini chart in plain SVG or CSS, and badges with locked and earned states and progress (First build, 10 widgets, First remix, Hype 90+, 5 streams, Safe Mode champion).
- Animations: count-up numbers, progress rings, staggered fade-in, badge unlock shimmer, all disabled under reduced motion and Safe Mode.
- SIMULATED and DEMO data never count toward real stats; show it separately with a visible label or exclude it.

STAGE 6 - SIDEBAR PROFILE CARD AND FIRST RUN
- Replace the "Local workspace" footer with a profile mini-card (avatar, name, link to Profile) and a quick theme toggle. First run shows a dismissible, non-blocking "Set up your profile" prompt.

STAGE 7 - FINAL QA AND DOCS
- Extend qa:ui to cover the Profile page in all four themes at 1024, 1280, 1440 and 1920 wide, plus 390 wide for Profile. Add tests for profile validation: XSS payloads in names, very long names, Bengali, Arabic RTL and emoji names, an oversize avatar, a wrong file type with a renamed extension, a corrupted image, rapid repeated saves, and delete then recreate.
- Run npm run qa:ui, npm run check:library, npx tsc --noEmit and the existing tests, and fix everything they report. Verify that the Phase 3, 4 and 4B features still work in mock mode.
- Update README.md, docs/QA_REPORT.md, docs/HOW_WE_USED_CODEX.md, PROGRESS.md and .gitignore (data/profile). Commit and finish with a short per-stage summary and anything unverified.
