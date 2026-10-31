const params = new URLSearchParams(location.search);
const widgetId = params.get("id");
const previewBackgrounds = { dark: "#17151f", bright: "#f5f5f5", checker: "conic-gradient(#777 25%, #fff 0 50%, #777 0 75%, #fff 0) 0 / 24px 24px" };
if (params.get("preview") === "1") document.body.style.background = previewBackgrounds[params.get("bg")] || previewBackgrounds.dark;
const listeners = new Map();
const root = document.querySelector("#widget");
const api = {
  root,
  on(name, handler) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(handler); },
  sound: { play(cue = "sparkle") { try { const AudioContextType=window.AudioContext||window.webkitAudioContext; if(!AudioContextType)return; const context=new AudioContextType(); const oscillator=context.createOscillator(); const gain=context.createGain(); oscillator.type="sine"; oscillator.frequency.value=cue==="fanfare"?660:880; gain.gain.setValueAtTime(.0001,context.currentTime);gain.gain.exponentialRampToValueAtTime(.08,context.currentTime+.025);gain.gain.exponentialRampToValueAtTime(.0001,context.currentTime+.28);oscillator.connect(gain);gain.connect(context.destination);oscillator.start();oscillator.stop(context.currentTime+.3); } catch { /* browser may block synthesized audio until the viewer interacts */ } } },
  timers: { setTimeout: (...args) => window.setTimeout(...args), clearTimeout: (id) => window.clearTimeout(id), setInterval: (...args) => window.setInterval(...args), clearInterval: (id) => window.clearInterval(id) },
  storage: { get() { return null; }, set() {} },
};
function reportError(error) {
  const detail = String(error?.message || "Widget runtime error").replace(/[\r\n]/gu, " ").slice(0, 180);
  parent.postMessage({ kind: "streamforge:runtime-error", id: widgetId, detail }, "*");
}
window.addEventListener("error", (event) => reportError(event.error || new Error(event.message)));
window.addEventListener("unhandledrejection", (event) => reportError(event.reason));
window.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || message.kind !== "streamforge:event") return;
  for (const handler of listeners.get(message.event?.type) || []) {
    try { handler(message.event.payload || {}); } catch (error) { reportError(error); }
  }
});
try {
  const widget = await import(`/widgets/${encodeURIComponent(widgetId)}/index.js`);
  if (!widget.default?.meta || typeof widget.default.mount !== "function") throw new Error("Widget export is incomplete.");
  await widget.default.mount(api);
  parent.postMessage({ kind: "streamforge:mounted", id: widgetId }, "*");
} catch (error) {
  root.textContent = `Widget could not start: ${String(error?.message || "unknown error")}`;
  reportError(error);
}
