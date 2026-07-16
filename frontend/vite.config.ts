/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Dev-only: serve the admin bundle at /admin (prod does this via vercel.json).
function adminRouteDev(): Plugin {
  return {
    name: 'admin-route-dev',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/admin' || req.url === '/admin/') req.url = '/admin.html'
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), adminRouteDev()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
  build: {
    rollupOptions: {
      // Two independent bundles. The user app (index.html) never imports
      // anything under src/admin, so no admin code/asset ships to regular users.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
      },
      output: {
        manualChunks: {
          charts: ['recharts'],
          motion: ['framer-motion'],
          react: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
