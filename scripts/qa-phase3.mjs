import { spawn } from "node:child_process";
import { cp, mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import WebSocket from "ws";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const temp=await mkdtemp(path.join(os.tmpdir(),"streamforge-phase3-qa-"));
const widgets=path.join(temp,"widgets");await mkdir(widgets,{recursive:true});await cp(path.join(root,"widgets"),widgets,{recursive:true});
const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once("error",reject);server.listen(0,"127.0.0.1",()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const appPort=await freePort();let debugPort=await freePort();while(debugPort===appPort)debugPort=await freePort();const base=`http://127.0.0.1:${appPort}`;
const server=spawn(process.execPath,[path.join(root,"dist/server.js")],{cwd:root,stdio:"ignore",env:{...process.env,PORT:String(appPort),OPEN_BROWSER:"false",BUILD_MODE:"mock",STREAMFORGE_DATA_DIR:path.join(temp,"data"),STREAMFORGE_WIDGETS_DIR:widgets}});
let chrome;let socket;
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
async function waitFor(check,label,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){try{const value=await check();if(value)return value;}catch{/* wait for service/page readiness */}await sleep(150);}throw new Error(`Timed out waiting for ${label}.`);}
try{
  await waitFor(async()=>{try{return(await fetch(`${base}/api/health`)).ok;}catch{return false;}},"mock server");
  const chromeBin=process.env.CHROME_BIN||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  chrome=spawn(chromeBin,["--headless=new","--no-sandbox","--disable-gpu","--no-first-run","--no-default-browser-check",`--remote-debugging-port=${debugPort}`,`--user-data-dir=${path.join(temp,"chrome")}`,`${base}/dashboard/#overview`],{stdio:"ignore"});
  const targets=await waitFor(async()=>{try{return await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();}catch{return false;}},"headless Chrome");
  const target=targets.find((item)=>item.type==="page"&&item.url.includes("/dashboard/"));if(!target)throw new Error("Chrome dashboard target was not created.");
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.once("open",resolve);socket.once("error",reject);});
  let sequence=0;const pending=new Map();const consoleErrors=[];
  socket.on("message",(raw)=>{const message=JSON.parse(raw.toString());if(message.id&&pending.has(message.id)){const item=pending.get(message.id);pending.delete(message.id);if(message.error)item.reject(new Error(message.error.message));else item.resolve(message.result);}if(message.method==="Runtime.exceptionThrown")consoleErrors.push(message.params.exceptionDetails.text||"Uncaught page exception");if(message.method==="Runtime.consoleAPICalled"&&message.params.type==="error")consoleErrors.push(message.params.args.map((item)=>item.value||item.description||"").join(" "));if(message.method==="Log.entryAdded"&&message.params.entry.level==="error")consoleErrors.push(message.params.entry.text);});
  const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));const timer=setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(new Error(`CDP timeout: ${method}`));}},20000);timer.unref();});
  await command("Runtime.enable");await command("Log.enable");await command("Page.enable");
  const evaluate=async(expression)=>{const result=await command("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text);return result.result?.value;};
  try{await waitFor(async()=>evaluate("Boolean(document.querySelector('#page h1'))"),"dashboard page shell");}catch{const diagnostic=await evaluate("({href:location.href,ready:document.readyState,title:document.title,body:document.body?.innerText.slice(0,500),resources:performance.getEntriesByType('resource').map(x=>x.name).slice(-12)})");throw new Error(`Dashboard failed to render: ${JSON.stringify(diagnostic)}; browser errors: ${consoleErrors.join(" | ")}`);}
  const overview=await evaluate("({title:document.querySelector('#page h1')?.textContent,body:document.querySelector('#page')?.innerText.slice(0,500),templates:document.querySelectorAll('.template-card').length,voiceHidden:document.querySelector('#voice-ptt')?.hidden,language:document.querySelector('#voice-language')?.value})");
  if(overview.title!=="Overview"||overview.templates!==12||overview.language!=="en-US")throw new Error(`Overview feature check failed: ${JSON.stringify(overview)}; browser errors: ${consoleErrors.join(" | ")}`);

  const eventCheck=await evaluate(`(async()=>{const checks=[];for(const type of ['chat','follow','sub','raid','redeem']){const body=type==='chat'?{commands:['!jump','!runner speed fast','!runner bg forest','!runner obstacle add rock','!runner night on']}:{name:'Simulated viewer',viewers:8,reward:'Build a widget'};const response=await fetch('/api/simulate/'+type,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});checks.push(response.ok&&(await response.json()).simulated===true);await new Promise(r=>setTimeout(r,60));}return checks.every(Boolean)})()`);
  if(!eventCheck)throw new Error("One or more simulated event types failed.");

  const themeCheck=await evaluate(`(async()=>{const theme=await fetch('/api/theme',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({preset:'Neon'})});const suggestion=await fetch('/api/theme/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:'spooky rainy night'})}).then(r=>r.json());const a=await fetch('/api/kits/halloween',{method:'POST'});const b=await fetch('/api/kits/halloween',{method:'POST'});return theme.ok&&suggestion.fallback&&a.ok&&b.ok})()`);
  if(!themeCheck)throw new Error("Theme validation, fallback, or kit idempotence failed.");

  await evaluate("location.hash='#queue'");await waitFor(async()=>evaluate("document.querySelector('#page h1')?.textContent==='Build Studio'"),"Build Studio");
  const build=await evaluate(`(async()=>{const created=await fetch('/api/requests',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'Build a safe community widget for the smoke check'})}).then(r=>r.json());void fetch('/api/requests/'+created.id+'/approve',{method:'POST'});return {id:created.id}})()`);
  await waitFor(async()=>evaluate("Boolean(document.querySelector('iframe[title=\"Draft widget preview\"]')&&document.querySelector('[data-draft-action=\"approve\"]'))"),"scanned Build Studio preview");
  await evaluate("document.querySelector('[data-draft-action=\"approve\"]').click()");
  await waitFor(async()=>evaluate(`fetch('/api/state').then(response=>response.json()).then(state=>state.requests.find(item=>item.id===${JSON.stringify(build.id)})?.status==='live')`),"mock build promoted after preview approval");
  await evaluate("document.querySelector('[data-simulate=chat]').click()");

  for(const [hash,title] of [["#widgets","Widgets"],["#library","Widget library"],["#settings","Settings"],["#overview","Overview"]]){
    await evaluate(`location.hash=${JSON.stringify(hash)}`);await waitFor(async()=>evaluate(`document.querySelector('#page h1')?.textContent===${JSON.stringify(title)}`),`${title} page`);
    if(hash==="#library"){const libraryCheck=await evaluate("({runner:!![...document.querySelectorAll('.library-card h2')].find((item)=>item.textContent==='Chat Runner'),previews:document.querySelectorAll('.library-preview').length})");if(!libraryCheck.runner||libraryCheck.previews<7)throw new Error(`Library smoke check failed: ${JSON.stringify(libraryCheck)}`);}
    if(hash==="#settings")await waitFor(async()=>evaluate("Boolean(document.querySelector('#health-summary')?.textContent.includes('queued requests'))"),"Settings health panel");
  }

  await command("Page.navigate",{url:`${base}/overlay/?feed=1`});
  await waitFor(async()=>evaluate("Boolean(document.querySelector('#canvas')&&document.querySelector('#runner-hint'))"),"overlay and runner hints");
  const overlay=await evaluate("({frames:document.querySelectorAll('#widgets iframe').length,sandbox:[...document.querySelectorAll('#widgets iframe')].every(frame=>frame.getAttribute('sandbox')==='allow-scripts'),mode:document.querySelector('#badge')?.textContent})");
  if(overlay.frames<8||!overlay.sandbox)throw new Error(`Overlay smoke check failed: ${JSON.stringify(overlay)}`);
  await sleep(500);
  if(consoleErrors.length)throw new Error(`Browser console errors: ${consoleErrors.join(" | ")}`);
  process.stdout.write(`PASS Phase 3 end-to-end smoke: ${overview.templates} templates, voice control (${overview.voiceHidden?"unsupported/hidden":"supported"}), five simulated events, validated themes/kits, safe draft preview, all dashboard pages, health panel, and ${overlay.frames} sandboxed overlay widgets. Zero page console errors.\n`);
}finally{
  socket?.close();chrome?.kill("SIGTERM");server.kill("SIGTERM");
}
