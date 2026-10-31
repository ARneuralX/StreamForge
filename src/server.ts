import express from "express";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rename, chmod, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

type BuildState = "queued" | "approved" | "building" | "checking" | "live" | "failed" | "rolled_back";
type Request = { id: string; text: string; requester: string; source: string; status: BuildState; createdAt: string };
type WidgetMeta = { id: string; title: string; description: string; width: number; height: number; x: number; y: number; anchor: string; enabled: boolean };
type Store = { requests: Request[]; widgets: WidgetMeta[]; settings: Record<string, unknown>; codexVerification?: { time: string; ok: boolean; error?: string } };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "public");
const dataDir = path.resolve(process.env.STREAMFORGE_DATA_DIR || path.join(root, "data"));

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
const defaultStore: Store = { requests: [], widgets: starterWidgets, settings: { approval: process.env.APPROVAL || "manual", buildMode: process.env.BUILD_MODE || "replay" } };
let store: Store;
try { store = JSON.parse(await readFile(storePath, "utf8")) as Store; }
catch { store = defaultStore; }
if (!Array.isArray(store.widgets) || store.widgets.length === 0) store.widgets = starterWidgets;

async function persist(): Promise<void> {
  const tempPath = `${storePath}.${randomUUID()}.tmp`;
  await writeFile(tempPath, JSON.stringify(store, null, 2), { mode: 0o600 });
  await chmod(tempPath, 0o600);
  await rename(tempPath, storePath);
}

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
app.use("/widgets", express.static(path.join(root, "widgets"), {
  setHeaders(res) {
    res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src data:; media-src 'none'; connect-src 'none'; font-src 'self' data:");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Access-Control-Allow-Origin", "*");
  },
}));

app.get("/api/health", (_req, res) => res.json({ ok: true, buildMode: store.settings.buildMode, twitch: { enabled: process.env.TWITCH_LIVE_ENABLED === "true", chat: "needs_setup", eventSub: "needs_setup" }, codex: store.codexVerification?.ok ? { state: "verified", time: store.codexVerification.time } : { state: "needs_setup" } }));
app.get("/api/state", (_req, res) => res.json({ requests: store.requests, widgets: store.widgets, settings: store.settings, codexVerification: store.codexVerification }));
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
app.post("/api/requests", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, 300) : "";
  if (!text) return res.status(400).json({ error: "Enter a widget request first." });
  const request: Request = { id: randomUUID(), text, requester: "Dashboard", source: "dashboard", status: "queued", createdAt: new Date().toISOString() };
  store.requests.unshift(request);
  await persist();
  publish({ type: "request", request });
  res.status(201).json(request);
});
app.post("/api/requests/:id/:action", async (req, res) => {
  const request = store.requests.find((item) => item.id === req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found." });
  if (req.params.action === "reject") request.status = "failed";
  else if (req.params.action === "approve") request.status = "approved";
  else return res.status(400).json({ error: "Unknown request action." });
  await persist();
  publish({ type: "request", request });
  res.json(request);
});
app.post("/api/simulate/:event", (req, res) => {
  const allowed = new Set(["chat", "follow", "sub", "raid", "redeem"]);
  if (!allowed.has(req.params.event)) return res.status(400).json({ error: "Unsupported simulated event." });
  const event = { type: req.params.event, payload: req.body ?? {}, simulated: true, at: new Date().toISOString() };
  publish({ type: "event", event });
  res.json({ ok: true, simulated: true });
});
app.patch("/api/widgets/:id", async (req, res) => {
  const widget = store.widgets.find((item) => item.id === req.params.id);
  if (!widget) return res.status(404).json({ error: "Widget not found." });
  if (typeof req.body?.enabled === "boolean") widget.enabled = req.body.enabled;
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
