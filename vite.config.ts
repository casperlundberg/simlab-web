import { execSync } from 'node:child_process'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Which code this bundle is. A Docker build has no .git, so CI passes the
// version and commit in as SIMLAB_WEB_VERSION and SIMLAB_WEB_COMMIT; a build
// in a checkout derives them the same way the Go services do.
function stamp(): { version: string; commit: string } {
  if (process.env.SIMLAB_WEB_VERSION) {
    return { version: process.env.SIMLAB_WEB_VERSION, commit: process.env.SIMLAB_WEB_COMMIT ?? '' }
  }
  try {
    const run = (command: string) => execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    return { version: run('scripts/version.sh'), commit: run('git rev-parse HEAD') }
  } catch {
    return { version: '', commit: '' }
  }
}

// The API base is same-origin in production: simlab-web is served behind the
// same ingress path prefix as simlab-api, so the SPA never needs to know a
// hostname. In dev we proxy instead of enabling CORS on the backend.
export default defineConfig({
  plugins: [react()],
  define: {
    __SIMLAB_WEB_BUILD__: JSON.stringify(stamp()),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.SIMLAB_API_URL ?? 'http://localhost:8081',
        changeOrigin: true,
        // The event stream is a long-lived response; buffering it would turn
        // a live run into one long silence followed by everything at once.
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache'
          })
        },
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
