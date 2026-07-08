import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import http from 'node:http'
import https from 'node:https'

function videoProxyPlugin(): Plugin {
  return {
    name: 'video-proxy',
    configureServer(server) {
      server.middlewares.use('/api/video-proxy', (req, res) => {
        const urlParam = new URLSearchParams(req.url?.slice(1) ?? '').get('url')
        if (!urlParam) { res.writeHead(400); res.end('Missing url param'); return }
        let parsed: URL
        try { parsed = new URL(urlParam) }
        catch { res.writeHead(400); res.end('Invalid URL'); return }
        const client = parsed.protocol === 'https:' ? https : http
        client.get(urlParam, (upstream) => {
          res.writeHead(upstream.statusCode ?? 200, {
            'Content-Type': upstream.headers['content-type'] ?? 'video/mp4',
            'Access-Control-Allow-Origin': '*',
          })
          upstream.pipe(res)
        }).on('error', () => { res.writeHead(500); res.end('Proxy error') })
      })
    },
  }
}

/**
 * Shared Vite config.
 * Desktop overlay:  vite --mode desktop           → port 5173, index.html
 * Web app:          vite (default mode)            → port 5174, index.web.html
 *
 * The --mode flag is passed by the npm scripts in package.json.
 */
export default defineConfig(({ mode }) => {
  const isDesktop = mode === 'desktop'

  return {
    plugins: [react(), tailwindcss(), videoProxyPlugin()],
    base: './',
    // In web mode, swap the HTML entry so Vite serves index.web.html at /
    publicDir: 'public',
    build: {
      outDir: isDesktop ? 'dist' : 'dist-web',
      emptyOutDir: true,
      rollupOptions: isDesktop
        ? {}
        : { input: { index: 'index.web.html' } },
    },
    server: {
      port: isDesktop ? 5173 : 5174,
      open: isDesktop ? false : '/index.web.html',
    },
  }
})
