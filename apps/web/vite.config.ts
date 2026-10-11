import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { GET as youtubeMeta } from './api/youtube-meta';
import { GET as youtubeSearch } from './api/youtube-search';

/** Sample results so the search UI works locally without a YouTube API key. */
const MOCK_SEARCH = [
  ['dQw4w9WgXcQ', 'Rick Astley - Never Gonna Give You Up (Official Video)', 'Rick Astley', 213],
  ['WPdWvnAAurg', "aespa 에스파 'Supernova' Dance Practice", 'aespa', 180],
  ['gdZLi9oWNZg', "BTS (방탄소년단) 'Dynamite' Official MV", 'HYBE LABELS', 223],
].map(([id, title, channel, duration]) => ({
  id,
  title,
  channel,
  duration,
  thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
}));

/** Serves the Vercel functions in `api/` during `vite dev`. */
function devApi(): Plugin {
  type Handler = (request: Request) => Promise<Response>;
  const mount = (server: ViteDevServer, path: string, handler: Handler) =>
    server.middlewares.use(path, async (req, res) => {
      const response = await handler(new Request(new URL(req.originalUrl ?? req.url ?? '/', 'http://localhost')));
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(await response.text());
    });
  return {
    name: 'coverscape-dev-api',
    configureServer(server) {
      mount(server, '/api/youtube-meta', youtubeMeta);
      mount(server, '/api/youtube-search', async (request) =>
        process.env.YOUTUBE_API_KEY
          ? youtubeSearch(request)
          : new Response(JSON.stringify({ items: MOCK_SEARCH }), { headers: { 'Content-Type': 'application/json' } }),
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  // Server-only secrets (no VITE_ prefix) for the dev API, e.g. YOUTUBE_API_KEY in .env.local.
  const ytKey = process.env.YOUTUBE_API_KEY || loadEnv(mode, process.cwd(), '').YOUTUBE_API_KEY;
  if (ytKey) process.env.YOUTUBE_API_KEY = ytKey; // assigning undefined would store the string "undefined"
  return {
  plugins: [
    react(),
    tailwindcss(),
    devApi(),
    // Installable app: manifest + service worker that precaches the shell so it opens instantly and offline.
    VitePWA({
      // 'prompt': a new version waits until main.tsx applies it at a safe moment (never mid-rehearsal).
      registerType: 'prompt',
      injectRegister: null, // registered from main.tsx
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: '/',
        name: 'One Shoot',
        short_name: 'One Shoot',
        description: 'Estudio de ensayo de covers de K-pop: espejo, velocidad y clips en bucle.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#1b1916',
        theme_color: '#1b1916',
        categories: ['music', 'entertainment', 'education'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://i.ytimg.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'thumbnails', expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Function form so transitive deps (react-dom → scheduler, motion → framer-motion, @supabase/*) follow
        // their entry package into a long-lived vendor chunk instead of the app's entry chunk.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          const pkg = id.replace(/\\/g, '/').split('node_modules/').pop()!;
          if (/^(react|react-dom|react-router|scheduler|cookie|set-cookie-parser)\//.test(pkg)) return 'react';
          if (/^(motion|framer-motion|motion-dom|motion-utils)\//.test(pkg)) return 'motion';
          if (pkg.startsWith('@supabase/')) return 'supabase';
          if (pkg.startsWith('@tanstack/')) return 'query';
          if (pkg.startsWith('lucide-react/')) return 'icons';
        },
      },
    },
  },
  };
});
