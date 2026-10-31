const params = new URLSearchParams(location.search);
const widgetId = params.get("id");
const listeners = new Map();
const root = document.querySelector("#widget");
const api = {
  root,
  on(name, handler) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(handler); },
  sound: { play() {} },
  timers: { setTimeout, clearTimeout, setInterval, clearInterval },
  storage: { get() { return null; }, set() {} },
};
window.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || message.kind !== "streamforge:event") return;
  for (const handler of listeners.get(message.event?.type) || []) {
    try { handler(message.event.payload || {}); } catch { /* isolate widget event failures */ }
  }
});
try {
  const widget = await import(`/widgets/${encodeURIComponent(widgetId)}/index.js`);
  if (!widget.default?.meta || typeof widget.default.mount !== "function") throw new Error("Widget export is incomplete.");
  await widget.default.mount(api);
  parent.postMessage({ kind: "streamforge:mounted", id: widgetId }, "*");
} catch (error) {
  root.textContent = `Widget could not start: ${String(error?.message || "unknown error")}`;
  parent.postMessage({ kind: "streamforge:error", id: widgetId }, "*");
}
