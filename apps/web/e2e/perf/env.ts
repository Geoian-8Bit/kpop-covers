import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE } from '../support/evidence';

/**
 * REQ-03 · Where the measurement harness reads and writes. Everything it produces lives in the evidence folder,
 * outside the repo (spec 8.1). The ports are fixed so the globalSetup, the specs and the docs agree.
 */
export { EVIDENCE };
export const PERF_DIR = path.join(EVIDENCE, 'perf');
/** Playwright's own output (traces, screenshots of failures). It is wiped on every run. */
export const PW_OUTPUT = path.join(PERF_DIR, 'playwright-output');
/** One JSON per scenario while the run goes; globalTeardown merges them. Outside PW_OUTPUT, which Playwright wipes. */
export const RESULTS_DIR = path.join(PERF_DIR, 'perf-run');
/** The production build measured by the «carga» scenarios. */
export const DIST_PERF = path.join(PERF_DIR, 'dist-perf');

export const DEMO_URL = 'http://localhost:5174';
/** `PERF_PREVIEW_PORT` moves it when 4180 is taken by something that is not ours to stop. */
export const PREVIEW_PORT = Number(process.env.PERF_PREVIEW_PORT) || 4180;
export const PREVIEW_URL = `http://127.0.0.1:${PREVIEW_PORT}`;
/**
 * The simulated Supabase. 54329 unless taken (another mock may be running): globalSetup then picks a free port and
 * publishes it in PERF_MOCK_PORT before the build, which bakes the URL in, and before the workers start. Read it
 * through these functions, never at import time.
 */
export const mockPort = () => Number(process.env.PERF_MOCK_PORT ?? 54329);
export const mockUrl = () => `http://127.0.0.1:${mockPort()}`;
/**
 * Latency the simulated Supabase adds per request, on top of the CDP network profile (which already adds 150 ms to
 * everything, loopback included). 0 by default: the profile is the single source of latency, so a number from this
 * harness means «4G lenta» and nothing else. Override with PERF_MOCK_LATENCY_MS to model a far-away database.
 */
export const MOCK_LATENCY_MS = Number(process.env.PERF_MOCK_LATENCY_MS ?? 0);

export const WEB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REPO_DIR = path.join(WEB_DIR, '..', '..');

/** Final JSON: PERF_OUT if given, else <evidence>/perf/perf-<date>.json. */
export function outputFile(): string {
  if (process.env.PERF_OUT) return path.resolve(process.env.PERF_OUT);
  return path.join(PERF_DIR, `perf-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);
}
