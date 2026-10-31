import express from "express";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rename, chmod, mkdtemp, rm, copyFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { writeFile as writeWidgetFile } from "node:fs/promises";
import { WebSocketServer, WebSocket } from "ws";
import { checkWidgetSource } from "./security/widget-checks.js";
import { validateRequestText } from "./security/request-checks.js";

type BuildState = "queued" | "approved" | "building" | "checking" | "live" | "failed" | "rolled_back";
type Request = { id: string; text: string; requester: string; source: string; status: BuildState; createdAt: string; updatedAt?: string; votes?: number; voterIds?: string[]; failure?: string; kind?: "build" | "remix"; widgetId?: string };
type WidgetMeta = { id: string; title: string; description: string; width: number; height: number; x: number; y: number; anchor: string; enabled: boolean; position?: { x: number; y: number }; versionCount?: number; canUndo?: boolean };
type LibraryEntry = { id: string; widgetId: string; title: string; description: string; originalPrompt: string; creator: string; codeHash?: string };
type Store = { requests: Request[]; requestHistory: Request[]; widgets: WidgetMeta[]; library: LibraryEntry[]; settings: Record<string, unknown>; widgetStorage?: Record<string, Record<string, unknown>>; codexVerification?: { time: string; ok: boolean; error?: string } };
type ErrorCode = "CODEX_NOT_LOGGED_IN" | "CODEX_LIMIT_REACHED" | "CODEX_TIMEOUT" | "CODEX_BAD_OUTPUT" | "CHECKS_FAILED" | "ROLLED_BACK" | "TWITCH_TOKEN_EXPIRED" | "CHAT_DISCONNECTED" | "EVENTSUB_DISCONNECTED" | "QUEUE_FULL" | "REQUEST_REJECTED" | "WIDGET_RUNTIME_ERROR";
const errorMessages: Record<ErrorCode, string> = {
  CODEX_NOT_LOGGED_IN: "Codex is not signed in. Sign in, then verify Codex in Settings.", CODEX_LIMIT_REACHED: "Codex has reached its usage limit. Builds are paused; try the Library or Replay mode.", CODEX_TIMEOUT: "The build took too long and was stopped.", CODEX_BAD_OUTPUT: "Codex did not create a usable widget file.", CHECKS_FAILED: "The widget did not pass the safety checks.", ROLLED_BACK: "The widget change was rolled back safely.", TWITCH_TOKEN_EXPIRED: "Your Twitch token expired. Reconnect Twitch.", CHAT_DISCONNECTED: "Twitch chat is disconnected. Check the connection in Settings.", EVENTSUB_DISCONNECTED: "Twitch event updates are disconnected. Reconnect Twitch.", QUEUE_FULL: "The build queue is full. Try again after a request finishes.", REQUEST_REJECTED: "That request needs moderator review.", WIDGET_RUNTIME_ERROR: "A widget stopped after a runtime error. Undo is available from Widgets.",
};
let lastError: { code: ErrorCode; at: string } | undefined;
function recordError(code: ErrorCode): string { lastError = { code, at: new Date().toISOString() }; return errorMessages[code]; }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "public");
const dataDir = path.resolve(process.env.STREAMFORGE_DATA_DIR || path.join(root, "data"));
const widgetRoot = path.resolve(process.env.STREAMFORGE_WIDGETS_DIR || path.join(root, "widgets"));

