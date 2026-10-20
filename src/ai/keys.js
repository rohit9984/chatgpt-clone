/**
 * API key pool for every provider. Runs on the Node server (see server.mjs),
 * so the keys never reach the browser bundle.
 *
 * Where keys come from (highest priority first):
 *   1. DevTools override  -> localStorage["gemini-api-key"] / ["openrouter-api-key"]
 *                            (browser only; useful when debugging locally)
 *   2. .env.local         -> GEMINI_API_KEY, GEMINI_API_KEY_2..5,
 *                            OPENROUTER_API_KEY, OPENROUTER_API_KEY_2..5
 *
 * Old VITE_* names still work as a fallback. Any variable may also hold
 * several comma-separated keys.
 *
 * Keys that hit a quota / auth error are put on a cooldown so the router moves
 * on to the next key instead of hammering a dead one. Only a hash of each key
 * is stored.
 */

import { firstEnv } from "./env.js";

const STATUS_KEY = "ai-key-status";

/** Unknown 429 (e.g. a per-minute limit with no retry hint). */
export const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000;
/** Bad / revoked / unfunded key: don't bother retrying for a day. */
export const INVALID_KEY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** localStorage in the browser, an in-memory Map on the server. */
const storage = (() => {
  const memory = new Map();
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.getItem(STATUS_KEY); // throws when disabled
      return localStorage;
    }
  } catch {
    /* fall through to memory */
  }
  return {
    getItem: (name) => (memory.has(name) ? memory.get(name) : null),
    setItem: (name, value) => memory.set(name, String(value)),
    removeItem: (name) => memory.delete(name),
  };
})();

function splitKeys(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
}

function unique(list) {
  return [...new Set(list)];
}

function storedValue(name) {
  try {
    return storage.getItem(name);
  } catch {
    return null;
  }
}

/** GEMINI_API_KEY, GEMINI_API_KEY_2 ... (VITE_* kept as a legacy fallback). */
function envKeys(prefix) {
  const values = [];
  for (let index = 1; index <= 5; index += 1) {
    const suffix = index === 1 ? "" : `_${index}`;
    values.push(firstEnv(`${prefix}${suffix}`, `VITE_${prefix}${suffix}`));
  }
  return unique(values.flatMap((value) => splitKeys(value)));
}

const GEMINI_ENV = envKeys("GEMINI_API_KEY");
const OPENROUTER_ENV = envKeys("OPENROUTER_API_KEY");

/**
 * Current keys for a provider, in the order they should be tried.
 * Re-read on every call so a key pasted in DevTools works without a reload.
 */
export function geminiKeys() {
  return unique([...splitKeys(storedValue("gemini-api-key")), ...GEMINI_ENV]);
}

export function openrouterKeys() {
  return unique([
    ...splitKeys(storedValue("openrouter-api-key")),
    ...OPENROUTER_ENV,
  ]);
}

/** Short, stable id for a key - never persist the key itself. */
function keyId(key) {
  let hash = 5381;
  for (let index = 0; index < key.length; index += 1) {
    hash = ((hash * 33) ^ key.charCodeAt(index)) >>> 0;
  }
  return `${hash.toString(36)}:${key.length}`;
}

/**
 * Quotas are often per key *and* per model (Gemini's free tier is), so a
 * cooled-down model doesn't hide the fact that the key's other model works.
 * Errors about the key itself (401/403) are stored under the bare key id.
 */
function entryId(key, model) {
  const base = keyId(key);
  return model ? `${base}|${model}` : base;
}

function readStatus() {
  try {
    const parsed = JSON.parse(storage.getItem(STATUS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStatus(status) {
  try {
    storage.setItem(STATUS_KEY, JSON.stringify(status));
  } catch {
    /* storage full / disabled - cooldowns just won't persist */
  }
}

/** How long this key (or key+model) is still benched, or null if usable now. */
export function cooldownInfo(key, model) {
  const status = readStatus();
  const ids = model ? [entryId(key, model), keyId(key)] : [keyId(key)];

  for (const id of ids) {
    const entry = status[id];
    if (!entry) continue;

    const remaining = Number(entry.until) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      delete status[id];
      writeStatus(status);
      continue;
    }
    return { remaining, reason: entry.reason || "quota" };
  }
  return null;
}

export function coolDown(
  key,
  { ms = DEFAULT_COOLDOWN_MS, reason = "quota", model = null } = {},
) {
  const status = readStatus();
  status[entryId(key, model)] = {
    until: Date.now() + Math.max(ms, 1000),
    reason,
  };
  writeStatus(status);
}

export function clearCooldown(key, model) {
  const status = readStatus();
  const id = entryId(key, model);
  if (status[id]) {
    delete status[id];
    writeStatus(status);
  }
}

/** Milliseconds until the first benched key becomes usable again. */
export function soonestReset(keys) {
  const status = readStatus();
  const ids = new Set(keys.map((key) => keyId(key)));
  const waits = Object.entries(status)
    .filter(([id]) => ids.has(id.split("|")[0]))
    .map(([, entry]) => Number(entry.until) - Date.now())
    .filter((ms) => Number.isFinite(ms) && ms > 0);

  return waits.length ? Math.min(...waits) : null;
}
