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

The host supplies `root`, `on(event, handler)`, `sound`, timer helpers and per-widget `storage`. Supported events are `chat`, `follow`, `sub`, `raid` and `redeem`. The API is intentionally small. Widgets run in sandboxed frames with network access blocked by CSP. Treat every event value as untrusted text and render it with DOM text APIs.
