/** Loads KEY=VALUE lines from a .env file into process.env (no dependency). */
import { readFile } from "node:fs/promises";

export async function loadEnvFile(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return false;
  }

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, name, raw] = match;
    const value = raw.replace(/^["']|["']$/g, "");
    // Real environment variables win over the file.
    if (!(name in process.env)) process.env[name] = value;
  }
  return true;
}
