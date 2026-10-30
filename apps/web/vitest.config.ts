import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts on purpose: unit tests need only the `@/` alias, not the PWA or the dev API.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // REQ-05 · The Edge Function's pure rules are tested here too (no Deno needed).
    include: ['src/**/*.test.ts', '../../supabase/functions/**/*.test.ts'],
    environment: 'node',
  },
});
