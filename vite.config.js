import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev-only API: keeps provider keys on the Node side while using `npm run dev`.
// The same handler powers `npm start` (server.mjs) in production.
let apiReady = null

function loadChatApi() {
  if (!apiReady) {
    apiReady = (async () => {
      const { loadEnvFile } = await import('./server/env.mjs')
      // Keys must exist before src/ai/keys.js is imported.
      await loadEnvFile(fileURLToPath(new URL('./.env.local', import.meta.url)))
      await loadEnvFile(fileURLToPath(new URL('./.env', import.meta.url)))
      return import('./server/chat.mjs')
    })()
  }
  return apiReady
}

function chatApi() {
  return {
    name: 'chat-api',
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        try {
          const { handleRequest } = await loadChatApi()
          await handleRequest(req, res)
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: error.message }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), chatApi()],
})
