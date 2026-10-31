import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
class Element {
  constructor() { this.children=[];this.textContent="";this.className="";this.value=0;this.max=0;this.style={setProperty:(key,value)=>{this.style[key]=value;}};this.attributes={};this.dataset={};this.classList={add:(name)=>{this.className+=` ${name}`;},remove:(name)=>{this.className=this.className.replace(name,"");},toggle:(name,on)=>{if(on)this.classList.add(name);else this.classList.remove(name);}}; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children=[...children]; }
  setAttribute(name,value) { this.attributes[name]=value; }
}
async function mount(id) {
  const source=await readFile(path.join(root,"widgets",id,"index.js"),"utf8");
  const context=vm.createContext({document:{createElement:()=>new Element()},Math:Object.create(Math),String,Number,Boolean,Array,Object,JSON,Map,Set});
  new vm.Script(source.replace(/\bexport\s+default\s+/u,"globalThis.widget = ")).runInContext(context);
  const handlers=new Map();const sounds=[];const rootElement=new Element();
  context.widget.mount({root:rootElement,on:(event,handler)=>{handlers.set(event,[...(handlers.get(event)||[]),handler]);},sound:{play:(cue)=>sounds.push(cue)},timers:{setTimeout(){return 1;},clearTimeout(){},setInterval(){return 1;},clearInterval(){}},storage:{get(){return null;},set(){}}});
  return {root:rootElement,handlers,sounds};
}
function emit(widget,event,payload) { for(const handler of widget.handlers.get(event)||[])handler(payload); }

const prediction=await mount("prediction-scoreboard");emit(prediction,"chat",{message:"!a"});emit(prediction,"chat",{message:"!b"});if(!prediction.root.children[1].textContent.includes("Option A  1"))throw Error("prediction votes did not update");
const boss=await mount("boss-bar");emit(boss,"chat",{message:"!attack"});emit(boss,"chat",{message:"!heal"});if(!boss.root.children[2].textContent.includes("fully healed"))throw Error("boss health commands did not update");
emit(boss,"hype",{value:80,level:"hot",reactive:true,muted:false});if(boss.root.dataset.hype!=="hot")throw Error("boss bar did not react to the hype signal");
const goals=await mount("goal-bar");emit(goals,"follow",{});emit(goals,"sub",{});if(goals.root.children[2].value!==1||goals.root.children[4].value!==1)throw Error("follow/sub goals did not advance");
emit(goals,"hype",{value:80,level:"hot",reactive:true,muted:false});if(goals.root.dataset.hype!=="hot")throw Error("goal bar did not react to the hype signal");
const poll=await mount("chat-poll");emit(poll,"chat",{message:"!vote a"});emit(poll,"chat",{message:"!vote b"});if(!/A\s+1\s+—\s+B\s+1/u.test(poll.root.children[2].textContent))throw Error("chat poll did not count votes");
const effects=await mount("screen-effects");emit(effects,"hype",{value:80,level:"hot",reactive:true,muted:false});emit(effects,"follow",{name:"Viewer"});await new Promise((resolve)=>setTimeout(resolve,340));emit(effects,"sub",{});await new Promise((resolve)=>setTimeout(resolve,340));emit(effects,"raid",{});if(!effects.root.children[2].textContent.includes("🌧️")||!effects.sounds.includes("fanfare")||effects.root.children[0].dataset.hype!=="hot")throw Error("celebration visuals/hype reactivity/sound did not react");
const timer=await mount("countdown-timer");emit(timer,"chat",{message:"!extend 10"});emit(timer,"hype",{value:80,level:"hot",reactive:true,muted:false});if(timer.root.children[1].textContent!=="05:10"||timer.root.children[0].dataset.hype!=="hot")throw Error("countdown extension or hype tint did not update");
const runnerSource=await readFile(path.join(root,"widgets","chat-runner","index.js"),"utf8");const runnerContext=vm.createContext({document:{createElement:()=>new Element()},Math:Object.create(Math),String,Number,Boolean,Array,Object,JSON,Map,Set,Date});new vm.Script(runnerSource.replace(/\bexport\s+default\s+/u,"globalThis.widget = ")).runInContext(runnerContext);const saved=new Map();const runnerHandlers=new Map();const runnerRoot=new Element();runnerContext.widget.mount({root:runnerRoot,on:(name,handler)=>runnerHandlers.set(name,handler),sound:{play(){}},timers:{setTimeout(){return 1;},clearTimeout(){},setInterval(){return 1;},clearInterval(){}},storage:{get:(key)=>saved.get(key)||null,set:(key,value)=>saved.set(key,value)}});runnerHandlers.get("chat")({message:"!jump",user:"Player abc12"});runnerHandlers.get("chat")({message:"!runner speed fast",user:"Player abc12",isMod:true});if(!runnerRoot.children[4].children[0].textContent.includes("10")||saved.get("chat-runner").config.speed!=="fast")throw Error("chat runner score or safe moderator config did not persist");
process.stdout.write("PASS prediction, boss, goal, poll, celebration, countdown and Chat Runner simulated events.\n");
