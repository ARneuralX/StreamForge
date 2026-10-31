import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TwitchTokenStore } from "../dist/twitch/token-store.js";
import { twitchScopes } from "../dist/twitch/oauth.js";

const directory = await mkdtemp(path.join(os.tmpdir(), "streamforge-token-test-"));
const filePath = path.join(directory, "data", "twitch-token.json");
let now = Date.now();
const requests = [];
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fetcher = async (input, init = {}) => {
  const url = new URL(String(input));
  requests.push({ url, init });
  if (url.pathname.endsWith("/token")) return response({ access_token: "refreshed-access", refresh_token: "rotated-refresh", expires_in: 3600 });
  if (url.pathname.endsWith("/validate")) return response({ client_id: "client-id", user_id: "42", scopes: [...twitchScopes] });
  throw new Error("unexpected_fake_url");
};
const createStore = () => new TwitchTokenStore({ filePath, clientId: "client-id", clientSecret: "test-secret", fetcher, now: () => now });
const identity = { accessToken: "old-access", refreshToken: "old-refresh", expiresIn: 60, scopes: [...twitchScopes], userId: "42", login: "streamer", displayName: "Streamer", broadcasterId: "99", broadcasterLogin: "channel" };

try {
  const store = createStore();
  await store.save(identity);
  const permissions = await stat(filePath);
  assert.equal(permissions.mode & 0o777, 0o600);
  assert.deepEqual((await readdir(path.dirname(filePath))).filter(name => name.endsWith(".tmp")), []);
  const reloaded = createStore();
  assert.equal((await reloaded.load()).broadcasterId, "99");
  assert.equal(await reloaded.refreshIfNeeded(), true);
  assert.equal(await reloaded.getFreshAccessToken(), "refreshed-access");
  assert.equal(reloaded.identity.refreshToken, "rotated-refresh");
  assert.equal(requests[0].url.toString(), "https://id.twitch.tv/oauth2/token");
  assert.equal(new URLSearchParams(requests[0].init.body).get("grant_type"), "refresh_token");
  assert.equal(reloaded.status().connected, true);
  assert.equal(JSON.stringify(reloaded.status()).includes("refreshed-access"), false);
  assert.equal((await readFile(filePath, "utf8")).includes("refreshed-access"), true);
  now += 4_000_000;
  assert.equal(reloaded.status().expired, true);
  await reloaded.disconnect();
  assert.equal(await reloaded.load(), undefined);
  assert.equal((await readdir(path.dirname(filePath))).includes("twitch-token.json"), false);
  process.stdout.write("PASS token persistence mode, atomic temp cleanup, restart load, early refresh, safe status, expiry and disconnect using fake Twitch endpoints.\n");
} finally {
  await rm(directory, { recursive: true, force: true });
}
