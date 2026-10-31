import { HypeEngine } from "../dist/hype/engine.js";

const engine=new HypeEngine();const base=Date.now();const settings={sensitivity:"normal",manualBoost:0,muted:false,reactive:true};
for(let i=0;i<30;i++)engine.addChat(`user-${i%12}`,i%3===0?"!vote Kappa":"hello chat",base+i*100);
engine.addEvent("follow",base+100);engine.addEvent("sub",base+200);engine.addEvent("raid",base+300);
const quietEngine=new HypeEngine();const quiet=quietEngine.snapshot(settings,base);if(quiet.value!==0||quiet.level!=="calm"||quiet.trend!=="steady")throw new Error("Quiet chat did not remain calm.");
const snapshot=engine.snapshot(settings,base+3_000);
if(snapshot.window10.messages!==30||snapshot.window10.uniqueChatters!==12||snapshot.window60.messages!==30||snapshot.window60.uniqueChatters!==12)throw new Error("Rolling chat aggregates or unique chatter counts are incorrect.");
if(snapshot.window10.messagesPerSecond!==3||snapshot.window60.emoteDensity<=0||snapshot.window60.commandRate<=0||snapshot.components.events<=0)throw new Error("Rate, emote, command or event signals were not included.");
if(!["calm","warm","hot","peak"].includes(snapshot.level)||!["rising","steady","falling"].includes(snapshot.trend)||JSON.stringify(snapshot).includes("user-"))throw new Error("Hype schema or aggregate privacy check failed.");
const smallRaid=new HypeEngine(),largeRaid=new HypeEngine();smallRaid.addEvent("raid",base,1);largeRaid.addEvent("raid",base,10000);if(largeRaid.snapshot(settings,base+1000).components.events<=smallRaid.snapshot(settings,base+1000).components.events)throw new Error("Raid size did not affect the event boost.");
const steadyEngine=new HypeEngine();for(let i=0;i<65;i++)steadyEngine.addChat(`steady-${i%3}`,"ordinary message",base+i*1000);if(steadyEngine.snapshot(settings,base+65_000).baselinePerMinute<=2)throw new Error("The slow channel baseline did not adapt to steady chat.");
let amplified=snapshot.value;for(let i=0;i<5;i++)amplified=engine.snapshot({...settings,manualBoost:50,simulatedEnergy:80},base+3_100+i*100).value;if(amplified<=snapshot.value)throw new Error("Hype score did not respond to activity and manual/simulated boosts.");
const muted=engine.snapshot({...settings,muted:true},base+4_000);if(muted.value!==0||!muted.muted)throw new Error("Mute did not zero the exposed value.");
const decayed=engine.snapshot(settings,base+70_000);if(decayed.window60.messages!==0||decayed.window60.uniqueChatters!==0||decayed.components.events!==0||decayed.baselinePerMinute<=2||decayed.value>=amplified)throw new Error("Old signals did not decay or the channel baseline did not adapt.");
process.stdout.write("PASS quiet/steady/spike/raid/decay traffic, aggregate schema, privacy, mute and simulated energy.\n");
