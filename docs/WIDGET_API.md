# StreamForge Widget API

Widgets are ES modules at `widgets/<id>/index.js` and export a default object with `meta` and `mount(api)`.

```js
export default {
  meta: { title: "Example", description: "A small overlay", width: 420, height: 180, x: 0, y: 0, anchor: "top-left" },
  mount(api) {
    api.on("chat", (event) => { /* use validated event data */ });
    api.root.textContent = "Ready";
  },
};
```

The host supplies `root`, `on(event, handler)`, `sound`, timer helpers, per-widget `storage`, and `theme`. Supported events are `chat`, `follow`, `sub`, `raid` and `redeem`. `sound.play(cue)` uses a short synthesized WebAudio tone; browsers may require an earlier user interaction before audio plays. The API is intentionally small. Widgets run in sandboxed frames with network access blocked by CSP. Treat every event value as untrusted text and render it with DOM text APIs.

`api.theme` provides the current validated tokens: `accent`, `accent2`, `background`, `text`, `glow` (six-digit hex colors), `radius` (0–40), `fontStack` (`system-ui`, `Arial`, `Georgia` or `Trebuchet MS`) and `animationSpeed` (0.5–2). The host applies matching CSS custom properties to the frame root and sends updates without remounting widgets. Widgets that do not read these tokens remain compatible. Theme changes come from five presets, the moderator `!theme <Halloween|Neon|Cozy|Retro|Clean>` command, or a one-click Overlay Kit. AI theme requests use a named preset fallback while Codex is unavailable; no generated code is accepted as a theme.
