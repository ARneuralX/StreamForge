import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyCodex } from "../dist/codex/verify.js";

let capturedDirectory;
const result = await verifyCodex(async () => ({
  startThread(options) {
    capturedDirectory = options.workingDirectory;
    assert.equal(options.sandboxMode, "workspace-write");
    assert.equal(options.approvalPolicy, "never");
    assert.equal(options.skipGitRepoCheck, true);
    assert.equal(options.networkAccessEnabled, false);
    assert.equal(options.webSearchMode, "disabled");
    return { runStreamed: async prompt => {
      assert.match(prompt, /StreamForge Codex verification/u);
      assert.match(prompt, /Do not change any other file/u);
      const output = prompt.match(/Create (.+?) containing/u)?.[1];
      assert.ok(output && output.startsWith(options.workingDirectory));
      await writeFile(output, "StreamForge Codex verification");
      return { events: (async function* () { yield { type: "turn.completed" }; })() };
    } };
  },
}));
assert.equal(result.ok, true);
assert.ok(result.time);
await assert.rejects(readFile(path.join(capturedDirectory, "verification.txt")));

const failed = await verifyCodex(async () => { throw new Error("401 not logged in /Users/private-user"); });
assert.equal(failed.ok, false);
assert.equal(failed.error, "CODEX_NOT_LOGGED_IN");
assert.equal(JSON.stringify(failed).includes("private-user"), false);
console.log("PASS fake Codex verification task uses a temporary sandbox, stores safe result fields, cleans up, and classifies auth failures.");
