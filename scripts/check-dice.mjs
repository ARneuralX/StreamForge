import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { checkWidgetSource } from "../dist/security/widget-checks.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const widgetRoot = path.join(repoRoot, "widgets");
for (const name of await readdir(widgetRoot)) {
  const sourcePath = path.join(widgetRoot, name, "index.js");
  try {
    const source = await readFile(sourcePath, "utf8");
    const result = await checkWidgetSource(source);
    if (!result.ok) throw new Error(`${name}: ${result.reason}`);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") continue;
    throw error;
  }
}

class FakeElement {
  constructor() { this.children = []; this.textContent = ""; this.className = ""; this.attributes = {}; this.style = {}; }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
}
const source = await readFile(path.join(widgetRoot, "dice-roller", "index.js"), "utf8");
const runnable = source.replace(/\bexport\s+default\s+/u, "globalThis.widget = ");
const deterministicMath = Object.create(Math);
deterministicMath.random = () => 0.999999;
const context = vm.createContext({ document: { createElement: () => new FakeElement() }, Math: deterministicMath, String, Number, Boolean, Array, Object, JSON, Map, Set });
new vm.Script(runnable).runInContext(context);
const listeners = new Map();
const soundEvents = [];
const root = new FakeElement();
context.widget.mount({ root, on: (event, handler) => listeners.set(event, handler), sound: { play: (cue) => soundEvents.push(cue) }, timers: {}, storage: {} });
listeners.get("chat")({ message: "!roll d20" });
const result = root.children[1];
const fireworks = root.children[2];
if (!result.textContent.includes("Rolled 20") || !fireworks.textContent.includes("🎆") || !fireworks.className.includes("active") || !soundEvents.includes("sparkle")) {
  throw new Error("Natural 20 must show the fireworks animation and play the sparkle cue.");
}
process.stdout.write("PASS all starter widgets pass the static scan and mock mount; natural 20 visibly activates fireworks.\n");
