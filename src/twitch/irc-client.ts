import WebSocket from "ws";

export type IrcChatMessage = {
  message: string;
  userId: string;
  login: string;
  isMod: boolean;
  isBot: boolean;
  simulated: false;
  emoteCount?: number;
};

type SocketLike = {
  send(data: string): void;
  close(): void;
  on(event: "open" | "close" | "error", listener: (...args: never[]) => void): unknown;
  on(event: "message", listener: (data: { toString(): string }) => void): unknown;
};
type IrcClientOptions = {
  socketFactory?: (url: string) => SocketLike;
  onMessage: (message: IrcChatMessage) => void | Promise<void>;
  onStatus?: (status: "connected" | "needs_setup" | "error") => void;
  reconnectBaseMs?: number;
};

export function parseIrcMessage(line: string, channel: string): IrcChatMessage | undefined {
  if (!line.includes(" PRIVMSG ")) return undefined;
  const tags = new Map<string, string>();
  let remainder = line;
  if (remainder.startsWith("@")) {
    const separator = remainder.indexOf(" ");
    if (separator < 0) return undefined;
    for (const tag of remainder.slice(1, separator).split(";")) {
      const equal = tag.indexOf("=");
      tags.set(equal < 0 ? tag : tag.slice(0, equal), unescapeTag(equal < 0 ? "" : tag.slice(equal + 1)));
    }
    remainder = remainder.slice(separator + 1);
  }
  const match = /^:([^!\s]+)!([^\s]+)@[^\s]+ PRIVMSG #([^\s]+) :(.*)$/u.exec(remainder);
  if (!match || match[3].toLowerCase() !== channel.replace(/^#/u, "").toLowerCase()) return undefined;
  const [, login, , , message] = match;
  const userId = tags.get("user-id") || "";
  if (!userId) return undefined;
  const badges = tags.get("badges") || "";
  const isMod = tags.get("mod") === "1" || /(?:^|,)(?:broadcaster|moderator)\//u.test(badges);
  const emoteCount = countEmotes(tags.get("emotes") || "");
  return {
    message,
    userId,
    login: (tags.get("login") || login).slice(0, 40),
    isMod,
    isBot: /(?:bot|nightbot|streamelements|moobot)$/iu.test(login),
    simulated: false,
    ...(emoteCount > 0 ? { emoteCount } : {}),
  };
}

export class TwitchIrcClient {
  private readonly socketFactory: (url: string) => SocketLike;
  private readonly reconnectBaseMs: number;
  private socket: SocketLike | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;
  private failures = 0;
  private channel = "";
  private login = "";
  private accessToken = "";
  connected = false;

  constructor(private readonly options: IrcClientOptions) {
    this.socketFactory = options.socketFactory ?? ((url) => new WebSocket(url) as unknown as SocketLike);
    this.reconnectBaseMs = options.reconnectBaseMs ?? 1000;
  }

  start(config: { channel: string; login: string; accessToken: string }): void {
    this.stop();
    this.channel = config.channel.replace(/^#/u, "").toLowerCase();
    this.login = config.login.toLowerCase();
    this.accessToken = config.accessToken;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.connected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const socket = this.socket;
    this.socket = undefined;
    if (socket) socket.close();
    this.options.onStatus?.("needs_setup");
  }

  private connect(): void {
    if (this.stopped) return;
    try {
      const socket = this.socketFactory("wss://irc-ws.chat.twitch.tv:443");
      this.socket = socket;
      socket.on("open", () => {
        if (socket !== this.socket || this.stopped) return;
        this.failures = 0;
        this.connected = true;
        // Twitch IRC requires each command as its own WebSocket data frame.
        socket.send("CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands");
        socket.send(`PASS oauth:${this.accessToken}`);
        socket.send(`NICK ${this.login}`);
        socket.send(`JOIN #${this.channel}`);
        this.options.onStatus?.("connected");
      });
      socket.on("message", (data) => this.handleLine(socket, data.toString()));
      socket.on("close", () => this.disconnected(socket));
      socket.on("error", () => this.disconnected(socket));
    } catch {
      this.disconnected(this.socket);
    }
  }

  private handleLine(socket: SocketLike, raw: string): void {
    if (socket !== this.socket || this.stopped) return;
    for (const line of raw.split(/\r?\n/u)) {
      if (line.startsWith("PING ")) {
        const value = line.slice("PING ".length);
        socket.send(`PONG ${value}`);
        continue;
      }
      const message = parseIrcMessage(line, this.channel);
      if (message) void Promise.resolve(this.options.onMessage(message)).catch(() => undefined);
    }
  }

  private disconnected(socket: SocketLike | undefined): void {
    if (!socket || socket !== this.socket || this.stopped) return;
    this.socket = undefined;
    this.connected = false;
    this.options.onStatus?.("error");
    this.failures++;
    const delay = Math.min(60_000, this.reconnectBaseMs * 2 ** Math.min(6, this.failures - 1));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
    this.reconnectTimer.unref?.();
  }
}

function unescapeTag(value: string): string {
  return value.replace(/\\s/gu, " ").replace(/\\:/gu, ";").replace(/\\r/gu, "\r").replace(/\\n/gu, "\n").replace(/\\\\/gu, "\\");
}

function countEmotes(value: string): number {
  if (!value) return 0;
  return value.split("/").reduce((total, emote) => total + (emote.split(":")[1]?.split(",").filter(Boolean).length || 0), 0);
}
