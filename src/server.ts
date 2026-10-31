import express from "express";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rename, chmod, rm, copyFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { writeFile as writeWidgetFile } from "node:fs/promises";
import { WebSocketServer, WebSocket } from "ws";
import { checkWidgetSource } from "./security/widget-checks.js";
import { validateRequestText } from "./security/request-checks.js";
import { createWidgetPassport, type WidgetPassport } from "./security/passport.js";
import { contrastRatio, nearestAccessibleText } from "./security/contrast.js";
import { HypeEngine, type HypeSettings } from "./hype/engine.js";
import { SessionManager, type SessionActivity } from "./sessions/manager.js";
import { loadEnvFile, liveTwitchEnabled } from "./config/env.js";
import { TwitchOAuth } from "./twitch/oauth.js";
import { TwitchTokenStore } from "./twitch/token-store.js";
import { TwitchIrcClient } from "./twitch/irc-client.js";
import { TwitchEventSubClient } from "./twitch/eventsub-client.js";
import { TwitchClipManager } from "./twitch/clips.js";
import { codexFailureMessage, parseWidgetMeta as parseCodexWidgetMeta, runCodexWidgetBuild, type CodexRunnerError } from "./codex/runner.js";
import { latestSuccessfulBuildRecording, writeBuildRecording, type BuildRecording, type RecordedBuildEvent } from "./codex/replay.js";
import { verifyCodex } from "./codex/verify.js";

type BuildState = "queued" | "approved" | "building" | "checking" | "live" | "failed" | "rolled_back";
type Request = { id: string; text: string; requester: string; source: string; status: BuildState; createdAt: string; updatedAt?: string; votes?: number; voterIds?: string[]; failure?: string; kind?: "build" | "remix"; widgetId?: string; script?:string; manualReview?:boolean; languageInstruction?:string };
type WidgetMeta = { id: string; title: string; description: string; width: number; height: number; x: number; y: number; anchor: string; enabled: boolean; position?: { x: number; y: number }; versionCount?: number; canUndo?: boolean; passport?: WidgetPassport };
type LibraryEntry = { id: string; widgetId: string; title: string; description: string; originalPrompt: string; creator: string; codeHash?: string; passport?: WidgetPassport };
type Store = { requests: Request[]; requestHistory: Request[]; widgets: WidgetMeta[]; library: LibraryEntry[]; settings: Record<string, unknown>; widgetStorage?: Record<string, Record<string, unknown>>; codexVerification?: { time: string; ok: boolean; error?: string } };
type ErrorCode = "CODEX_NOT_LOGGED_IN" | "CODEX_LIMIT_REACHED" | "CODEX_TIMEOUT" | "CODEX_BAD_OUTPUT" | "CHECKS_FAILED" | "ROLLED_BACK" | "TWITCH_TOKEN_EXPIRED" | "CHAT_DISCONNECTED" | "EVENTSUB_DISCONNECTED" | "QUEUE_FULL" | "REQUEST_REJECTED" | "WIDGET_RUNTIME_ERROR" | "CLIP_DISABLED" | "CLIP_SCOPE_MISSING" | "CLIP_NOT_LIVE" | "CLIP_COOLDOWN" | "CLIP_SESSION_CAP" | "CLIP_RATE_LIMIT" | "CLIP_FAILED";
const errorMessages: Record<ErrorCode, string> = {
  CODEX_NOT_LOGGED_IN: "Codex is not signed in. Sign in, then verify Codex in Settings.", CODEX_LIMIT_REACHED: "Codex has reached its usage limit. Builds are paused; try the Library or Replay mode.", CODEX_TIMEOUT: "The build took too long and was stopped.", CODEX_BAD_OUTPUT: "Codex did not create a usable widget file.", CHECKS_FAILED: "The widget did not pass the safety checks.", ROLLED_BACK: "The widget change was rolled back safely.", TWITCH_TOKEN_EXPIRED: "Your Twitch token expired. Reconnect Twitch.", CHAT_DISCONNECTED: "Twitch chat is disconnected. Check the connection in Settings.", EVENTSUB_DISCONNECTED: "Twitch event updates are disconnected. Reconnect Twitch.", QUEUE_FULL: "The build queue is full. Try again after a request finishes.", REQUEST_REJECTED: "That request needs moderator review.", WIDGET_RUNTIME_ERROR: "A widget stopped after a runtime error. Undo is available from Widgets.", CLIP_DISABLED: "Auto-Clips is off. Enable it in Settings after Twitch authorization is available.", CLIP_SCOPE_MISSING: "Twitch authorization needs the clips:edit permission. Reauthorize to enable clip creation.", CLIP_NOT_LIVE: "The channel is not live, so no clip was created.", CLIP_COOLDOWN: "Auto-Clips is cooling down. No clip was created.", CLIP_SESSION_CAP: "This session reached its clip limit.", CLIP_RATE_LIMIT: "Twitch is rate limiting clip requests. Try again later.", CLIP_FAILED: "Twitch could not create a clip. No automatic retry was made.",
};
let lastError: { code: ErrorCode; at: string } | undefined;
let chatState: "connected" | "needs_setup" | "error" = "needs_setup";
let eventSubState: "connected" | "needs_setup" | "error" = "needs_setup";
let chatError: string | undefined;
let eventSubError: string | undefined;
function recordError(code: ErrorCode): string { lastError = { code, at: new Date().toISOString() }; return errorMessages[code]; }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "public");
const dataDir = path.resolve(process.env.STREAMFORGE_DATA_DIR || path.join(root, "data"));
const widgetRoot = path.resolve(process.env.STREAMFORGE_WIDGETS_DIR || path.join(root, "widgets"));
const scenesPath=path.join(dataDir,"scenes.json");
const replayDir=path.join(root,"replay");

