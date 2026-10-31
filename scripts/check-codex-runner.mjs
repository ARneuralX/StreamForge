import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkWidgetSource } from "../dist/security/widget-checks.js";
import { codexFailureMessage, runCodexWidgetBuild } from "../dist/codex/runner.js";

const temp = await mkdtemp(path.join(os.tmpdir(), "streamforge-codex-fake-"));
const validSource = `export default { meta: { title: "Safe Alert", description: "A short alert", width: 420, height: 180, x: 0, y: 0, anchor: "top-left" }, mount(api) { api.root.textContent = "Ready"; } };`;
const makeEvents = async function* () {
  yield { type: "item.completed", item: { id: "file", type: "file_change", changes: [{ path: "/Users/private-user/index.js", kind: "add" }], status: "completed" } };
  yield { type: "item.started", item: { id: "cmd", type: "command_execution", command: "npm run test with /Users/private-user", aggregated_output: "secret output", status: "in_progress" } };
  yield { type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 } };
};
const createSdk = (write) => async () => ({ startThread: (threadOptions) => ({ runStreamed: async (prompt, turnOptions) => {
  assert.equal(threadOptions.sandboxMode, "workspace-write");
  assert.equal(threadOptions.approvalPolicy, "never");
  assert.equal(threadOptions.skipGitRepoCheck, true);
  assert.equal(threadOptions.networkAccessEnabled, false);
  assert.equal(threadOptions.webSearchMode, "disabled");
  assert.ok(prompt.includes("<untrusted_viewer_request>"));
  assert.ok(prompt.includes("<widget_api_documentation>") && prompt.includes("Widget contract"));
  if (prompt.includes("<existing_widget_source>")) assert.ok(prompt.includes("old source"));
  assert.ok(prompt.includes("exact path:"));
  assert.ok(turnOptions.signal instanceof AbortSignal);
  await write();
  return { events: makeEvents() };
} }) });
const pathsIn = root => ({ draftDirectory: path.join(root, "draft"), outputPath: path.join(root, "draft", "index.js") });

try {
  const root = path.join(temp, "success");
  const files = pathsIn(root);
  const progress = [];
  const previews = [];
  const result = await runCodexWidgetBuild({
    ...files, widgetApiDocumentation: "Widget contract", request: "Make a safe alert", existingSource: "old source",
    languageInstruction: "Keep viewer text in Bengali", timeoutSeconds: 10, retryOnce: false, createSdk: createSdk(() => mkdir(files.draftDirectory, { recursive: true }).then(() => writeFile(files.outputPath, validSource))),
    checkSource: checkWidgetSource, onProgress: (event) => progress.push(event), onSafePreview: (source) => previews.push(source),
  });
  assert.equal(result.meta.title, "Safe Alert");
  assert.equal(result.attempts, 1);
  assert.deepEqual(previews, [validSource]);
  assert.ok(progress.some(event => event.stage === "Safety checks"));
  assert.equal(JSON.stringify(progress).includes("/Users"), false);
  assert.equal(JSON.stringify(progress).includes("private-user"), false);
  assert.equal(JSON.stringify(progress).includes("npm run"), false);

  let sdkAttempts = 0;
  const retryRoot = path.join(temp, "retry");
  const retryFiles = pathsIn(retryRoot);
  const retried = await runCodexWidgetBuild({
    ...retryFiles, widgetApiDocumentation: "Widget contract", request: "Retry", existingSource: "old source", timeoutSeconds: 10, retryOnce: true,
    createSdk: async () => { sdkAttempts++; if (sdkAttempts === 1) return { startThread: () => ({ runStreamed: async () => { throw new Error("HTTP 429 usage limit"); } }) }; return createSdk(() => mkdir(retryFiles.draftDirectory, { recursive: true }).then(() => writeFile(retryFiles.outputPath, validSource)))(); },
    checkSource: checkWidgetSource,
  });
  assert.equal(retried.attempts, 2);

  const failures = [
    ["no-file", async () => {}, "CODEX_NO_FILE_WRITTEN"],
    ["wrong-location", async folder => { await mkdir(folder, { recursive: true }); await writeFile(path.join(folder, "other.js"), validSource); }, "CODEX_WRONG_LOCATION"],
    ["syntax", async output => { await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, `${validSource}\n}`); }, "CODEX_SYNTAX_ERROR"],
    ["default", async output => { await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, "const widget = {}; export { widget };"); }, "CODEX_MISSING_DEFAULT_EXPORT"],
    ["meta", async output => { await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, "export default { mount(api) {} };"); }, "CODEX_MISSING_META"],
    ["mount", async output => { await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, `export default { meta: { title: "x", description: "x", width: 100, height: 60, x: 0, y: 0, anchor: "top-left" } };`); }, "CODEX_MISSING_MOUNT"],
    ["blocked", async output => { await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, validSource.replace('api.root.textContent = "Ready";', 'fetch("x");')); }, "CODEX_SCAN_BLOCKED"],
    ["mock-mount", async output => { await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, validSource.replace('api.root.textContent = "Ready";', 'throw new Error("mount");')); }, "CODEX_MOCK_MOUNT_THROW"],
  ];
  for (const [name, writer, code] of failures) {
    const output = path.join(temp, name, "draft", "index.js");
    const create = createSdk(() => writer(name === "wrong-location" ? path.dirname(output) : output));
    await assert.rejects(runCodexWidgetBuild({
      draftDirectory: path.dirname(output), outputPath: output, widgetApiDocumentation: "Widget contract", request: name,
      timeoutSeconds: 10, retryOnce: false, createSdk: create, checkSource: checkWidgetSource,
    }), error => error.code === code);
    const error = Object.assign(new Error(code), { code });
    assert.equal(codexFailureMessage(error).includes("/Users"), false);
  }

  const timeoutOutput = path.join(temp, "timeout", "draft", "index.js");
  const timeoutSdk = async () => ({ startThread: () => ({ runStreamed: async (_prompt, turnOptions) => ({ events: (async function* () {
    await new Promise(resolve => setTimeout(resolve, 1100));
    yield { type: "turn.completed", usage: { input_tokens: 0, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 } };
    assert.equal(turnOptions.signal.aborted, true);
  })() }) }) });
  await assert.rejects(runCodexWidgetBuild({
    draftDirectory: path.dirname(timeoutOutput), outputPath: timeoutOutput, widgetApiDocumentation: "Widget contract", request: "timeout",
    timeoutSeconds: 1, retryOnce: false, createSdk: timeoutSdk, checkSource: checkWidgetSource,
  }), error => error.code === "CODEX_TIMEOUT");
  process.stdout.write("PASS fake Codex SDK options, untrusted prompt, redacted event mapping, safe preview gate, retry setting, specific output/scan/mount failures and timeout.\n");
} finally {
  await rm(temp, { recursive: true, force: true });
}
