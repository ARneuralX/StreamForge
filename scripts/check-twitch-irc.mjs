import assert from "node:assert/strict";
import { parseIrcMessage, TwitchIrcClient } from "../dist/twitch/irc-client.js";

class FakeSocket {
  listeners = new Map();
  sent = [];
  closed = false;
  on(name, listener) { const list = this.listeners.get(name) || []; list.push(listener); this.listeners.set(name, list); return this; }
  send(value) { this.sent.push(value); }
  close() { this.closed = true; this.emit("close"); }
  emit(name, value) { for (const listener of this.listeners.get(name) || []) listener(value); }
}

const line = "@badge-info=;badges=moderator/1;display-name=Viewer;emotes=25:0-4,6-10;mod=1;user-id=123 :viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #channel :!build hello";
assert.deepEqual(parseIrcMessage(line, "channel"), {
  message: "!build hello", userId: "123", login: "viewer", isMod: true, isBot: false, simulated: false, emoteCount: 2,
});
assert.equal(parseIrcMessage(line, "other"), undefined);
assert.equal(parseIrcMessage(":tmi.twitch.tv NOTICE * :Login authentication failed", "channel"), undefined);

const sockets = [];
const messages = [];
const states = [];
const client = new TwitchIrcClient({
  socketFactory: (url) => { assert.equal(url, "wss://irc-ws.chat.twitch.tv:443"); const socket = new FakeSocket(); sockets.push(socket); return socket; },
  onMessage: (message) => messages.push(message),
  onStatus: (status) => states.push(status),
  reconnectBaseMs: 5,
});
client.start({ channel: "#Channel", login: "Streamer", accessToken: "unit-test-token" });
sockets[0].emit("open");
assert.deepEqual(sockets[0].sent, [
  "CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands",
  "PASS oauth:unit-test-token",
  "NICK streamer",
  "JOIN #channel",
]);
sockets[0].emit("message", Buffer.from("PING :tmi.twitch.tv\r\n" + line));
assert.equal(sockets[0].sent[4], "PONG :tmi.twitch.tv");
assert.equal(messages.length, 1);
assert.equal(messages[0].userId, "123");
assert.equal(states.at(-1), "connected");
sockets[0].emit("close");
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(sockets.length, 2);
client.stop();
assert.equal(sockets[1].closed, true);
assert.equal(states.at(-1), "needs_setup");
process.stdout.write("PASS IRC separate handshake frames, tagged PRIVMSG parsing, PING/PONG, bot/mod/emote fields, quiet reconnect, and stop using a fake socket.\n");
