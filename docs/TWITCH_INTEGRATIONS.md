# Twitch integration protocol

The implementation uses an authorization-code user token and keeps live behavior behind `TWITCH_LIVE_ENABLED=true`.

## Verified scopes and event names

The requested scopes are checked against the granted scope list during callback:

- `chat:read` for incoming IRC chat.
- `moderator:read:followers` for `channel.follow` version 2.
- `channel:read:subscriptions` for `channel.subscribe` version 1.
- `channel:read:redemptions` for `channel.channel_points_custom_reward_redemption.add` version 1.
- `clips:edit` is requested only when the user chooses the explicit Auto-Clips reauthorization link.
- `channel.raid` version 1 does not require an authorization scope.

These names and requirements come from Twitch's [OAuth scopes](https://dev.twitch.tv/docs/authentication/scopes/), [EventSub subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types), and [IRC concepts](https://dev.twitch.tv/docs/chat/irc/) documentation. Twitch's current IRC docs require a user token with `chat:read` to read IRC messages. IRC handshake frames are separate WebSocket frames per its protocol.

## OAuth protocol

Authorization uses `https://id.twitch.tv/oauth2/authorize` with a random one-use CSRF `state` and exact callback `http://localhost:PORT/auth/twitch/callback`. The callback exchanges the code at `https://id.twitch.tv/oauth2/token`, validates the resulting user token at `https://id.twitch.tv/oauth2/validate`, checks the app client ID and every required granted scope, then obtains the authorized user and configured broadcaster through `GET https://api.twitch.tv/helix/users`. Token exchange, validation and identity lookup use HTTPS and never include credentials or access tokens in user-facing errors.

Protocol references: [OAuth authorization code grant](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/), [token validation](https://dev.twitch.tv/docs/authentication/validate-tokens/), [refresh tokens](https://dev.twitch.tv/docs/authentication/refresh-tokens/), [EventSub WebSocket handling](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/), and [managing EventSub subscriptions](https://dev.twitch.tv/docs/eventsub/manage-subscriptions/).

The OAuth service is tested with an injected fake fetch implementation. Development does not invoke Twitch endpoints.
