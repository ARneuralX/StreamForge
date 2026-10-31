import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import WebSocket from "ws";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");const temp=await mkdtemp(path.join(os.tmpdir(),"streamforge-hype-api-"));
const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once("error",reject);server.listen(0,"127.0.0.1",()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const port=await freePort();const base=`http://127.0.0.1:${port}`;const server=spawn(process.execPath,[path.join(root,"dist/server.js")],{cwd:root,stdio:"ignore",env:{...process.env,PORT:String(port),OPEN_BROWSER:"false",BUILD_MODE:"mock",STREAMFORGE_DATA_DIR:path.join(temp,"data")}});let socket;
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));async function waitFor(check){const end=Date.now()+12000;while(Date.now()<end){try{if(await check())return;}catch{/* server not ready */}await sleep(100);}throw new Error("Hype API server did not start.");}
try{
 await waitFor(async()=>{try{return(await fetch(`${base}/api/health`)).ok;}catch{return false;}});
 socket=new WebSocket(`ws://127.0.0.1:${port}/ws`);await new Promise((resolve,reject)=>{socket.once("open",resolve);socket.once("error",reject);});const hypeMessages=[];socket.on("message",(raw)=>{const message=JSON.parse(raw.toString());if(message.type==="hype")hypeMessages.push(Date.now());});
 const initial=await(await fetch(`${base}/api/hype`)).json();if(initial.score!==0||initial.window60.messages!==0)throw new Error("Initial Hype API response was not empty.");
 const invalid=await fetch(`${base}/api/hype/settings`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({sensitivity:"extreme"})});if(invalid.status!==400)throw new Error("Invalid Hype sensitivity was accepted.");
 const settings=await fetch(`${base}/api/hype/settings`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({sensitivity:"high",manualBoost:40,muted:false,reactive:true,overlayMeter:true})});if(!settings.ok)throw new Error("Hype settings could not be saved.");
 for(let i=0;i<8;i++)await fetch(`${base}/api/simulate/${i%3===0?"raid":"chat"}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(i%3===0?{}:{message:"Kappa !vote a"})});
 await sleep(400);const state=await(await fetch(`${base}/api/state`)).json();if(state.settings.hypeSensitivity!=="high"||state.settings.overlayHypeMeter!==true||state.hype.window60.messages!==5)throw new Error("Hype settings, simulation or aggregate state did not reach the API.");
 if("names"in state.hype||"messages"in state.hype||JSON.stringify(state.hype).includes("Kappa"))throw new Error("Hype API exposed raw chat data.");
 if(hypeMessages.length>4)throw new Error(`Hype WebSocket exceeded four updates per second (${hypeMessages.length} updates).`);
 process.stdout.write("PASS Hype HTTP settings, simulated activity, aggregate privacy, and throttled WebSocket updates.\n");
}finally{socket?.close();server.kill("SIGTERM");await rm(temp,{recursive:true,force:true});}