for (const [key, value] of Object.entries(await loadEnvFile(path.join(root, ".env")))) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const port = Number(process.env.PORT || 3000);
const twitchRedirectUri = `http://localhost:${port}/auth/twitch/callback`;
const twitchOAuth = new TwitchOAuth({
  clientId: process.env.TWITCH_CLIENT_ID || "",
  clientSecret: process.env.TWITCH_CLIENT_SECRET || "",
  redirectUri: twitchRedirectUri,
  channel: process.env.TWITCH_CHANNEL || "",
});
const twitchTokenStore = new TwitchTokenStore({
  filePath: path.join(dataDir, "twitch-token.json"),
  clientId: process.env.TWITCH_CLIENT_ID || "",
  clientSecret: process.env.TWITCH_CLIENT_SECRET || "",
});
await twitchTokenStore.load();
if (twitchTokenStore.identity) await twitchTokenStore.refreshIfNeeded();
const twitchRefreshTimer = setInterval(() => { void twitchTokenStore.refreshIfNeeded(); }, 60_000);
twitchRefreshTimer.unref();

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
type ScenePreset={id:string;name:string;builtIn:boolean;widgetIds:string[];theme:keyof typeof themePresets;safeMode:"off"|"reduced"|"minimal";hypeSensitivity?:"low"|"normal"|"high"};
const builtinScenes:ScenePreset[]=[
 {id:"starting-soon",name:"Starting Soon",builtIn:true,widgetIds:["countdown-timer","welcome-banner"],theme:"Cozy",safeMode:"reduced",hypeSensitivity:"normal"},
 {id:"be-right-back",name:"Be Right Back",builtIn:true,widgetIds:["countdown-timer","welcome-banner"],theme:"Clean",safeMode:"reduced",hypeSensitivity:"low"},
 {id:"hype-mode",name:"Hype Mode",builtIn:true,widgetIds:["dice-roller","boss-bar","screen-effects","goal-bar"],theme:"Neon",safeMode:"off",hypeSensitivity:"high"},
 {id:"ending",name:"Ending",builtIn:true,widgetIds:["screen-effects","goal-bar","countdown-timer"],theme:"Clean",safeMode:"minimal",hypeSensitivity:"low"},
];
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
if (["mock", "replay", "codex"].includes(process.env.BUILD_MODE || "")) store.settings.buildMode = process.env.BUILD_MODE;
if (!store.settings.themeTokens || typeof store.settings.themeTokens !== "object") store.settings.themeTokens = themePresets.Clean;
store.settings.safeMode ||= "off";
store.settings.hypeSensitivity ||= "normal";
store.settings.manualHypeBoost ??= 0;
store.settings.hypeMuted ??= false;
store.settings.hypeReactive ??= false;
store.settings.overlayHypeMeter ??= false;
store.settings.includeChatterNames ??= false;
store.settings.nonEnglishManualApproval ??= true;
store.settings.autoClipsEnabled ??= false;
store.settings.clipTriggers ||= { hypePeak: false, widgetMoments: false, manual: true, moderatorCommand: false };
store.settings.clipCooldownSeconds ??= 120;
store.settings.clipSessionCap ??= 10;
store.settings.clipHypePeakSeconds ??= 5;
store.settings.sessionAutoEndMinutes ??= 0;
store.settings.activeScene ||= "";
let userScenes:ScenePreset[]=[];try{const saved=JSON.parse(await readFile(scenesPath,"utf8"));if(Array.isArray(saved))userScenes=saved.filter((scene)=>scene&&typeof scene.id==="string"&&typeof scene.name==="string"&&scene.builtIn===false&&Array.isArray(scene.widgetIds)&&scene.widgetIds.every((id:unknown)=>typeof id==="string")&&isThemePreset(scene.theme)&&["off","reduced","minimal"].includes(scene.safeMode));}catch{/* user scenes are optional */}
const sessions=new SessionManager(path.join(dataDir,"sessions"));await sessions.init();if(store.settings.includeChatterNames!==true)await sessions.setIncludeNames(false);
let lastClip: { id: string; editUrl: string; at: string } | undefined;
let lastRealActivityAt = 0;
let hypePeakSince = 0;
let realActivityPeakHandled = false;
const twitchClips = new TwitchClipManager({
  clientId: process.env.TWITCH_CLIENT_ID || "",
  broadcasterId: () => twitchTokenStore.identity?.broadcasterId || "",
  getAccessToken: () => twitchTokenStore.getFreshAccessToken(),
  hasClipScope: () => twitchTokenStore.identity?.scopes.includes("clips:edit") === true,
  enabled: () => liveTwitchEnabled(process.env) && store.settings.autoClipsEnabled === true,
  sessionCount: () => sessions.currentSession()?.clipsCreated || 0,
  sessionCap: () => Number(store.settings.clipSessionCap) || 10,
  cooldownSeconds: () => Number(store.settings.clipCooldownSeconds) || 120,
  lastAttemptAt: () => Number(store.settings.lastClipAttemptAt) || 0,
  onAttempt: async (at) => { store.settings.lastClipAttemptAt=at; await persist(); },
  onCreated: async () => { await sessions.record("clipsCreated"); },
});
const hypeEngine=new HypeEngine();let lastHypePublish=0;let pendingHypePublish:NodeJS.Timeout|undefined;let simulatedHypeUntil=0;let simulatedHypeEnergy=0;
function hypeSettings():HypeSettings{return{sensitivity:(store.settings.hypeSensitivity==="low"||store.settings.hypeSensitivity==="high"?store.settings.hypeSensitivity:"normal"),manualBoost:Math.max(-50,Math.min(50,Number(store.settings.manualHypeBoost)||0)),muted:store.settings.hypeMuted===true,reactive:store.settings.hypeReactive===true,simulatedEnergy:Date.now()<simulatedHypeUntil?simulatedHypeEnergy:0};}
function hypeSnapshot(){return hypeEngine.snapshot(hypeSettings());}
function publishHype():void{const wait=Math.max(0,250-(Date.now()-lastHypePublish));if(wait){if(!pendingHypePublish)pendingHypePublish=setTimeout(()=>{pendingHypePublish=undefined;lastHypePublish=Date.now();publishHypeNow();},wait);return;}lastHypePublish=Date.now();publishHypeNow();}
function publishHypeNow():void{const hype=hypeSnapshot(),now=Date.now();publish({type:"hype",hype});void sessions.recordHype(hype.value);if(hype.value>=80&&now-lastRealActivityAt<30_000){if(!hypePeakSince)hypePeakSince=now;}else{hypePeakSince=0;realActivityPeakHandled=false;}if(store.settings.autoClipsEnabled===true&&(store.settings.clipTriggers as Record<string,unknown>)?.hypePeak===true&&hypePeakSince>0&&!realActivityPeakHandled&&now-hypePeakSince>=Number(store.settings.clipHypePeakSeconds)*1000){realActivityPeakHandled=true;void triggerClip("StreamForge hype peak");}}

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
async function widgetPassport(widget:WidgetMeta,sourceOverride?:string,scanOverride?:Awaited<ReturnType<typeof checkWidgetSource>>):Promise<WidgetPassport>{
  if(!/^[a-z0-9-]{1,80}$/u.test(widget.id))throw new Error("invalid_widget_id");
  const source=sourceOverride??await readFile(path.join(widgetRoot,widget.id,"index.js"),"utf8");
  const declared=parseDeclaredMeta(source)||{width:widget.width,height:widget.height,anchor:widget.anchor};
  const css=await readFile(path.join(widgetRoot,"widget.css"),"utf8").catch(()=>"");
  const scan=scanOverride??await checkWidgetSource(source);
  return createWidgetPassport(source,css,declared,scan);
}
async function refreshWidgetPassport(widget:WidgetMeta,sourceOverride?:string,scanOverride?:Awaited<ReturnType<typeof checkWidgetSource>>):Promise<WidgetPassport>{
  const passport=await widgetPassport(widget,sourceOverride,scanOverride);widget.passport=passport;
  const entry=store.library.find((item)=>item.widgetId===widget.id);if(entry)entry.passport=passport;
  return passport;
}
for(const widget of store.widgets){try{await refreshWidgetPassport(widget);}catch{widget.passport=undefined;}}
for(const entry of store.library){const widget=store.widgets.find((item)=>item.id===entry.widgetId);if(widget?.passport)entry.passport=widget.passport;}
if(store.widgets.some((widget)=>widget.passport))await persist();
const recentBuilds = new Map<string, number>();
const safeDrafts = new Map<string, string>();
const anonymousSessionSalt=randomUUID();

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

const twitchIrc = new TwitchIrcClient({
  onMessage: async (message) => {
    lastRealActivityAt = Date.now();
    try {
      await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(message),
      });
    } catch {
      chatState = "error";
      chatError = "Twitch chat could not reach the local event handler.";
    }
  },
  onStatus: (status) => {
    chatState = status;
    chatError = status === "error" ? "Twitch IRC disconnected; reconnecting quietly." : undefined;
  },
});
const twitchEventSub = new TwitchEventSubClient({
  clientId: process.env.TWITCH_CLIENT_ID || "",
  onEvent: (event) => { lastRealActivityAt = Date.now(); return dispatchStreamEvent(event.type, event.payload, false); },
  onStatus: (status) => {
    eventSubState = status === "connecting" ? "needs_setup" : status;
    eventSubError = status === "error" ? "Twitch EventSub disconnected; reconnecting quietly." : undefined;
  },
});

async function connectTwitchChat(): Promise<void> {
  const identity = twitchTokenStore.identity;
  if (!liveTwitchEnabled(process.env) || !identity) {
    twitchIrc.stop();
    return;
  }
  try {
    const accessToken = await twitchTokenStore.getFreshAccessToken();
    if (!accessToken) return;
    twitchIrc.start({ channel: identity.broadcasterLogin, login: identity.login, accessToken });
  } catch {
    chatState = "error";
    chatError = "Twitch token expired, reconnect.";
  }
}

async function connectTwitchEventSub(): Promise<void> {
  if (!liveTwitchEnabled(process.env) || !twitchTokenStore.identity) {
    twitchEventSub.stop();
    return;
  }
  try {
    const accessToken = await twitchTokenStore.getFreshAccessToken();
    const identity = twitchTokenStore.identity;
    if (!accessToken || !identity) return;
    twitchEventSub.start({ accessToken, userId: identity.userId, broadcasterId: identity.broadcasterId });
  } catch {
    eventSubState = "error";
    eventSubError = "Twitch token expired, reconnect.";
  }
}

async function dispatchStreamEvent(eventType: "follow" | "sub" | "raid" | "redeem", payload: Record<string, unknown>, simulated: boolean): Promise<void> {
  hypeEngine.addEvent(eventType, Date.now(), Number(payload.viewers) || 0);
  const activity: Record<typeof eventType, SessionActivity> = { follow: "follows", sub: "subs", raid: "raids", redeem: "redemptions" };
  void sessions.record(activity[eventType]);
  publishHype();
  publish({ type: "event", event: { type: eventType, payload, simulated, at: new Date().toISOString() } });

  if (eventType !== "redeem" || store.settings.approval !== "auto-points" || payload.reward !== "Build a widget") return;
  const candidate = typeof payload.user_input === "string" ? payload.user_input : "Make a channel point widget";
  const validation = validateRequestText(candidate);
  if (!validation.ok) return;
  const request = await createRequest(validation.language!.normalized, "Channel point redeemer", "points", "build", undefined, validation.language);
  if (request.manualReview) return;
  setState(request, "approved");
  await persist();
  await runBuild(request);
}

