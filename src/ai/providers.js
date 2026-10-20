import { GoogleGenAI } from "@google/genai";
import { firstEnv } from "./env.js";

/**
 * One network call per provider. Both throw an ApiFailure so the router in
 * index.js can decide whether to try the next key / model.
 */

const GEMINI_TIMEOUT_MS = 30000;
const OPENROUTER_TIMEOUT_MS = 60000;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export class ApiFailure extends Error {
  constructor({
    provider,
    text,
    code,
    status,
    retryDelayMs = null,
    retryable = false,
    quota = false,
    invalidKey = false,
  }) {
    super(text);
    this.name = "ApiFailure";
    this.provider = provider;
    this.text = text;
    this.code = code;
    this.status = status;
    this.retryDelayMs = retryDelayMs;
    this.retryable = retryable;
    this.quota = quota;
    this.invalidKey = invalidKey;
  }
}

/** Model tiers: "light" = fast/cheap, "strong" = better answers. */
export const GEMINI_MODELS = {
  light: firstEnv("GEMINI_MODEL", "VITE_GEMINI_MODEL") || "gemini-3.5-flash",
  strong:
    firstEnv("GEMINI_MODEL_STRONG", "VITE_GEMINI_MODEL_STRONG") ||
    "gemini-3.6-flash",
};

export const OPENROUTER_MODELS = {
  light:
    firstEnv("OPENROUTER_MODEL", "VITE_OPENROUTER_MODEL") ||
    "nvidia/nemotron-3.5-lightning:free",
  strong:
    firstEnv("OPENROUTER_MODEL_STRONG", "VITE_OPENROUTER_MODEL_STRONG") ||
    "nvidia/nemotron-3-ultra-550b-a55b:free",
};

/** Reject if the request doesn't answer in time (APIs sometimes just hang). */
function withTimeout(promise, ms, controller) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      controller?.abort();
      reject(new Error(`Request timed out after ${ms / 1000}s`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const RETRYABLE = /UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|rate limit|timed out|fetch failed|network/i;
const BAD_KEY = /API key not valid|API_KEY_INVALID|invalid api key|invalid_api_key|unauthorized/i;

/* --------------------------------------------------------------- history */

const MAX_TURNS = 20;
const MAX_CHARS = 12000;

/**
 * Turn saved chat messages ({ role: "user" | "model" | "error", text }) into a
 * trimmed conversation that ends with the new prompt. Error bubbles are
 * dropped, the conversation always starts with a user turn, and only the most
 * recent turns that fit the budget are kept (free tiers have token limits).
 */
export function buildTurns(prompt, history = []) {
  const source = [
    ...(Array.isArray(history) ? history : []),
    { role: "user", text: prompt },
  ];

  const turns = [];
  for (const message of source) {
    const role =
      message?.role === "model"
        ? "model"
        : message?.role === "user"
          ? "user"
          : null;
    const text = String(message?.text ?? "").trim();
    if (role && text) turns.push({ role, text });
  }

  const kept = [];
  let chars = 0;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (kept.length >= MAX_TURNS || chars + turn.text.length > MAX_CHARS) break;
    kept.unshift(turn);
    chars += turn.text.length;
  }

  // A single very long prompt: keep it rather than sending nothing.
  if (!kept.length && turns.length) kept.push(turns[turns.length - 1]);

  // Some providers reject conversations that don't start with a user turn.
  while (kept.length && kept[0].role !== "user") kept.shift();
  return kept;
}

/* ------------------------------------------------------------------ Gemini */

const geminiClients = new Map();

function geminiClient(key) {
  if (!geminiClients.has(key)) {
    geminiClients.set(key, new GoogleGenAI({ apiKey: key }));
  }
  return geminiClients.get(key);
}

/** ApiError.message is usually JSON - pull out status / text / retry delay. */
function parseGeminiError(error) {
  const raw = String(error?.message || "");
  let apiError = null;

  try {
    apiError = JSON.parse(raw)?.error ?? null;
  } catch {
    /* message was plain text, not JSON */
  }

  const text = apiError?.message || raw;
  const retryDelaySeconds =
    apiError?.details?.find((detail) =>
      String(detail["@type"]).includes("RetryInfo"),
    )?.retryDelay || text.match(/retry in ([0-9.]+)s/i)?.[1];

  const code = apiError?.code ?? error?.code;
  const status = apiError?.status || error?.status || "";
  const delaySeconds = parseFloat(
    String(retryDelaySeconds ?? "").replace(/[^0-9.]/g, ""),
  );

  return {
    text: text || "Gemini request failed.",
    code,
    status,
    retryDelayMs:
      Number.isFinite(delaySeconds) && delaySeconds > 0
        ? Math.round(delaySeconds * 1000)
        : null,
    quota: code === 429 || status === "RESOURCE_EXHAUSTED",
    invalidKey: code === 401 || code === 403 || BAD_KEY.test(`${status} ${text}`),
    retryable:
      code === 429 ||
      code === 503 ||
      code >= 500 ||
      RETRYABLE.test(`${status} ${text}`),
  };
}

export async function generateGemini({ key, model, prompt, history = [] }) {
  const ai = geminiClient(key);
  const contents = buildTurns(prompt, history).map((turn) => ({
    role: turn.role,
    parts: [{ text: turn.text }],
  }));

  try {
    const response = await withTimeout(
      ai.models.generateContent({ model, contents }),
      GEMINI_TIMEOUT_MS,
    );
    const text = response.text?.trim();
    if (!text) throw new Error("Gemini returned an empty response.");
    return text;
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure({
      provider: "gemini",
      ...parseGeminiError(error),
    });
  }
}

/* -------------------------------------------------------------- OpenRouter */

export async function generateOpenRouter({ key, model, prompt, history = [] }) {
  const controller = new AbortController();
  const messages = buildTurns(prompt, history).map((turn) => ({
    role: turn.role === "model" ? "assistant" : "user",
    content: turn.text,
  }));

  try {
    const response = await withTimeout(
      fetch(OPENROUTER_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer":
            typeof window !== "undefined"
              ? window.location.origin
              : "http://localhost",
          "X-Title": "ChatGPT clone",
        },
        body: JSON.stringify({
          model,
          messages,
        }),
      }),
      OPENROUTER_TIMEOUT_MS,
      controller,
    );

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload?.error) {
      const text =
        payload?.error?.message ||
        `OpenRouter request failed (HTTP ${response.status}).`;
      const code = payload?.error?.code ?? response.status;
      throw new ApiFailure({
        provider: "openrouter",
        text,
        code,
        status: String(code),
        quota: response.status === 429,
        invalidKey:
          response.status === 401 ||
          response.status === 403 ||
          BAD_KEY.test(`${code} ${text}`),
        retryable:
          response.status === 429 ||
          response.status === 402 ||
          response.status >= 500 ||
          RETRYABLE.test(text),
      });
    }

    const text = payload?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("OpenRouter returned an empty response.");
    return text;
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    const text = String(error?.message || "OpenRouter request failed.");
    throw new ApiFailure({
      provider: "openrouter",
      text,
      retryable: true, // network hiccups / timeouts are worth a retry elsewhere
    });
  }
}
