import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SessionManager } from "../dist/sessions/manager.js";
import { drawRecap } from "../public/dashboard/recap.js";

const directory=await mkdtemp(path.join(os.tmpdir(),"streamforge-sessions-"));
const drawn=[];const context={fillStyle:"",strokeStyle:"",font:"",textAlign:"",lineWidth:1,lineJoin:"",lineCap:"",shadowColor:"",shadowBlur:0,createLinearGradient(){return{addColorStop(){}};},fillRect(){},fillText(value){drawn.push(String(value));},measureText(value){return{width:String(value).length*10};},beginPath(){},roundRect(){},fill(){},stroke(){},moveTo(){},lineTo(){}};const canvas={width:0,height:0,getContext(){return context;}};
try{
 const manager=new SessionManager(directory);await manager.init();if(manager.list().length)throw new Error("Empty session store was not empty.");
 drawRecap(canvas,undefined,{},"portrait");if(canvas.width!==1080||canvas.height!==1350||!drawn.includes("No activity yet"))throw new Error("Empty portrait recap dimensions or copy failed.");
 const base=new Date();await manager.record("requests",1,base);const opened=manager.currentSession();if(!opened||opened.requests!==1)throw new Error("First activity did not auto-start a session.");
 await manager.recordChat("user-one","!build",undefined,false,new Date(base.getTime()+1000));await manager.recordChat("user-one","ordinary",undefined,false,new Date(base.getTime()+2000));if(manager.currentSession()?.uniqueChatters!==1||manager.currentSession()?.commandsByType["!build"]!==1)throw new Error("Unique chatter or command aggregates were incorrect.");
 await manager.recordChat("user-two","!vote",`${"عربي-"}${"很長的名字".repeat(20)}`,true,new Date(base.getTime()+3000));await manager.record("votes",1,new Date(base.getTime()+4000));await manager.record("remixes",1,new Date(base.getTime()+5000));await manager.recordBuild(base.getTime()+6000,new Date(base.getTime()+9000));
 for(let index=0;index<135;index++)await manager.recordHype(index%101,new Date(base.getTime()+index*5000));
 const active=manager.currentSession();if(!active||active.uniqueChatters!==2||active.topContributors[0]?.name.length>80||active.hypeSeries.length>120||active.liveBuilds!==1||active.totalBuildTimeMs!==3000)throw new Error("Session aggregates, Unicode names, build duration or downsampling failed.");
 drawRecap(canvas,active,{accent:"#a9f5dc",accent2:"#aa8aff",background:"#17151f",text:"#f6f2ff",glow:"#a9f5dc"},"landscape");if(canvas.width!==1920||canvas.height!==1080||!drawn.some((value)=>value.includes("عربي-")))throw new Error("Landscape recap dimensions or Unicode shout-outs failed.");
 if("_chatSalt"in active||"_chatterHashes"in active)throw new Error("Private session identifiers were returned by the API-facing record.");
 const idleEnded=await manager.autoEnd(1,new Date(base.getTime()+120_000));if(!idleEnded||manager.currentSession())throw new Error("Idle session auto-end did not close the session.");
 const loaded=new SessionManager(directory);await loaded.init();const restored=loaded.list()[0];if(!restored?.endedAt||restored.uniqueChatters!==2||restored.topContributors.length!==1||restored.hypeSeries.length>120)throw new Error("Session JSON persistence/recovery failed.");await loaded.setIncludeNames(false);if(loaded.get(restored.id)?.topContributors.length)throw new Error("Disabling chatter names did not remove saved shout-outs.");
 if(!await loaded.delete(restored.id)||loaded.list().length)throw new Error("Session deletion failed.");
 process.stdout.write("PASS empty/auto-start, aggregates, optional Unicode names, build duration, 120-point recap series, idle end, recovery and delete.\n");
}finally{await rm(directory,{recursive:true,force:true});}
