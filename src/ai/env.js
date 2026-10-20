/**
 * Environment access that works both in the Node server and (if ever needed)
 * in the browser.
 *
 *   - Node:    process.env  (server.mjs loads .env.local into it)
 *   - Browser: import.meta.env (only VITE_* vars are inlined by Vite)
 */

const isNode = typeof process !== "undefined" && Boolean(process.versions?.node);

export const ENV = isNode ? process.env : import.meta.env;

/** First non-empty variable from `names` (used for legacy/alias names). */
export function firstEnv(...names) {
  for (const name of names) {
    const value = ENV?.[name];
    if (value) return value;
  }
  return "";
}