function parseEnv(source: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const raw of source.split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

try {
  const contents = await readFile(path.join(root, ".env"), "utf8");
  for (const [key, value] of Object.entries(parseEnv(contents))) if (process.env[key] === undefined) process.env[key] = value;
} catch { /* .env is optional; never echo its contents. */ }

const port = Number(process.env.PORT || 3000);

await mkdir(dataDir, { recursive: true });
const storePath = path.join(dataDir, "state.json");
const starterWidgets: WidgetMeta[] = [
  { id: "dice-roller", title: "Dice Roller", description: "Roll a d20 with chat using !roll d20.", width: 440, height: 190, x: 32, y: 32, anchor: "top-left", enabled: true },
  { id: "prediction-scoreboard", title: "Prediction Scoreboard", description: "Chat votes with !a and !b.", width: 440, height: 210, x: 0, y: 0, anchor: "top-right", enabled: true },
  { id: "boss-bar", title: "Chat Boss Bar", description: "Chat attacks and heals the boss with !attack and !heal.", width: 500, height: 180, x: 0, y: 0, anchor: "bottom-left", enabled: true },
  { id: "goal-bar", title: "Follow & Sub Goals", description: "Track follower and subscriber progress live.", width: 500, height: 230, x: 0, y: 0, anchor: "top-left", enabled: true },
  { id: "chat-poll", title: "Live Chat Poll", description: "Run an A/B poll with chat commands.", width: 440, height: 230, x: 0, y: 0, anchor: "top-right", enabled: true },
  { id: "countdown-timer", title: "Chat Countdown", description: "A stream timer that chat can extend.", width: 420, height: 170, x: 0, y: 0, anchor: "bottom-right", enabled: true },
  { id: "screen-effects", title: "Celebration Effects", description: "Celebrate follows, subs and raids.", width: 420, height: 260, x: 0, y: 0, anchor: "center", enabled: true },
  { id: "welcome-banner", title: "Welcome Banner", description: "A friendly message for new followers.", width: 460, height: 110, x: 0, y: 0, anchor: "bottom-right", enabled: true },
  { id: "chat-runner", title: "Chat Runner", description: "Jump with !jump and help configure the runner with safe chat commands.", width: 480, height: 250, x: 0, y: 0, anchor: "center", enabled: true },
];
const librarySeed = JSON.parse(await readFile(path.join(root, "library/catalog.json"), "utf8")) as LibraryEntry[];
type BuildTemplate = { id:string;category:string;title:string;description:string;prompt:string;time:string;widgetId?:string };
const buildTemplates = JSON.parse(await readFile(path.join(root,"templates.json"),"utf8")) as BuildTemplate[];
const themePresets = {
  Halloween: { accent:"#ffb36b",accent2:"#a98aff",background:"#17101f",text:"#fff3e4",glow:"#ff7e46",radius:18,fontStack:"system-ui",animationSpeed:1 },
  Neon: { accent:"#8afff0",accent2:"#ff65d8",background:"#101522",text:"#f1ffff",glow:"#46f5dc",radius:12,fontStack:"Arial",animationSpeed:1.25 },
  Cozy: { accent:"#f5d6a0",accent2:"#f4a8b8",background:"#241c1a",text:"#fff5e8",glow:"#e8b879",radius:24,fontStack:"Georgia",animationSpeed:.8 },
  Retro: { accent:"#ffe66d",accent2:"#ff70a6",background:"#21162a",text:"#fff4db",glow:"#ff70a6",radius:4,fontStack:"Trebuchet MS",animationSpeed:1 },
  Clean: { accent:"#a9f5dc",accent2:"#aa8aff",background:"#17151f",text:"#f6f2ff",glow:"#a9f5dc",radius:16,fontStack:"system-ui",animationSpeed:1 },
} as const;
type ThemeTokens = { accent:string;accent2:string;background:string;text:string;glow:string;radius:number;fontStack:string;animationSpeed:number };
const defaultStore: Store = { requests: [], requestHistory: [], widgets: starterWidgets, library: librarySeed, widgetStorage:{}, settings: { approval: process.env.APPROVAL || "manual", buildMode: process.env.BUILD_MODE || "mock", autoBuildVotes: 5, autoBuildSeconds: 0, themePreset:"Clean", themeTokens:themePresets.Clean } };
let store: Store;
try { store = JSON.parse(await readFile(storePath, "utf8")) as Store; }
catch { store = defaultStore; }
if (!Array.isArray(store.widgets) || store.widgets.length === 0) store.widgets = starterWidgets;
for(const widget of starterWidgets)if(!store.widgets.some((existing)=>existing.id===widget.id))store.widgets.push(widget);
if (!Array.isArray(store.requestHistory)) store.requestHistory = [...store.requests];
if (!Array.isArray(store.library)) store.library = librarySeed;
store.widgetStorage ||= {};
store.library = [...librarySeed.map((seed) => store.library.find((entry) => entry.id === seed.id) || seed), ...store.library.filter((entry) => !librarySeed.some((seed) => seed.id === entry.id))];
store.settings = { ...defaultStore.settings, ...(store.settings || {}) };
if (!store.settings.themeTokens || typeof store.settings.themeTokens !== "object") store.settings.themeTokens = themePresets.Clean;

async function persist(): Promise<void> {
  const tempPath = `${storePath}.${randomUUID()}.tmp`;
  await writeFile(tempPath, JSON.stringify(store, null, 2), { mode: 0o600 });
  await chmod(tempPath, 0o600);
  await rename(tempPath, storePath);
}

function redactDisplay(value: string): string {
  return value
    .replace(/\b(?:\/Users|\/home|\/private|\/tmp)\/[^\s"'<>]+/gu, "[path redacted]")
    .replace(/\b[A-Za-z]:\\(?:[^\s"'<>\\]+\\?)+/gu, "[path redacted]")
    .replace(/(^|\s)(?:node|npm|git|curl|rm|sudo)\s+[^\n]*/giu, "$1[command redacted]")
    .replace(/@[A-Za-z0-9_-]{2,}/gu, "@viewer");
}
function publicRequest(request: Request): Request {
  const widget = request.widgetId ? store.widgets.find((item) => item.id === request.widgetId) : undefined;
  const text = request.kind === "remix" ? `Remix ${widget?.title || "widget"}: ${request.text}` : request.text;
  return { ...request, text: redactDisplay(text), requester: redactDisplay(request.requester), voterIds: undefined };
}
function resolveWidgetName(name: string): WidgetMeta | undefined {
  const normalized = name.trim().toLocaleLowerCase();
  return store.widgets.find((widget) => widget.id.toLocaleLowerCase() === normalized || widget.title.toLocaleLowerCase() === normalized || widget.title.toLocaleLowerCase().replace(/\s+/gu, "-") === normalized);
}
function parseDeclaredMeta(source: string): {title:string;description:string;width:number;height:number;x:number;y:number;anchor:string}|undefined {
  const block=source.match(/\bmeta\s*:\s*\{([^}]+)\}/su)?.[1];if(!block)return undefined;
  const stringField=(key:string)=>block.match(new RegExp(`\\b${key}\\s*:\\s*["']([^"']*)["']`))?.[1];
  const numberField=(key:string)=>{const value=block.match(new RegExp(`\\b${key}\\s*:\\s*(-?\\d+)`))?.[1];return value===undefined?undefined:Number(value);};
  const title=stringField("title");const description=stringField("description");const width=numberField("width");const height=numberField("height");const x=numberField("x");const y=numberField("y");const anchor=stringField("anchor");
  if(!title||!description||width===undefined||height===undefined||x===undefined||y===undefined||!anchor)return undefined;
  return {title,description,width,height,x,y,anchor};
}
async function widgetCommitHistory(widgetId: string): Promise<string[]> {
  if (!/^[a-z0-9-]{1,80}$/u.test(widgetId) || widgetRoot !== path.join(root, "widgets")) return [];
  try {
    return execFileSync("git", ["log", "--follow", "--format=%H", "--", `widgets/${widgetId}/index.js`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split(/\r?\n/u).filter(Boolean);
  } catch { return []; }
}
const recentBuilds = new Map<string, number>();
const safeDrafts = new Map<string, string>();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.get("/", (_req, res) => res.redirect("/dashboard/"));
app.use("/dashboard", express.static(path.join(publicRoot, "dashboard")));
app.use("/overlay", express.static(path.join(publicRoot, "overlay")));
app.use("/widgets", express.static(widgetRoot, {
  setHeaders(res) {
    res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src data:; media-src 'none'; connect-src 'none'; font-src 'self' data:");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Access-Control-Allow-Origin", "*");
  },
}));

app.get("/api/health", (_req, res) => res.json({ ok: true, buildMode: store.settings.buildMode, twitch: { enabled: process.env.TWITCH_LIVE_ENABLED === "true", chat: "needs_setup", eventSub: "needs_setup", tokenExpiry: "not_connected" }, codex: store.codexVerification?.ok ? { state: "verified", time: store.codexVerification.time } : { state: "needs_setup" }, queueDepth: store.requests.filter((item) => item.status === "queued").length, lastError: lastError ? { code: lastError.code, message: errorMessages[lastError.code], at: lastError.at } : null }));
app.get("/api/state", async (_req, res) => {
  const widgets = await Promise.all(store.widgets.map(async (widget) => { const versions = await widgetCommitHistory(widget.id); return { ...widget, versionCount: versions.length, canUndo: versions.length > 1 }; }));
  res.json({ requests: store.requests.map(publicRequest), requestHistory: store.requestHistory.map(publicRequest), widgets, library: store.library, settings: store.settings, codexVerification: store.codexVerification });
});
app.get("/api/widgets/:id/storage",(req,res)=>{
  if(!store.widgets.some((widget)=>widget.id===req.params.id))return res.status(404).json({error:"Widget not found."});
  res.json({storage:store.widgetStorage?.[req.params.id]||{}});
});
app.patch("/api/widgets/:id/storage",async(req,res)=>{
  const id=req.params.id;if(!store.widgets.some((widget)=>widget.id===id))return res.status(404).json({error:"Widget not found."});
  const key=typeof req.body?.key==="string"?req.body.key:"";const value=req.body?.value;
  if(!/^[a-z0-9_-]{1,40}$/iu.test(key))return res.status(400).json({error:"Storage keys must use letters, numbers, underscore or hyphen."});
  let serialized="";try{const encoded=JSON.stringify(value);if(encoded===undefined)return res.status(400).json({error:"Storage value must be JSON data."});serialized=encoded;}catch{return res.status(400).json({error:"Storage value must be JSON data."});}
  if(serialized.length>8000)return res.status(413).json({error:"Widget storage values must be under 8 KB."});
  store.widgetStorage||={};store.widgetStorage[id]||={};store.widgetStorage[id][key]=JSON.parse(serialized);await persist();res.json({ok:true});
});
app.get("/api/requests/:id/preview", (req, res) => {
  const source = safeDrafts.get(req.params.id);
  if (!source) return res.status(404).send("Draft preview is not available.");
  const safeSource = source.replace(/<\/script/giu, "<\\/script").replace(/^\s*export\s+default\s+/u, "return ");
  const background = req.query.bg === "bright" ? "#f5f5f5" : req.query.bg === "checker" ? "conic-gradient(#777 25%, #fff 0 50%, #777 0 75%, #fff 0) 0 / 24px 24px" : "#17151f";
  res.type("html").setHeader("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src data:");
  res.send(`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:12px;background:${background};color:#f6f2ff;font:14px system-ui}#widget{min-height:120px}</style><main id="widget"></main><script>const listeners=new Map();const api={root:document.querySelector('#widget'),on(n,f){listeners.set(n,[...(listeners.get(n)||[]),f])},sound:{play(){}},timers:{setTimeout,clearTimeout,setInterval,clearInterval},storage:{get(){return null},set(){}}};window.addEventListener('message',e=>{if(e.data?.kind==='streamforge:event')for(const fn of listeners.get(e.data.event?.type)||[])try{fn(e.data.event.payload||{})}catch(err){parent.postMessage({kind:'streamforge:draft-error',detail:String(err?.message||'Widget error').slice(0,160)},'*')}});try{const widget=(()=>{${safeSource}})();widget.mount(api)}catch(err){document.querySelector('#widget').textContent='Preview blocked: '+String(err?.message||'widget error').slice(0,120)}</script>`);
});
app.get("/api/library", (_req, res) => res.json(store.library));
app.get("/api/templates", (_req,res)=>res.json(buildTemplates));
function validTheme(value: unknown): value is ThemeTokens {
  if (!value || typeof value !== "object") return false;
  const theme=value as Record<string,unknown>;const keys=["accent","accent2","background","text","glow","radius","fontStack","animationSpeed"];
  return Object.keys(theme).length===keys.length&&keys.every((key)=>key in theme)&&["accent","accent2","background","text","glow"].every((key)=>typeof theme[key]==="string"&&/^#[0-9a-f]{6}$/iu.test(theme[key] as string))&&Number.isFinite(theme.radius)&&Number(theme.radius)>=0&&Number(theme.radius)<=40&&Number.isFinite(theme.animationSpeed)&&Number(theme.animationSpeed)>=.5&&Number(theme.animationSpeed)<=2&&["system-ui","Arial","Georgia","Trebuchet MS"].includes(String(theme.fontStack));
}
function applyTheme(preset:string,tokens:ThemeTokens):void { store.settings.themePreset=preset;store.settings.themeTokens=tokens;publish({type:"theme",preset,tokens}); }
app.patch("/api/theme", async (req,res)=>{
  const preset=typeof req.body?.preset==="string"?req.body.preset:"";
  if(!(preset in themePresets))return res.status(400).json({error:"Choose Halloween, Neon, Cozy, Retro or Clean."});
  const tokens=req.body?.tokens===undefined?themePresets[preset as keyof typeof themePresets]:req.body.tokens;
  if(!validTheme(tokens))return res.status(400).json({error:"Theme tokens are invalid. Use safe hex colors, bounded values and an approved system font."});
  applyTheme(preset,tokens);await persist();res.json({ok:true,preset,tokens});
});
app.post("/api/theme/generate", async(req,res)=>{
  const prompt=typeof req.body?.prompt==="string"?req.body.prompt.slice(0,200):"";
  if(!prompt.trim())return res.status(400).json({error:"Describe the theme you want."});
  const text=prompt.toLowerCase();const preset=text.match(/spooky|halloween|haunt|rainy|night/)?"Halloween":text.match(/cozy|warm|soft/)?"Cozy":text.match(/neon|cyber|electric/)?"Neon":text.match(/retro|80s|arcade/)?"Retro":"Clean";
  const tokens=themePresets[preset];applyTheme(preset,tokens);await persist();res.json({ok:true,preset,tokens,fallback:true,message:`Codex theme generation is unavailable in this development run; applied the closest preset, ${preset}.`});
});
const overlayKits:Record<string,{title:string;theme:keyof typeof themePresets;widgets:string[]}>= {
  halloween:{title:"Halloween",theme:"Halloween",widgets:["screen-effects","countdown-timer","boss-bar"]},
  cozy:{title:"Cozy stream",theme:"Cozy",widgets:["welcome-banner","goal-bar","countdown-timer"]},
  neon:{title:"Neon arcade",theme:"Neon",widgets:["dice-roller","prediction-scoreboard","screen-effects"]},
};
app.post("/api/kits/:id",async(req,res)=>{
  const kit=overlayKits[req.params.id];if(!kit)return res.status(404).json({error:"Overlay kit not found."});
  for(const id of kit.widgets){const entry=store.library.find((item)=>item.widgetId===id);const widget=store.widgets.find((item)=>item.id===id);if(entry&&widget)widget.enabled=true;}
  applyTheme(kit.theme,themePresets[kit.theme]);await persist();publish({type:"widgets",widgets:store.widgets});res.json({ok:true,title:kit.title,theme:kit.theme,widgets:kit.widgets});
});
app.get("/api/widgets/:id/export", async (req, res) => {
  const widget=store.widgets.find((item)=>item.id===req.params.id);
  if(!widget||!/^[a-z0-9-]{1,80}$/u.test(widget.id))return res.status(404).json({error:"Widget not found."});
  try {
    const code=await readFile(path.join(widgetRoot,widget.id,"index.js"),"utf8");
    const declaredMeta=parseDeclaredMeta(code);
    if(!declaredMeta)return res.status(409).json({error:"Widget metadata is not declared in an exportable static form."});
    const libraryEntry=store.library.find((item)=>item.widgetId===widget.id);
    const request=store.requestHistory.find((item)=>item.widgetId===widget.id);
    const artifact={format:"sfwidget",version:1,id:widget.id,meta:declaredMeta,code,originalPrompt:libraryEntry?.originalPrompt||request?.text||"Imported StreamForge widget.",creator:libraryEntry?.creator||"StreamForge",widgetVersion:(await widgetCommitHistory(widget.id)).length};
    res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Content-Disposition",`attachment; filename="${widget.id}.sfwidget"`);res.send(JSON.stringify(artifact,null,2));
  } catch { res.status(404).json({error:"Widget source is unavailable."}); }
});
app.post("/api/library/import", async (req, res) => {
  const artifact=req.body;
  if(!artifact||artifact.format!=="sfwidget"||artifact.version!==1||typeof artifact.code!=="string")return res.status(400).json({error:"Invalid .sfwidget file: expected format sfwidget version 1 with widget code."});
  if(artifact.code.length>100_000)return res.status(400).json({error:"Widget code exceeds the 100 KB import limit."});
  const codeHash=createHash("sha256").update(artifact.code).digest("hex");
  const duplicate=store.library.find((entry)=>entry.codeHash===codeHash);
  if(duplicate)return res.json({ok:true,alreadyImported:true,entry:duplicate});
  const meta=artifact.meta as Record<string,unknown>|undefined;
  const declaredMeta=parseDeclaredMeta(artifact.code);
  const title=typeof meta?.title==="string"?meta.title.trim():"";
  const description=typeof meta?.description==="string"?meta.description.trim():"";
  const width=Number(meta?.width);const height=Number(meta?.height);const x=Number(meta?.x);const y=Number(meta?.y);
  const anchor=typeof meta?.anchor==="string"?meta.anchor:"";
  if(!title||title.length>80||!description||description.length>240||!Number.isInteger(width)||width<100||width>1920||!Number.isInteger(height)||height<60||height>1080||!Number.isInteger(x)||x<0||!Number.isInteger(y)||y<0||x+width>1920||y+height>1080||!["top-left","top-right","bottom-left","bottom-right","center"].includes(anchor))return res.status(400).json({error:"Invalid widget metadata: check title, description, size, position and anchor."});
  if(!declaredMeta||JSON.stringify(declaredMeta)!==JSON.stringify({title,description,width,height,x,y,anchor}))return res.status(400).json({error:"Widget metadata does not match the source declaration."});
  const result=await checkWidgetSource(artifact.code);
  if(!result.ok)return res.status(400).json({error:`Unsafe widget import: ${result.reason||"source checks failed"}`});
  const widgetId=`import-${randomUUID().slice(0,8)}`;const importId=randomUUID();const draftDir=path.join(dataDir,"drafts",importId);let promoted=false;
  try{
    await mkdir(draftDir,{recursive:true});const draftPath=path.join(draftDir,"index.js");await writeWidgetFile(draftPath,artifact.code,{mode:0o600});
    const targetDir=path.join(widgetRoot,widgetId);await mkdir(targetDir,{recursive:true});const target=path.join(targetDir,"index.js");const temp=`${target}.${importId}.tmp`;await copyFile(draftPath,temp);await chmod(temp,0o600);await rename(temp,target);promoted=true;
    if(widgetRoot===path.join(root,"widgets")){execFileSync("git",["add","--",`widgets/${widgetId}/index.js`],{cwd:root,stdio:"ignore"});execFileSync("git",["commit","-m",`Import widget ${widgetId}`],{cwd:root,stdio:"ignore"});}
    const safeCreator=typeof artifact.creator==="string"?artifact.creator.replace(/[^\p{L}\p{N} _.-]/gu,"").trim().slice(0,40):"Imported";
    const entry:LibraryEntry={id:widgetId,widgetId,title,description,originalPrompt:typeof artifact.originalPrompt==="string"?artifact.originalPrompt.slice(0,300):"Imported StreamForge widget.",creator:safeCreator||"Imported",codeHash};
    store.library.push(entry);store.widgets.push({id:widgetId,title,description,width,height,x,y,anchor,enabled:true});await persist();publish({type:"widgets",widgets:store.widgets});
    res.status(201).json({ok:true,entry,checks:result.checks});
  }catch{
    if(promoted)await rm(path.join(widgetRoot,widgetId),{recursive:true,force:true}).catch(()=>{});
    res.status(500).json({error:"Widget passed checks but could not be promoted; temporary files were rolled back."});
  }finally{await rm(draftDir,{recursive:true,force:true}).catch(()=>{});}
});
app.post("/api/library/:id/add", async (req, res) => {
  const entry = store.library.find((item) => item.id === req.params.id);
  if (!entry) return res.status(404).json({error:"Library widget not found."});
  let widget = store.widgets.find((item) => item.id === entry.widgetId);
  if (!widget) {
    const base = starterWidgets.find((item) => item.id === entry.widgetId);
    if (!base) return res.status(409).json({error:"Widget source is unavailable."});
    widget = { ...base, enabled: true }; store.widgets.push(widget);
  } else widget.enabled = true;
  await persist(); publish({type:"widgets",widgets:store.widgets});
  res.json({ok:true,widget});
});
app.post("/api/codex/verify", async (_req, res) => {
  const workingDirectory = await mkdtemp(path.join(os.tmpdir(), "streamforge-verify-"));
  const outputPath = path.join(workingDirectory, "verification.txt");
  try {
    const { Codex } = await import("@openai/codex-sdk");
    const thread = new Codex().startThread({ workingDirectory, sandboxMode: "workspace-write", approvalPolicy: "never", skipGitRepoCheck: true, networkAccessEnabled: false, webSearchMode: "disabled" });
    const { events } = await thread.runStreamed(`Create ${outputPath} with the text "StreamForge Codex verification". Do not change any other file.`);
    for await (const _event of events) { /* consume the real verification stream */ }
    const contents = await readFile(outputPath, "utf8");
    if (!contents.includes("StreamForge Codex verification")) throw Object.assign(new Error("verification_output_missing"), { code: "verification_output_missing" });
    store.codexVerification = { time: new Date().toISOString(), ok: true };
  } catch (error) {
    const code = String((error as NodeJS.ErrnoException).code || "codex_verification_failed").slice(0, 100);
    store.codexVerification = { time: new Date().toISOString(), ok: false, error: code };
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
  await persist();
  res.json(store.codexVerification);
});
const transitions: Record<BuildState, BuildState[]> = {
  queued: ["approved", "failed"], approved: ["building", "failed"], building: ["checking", "failed", "rolled_back"], checking: ["live", "failed", "rolled_back"], live: ["rolled_back"], failed: [], rolled_back: [],
};
function setState(request: Request, next: BuildState): void {
  if (!transitions[request.status].includes(next)) throw new Error(`invalid_transition:${request.status}:${next}`);
  request.status = next; request.updatedAt = new Date().toISOString();
  const index = store.requestHistory.findIndex((item) => item.id === request.id);
  if (index < 0) store.requestHistory.unshift({ ...request }); else store.requestHistory[index] = { ...request };
}
function buildFeed(request: Request, stage: string, detail: string, checks?: unknown): void {
  publish({ type: "buildFeed", request: publicRequest(request), stage, detail, checks, at: new Date().toISOString() });
}
async function createRequest(text: string, requester: string, source: string, kind: "build" | "remix" = "build", widgetId?: string): Promise<Request> {
  const request: Request = { id: randomUUID(), text, requester, source, status: "queued", createdAt: new Date().toISOString(), votes: 0, voterIds: [], kind, widgetId };
  store.requests.unshift(request); store.requestHistory.unshift({ ...request });
  await persist(); publish({ type: "request", request: publicRequest(request) });
  buildFeed(request, "Received", "Request added to the queue");
  return request;
}
async function mockBuild(request: Request): Promise<void> {
  const buildMode = String(store.settings.buildMode || "mock");
  if (buildMode === "codex") {
    request.failure = "Real Codex builds are disabled during this development run.";
    setState(request, "failed"); buildFeed(request, "Rolled back", request.failure); await persist(); return;
  }
  let source = ""; let widgetId = ""; let draftDir = ""; let originalSource = "";
  const isRemix = request.kind === "remix";
  try {
    buildFeed(request, "Approved", "Request approved for the mock runner");
    setState(request, "building"); buildFeed(request, "Planning", isRemix ? "Using the selected widget source as the remix starting point" : "Preparing an isolated mock widget"); await persist();
    if (isRemix) {
      widgetId = request.widgetId || "";
      if (!store.widgets.some((item) => item.id === widgetId) || !/^[a-z0-9-]{1,80}$/u.test(widgetId)) throw new Error("remix_widget_missing");
      const currentPath = path.join(widgetRoot, widgetId, "index.js");
      originalSource = await readFile(currentPath, "utf8");
      source = originalSource.replace(/(\bdescription\s*:\s*)("[^"]*")/u, '$1"Updated by a safe mock remix"');
      if (source === originalSource) throw new Error("remix_target_not_supported");
    } else {
      source = `export default {\n  meta: { title: "Community Widget", description: "A safe mock build from the request queue.", width: 420, height: 160, x: 0, y: 0, anchor: "top-right" },\n  mount(api) {\n    const card = document.createElement("section");\n    card.textContent = "Community widget ready";\n    api.root.append(card);\n    api.on("chat", (event) => { if (String(event.message || "").trim()) card.textContent = "Chat is part of this widget"; });\n  },\n};\n`;
      widgetId = `community-${request.id.slice(0, 8)}`;
    }
    draftDir = path.join(dataDir, "drafts", request.id);
    await mkdir(draftDir, { recursive: true });
    const draftPath = path.join(draftDir, "index.js");
    await writeWidgetFile(draftPath, source, { mode: 0o600 });
    buildFeed(request, "Writing code", isRemix ? "Mock runner prepared a safe source update" : "A mock runner wrote a safe starter widget");
    setState(request, "checking"); buildFeed(request, "Safety checks", "Running syntax, static scan and mock mount checks"); await persist();
    const result = await checkWidgetSource(source);
    if (!result.ok) throw new Error(result.reason || "Widget check failed.");
    safeDrafts.set(request.id, source);
    buildFeed(request, "Safety checks", "Draft passed the static scan and mock mount; preview is not live yet", result.checks);
    publish({ type: "draftPreview", request: publicRequest(request), requestId: request.id, url: `/api/requests/${request.id}/preview`, widgetId });
    if (!isRemix) await mkdir(path.join(widgetRoot, widgetId), { recursive: true });
    const promotedPath = path.join(widgetRoot, widgetId, "index.js");
    const promoteTemp = `${promotedPath}.${request.id}.tmp`;
    await copyFile(draftPath, promoteTemp); await chmod(promoteTemp, 0o600); await rename(promoteTemp, promotedPath);
    if (widgetRoot === path.join(root, "widgets")) {
      execFileSync("git", ["add", "--", `widgets/${widgetId}/index.js`], { cwd: root, stdio: "ignore" });
      execFileSync("git", ["commit", "-m", `${isRemix ? "Remix" : "Build mock"} widget ${widgetId}`], { cwd: root, stdio: "ignore" });
    }
    if (!isRemix) {
      const metadata: WidgetMeta = { id: widgetId, title: "Community Widget", description: "A safe mock build from the request queue.", width: 420, height: 160, x: 0, y: 0, anchor: "top-right", enabled: true };
      store.widgets.push(metadata);
    }
    setState(request, "live"); buildFeed(request, "Live", "Widget passed checks and is ready on the overlay", result.checks);
    await persist(); publish({ type: "widgets", widgets: store.widgets });
  } catch {
    if (isRemix && widgetId && originalSource) {
      try { await writeWidgetFile(path.join(widgetRoot, widgetId, "index.js"), originalSource, { mode: 0o600 }); } catch { /* preserve rollback outcome */ }
    } else if (widgetId) {
      try { await rm(path.join(widgetRoot, widgetId), { recursive: true, force: true }); } catch { /* rollback best effort */ }
      store.widgets = store.widgets.filter((widget) => widget.id !== widgetId);
    }
    if (draftDir) await rm(draftDir, { recursive: true, force: true }).catch(() => {});
    request.failure = "Mock build failed a safety check; widget changes were rolled back.";
    if (["building", "checking", "live"].includes(request.status)) setState(request, "rolled_back");
    buildFeed(request, "Rolled back", request.failure); await persist();
  }
  if (draftDir) await rm(draftDir, { recursive: true, force: true }).catch(() => {});
  setTimeout(() => safeDrafts.delete(request.id), 5 * 60_000).unref();
}
let buildChain: Promise<void> = Promise.resolve();
function runBuild(request: Request): Promise<void> {
  buildChain = buildChain.then(() => mockBuild(request));
  return buildChain;
}
async function undoWidget(widgetId: string): Promise<{ ok: boolean; reason?: string }> {
  const widget = store.widgets.find((item) => item.id === widgetId);
  if (!widget || !/^[a-z0-9-]{1,80}$/u.test(widgetId) || widgetRoot !== path.join(root, "widgets")) return { ok: false, reason: "Widget is not available for version rollback." };
  const versions = await widgetCommitHistory(widgetId);
  if (versions.length < 2) return { ok: false, reason: "No earlier widget version is available yet." };
  const relativePath = `widgets/${widgetId}/index.js`;
  const source = execFileSync("git", ["show", `${versions[1]}:${relativePath}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const check = await checkWidgetSource(source);
  if (!check.ok) return { ok: false, reason: check.reason || "The earlier version failed safety checks." };
  const target = path.join(widgetRoot, widgetId, "index.js");
  const backup = await readFile(target, "utf8");
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeWidgetFile(temporary, source, { mode: 0o600 });
  await rename(temporary, target);
  try {
    execFileSync("git", ["add", "--", relativePath], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", `Undo widget ${widgetId}`], { cwd: root, stdio: "ignore" });
  } catch {
    await writeWidgetFile(target, backup, { mode: 0o600 });
    execFileSync("git", ["add", "--", relativePath], { cwd: root, stdio: "ignore" });
    return { ok: false, reason: "Version rollback could not be committed; the current widget was restored." };
  }
  publish({ type: "widgets", widgets: store.widgets });
  return { ok: true };
}
setInterval(() => {
  if (store.settings.approval !== "auto-votes") return;
  const seconds = Number(store.settings.autoBuildSeconds || 0);
  if (seconds <= 0) return;
  const next = store.requests.filter((item) => item.status === "queued").sort((a,b)=>(b.votes||0)-(a.votes||0)||a.createdAt.localeCompare(b.createdAt))[0];
  if (!next || Date.now() - Date.parse(next.createdAt) < seconds * 1000) return;
  setState(next, "approved");
  publish({type:"queue",requests:store.requests.filter((item)=>item.status==="queued").map(publicRequest)});
  void persist().then(() => runBuild(next));
}, 1000);
app.post("/api/requests", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, 300) : "";
  const validation=validateRequestText(text);if(!validation.ok)return res.status(400).json({error:validation.reason});
  if (store.requests.filter((item) => item.status === "queued").length >= 100) return res.status(429).json({ error: recordError("QUEUE_FULL") });
  const request = await createRequest(text, "Dashboard", "dashboard");
  res.status(201).json(publicRequest(request));
});
app.post("/api/chat", async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 500) : "";
  const userId = typeof req.body?.userId === "string" ? req.body.userId.slice(0, 100) : "";
  const login = typeof req.body?.login === "string" ? req.body.login.slice(0, 40) : "";
  if (!message || !userId || req.body?.isBot === true || /(?:bot|nightbot|streamelements|moobot)$/iu.test(login)) return res.json({ ok: true, ignored: true });
  const anonymousPlayer=`Player ${createHash("sha256").update(userId).digest("hex").slice(0,5)}`;
  publish({ type: "event", event: { type: "chat", payload: { message: redactDisplay(message), user: anonymousPlayer, isMod:req.body?.isMod===true }, simulated: req.body?.simulated === true, at: new Date().toISOString() } });
  const buildMatch = /^!build\s+(.+)$/iu.exec(message);
  if (buildMatch) {
    const lastBuildAt = recentBuilds.get(userId) || 0;
    if (Date.now() - lastBuildAt < 30_000) return res.status(429).json({ ok: false, reason: "Please wait before submitting another request." });
    const text = buildMatch[1].trim().slice(0, 300);
    if (validateRequestText(text).ok) {
      recentBuilds.set(userId, Date.now());
      await createRequest(text, "Chat viewer", "chat");
    }
  }
  const remixCommand = /^!remix\s+(.+)$/iu.exec(message);
  if (remixCommand) {
    const lastBuildAt = recentBuilds.get(userId) || 0;
    if (Date.now() - lastBuildAt < 30_000) return res.status(429).json({ ok: false, reason: "Please wait before submitting another request." });
    const body = remixCommand[1];
    const widget = [...store.widgets].sort((a,b)=>b.title.length-a.title.length).find((item)=>body.toLocaleLowerCase().startsWith(`${item.title.toLocaleLowerCase()} `) || body.toLocaleLowerCase().startsWith(`${item.id.toLocaleLowerCase()} `));
    if (!widget) return res.status(400).json({ ok: false, reason: "Name a widget from the current scene, followed by the requested change." });
    const change = body.slice(body.toLocaleLowerCase().startsWith(`${widget.id.toLocaleLowerCase()} `) ? widget.id.length : widget.title.length).trim().slice(0,300);
    if (!validateRequestText(change).ok) return res.status(400).json({ok:false,reason:"Enter a safe change of up to 300 characters and avoid blocked content."});
    recentBuilds.set(userId, Date.now());
    await createRequest(change, "Chat viewer", "chat", "remix", widget.id);
  }
  const voteMatch = /^(?:!vote\s+(\d+)|vote\s+(\d+)|\+1)$/iu.exec(message);
  if (voteMatch) {
    const queued = store.requests.filter((item) => item.status === "queued").sort((a, b) => (b.votes || 0) - (a.votes || 0) || a.createdAt.localeCompare(b.createdAt));
    const position = voteMatch[1] || voteMatch[2] ? Number(voteMatch[1] || voteMatch[2]) : 1;
    const request = queued[position - 1];
    if (request && !request.voterIds?.includes(userId)) {
      request.voterIds = [...(request.voterIds || []), userId]; request.votes = (request.votes || 0) + 1;
      const history = store.requestHistory.find((item) => item.id === request.id); if (history) Object.assign(history, request);
      await persist(); publish({ type: "queue", requests: queued.map(publicRequest) });
      const threshold = Number(store.settings.autoBuildVotes || 0);
      if (threshold > 0 && request.votes >= threshold && store.settings.approval === "auto-votes") { setState(request, "approved"); await persist(); publish({type:"queue",requests:queued.map(publicRequest)}); await runBuild(request); }
    }
  }
  const undoMatch = /^!?undo\s+([a-z0-9-]{1,80})$/iu.exec(message);
  if (undoMatch && req.body?.isMod === true) {
    const result = await undoWidget(undoMatch[1]);
    publish({ type: "moderation", message: result.ok ? "Widget version restored." : result.reason });
  }
  const themeMatch=/^!theme\s+(Halloween|Neon|Cozy|Retro|Clean)$/iu.exec(message);
  if(themeMatch&&req.body?.isMod===true){const preset=Object.keys(themePresets).find((name)=>name.toLowerCase()===themeMatch[1].toLowerCase())!;applyTheme(preset,themePresets[preset as keyof typeof themePresets]);await persist();}
  res.json({ ok: true });
});
app.post("/api/requests/:id/:action", async (req, res) => {
  const request = store.requests.find((item) => item.id === req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found." });
  if (request.status !== "queued") return res.status(409).json({ error: "This request is no longer waiting for approval." });
  const approved = req.params.action === "approve";
  if (req.params.action === "reject") setState(request, "failed");
  else if (approved) setState(request, "approved");
  else return res.status(400).json({ error: "Unknown request action." });
  await persist();
  publish({ type: "request", request: publicRequest(request) });
  if (approved) await runBuild(request);
  res.json(publicRequest(request));
});
app.post("/api/widgets/:id/undo", async (req, res) => {
  const result = await undoWidget(req.params.id);
  if (!result.ok) return res.status(409).json({ error: result.reason });
  res.json({ ok: true, message: "Previous widget version restored." });
});
app.post("/api/widgets/:id/remix", async (req, res) => {
  const widget = resolveWidgetName(req.params.id);
  const change = typeof req.body?.change === "string" ? req.body.change.trim().slice(0,300) : "";
  if (!widget) return res.status(404).json({error:"Widget not found."});
  if (!change) return res.status(400).json({error:"Describe the change to request."});
  if (!validateRequestText(change).ok) return res.status(400).json({error:"That change needs manual moderator review."});
  const request=await createRequest(change,"Dashboard","dashboard","remix",widget.id);
  res.status(201).json(publicRequest(request));
});
app.patch("/api/settings", async (req, res) => {
  const approval = req.body?.approval;
  if (approval !== undefined && !["manual", "auto-votes", "auto-points"].includes(approval)) return res.status(400).json({ error: "Choose manual, vote threshold, or channel points." });
  const votes = req.body?.autoBuildVotes === undefined ? undefined : Number(req.body.autoBuildVotes);
  const seconds = req.body?.autoBuildSeconds === undefined ? undefined : Number(req.body.autoBuildSeconds);
  const buildTimeoutSeconds = req.body?.buildTimeoutSeconds === undefined ? undefined : Number(req.body.buildTimeoutSeconds);
  const retryFailedBuildOnce = req.body?.retryFailedBuildOnce === undefined ? undefined : req.body.retryFailedBuildOnce;
  if (votes !== undefined && (!Number.isInteger(votes) || votes < 1 || votes > 1000)) return res.status(400).json({ error: "Vote threshold must be from 1 to 1000." });
  if (seconds !== undefined && (!Number.isInteger(seconds) || seconds < 0 || seconds > 86400)) return res.status(400).json({ error: "Build timer must be from 0 to 86400 seconds." });
  if (buildTimeoutSeconds !== undefined && (!Number.isInteger(buildTimeoutSeconds) || buildTimeoutSeconds < 15 || buildTimeoutSeconds > 600)) return res.status(400).json({ error: "Build timeout must be from 15 to 600 seconds." });
  if (retryFailedBuildOnce !== undefined && typeof retryFailedBuildOnce !== "boolean") return res.status(400).json({ error: "Retry setting must be on or off." });
  if (approval !== undefined) store.settings.approval = approval;
  if (votes !== undefined) store.settings.autoBuildVotes = votes;
  if (seconds !== undefined) store.settings.autoBuildSeconds = seconds;
  if (buildTimeoutSeconds !== undefined) store.settings.buildTimeoutSeconds = buildTimeoutSeconds;
  if (retryFailedBuildOnce !== undefined) store.settings.retryFailedBuildOnce = retryFailedBuildOnce;
  await persist(); res.json(store.settings);
});
app.post("/api/widgets/:id/runtime-error", async (req, res) => {
  const widget = store.widgets.find((item) => item.id === req.params.id);
  if (!widget) return res.status(404).json({ error: "Widget not found." });
  widget.enabled = false;
  const message = recordError("WIDGET_RUNTIME_ERROR");
  await persist(); publish({ type: "widgets", widgets: store.widgets });
  publish({ type: "runtimeError", widgetId: widget.id, message, error: lastError });
  res.json({ ok: true, message });
});
app.post("/api/simulate/:event", (req, res) => {
  const allowed = new Set(["chat", "follow", "sub", "raid", "redeem"]);
  if (!allowed.has(req.params.event)) return res.status(400).json({ error: "Unsupported simulated event." });
  const eventType = req.params.event;
  if (eventType === "chat" && Array.isArray(req.body?.commands)) {
    for (const message of req.body.commands.slice(0,10)) publish({type:"event",event:{type:"chat",payload:{message:String(message).slice(0,100),user:"Player abc12",isMod:true},simulated:true,at:new Date().toISOString()}});
  } else {
    const event = { type: eventType, payload: req.body ?? {}, simulated: true, at: new Date().toISOString() };
    publish({ type: "event", event });
  }
  if (eventType === "redeem" && store.settings.approval === "auto-points" && req.body?.reward === "Build a widget") {
    const text = typeof req.body?.user_input === "string" ? req.body.user_input.trim().slice(0, 300) : "Make a channel point widget";
    void createRequest(text || "Make a channel point widget", "Channel point redeemer", "points").then(async (request) => { setState(request, "approved"); await persist(); await runBuild(request); });
  }
  res.json({ ok: true, simulated: true });
});
app.patch("/api/widgets/:id", async (req, res) => {
  const widget = store.widgets.find((item) => item.id === req.params.id);
  if (!widget) return res.status(404).json({ error: "Widget not found." });
  if (typeof req.body?.enabled === "boolean") widget.enabled = req.body.enabled;
  if (req.body?.position && typeof req.body.position === "object") {
    const x = Number(req.body.position.x); const y = Number(req.body.position.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + widget.width > 1920 || y + widget.height > 1080) return res.status(400).json({ error: "Position must fit inside the 1920 × 1080 overlay." });
    widget.position = { x, y };
  }
  await persist();
  publish({ type: "widgets", widgets: store.widgets });
  res.json(widget);
});
app.delete("/api/widgets/:id", async (req, res) => {
  const widget=store.widgets.find((item)=>item.id===req.params.id);
  if(!widget)return res.status(404).json({error:"Widget not found."});
  widget.enabled=false;await persist();publish({type:"widgets",widgets:store.widgets});res.json({ok:true});
});
app.get("/auth/twitch", (_req, res) => {
  if (!process.env.TWITCH_CLIENT_ID) return res.status(503).json({ error: "Add TWITCH_CLIENT_ID to .env before authorizing Twitch." });
  const redirect = `http://localhost:${port}/auth/twitch/callback`;
  const query = new URLSearchParams({ client_id: process.env.TWITCH_CLIENT_ID, redirect_uri: redirect, response_type: "code", scope: "user:read:chat user:write:chat channel:read:subscriptions" });
  res.redirect(`https://id.twitch.tv/oauth2/authorize?${query}`);
});
app.get("/auth/twitch/callback", (_req, res) => res.status(501).send("Twitch token exchange is not configured yet."));

const http = createServer(app);
const wss = new WebSocketServer({ server: http, path: "/ws" });
const clients = new Set<WebSocket>();
wss.on("connection", (socket) => { clients.add(socket); socket.on("close", () => clients.delete(socket)); socket.send(JSON.stringify({ type: "hello", at: new Date().toISOString() })); });
function publish(payload: unknown): void {
  const message = JSON.stringify(payload);
  for (const client of clients) if (client.readyState === WebSocket.OPEN) client.send(message);
}

http.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    process.stderr.write(`Port ${port} is already in use. Stop the other server or set PORT to a free port.\n`);
    process.exit(1);
  }
  throw error;
});
http.listen(port, () => {
  const url = `http://localhost:${port}/dashboard/`;
  process.stdout.write(`StreamForge is ready at ${url}\n`);
  if (process.env.OPEN_BROWSER !== "false") {
    const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const args = process.platform === "darwin" ? ["-a", "Google Chrome", url] : process.platform === "win32" ? ["/c", "start", "", url] : [url];
    import("node:child_process").then(({ spawn }) => {
      const browser = spawn(command, args, { stdio: "ignore", detached: true });
      browser.on("error", () => {
        if (process.platform === "darwin") spawn("open", [url], { stdio: "ignore", detached: true }).unref();
      });
      browser.unref();
    });
  }
});
