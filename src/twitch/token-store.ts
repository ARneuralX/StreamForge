import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { TwitchIdentity } from "./oauth.js";

export type StoredTwitchToken = Omit<TwitchIdentity, "expiresIn"> & { expiresAt: string };
type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number };
type TokenValidation = { client_id?: string; user_id?: string; scopes?: string[] };
type TokenStoreOptions = {
  filePath: string;
  clientId: string;
  clientSecret: string;
  fetcher?: typeof fetch;
  now?: () => number;
};

export class TwitchTokenStore {
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private token: StoredTwitchToken | undefined;
  private refreshInFlight: Promise<boolean> | undefined;
  private refreshError = false;

  constructor(private readonly options: TokenStoreOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async load(): Promise<StoredTwitchToken | undefined> {
    try {
      const raw = await readFile(this.options.filePath, "utf8");
      const parsed = JSON.parse(raw) as StoredTwitchToken;
      if (!this.isStoredToken(parsed)) throw new Error("TWITCH_TOKEN_FILE_INVALID");
      this.token = parsed;
      await chmod(this.options.filePath, 0o600);
      return this.copy(this.token);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new Error("TWITCH_TOKEN_FILE_INVALID");
    }
  }

  async save(identity: TwitchIdentity): Promise<StoredTwitchToken> {
    if (!identity.accessToken || !identity.refreshToken || !identity.userId || !identity.broadcasterId || !Number.isFinite(identity.expiresIn)) {
      throw new Error("TWITCH_TOKEN_DATA_INVALID");
    }
    const { expiresIn, ...account } = identity;
    const saved: StoredTwitchToken = {
      ...account,
      expiresAt: new Date(this.now() + expiresIn * 1000).toISOString(),
    };
    await this.atomicWrite(saved);
    this.token = saved;
    this.refreshError = false;
    return this.copy(saved);
  }

  async disconnect(): Promise<void> {
    this.token = undefined;
    this.refreshError = false;
    await rm(this.options.filePath, { force: true });
  }

  async refreshIfNeeded(): Promise<boolean> {
    if (!this.token) return false;
    if (Date.parse(this.token.expiresAt) - this.now() > 5 * 60_000) return true;
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.refresh();
    try {
      return await this.refreshInFlight;
    } finally {
      this.refreshInFlight = undefined;
    }
  }

  async getFreshAccessToken(): Promise<string | undefined> {
    if (!this.token) return undefined;
    await this.refreshIfNeeded();
    if (Date.parse(this.token.expiresAt) <= this.now()) throw new Error("TWITCH_TOKEN_EXPIRED");
    return this.token.accessToken;
  }

  get identity(): StoredTwitchToken | undefined {
    return this.token ? this.copy(this.token) : undefined;
  }

  status(): { connected: boolean; expired: boolean; expiresAt?: string; refreshError: boolean; scopes: string[] } {
    if (!this.token) return { connected: false, expired: false, refreshError: this.refreshError, scopes: [] };
    const expired = Date.parse(this.token.expiresAt) <= this.now();
    return { connected: !expired, expired, expiresAt: this.token.expiresAt, refreshError: this.refreshError, scopes: [...this.token.scopes] };
  }

  private async refresh(): Promise<boolean> {
    if (!this.token) return false;
    try {
      const response = await this.fetcher("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
          grant_type: "refresh_token",
          refresh_token: this.token.refreshToken,
        }),
      });
      if (!response.ok) throw new Error("refresh_rejected");
      const refreshed = await response.json() as TokenResponse;
      if (!refreshed.access_token || !Number.isFinite(refreshed.expires_in)) throw new Error("refresh_response_invalid");
      const validationResponse = await this.fetcher("https://id.twitch.tv/oauth2/validate", {
        headers: { authorization: `OAuth ${refreshed.access_token}` },
      });
      if (!validationResponse.ok) throw new Error("refreshed_token_invalid");
      const validation = await validationResponse.json() as TokenValidation;
      if (validation.client_id !== this.options.clientId || validation.user_id !== this.token.userId || !Array.isArray(validation.scopes)) {
        throw new Error("refreshed_token_identity_invalid");
      }
      const scopeSet = new Set(validation.scopes);
      if (this.token.scopes.some((scope) => !scopeSet.has(scope))) throw new Error("refreshed_token_scopes_changed");
      const next = {
        ...this.token,
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || this.token.refreshToken,
        scopes: [...validation.scopes],
        expiresAt: new Date(this.now() + Number(refreshed.expires_in) * 1000).toISOString(),
      };
      await this.atomicWrite(next);
      this.token = next;
      this.refreshError = false;
      return true;
    } catch {
      this.refreshError = true;
      return false;
    }
  }

  private async atomicWrite(token: StoredTwitchToken): Promise<void> {
    const parent = path.dirname(this.options.filePath);
    await mkdir(parent, { recursive: true, mode: 0o700 });
    const temporary = `${this.options.filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(token), { mode: 0o600, flag: "wx" });
      await chmod(temporary, 0o600);
      await rename(temporary, this.options.filePath);
      await chmod(this.options.filePath, 0o600);
    } catch {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw new Error("TWITCH_TOKEN_SAVE_FAILED");
    }
  }

  private isStoredToken(value: StoredTwitchToken): boolean {
    return Boolean(value && typeof value.accessToken === "string" && typeof value.refreshToken === "string" &&
      typeof value.expiresAt === "string" && Number.isFinite(Date.parse(value.expiresAt)) &&
      typeof value.userId === "string" && typeof value.login === "string" &&
      typeof value.broadcasterId === "string" && typeof value.broadcasterLogin === "string" &&
      Array.isArray(value.scopes) && value.scopes.every((scope) => typeof scope === "string"));
  }

  private copy(value: StoredTwitchToken): StoredTwitchToken {
    return structuredClone(value);
  }
}
