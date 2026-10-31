import { chmod, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type RecordedBuildEvent = { stage: string; detail: string; checks?: Record<string, boolean>; at: string };
export type BuildRecording = {
  version: 1;
  id: string;
  createdAt: string;
  request: { text: string; kind: "build" | "remix" };
  events: RecordedBuildEvent[];
  status: "live" | "failed" | "rolled_back";
  widgetId?: string;
};

export async function writeBuildRecording(directory: string, recording: Omit<BuildRecording, "version" | "id" | "createdAt">, now = Date.now()): Promise<BuildRecording> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const complete: BuildRecording = {
    ...recording,
    version: 1,
    id: randomUUID(),
    createdAt: new Date(now).toISOString(),
  };
  const fileName = `${now}-${complete.id}.json`;
  const destination = path.join(directory, fileName);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(complete, null, 2), { mode: 0o600, flag: "wx" });
    await chmod(temporary, 0o600);
    await rename(temporary, destination);
    await chmod(destination, 0o600);
    return complete;
  } catch {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw new Error("BUILD_RECORDING_WRITE_FAILED");
  }
}

export async function latestSuccessfulBuildRecording(directory: string): Promise<BuildRecording | undefined> {
  const names = (await readdir(directory).catch(() => [])).filter((name) => /^\d+-[0-9a-f-]+\.json$/u.test(name)).sort().reverse();
  for (const name of names) {
    try {
      const value = JSON.parse(await readFile(path.join(directory, name), "utf8")) as BuildRecording;
      if (isBuildRecording(value) && value.status === "live" && value.widgetId) return value;
    } catch {
      // Ignore incomplete local recordings and try the next one.
    }
  }
  return undefined;
}

function isBuildRecording(value: BuildRecording): boolean {
  return value?.version === 1 && typeof value.id === "string" && typeof value.createdAt === "string" &&
    typeof value.request?.text === "string" && ["build", "remix"].includes(value.request.kind) &&
    Array.isArray(value.events) && value.events.every((event) => typeof event.stage === "string" && typeof event.detail === "string" && typeof event.at === "string") &&
    ["live", "failed", "rolled_back"].includes(value.status) && (!value.widgetId || /^[a-z0-9-]{1,80}$/u.test(value.widgetId));
}
