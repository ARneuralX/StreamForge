import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { inflateSync } from "node:zlib";
import WebSocket from "ws";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = await mkdtemp(path.join(os.tmpdir(), "streamforge-theme-pixels-"));
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    server.close(() => resolve(port));
  });
});
const port = await freePort();
const debugPort = await freePort();
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(root, "dist/server.js")], {
  cwd: root,
  stdio: "ignore",
  env: { ...process.env, PORT: String(port), OPEN_BROWSER: "false", TWITCH_LIVE_ENABLED: "false", BUILD_MODE: "mock", STREAMFORGE_DATA_DIR: path.join(temp, "data") },
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let chrome;
let socket;

function decodePng(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const chunks = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    }
    if (type === "IDAT") chunks.push(data);
    offset += length + 12;
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) throw new Error("Unexpected screenshot PNG format.");
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(chunks));
  const pixels = Buffer.alloc(height * stride);
  let source = 0;
  for (let row = 0; row < height; row++) {
    const filter = raw[source++];
    for (let col = 0; col < stride; col++) {
      const value = raw[source++];
      const left = col >= channels ? pixels[row * stride + col - channels] : 0;
      const above = row ? pixels[(row - 1) * stride + col] : 0;
      const upperLeft = row && col >= channels ? pixels[(row - 1) * stride + col - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) {
        const p = left + above - upperLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - above), pc = Math.abs(p - upperLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft;
      } else if (filter !== 0) throw new Error("Unknown PNG filter.");
      pixels[row * stride + col] = (value + predictor) & 255;
    }
  }
  return { width, height, channels, stride, pixels };
}

function changedPixels(before, after, rect) {
  const left = Math.max(0, Math.floor(rect.x));
  const top = Math.max(0, Math.floor(rect.y));
  const right = Math.min(before.width, Math.ceil(rect.right));
  const bottom = Math.min(before.height, Math.ceil(rect.bottom));
  let changed = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const a = y * before.stride + x * before.channels;
      const b = y * after.stride + x * after.channels;
      if (before.pixels[a] !== after.pixels[b] || before.pixels[a + 1] !== after.pixels[b + 1] || before.pixels[a + 2] !== after.pixels[b + 2]) changed++;
    }
  }
  return changed;
}

async function waitFor(check, label, timeout = 20_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const value = await check(); if (value) return value; } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

