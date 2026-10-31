import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = await mkdtemp(path.join(os.tmpdir(), "streamforge-ui-smoke-"));
const freePort = () => new Promise((resolve, reject) => {
  const listener = net.createServer(); listener.once("error", reject);
  listener.listen(0, "127.0.0.1", () => { const value = listener.address().port; listener.close(() => resolve(value)); });
});
const appPort = await freePort(); let debugPort = await freePort(); while (debugPort === appPort) debugPort = await freePort();
const base = `http://127.0.0.1:${appPort}`;
const server = spawn(process.execPath, [path.join(root, "dist/server.js")], { cwd: root, stdio: "ignore", env: { ...process.env, PORT: String(appPort), OPEN_BROWSER: "false", TWITCH_LIVE_ENABLED: "false", BUILD_MODE: "mock", STREAMFORGE_DATA_DIR: path.join(temp, "data") } });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let chrome, socket;
const browserErrors = [], failedRequests = [];
async function waitFor(check, label, timeout = 20_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { const value = await check(); if (value) return value; } catch {} await sleep(100); }
  throw Error(`Timed out waiting for ${label}.`);
}

try {
  await waitFor(async () => { try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; } }, "mock server");
  const chromeBin = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  chrome = spawn(chromeBin, ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(temp, "chrome")}`, `${base}/dashboard/#overview`], { stdio: "ignore" });
  const targets = await waitFor(async () => { try { return await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json(); } catch { return false; } }, "headless Chrome");
  const target = targets.find((item) => item.type === "page" && item.url.includes("/dashboard/")); if (!target) throw Error("Chrome dashboard target was not created.");
  socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  let commandId = 0; const pending = new Map();
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.method === "Runtime.exceptionThrown") browserErrors.push(`${message.params.exceptionDetails.text || "Uncaught page exception"}: ${message.params.exceptionDetails.exception?.description || ""}`);
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") browserErrors.push(message.params.args.map((item) => item.value || item.description || "").join(" "));
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") browserErrors.push(message.params.entry.text);
    if (message.method === "Network.loadingFailed" && !message.params.canceled) failedRequests.push(message.params.errorText);
    if (!message.id || !pending.has(message.id)) return;
    const item = pending.get(message.id); pending.delete(message.id);
    message.error ? item.reject(Error(message.error.message)) : item.resolve(message.result);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++commandId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(Error(`CDP timeout ${method}`)); } }, 20_000).unref();
  });
  const evaluate = async (expression) => {
    const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
    return result.result?.value;
  };
  await cdp("Runtime.enable"); await cdp("Log.enable"); await cdp("Network.enable"); await cdp("Page.enable");
  const pages = [["overview", "Overview"], ["queue", "Build Studio"], ["widgets", "Widgets"], ["library", "Widget library"], ["settings", "Settings"], ["sessions", "Stream sessions"], ["scenes", "Scene presets"], ["demo", "Demo Director"]];
  for (const [page, title] of pages) {
    await evaluate(`document.querySelector('[data-page="${page}"]').click()`);
    await waitFor(async () => evaluate(`document.querySelector('#page h1')?.textContent===${JSON.stringify(title)}`), `${title} navigation`);
  }

  await evaluate(`(()=>{document.querySelector('[data-page="overview"]').click();return true})()`);
  await waitFor(async () => evaluate("Boolean(document.querySelector('#request-form'))"), "Overview request form");
  await evaluate(`(()=>{const field=document.querySelector('#request-text');field.value='A friendly smoke-check alert';document.querySelector('#request-form').requestSubmit();return true})()`);
  await waitFor(async () => evaluate("document.querySelector('#request-result')?.textContent.includes('Added to queue')"), "idea added to queue");

  await evaluate(`(()=>{document.querySelector('details[data-section="appearance"]').open=true;return true})()`);
  for (const event of ["chat", "follow", "sub", "raid", "redeem"]) {
    await evaluate(`(()=>{document.querySelector('[data-event="${event}"]').click();return true})()`);
    await sleep(80);
  }
  for (const theme of ["Halloween", "Neon", "Cozy", "Retro", "Clean"]) {
    await evaluate(`(()=>{document.querySelector('[data-theme="${theme}"]').click();return true})()`);
    await waitFor(async () => evaluate(`document.querySelector('[data-theme="${theme}"]')?.getAttribute('aria-pressed')==='true'`), `${theme} widget theme`);
  }

  await evaluate(`(()=>{document.querySelector('[data-page="library"]').click();return true})()`);
  await waitFor(async () => evaluate("Boolean(document.querySelector('.library-card [data-add][disabled]'))"), "Library widget already in scene");
  await evaluate(`(()=>{const card=document.querySelector('.library-card [data-add][disabled]').closest('.library-card');card.querySelector('[data-remove]').click();return true})()`);
  await waitFor(async () => evaluate("Boolean(document.querySelector('.library-card [data-add]:not([disabled])'))"), "available Library widget");
  await evaluate(`(()=>{document.querySelector('.library-card [data-add]:not([disabled])').click();return true})()`);
  await waitFor(async () => evaluate("[...document.querySelectorAll('.library-card [data-add]')].some(button=>button.textContent==='In scene')"), "Library widget added to scene");

  await evaluate(`(()=>{document.querySelector('[data-page="scenes"]').click();return true})()`);
  await waitFor(async () => evaluate("Boolean(document.querySelector('[data-apply]'))"), "scene controls");
  const previousScene = await evaluate("fetch('/api/scenes').then(response=>response.json()).then(data=>data.activeScene)");
  await evaluate("document.querySelector('[data-apply]').click()");
  await waitFor(async () => evaluate("Boolean(document.querySelector('#undo-scene')&&!document.querySelector('#undo-scene').disabled)"), "scene Undo enabled");
  await evaluate("document.querySelector('#undo-scene').click()");
  await waitFor(async () => evaluate(`fetch('/api/scenes').then(response=>response.json()).then(data=>data.activeScene===${JSON.stringify(previousScene)}&&document.querySelector('#undo-scene')?.disabled===true)`), "scene Undo completed");

  await evaluate(`(()=>{document.querySelector('[data-page="overview"]').click();return true})()`);
  await waitFor(async () => evaluate("Boolean(document.querySelector('#safe-mode'))"), "Safe Mode control");
  await evaluate(`(()=>{document.querySelector('#safe-mode').value='minimal';document.querySelector('#apply-safe-mode').click();return true})()`);
  await waitFor(async () => evaluate("fetch('/api/state').then(response=>response.json()).then(state=>state.settings.safeMode==='minimal')"), "Safe Mode toggled");
  await sleep(250);
  if (browserErrors.length || failedRequests.length) throw Error(`Browser errors=${JSON.stringify(browserErrors)} failed requests=${JSON.stringify(failedRequests)}`);
  process.stdout.write("PASS UI smoke: all 8 nav pages, queue idea, 5 simulated event controls, all 5 existing widget themes, Library Add and scene Undo, Safe Mode. Zero browser console errors or failed requests.\n");
} catch (error) {
  process.stderr.write(`FAIL UI smoke: ${error.stack || error}\n`);
  process.exitCode = 1;
} finally {
  socket?.close();
  if (chrome) { const closed = new Promise((resolve) => chrome.once("close", resolve)); chrome.kill("SIGTERM"); await Promise.race([closed, sleep(2000)]); }
  { const closed = new Promise((resolve) => server.once("close", resolve)); server.kill("SIGTERM"); await Promise.race([closed, sleep(1000)]); }
  await rm(temp, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
}
