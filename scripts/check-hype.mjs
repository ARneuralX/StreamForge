import { HypeEngine } from "../dist/hype/engine.js";

const engine=new HypeEngine();const base=Date.now();const settings={sensitivity:"normal",manualBoost:0,muted:false,reactive:true};
for(let i=0;i<30;i++)engine.addChat(`user-${i%12}`,i%3===0?"!vote Kappa":"hello chat",base+i*100);
engine.addEvent("follow",base+100);engine.addEvent("sub",base+200);engine.addEvent("raid",base+300);
const snapshot=engine.snapshot(settings,base+3_000);
if(snapshot.window10.messages!==30||snapshot.window10.uniqueChatters!==12||snapshot.window60.messages!==30||snapshot.window60.uniqueChatters!==12)throw new Error("Rolling chat aggregates or unique chatter counts are incorrect.");
if(snapshot.window60.emoteDensity<=0||snapshot.window60.commandRate<=0||snapshot.components.events<=0)throw new Error("Emote, command or event signals were not included.");
if(JSON.stringify(snapshot).includes("user-"))throw new Error("Hype snapshot leaked chatter identifiers.");
let amplified=snapshot.score;for(let i=0;i<5;i++)amplified=engine.snapshot({...settings,manualBoost:50},base+3_100+i*10).score;if(amplified<=snapshot.score)throw new Error("Hype score did not respond to activity and manual boost.");
const muted=engine.snapshot({...settings,muted:true},base+4_000);if(muted.score!==0||!muted.muted)throw new Error("Mute did not zero the exposed score.");
const decayed=engine.snapshot(settings,base+70_000);if(decayed.window60.messages!==0||decayed.window60.uniqueChatters!==0||decayed.components.events!==0||decayed.baselinePerMinute<=2)throw new Error("Old signals did not decay or the channel baseline did not adapt.");
process.stdout.write("PASS Hype windows, aggregate-only output, event/emote/command signals, mute and decay.\n");
