import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import analyzeIssueImage from './api/analyze-issue-image.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (env.ZENMUX_API_KEY) process.env.ZENMUX_API_KEY = env.ZENMUX_API_KEY
  if (env.ZENMUX_MODEL) process.env.ZENMUX_MODEL = env.ZENMUX_MODEL

  const aiApiPlugin = {
    name: 'civiclens-ai-api',
    configureServer(server) {
      server.middlewares.use('/api/analyze-issue-image', async (request, response) => {
        if (request.method !== 'POST') return analyzeIssueImage(request, response)

        const chunks = []
        let size = 0
        for await (const chunk of request) {
          size += chunk.length
          if (size > 4_500_000) {
            response.statusCode = 413
            response.setHeader('Content-Type', 'application/json; charset=utf-8')
            response.end(JSON.stringify({ error: 'This image is too large to analyze. Please choose a smaller image.' }))
            return
          }
          chunks.push(chunk)
        }

        try {
          request.body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {
          response.statusCode = 400
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.end(JSON.stringify({ error: 'Invalid JSON request body.' }))
          return
        }

        await analyzeIssueImage(request, response)
      })
    },
  }

  return {
    plugins: [aiApiPlugin, react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
    },
  }
})
