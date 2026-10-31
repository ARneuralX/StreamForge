import { randomBytes } from "node:crypto";

export const twitchScopes = [
  "chat:read",
  "moderator:read:followers",
  "channel:read:subscriptions",
  "channel:read:redemptions",
] as const;

export type TwitchIdentity = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scopes: string[];
  userId: string;
  login: string;
  displayName: string;
  broadcasterId: string;
  broadcasterLogin: string;
};

type PendingState = { createdAt: number; includeClips: boolean };
type TwitchOAuthOptions = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  channel: string;
  fetcher?: typeof fetch;
  now?: () => number;
};

export class TwitchOAuth {
  private readonly pendingStates = new Map<string, PendingState>();
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: TwitchOAuthOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
  }

  createAuthorizationUrl(includeClips = false): string {
    this.pruneStates();
    const state = randomBytes(32).toString("hex");
    this.pendingStates.set(state, { createdAt: this.now(), includeClips });
    const query = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      response_type: "code",
      scope: [...twitchScopes, ...(includeClips ? ["clips:edit"] : [])].join(" "),
      state,
    });
    return `https://id.twitch.tv/oauth2/authorize?${query}`;
  }

  async completeAuthorization(code: string, state: string): Promise<TwitchIdentity> {
    const pending = this.pendingStates.get(state);
    this.pendingStates.delete(state);
    if (!pending || this.now() - pending.createdAt > 10 * 60_000) throw new Error("OAUTH_STATE_INVALID");
    if (!code || code.length > 2048) throw new Error("OAUTH_CODE_INVALID");

    const tokenResponse = await this.fetcher("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: this.options.redirectUri,
      }),
    });
    if (!tokenResponse.ok) throw new Error("OAUTH_EXCHANGE_FAILED");
    const tokens = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(tokens.expires_in)) throw new Error("OAUTH_TOKEN_RESPONSE_INVALID");

    const validationResponse = await this.fetcher("https://id.twitch.tv/oauth2/validate", {
      headers: { authorization: `OAuth ${tokens.access_token}` },
    });
    if (!validationResponse.ok) throw new Error("OAUTH_TOKEN_INVALID");
    const validation = await validationResponse.json() as { client_id?: string; user_id?: string; login?: string; scopes?: string[] };
    if (validation.client_id !== this.options.clientId || !validation.user_id || !validation.login || !Array.isArray(validation.scopes)) {
      throw new Error("OAUTH_TOKEN_IDENTITY_INVALID");
    }
    const required = [...twitchScopes, ...(pending.includeClips ? ["clips:edit"] : [])];
    const grantedScopes = new Set(validation.scopes);
    const missing = required.filter((scope) => !grantedScopes.has(scope));
    if (missing.length) throw new Error(`OAUTH_SCOPE_MISSING:${missing.join(",")}`);

    const user = await this.getUser(tokens.access_token, `id=${encodeURIComponent(validation.user_id)}`);
    const broadcaster = await this.getUser(tokens.access_token, `login=${encodeURIComponent(this.options.channel.toLowerCase())}`);
    if (user.id !== validation.user_id || user.login.toLowerCase() !== validation.login.toLowerCase()) throw new Error("OAUTH_USER_MISMATCH");
    if (!broadcaster.id) throw new Error("TWITCH_CHANNEL_NOT_FOUND");
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: Number(tokens.expires_in),
      scopes: [...validation.scopes],
      userId: user.id,
      login: user.login,
      displayName: user.display_name,
      broadcasterId: broadcaster.id,
      broadcasterLogin: broadcaster.login,
    };
  }

  private async getUser(accessToken: string, query: string): Promise<{ id: string; login: string; display_name: string }> {
    const response = await this.fetcher(`https://api.twitch.tv/helix/users?${query}`, {
      headers: { "client-id": this.options.clientId, authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error("TWITCH_USER_LOOKUP_FAILED");
    const body = await response.json() as { data?: Array<{ id?: string; login?: string; display_name?: string }> };
    const user = body.data?.[0];
    if (!user?.id || !user.login || !user.display_name) throw new Error("TWITCH_USER_LOOKUP_EMPTY");
    return { id: user.id, login: user.login, display_name: user.display_name };
  }

  private pruneStates(): void {
    const expiredBefore = this.now() - 10 * 60_000;
    for (const [state, pending] of this.pendingStates) if (pending.createdAt < expiredBefore) this.pendingStates.delete(state);
  }
}
