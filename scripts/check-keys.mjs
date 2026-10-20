/**
 * Prints the status of every key in .env.local.
 *
 *   npm run keys:check
 *
 * OpenRouter: expiry, credit limit, free-model requests left today.
 * Gemini:     whether the key is accepted (no quota used).
 */

import { readFile } from "node:fs/promises";

const ENV_FILE = new URL("../.env.local", import.meta.url);
const KEY_NAME = /^(VITE_)?(GEMINI|OPENROUTER)_API_KEY(_\d+)?$/;

function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  }
  return env;
}

function readKeys(env, provider) {
  const keys = [];
  for (const [name, value] of Object.entries(env)) {
    if (!KEY_NAME.test(name) || !name.includes(provider)) continue;
    for (const key of value.split(",").map((part) => part.trim()).filter(Boolean)) {
      keys.push({ name, key });
    }
  }
  return keys;
}

const mask = (key) => `${key.slice(0, 12)}...${key.slice(-4)}`;

async function checkOpenRouter({ name, key }) {
  const response = await fetch("https://openrouter.ai/api/v1/key", {
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return `${name.padEnd(28)} ${mask(key).padEnd(22)} INVALID (${response.status}) ${body?.error?.message || ""}`;
  }

  const data = body.data || {};
  const expiry = data.expires_at
    ? `${new Date(data.expires_at).toISOString()}  <-- EXPIRES`
    : "never (permanent key)";
  const free = data.free_model_daily_requests
    ? `${data.free_model_daily_requests.remaining}/${data.free_model_daily_requests.limit} free requests left today`
    : "n/a";

  return [
    `${name.padEnd(28)} ${mask(key).padEnd(22)} OK`,
    `  expires:      ${expiry}`,
    `  credit:       $${data.limit_remaining ?? "?"} of $${data.limit ?? "?"}`,
    `  free tier:    ${free}`,
  ].join("\n");
}

async function checkGemini({ name, key }) {
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models",
    { headers: { "x-goog-api-key": key } },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = body?.error?.status || body?.error?.message || response.status;
    return `${name.padEnd(28)} ${mask(key).padEnd(22)} INVALID (${reason})`;
  }
  return `${name.padEnd(28)} ${mask(key).padEnd(22)} OK (${(body.models || []).length} models visible)`;
}

let text = "";
try {
  text = await readFile(ENV_FILE, "utf8");
} catch {
  console.error("No .env.local found next to package.json.");
  process.exit(1);
}

const env = parseEnv(text);
const openrouter = readKeys(env, "OPENROUTER");
const gemini = readKeys(env, "GEMINI");

if (!openrouter.length && !gemini.length) {
  console.error("No VITE_GEMINI_API_KEY* or VITE_OPENROUTER_API_KEY* in .env.local.");
  process.exit(1);
}

console.log(`Keys in .env.local (${openrouter.length} OpenRouter, ${gemini.length} Gemini)\n`);

for (const entry of openrouter) {
  try {
    console.log(await checkOpenRouter(entry));
  } catch (error) {
    console.log(`${entry.name.padEnd(28)} ${mask(entry.key).padEnd(22)} ERROR ${error.message}`);
  }
}

for (const entry of gemini) {
  try {
    console.log(await checkGemini(entry));
  } catch (error) {
    console.log(`${entry.name.padEnd(28)} ${mask(entry.key).padEnd(22)} ERROR ${error.message}`);
  }
}
