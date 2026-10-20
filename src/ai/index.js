import {
  ApiFailure,
  GEMINI_MODELS,
  OPENROUTER_MODELS,
  generateGemini,
  generateOpenRouter,
} from "./providers.js";
import {
  DEFAULT_COOLDOWN_MS,
  INVALID_KEY_COOLDOWN_MS,
  clearCooldown,
  coolDown,
  cooldownInfo,
  geminiKeys,
  openrouterKeys,
  soonestReset,
} from "./keys.js";
import { firstEnv } from "./env.js";

/**
 * Multi-key router.
 *
 * 1. Guess how hard the prompt is ("light" / "heavy").
 * 2. Build a try-order: Gemini keys first (key 1, 2, 3 ...), then OpenRouter.
 *    Heavy prompts start with the stronger model of each provider.
 * 3. Walk the list until one call succeeds. Quota / auth failures bench that
 *    key, so the next key is used - and it stays benched on the next message.
 *
 * Override the order with VITE_AI_PREFER_STRONG=openrouter in .env.local.
 */

const HEAVY_SCORE = 2;
const PREFER_OPENROUTER =
  String(
    firstEnv("AI_PREFER_STRONG", "VITE_AI_PREFER_STRONG"),
  ).toLowerCase() === "openrouter";

/* ------------------------------------------------------- prompt difficulty */

