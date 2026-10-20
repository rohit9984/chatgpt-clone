/**
 * Browser-side API client. Talks to our own /api/chat endpoint, which holds
 * the provider keys on the server.
 */

const MAX_TURNS = 20;
const MAX_TURN_CHARS = 4000;

function trimHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (message) =>
        (message?.role === "user" || message?.role === "model") &&
        String(message.text ?? "").trim(),
    )
    .slice(-MAX_TURNS)
    .map((message) => ({
      role: message.role,
      text: String(message.text).slice(0, MAX_TURN_CHARS),
    }));
}

/**
 * `await run("hello")` or `await run("follow up", chatMessages)`.
 * Returns the answer text, or throws an Error with a readable message.
 */
export default async function run(prompt, history = []) {
  let response;

  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, history: trimHistory(history) }),
    });
  } catch {
    throw new Error(
      "Could not reach the server. Is it running? (`npm run dev` or `npm start`)",
    );
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.error) {
    throw new Error(
      payload?.error || `Request failed (HTTP ${response.status}).`,
    );
  }

  if (!payload?.reply) throw new Error("The server returned an empty reply.");
  return payload.reply;
}
