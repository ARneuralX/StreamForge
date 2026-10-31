import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Codex } from "@openai/codex-sdk";

const workingDirectory = await mkdtemp(path.join(os.tmpdir(), "streamforge-codex-check-"));
const outputPath = path.join(workingDirectory, "codex-check.txt");

try {
  const codex = new Codex();
  const thread = codex.startThread({
    workingDirectory,
    sandboxMode: "workspace-write",
    approvalPolicy: "never",
    skipGitRepoCheck: true,
    networkAccessEnabled: false,
    webSearchMode: "disabled",
  });

  const { events } = await thread.runStreamed(
    `Create the file at exactly ${outputPath} with the single line "Codex SDK check passed". Do not create or edit any other file.`,
  );

  for await (const event of events) {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  }

  const contents = await readFile(outputPath, "utf8");
  if (contents.trim() !== "Codex SDK check passed") {
    throw new Error("SDK task completed but the expected file contents were not produced.");
  }
  process.stdout.write("Codex SDK check passed: expected file was created.\n");
} finally {
  await rm(workingDirectory, { recursive: true, force: true });
}
