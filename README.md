# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

## How it runs

- **Dev:** `npm run dev` — Vite plus a small `/api/chat` middleware from
  `vite.config.js` -> `server/chat.mjs`.
- **Production:** `npm run build` then `npm start` — `server.mjs` serves
  `dist/` and `/api/chat` on <http://localhost:3000> (`PORT` to change).
- `npm run preview` only serves static files and has **no** API, so chatting
  won't work there.

Provider keys are read from `.env.local` **by the Node server only**, so they
never end up in the browser bundle. The browser calls `/api/chat` in
`src/api.js`; the routing logic lives in `src/ai/` and runs server-side.

## Multiple API keys (Gemini + OpenRouter)

`src/ai/` is a small router that keeps working when a free key runs out.

1. Copy `.env.example` to `.env.local` and fill in as many keys as you have:

   ```env
   GEMINI_API_KEY=...        # tried first
   GEMINI_API_KEY_2=...      # then this
   GEMINI_API_KEY_3=...
   OPENROUTER_API_KEY=...    # only after every Gemini key is used up
   ```

   A variable can also hold a comma-separated list of keys. Old `VITE_*` names
   still work, but the un-prefixed ones are safer (Vite never sees them).
   Adding a key means editing `.env.local` and restarting the server.

2. How a message is routed (`src/ai/index.js`):

   - The prompt is scored: short/simple -> `light` model, code / maths / long /
     "explain in detail" -> `heavy` (strong) model.
   - Try-order is **key 1, key 2, key 3 ... then OpenRouter**, strongest model
     first for hard prompts.
   - On `429` (quota), `401/403` (bad key), `5xx` or a timeout the key is
     benched and the next key is tried. Gemini quotas are per model, so only
     that model is benched there; the OpenRouter free limit benches the whole
     key. Benching is kept in server memory, so it resets when the server
     restarts.
   - If everything is out of quota the chat shows a friendly message with the
     time until the first key frees up.

3. Optional overrides in `.env.local`:

   ```env
   GEMINI_MODEL=gemini-3.5-flash
   GEMINI_MODEL_STRONG=gemini-3.6-flash
   OPENROUTER_MODEL=nvidia/nemotron-3.5-lightning:free
   OPENROUTER_MODEL_STRONG=nvidia/nemotron-3-ultra-550b-a55b:free
   AI_PREFER_STRONG=openrouter   # hard prompts go to OpenRouter first
   ```

4. Check every key's validity / expiry / remaining quota:

   ```bash
   npm run keys:check
   ```

> **Security:** `.env.local` is git-ignored and read only on the server, so
> keys are no longer shipped to visitors. For a public deployment still add
> auth / rate limiting, otherwise anyone can use your quota through `/api/chat`.

## Abuse protection

`/api/chat` is rate limited per IP in `server/rate-limit.mjs` (in memory, no
dependency): 20 requests/minute and 200/day by default, with a `Retry-After`
header and a readable message in the chat when hit.

```env
CHAT_RATE_PER_MIN=20
CHAT_RATE_PER_DAY=200
```

Behind Nginx/Cloudflare set `TRUST_PROXY=1` so the real client IP from
`X-Forwarded-For` is used (leave it off when the app is exposed directly,
otherwise the header can be spoofed).

## Conversation context

`run(prompt, history)` now sends the open chat along with the new message, so
follow-ups ("iska example do", "and then?") make sense. History is trimmed to
the last 20 turns / ~12k characters to stay inside free-tier token limits,
error bubbles are skipped, and short follow-ups inherit the previous
question's difficulty so a hard conversation keeps using the strong model.

## Deploy

The app needs a Node process because `/api/chat` holds the keys, so a purely
static host (GitHub Pages, Netlify drop, `vite preview`) will not work.

### Render (free, easiest)

1. Push this folder to GitHub.
2. Render -> **New -> Web Service** -> connect the repo (or **New -> Blueprint**
   and pick `render.yaml`).
3. Build command: `npm ci && npm run build` — Start command: `npm start`.
4. Add environment variables in the dashboard: `GEMINI_API_KEY`,
   `OPENROUTER_API_KEY` (and `_2`, `_3` ... if you have more). Do **not**
   upload `.env.local`.
5. Deploy, open the URL, send a message. First load after 15 min idle can take
   ~30s on the free plan.

Set `TRUST_PROXY=1` when running behind Render/Cloudflare/Nginx so the rate
limiter sees the real IP.

### Other options

- **Railway / Fly.io / VPS**: same commands (`npm ci && npm run build`,
  `npm start`), just set the env vars there. On a VPS keep it alive with
  `pm2 start server.mjs --name chatgpt` and put Nginx in front.
- **Vercel**: needs the handler moved to `api/chat.js` (serverless function);
  `server.mjs` itself is for a long-running Node host.

Never commit `.env.local` — it is already git-ignored.

## Official React plugins

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
