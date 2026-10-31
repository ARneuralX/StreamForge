import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const temp=await mkdtemp(path.join(os.tmpdir(),"streamforge-library-check-"));
const widgetRoot=path.join(temp,"widgets");
await cp(path.join(root,"widgets"),widgetRoot,{recursive:true});
const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once("error",reject);server.listen(0,"127.0.0.1",()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const port=await freePort(),debugPort=await freePort(),base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,[path.join(root,"dist/server.js")],{cwd:root,stdio:"ignore",env:{...process.env,PORT:String(port),OPEN_BROWSER:"false",TWITCH_LIVE_ENABLED:"false",BUILD_MODE:"mock",STREAMFORGE_DATA_DIR:path.join(temp,"data"),STREAMFORGE_WIDGETS_DIR:widgetRoot}});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));let chrome,socket;
async function waitFor(check,label,timeout=25000){const end=Date.now()+timeout;while(Date.now()<end){try{const value=await check();if(value)return value;}catch{}await sleep(120);}throw Error(`Timed out waiting for ${label}.`);}
const get=async route=>{const response=await fetch(`${base}${route}`);assert.equal(response.status,200,`${route} status`);return response.json();};
const post=async(route,body)=>fetch(`${base}${route}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
const importedCode=`export default {\n  meta: { title: "Library Race Check", description: "Isolated Library reliability fixture.", width: 320, height: 120, x: 10, y: 10, anchor: "top-left" },\n  mount(api) { const card = document.createElement("section"); card.textContent = "Ready"; api.root.append(card); api.on("chat", () => { if (api.root.ownerDocument) throw new Error("QA runtime fixture"); }); },\n};\n`;
const artifact={format:"sfwidget",version:1,id:"library-race-check",meta:{title:"Library Race Check",description:"Isolated Library reliability fixture.",width:320,height:120,x:10,y:10,anchor:"top-left"},code:importedCode,originalPrompt:"Isolated test fixture",creator:"QA"};
function declaredMeta(code){const block=code.match(/\bmeta\s*:\s*\{([^}]+)\}/u)?.[1];assert.ok(block,"widget source declares static metadata");const string=key=>block.match(new RegExp(`\\b${key}\\s*:\\s*["']([^"']*)["']`))?.[1];const number=key=>Number(block.match(new RegExp(`\\b${key}\\s*:\\s*(-?\\d+)`))?.[1]);return{title:string("title"),description:string("description"),width:number("width"),height:number("height"),x:number("x"),y:number("y"),anchor:string("anchor")};}
try{
  await waitFor(async()=>{try{return(await fetch(`${base}/api/health`)).ok;}catch{return false;}},"mock server");
  const initial=await get("/api/state");
  const starter=initial.library.find(entry=>entry.widgetId==="dice-roller")||initial.library[0];assert.ok(starter,"a starter library entry is available");
  for(const widgetId of ["dice-roller","welcome-banner"]){
    if(initial.library.some(entry=>entry.widgetId===widgetId))continue;
    const code=await readFile(path.join(widgetRoot,widgetId,"index.js"),"utf8");
    const response=await post("/api/library/import",{format:"sfwidget",version:1,id:widgetId,meta:declaredMeta(code),code,creator:"QA"});
    const result=await response.json();assert.equal(response.status,201,`${widgetId} imported into the isolated Library test: ${result.error||""}`);
  }
  const addResponses=await Promise.all(Array.from({length:8},()=>post(`/api/library/${encodeURIComponent(starter.id)}/add`,{})));
  for(const response of addResponses)assert.equal(response.status,200,"concurrent Add is idempotent");
  let state=await get("/api/state");assert.equal(state.widgets.filter(widget=>widget.id===starter.widgetId).length,1);assert.equal(state.widgets.find(widget=>widget.id===starter.widgetId).enabled,true);
  const removeResponses=await Promise.all(Array.from({length:8},()=>fetch(`${base}/api/widgets/${encodeURIComponent(starter.widgetId)}`,{method:"DELETE"})));
  for(const response of removeResponses)assert.equal(response.status,200,"concurrent Remove is idempotent");
  state=await get("/api/state");assert.equal(state.widgets.filter(widget=>widget.id===starter.widgetId).length,1);assert.equal(state.widgets.find(widget=>widget.id===starter.widgetId).enabled,false);

  const importResponses=await Promise.all(Array.from({length:8},()=>post("/api/library/import",artifact)));
  for(const response of importResponses)assert.ok([200,201].includes(response.status),`concurrent Import status ${response.status}`);
  const importResults=await Promise.all(importResponses.map(response=>response.json()));
  const importedIds=new Set(importResults.map(result=>result.entry?.id));assert.equal(importedIds.size,1,"duplicate imports converge on one entry");
  assert.equal(importResults.filter(result=>result.alreadyImported).length,7,"one import promotes, seven return the existing entry");
  const importedId=[...importedIds][0];assert.ok(importedId);
  state=await get("/api/state");assert.equal(state.library.filter(entry=>entry.widgetId===importedId).length,1);assert.equal(state.widgets.filter(widget=>widget.id===importedId).length,1);

  const chromeBin=process.env.CHROME_BIN||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  chrome=spawn(chromeBin,["--headless=new","--no-sandbox","--disable-gpu","--hide-scrollbars",`--remote-debugging-port=${debugPort}`,`--user-data-dir=${path.join(temp,"chrome")}`,`${base}/dashboard/#library`],{stdio:"ignore"});
  const targets=await waitFor(async()=>{try{return await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();}catch{return false;}},"Chrome");
  const target=targets.find(item=>item.type==="page"&&item.url.includes("dashboard"));assert.ok(target);
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.once("open",resolve);socket.once("error",reject);});
  let id=0;const pending=new Map(),browserErrors=[];socket.on("message",raw=>{const message=JSON.parse(raw.toString());if(message.method==="Runtime.exceptionThrown")browserErrors.push(message.params.exceptionDetails.text||"page exception");if(message.method==="Runtime.consoleAPICalled"&&message.params.type==="error")browserErrors.push(message.params.args.map(item=>item.value||item.description||"").join(" "));if(message.method==="Log.entryAdded"&&message.params.entry.level==="error")browserErrors.push(message.params.entry.text);if(!message.id||!pending.has(message.id))return;const item=pending.get(message.id);pending.delete(message.id);message.error?item.reject(Error(message.error.message)):item.resolve(message.result);});
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});socket.send(JSON.stringify({id:next,method,params}));setTimeout(()=>{if(pending.has(next)){pending.delete(next);reject(Error(method));}},20000).unref();});
  const evaluate=async expression=>{const result=await cdp("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result?.value;};
  await cdp("Runtime.enable");await cdp("Log.enable");await cdp("Page.enable");await cdp("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await waitFor(async()=>evaluate("Boolean(document.querySelector('.library-card iframe'))"),"Library cards");
  const entries=state.library;assert.equal(await evaluate("document.querySelectorAll('.library-card iframe[sandbox=\"allow-scripts\"]').length"),entries.length,"every card uses an isolated sandboxed iframe");
  const mounts=[];const eventRuns=[];
  for(const entry of entries){
    const selector=`.library-card iframe[src*="id=${encodeURIComponent(entry.widgetId)}"]`;
    await evaluate(`(()=>{const frame=document.querySelector(${JSON.stringify(selector)});frame.scrollIntoView({block:'center'});return true})()`);
    const mounted=await waitFor(async()=>evaluate(`(()=>{const state=document.querySelector(${JSON.stringify(`[data-preview-health="${entry.widgetId}"]`)})?.dataset.state;return ["mounted","error"].includes(state)?state:null})()`),`${entry.widgetId} mount result`,18000);
    if(mounted!=="mounted"){const diagnostic=await evaluate(`(()=>{const badge=document.querySelector(${JSON.stringify(`[data-preview-health="${entry.widgetId}"]`)});const frame=document.querySelector(${JSON.stringify(selector)});return{label:badge?.textContent,title:badge?.title,frame:frame?.src}})()`);throw Error(`${entry.widgetId} sandbox failed: ${JSON.stringify(diagnostic)} browser=${JSON.stringify(browserErrors)}`);}mounts.push(entry.widgetId);
    for(const eventType of entry.passport?.events||[]){
      await evaluate(`(()=>{const frame=document.querySelector(${JSON.stringify(selector)});frame.contentWindow.postMessage({kind:'streamforge:event',event:{type:${JSON.stringify(eventType)},payload:{message:'library check',user:'QA',name:'QA',viewers:1,reward:'QA'}}},'*');return true})()`);
      await waitFor(async()=>evaluate(`document.querySelector(${JSON.stringify(`[data-preview-health="${entry.widgetId}"]`)})?.dataset.lastEventType===${JSON.stringify(eventType)}`),`${entry.widgetId} ${eventType} delivery`);
      eventRuns.push(`${entry.widgetId}:${eventType}`);
    }
  }
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(`[data-preview-health="${importedId}"]`)})?.dataset.state`),"error","runtime errors are shown by the per-card health badge");

  const librarySelect="#library-preview-background",firstFrame=".library-card iframe";
  for(const name of ["bright","green","checker","dark"]){await evaluate(`(()=>{const select=document.querySelector(${JSON.stringify(librarySelect)});select.value=${JSON.stringify(name)};select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);}
  await waitFor(async()=>evaluate(`(()=>{const frame=document.querySelector(${JSON.stringify(firstFrame)});return frame?.dataset.previewBackground==='dark'&&new URL(frame.src).searchParams.get('bg')==='dark'&&getComputedStyle(frame).backgroundColor==='rgb(23, 21, 31)'})()`),"rapid Preview selection settles on its latest value");

  const removeButton=`button[data-remove="${starter.widgetId}"]`;
  await evaluate(`(()=>{const button=document.querySelector(${JSON.stringify(removeButton)});button.click();return true})()`);
  await waitFor(async()=>evaluate(`document.querySelector(${JSON.stringify(removeButton)})?.disabled===true&&document.querySelector('button[data-add="${starter.id}"]')?.disabled===false`),"Library Add/Remove UI reflects server state");
  await evaluate(`(()=>{const button=document.querySelector('button[data-add="${starter.id}"]');button.click();return true})()`);
  await waitFor(async()=>evaluate(`document.querySelector('button[data-add="${starter.id}"]')?.textContent==='In scene'&&document.querySelector(${JSON.stringify(removeButton)})?.disabled===false`),"Library Add UI reflects server state");

  const importPath=path.join(temp,"import.sfwidget");await writeFile(importPath,JSON.stringify(artifact));
  const input=await cdp("Runtime.evaluate",{expression:"document.querySelector('#widget-file')",returnByValue:false});assert.ok(input.result?.objectId);
  const doc=await cdp("DOM.getDocument");const node=await cdp("DOM.querySelector",{nodeId:doc.root.nodeId,selector:"#widget-file"});await cdp("DOM.setFileInputFiles",{nodeId:node.nodeId,files:[importPath]});
  await evaluate("document.querySelector('#import-form button').click()");
  await waitFor(async()=>evaluate("document.querySelector('#import-result')?.textContent.includes('already in the library')"),"duplicate Import form feedback");
  assert.equal(await get(`/api/widgets/${encodeURIComponent(starter.widgetId)}/export`).then(result=>result.format),"sfwidget","Export artifact remains available");

  const reportPath=path.join(root,"docs/QA_REPORT.md");const report=await readFile(reportPath,"utf8");const section=`\n## Stage 5 Library reliability\n\n- \`npm run check:library\` passes: ${mounts.length} sandboxed Library previews mounted; ${eventRuns.length} passport-declared events were delivered through the runtime bridge; Add/Remove stayed idempotent under eight concurrent requests; eight simultaneous imports converged on one entry; the UI duplicate-import message and rapid Preview selection passed.\n- Per-card health badges report runtime mount/error messages, including a simulated event-handler failure. This run used a copied widget tree, isolated state, mock BUILD_MODE, no browser launch and no Twitch connection.\n- The earlier Library screenshot captured frames before lazy modules mounted. This check scrolls each frame into view and waits for a mount or error report.\n`;
  const marker="## Stage 5 Library reliability",start=report.indexOf(marker),nextHeading=start<0?-1:report.indexOf("\n## ",start+marker.length);const updated=start<0?report+section:report.slice(0,start)+section+(nextHeading<0?"\n":report.slice(nextHeading));await writeFile(reportPath,`${updated.trimEnd()}\n`);
  process.stdout.write(`Library proof: ${mounts.length} sandboxed previews mounted; ${eventRuns.length} passport events delivered; concurrent Add/Remove/Import, duplicate import UI, Export and rapid Preview passed. QA_REPORT.md updated.\n`);
}finally{socket?.close();if(chrome){const closed=new Promise(resolve=>chrome.once("close",resolve));chrome.kill("SIGTERM");await Promise.race([closed,sleep(1500)]);}server.kill("SIGTERM");await rm(temp,{recursive:true,force:true,maxRetries:4,retryDelay:100});}
