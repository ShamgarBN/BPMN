/**
 * Vitest configuration.
 *
 * We keep the test config separate from `vite.config.ts` so dev/prod builds
 * never inadvertently pull in test-only globals.  The alias for `@/` matches
 * the production resolver so source files compile unchanged.
 *
 * Run with `npm test` (CI) or `npm run test:watch` (development).
 */
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx,js,mjs}', 'tests/**/*.{test,spec}.{ts,tsx,js,mjs}'],
    globals: true,
    // BPMN Studio's pure-service tests don't need a DOM.  Component tests that
    // touch React can opt-in to jsdom locally via the `@vitest-environment`
    // pragma at the top of the file.
    reporters: ['default'],
    // Vitest 1.x: define is honoured for SUT code; mirror what Vite injects.
    define: {
      __APP_VERSION__: JSON.stringify('test'),
    },
  },
})
