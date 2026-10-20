/**
 * Production server: serves the built app from dist/ and answers /api/chat.
 *
 *   npm run build
 *   npm start
 *
 * API keys are read from .env.local on the server only - they are never part
 * of the JavaScript bundle.
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./server/env.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const dist = join(root, "dist");

// Env must be loaded before the router modules read it.
await loadEnvFile(join(root, ".env.local"));
await loadEnvFile(join(root, ".env"));

const { handleRequest } = await import("./server/chat.mjs");

const port = Number(process.env.PORT) || 3000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const requested = decodeURIComponent(url.pathname);
  const file = normalize(join(dist, requested === "/" ? "index.html" : requested));

  // Never serve outside dist/.
  if (!file.startsWith(dist + sep) && file !== join(dist, "index.html")) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(file);
    res.statusCode = 200;
    res.setHeader("Content-Type", TYPES[extname(file)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.end(body);
  } catch {
    // Unknown path -> let the React app handle routing.
    try {
      const body = await readFile(join(dist, "index.html"));
      res.statusCode = 200;
      res.setHeader("Content-Type", TYPES[".html"]);
      res.end(body);
    } catch {
      res.statusCode = 503;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("dist/ not found. Run `npm run build` first, then `npm start`.");
    }
  }
}

const server = createServer((req, res) => {
  if (req.url === "/api/health") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url?.startsWith("/api/chat")) {
    handleRequest(req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  serveStatic(req, res);
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
