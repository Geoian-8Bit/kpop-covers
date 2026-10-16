import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts on purpose: unit tests need only the `@/` alias, not the PWA or the dev API.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
