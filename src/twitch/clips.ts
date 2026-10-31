export type ClipErrorCode = "CLIP_DISABLED" | "CLIP_SCOPE_MISSING" | "CLIP_NOT_LIVE" | "CLIP_COOLDOWN" | "CLIP_SESSION_CAP" | "CLIP_RATE_LIMIT" | "CLIP_FAILED";
export type ClipResult = { ok: true; id: string; editUrl: string; live: true } | { ok: false; code: ClipErrorCode; live?: boolean };
export type TwitchClipManagerOptions = {
  clientId: string;
  broadcasterId: () => string;
  getAccessToken: () => Promise<string | undefined>;
  hasClipScope: () => boolean;
  enabled: () => boolean;
  sessionCount: () => number;
  sessionCap: () => number;
  cooldownSeconds: () => number;
  lastAttemptAt?: () => number;
  onAttempt?: (at: number) => void | Promise<void>;
  onCreated?: () => void | Promise<void>;
  fetcher?: typeof fetch;
  now?: () => number;
};

export class TwitchClipManager {
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private localLastAttemptAt = 0;
  private pending: Promise<ClipResult> | undefined;

  constructor(private readonly options: TwitchClipManagerOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async getLiveStatus(): Promise<{ live: boolean; status: "live" | "offline" | "unavailable" }> {
    try {
      const token = await this.options.getAccessToken();
      if (!token) return { live: false, status: "unavailable" };
      const response = await this.fetcher(`https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(this.options.broadcasterId())}`, { headers: this.headers(token) });
      if (!response.ok) return { live: false, status: "unavailable" };
      const body = await response.json() as { data?: unknown[] };
      const live = Array.isArray(body.data) && body.data.length > 0;
      return { live, status: live ? "live" : "offline" };
    } catch {
      return { live: false, status: "unavailable" };
    }
  }

  createClip(title = "StreamForge moment"): Promise<ClipResult> {
    if (this.pending) return this.pending;
    this.pending = this.create(title).finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private async create(title: string): Promise<ClipResult> {
    if (!this.options.enabled()) return { ok: false, code: "CLIP_DISABLED" };
    if (!this.options.hasClipScope()) return { ok: false, code: "CLIP_SCOPE_MISSING" };
    const now = this.now();
    if (now - Math.max(this.localLastAttemptAt, this.options.lastAttemptAt?.() || 0) < this.options.cooldownSeconds() * 1000) return { ok: false, code: "CLIP_COOLDOWN" };
    if (this.options.sessionCount() >= this.options.sessionCap()) return { ok: false, code: "CLIP_SESSION_CAP" };
    let token: string | undefined;
    try { token = await this.options.getAccessToken(); } catch { return { ok: false, code: "CLIP_FAILED" }; }
    if (!token) return { ok: false, code: "CLIP_DISABLED" };
    const live = await this.getLiveStatus();
    if (live.status === "unavailable") return { ok: false, code: "CLIP_FAILED" };
    if (!live.live) return { ok: false, code: "CLIP_NOT_LIVE", live: false };
    this.localLastAttemptAt = this.now();
    await this.options.onAttempt?.(this.localLastAttemptAt);
    try {
      const query = new URLSearchParams({ broadcaster_id: this.options.broadcasterId(), title: title.slice(0, 140) });
      const response = await this.fetcher(`https://api.twitch.tv/helix/clips?${query}`, { method: "POST", headers: this.headers(token) });
      if (response.status === 429) return { ok: false, code: "CLIP_RATE_LIMIT", live: true };
      if (!response.ok) return { ok: false, code: response.status === 401 ? "CLIP_SCOPE_MISSING" : "CLIP_FAILED", live: true };
      const body = await response.json() as { data?: Array<{ id?: string; edit_url?: string }> };
      const clip = body.data?.[0];
      if (!clip?.id || !validEditUrl(clip.edit_url)) return { ok: false, code: "CLIP_FAILED", live: true };
      await this.options.onCreated?.();
      return { ok: true, id: clip.id, editUrl: clip.edit_url, live: true };
    } catch {
      return { ok: false, code: "CLIP_FAILED", live: true };
    }
  }

  private headers(token: string): HeadersInit {
    return { "client-id": this.options.clientId, authorization: `Bearer ${token}`, "content-type": "application/json" };
  }
}

function validEditUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return url.protocol === "https:" && ["clips.twitch.tv", "www.twitch.tv"].includes(url.hostname); }
  catch { return false; }
}
