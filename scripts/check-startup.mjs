import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const temp=await mkdtemp(path.join(os.tmpdir(),"streamforge-startup-"));
const freePort=async()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once("error",reject);server.listen(0,"127.0.0.1",()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const start=(port,dataDir)=>spawn(process.execPath,[path.join(root,"dist/server.js")],{cwd:root,stdio:["ignore","pipe","pipe"],env:{...process.env,PORT:String(port),OPEN_BROWSER:"false",TWITCH_LIVE_ENABLED:"false",BUILD_MODE:"mock",STREAMFORGE_DATA_DIR:dataDir}});
try{
  const port=await freePort(),server=start(port,path.join(temp,"normal"));let output="";server.stdout.on("data",chunk=>output+=chunk);server.stderr.on("data",chunk=>output+=chunk);
  const deadline=Date.now()+8000;while(!output.includes("StreamForge is ready")&&Date.now()<deadline&&server.exitCode===null)await wait(50);
  assert.match(output,/StreamForge is ready at http:\/\/localhost:\d+\/dashboard\//u);assert.equal(server.exitCode,null);server.kill("SIGTERM");

  const occupied=net.createServer();await new Promise((resolve,reject)=>{occupied.once("error",reject);occupied.listen(0,resolve);});const busyPort=occupied.address().port;
  const blocked=start(busyPort,path.join(temp,"busy"));let busyOutput="";blocked.stdout.on("data",chunk=>busyOutput+=chunk);blocked.stderr.on("data",chunk=>busyOutput+=chunk);
  const code=await new Promise((resolve,reject)=>{blocked.once("error",reject);blocked.once("exit",resolve);setTimeout(()=>{if(blocked.exitCode===null){blocked.kill("SIGKILL");reject(new Error("Busy port server did not exit."));}},8000).unref();});
  assert.equal(code,1,`busy process exited ${code}: ${busyOutput}`);assert.equal(busyOutput.trim().split("\n").length,1,busyOutput);assert.match(busyOutput.trim(),/^Port \d+ is already in use\. Stop the other server or set PORT to a free port\.$/u);await new Promise(resolve=>occupied.close(resolve));
  console.log("PASS startup opens no browser when disabled, serves the dashboard, and exits with one clear busy-port message; Twitch is forced off.");
}finally{await rm(temp,{recursive:true,force:true});}
