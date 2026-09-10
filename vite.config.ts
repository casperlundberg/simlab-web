import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The API base is same-origin in production: simlab-web is served behind the
// same ingress path prefix as simlab-api, so the SPA never needs to know a
// hostname. In dev we proxy instead of enabling CORS on the backend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.SIMLAB_API_URL ?? 'http://localhost:8081',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