app.get("/api/health", (_req, res) => {
  const token = twitchTokenStore.status();
  const twitchConfigured = Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET && process.env.TWITCH_CHANNEL);
  const codex = store.codexVerification?.ok
    ? { state: "verified", time: store.codexVerification.time }
    : store.codexVerification?.error
      ? { state: "error", error: store.codexVerification.error }
      : { state: "needs_setup" };
  res.json({
    ok: true,
    buildMode: store.settings.buildMode,
    twitch: { enabled: liveTwitchEnabled(process.env), configured: twitchConfigured, chat: chatState, chatError: chatError || null, eventSub: eventSubState, eventSubError: eventSubError || null, token },
    codex,
    queueDepth: store.requests.filter((item) => item.status === "queued").length,
    lastError: lastError ? { code: lastError.code, message: errorMessages[lastError.code], at: lastError.at } : null,
  });
});
app.post("/api/twitch/disconnect", async (_req, res) => {
  twitchIrc.stop();
  twitchEventSub.stop();
  chatState = "needs_setup";
  eventSubState = "needs_setup";
  chatError = undefined;
  eventSubError = undefined;
  await twitchTokenStore.disconnect();
  res.json({ ok: true, token: twitchTokenStore.status() });
});
app.get("/api/state", async (_req, res) => {
  const widgets = await Promise.all(store.widgets.map(async (widget) => { const versions = await widgetCommitHistory(widget.id); return { ...widget, versionCount: versions.length, canUndo: versions.length > 1 }; }));
  const tokens=store.settings.themeTokens as ThemeTokens;const themeContrast=validTheme(tokens)?{ratio:Number(contrastRatio(tokens.text,tokens.background).toFixed(2)),passes:contrastRatio(tokens.text,tokens.background)>=4.5}:null;
  res.json({ requests: store.requests.map(publicRequest), requestHistory: store.requestHistory.map(publicRequest), widgets, library: store.library, settings: store.settings, themeContrast, hype:hypeSnapshot(), codexVerification: store.codexVerification });
});
app.get("/api/hype",(_req,res)=>res.json(hypeSnapshot()));
const clipMomentKinds=new Set(["natural20","goalReached"]);const clipMomentAt=new Map<string,number>();
async function triggerClip(title="StreamForge moment") { const result=await twitchClips.createClip(title);if(result.ok){lastClip={id:result.id,editUrl:result.editUrl,at:new Date().toISOString()};await persist();publish({type:"clipCreated",clip:lastClip});}else{recordError(result.code as ErrorCode);publish({type:"clipStatus",code:result.code});}return result; }
async function clipStatus(){let stream:{live:boolean;status:"live"|"offline"|"unavailable"}={live:false,status:"unavailable"};if(store.settings.autoClipsEnabled===true&&liveTwitchEnabled(process.env)&&twitchTokenStore.status().connected)stream=await twitchClips.getLiveStatus();const identity=twitchTokenStore.identity;return{enabled:store.settings.autoClipsEnabled===true,scopeRequired:"clips:edit",authorizationAvailable:identity?.scopes.includes("clips:edit")===true,channelLive:stream.live,liveStatus:stream.status,created:sessions.currentSession()?.clipsCreated||0,lastClip,triggers:store.settings.clipTriggers,hypePeakSeconds:store.settings.clipHypePeakSeconds,cooldownSeconds:store.settings.clipCooldownSeconds,sessionCap:store.settings.clipSessionCap};}
app.get("/api/clips",async(_req,res)=>res.json(await clipStatus()));
app.patch("/api/clips/settings",async(req,res)=>{const triggers=req.body?.triggers;const cooldown=req.body?.cooldownSeconds;const cap=req.body?.sessionCap;const peakSeconds=req.body?.hypePeakSeconds;const enabled=req.body?.enabled;if(enabled!==undefined&&typeof enabled!=="boolean")return res.status(400).json({error:"Auto-Clips must be enabled or disabled."});if(triggers!==undefined&&(!triggers||typeof triggers!=="object"||Object.keys(triggers).some((key)=>!["hypePeak","widgetMoments","manual","moderatorCommand"].includes(key))||Object.values(triggers).some((value)=>typeof value!=="boolean")))return res.status(400).json({error:"Clip triggers must be boolean values for the supported trigger types."});if(cooldown!==undefined&&(!Number.isInteger(Number(cooldown))||Number(cooldown)<120||Number(cooldown)>86400))return res.status(400).json({error:"Global clip cooldown must be 120 to 86400 seconds."});if(cap!==undefined&&(!Number.isInteger(Number(cap))||Number(cap)<1||Number(cap)>10))return res.status(400).json({error:"Per-session clip cap must be 1 to 10."});if(peakSeconds!==undefined&&(!Number.isInteger(Number(peakSeconds))||Number(peakSeconds)<1||Number(peakSeconds)>120))return res.status(400).json({error:"Peak duration must be 1 to 120 seconds."});if(enabled===true&&(!liveTwitchEnabled(process.env)||!twitchTokenStore.identity?.scopes.includes("clips:edit")))return res.status(409).json({error:"Enable live Twitch and authorize with clips:edit before enabling Auto-Clips."});if(triggers)store.settings.clipTriggers={...(store.settings.clipTriggers as object),...triggers};if(cooldown!==undefined)store.settings.clipCooldownSeconds=Number(cooldown);if(cap!==undefined)store.settings.clipSessionCap=Number(cap);if(peakSeconds!==undefined)store.settings.clipHypePeakSeconds=Number(peakSeconds);if(enabled!==undefined)store.settings.autoClipsEnabled=enabled;await persist();res.json(await clipStatus());});
app.post("/api/clips/manual",async(_req,res)=>{if((store.settings.clipTriggers as Record<string,unknown>)?.manual!==true)return res.status(409).json({ok:false,code:"CLIP_DISABLED",error:errorMessages.CLIP_DISABLED});const result=await triggerClip();if(!result.ok)return res.status(409).json({ok:false,code:result.code,error:errorMessages[result.code as ErrorCode],clip:null});res.json({ok:true,clip:lastClip});});
app.post("/api/widgets/:id/moment",async(req,res)=>{const widget=store.widgets.find((item)=>item.id===req.params.id);if(!widget)return res.status(404).json({error:"Widget not found."});const kind=req.body?.kind;if(typeof kind!=="string"||!clipMomentKinds.has(kind))return res.status(400).json({error:"Moment kind is not allow-listed."});const now=Date.now(),last=clipMomentAt.get(widget.id)||0;if(now-last<30_000)return res.status(429).json({error:"Widget moments are limited to one every 30 seconds."});clipMomentAt.set(widget.id,now);if((store.settings.clipTriggers as Record<string,unknown>)?.widgetMoments===true){const result=await triggerClip(`StreamForge ${kind}`);if(!result.ok)return res.status(409).json({ok:false,code:result.code,error:errorMessages[result.code as ErrorCode]});}res.status(202).json({ok:true,accepted:true,kind});});
app.get("/api/sessions",(_req,res)=>res.json({current:sessions.currentSession()||null,sessions:sessions.list(),settings:{autoEndIdleMinutes:store.settings.sessionAutoEndMinutes,includeChatterNames:store.settings.includeChatterNames}}));
app.post("/api/sessions/start",async(_req,res)=>{const session=await sessions.start();publish({type:"session",action:"start",session});res.status(201).json(session);});
app.post("/api/sessions/end",async(_req,res)=>{const session=await sessions.end();if(!session)return res.status(409).json({error:"There is no active session."});publish({type:"session",action:"end",session});res.json(session);});
app.patch("/api/sessions/settings",async(req,res)=>{const idle=req.body?.autoEndIdleMinutes;const names=req.body?.includeChatterNames;if(idle!==undefined&&(!Number.isInteger(Number(idle))||Number(idle)<0||Number(idle)>1440))return res.status(400).json({error:"Auto-end idle time must be 0 to 1440 minutes; zero disables it."});if(names!==undefined&&typeof names!=="boolean")return res.status(400).json({error:"Include chatter names must be on or off."});if(idle!==undefined)store.settings.sessionAutoEndMinutes=Number(idle);if(names!==undefined){store.settings.includeChatterNames=names;if(!names)await sessions.setIncludeNames(false);}await persist();res.json({ok:true,settings:{autoEndIdleMinutes:store.settings.sessionAutoEndMinutes,includeChatterNames:store.settings.includeChatterNames}});});
app.get("/api/sessions/:id/recap.json",(req,res)=>{const session=sessions.get(req.params.id);if(!session)return res.status(404).json({error:"Session not found."});res.json(session);});
app.get("/api/sessions/:id/export.json",(req,res)=>{const session=sessions.get(req.params.id);if(!session)return res.status(404).json({error:"Session not found."});res.setHeader("Content-Disposition",`attachment; filename=streamforge-session-${session.id}.json`);res.json(session);});
app.get("/api/sessions/:id",(req,res)=>{const session=sessions.get(req.params.id);if(!session)return res.status(404).json({error:"Session not found."});res.json(session);});
app.delete("/api/sessions/:id",async(req,res)=>{if(!await sessions.delete(req.params.id))return res.status(404).json({error:"Session not found."});publish({type:"session",action:"delete",id:req.params.id});res.json({ok:true});});
app.post("/api/hype/simulate",(req,res)=>{const energy=Number(req.body?.energy);if(!Number.isInteger(energy)||energy<0||energy>100)return res.status(400).json({error:"Simulated chat energy must be an integer from 0 to 100."});simulatedHypeEnergy=energy;simulatedHypeUntil=Date.now()+15_000;publishHype();res.json({ok:true,simulated:true,expiresAt:new Date(simulatedHypeUntil).toISOString(),hype:hypeSnapshot()});});
app.patch("/api/hype/settings",async(req,res)=>{
  const sensitivity=req.body?.sensitivity;const manualBoost=req.body?.manualBoost;const muted=req.body?.muted;const reactive=req.body?.reactive;const overlayMeter=req.body?.overlayMeter;
  if(sensitivity!==undefined&&!["low","normal","high"].includes(sensitivity))return res.status(400).json({error:"Choose low, normal or high sensitivity."});
  if(manualBoost!==undefined&&(!Number.isFinite(Number(manualBoost))||Number(manualBoost)<-50||Number(manualBoost)>50))return res.status(400).json({error:"Manual boost must be between -50 and 50."});
  for(const value of [muted,reactive,overlayMeter])if(value!==undefined&&typeof value!=="boolean")return res.status(400).json({error:"Hype toggles must be on or off."});
  if(sensitivity!==undefined)store.settings.hypeSensitivity=sensitivity;if(manualBoost!==undefined)store.settings.manualHypeBoost=Math.round(Number(manualBoost));if(muted!==undefined)store.settings.hypeMuted=muted;if(reactive!==undefined)store.settings.hypeReactive=reactive;if(overlayMeter!==undefined)store.settings.overlayHypeMeter=overlayMeter;
  await persist();const hype=hypeSnapshot();publish({type:"hypeSettings",settings:{sensitivity:store.settings.hypeSensitivity,manualBoost:store.settings.manualHypeBoost,muted:store.settings.hypeMuted,reactive:store.settings.hypeReactive,overlayMeter:store.settings.overlayHypeMeter}});publishHype();res.json({ok:true,settings:{sensitivity:store.settings.hypeSensitivity,manualBoost:store.settings.manualHypeBoost,muted:store.settings.hypeMuted,reactive:store.settings.hypeReactive,overlayMeter:store.settings.overlayHypeMeter},hype});
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
function isThemePreset(value:unknown):value is keyof typeof themePresets{return typeof value==="string"&&Object.hasOwn(themePresets,value);}
function sceneList():ScenePreset[]{return [...builtinScenes,...userScenes].map((scene)=>structuredClone(scene));}
async function saveUserScenes():Promise<void>{const temp=`${scenesPath}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(userScenes,null,2),{mode:0o600});await chmod(temp,0o600);await rename(temp,scenesPath);}
function findScene(idOrName:string):ScenePreset|undefined{const normalized=idOrName.trim().toLocaleLowerCase();return [...builtinScenes,...userScenes].find((scene)=>scene.id.toLocaleLowerCase()===normalized||scene.name.toLocaleLowerCase()===normalized);}
let demoActive=false;let demoSnapshot:{enabled:Record<string,boolean>;themePreset:string;themeTokens:ThemeTokens;safeMode:string;hypeSensitivity:string;activeScene:string}|undefined;
async function switchScene(scene:ScenePreset):Promise<void>{
  const previous={enabled:Object.fromEntries(store.widgets.map((widget)=>[widget.id,widget.enabled])),themePreset:store.settings.themePreset,themeTokens:store.settings.themeTokens,safeMode:store.settings.safeMode,hypeSensitivity:store.settings.hypeSensitivity,activeScene:store.settings.activeScene};
  store.settings.sceneUndo=previous;for(const widget of store.widgets)widget.enabled=scene.widgetIds.includes(widget.id);
  applyTheme(scene.theme,themePresets[scene.theme]);store.settings.safeMode=scene.safeMode;if(scene.hypeSensitivity)store.settings.hypeSensitivity=scene.hypeSensitivity;store.settings.activeScene=scene.id;
  await persist();publish({type:"widgets",widgets:store.widgets});publish({type:"safeMode",level:scene.safeMode,motionScale:motionScales[scene.safeMode]});publish({type:"hypeSettings",settings:{sensitivity:store.settings.hypeSensitivity,manualBoost:store.settings.manualHypeBoost,muted:store.settings.hypeMuted,reactive:store.settings.hypeReactive,overlayMeter:store.settings.overlayHypeMeter}});publish({type:"scene",scene:{id:scene.id,name:scene.name,transitionMs:700}});
}
async function undoScene():Promise<boolean>{const snapshot=store.settings.sceneUndo as {enabled?:Record<string,boolean>;themePreset?:string;themeTokens?:ThemeTokens;safeMode?:string;hypeSensitivity?:string;activeScene?:string}|undefined;if(!snapshot?.enabled)return false;for(const widget of store.widgets)if(typeof snapshot.enabled[widget.id]==="boolean")widget.enabled=snapshot.enabled[widget.id];if(isThemePreset(snapshot.themePreset)&&validTheme(snapshot.themeTokens))applyTheme(snapshot.themePreset,snapshot.themeTokens);if(["off","reduced","minimal"].includes(String(snapshot.safeMode)))store.settings.safeMode=snapshot.safeMode;if(["low","normal","high"].includes(String(snapshot.hypeSensitivity)))store.settings.hypeSensitivity=snapshot.hypeSensitivity;store.settings.activeScene=snapshot.activeScene||"";delete store.settings.sceneUndo;await persist();publish({type:"widgets",widgets:store.widgets});const level=String(store.settings.safeMode||"off") as keyof typeof motionScales;publish({type:"safeMode",level,motionScale:motionScales[level]});publish({type:"hypeSettings",settings:{sensitivity:store.settings.hypeSensitivity,manualBoost:store.settings.manualHypeBoost,muted:store.settings.hypeMuted,reactive:store.settings.hypeReactive,overlayMeter:store.settings.overlayHypeMeter}});publish({type:"scene",scene:{id:store.settings.activeScene,name:findScene(String(store.settings.activeScene||""))?.name||"",transitionMs:700}});return true;}
app.get("/api/scenes",(_req,res)=>res.json({scenes:sceneList(),activeScene:store.settings.activeScene||"",canUndo:Boolean(store.settings.sceneUndo)}));
app.post("/api/scenes/:id/apply",async(req,res)=>{const scene=findScene(req.params.id);if(!scene)return res.status(404).json({error:"Scene preset not found."});await switchScene(scene);res.json({ok:true,scene,widgets:store.widgets,transitionMs:700});});
app.post("/api/scenes/undo",async(_req,res)=>{if(!await undoScene())return res.status(409).json({error:"There is no scene switch to undo."});res.json({ok:true,widgets:store.widgets,activeScene:store.settings.activeScene});});
app.post("/api/scenes/duplicate",async(req,res)=>{const source=findScene(typeof req.body?.sourceId==="string"?req.body.sourceId:"");const name=typeof req.body?.name==="string"?req.body.name.replace(/[\u0000-\u001f\u007f]/gu,"").trim().slice(0,40):"";if(!source)return res.status(404).json({error:"Choose a built-in or saved scene to duplicate."});if(!name)return res.status(400).json({error:"Enter a name for the duplicated scene."});const id=`${name.toLocaleLowerCase().replace(/[^a-z0-9]+/gu,"-").replace(/^-|-$/gu,"").slice(0,40)||"scene"}-${randomUUID().slice(0,6)}`;const scene:ScenePreset={...structuredClone(source),id,name,builtIn:false};userScenes.push(scene);await saveUserScenes();res.status(201).json(scene);});
app.patch("/api/scenes/:id",async(req,res)=>{const scene=userScenes.find((item)=>item.id===req.params.id);if(!scene)return res.status(403).json({error:"Built-in scenes are read-only. Duplicate a scene before editing."});const name=typeof req.body?.name==="string"?req.body.name.replace(/[\u0000-\u001f\u007f]/gu,"").trim().slice(0,40):scene.name;const widgetIds=req.body?.widgetIds;const theme=req.body?.theme;const safeMode=req.body?.safeMode;const sensitivity=req.body?.hypeSensitivity===""?undefined:req.body?.hypeSensitivity;if(!name||!Array.isArray(widgetIds)||widgetIds.length>100||!widgetIds.every((id:unknown)=>typeof id==="string"&&store.widgets.some((widget)=>widget.id===id)))return res.status(400).json({error:"Name the scene and choose existing widgets."});if(!isThemePreset(theme)||!["off","reduced","minimal"].includes(safeMode))return res.status(400).json({error:"Choose a theme and Safe Mode level."});if(sensitivity!==undefined&&!(["low","normal","high"].includes(sensitivity)))return res.status(400).json({error:"Hype sensitivity must be low, normal or high."});scene.name=name;scene.widgetIds=[...new Set(widgetIds)];scene.theme=theme;scene.safeMode=safeMode;scene.hypeSensitivity=sensitivity;await saveUserScenes();res.json(scene);});
app.delete("/api/scenes/:id",async(req,res)=>{const index=userScenes.findIndex((scene)=>scene.id===req.params.id);if(index<0)return res.status(403).json({error:"Built-in scenes cannot be deleted."});const [removed]=userScenes.splice(index,1);if(store.settings.activeScene===removed.id)store.settings.activeScene="";await saveUserScenes();await persist();res.json({ok:true});});
app.get("/api/demo/status",(_req,res)=>res.json({active:demoActive}));
app.post("/api/demo/start",async(_req,res)=>{if(demoActive)return res.status(409).json({error:"A demo sequence is already running."});demoSnapshot={enabled:Object.fromEntries(store.widgets.map((widget)=>[widget.id,widget.enabled])),themePreset:String(store.settings.themePreset||"Clean"),themeTokens:structuredClone(store.settings.themeTokens as ThemeTokens),safeMode:String(store.settings.safeMode||"off"),hypeSensitivity:String(store.settings.hypeSensitivity||"normal"),activeScene:String(store.settings.activeScene||"")};demoActive=true;await sessions.markSimulated();publish({type:"demoStatus",active:true});res.json({ok:true,active:true});});
app.post("/api/demo/stop",async(_req,res)=>{if(demoSnapshot){for(const widget of store.widgets)if(typeof demoSnapshot.enabled[widget.id]==="boolean")widget.enabled=demoSnapshot.enabled[widget.id];if(isThemePreset(demoSnapshot.themePreset)&&validTheme(demoSnapshot.themeTokens))applyTheme(demoSnapshot.themePreset,demoSnapshot.themeTokens);if(["off","reduced","minimal"].includes(demoSnapshot.safeMode))store.settings.safeMode=demoSnapshot.safeMode;if(["low","normal","high"].includes(demoSnapshot.hypeSensitivity))store.settings.hypeSensitivity=demoSnapshot.hypeSensitivity;store.settings.activeScene=demoSnapshot.activeScene;await persist();publish({type:"widgets",widgets:store.widgets});publish({type:"safeMode",level:store.settings.safeMode,motionScale:motionScales[store.settings.safeMode as keyof typeof motionScales]});publish({type:"hypeSettings",settings:{sensitivity:store.settings.hypeSensitivity,manualBoost:store.settings.manualHypeBoost,muted:store.settings.hypeMuted,reactive:store.settings.hypeReactive,overlayMeter:store.settings.overlayHypeMeter}});publish({type:"scene",scene:{id:store.settings.activeScene,name:findScene(String(store.settings.activeScene||""))?.name||"",transitionMs:700}});}demoSnapshot=undefined;demoActive=false;publish({type:"demoStatus",active:false});res.json({ok:true,active:false});});
app.post("/api/demo/natural20",async(_req,res)=>{if(!demoActive)return res.status(409).json({error:"Start the demo sequence first."});await sessions.markSimulated();publish({type:"event",event:{type:"demo-natural20",payload:{simulated:true},simulated:true,at:new Date().toISOString()}});res.json({ok:true,simulated:true});});
app.post("/api/demo/replayed-build",async(_req,res)=>{if(!demoActive)return res.status(409).json({error:"Start the demo sequence first."});const request={id:"simulated-build",text:"A cozy stream celebration widget",requester:"Demo Director",source:"demo",status:"live",createdAt:new Date().toISOString(),simulated:true};for(const stage of ["Received","Approved","Planning","Writing code","Safety checks","Live"]){publish({type:"buildFeed",request,stage,detail:"SIMULATED · replayed build activity; no code runner was started",at:new Date().toISOString()});}res.json({ok:true,simulated:true});});
app.patch("/api/theme", async (req,res)=>{
  const preset=typeof req.body?.preset==="string"?req.body.preset:"";
  if(!isThemePreset(preset))return res.status(400).json({error:"Choose Halloween, Neon, Cozy, Retro or Clean."});
  const tokens=req.body?.tokens===undefined?themePresets[preset as keyof typeof themePresets]:req.body.tokens;
  if(!validTheme(tokens))return res.status(400).json({error:"Theme tokens are invalid. Use safe hex colors, bounded values and an approved system font."});
  applyTheme(preset,tokens);await persist();res.json({ok:true,preset,tokens});
});
app.post("/api/theme/contrast-fix",async(_req,res)=>{
  const tokens=store.settings.themeTokens as ThemeTokens;if(!validTheme(tokens))return res.status(409).json({error:"Current theme tokens are invalid."});
  const fixed={...tokens,text:nearestAccessibleText(tokens.text,tokens.background)};applyTheme(String(store.settings.themePreset||"Clean"),fixed);await persist();res.json({ok:true,tokens:fixed,ratio:Number(contrastRatio(fixed.text,fixed.background).toFixed(2))});
});
const motionScales={off:1,reduced:.5,minimal:.15} as const;
app.patch("/api/safe-mode",async(req,res)=>{
  const level=req.body?.level as keyof typeof motionScales;if(!Object.hasOwn(motionScales,level))return res.status(400).json({error:"Choose Safe Mode off, reduced or minimal."});
  store.settings.safeMode=level;await persist();publish({type:"safeMode",level,motionScale:motionScales[level]});res.json({ok:true,level,motionScale:motionScales[level]});
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
    const passport=await widgetPassport(widget,code);
    const libraryEntry=store.library.find((item)=>item.widgetId===widget.id);
    const request=store.requestHistory.find((item)=>item.widgetId===widget.id);
    const artifact={format:"sfwidget",version:1,id:widget.id,meta:declaredMeta,code,originalPrompt:libraryEntry?.originalPrompt||request?.text||"Imported StreamForge widget.",creator:libraryEntry?.creator||"StreamForge",widgetVersion:(await widgetCommitHistory(widget.id)).length,passport};
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
  const passport=await widgetPassport({id:"passport-temp",title,width,height,x,y,anchor,description,enabled:true},artifact.code,result);
  const widgetId=`import-${randomUUID().slice(0,8)}`;const importId=randomUUID();const draftDir=path.join(dataDir,"drafts",importId);let promoted=false;
  try{
    await mkdir(draftDir,{recursive:true});const draftPath=path.join(draftDir,"index.js");await writeWidgetFile(draftPath,artifact.code,{mode:0o600});
    const targetDir=path.join(widgetRoot,widgetId);await mkdir(targetDir,{recursive:true});const target=path.join(targetDir,"index.js");const temp=`${target}.${importId}.tmp`;await copyFile(draftPath,temp);await chmod(temp,0o600);await rename(temp,target);promoted=true;
    if(widgetRoot===path.join(root,"widgets")){execFileSync("git",["add","--",`widgets/${widgetId}/index.js`],{cwd:root,stdio:"ignore"});execFileSync("git",["commit","-m",`Import widget ${widgetId}`],{cwd:root,stdio:"ignore"});}
    const safeCreator=typeof artifact.creator==="string"?artifact.creator.replace(/[^\p{L}\p{N} _.-]/gu,"").trim().slice(0,40):"Imported";
    const entry:LibraryEntry={id:widgetId,widgetId,title,description,originalPrompt:typeof artifact.originalPrompt==="string"?artifact.originalPrompt.slice(0,300):"Imported StreamForge widget.",creator:safeCreator||"Imported",codeHash,passport};
    store.library.push(entry);store.widgets.push({id:widgetId,title,description,width,height,x,y,anchor,enabled:true,passport});await persist();publish({type:"widgets",widgets:store.widgets});
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
  store.codexVerification = await verifyCodex();
  await persist();
  res.json(store.codexVerification);
});
const transitions: Record<BuildState, BuildState[]> = {
  queued: ["approved", "failed"], approved: ["building", "failed"], building: ["checking", "failed", "rolled_back"], checking: ["live", "failed", "rolled_back"], live: ["rolled_back"], failed: [], rolled_back: [],
};
function setState(request: Request, next: BuildState): void {
  if (!transitions[request.status].includes(next)) throw new Error(`invalid_transition:${request.status}:${next}`);
  request.status = next; request.updatedAt = new Date().toISOString();
  if(next==="approved")void sessions.record("approvals");if(next==="rolled_back")void sessions.record("rollbacks");
  const index = store.requestHistory.findIndex((item) => item.id === request.id);
  if (index < 0) store.requestHistory.unshift({ ...request }); else store.requestHistory[index] = { ...request };
}
function buildFeed(request: Request, stage: string, detail: string, checks?: unknown): void {
  publish({ type: "buildFeed", request: publicRequest(request), stage, detail, checks, at: new Date().toISOString() });
}
async function createRequest(text: string, requester: string, source: string, kind: "build" | "remix" = "build", widgetId?: string, language?:{script:string;english:boolean;manualReview:boolean}): Promise<Request> {
  const request: Request = { id: randomUUID(), text, requester, source, status: "queued", createdAt: new Date().toISOString(), votes: 0, voterIds: [], kind, widgetId, script:language?.script||"Latin", manualReview:language?.manualReview===true&&store.settings.nonEnglishManualApproval===true, languageInstruction:language&&!language.english?`Keep visible widget text in the requester's ${language.script} language when it fits. Keep code identifiers and comments in English.`:undefined };
  store.requests.unshift(request); store.requestHistory.unshift({ ...request });
  void sessions.record("requests");if(kind==="remix")void sessions.record("remixes");
  await persist(); publish({ type: "request", request: publicRequest(request) });
  buildFeed(request, "Received", "Request added to the queue");
  return request;
}
async function mockBuild(request: Request): Promise<void> {
  const buildStartedAt=Date.now();
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
    const promotedWidget=store.widgets.find((item)=>item.id===widgetId);if(promotedWidget){promotedWidget.passport=await widgetPassport(promotedWidget,source,result);const libraryEntry=store.library.find((item)=>item.widgetId===widgetId);if(libraryEntry)libraryEntry.passport=promotedWidget.passport;}
    setState(request, "live"); void sessions.recordBuild(buildStartedAt); buildFeed(request, "Live", "Widget passed checks and is ready on the overlay", result.checks);
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
async function codexBuild(request: Request): Promise<void> {
  const buildStartedAt = Date.now();
  const isRemix = request.kind === "remix";
  const widgetId = isRemix ? request.widgetId || "" : `community-${request.id.slice(0, 8)}`;
  const targetPath = path.join(widgetRoot, widgetId, "index.js");
  const draftDirectory = path.join(dataDir, ".drafts", widgetId, request.id);
  const outputPath = path.join(draftDirectory, "index.js");
  const events: RecordedBuildEvent[] = [];
  let originalSource = "";
  let checkpointRef: string | undefined;
  let promoted = false;
  let sourceCommitted = false;
  let succeeded = false;
  let finalChecks: { syntax: boolean; network: boolean; forbiddenApis: boolean; mockMount: boolean } | undefined;

  const emit = (stage: string, detail: string, checks?: { syntax: boolean; network: boolean; forbiddenApis: boolean; mockMount: boolean }) => {
    const safeDetail = redactDisplay(detail).slice(0, 240);
    buildFeed(request, stage, safeDetail, checks);
    events.push({ stage, detail: safeDetail, checks, at: new Date().toISOString() });
  };

  try {
    if (isRemix) {
      if (!store.widgets.some((item) => item.id === widgetId) || !/^[a-z0-9-]{1,80}$/u.test(widgetId)) throw Object.assign(new Error(), { code: "CODEX_BAD_OUTPUT" });
      const status = execFileSync("git", ["status", "--porcelain", "--", path.relative(root, targetPath)], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      if (status.trim()) throw Object.assign(new Error(), { code: "CODEX_BAD_OUTPUT" });
      originalSource = await readFile(targetPath, "utf8");
    }
    if (widgetRoot === path.join(root, "widgets")) {
      execFileSync("git", ["diff", "--cached", "--quiet"], { cwd: root, stdio: "ignore" });
      const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      checkpointRef = `refs/streamforge/checkpoints/${request.id}`;
      execFileSync("git", ["update-ref", checkpointRef, head], { cwd: root, stdio: "ignore" });
    }
    setState(request, "building");
    emit("Approved", "Request approved for the Codex runner.");
    await persist();
    const widgetApiDocumentation = await readFile(path.join(root, "docs/WIDGET_API.md"), "utf8");
    const result = await runCodexWidgetBuild({
      draftDirectory,
      outputPath,
      widgetApiDocumentation,
      request: request.text,
      languageInstruction: request.languageInstruction,
      existingSource: originalSource || undefined,
      timeoutSeconds: Number(store.settings.buildTimeoutSeconds) || 120,
      retryOnce: store.settings.retryFailedBuildOnce === true,
      checkSource: checkWidgetSource,
      onProgress: ({ stage, detail }) => emit(stage, detail),
      onSafePreview: (source) => {
        safeDrafts.set(request.id, source);
        publish({ type: "draftPreview", request: publicRequest(request), requestId: request.id, url: `/api/requests/${request.id}/preview`, widgetId });
      },
    });
    if (request.status === "building") setState(request, "checking");
    finalChecks = { syntax: true, network: true, forbiddenApis: true, mockMount: true };
    emit("Safety checks", `Draft passed all checks in ${Math.round(result.elapsedMs / 1000)} seconds. Preview - not live yet.`, finalChecks);

    await mkdir(path.dirname(targetPath), { recursive: true });
    const promoteTemp = `${targetPath}.${request.id}.tmp`;
    await writeWidgetFile(promoteTemp, result.source, { mode: 0o600 });
    await chmod(promoteTemp, 0o600);
    await rename(promoteTemp, targetPath);
    promoted = true;

    if (widgetRoot === path.join(root, "widgets")) {
      execFileSync("git", ["add", "--", path.relative(root, targetPath)], { cwd: root, stdio: "ignore" });
      execFileSync("git", ["commit", "-m", `Codex build widget ${widgetId}`], { cwd: root, stdio: "ignore" });
      sourceCommitted = true;
    }
    if (!isRemix) {
      store.widgets.push({ id: widgetId, ...result.meta, enabled: true, passport: undefined });
    }
    const widget = store.widgets.find((item) => item.id === widgetId);
    if (!widget) throw Object.assign(new Error(), { code: "CODEX_BAD_OUTPUT" });
    widget.title = result.meta.title;
    widget.description = result.meta.description;
    widget.width = result.meta.width;
    widget.height = result.meta.height;
    widget.x = result.meta.x;
    widget.y = result.meta.y;
    widget.anchor = result.meta.anchor;
    widget.enabled = true;
    widget.passport = await widgetPassport(widget, result.source);
    if (checkpointRef) {
      execFileSync("git", ["update-ref", "-d", checkpointRef], { cwd: root, stdio: "ignore" });
      checkpointRef = undefined;
    }
    if (request.status === "checking") setState(request, "live");
    succeeded = true;
    void sessions.recordBuild(buildStartedAt);
    emit("Live", "Widget passed checks and is ready on the overlay.", finalChecks);
    await persist();
    publish({ type: "widgets", widgets: store.widgets });
  } catch (error) {
    if (promoted) {
      if (isRemix && originalSource) {
        const restorePath = `${targetPath}.${request.id}.rollback`;
        await writeWidgetFile(restorePath, originalSource, { mode: 0o600 }).catch(() => undefined);
        await rename(restorePath, targetPath).catch(() => undefined);
      } else {
        await rm(path.dirname(targetPath), { recursive: true, force: true }).catch(() => undefined);
        store.widgets = store.widgets.filter((widget) => widget.id !== widgetId);
      }
      if (widgetRoot === path.join(root, "widgets")) {
        try {
          execFileSync("git", ["reset", "--", path.relative(root, targetPath)], { cwd: root, stdio: "ignore" });
          if (sourceCommitted) {
            execFileSync("git", ["add", "--", path.relative(root, targetPath)], { cwd: root, stdio: "ignore" });
            execFileSync("git", ["commit", "-m", `Rollback failed Codex build ${widgetId}`], { cwd: root, stdio: "ignore" });
          }
        } catch { /* filesystem restore remains the primary rollback */ }
      }
    }
    const code = (error as CodexRunnerError)?.code;
    request.failure = code ? codexFailureMessage(error as CodexRunnerError) : "Codex could not complete the widget build.";
    if (["building", "checking", "live"].includes(request.status)) setState(request, "rolled_back");
    else if (request.status === "approved") setState(request, "failed");
    emit("Rolled back", request.failure);
    await persist();
  } finally {
    safeDrafts.delete(request.id);
    await rm(draftDirectory, { recursive: true, force: true }).catch(() => undefined);
    if (checkpointRef) execFileSync("git", ["update-ref", "-d", checkpointRef], { cwd: root, stdio: "ignore" });
    try {
      await writeBuildRecording(replayDir, {
        request: { text: redactDisplay(request.text).slice(0, 300), kind: request.kind || "build" },
        events,
        status: succeeded ? "live" : request.status === "rolled_back" ? "rolled_back" : "failed",
        ...(succeeded ? { widgetId } : {}),
      });
    } catch {
      buildFeed(request, "Safety checks", "The build finished, but its local replay record could not be saved.");
    }
    setTimeout(() => safeDrafts.delete(request.id), 5 * 60_000).unref();
  }
}

async function replayBuild(request: Request): Promise<void> {
  const recording = await latestSuccessfulBuildRecording(replayDir);
  if (!recording || !recording.widgetId || !/^[a-z0-9-]{1,80}$/u.test(recording.widgetId)) {
    request.failure = "No successful build recording is available. Run a real build first.";
    setState(request, "failed");
    buildFeed(request, "Rolled back", request.failure);
    await persist();
    return;
  }
  try {
    const sourcePath = path.join(widgetRoot, recording.widgetId, "index.js");
    const source = await readFile(sourcePath, "utf8");
    const check = await checkWidgetSource(source);
    const meta = parseCodexWidgetMeta(source);
    if (!check.ok || !meta) throw new Error("REPLAY_WIDGET_INVALID");
    setState(request, "building");
    const publishReplay = (stage: string, detail: string, checks?: unknown) => {
      publish({ type: "buildFeed", request: { ...publicRequest(request), simulated: true, source: "replay" }, stage, detail: redactDisplay(detail), checks, at: new Date().toISOString() });
    };
    publishReplay("Approved", "DEMO MODE · playing a recorded build feed.");
    for (const event of recording.events) {
      if (!["Planning", "Writing code", "Safety checks", "Live"].includes(event.stage)) continue;
      if (event.stage === "Safety checks" && request.status === "building") setState(request, "checking");
      if (event.stage !== "Live") publishReplay(event.stage, `DEMO MODE · ${event.detail}`, event.checks);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    if (request.status === "building") setState(request, "checking");
    let widget = store.widgets.find((item) => item.id === recording.widgetId);
    if (!widget) {
      widget = { id: recording.widgetId, ...meta, enabled: true };
      store.widgets.push(widget);
    }
    widget.enabled = true;
    widget.passport = await widgetPassport(widget, source, check);
    setState(request, "live");
    publishReplay("Live", "DEMO MODE · recorded widget is active; no Codex task was started.", check.checks);
    await persist();
    publish({ type: "widgets", widgets: store.widgets });
  } catch {
    request.failure = "The recorded widget is unavailable or failed the safety checks.";
    if (["building", "checking"].includes(request.status)) setState(request, "rolled_back");
    else if (request.status === "approved") setState(request, "failed");
    buildFeed(request, "Rolled back", request.failure);
    await persist();
  }
}
let buildChain: Promise<void> = Promise.resolve();
function runBuild(request: Request): Promise<void> {
  const mode = String(store.settings.buildMode || "mock");
  const runner = mode === "codex" ? codexBuild : mode === "replay" ? replayBuild : mockBuild;
  buildChain = buildChain.then(() => runner(request));
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
  widget.passport=await widgetPassport(widget,source,check);const libraryEntry=store.library.find((item)=>item.widgetId===widgetId);if(libraryEntry)libraryEntry.passport=widget.passport;await persist();
  publish({ type: "widgets", widgets: store.widgets });
  void sessions.record("rollbacks");
  return { ok: true };
}
setInterval(() => {
  if (store.settings.approval !== "auto-votes") return;
  const seconds = Number(store.settings.autoBuildSeconds || 0);
  if (seconds <= 0) return;
  const next = store.requests.filter((item) => item.status === "queued"&&!item.manualReview).sort((a,b)=>(b.votes||0)-(a.votes||0)||a.createdAt.localeCompare(b.createdAt))[0];
  if (!next || Date.now() - Date.parse(next.createdAt) < seconds * 1000) return;
  setState(next, "approved");
  publish({type:"queue",requests:store.requests.filter((item)=>item.status==="queued").map(publicRequest)});
  void persist().then(() => runBuild(next));
}, 1000);
app.post("/api/requests", async (req, res) => {
  const candidate = typeof req.body?.text === "string" ? req.body.text : "";
  const validation=validateRequestText(candidate);if(!validation.ok)return res.status(400).json({error:validation.reason});const text=validation.language!.normalized;
  if (store.requests.filter((item) => item.status === "queued").length >= 100) return res.status(429).json({ error: recordError("QUEUE_FULL") });
  const request = await createRequest(text, "Dashboard", "dashboard");
  res.status(201).json(publicRequest(request));
});
app.post("/api/chat", async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.normalize("NFKC").replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu,"").replace(/[\u0000-\u001f\u007f-\u009f\u00ad]/gu," ").replace(/\s+/gu," ").trim().slice(0, 500) : "";
  const userId = typeof req.body?.userId === "string" ? req.body.userId.slice(0, 100) : "";
  const login = typeof req.body?.login === "string" ? req.body.login.slice(0, 40) : "";
  if (!message || !userId || req.body?.isBot === true || /(?:bot|nightbot|streamelements|moobot)$/iu.test(login)) return res.json({ ok: true, ignored: true });
  const commandName=/^\s*([!/?][\p{L}\p{N}_-]+)/u.exec(message)?.[1];void sessions.recordChat(userId,commandName,login||"Viewer",store.settings.includeChatterNames===true);
  const anonymousPlayer=`Player ${createHash("sha256").update(`${anonymousSessionSalt}:${userId}`).digest("hex").slice(0,5)}`;
  const emoteCount=Number.isInteger(req.body?.emoteCount)&&req.body.emoteCount>=0?Math.min(200,req.body.emoteCount):undefined;hypeEngine.addChat(createHash("sha256").update(`${anonymousSessionSalt}:${userId}`).digest("hex"),message,Date.now(),emoteCount);publishHype();
  publish({ type: "event", event: { type: "chat", payload: { message: redactDisplay(message), user: anonymousPlayer, isMod:req.body?.isMod===true }, simulated: req.body?.simulated === true, at: new Date().toISOString() } });
  const buildMatch = /^!build\s+(.+)$/iu.exec(message);
  if (buildMatch) {
    const lastBuildAt = recentBuilds.get(userId) || 0;
    if (Date.now() - lastBuildAt < 30_000) return res.status(429).json({ ok: false, reason: "Please wait before submitting another request." });
    const validation=validateRequestText(buildMatch[1]);const requestText=validation.language?.normalized||"";
    if (validation.ok) {
      recentBuilds.set(userId, Date.now());
      await createRequest(requestText, "Chat viewer", "chat","build",undefined,{...validation.language!,manualReview:validation.language!.manualReview&&req.body?.isMod!==true});
    }
  }
  const remixCommand = /^!remix\s+(.+)$/iu.exec(message);
  if (remixCommand) {
    const lastBuildAt = recentBuilds.get(userId) || 0;
    if (Date.now() - lastBuildAt < 30_000) return res.status(429).json({ ok: false, reason: "Please wait before submitting another request." });
    const body = remixCommand[1];
    const widget = [...store.widgets].sort((a,b)=>b.title.length-a.title.length).find((item)=>body.toLocaleLowerCase().startsWith(`${item.title.toLocaleLowerCase()} `) || body.toLocaleLowerCase().startsWith(`${item.id.toLocaleLowerCase()} `));
    if (!widget) return res.status(400).json({ ok: false, reason: "Name a widget from the current scene, followed by the requested change." });
    const validation=validateRequestText(body.slice(body.toLocaleLowerCase().startsWith(`${widget.id.toLocaleLowerCase()} `) ? widget.id.length : widget.title.length));
    if (!validation.ok) return res.status(400).json({ok:false,reason:"Enter a safe change of up to 300 characters and avoid blocked content."});const change=validation.language!.normalized;
    recentBuilds.set(userId, Date.now());
    await createRequest(change, "Chat viewer", "chat", "remix", widget.id,{...validation.language!,manualReview:validation.language!.manualReview&&req.body?.isMod!==true});
  }
  const voteMatch = /^(?:!vote\s+(\d+)|vote\s+(\d+)|\+1)$/iu.exec(message);
  if (voteMatch) {
    const queued = store.requests.filter((item) => item.status === "queued").sort((a, b) => (b.votes || 0) - (a.votes || 0) || a.createdAt.localeCompare(b.createdAt));
    const position = voteMatch[1] || voteMatch[2] ? Number(voteMatch[1] || voteMatch[2]) : 1;
    const request = queued[position - 1];
    if (request && !request.voterIds?.includes(userId)) {
      request.voterIds = [...(request.voterIds || []), userId]; request.votes = (request.votes || 0) + 1;
      void sessions.record("votes");
      const history = store.requestHistory.find((item) => item.id === request.id); if (history) Object.assign(history, request);
      await persist(); publish({ type: "queue", requests: queued.map(publicRequest) });
      const threshold = Number(store.settings.autoBuildVotes || 0);
      if (threshold > 0 && request.votes >= threshold && store.settings.approval === "auto-votes"&&!request.manualReview) { setState(request, "approved"); await persist(); publish({type:"queue",requests:queued.map(publicRequest)}); await runBuild(request); }
    }
  }
  const undoMatch = /^!?undo\s+([a-z0-9-]{1,80})$/iu.exec(message);
  if (undoMatch && req.body?.isMod === true) {
    const result = await undoWidget(undoMatch[1]);
    publish({ type: "moderation", message: result.ok ? "Widget version restored." : result.reason });
  }
  const themeMatch=/^!theme\s+(Halloween|Neon|Cozy|Retro|Clean)$/iu.exec(message);
  if(themeMatch&&req.body?.isMod===true){const preset=Object.keys(themePresets).find((name)=>name.toLowerCase()===themeMatch[1].toLowerCase())!;applyTheme(preset,themePresets[preset as keyof typeof themePresets]);await persist();}
  const safeModeMatch=/^!safe-mode\s+(off|reduced|minimal)$/iu.exec(message);
  if(safeModeMatch&&req.body?.isMod===true){const level=safeModeMatch[1].toLowerCase() as keyof typeof motionScales;store.settings.safeMode=level;await persist();publish({type:"safeMode",level,motionScale:motionScales[level]});}
  const sceneMatch=/^!?scene\s+(.+)$/iu.exec(message);if(sceneMatch&&req.body?.isMod===true){const scene=findScene(sceneMatch[1]);if(scene)await switchScene(scene);else publish({type:"moderation",message:"Scene not found. Check the saved scene names."});}
  if(/^!?clip$/iu.test(message)&&req.body?.isMod===true){if((store.settings.clipTriggers as Record<string,unknown>)?.moderatorCommand===true){const result=await triggerClip();publish({type:"moderation",message:result.ok?"Clip created and ready to review.":errorMessages[result.code as ErrorCode]});}else publish({type:"moderation",message:errorMessages.CLIP_DISABLED});}
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
  const change = typeof req.body?.change === "string" ? req.body.change : "";
  if (!widget) return res.status(404).json({error:"Widget not found."});
  if (!change) return res.status(400).json({error:"Describe the change to request."});
  const validation=validateRequestText(change);if (!validation.ok) return res.status(400).json({error:"That change needs manual moderator review."});
  const request=await createRequest(validation.language!.normalized,"Dashboard","dashboard","remix",widget.id,validation.language);
  res.status(201).json(publicRequest(request));
});
app.patch("/api/settings", async (req, res) => {
  const approval = req.body?.approval;
  if (approval !== undefined && !["manual", "auto-votes", "auto-points"].includes(approval)) return res.status(400).json({ error: "Choose manual, vote threshold, or channel points." });
  const votes = req.body?.autoBuildVotes === undefined ? undefined : Number(req.body.autoBuildVotes);
  const seconds = req.body?.autoBuildSeconds === undefined ? undefined : Number(req.body.autoBuildSeconds);
  const buildTimeoutSeconds = req.body?.buildTimeoutSeconds === undefined ? undefined : Number(req.body.buildTimeoutSeconds);
  const retryFailedBuildOnce = req.body?.retryFailedBuildOnce === undefined ? undefined : req.body.retryFailedBuildOnce;
  const nonEnglishManualApproval=req.body?.nonEnglishManualApproval===undefined?undefined:req.body.nonEnglishManualApproval;
  if (votes !== undefined && (!Number.isInteger(votes) || votes < 1 || votes > 1000)) return res.status(400).json({ error: "Vote threshold must be from 1 to 1000." });
  if (seconds !== undefined && (!Number.isInteger(seconds) || seconds < 0 || seconds > 86400)) return res.status(400).json({ error: "Build timer must be from 0 to 86400 seconds." });
  if (buildTimeoutSeconds !== undefined && (!Number.isInteger(buildTimeoutSeconds) || buildTimeoutSeconds < 15 || buildTimeoutSeconds > 600)) return res.status(400).json({ error: "Build timeout must be from 15 to 600 seconds." });
  if (retryFailedBuildOnce !== undefined && typeof retryFailedBuildOnce !== "boolean") return res.status(400).json({ error: "Retry setting must be on or off." });
  if(nonEnglishManualApproval!==undefined&&typeof nonEnglishManualApproval!=="boolean")return res.status(400).json({error:"Non-English manual approval setting must be on or off."});
  if (approval !== undefined) store.settings.approval = approval;
  if (votes !== undefined) store.settings.autoBuildVotes = votes;
  if (seconds !== undefined) store.settings.autoBuildSeconds = seconds;
  if (buildTimeoutSeconds !== undefined) store.settings.buildTimeoutSeconds = buildTimeoutSeconds;
  if (retryFailedBuildOnce !== undefined) store.settings.retryFailedBuildOnce = retryFailedBuildOnce;
  if(nonEnglishManualApproval!==undefined)store.settings.nonEnglishManualApproval=nonEnglishManualApproval;
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
app.post("/api/simulate/:event", async (req, res) => {
  const allowed = new Set(["chat", "follow", "sub", "raid", "redeem"]);
  if (!allowed.has(req.params.event)) return res.status(400).json({ error: "Unsupported simulated event." });
  const eventType = req.params.event;
  if (eventType === "chat") {
    const commands = Array.isArray(req.body?.commands) ? req.body.commands.slice(0,10).map(String) : [String(req.body?.message || "")];
    for (const message of commands) {
      hypeEngine.addChat("simulated-viewer", message);
      const commandName = /^\s*([!/?][\p{L}\p{N}_-]+)/u.exec(message)?.[1];
      void sessions.recordChat("simulated-viewer", commandName, "Simulated viewer", store.settings.includeChatterNames === true);
    }
    publishHype();
    for (const message of commands) publish({ type: "event", event: { type: "chat", payload: { message: String(message).slice(0,100), user: "Player abc12", isMod: true }, simulated: true, at: new Date().toISOString() } });
  } else {
    await dispatchStreamEvent(eventType as "follow" | "sub" | "raid" | "redeem", req.body ?? {}, true);
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
app.get("/auth/twitch", (req, res) => {
  if (!liveTwitchEnabled(process.env)) return res.status(503).send("Live Twitch is disabled. Set TWITCH_LIVE_ENABLED=true to authorize.");
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET || !process.env.TWITCH_CHANNEL) {
    return res.status(503).send("Add TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET and TWITCH_CHANNEL to .env before authorizing Twitch.");
  }
  res.redirect(twitchOAuth.createAuthorizationUrl(req.query.enableClips === "1"));
});
app.get("/auth/twitch/callback", async (req, res) => {
  if (!liveTwitchEnabled(process.env)) return res.status(503).send("Live Twitch is disabled.");
  if (typeof req.query.error === "string") return res.status(400).send("Twitch authorization was not completed. Return to Settings to try again.");
  if (typeof req.query.code !== "string" || typeof req.query.state !== "string") return res.status(400).send("Twitch authorization response was incomplete.");
  try {
    const identity = await twitchOAuth.completeAuthorization(req.query.code, req.query.state);
    await twitchTokenStore.save(identity);
    await connectTwitchChat();
    await connectTwitchEventSub();
    res.type("html").send("<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>Twitch authorized</title><body><h1>Twitch authorized</h1><p>Your credentials were validated and saved locally. Return to StreamForge.</p><p><a href=\"/dashboard/#settings\">Open Settings</a></p></body></html>");
  } catch (error) {
    const reason = String((error as Error).message || "");
    const message = reason.startsWith("OAUTH_SCOPE_MISSING:")
      ? `Twitch did not grant the required permissions: ${reason.slice("OAUTH_SCOPE_MISSING:".length)}. Reconnect and approve each permission.`
      : "Twitch authorization could not be completed. Check your app settings and reconnect.";
    res.status(400).send(message);
  }
});

const http = createServer(app);
const wss = new WebSocketServer({ server: http, path: "/ws" });
const clients = new Set<WebSocket>();
wss.on("connection", (socket) => { clients.add(socket); socket.on("close", () => clients.delete(socket)); socket.send(JSON.stringify({ type: "hello", at: new Date().toISOString() })); });
function publish(payload: unknown): void {
  const message = JSON.stringify(payload);
  for (const client of clients) if (client.readyState === WebSocket.OPEN) client.send(message);
}
setInterval(()=>publishHype(),1000).unref();
setInterval(()=>{void sessions.autoEnd(Number(store.settings.sessionAutoEndMinutes)||0).then((ended)=>{if(ended)publish({type:"session",action:"auto-end"});}).catch(()=>{});},60_000).unref();

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
  if (liveTwitchEnabled(process.env) && twitchTokenStore.identity) {
    void connectTwitchChat();
    void connectTwitchEventSub();
  }
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
