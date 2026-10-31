import assert from "node:assert/strict";
import { normalizeEvent, TwitchEventSubClient } from "../dist/twitch/eventsub-client.js";

class FakeSocket {
  listeners = new Map();
  closed = false;
  url;
  constructor(url) { this.url = url; }
  on(name, listener) { const list = this.listeners.get(name) || []; list.push(listener); this.listeners.set(name, list); return this; }
  send() {}
  close() { this.closed = true; this.emit("close"); }
  emit(name, value) { for (const listener of this.listeners.get(name) || []) listener(value); }
  message(value) { this.emit("message", { toString: () => JSON.stringify(value) }); }
}

const requests = [];
const sockets = [];
const events = [];
const states = [];
const client = new TwitchEventSubClient({
  clientId: "client-id",
  fetcher: async (url, init) => { requests.push({ url: String(url), init }); return new Response(JSON.stringify({ data: [] }), { status: 202 }); },
  socketFactory: (url) => { const socket = new FakeSocket(url); sockets.push(socket); return socket; },
  onEvent: (event) => events.push(event),
  onStatus: (status) => states.push(status),
  reconnectBaseMs: 5,
});
client.start({ accessToken: "test-access", userId: "moderator-1", broadcasterId: "channel-9" });
assert.equal(sockets[0].url, "wss://eventsub.wss.twitch.tv/ws");
sockets[0].message({ metadata: { message_type: "session_welcome" }, payload: { session: { id: "session-one", keepalive_timeout_seconds: 60 } } });
for (let attempt = 0; requests.length < 4 && attempt < 30; attempt++) await new Promise(resolve => setTimeout(resolve, 5));
assert.equal(requests.length, 4);
const subscriptions = requests.map(item => JSON.parse(item.init.body));
assert.deepEqual(subscriptions.map(item => [item.type, item.version]), [
  ["channel.follow", "2"], ["channel.subscribe", "1"], ["channel.raid", "1"], ["channel.channel_points_custom_reward_redemption.add", "1"],
]);
assert.deepEqual(subscriptions[0].condition, { broadcaster_user_id: "channel-9", moderator_user_id: "moderator-1" });
assert.deepEqual(subscriptions[2].condition, { to_broadcaster_user_id: "channel-9" });
assert.deepEqual(subscriptions.map(item => item.transport.session_id), Array(4).fill("session-one"));
assert.equal(requests[0].init.headers.authorization, "Bearer test-access");
assert.equal(states.at(-1), "connected");

const notifications = [
  ["sub-follow", "channel.follow", { user_name: "Follower" }, "follow"],
  ["sub-sub", "channel.subscribe", { user_name: "Subscriber", tier: "1000", is_gift: false }, "sub"],
  ["sub-raid", "channel.raid", { from_broadcaster_user_name: "Raider", viewers: 12 }, "raid"],
  ["sub-redeem", "channel.channel_points_custom_reward_redemption.add", { user_name: "Viewer", user_input: "A widget", reward: { title: "Build a widget" } }, "redeem"],
];
for (const [id, type, event] of notifications) sockets[0].message({ metadata: { message_type: "notification", message_id: id }, payload: { subscription: { type }, event } });
sockets[0].message({ metadata: { message_type: "notification", message_id: "sub-follow" }, payload: { subscription: { type: "channel.follow" }, event: { user_name: "Follower" } } });
assert.deepEqual(events.map(event => event.type), ["follow", "sub", "raid", "redeem"]);
assert.equal(events[3].payload.user_input, "A widget");
assert.deepEqual(normalizeEvent("channel.raid", { viewers: -2 }), { type: "raid", payload: { name: "", viewers: 0 } });

sockets[0].message({ metadata: { message_type: "session_reconnect" }, payload: { session: { reconnect_url: "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30" } } });
assert.equal(sockets[1].url, "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30");
sockets[1].message({ metadata: { message_type: "session_welcome" }, payload: { session: { id: "session-two", keepalive_timeout_seconds: 60 } } });
assert.equal(sockets[0].closed, true);
assert.equal(requests.length, 4);
client.stop();
assert.equal(sockets[1].closed, true);
process.stdout.write("PASS EventSub subscription types/scopes, session conditions, normalized follow/sub/raid/redemption events, deduplication, reconnect migration, and stop using fake endpoints and sockets.\n");
