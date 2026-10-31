import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { latestSuccessfulBuildRecording, writeBuildRecording } from "../dist/codex/replay.js";

const directory = await mkdtemp(path.join(os.tmpdir(), "streamforge-replay-test-"));
try {
  const successful = await writeBuildRecording(directory, {
    request: { text: "A calm stream alert", kind: "build" },
    events: [{ stage: "Planning", detail: "Plan ready", at: new Date(1).toISOString() }, { stage: "Live", detail: "Widget live", checks: { syntax: true, network: true, forbiddenApis: true, mockMount: true }, at: new Date(2).toISOString() }],
    status: "live", widgetId: "community-12345678",
  }, 1000);
  await writeBuildRecording(directory, {
    request: { text: "Failed build", kind: "remix" }, events: [], status: "failed",
  }, 1001);
  assert.equal((await latestSuccessfulBuildRecording(directory)).id, successful.id);
  const fileName = (await readdir(directory)).find(name => name.includes(successful.id));
  assert.ok(fileName);
  assert.equal((await stat(path.join(directory, fileName))).mode & 0o777, 0o600);
  const contents = await readFile(path.join(directory, fileName), "utf8");
  assert.equal(contents.includes("/Users"), false);
  assert.equal(contents.includes("secret"), false);
  assert.equal(contents.includes("widgetCode"), false);
  assert.equal((await latestSuccessfulBuildRecording(path.join(directory, "missing"))), undefined);
  process.stdout.write("PASS atomic private replay recordings, latest successful selection, failed-record skip, and no source/path/token data.\n");
} finally {
  await rm(directory, { recursive: true, force: true });
}
