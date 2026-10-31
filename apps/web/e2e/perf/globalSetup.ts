import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  DIST_PERF,
  MOCK_LATENCY_MS,
  mockPort,
  mockUrl,
  PERF_DIR,
  PREVIEW_PORT,
  PREVIEW_URL,
  RESULTS_DIR,
  WEB_DIR,
} from './env';
import { writeFinalReport } from './results';
// @ts-expect-error — plain ESM written for the CLI too; its exports are typed by usage here.
import { startMock } from './supabaseMock.mjs';
import { FIXTURE, loadFixture } from '../support/seed';
import { testVideo } from '../support/testVideo';
import { VIDEO_SECONDS, withDuration } from '../support/studioVideo';

/**
 * REQ-03 · Servers for the «carga» scenarios (spec 3.1): a production build of the app pointed at the simulated
 * Supabase, served by `vite preview`. The «fluidez» scenarios use the demo dev server (:5174), which Playwright's
 * webServer reuses when it is already up.
 *
 * Never the real Supabase: the build gets the mock's URL and a dummy key as process variables, which Vite prefers to
 * the `.env.local` that holds the production URL.
 */
const UPLOAD_VIDEO = FIXTURE.uploadVideoId;
const CREW = FIXTURE.crewId;

/**
 * REQ-03 · Titles of the «carga» tests, read from their spec files (`scenario('S-01', 'title', …)` becomes the test
 * `S-01 · title`), so `--grep` is tried against what Playwright really matches. null when they cannot be read.
 */
function loadTitles(): string[] | null {
  try {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scenarios');
    const titles: string[] = [];
    for (const file of fs.readdirSync(dir).filter((f) => /^s0[12]-.*\.spec\.ts$/.test(f))) {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      for (const m of source.matchAll(/scenario\(\s*'(S-\d+)',\s*'([^']*)'/g))
        titles.push(`${m[1]} · ${m[2]}`);
    }
    return titles.length > 0 ? titles : null;
  } catch {
    return null;
  }
}

/** `--project=carga`, `--grep S-03`…: the build and the servers are only worth their minute when a «carga» test runs. */
function needsLoadServers(): boolean {
  const args = process.argv.slice(2);
  const value = (flag: string, short?: string) => {
    for (let i = 0; i < args.length; i++) {
      const a = args[i]!;
      if (a === flag || (short && a === short)) return args[i + 1];
      if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1);
    }
    return undefined;
  };
  const project = value('--project');
  if (project && !project.split(',').includes('carga')) return false;
  const grep = value('--grep', '-g');
  if (grep) {
    try {
      // Playwright compiles --grep case-insensitively.
      const re = new RegExp(grep, 'i');
      const titles = loadTitles();
      // Unknown titles: start the servers unless the grep names a scenario id (S-xx) that is not a «carga» one.
      if (!titles) return !/S-(0[3-9]|1\d)/i.test(grep) || /S-0[12]/i.test(grep);
      return titles.some((title) => re.test(title));
    } catch {
      return true;
    }
  }
  return true;
}

const kill = (child: ChildProcess | null) => {
  if (!child?.pid) return;
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
};

/** True when nothing listens on the loopback port. */
async function portIsFree(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const probe = net.createServer().once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

/** First free loopback port from `from`: another run's mock may hold 54329. */
async function freePort(from: number): Promise<number> {
  for (let port = from; port < from + 50; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const probe = net.createServer().once('error', () => resolve(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error(`no free port from ${from}`);
}

async function waitFor(url: string, ms = 60_000): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${url} did not come up in ${ms / 1000}s`);
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const startedAt = new Date();
  // PERF_KEEP=1 keeps the scenarios already measured, so a few can be re-run and merged into the same report.
  if (process.env.PERF_KEEP !== '1') fs.rmSync(RESULTS_DIR, { recursive: true, force: true });
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.mkdirSync(PERF_DIR, { recursive: true });

  let mock: { close(): Promise<void> } | null = null;
  let preview: ChildProcess | null = null;

  if (needsLoadServers()) {
    process.env.PERF_MOCK_PORT = String(await freePort(mockPort()));
    // 1 · The production build, with the mock URL baked in. PERF_NO_BUILD=1 reuses the last one (debugging the harness).
    if (process.env.PERF_NO_BUILD !== '1' || !fs.existsSync(path.join(DIST_PERF, 'index.html'))) {
      const log = fs.openSync(path.join(PERF_DIR, 'perf-build.log'), 'w');
      // REQ-03 · shell:true joins the arguments unquoted, so a path with spaces is quoted by hand.
      const build = spawnSync(
        'pnpm',
        ['exec', 'vite', 'build', '--outDir', JSON.stringify(DIST_PERF), '--emptyOutDir'],
        {
          cwd: WEB_DIR,
          shell: true,
          stdio: ['ignore', log, log],
          env: {
            ...process.env,
            VITE_SUPABASE_URL: mockUrl(),
            VITE_SUPABASE_PUBLISHABLE_KEY: 'demo',
            APP_BUILD: '1',
          },
        },
      );
      if (build.status !== 0)
        throw new Error(`vite build failed (see ${path.join(PERF_DIR, 'perf-build.log')})`);
    }

    // REQ-03 · Anything started from here on must die with a failed setup, or the next run would reuse a stale server.
    try {
      // 2 · The mock, with the fixture plus a real WebM behind the upload «Ensayo coreo completa» (the mock's own Storage
      // bytes are pseudo-random, not a video; uploading through its public API keeps supabaseMock.mjs untouched).
      const data = loadFixture();
      const bytes = withDuration((await testVideo(undefined, VIDEO_SECONDS)).buffer, VIDEO_SECONDS);
      const storagePath = `${CREW}/${UPLOAD_VIDEO}.webm`;
      const video = data.videos!.find((v) => v.id === UPLOAD_VIDEO)!;
      Object.assign(video, {
        storage_path: storagePath,
        file_size: bytes.length,
        file_duration_seconds: VIDEO_SECONDS,
        duration_seconds: VIDEO_SECONDS,
      });
      mock = await startMock({ port: mockPort(), latency: MOCK_LATENCY_MS, data });
      const up = await fetch(`${mockUrl()}/storage/v1/object/videos/${storagePath}`, {
        method: 'PUT',
        headers: { 'content-type': 'video/webm' },
        body: new Uint8Array(bytes),
      });
      if (!up.ok) throw new Error(`could not put the test video in the mock: ${up.status}`);

      // 3 · vite preview of that build. A busy port means an old preview is alive: it would serve a stale build.
      if (!(await portIsFree(PREVIEW_PORT)))
        throw new Error(`port ${PREVIEW_PORT} is already in use: stop the old vite preview before measuring`);
      const log = fs.openSync(path.join(PERF_DIR, 'perf-preview.log'), 'w');
      preview = spawn(
        'pnpm',
        [
          'exec',
          'vite',
          'preview',
          '--outDir',
          JSON.stringify(DIST_PERF),
          '--port',
          String(PREVIEW_PORT),
          '--strictPort',
          '--host',
          '127.0.0.1',
        ],
        { cwd: WEB_DIR, shell: true, stdio: ['ignore', log, log] },
      );
      await waitFor(`${PREVIEW_URL}/`);
    } catch (error) {
      kill(preview);
      await mock?.close().catch(() => undefined);
      throw error;
    }
  }

  return async () => {
    kill(preview);
    await mock?.close();
    const out = await writeFinalReport(startedAt);
    console.log(`\nperf report: ${out}`);
  };
}
