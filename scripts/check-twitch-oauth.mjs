import assert from "node:assert/strict";
import { TwitchOAuth, twitchScopes } from "../dist/twitch/oauth.js";

const requests = [];
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const granted = [...twitchScopes, "clips:edit"];
const fakeFetch = async (input, init = {}) => {
  const url = new URL(String(input));
  requests.push({ url, init });
  if (url.host === "id.twitch.tv" && url.pathname.endsWith("/token")) return response({ access_token: "fake-access", refresh_token: "fake-refresh", expires_in: 14400 });
  if (url.host === "id.twitch.tv" && url.pathname.endsWith("/validate")) return response({ client_id: "client-id", user_id: "42", login: "streamer", scopes: granted });
  if (url.host === "api.twitch.tv") {
    const broadcaster = url.searchParams.has("login");
    const user = broadcaster ? { id: "99", login: "channel", display_name: "Channel" } : { id: "42", login: "streamer", display_name: "Streamer" };
    return response({ data: [user] });
  }
  throw new Error("unexpected_fake_url");
};

const oauth = new TwitchOAuth({ clientId: "client-id", clientSecret: "secret-value", redirectUri: "http://localhost:3000/auth/twitch/callback", channel: "channel", fetcher: fakeFetch });
const authorization = new URL(oauth.createAuthorizationUrl(true));
assert.equal(authorization.origin, "https://id.twitch.tv");
assert.equal(authorization.pathname, "/oauth2/authorize");
assert.equal(authorization.searchParams.get("redirect_uri"), "http://localhost:3000/auth/twitch/callback");
assert.ok(authorization.searchParams.get("state"));
assert.deepEqual(authorization.searchParams.get("scope").split(" "), [...twitchScopes, "clips:edit"]);

const identity = await oauth.completeAuthorization("one-time-code", authorization.searchParams.get("state"));
assert.equal(identity.userId, "42");
assert.equal(identity.broadcasterId, "99");
assert.deepEqual(identity.scopes, granted);
assert.equal(new URLSearchParams(requests[0].init.body).get("redirect_uri"), "http://localhost:3000/auth/twitch/callback");
assert.equal(requests[0].init.headers["content-type"], "application/x-www-form-urlencoded");
assert.equal(requests[1].init.headers.authorization, "OAuth fake-access");
await assert.rejects(oauth.completeAuthorization("reused-code", authorization.searchParams.get("state")), /OAUTH_STATE_INVALID/u);

const missingScopeOauth = new TwitchOAuth({ clientId: "client-id", clientSecret: "secret-value", redirectUri: "http://localhost:3000/auth/twitch/callback", channel: "channel", fetcher: async (input, init) => {
  const url = new URL(String(input));
  if (url.pathname.endsWith("/token")) return response({ access_token: "fake-access", refresh_token: "fake-refresh", expires_in: 14400 });
  if (url.pathname.endsWith("/validate")) return response({ client_id: "client-id", user_id: "42", login: "streamer", scopes: ["chat:read"] });
  return response({ data: [] });
} });
const basicAuthorization = new URL(missingScopeOauth.createAuthorizationUrl());
await assert.rejects(missingScopeOauth.completeAuthorization("one-time-code", basicAuthorization.searchParams.get("state")), /OAUTH_SCOPE_MISSING:moderator:read:followers/u);
process.stdout.write("PASS Twitch OAuth CSRF state, exact redirect, scopes, token validation, user lookup, and missing-scope handling via fake Twitch endpoints.\n");
