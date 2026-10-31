import WebSocket from "ws";

export type TwitchStreamEvent = { type: "follow" | "sub" | "raid" | "redeem"; payload: Record<string, unknown> };
type SocketLike = {
  send(data: string): void;
  close(): void;
  on(event: "open" | "close" | "error", listener: (...args: never[]) => void): unknown;
  on(event: "message", listener: (data: { toString(): string }) => void): unknown;
};
type EventSubOptions = {
  clientId: string;
  fetcher?: typeof fetch;
  socketFactory?: (url: string) => SocketLike;
  onEvent: (event: TwitchStreamEvent) => void | Promise<void>;
  onStatus?: (status: "connecting" | "connected" | "needs_setup" | "error") => void;
  reconnectBaseMs?: number;
};
type EventSubConnection = { accessToken: string; userId: string; broadcasterId: string };

const eventTypes = [
  { type: "channel.follow", version: "2", scope: "moderator:read:followers" },
  { type: "channel.subscribe", version: "1", scope: "channel:read:subscriptions" },
  { type: "channel.raid", version: "1", scope: "" },
  { type: "channel.channel_points_custom_reward_redemption.add", version: "1", scope: "channel:read:redemptions" },
] as const;

export class TwitchEventSubClient {
  private readonly fetcher: typeof fetch;
  private readonly socketFactory: (url: string) => SocketLike;
  private readonly reconnectBaseMs: number;
  private socket: SocketLike | undefined;
  private previousSocket: SocketLike | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private keepaliveTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;
  private migrating = false;
  private failures = 0;
  private keepaliveTimeoutSeconds = 0;
  private connection: EventSubConnection | undefined;
  private readonly seenMessages = new Set<string>();

  constructor(private readonly options: EventSubOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.socketFactory = options.socketFactory ?? ((url) => new WebSocket(url) as unknown as SocketLike);
    this.reconnectBaseMs = options.reconnectBaseMs ?? 1000;
  }

  start(connection: EventSubConnection): void {
    this.stop();
    this.connection = connection;
    this.stopped = false;
    this.connect("wss://eventsub.wss.twitch.tv/ws", false);
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    const current = this.socket;
    const previous = this.previousSocket;
    this.socket = undefined;
    this.previousSocket = undefined;
    this.connection = undefined;
    this.migrating = false;
    current?.close();
    if (previous && previous !== current) previous.close();
    this.options.onStatus?.("needs_setup");
  }

  private connect(url: string, migrating: boolean): void {
    if (this.stopped) return;
    this.options.onStatus?.("connecting");
    try {
      const socket = this.socketFactory(url);
      if (migrating) {
        this.previousSocket = this.socket;
        this.migrating = true;
      } else {
        this.previousSocket?.close();
        this.previousSocket = undefined;
        this.migrating = false;
      }
      this.socket = socket;
      socket.on("open", () => {
        if (socket === this.socket) this.resetKeepalive(this.keepaliveTimeoutSeconds || 10);
      });
      socket.on("message", (data) => this.handleMessage(socket, data.toString()));
      socket.on("close", () => this.disconnected(socket));
      socket.on("error", () => this.disconnected(socket));
    } catch {
      this.disconnected(this.socket);
    }
  }

