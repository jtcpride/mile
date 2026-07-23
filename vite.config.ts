import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/mile/' : '/',
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'node',
    coverage: {
      reporter: ['text', 'html'],
    },
  },
})
