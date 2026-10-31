import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ThreadOptions, Thread } from "@openai/codex-sdk";

export type VerifySdk = { startThread(options: ThreadOptions): Pick<Thread, "runStreamed"> };
export type CodexVerification = { time: string; ok: boolean; error?: string };

export async function verifyCodex(createSdk: () => Promise<VerifySdk> = defaultSdk): Promise<CodexVerification> {
  const time = new Date().toISOString();
  const workingDirectory = await mkdtemp(path.join(os.tmpdir(), "streamforge-verify-"));
  const outputPath = path.join(workingDirectory, "verification.txt");
  try {
    const sdk = await createSdk();
    const thread = sdk.startThread({
      workingDirectory,
      sandboxMode: "workspace-write",
      approvalPolicy: "never",
      skipGitRepoCheck: true,
      networkAccessEnabled: false,
      webSearchMode: "disabled",
    });
    const { events } = await thread.runStreamed(
      `Create ${outputPath} containing exactly "StreamForge Codex verification". Do not change any other file.`,
    );
    for await (const _event of events) { /* consume verification task */ }
    const contents = await readFile(outputPath, "utf8");
    if (!contents.includes("StreamForge Codex verification")) return { time, ok: false, error: "CODEX_BAD_OUTPUT" };
    return { time, ok: true };
  } catch (error) {
    return { time, ok: false, error: classifyVerificationError(error) };
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

async function defaultSdk(): Promise<VerifySdk> {
  const { Codex } = await import("@openai/codex-sdk");
  return new Codex();
}

function classifyVerificationError(error: unknown): string {
  const message = String((error as Error)?.message || error || "").toLowerCase();
  if (/usage limit|rate.?limit|quota|\b429\b/u.test(message)) return "CODEX_LIMIT_REACHED";
  if (/not logged in|unauthori[sz]ed|authentication|sign.?in|\b401\b/u.test(message)) return "CODEX_NOT_LOGGED_IN";
  if (/timed? ?out|timeout/u.test(message)) return "CODEX_TIMEOUT";
  return "CODEX_VERIFY_FAILED";
}
