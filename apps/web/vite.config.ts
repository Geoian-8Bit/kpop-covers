import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { GET as youtubeMeta } from './api/youtube-meta';

/** Serves the Vercel function `api/youtube-meta` during `vite dev`. */
function devApi(): Plugin {
  return {
    name: 'coverscape-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/youtube-meta', async (req, res) => {
        const response = await youtubeMeta(new Request(new URL(req.originalUrl ?? req.url ?? '/', 'http://localhost')));
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(await response.text());
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devApi()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          motion: ['motion'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
