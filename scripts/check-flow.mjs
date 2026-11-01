import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mayPromoteAutomatically } from "../dist/flow/promotion-policy.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const temp=await mkdtemp(path.join(os.tmpdir(),"streamforge-flow-"));
const widgetRoot=path.join(temp,"widgets");await cp(path.join(root,"widgets"),widgetRoot,{recursive:true});
const port=await new Promise((resolve,reject)=>{const server=net.createServer();server.once("error",reject);server.listen(0,"127.0.0.1",()=>{const value=server.address().port;server.close(()=>resolve(value));});});
const base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,[path.join(root,"dist/server.js")],{cwd:root,stdio:"ignore",env:{...process.env,PORT:String(port),OPEN_BROWSER:"false",TWITCH_LIVE_ENABLED:"false",BUILD_MODE:"mock",STREAMFORGE_DATA_DIR:path.join(temp,"data"),STREAMFORGE_WIDGETS_DIR:widgetRoot}});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(check,label,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){try{const result=await check();if(result)return result;}catch{}await sleep(100);}throw Error(`Timed out waiting for ${label}.`);}
async function json(route,options={}){const response=await fetch(`${base}${route}`,options);const body=await response.json().catch(()=>({}));return{response,body};}
const post=(route,body)=>json(route,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
const patch=(route,body)=>json(route,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
const chat=(message,userId,isMod=false)=>post("/api/chat",{message,userId,login:isMod?"flowmod":"flowviewer",isMod});
const state=async()=>{const result=await json("/api/state");assert.equal(result.response.status,200);return result.body;};
const checks={syntax:true,network:true,forbiddenApis:true,mockMount:true};

try{
  assert.equal(mayPromoteAutomatically({setting:"eligible",source:"chat",requested:true,checks}),false,"non-moderator chat never auto-promotes");
  for(const failedCheck of Object.keys(checks))assert.equal(mayPromoteAutomatically({setting:"eligible",source:"moderator",requested:true,checks:{...checks,[failedCheck]:false}}),false,`${failedCheck} failure never auto-promotes`);
  assert.equal(mayPromoteAutomatically({setting:"ask",source:"moderator",requested:true,checks}),false,"Ask me setting disables auto-promotion");
  assert.equal(mayPromoteAutomatically({setting:"never",source:"dashboard",requested:true,checks}),false,"Never setting disables auto-promotion");
  assert.equal(mayPromoteAutomatically({setting:"eligible",source:"dashboard",requested:true,checks}),true,"eligible dashboard choice can auto-promote after all checks");
  assert.equal(mayPromoteAutomatically({setting:"eligible",source:"moderator",requested:false,checks}),true,"eligible moderator request can auto-promote");
  await waitFor(async()=>{try{return(await fetch(`${base}/api/health`)).ok;}catch{return false;}},"mock server");

  let current=await state();let widget=current.widgets.find(item=>item.id==="dice-roller");assert.ok(widget?.enabled,"fixture widget begins on scene");
  await chat("!remove Dice Roller","ordinary-viewer",false);current=await state();assert.equal(current.widgets.find(item=>item.id===widget.id).enabled,true,"non-moderator remove command has no effect");
  await chat("!remove Dice Roller","authorized-mod",true);current=await state();widget=current.widgets.find(item=>item.id===widget.id);assert.equal(widget.enabled,false,"moderator remove turns widget off");assert.equal(widget.sceneRemoved,true,"moderator remove marks it restorable");
  const undo=await post(`/api/widgets/${widget.id}/undo-remove`,{});assert.equal(undo.response.status,200,"10-second Undo restores the widget");current=await state();assert.equal(current.widgets.find(item=>item.id===widget.id).enabled,true);
  await patch(`/api/widgets/${widget.id}`,{removeFromScene:true});current=await state();assert.equal(current.widgets.find(item=>item.id===widget.id).enabled,false);assert.equal(current.widgets.find(item=>item.id===widget.id).sceneRemoved,true);
  await patch(`/api/widgets/${widget.id}`,{restoreFromScene:true});current=await state();assert.equal(current.widgets.find(item=>item.id===widget.id).enabled,true,"tray Restore round trip returns it to scene");assert.equal(current.widgets.find(item=>item.id===widget.id).sceneRemoved,false);
  const page=await fetch(`${base}/dashboard/`).then(response=>response.text());assert.match(page,/id="scene-tray"/u,"shared header exposes the On scene tray");

  await patch("/api/settings",{approval:"auto-votes",autoBuildVotes:1,autoBuildSeconds:0,afterChecksPass:"eligible"});
  const viewerMessage="!build a countdown card for chat";await chat(viewerMessage,"viewer-builder",false);
  const votePromise=chat("!vote 1","viewer-voter",false);
  const viewerRequest=await waitFor(async()=>{const data=await state();return data.requests.find(item=>item.text==="a countdown card for chat"&&item.source==="chat"&&item.status==="checking"&&item.built===true);},"viewer draft stopped at preview");
  assert.notEqual(viewerRequest.status,"live","non-moderator chat stops at preview even when auto-promotion is enabled");
  const discard=await fetch(`${base}/api/requests/${viewerRequest.id}`,{method:"DELETE"});assert.equal(discard.status,200);await votePromise;

  await patch("/api/settings",{afterChecksPass:"eligible"});await chat("!build a moderator banner widget","moderator-builder",true);
  const moderatorVote=await chat("!vote 1","moderator-voter",true);assert.equal(moderatorVote.response.status,200);
  const moderatorLive=await waitFor(async()=>{const data=await state();return data.requests.find(item=>item.text==="a moderator banner widget"&&item.source==="moderator"&&item.status==="live");},"eligible moderator automatic promotion");
  assert.equal(moderatorLive.built,true);
  process.stdout.write("PASS promotion policy gates viewer origin, failed checks and off settings; mock API verified moderator-only remove, 10-second Undo, Restore round trip, tray presence, viewer preview stop and eligible moderator auto-promotion.\n");
}finally{server.kill("SIGTERM");await rm(temp,{recursive:true,force:true,maxRetries:4,retryDelay:100});}