  private handleMessage(socket: SocketLike, raw: string): void {
    if (socket !== this.socket || this.stopped) return;
    let message: Record<string, any>;
    try { message = JSON.parse(raw) as Record<string, any>; } catch { return; }
    const welcomeTimeout = Number(message.payload?.session?.keepalive_timeout_seconds);
    if (Number.isFinite(welcomeTimeout) && welcomeTimeout > 0) this.keepaliveTimeoutSeconds = welcomeTimeout;
    this.resetKeepalive(this.keepaliveTimeoutSeconds);
    const messageType = message.metadata?.message_type;
    if (messageType === "session_welcome") {
      const sessionId = message.payload?.session?.id;
      if (typeof sessionId !== "string" || !this.connection) return this.failConnection(socket);
      if (this.migrating) {
        this.migrating = false;
        this.previousSocket?.close();
        this.previousSocket = undefined;
        this.failures = 0;
        this.options.onStatus?.("connected");
      } else {
        void this.subscribe(sessionId, socket);
      }
      return;
    }
    if (messageType === "session_reconnect") {
      const reconnectUrl = message.payload?.session?.reconnect_url;
      if (typeof reconnectUrl === "string" && reconnectUrl.startsWith("wss://eventsub.wss.twitch.tv/")) this.connect(reconnectUrl, true);
      return;
    }
    if (messageType === "session_keepalive") return;
    if (messageType === "notification") {
      const id = message.metadata?.message_id;
      if (typeof id === "string" && this.seenMessages.has(id)) return;
      if (typeof id === "string") {
        this.seenMessages.add(id);
        if (this.seenMessages.size > 1000) this.seenMessages.delete(this.seenMessages.values().next().value!);
      }
      const normalized = normalizeEvent(message.payload?.subscription?.type, message.payload?.event);
      if (normalized) void Promise.resolve(this.options.onEvent(normalized)).catch(() => undefined);
    }
  }

  private async subscribe(sessionId: string, socket: SocketLike): Promise<void> {
    const connection = this.connection;
    if (!connection || socket !== this.socket || this.stopped) return;
    try {
      for (const item of eventTypes) {
        const condition = item.type === "channel.follow"
          ? { broadcaster_user_id: connection.broadcasterId, moderator_user_id: connection.userId }
          : item.type === "channel.raid"
            ? { to_broadcaster_user_id: connection.broadcasterId }
            : { broadcaster_user_id: connection.broadcasterId };
        const response = await this.fetcher("https://api.twitch.tv/helix/eventsub/subscriptions", {
          method: "POST",
          headers: {
            "client-id": this.options.clientId,
            authorization: `Bearer ${connection.accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ type: item.type, version: item.version, condition, transport: { method: "websocket", session_id: sessionId } }),
        });
        if (!response.ok) throw new Error("eventsub_subscription_failed");
      }
      if (socket === this.socket && !this.stopped) {
        this.failures = 0;
        this.options.onStatus?.("connected");
      }
    } catch {
      this.failConnection(socket);
    }
  }

  private resetKeepalive(seconds: number): void {
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.keepaliveTimer = setTimeout(() => this.failConnection(this.socket), (seconds + 5) * 1000);
    this.keepaliveTimer.unref?.();
  }

  private failConnection(socket: SocketLike | undefined): void {
    if (!socket || socket !== this.socket || this.stopped) return;
    socket.close();
    this.disconnected(socket);
  }

  private disconnected(socket: SocketLike | undefined): void {
    if (!socket || socket !== this.socket || this.stopped) return;
    this.socket = undefined;
    this.clearTimers();
    this.options.onStatus?.("error");
    this.failures++;
    const delay = Math.min(60_000, this.reconnectBaseMs * 2 ** Math.min(6, this.failures - 1));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect("wss://eventsub.wss.twitch.tv/ws", false);
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    this.reconnectTimer = undefined;
    this.keepaliveTimer = undefined;
    this.keepaliveTimeoutSeconds = 0;
  }
}

export function normalizeEvent(type: string | undefined, event: Record<string, any> | undefined): TwitchStreamEvent | undefined {
  if (!event) return undefined;
  if (type === "channel.follow") return { type: "follow", payload: { name: stringField(event.user_name) } };
  if (type === "channel.subscribe") return { type: "sub", payload: { name: stringField(event.user_name), tier: stringField(event.tier), isGift: event.is_gift === true } };
  if (type === "channel.raid") return { type: "raid", payload: { name: stringField(event.from_broadcaster_user_name), viewers: boundedCount(event.viewers) } };
  if (type === "channel.channel_points_custom_reward_redemption.add") {
    return { type: "redeem", payload: { name: stringField(event.user_name), reward: stringField(event.reward?.title), user_input: stringField(event.user_input) } };
  }
  return undefined;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 300) : "";
}

function boundedCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.min(1_000_000, Math.floor(count))) : 0;
}
