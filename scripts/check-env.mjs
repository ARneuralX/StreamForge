import assert from "node:assert/strict";
import { liveTwitchEnabled, parseEnvFile } from "../dist/config/env.js";

const parsed = parseEnvFile(`PORT = 3100\nTWITCH_CLIENT_ID = " client id "\nTWITCH_CHANNEL='sample channel'\n# ignored\nBROKEN_LINE`);
assert.equal(parsed.PORT, "3100");
assert.equal(parsed.TWITCH_CLIENT_ID, " client id ");
assert.equal(parsed.TWITCH_CHANNEL, "sample channel");
assert.equal(liveTwitchEnabled({ TWITCH_LIVE_ENABLED: "true", NODE_ENV: "development" }), true);
assert.equal(liveTwitchEnabled({ TWITCH_LIVE_ENABLED: "1", NODE_ENV: "production" }), false);
assert.equal(liveTwitchEnabled({ NODE_ENV: "production" }), false);
process.stdout.write("PASS dotenv whitespace/quotes and TWITCH_LIVE_ENABLED-only gate.\n");
