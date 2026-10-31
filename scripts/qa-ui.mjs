import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import WebSocket from "ws";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(root, "qa-artifacts");
await mkdir(artifacts, { recursive: true });
const temp = await mkdtemp(path.join(os.tmpdir(), "streamforge-ui-qa-"));
const freePort = () => new Promise((resolve, reject) => {
  const listener = net.createServer(); listener.once("error", reject);
  listener.listen(0, "127.0.0.1", () => { const value = listener.address().port; listener.close(() => resolve(value)); });
});
const appPort = await freePort(); let debugPort = await freePort();
while (debugPort === appPort) debugPort = await freePort();
const base = `http://127.0.0.1:${appPort}`;
const server = spawn(process.execPath, [path.join(root, "dist/server.js")], { cwd: root, stdio: "ignore", env: { ...process.env, PORT: String(appPort), OPEN_BROWSER: "false", TWITCH_LIVE_ENABLED: "false", BUILD_MODE: "mock", STREAMFORGE_DATA_DIR: path.join(temp, "data") } });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms)); let chrome, socket;
async function waitFor(check, label, timeout = 20_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { const value = await check(); if (value) return value; } catch {} await sleep(100); }
  throw Error(`Timed out waiting for ${label}.`);
}
try {
  await waitFor(async () => { try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; } }, "isolated mock server");
  const chromeBin = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  chrome = spawn(chromeBin, ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(temp, "chrome")}`, `${base}/dashboard/#overview`], { stdio: "ignore" });
  const targets = await waitFor(async () => { try { return await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json(); } catch { return false; } }, "headless Chrome");
  const target = targets.find(item => item.type === "page" && item.url.includes("/dashboard/")); if (!target) throw Error("Chrome dashboard target was not created.");
  socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  let id = 0; const pending = new Map(), failures = [], browserErrors = [], failedRequests = [];
  socket.on("message", raw => {
    const message = JSON.parse(raw.toString());
    if (message.id && pending.has(message.id)) { const item = pending.get(message.id); pending.delete(message.id); message.error ? item.reject(Error(message.error.message)) : item.resolve(message.result); }
    if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params.exceptionDetails.text || "Uncaught page exception");
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) browserErrors.push(`${message.params.type}: ${message.params.args.map(item => item.value || item.description || "").join(" ")}`);
    if (message.method === "Log.entryAdded" && ["error", "warning"].includes(message.params.entry.level)) browserErrors.push(`${message.params.entry.level}: ${message.params.entry.text}`);
    if (message.method === "Network.loadingFailed" && !message.params.canceled) failedRequests.push(message.params.errorText);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const commandId = ++id; pending.set(commandId, { resolve, reject }); socket.send(JSON.stringify({ id: commandId, method, params }));
    setTimeout(() => { if (pending.has(commandId)) { pending.delete(commandId); reject(Error(`CDP timeout ${method}`)); } }, 20_000).unref();
  });
  await cdp("Runtime.enable"); await cdp("Log.enable"); await cdp("Page.enable"); await cdp("Network.enable");
  const evaluate = async expression => { const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.text); return result.result?.value; };
  const viewports = [[1024, 768], [1280, 720], [1440, 900], [1920, 1080]];
  const pages = [["overview", "Overview"], ["queue", "Build Studio"], ["widgets", "Widgets"], ["library", "Widget library"], ["settings", "Settings"], ["sessions", "Stream sessions"], ["scenes", "Scene presets"], ["demo", "Demo Director"]];
  const layoutExpression = `(()=>{
    const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=="none"&&s.visibility!=="hidden"};
    const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
    const root=document.querySelector("#page"),els=[...root.querySelectorAll("*")].filter(visible);
    const clipped=els.filter(e=>{const s=getComputedStyle(e);return(s.overflow==="hidden"||s.overflowX==="hidden"||s.overflowY==="hidden"||s.overflow==="clip")&&(e.scrollWidth>e.clientWidth+2||e.scrollHeight>e.clientHeight+2)}).slice(0,8).map(e=>({text:e.innerText?.slice(0,40),box:rect(e)}));
    const overflow=document.documentElement.scrollWidth>document.documentElement.clientWidth+1||document.body.scrollWidth>document.body.clientWidth+1;
    const targets=[...root.querySelectorAll("button,a,input,select,textarea,[role=button]")].filter(visible).map(e=>["checkbox","radio"].includes(e.type)?e.closest("label")||e:e).filter(e=>{const r=e.getBoundingClientRect();return r.width<32||r.height<32}).slice(0,8).map(e=>({tag:e.tagName,text:e.innerText?.slice(0,30),box:rect(e)}));
    const cards=[...root.querySelectorAll(".card")].filter(visible),overlaps=[];
    for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){if(cards[i].contains(cards[j])||cards[j].contains(cards[i]))continue;const a=rect(cards[i]),b=rect(cards[j]),w=Math.min(a.right,b.right)-Math.max(a.x,b.x),h=Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y);if(w>2&&h>2)overlaps.push({a:cards[i].querySelector("h1,h2,h3")?.textContent,b:cards[j].querySelector("h1,h2,h3")?.textContent,area:w*h});}
    const rgba=v=>{const m=v.match(/[\\d.]+/gu)||[];return[m.length?Number(m[0]):0,m.length>1?Number(m[1]):0,m.length>2?Number(m[2]):0,m.length>3?Number(m[3]):1]};
    const blend=(top,bottom)=>{const a=top[3],out=a+bottom[3]*(1-a);return[0,1,2].map(i=>out?(top[i]*a+bottom[i]*bottom[3]*(1-a))/out:0).concat(out)};
    const lum=c=>{const q=c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*q[0]+.7152*q[1]+.0722*q[2]};const contrast=[];
    for(const e of els){if(!e.innerText?.trim()||e.children.length&&e.innerText.trim().length<2)continue;const s=getComputedStyle(e),fg=rgba(s.color);let bg=[12,11,18,1],anc=[];for(let n=e;n;n=n.parentElement)anc.unshift(n);for(const n of anc){const cs=getComputedStyle(n),raw=cs.backgroundColor;if(raw!=="rgba(0, 0, 0, 0)"&&raw!=="transparent")bg=blend(rgba(raw),bg);const stops=cs.backgroundImage.match(/rgba?\\([^)]*\\)/gu)||[];if(stops.length>=2)bg=blend(blend(rgba(stops[0]),rgba(stops.at(-1))),bg);}const ratio=(Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05),large=parseFloat(s.fontSize)>=24||parseFloat(s.fontSize)>=18.66&&parseInt(s.fontWeight)>=700;if(ratio<(large?3:4.5))contrast.push({text:e.innerText.trim().slice(0,32),ratio:Number(ratio.toFixed(2))});}
    const stats=document.querySelector(".overview-stats"),twoColumn=document.querySelector(".overview-two-column"),overviewAudit=location.hash==="#overview"?{statsGrid:getComputedStyle(stats).display==="grid"&&getComputedStyle(stats).gridTemplateColumns.split(" ").length>=3,twoColumnGrid:getComputedStyle(twoColumn).display==="grid"&&getComputedStyle(twoColumn).gridTemplateColumns.split(" ").length>=2,summarySpaced:getComputedStyle(document.querySelector(".overview-section summary")).display==="flex",demoCollapsible:Boolean(document.querySelector("#overview-demo details[data-section=demo]")),recapContained:document.querySelector("#overview-recap").getBoundingClientRect().width<=document.querySelector("#overview-recap").parentElement.getBoundingClientRect().width+1,themeSwatches:document.querySelectorAll(".theme-preview-strip [data-theme]").length===5&&document.querySelectorAll('.theme-preview-strip [data-theme][aria-pressed="true"]').length===1}:null;
    return{overflow,clipped,targets,overlaps,contrast:contrast.slice(0,8),overviewAudit};
  })()`;
  for (const [width, height] of viewports) {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    for (const [hash, title] of pages) {
      const name = `${hash}-${width}x${height}`; await cdp("Page.navigate", { url: `${base}/dashboard/#${hash}` });
      await waitFor(async () => evaluate(`document.querySelector('#page h1')?.textContent===${JSON.stringify(title)}`), name); await sleep(100);
      const result = await evaluate(layoutExpression);
      if(hash==="overview"&&Object.entries(result.overviewAudit||{}).some(([,passed])=>!passed))failures.push(`${name}: overview structure ${JSON.stringify(result.overviewAudit)}`);
      if (result.overflow) failures.push(`${name}: horizontal overflow`); if (result.clipped.length) failures.push(`${name}: clipped text ${JSON.stringify(result.clipped)}`);
      if (result.targets.length) failures.push(`${name}: undersized targets ${JSON.stringify(result.targets)}`); if (result.overlaps.length) failures.push(`${name}: overlapping cards ${JSON.stringify(result.overlaps)}`);
      if (result.contrast.length) failures.push(`${name}: low contrast ${JSON.stringify(result.contrast)}`);
      const image = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true }); await writeFile(path.join(artifacts, `${name}.png`), Buffer.from(image.data, "base64"));
    }
  }
  await cdp("Page.navigate", { url: `${base}/dashboard/#overview` });
  await waitFor(async()=>evaluate("document.querySelector('#page h1')?.textContent==='Overview'"),"Overview theme swatches");
  const swatchApplied=await evaluate(`(async()=>{const details=document.querySelector('details[data-section="appearance"]');details.open=true;const button=document.querySelector('[data-theme="Neon"]');button.click();for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,50));if(button.getAttribute('aria-pressed')==='true')break;}return button.getAttribute('aria-pressed')==='true'&&document.querySelector('#theme-preset').value==='Neon'&&((await(await fetch('/api/state')).json()).settings.themePreset==='Neon')})()`);
  if(!swatchApplied)failures.push("Overview theme preview swatch did not update the active preset without a page reload.");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }); await cdp("Page.navigate", { url: `${base}/overlay/?bg=transparent` });
  await waitFor(async () => evaluate("Boolean(document.querySelector('#canvas')&&document.querySelector('#runner-hint'))"), "overlay"); await sleep(250);
  const overlay = await evaluate(`(()=>({overflow:document.documentElement.scrollWidth>innerWidth,frames:[...document.querySelectorAll('#widgets iframe')].map(frame=>frame.getAttribute('sandbox'))}))()`);
  if (overlay.overflow) failures.push("overlay-1920x1080: horizontal overflow"); if (overlay.frames.some(value => value !== "allow-scripts")) failures.push("overlay: iframe sandbox changed");
  const overlayImage = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true }); await writeFile(path.join(artifacts, "overlay-1920x1080.png"), Buffer.from(overlayImage.data, "base64"));
  if (browserErrors.length) failures.push(`browser diagnostics ${JSON.stringify(browserErrors.slice(0, 12))}`); if (failedRequests.length) failures.push(`failed requests ${JSON.stringify(failedRequests.slice(0, 12))}`);
  const report = { viewports: viewports.map(([w,h]) => `${w}x${h}`), pages: pages.map(([name]) => name), overlay: "1920x1080", browserErrors, failedRequests, failures };
  await writeFile(path.join(artifacts, "qa-ui-results.json"), JSON.stringify(report, null, 2));
  process.stdout.write(`QA UI: ${pages.length} pages × ${viewports.length} viewports, overlay 1920x1080, ${browserErrors.length} browser diagnostics, ${failedRequests.length} failed requests, ${failures.length} layout/accessibility failures.\n`);
  for (const failure of failures.slice(0, 30)) process.stdout.write(`${failures.length ? "FAIL" : "PASS"} ${failure}\n`);
  if (failures.length) process.exitCode = 1; else process.stdout.write("PASS UI checks.\n");
} finally {
  socket?.close();
  if (chrome) { const closed = new Promise(resolve => chrome.once("close", resolve)); chrome.kill("SIGTERM"); await Promise.race([closed, sleep(2000)]); }
  if (server) { const closed = new Promise(resolve => server.once("close", resolve)); server.kill("SIGTERM"); await Promise.race([closed, sleep(1000)]); }
  await rm(temp, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
}
