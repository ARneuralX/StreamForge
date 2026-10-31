const params = new URLSearchParams(location.search);
const widgetId = params.get("id");
const themeDefaults={accent:"#a9f5dc",accent2:"#aa8aff",background:"#17151f",text:"#f6f2ff",glow:"#a9f5dc",radius:16,fontStack:"system-ui",animationSpeed:1};
const apiTheme={...themeDefaults};
const motionScales={off:1,reduced:.5,minimal:.15};let safeMode="off";let motionScale=1;let currentHype=Object.freeze({value:0,level:"calm",trend:"steady",window10:{messages:0,messagesPerSecond:0,uniqueChatters:0},window60:{messages:0,messagesPerSecond:0,uniqueChatters:0,emoteDensity:0,commandRate:0},components:{},muted:false,reactive:false,simulated:false});document.documentElement.style.setProperty("--motionScale","1");
function applyTheme(tokens){if(!tokens||typeof tokens!=="object")return;const allowedFonts=["system-ui","Arial","Georgia","Trebuchet MS"];for(const key of ["accent","accent2","background","text","glow"])if(typeof tokens[key]!=="string"||!/^#[0-9a-f]{6}$/iu.test(tokens[key]))return;if(!allowedFonts.includes(tokens.fontStack)||!Number.isFinite(tokens.radius)||tokens.radius<0||tokens.radius>40||!Number.isFinite(tokens.animationSpeed)||tokens.animationSpeed<.5||tokens.animationSpeed>2)return;Object.assign(apiTheme,tokens);const styles={accent:tokens.accent,accent2:tokens.accent2,background:tokens.background,text:tokens.text,glow:tokens.glow,radius:`${tokens.radius}px`,fontStack:tokens.fontStack,animationSpeed:String(tokens.animationSpeed)};for(const [key,value] of Object.entries(styles))document.documentElement.style.setProperty(`--${key}`,value);parent.postMessage({kind:"streamforge:theme-applied",id:widgetId,tokens:styles},"*");}
const listeners = new Map();
const root = document.querySelector("#widget");
const widgetStorage=new Map();let storageLoaded=false;let resolveStorage;const storageReady=new Promise((resolve)=>{resolveStorage=resolve;window.setTimeout(()=>{storageLoaded=true;resolve();},300);});
const api = {
  root,
  theme: apiTheme,
  get safeMode(){return safeMode;},
  get motionScale(){return motionScale;},
  get hype(){return currentHype;},
  on(name, handler) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(handler); },
  emit(name,payload={}) { if(name!=="moment"||!payload||!(["natural20","goalReached"].includes(payload.kind)))return false;parent.postMessage({kind:"streamforge:moment",id:widgetId,moment:{kind:payload.kind}} ,"*");return true; },
  sound: { play(cue = "sparkle") { try { const AudioContextType=window.AudioContext||window.webkitAudioContext; if(!AudioContextType)return; const context=new AudioContextType(); const oscillator=context.createOscillator(); const gain=context.createGain(); oscillator.type="sine"; oscillator.frequency.value=cue==="fanfare"?660:880; gain.gain.setValueAtTime(.0001,context.currentTime);gain.gain.exponentialRampToValueAtTime(.08,context.currentTime+.025);gain.gain.exponentialRampToValueAtTime(.0001,context.currentTime+.28);oscillator.connect(gain);gain.connect(context.destination);oscillator.start();oscillator.stop(context.currentTime+.3); } catch { /* browser may block synthesized audio until the viewer interacts */ } } },
  timers: { setTimeout: (...args) => window.setTimeout(...args), clearTimeout: (id) => window.clearTimeout(id), setInterval: (...args) => window.setInterval(...args), clearInterval: (id) => window.clearInterval(id) },
  storage: { get(key="state") { return widgetStorage.get(String(key))??null; }, set(key,value) { const name=String(key);try{const safe=JSON.parse(JSON.stringify(value));widgetStorage.set(name,safe);parent.postMessage({kind:"streamforge:storage:set",id:widgetId,key:name,value:safe},"*");}catch{/* ignore non-JSON storage values */} } },
};
function applySafeMode(level){if(!Object.hasOwn(motionScales,level)||level===safeMode)return;safeMode=level;motionScale=motionScales[level];document.documentElement.style.setProperty("--motionScale",String(motionScale));for(const handler of listeners.get("safeMode")||[])try{handler({level,motionScale});}catch(error){reportError(error);}}
window.addEventListener("message",(event)=>{if(event.source!==parent)return;const message=event.data;if(message?.kind==="streamforge:preview-background"&&params.get("preview")==="1"){const background=message.background;if(["dark","bright","checker","green","transparent"].includes(message.name)&&background&&typeof background.color==="string"&&(/^(#[0-9a-f]{6}|transparent)$/iu.test(background.color))&&typeof background.image==="string"&&(background.image==="none"||background.image==="conic-gradient(#777777 25%, #ffffff 0 50%, #777777 0 75%, #ffffff 0)")&&[undefined,"24px 24px"].includes(background.size)){document.body.dataset.previewBackground=message.name;document.body.classList.add("preview-background");document.body.style.backgroundColor=background.color;document.body.style.backgroundImage=background.image;document.body.style.backgroundSize=background.size||"auto";}}if(message?.kind==="streamforge:theme")applyTheme(message.tokens);if(message?.kind==="streamforge:safe-mode")applySafeMode(message.level);if(message?.kind==="streamforge:hype"&&Number.isFinite(message.hype?.value)){const snapshot=JSON.parse(JSON.stringify(message.hype));for(const value of Object.values(snapshot))if(value&&typeof value==="object")Object.freeze(value);currentHype=Object.freeze(snapshot);for(const handler of listeners.get("hype")||[])try{handler(currentHype);}catch(error){reportError(error);}}if(message?.kind==="streamforge:storage:init"&&!storageLoaded){for(const [key,value]of Object.entries(message.storage||{}))widgetStorage.set(key,value);storageLoaded=true;resolveStorage();}});
function reportError(error) {
  const detail = String(error?.message || "Widget runtime error").replace(/[\r\n]/gu, " ").slice(0, 180);
  parent.postMessage({ kind: "streamforge:runtime-error", id: widgetId, detail }, "*");
}
window.addEventListener("error", (event) => reportError(event.error || new Error(event.message)));
window.addEventListener("unhandledrejection", (event) => reportError(event.reason));
window.addEventListener("message", (event) => {
  if(event.source!==parent)return;
  const message = event.data;
  if (!message || message.kind !== "streamforge:event") return;
  for (const handler of listeners.get(message.event?.type) || []) {
    try { handler(message.event.payload || {}); } catch (error) { reportError(error); }
  }
});
try {
  await storageReady;
  const widget = await import(`/widgets/${encodeURIComponent(widgetId)}/index.js`);
  if (!widget.default?.meta || typeof widget.default.mount !== "function") throw new Error("Widget export is incomplete.");
  await widget.default.mount(api);
  parent.postMessage({ kind: "streamforge:mounted", id: widgetId }, "*");
} catch (error) {
  root.textContent = `Widget could not start: ${String(error?.message || "unknown error")}`;
  reportError(error);
}
