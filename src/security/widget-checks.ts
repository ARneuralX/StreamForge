import vm from "node:vm";

const forbidden: Array<[RegExp, string]> = [
  [/\bfetch\s*\(/u, "network request API fetch"],
  [/\bXMLHttpRequest\b/u, "XMLHttpRequest"],
  [/\bWebSocket\b/u, "WebSocket"],
  [/\beval\s*\(/u, "eval"],
  [/\bnew\s+Function\b|\bFunction\s*\(/u, "Function constructor"],
  [/\bimport\s*\(/u, "dynamic import"],
  [/document\s*\.\s*cookie/u, "document.cookie"],
  [/\blocalStorage\b/u, "localStorage"],
  [/\bwindow\s*\.\s*(?:parent|top)\b/u, "window parent/top access"],
  [/(?:https?:)?\/\//iu, "external URL"],
];

export type WidgetCheckResult = { ok: boolean; reason?: string; checks: { syntax: boolean; network: boolean; forbiddenApis: boolean; mockMount: boolean } };

export async function checkWidgetSource(source: string): Promise<WidgetCheckResult> {
  for (const [pattern, label] of forbidden) {
    if (pattern.test(source)) return { ok: false, reason: `Safety scan blocked ${label}.`, checks: { syntax: true, network: false, forbiddenApis: false, mockMount: false } };
  }
  if (!/export\s+default\s+\{/u.test(source) || !/\bmeta\s*:/u.test(source) || !/\bmount\s*\(/u.test(source)) {
    return { ok: false, reason: "Widget must export default { meta, mount }.", checks: { syntax: false, network: true, forbiddenApis: true, mockMount: false } };
  }
  try {
    const executable = source.replace(/\bexport\s+default\s+/u, "globalThis.widget = ");
    const script = new vm.Script(executable, { filename: "widget-module.js" });
    const makeElement = () => ({ textContent: "", children: [] as unknown[], append(...children: unknown[]) { this.children.push(...children); } });
    const context = vm.createContext({ document: { createElement: makeElement }, Math, String, Number, Boolean, Array, Object, JSON, Map, Set, Promise });
    script.runInContext(context, { timeout: 500 });
    const widget = (context as { widget?: { meta?: unknown; mount?: (api: unknown) => unknown } }).widget;
    if (!widget?.meta || typeof widget.mount !== "function") throw new Error("missing default export or meta");
    const listeners = new Map<string, Function[]>();
    const api = {
      root: makeElement(),
      on(name: string, handler: Function) { listeners.set(name, [...(listeners.get(name) || []), handler]); },
      sound: { play() {} }, timers: { setTimeout, clearTimeout, setInterval, clearInterval }, storage: { get() { return null; }, set() {} },
    };
    const mountResult = widget.mount(api);
    if (mountResult instanceof Promise) await mountResult;
    return { ok: true, checks: { syntax: true, network: true, forbiddenApis: true, mockMount: true } };
  } catch {
    return { ok: false, reason: "Widget failed the syntax or mock mount check.", checks: { syntax: false, network: true, forbiddenApis: true, mockMount: false } };
  }
}