const SIGNALS = [
  [/```/, 3], // pasted code
  [
    /\b(function|class|def|const|let|var|import|export|async|await|api|sql|regex|component|typescript|javascript|python|java|rust|c\+\+|react|css|html|bug|error|exception|stack trace)\b/i,
    2,
  ],
  [
    /\b(debug|refactor|algorithm|complexity|optimi[sz]e|benchmark|architecture|migrate|concurrency|database|schema)\b/i,
    2,
  ],
  [
    /\b(prove|derive|theorem|integral|derivative|matrix|equation|probability|statistics|calculus)\b/i,
    2,
  ],
  [
    /\b(step by step|in detail|comprehensive|compare|analyse|analyze|evaluate|critique|essay|report|research|design|plan|strategy)\b/i,
    2,
  ],
  [/\b(why|how (do|does|can|would)|explain|teach|summarize|translate)\b/i, 1],
];

const SMALL_TALK =
  /^(hi|hey|hello|yo|sup|thanks|thank you|ok|okay|cool|nice|good (morning|afternoon|evening|night)|what'?s up|how are you)\b/i;

/**
 * Returns "light" or "heavy". Pure function, easy to tweak.
 */
export function pickTier(prompt) {
  const text = String(prompt || "");
  let score = 0;

  for (const [pattern, weight] of SIGNALS) {
    if (pattern.test(text)) score += weight;
  }

  if (text.length > 300) score += 1;
  if (text.length > 1200) score += 2;
  if (text.split("\n").length > 6) score += 1;
  if (SMALL_TALK.test(text.trim()) && text.length < 60) score -= 3;

  return score >= HEAVY_SCORE ? "heavy" : "light";
}

/* ------------------------------------------------------------ try-order */

function keysFor(provider) {
  return provider === "gemini" ? geminiKeys() : openrouterKeys();
}

function buildChain(tier) {
  // Which model tier to try first, per provider.
  const modelOrder = tier === "heavy" ? ["strong", "light"] : ["light", "strong"];

  const group = (provider, models) => {
    const out = [];
    for (const modelTier of modelOrder) {
      for (const key of keysFor(provider)) {
        // Benched after a quota / auth failure (quota may be per model).
        if (cooldownInfo(key, models[modelTier])) continue;
        out.push({
          provider,
          key,
          model: models[modelTier],
          tier: modelTier,
        });
      }
    }
    return out;
  };

  const geminiChain = group("gemini", GEMINI_MODELS);
  const openrouterChain = group("openrouter", OPENROUTER_MODELS);

  // Heavy prompts: OpenRouter's big model beats Gemini's free flash, but the
  // "use my free key first" rule stays the default.
  if (tier === "heavy" && PREFER_OPENROUTER && openrouterChain.length) {
    return [...openrouterChain, ...geminiChain];
  }
  return [...geminiChain, ...openrouterChain];
}

/* -------------------------------------------------------------- messages */

function formatDelay(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function logSkip(candidate, failure) {
  const label = `${candidate.provider}/${candidate.model}`;
  const firstLine = failure.text.split("\n")[0].slice(0, 160);
  console.warn(`[ai] ${label} failed${failure.status ? ` ${failure.status}` : ""}: ${firstLine}`);
}

function userError(failure) {
  let message;

  if (failure.quota) {
    const wait = soonestReset([...geminiKeys(), ...openrouterKeys()]);
    message =
      "Every API key has hit its free limit" +
      (wait ? ` - the first one frees up in about ${formatDelay(wait)}` : "") +
      ". Wait for the reset or add another key to .env.local.";
  } else if (failure.invalidKey) {
    message =
      "That API key was rejected. Check the key in .env.local (or add another one) and restart the dev server.";
  } else if (/timed out/i.test(failure.text)) {
    message = "The assistant took too long to respond. Please try again.";
  } else if (failure.code === 503 || /overloaded|high demand|unavailable/i.test(failure.text)) {
    message = "All models are overloaded right now. Please try again in a moment.";
  } else if (failure.code === 402) {
    message = "The OpenRouter key is out of credits. Add credits or add another key.";
  } else {
    message = failure.text.split("\n")[0] || "Something went wrong. Please try again.";
  }

  const friendly = new Error(message);
  friendly.provider = failure.provider;
  friendly.model = failure.model;
  return friendly;
}

/* ------------------------------------------------------------------ run */

function call(candidate, prompt, history) {
  const args = {
    key: candidate.key,
    model: candidate.model,
    prompt,
    history,
  };
  return candidate.provider === "gemini"
    ? generateGemini(args)
    : generateOpenRouter(args);
}

/**
 * Ask the best available model.
 *
 *   await run("your prompt")                  // one-shot
 *   await run("follow up", chatMessages)      // with conversation context
 *
 * `chatMessages` is the saved history ({ role: "user" | "model", text }[]);
 * the prompt itself is appended by the providers.
 */
export default async function run(prompt, history = []) {
  const text = String(prompt ?? "").trim();
  if (!text) throw new Error("Please type a message first.");

  const turns = Array.isArray(history) ? history : [];
  // Short follow-ups inherit the topic of the previous question, so a hard
  // conversation doesn't silently drop to the small model mid-way.
  const previous = [...turns].reverse().find((turn) => turn?.role === "user");
  const tierInput =
    text.length < 80 && previous?.text
      ? `${previous.text} ${text}`
      : text;
  const tier = pickTier(tierInput);

  if (!geminiKeys().length && !openrouterKeys().length) {
    throw new Error(
      "No API keys found. Add VITE_GEMINI_API_KEY or VITE_OPENROUTER_API_KEY " +
        "to .env.local and restart the dev server.",
    );
  }

  const chain = buildChain(tier);

  if (!chain.length) {
    throw userError(
      new ApiFailure({
        provider: "none",
        text: "No API keys configured.",
        quota: true,
      }),
    );
  }

  let lastFailure = null;

  for (const candidate of chain) {
    try {
      const reply = await call(candidate, text, turns);
      clearCooldown(candidate.key, candidate.model); // key+model works again
      console.debug(
        `[ai] ${tier} -> ${candidate.provider}/${candidate.model}`,
      );
      return reply;
    } catch (error) {
      const failure =
        error instanceof ApiFailure
          ? error
          : new ApiFailure({ provider: candidate.provider, text: String(error?.message || error) });

      failure.model = candidate.model;
      lastFailure = failure;
      logSkip(candidate, failure);

      // Bench the key so the next message doesn't retry a dead one.
      if (failure.invalidKey) {
        coolDown(candidate.key, {
          ms: INVALID_KEY_COOLDOWN_MS,
          reason: "invalid key",
        });
      } else if (failure.quota) {
        // Gemini's free quota is per model; OpenRouter's free limit is per key.
        coolDown(candidate.key, {
          ms: failure.retryDelayMs || DEFAULT_COOLDOWN_MS,
          reason: "quota",
          model: candidate.provider === "openrouter" ? null : candidate.model,
        });
      }

      // Content blocks / bad requests aren't fixed by another key.
      if (!failure.retryable) throw userError(failure);
    }
  }

  throw userError(lastFailure);
}
