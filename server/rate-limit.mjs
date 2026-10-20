/**
 * Simple in-memory rate limit for /api/chat - no dependencies.
 *
 *   CHAT_RATE_PER_MIN=20    requests per minute per IP (default 20)
 *   CHAT_RATE_PER_DAY=200   requests per day per IP (default 200)
 *   TRUST_PROXY=1           use X-Forwarded-For (only behind your own proxy)
 */

const PER_MINUTE = Number(process.env.CHAT_RATE_PER_MIN) || 20;
const PER_DAY = Number(process.env.CHAT_RATE_PER_DAY) || 200;

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TRACKED_IPS = 5000;

/** ip -> array of request timestamps (ms) */
const hits = new Map();

export function clientIp(req) {
  if (process.env.TRUST_PROXY === "1") {
    const forwarded = req.headers?.["x-forwarded-for"];
    if (forwarded) return String(forwarded).split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function prune(now) {
  for (const [ip, list] of hits) {
    const recent = list.filter((time) => now - time < DAY_MS);
    if (recent.length) hits.set(ip, recent);
    else hits.delete(ip);
  }
}

/**
 * Returns { ok: true, remaining } or { ok: false, retryAfter, reason }.
 * `retryAfter` is in seconds.
 */
export function checkRateLimit(ip) {
  const now = Date.now();

  if (hits.size > MAX_TRACKED_IPS) prune(now);

  const day = (hits.get(ip) || []).filter((time) => now - time < DAY_MS);
  const minute = day.filter((time) => now - time < MINUTE_MS);

  if (minute.length >= PER_MINUTE) {
    return {
      ok: false,
      reason: "minute",
      retryAfter: Math.max(1, Math.ceil((MINUTE_MS - (now - minute[0])) / 1000)),
    };
  }

  if (day.length >= PER_DAY) {
    return {
      ok: false,
      reason: "day",
      retryAfter: Math.max(1, Math.ceil((DAY_MS - (now - day[0])) / 1000)),
    };
  }

  day.push(now);
  hits.set(ip, day);
  return { ok: true, remaining: PER_DAY - day.length };
}

/** Exposed for tests. */
export const LIMITS = { perMinute: PER_MINUTE, perDay: PER_DAY };
