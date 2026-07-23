import { defineConfig } from 'vitest/config'

export default defineConfig({
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
