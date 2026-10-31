// REQ-01 · M-01, M-02, M-11: bundle weights of a measurement build.
// Usage: node scripts/perf-bundle.mjs [--no-build] [--analyze] [--out file]
// The build goes to <evidence>/perf/dist-bundle (never apps/web/dist, never the production Supabase URL); --analyze
// turns on rollup-plugin-visualizer (ANALYZE=1), which is what `pnpm build:report` runs.
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'apps/web');
const args = process.argv.slice(2);
const evidence =
  process.env.ONESHOOT_EVIDENCE_DIR || path.join(os.homedir(), 'oneshoot-rendimiento-integral-tmp');
const dist = path.join(evidence, 'perf', 'dist-bundle');
const outIdx = args.indexOf('--out');
const out =
  outIdx >= 0
    ? path.resolve(args[outIdx + 1])
    : path.join(evidence, 'perf', `bundle-${new Date().toISOString().slice(0, 10)}.json`);

if (!args.includes('--no-build')) {
  // Never the production Supabase: a mock URL is baked into the measured build.
  execSync(`pnpm exec vite build --outDir "${dist}" --emptyOutDir`, {
    cwd: web,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_SUPABASE_URL: 'http://127.0.0.1:54329',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'demo',
      ...(args.includes('--analyze') ? { ANALYZE: '1' } : {}),
    },
  });
}

const gz = (buf) => gzipSync(buf, { level: 9 }).length;
const kb = (n) => Math.round((n / 1024) * 100) / 100;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

// Every JS/CSS file of the build, gzip level 9.
const chunks = {};
for (const file of walk(path.join(dist, 'assets'))) {
  if (!/\.(js|css)$/.test(file)) continue;
  const buf = readFileSync(file);
  chunks['assets/' + path.relative(path.join(dist, 'assets'), file).split(path.sep).join('/')] = {
    bytes: buf.length,
    gzip: gz(buf),
  };
}

// Critical path of `/`: entry script + modulepreloads + linked stylesheets, as index.html declares them.
const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
const rel = (u) => u.replace(/^\//, '');
const attr = (tag, name) => new RegExp(`${name}="([^"]+)"`).exec(tag)?.[1];
const tags = (re) => [...html.matchAll(re)].map((m) => m[0]);
const entries = tags(/<script\b[^>]*\bsrc="[^"]+"[^>]*>/g).map((t) => rel(attr(t, 'src')));
const preloads = tags(/<link\b[^>]*rel="modulepreload"[^>]*>/g).map((t) => rel(attr(t, 'href')));
const styles = tags(/<link\b[^>]*rel="stylesheet"[^>]*>/g)
  .map((t) => attr(t, 'href'))
  .filter((h) => h && !/^https?:/.test(h))
  .map(rel);
const entry = entries[0];
const critical = [...new Set([...entries, ...preloads, ...styles])];
const sizeOf = (f) => chunks[f]?.gzip ?? gz(readFileSync(path.join(dist, f)));
const criticalGzip = critical.reduce((s, f) => s + sizeOf(f), 0);

// Precache: Workbox injects `precacheAndRoute([...])` into sw.js.
const sw = readFileSync(path.join(dist, 'sw.js'), 'utf8');
const manifest = [...sw.matchAll(/\{url:"([^"]+)",revision:(?:"[^"]*"|null)\}/g)].map((m) => m[1]);
let precacheBytes = 0;
const missing = [];
for (const url of manifest) {
  try {
    precacheBytes += statSync(path.join(dist, url.split('?')[0])).size;
  } catch {
    missing.push(url);
  }
}

const result = {
  generatedAt: new Date().toISOString(),
  'M-01': {
    description: 'critical path of /, gzip',
    gzipBytes: criticalGzip,
    gzipKB: kb(criticalGzip),
    files: critical,
  },
  'M-02': {
    description: 'entry chunk, gzip',
    file: entry,
    gzipBytes: sizeOf(entry),
    gzipKB: kb(sizeOf(entry)),
  },
  'M-11': {
    description: 'service worker precache',
    entries: manifest.length,
    bytes: precacheBytes,
    KB: kb(precacheBytes),
    ...(missing.length ? { missing } : {}),
  },
  chunks,
};
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 2));

console.log(`M-01 critical path : ${result['M-01'].gzipKB} kB gzip (${critical.length} files)`);
console.log(`M-02 entry chunk   : ${result['M-02'].gzipKB} kB gzip (${entry})`);
console.log(`M-11 precache      : ${manifest.length} entries, ${result['M-11'].KB} kB`);
console.log(`JSON -> ${out}`);
