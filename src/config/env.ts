import { readFile } from "node:fs/promises";

export function parseEnvFile(source: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export async function loadEnvFile(filePath: string): Promise<Record<string, string>> {
  try {
    return parseEnvFile(await readFile(filePath, "utf8"));
  } catch {
    return {};
  }
}

export function liveTwitchEnabled(environment: NodeJS.ProcessEnv): boolean {
  return environment.TWITCH_LIVE_ENABLED === "true";
}