try {
  await waitFor(async () => { try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; } }, "isolated mock server");
  const chromeBin = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  chrome = spawn(chromeBin, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(temp, "chrome")}`, `${base}/dashboard/#overview`], { stdio: "ignore" });
  const targets = await waitFor(async () => { try { return await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json(); } catch { return false; } }, "headless Chrome");
  const target = targets.find(item => item.type === "page" && item.url.includes("dashboard"));
  assert.ok(target, "Chrome dashboard target was not created.");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  let commandId = 0;
  const pending = new Map();
  socket.on("message", raw => {
    const message = JSON.parse(raw.toString());
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
    }
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++commandId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); } }, 20_000).unref();
  });
  const evaluate = async expression => {
    const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result?.value;
  };
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await cdp("Page.navigate", { url: `${base}/overlay/` });
  const frames = await waitFor(async () => { const found = await evaluate(`(()=>[...document.querySelectorAll("#widgets iframe")].map(frame=>{const r=frame.getBoundingClientRect();return{id:new URL(frame.src).searchParams.get("id"),x:r.x,y:r.y,right:r.right,bottom:r.bottom}}))()`);return found.length===9?found:false; }, "all sandboxed starter widgets");
  assert.equal(frames.length, 9, `Expected all nine starter widget frames; got ${frames.length}.`);
  await sleep(350);
  await evaluate(`(()=>{window.__themeReceipts=[];window.addEventListener("message",event=>{const message=event.data;if(message?.kind!=="streamforge:theme-applied")return;const frame=[...document.querySelectorAll("#widgets iframe")].find(item=>item.contentWindow===event.source);if(frame&&new URL(frame.src).searchParams.get("id")===message.id)window.__themeReceipts.push({id:message.id,tokens:message.tokens});});return true})()`);
  const presets = ["Halloween", "Neon", "Cozy", "Retro", "Clean"];
  const captures = {};
  const failures = [];
  let observedTokens;
  const appliedTokens = Object.fromEntries(frames.map(frame => [frame.id, {}]));
  for (const preset of presets) {
    const response = await fetch(`${base}/api/theme`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ preset }) });
    assert.equal(response.ok, true, `Preset ${preset} was rejected.`);
    const state = await (await fetch(`${base}/api/state`)).json();
    assert.equal(state.settings.themePreset, preset);
    observedTokens ||= {};
    observedTokens[preset] = state.settings.themeTokens;
    await sleep(250);
    await waitFor(async()=>evaluate(`window.__themeReceipts.filter(item=>item.tokens.accent===${JSON.stringify(state.settings.themeTokens.accent)}).length>=9`),`theme acknowledgements for ${preset}`);
    const receipts=await evaluate(`window.__themeReceipts.filter(item=>item.tokens.accent===${JSON.stringify(state.settings.themeTokens.accent)})`);
    for(const frame of frames){const receipt=receipts.find(item=>item.id===frame.id);if(!receipt){failures.push(`${frame.id} did not acknowledge ${preset} tokens.`);continue;}appliedTokens[frame.id][preset]=receipt.tokens;}
    const screenshot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true });
    const png = Buffer.from(screenshot.data, "base64");
    captures[preset] = decodePng(png);
    if (preset === "Halloween") await writeFile(path.join(root, "qa-artifacts", "theme-audit.png"), png);
  }
  for (const token of ["accent", "accent2", "background", "text", "glow"]) {
    const values = presets.map(preset => observedTokens[preset][token]);
    if (new Set(values).size < presets.length) failures.push(`Preset API returned fewer than five distinct ${token} tokens.`);
  }
  for (const frame of frames) for (const preset of presets) {
    const source=observedTokens[preset],applied=appliedTokens[frame.id][preset];
    const expected={accent:source.accent,accent2:source.accent2,background:source.background,text:source.text,glow:source.glow,radius:`${source.radius}px`,fontStack:source.fontStack,animationSpeed:String(source.animationSpeed)};
    for (const [token,value] of Object.entries(expected)) if(applied?.[token]!==value) failures.push(`${frame.id} applied --${token} does not match the delivered ${preset} token.`);
  }
  const themeDiffs = {};
  for (const frame of frames) {
    themeDiffs[frame.id] = {};
    for (const preset of presets.slice(1)) {
      const diff = changedPixels(captures.Halloween, captures[preset], frame);
      themeDiffs[frame.id][preset] = diff;
      if (diff < 100) failures.push(`${frame.id} did not visibly change from Halloween to ${preset} (${diff} pixels).`);
    }
  }

  const widgetCss = await readFile(path.join(root, "widgets/widget.css"), "utf8");
  for (const token of ["accent", "accent2", "background", "text", "glow", "radius", "fontStack", "animationSpeed"]) {
    if (!widgetCss.includes(`var(--${token}`)) failures.push(`Shared widget CSS does not consume --${token}.`);
  }
  const widgetFiles = await (await import("node:fs/promises")).readdir(path.join(root, "widgets"));
  const hardcoded = [];
  const allowedRunnerColors = new Set(["#182033", "#302044", "#173b35", "#482a31"]);
  for (const id of widgetFiles) {
    const file = path.join(root, "widgets", id, "index.js");
    try {
      const source = await readFile(file, "utf8");
      const colors = [...source.matchAll(/#[\da-f]{3,8}\b/giu)].map(match => match[0]);
      if (colors.some(color => id !== "chat-runner" || !allowedRunnerColors.has(color.toLowerCase()))) hardcoded.push(`${id}: ${colors.join(", ")}`);
    } catch { /* non-widget entry */ }
  }
  if (hardcoded.length) failures.push(`Hardcoded widget source colors outside allowlist: ${hardcoded.join("; ")}`);

  await cdp("Page.navigate", { url: `${base}/overlay/?recap=1` });
  await waitFor(async () => evaluate("!document.querySelector('#recap-overlay')?.hidden&&document.querySelector('#recap-canvas')?.width>0"), "recap overlay");
  const recapRect = await evaluate(`(()=>{const r=document.querySelector("#recap-canvas").getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom}})()`);
  await sleep(150);
  const recapCaptures = {};
  for (const preset of presets) {
    await fetch(`${base}/api/theme`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ preset }) });
    await sleep(200);
    const screenshot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true });
    recapCaptures[preset] = decodePng(Buffer.from(screenshot.data, "base64"));
  }
  const recapDiffs = {};
  for (const preset of presets.slice(1)) {
    recapDiffs[preset] = changedPixels(recapCaptures.Halloween, recapCaptures[preset], recapRect);
    if (recapDiffs[preset] < 100) failures.push(`Recap overlay did not visibly redraw for ${preset} (${recapDiffs[preset]} pixels).`);
  }

  process.stdout.write(`Theme proof: ${frames.length} sandboxed widgets × ${presets.length} presets; recap overlay × ${presets.length}; static hardcoded-color allowlist checked.\n`);
  for (const [id, diffs] of Object.entries(themeDiffs)) process.stdout.write(`${id}: ${Object.entries(diffs).map(([preset, count]) => `${preset} ${count}px`).join(" · ")}\n`);
  process.stdout.write(`recap overlay: ${Object.entries(recapDiffs).map(([preset, count]) => `${preset} ${count}px`).join(" · ")}\n`);
  if (failures.length) {
    for (const failure of failures) process.stdout.write(`FAIL ${failure}\n`);
    process.exitCode = 1;
  } else process.stdout.write("PASS delivered preset tokens change every sandboxed widget and the recap overlay.\n");
} finally {
  socket?.close();
  if (chrome) { const closed = new Promise(resolve => chrome.once("close", resolve)); chrome.kill("SIGTERM"); await Promise.race([closed, sleep(1500)]); }
  server.kill("SIGTERM");
  await rm(temp, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
}
