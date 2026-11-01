import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import WebSocket from "ws";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const temporary = await mkdtemp(path.join(os.tmpdir(), "streamforge-widget-layout-"));
const findPort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const port = await findPort();
let debugPort = await findPort();
while (debugPort === port) debugPort = await findPort();
const dataDirectory = path.join(temporary, "data");
const widgetDirectory = path.join(temporary, "widgets");
await mkdir(dataDirectory, { recursive: true });
await mkdir(path.join(widgetDirectory, "community-747c3d47"), { recursive: true });
for (const file of ["widget.css", "runtime.js", "frame.html"]) await copyFile(path.join(root, "widgets", file), path.join(widgetDirectory, file));
let helloSource = await readFile(path.join(root, "widgets/community-747c3d47/index.js"), "utf8");
helloSource = helloSource.replace('subtitle.textContent = "Your little corner of the stream";', 'subtitle.textContent = "Your little corner of the stream";\n    api.on("chat", (event) => { subtitle.textContent = String(event.message || ""); });');
assert.notEqual(helloSource, await readFile(path.join(root, "widgets/community-747c3d47/index.js"), "utf8"), "long-copy fixture handler was added");
await writeFile(path.join(widgetDirectory, "community-747c3d47/index.js"), helloSource);
const defaults = [
  ["dice-roller", 440, 190], ["prediction-scoreboard", 440, 210], ["boss-bar", 500, 220],
  ["goal-bar", 500, 270], ["chat-poll", 440, 230], ["countdown-timer", 420, 210],
  ["screen-effects", 420, 260], ["welcome-banner", 460, 110], ["chat-runner", 480, 280],
].map(([id, width, height]) => ({ id, title: id, description: "Layout verification fixture", width, height, x: 0, y: 0, anchor: "top-left", enabled: false }));
defaults.push({ id: "community-747c3d47", title: "Hello Dashboard", description: "Long text layout verification", width: 360, height: 140, x: 0, y: 0, anchor: "top-left", enabled: true });
await writeFile(path.join(dataDirectory, "state.json"), JSON.stringify({ requests: [], requestHistory: [], widgets: defaults, library: [], widgetStorage: {}, settings: { buildMode: "mock" } }));

const server = spawn(process.execPath, [path.join(root, "dist/server.js")], { cwd: root, stdio: "ignore", env: { ...process.env, PORT: String(port), TWITCH_LIVE_ENABLED: "false", BUILD_MODE: "mock", STREAMFORGE_DATA_DIR: dataDirectory, STREAMFORGE_WIDGETS_DIR: widgetDirectory } });
const chromePath = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let chrome, socket;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(check, label, timeout = 20_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { try { const value = await check(); if (value) return value; } catch {} await pause(100); }
  throw new Error(`Timed out waiting for ${label}.`);
}

try {
  await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${port}/api/health`)).ok; } catch { return false; } }, "isolated mock server");
  chrome = spawn(chromePath, ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(temporary, "chrome")}`, `http://127.0.0.1:${port}/overlay/`], { stdio: "ignore" });
  const targets = await waitFor(async () => { try { return await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json(); } catch { return false; } }, "headless Chrome");
  const target = targets.find((item) => item.type === "page" && item.url.includes("/overlay/"));
  assert.ok(target, "Chrome opened the isolated overlay page");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  let commandId = 0;
  const pending = new Map();
  socket.on("message", (raw) => { const message = JSON.parse(raw.toString()); if (message.id && pending.has(message.id)) { const item = pending.get(message.id); pending.delete(message.id); message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result); } });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++commandId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); } }, 15_000).unref(); });
  const evaluate = async (expression, contextId) => { const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, ...(contextId ? { contextId } : {}) }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result?.value; };
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await waitFor(async () => evaluate(`Boolean(document.querySelector('#widgets iframe[title="Hello Dashboard"]')?.contentWindow)`), "hello banner iframe");
  await evaluate(`window.__layoutReports=[];addEventListener('message',event=>{if(event.data?.kind==='streamforge:layout-check'&&event.data.id==='community-747c3d47')window.__layoutReports.push(event.data)})`);
  const before = await evaluate(`document.querySelector('#widgets iframe[title="Hello Dashboard"]').getBoundingClientRect().height`);
  const longText = "Your little corner of the stream, filled with warm welcomes, shared stories, bright ideas, and all the small moments that make this community feel like home. ".repeat(3);
  await evaluate(`document.querySelector('#widgets iframe[title="Hello Dashboard"]').contentWindow.postMessage({kind:'streamforge:event',event:{type:'chat',payload:{message:${JSON.stringify(longText)}}}},'*')`);
  const result = await waitFor(async () => evaluate(`(()=>{const frame=document.querySelector('#widgets iframe[title="Hello Dashboard"]');const report=window.__layoutReports.at(-1);return report&&frame.style.height?{before:${before},height:parseFloat(frame.style.height),report}:null})()`), "long-text resize and overflow verification");
  assert.equal(result.report.ok, true, `layout verifier found ${result.report.overflowCount} overflowing text boxes`);
  assert.ok(result.height > result.before + 30, `long copy should grow the card (${result.before}px → ${result.height}px)`);
  assert.equal(result.report.layout.textAlign, "center");
  assert.equal(result.report.layout.display, "flex");
  assert.equal(result.report.layout.justifyContent, "center");
  assert.notEqual(result.report.layout.padding, "0px");
  process.stdout.write(`PASS widget layout verify: no overflowing text; centered card grew from ${result.before}px to ${result.height}px for long copy.\n`);
} finally {
  socket?.close();
  if (chrome) { const closed = new Promise((resolve) => chrome.once("close", resolve)); chrome.kill("SIGTERM"); await Promise.race([closed, pause(2000)]); }
  if (server) { const closed = new Promise((resolve) => server.once("close", resolve)); server.kill("SIGTERM"); await Promise.race([closed, pause(1000)]); }
  await rm(temporary, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
}
