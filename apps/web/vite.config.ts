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
        // The pose models' code (~1 MB) is only for whoever uses F10 or the lab: cached when first used instead.
        // P15 · The design lab's demos (features/lab/demos.tsx: every `*Demo-<hash>.js` chunk) are for whoever
        // opens the lab: cached when first opened (runtime cache below), not downloaded by every install.
        globIgnores: ['**/pose-*.js', '**/*Demo-*.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // F10 · 5.5 · Pose models (MoveNet weights, MediaPipe's WASM and model): downloaded the first time they
            // are used, then kept, so following a dancer again doesn't download them again.
            urlPattern: ({ url, sameOrigin }) =>
              (sameOrigin && /^\/assets\/pose-[^/]+\.js$/.test(url.pathname)) ||
              url.origin === 'https://tfhub.dev' ||
              (url.origin === 'https://storage.googleapis.com' && url.pathname.startsWith('/mediapipe-models/')) ||
              (url.origin === 'https://cdn.jsdelivr.net' && url.pathname.startsWith('/npm/@mediapipe/tasks-vision@')),
            handler: 'CacheFirst',
            options: {
              cacheName: 'pose-models',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 90, purgeOnQuotaError: true },
            },
          },
          {
            // P15 · Lab demos (hashed names: a cached one never changes).
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /^\/assets\/[A-Za-z]+Demo-[^/]+\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'lab-demos',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
            },
          },
          {
            // The fonts' CSS is linked without crossorigin, so it comes back opaque (status 0): it has to be
            // allowed explicitly or it is never cached. Revalidated in the background, so an opaque error can't
            // stick.
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'fonts',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365, purgeOnQuotaError: true },
            },
          },
          {
            // The font files themselves (CORS, status 200; hashed URLs that never change). The Japanese faces
            // come in many unicode-range slices, hence the room.
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-files',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365, purgeOnQuotaError: true },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://i.ytimg.com',
            handler: 'StaleWhileRevalidate',
            // Cross-origin thumbnails are opaque: browsers bill each one as several MB of quota (the same quota
            // the device copies of videos use), so keep a bounded set and drop them first when space runs out.
            // P11 · 150: a whole library plus quick access and wishes (40 evicted thumbnails on every visit).
            options: {
              cacheName: 'thumbnails',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 14, purgeOnQuotaError: true },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // F10 · pose-detection imports the legacy BlazePose script for a runtime we never use (MoveNet only).
      '@mediapipe/pose': fileURLToPath(new URL('./src/features/pose/mediapipePoseStub.ts', import.meta.url)),
    },
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
          // F10 · 5.5 · Pose models' code: only loaded when used, and kept out of the offline precache (below).
          if (/^@tensorflow(-models)?\//.test(pkg)) return 'pose-tf';
          if (pkg.startsWith('@mediapipe/')) return 'pose-mediapipe';
        },
      },
    },
  },
  };
});
