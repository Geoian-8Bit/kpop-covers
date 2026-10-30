import { execSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { GET as youtubeMeta } from './api/youtube-meta';
import { GET as youtubeSearch } from './api/youtube-search';
import { resolveBuildNumber } from './src/features/nav/version/versionRules';

/**
 * P2 · Build number that grows with every deploy: `APP_BUILD` from the deploy (`pnpm deploy:prod`, see
 * docs/DEPLOY.md), else the commit count of this checkout. Vercel's build has no .git, so git may fail; a shallow
 * clone (a Git-connected Vercel build) would give a small count that never grows. Both → null («Versión de
 * desarrollo»), with a warning in the build log (below).
 */
function buildNumber(): number | null {
  const git = (args: string) =>
    execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).toString();
  return resolveBuildNumber(
    process.env.APP_BUILD,
    () => git('rev-list --count HEAD'),
    () => git('rev-parse --is-shallow-repository'),
  );
}

/** A production build without a number is a deploy that will say «Versión de desarrollo»: say so, loudly. */
function warnMissingVersion(): void {
  const where = process.env.VERCEL_ENV ? ` (Vercel, ${process.env.VERCEL_ENV})` : '';
  const lines = [
    `AVISO${where}: esta compilación no tiene número de versión (APP_BUILD vacío y sin historial de git completo).`,
    'La app dirá «Versión de desarrollo» y «Buscar actualización» no podrá comparar números.',
    'Despliega con «pnpm deploy:prod» desde la raíz del repositorio (docs/DEPLOY.md).',
  ];
  const bar = '!'.repeat(Math.max(...lines.map((l) => l.length)));
  const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
  console.warn(['', bar, ...lines, bar, ''].map(yellow).join('\n'));
}

/**
 * P2 · `/version.json`: what this build is, for «Buscar actualización» to compare with the running app. Not in the
 * precache (json isn't in `globPatterns`) and read with `cache: 'no-store'`, so it always comes from the server.
 */
function versionFile(version: number | null, builtAt: string): Plugin {
  return {
    name: 'one-shoot-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version, builtAt }) });
    },
  };
}

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

export default defineConfig(({ mode, command }) => {
  // Server-only secrets (no VITE_ prefix) for the dev API, e.g. YOUTUBE_API_KEY in .env.local.
  const ytKey = process.env.YOUTUBE_API_KEY || loadEnv(mode, process.cwd(), '').YOUTUBE_API_KEY;
  if (ytKey) process.env.YOUTUBE_API_KEY = ytKey; // assigning undefined would store the string "undefined"
  // The dev server is always «Versión de desarrollo»: only a build gets a number.
  const appVersion = command === 'build' ? buildNumber() : null;
  if (command === 'build' && mode === 'production' && appVersion == null) warnMissingVersion();
  const builtAt = new Date().toISOString();
  return {
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_BUILD_DATE__: JSON.stringify(builtAt),
  },
  plugins: [
    react(),
    tailwindcss(),
    devApi(),
    versionFile(appVersion, builtAt),
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
        // REQ-05 · Calendar notices (push, notification tap, icon badge): public/push-sw.js. Without VAPID keys or
        // the Edge Function no push ever arrives and it simply stays idle.
        importScripts: ['/push-sw.js'],
        // 18 · The voice separator's worker (with onnxruntime-web, ~150 KB) only for whoever separates a song; its
        // .wasm isn't in globPatterns either. The HTTP cache keeps both (hashed, immutable).
        // REQ-13 · The 3D view (three.js + @react-three/fiber, ~1 MB) only for whoever opens it, like the separator.
        // REQ-11 · Likewise jspdf's optional extras (html2canvas, canvg, dompurify), which the PDF export never asks for.
        globIgnores: ['**/stemSeparator.worker-*.js', '**/three3d-*.js', '**/Stage3D-*.js', '**/pdf-extras-*.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // 18 · onnxruntime's WASM for the voice separation (26,8 MB, hashed name): only in the HTTP cache it is
            // evicted early on Android and a later separation downloads it again. One entry: a new version replaces it.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /^\/assets\/ort-wasm[^/]*\.wasm$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'voice-runtime',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 * 90, purgeOnQuotaError: true },
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
    },
  },
  server: { port: 5173 },
  // 18 · Module workers (the voice separator imports onnxruntime-web, which needs import.meta and import()).
  worker: { format: 'es' },
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
          // zustand is shared with @react-three/fiber: left unassigned, Rollup would put it in the lazy 3D chunk and the
          // entry would import (and preload) that chunk. Its `traditional` build is only the 3D renderer's.
          if (/^zustand\/esm\/(?!traditional)/.test(pkg)) return 'react';
          // REQ-13 · three.js and its React renderer in one lazy chunk (kept out of the precache, see globIgnores).
          if (/^(three|@react-three\/fiber|its-fine|suspend-react|react-use-measure)\//.test(pkg)) return 'three3d';
          // REQ-11 · What jspdf only loads for `.html()` and SVG (never used here): one chunk, out of the precache.
          if (/^(html2canvas|dompurify|canvg|core-js|raf|rgbcolor|stackblur-canvas|svg-pathdata|performance-now)\//.test(pkg)) return 'pdf-extras';
          // Babel helpers shared by jspdf, its extras and the 3D renderer: a tiny chunk of their own, so none of those
          // chunks has to load another one just for them.
          if (pkg.startsWith('@babel/runtime/')) return 'babel-helpers';
        },
      },
    },
  },
  };
});
