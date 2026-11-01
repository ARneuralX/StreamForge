import { spawn } from "node:child_process";
import { cp, mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");const temp=await mkdtemp(path.join(os.tmpdir(),"streamforge-sessions-api-"));const widgets=path.join(temp,"widgets");await mkdir(widgets,{recursive:true});await cp(path.join(root,"widgets"),widgets,{recursive:true});
const freePort=()=>new Promise((resolve,reject)=>{const listener=net.createServer();listener.once("error",reject);listener.listen(0,"127.0.0.1",()=>{const port=listener.address().port;listener.close(()=>resolve(port));});});
const port=await freePort(),base=`http://127.0.0.1:${port}`;const server=spawn(process.execPath,[path.join(root,"dist/server.js")],{cwd:root,stdio:"ignore",env:{...process.env,PORT:String(port),OPEN_BROWSER:"false",BUILD_MODE:"mock",STREAMFORGE_DATA_DIR:path.join(temp,"data"),STREAMFORGE_WIDGETS_DIR:widgets}});const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));async function waitFor(check){const end=Date.now()+12000;while(Date.now()<end){try{if(await check())return;}catch{/* server starting */}await sleep(100);}throw new Error("Sessions API did not start.");}
try{
 await waitFor(async()=>{try{return(await fetch(`${base}/api/health`)).ok;}catch{return false;}});
 await fetch(`${base}/api/simulate/follow`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:"Simulated viewer"})});
 const history=await(await fetch(`${base}/api/sessions`)).json();const session=history.current;if(!session||session.follows!==1)throw new Error("First event did not create and update a session.");
 const setting=await fetch(`${base}/api/sessions/settings`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({includeChatterNames:true,autoEndIdleMinutes:5})});if(!setting.ok)throw new Error("Session preferences were rejected.");
 const request=await fetch(`${base}/api/requests`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text:"Build a small safe recap fixture widget"})}).then((response)=>response.json());
 await fetch(`${base}/api/chat`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:"!vote 1",userId:"session-user-1",login:"عربيViewer"})});const buildPromise=fetch(`${base}/api/requests/${request.id}/approve`,{method:"POST"});
 await waitFor(async()=>{const data=await(await fetch(`${base}/api/state`)).json();return data.requests.find((item)=>item.id===request.id)?.status==="checking"&&data.requests.find((item)=>item.id===request.id)?.built===true;});
 const draft=await fetch(`${base}/api/requests/${request.id}/draft/approve`,{method:"POST"});if(!draft.ok)throw new Error("Checked build preview could not be approved.");await buildPromise;
 await waitFor(async()=>{const data=await(await fetch(`${base}/api/sessions/${session.id}`)).json();return data.liveBuilds===1;});
 const recap=await(await fetch(`${base}/api/sessions/${session.id}/recap.json`)).json();if(recap.requests!==1||recap.approvals!==1||recap.votes!==1||recap.uniqueChatters!==1||recap.commandsByType["!vote"]!==1||recap.topContributors[0]?.name!=="عربيViewer")throw new Error("Session recap aggregates or opt-in Unicode name were incorrect.");
 if("_chatSalt"in recap||"_chatterHashes"in recap)throw new Error("Private session identifiers leaked through the HTTP API.");
 if(!(await fetch(`${base}/api/sessions/${session.id}/export.json`)).ok)throw new Error("Session JSON export failed.");
 const ended=await fetch(`${base}/api/sessions/end`,{method:"POST"});if(!ended.ok)throw new Error("Session could not be ended.");
 const started=await fetch(`${base}/api/sessions/start`,{method:"POST"}).then((response)=>response.json());if(!started.id||started.id===session.id)throw new Error("A new session did not start.");
 if(!(await fetch(`${base}/api/sessions/${session.id}`,{method:"DELETE"})).ok)throw new Error("Session deletion endpoint failed.");
 process.stdout.write("PASS session auto-start, HTTP aggregates, opt-in Unicode names, recap/export, end, restart and delete.\n");
}finally{server.kill("SIGTERM");await rm(temp,{recursive:true,force:true});}
