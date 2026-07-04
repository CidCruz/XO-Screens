import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
    plugins: [react(), tailwindcss()],
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
      // For web mode, open the correct HTML entry
      open: isDesktop ? false : '/index.web.html',
    },
  }
})
