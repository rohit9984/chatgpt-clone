/**
 * /api/chat - the only place that touches provider API keys.
 *
 * Used by both `npm run dev` (Vite middleware, see vite.config.js) and
 * `npm run start` (server.mjs), so the browser never sees a key.
 */

import run from "../src/ai/index.js";
import { checkRateLimit, clientIp } from "./rate-limit.mjs";

const MAX_BODY_BYTES = 1_000_000; // 1 MB
const MAX_PROMPT_CHARS = 8000;
const MAX_HISTORY_TURNS = 40;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, "Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Validates the request and returns the model's answer. Throws HttpError. */
export async function handleChat(payload) {
  const prompt = String(payload?.prompt ?? "").trim();
  if (!prompt) throw new HttpError(400, "Please type a message first.");
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new HttpError(413, `Message too long (max ${MAX_PROMPT_CHARS} characters).`);
  }

  const history = Array.isArray(payload?.history)
    ? payload.history.slice(-MAX_HISTORY_TURNS)
    : [];

  return run(prompt, history);
}

/** Node req/res handler, also usable as connect middleware. */
export async function handleRequest(req, res) {
  const send = (status, body) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(body));
  };

  if (req.method !== "POST") {
    send(405, { error: "Use POST." });
    return;
  }

  const limit = checkRateLimit(clientIp(req));
  if (!limit.ok) {
    const message =
      limit.reason === "minute"
        ? `Too many messages - please wait ${limit.retryAfter}s.`
        : `Daily message limit reached. Try again in about ${Math.ceil(limit.retryAfter / 3600)}h.`;
    res.setHeader("Retry-After", String(limit.retryAfter));
    send(429, { error: message });
    return;
  }

  try {
    const raw = await readBody(req);
    let payload;
    try {
      // Tolerate a UTF-8 BOM from Windows editors.
      payload = JSON.parse(raw.replace(/^\uFEFF/, "") || "{}");
    } catch {
      throw new HttpError(400, "Invalid JSON body.");
    }

    send(200, { reply: await handleChat(payload) });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("[api/chat]", error.message);
    send(status, { error: error.message || "Something went wrong." });
  }
}
