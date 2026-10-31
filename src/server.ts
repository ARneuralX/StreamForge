import express from "express";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rename, chmod, mkdtemp, rm, copyFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { writeFile as writeWidgetFile } from "node:fs/promises";
import { WebSocketServer, WebSocket } from "ws";
import { checkWidgetSource } from "./security/widget-checks.js";

type BuildState = "queued" | "approved" | "building" | "checking" | "live" | "failed" | "rolled_back";
type Request = { id: string; text: string; requester: string; source: string; status: BuildState; createdAt: string; updatedAt?: string; votes?: number; voterIds?: string[]; failure?: string; kind?: "build" | "remix"; widgetId?: string };
type WidgetMeta = { id: string; title: string; description: string; width: number; height: number; x: number; y: number; anchor: string; enabled: boolean; position?: { x: number; y: number }; versionCount?: number; canUndo?: boolean };
type LibraryEntry = { id: string; widgetId: string; title: string; description: string; originalPrompt: string; creator: string };
type Store = { requests: Request[]; requestHistory: Request[]; widgets: WidgetMeta[]; library: LibraryEntry[]; settings: Record<string, unknown>; codexVerification?: { time: string; ok: boolean; error?: string } };

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
  { id: "boss-bar", title: "Boss Bar", description: "Chat attacks with !attack.", width: 500, height: 180, x: 0, y: 0, anchor: "bottom-left", enabled: true },
  { id: "screen-effects", title: "Celebration Effects", description: "Celebrate follows, subs and raids.", width: 420, height: 260, x: 0, y: 0, anchor: "center", enabled: true },
  { id: "welcome-banner", title: "Welcome Banner", description: "A friendly message for new followers.", width: 460, height: 110, x: 0, y: 0, anchor: "bottom-right", enabled: true },
];
const librarySeed: LibraryEntry[] = starterWidgets.map((widget) => ({ id: widget.id, widgetId: widget.id, title: widget.title, description: widget.description, originalPrompt: `Create a polished ${widget.title.toLowerCase()} overlay using only the StreamForge Widget API.`, creator: "StreamForge" }));
const defaultStore: Store = { requests: [], requestHistory: [], widgets: starterWidgets, library: librarySeed, settings: { approval: process.env.APPROVAL || "manual", buildMode: process.env.BUILD_MODE || "mock", autoBuildVotes: 5, autoBuildSeconds: 0 } };
let store: Store;
try { store = JSON.parse(await readFile(storePath, "utf8")) as Store; }
catch { store = defaultStore; }
if (!Array.isArray(store.widgets) || store.widgets.length === 0) store.widgets = starterWidgets;
if (!Array.isArray(store.requestHistory)) store.requestHistory = [...store.requests];
if (!Array.isArray(store.library)) store.library = librarySeed;
store.settings = { ...defaultStore.settings, ...(store.settings || {}) };

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
async function widgetCommitHistory(widgetId: string): Promise<string[]> {
  if (!/^[a-z0-9-]{1,80}$/u.test(widgetId) || widgetRoot !== path.join(root, "widgets")) return [];
  try {
    return execFileSync("git", ["log", "--follow", "--format=%H", "--", `widgets/${widgetId}/index.js`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split(/\r?\n/u).filter(Boolean);
  } catch { return []; }
}
const recentBuilds = new Map<string, number>();
const blocklist = [/\bmalware\b/iu, /\bsteal\s+(?:a\s+)?token\b/iu, /\bkeylogger\b/iu];

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
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

app.get("/api/health", (_req, res) => res.json({ ok: true, buildMode: store.settings.buildMode, twitch: { enabled: process.env.TWITCH_LIVE_ENABLED === "true", chat: "needs_setup", eventSub: "needs_setup" }, codex: store.codexVerification?.ok ? { state: "verified", time: store.codexVerification.time } : { state: "needs_setup" } }));
app.get("/api/state", async (_req, res) => {
  const widgets = await Promise.all(store.widgets.map(async (widget) => { const versions = await widgetCommitHistory(widget.id); return { ...widget, versionCount: versions.length, canUndo: versions.length > 1 }; }));
  res.json({ requests: store.requests.map(publicRequest), requestHistory: store.requestHistory.map(publicRequest), widgets, settings: store.settings, codexVerification: store.codexVerification });
});
app.get("/api/library", (_req, res) => res.json(store.library));
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
  if (!text) return res.status(400).json({ error: "Enter a widget request first." });
  if (blocklist.some((rule) => rule.test(text))) return res.status(400).json({ error: "That request needs a manual moderator review." });
  const request = await createRequest(text, "Dashboard", "dashboard");
  res.status(201).json(publicRequest(request));
});
app.post("/api/chat", async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 500) : "";
  const userId = typeof req.body?.userId === "string" ? req.body.userId.slice(0, 100) : "";
  const login = typeof req.body?.login === "string" ? req.body.login.slice(0, 40) : "";
  if (!message || !userId || req.body?.isBot === true || /(?:bot|nightbot|streamelements|moobot)$/iu.test(login)) return res.json({ ok: true, ignored: true });
  publish({ type: "event", event: { type: "chat", payload: { message: redactDisplay(message), user: "Chat viewer" }, simulated: req.body?.simulated === true, at: new Date().toISOString() } });
  const buildMatch = /^!build\s+(.+)$/iu.exec(message);
  if (buildMatch) {
    const lastBuildAt = recentBuilds.get(userId) || 0;
    if (Date.now() - lastBuildAt < 30_000) return res.status(429).json({ ok: false, reason: "Please wait before submitting another request." });
    const text = buildMatch[1].trim().slice(0, 300);
    if (text && !blocklist.some((rule) => rule.test(text))) {
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
    if (!change || blocklist.some((rule)=>rule.test(change))) return res.status(400).json({ok:false,reason:"Enter a safe change of up to 300 characters."});
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
  if (blocklist.some((rule)=>rule.test(change))) return res.status(400).json({error:"That change needs manual moderator review."});
  const request=await createRequest(change,"Dashboard","dashboard","remix",widget.id);
  res.status(201).json(publicRequest(request));
});
app.patch("/api/settings", async (req, res) => {
  const approval = req.body?.approval;
  if (approval !== undefined && !["manual", "auto-votes", "auto-points"].includes(approval)) return res.status(400).json({ error: "Choose manual, vote threshold, or channel points." });
  const votes = req.body?.autoBuildVotes === undefined ? undefined : Number(req.body.autoBuildVotes);
  const seconds = req.body?.autoBuildSeconds === undefined ? undefined : Number(req.body.autoBuildSeconds);
  if (votes !== undefined && (!Number.isInteger(votes) || votes < 1 || votes > 1000)) return res.status(400).json({ error: "Vote threshold must be from 1 to 1000." });
  if (seconds !== undefined && (!Number.isInteger(seconds) || seconds < 0 || seconds > 86400)) return res.status(400).json({ error: "Build timer must be from 0 to 86400 seconds." });
  if (approval !== undefined) store.settings.approval = approval;
  if (votes !== undefined) store.settings.autoBuildVotes = votes;
  if (seconds !== undefined) store.settings.autoBuildSeconds = seconds;
  await persist(); res.json(store.settings);
});
app.post("/api/simulate/:event", (req, res) => {
  const allowed = new Set(["chat", "follow", "sub", "raid", "redeem"]);
  if (!allowed.has(req.params.event)) return res.status(400).json({ error: "Unsupported simulated event." });
  const event = { type: req.params.event, payload: req.body ?? {}, simulated: true, at: new Date().toISOString() };
  publish({ type: "event", event });
  if (event.type === "redeem" && store.settings.approval === "auto-points" && req.body?.reward === "Build a widget") {
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
