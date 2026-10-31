# Auto-Clips

Auto-Clips is off by default. Clip creation requires Twitch's `POST /helix/clips` endpoint and a user access token with the `clips:edit` scope. Twitch accepts the request asynchronously; a successful request returns HTTP 202 and a clip ID. Twitch documents that the broadcaster must be live (otherwise the endpoint returns 404). The API reference does not specify a separate Create Clip request quota; the general API token-bucket limits and 429 response apply. StreamForge's default 120 second cooldown is an additional local limit.

Official references: [Create Clip API](https://dev.twitch.tv/docs/api/reference/#create-clip), [OAuth scopes](https://dev.twitch.tv/docs/authentication/scopes/), [API rate limits](https://dev.twitch.tv/docs/api/guide#rate-limits).

The Settings link requests `clips:edit` only when a person chooses “Enable auto-clips · reauthorize with clips:edit”. The ordinary authorization link retains the existing scope list. In this repository OAuth exchange and token persistence are implemented, but there is no EventSub or stream-status integration yet. Therefore the app reports clip creation unavailable, treats the channel as not live, and never calls Twitch's Create Clip endpoint. Preferences and moment validation are implemented for the future connection; no fake clip records or retry loops are created.

Widget moments support only `natural20` and `goalReached`. The host derives labels from these fixed kinds and ignores widget-supplied labels or other free-form fields. Each widget can submit one moment every 30 seconds. A valid event can be accepted locally, but does not create a clip while Twitch authorization/live checks are unavailable.
