import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { DEMO_URL, MOCK_LATENCY_MS, mockUrl, PREVIEW_URL, REPO_DIR, RESULTS_DIR, outputFile } from './env';
import { PROFILE } from './profile';
import { STUBS } from './stubs';

/**
 * REQ-03 · The run's JSON. Each scenario writes its own file while the run goes (so a crash keeps what was measured);
 * the global teardown merges them with the metadata: date, commit, machine and Chromium version.
 */
export interface ScenarioResult {
  id: string;
  title: string;
  /** Spec 3.3 metrics this scenario answers. */
  metrics: string[];
  [key: string]: unknown;
}

const git = (args: string) => {
  try {
    return execSync(`git ${args}`, { cwd: REPO_DIR, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
};

export function recordResult(id: string, payload: Record<string, unknown>): void {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const file = path.join(RESULTS_DIR, `${id}.json`);
  // REQ-03 · commit and date let a PERF_KEEP merge tell a stale scenario from one measured on this code.
  const body = JSON.stringify(
    { id, commit: git('rev-parse HEAD'), date: new Date().toISOString(), ...payload },
    null,
    2,
  );
  // Write aside and rename, so a crash mid-write never leaves a half JSON for the merge to choke on.
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, file);
}

/** A scenario this environment cannot measure is data, not a failure (REQ-03). */
export function recordSkipped(
  id: string,
  title: string,
  reason: string,
  extra: Record<string, unknown> = {},
): void {
  recordResult(id, { title, skipped: reason, ...extra });
}

export async function writeFinalReport(startedAt: Date): Promise<string> {
  const scenarios: Record<string, unknown> = {};
  const currentCommit = git('rev-parse HEAD');
  for (const file of fs.existsSync(RESULTS_DIR) ? fs.readdirSync(RESULTS_DIR).sort() : []) {
    if (!file.endsWith('.json')) continue;
    const id = file.slice(0, -'.json'.length);
    let entry: { id: string; commit?: string | null };
    try {
      entry = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), 'utf8')) as typeof entry;
    } catch {
      scenarios[id] = { id, skipped: 'unreadable result' };
      continue;
    }
    // REQ-03 · PERF_KEEP merges earlier runs; numbers taken on another commit would pass as this code's.
    if (process.env.PERF_KEEP === '1' && currentCommit && entry.commit !== currentCommit) {
      console.warn(
        `perf: dropping ${entry.id} (measured on commit ${entry.commit ?? 'unknown'}, now ${currentCommit})`,
      );
      continue;
    }
    scenarios[entry.id] = entry;
  }
  let chromiumVersion: string | null = null;
  try {
    const browser = await chromium.launch({ channel: 'chromium', args: ['--mute-audio'] });
    chromiumVersion = browser.version();
    await browser.close();
  } catch {
    // The report is worth more than the version string.
  }
  const cpus = os.cpus();
  const dirty = git('status --porcelain');
  const report = {
    meta: {
      date: new Date().toISOString(),
      startedAt: startedAt.toISOString(),
      durationSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
      commit: git('rev-parse HEAD'),
      branch: git('rev-parse --abbrev-ref HEAD'),
      workingTreeChanges: dirty === null ? null : dirty.split('\n').filter(Boolean).length,
      machine: {
        os: `${os.platform()} ${os.release()}`,
        cpu: cpus[0]?.model.trim() ?? 'unknown',
        cores: cpus.length,
        memoryGB: Math.round(os.totalmem() / 2 ** 30),
        node: process.version,
      },
      chromium: chromiumVersion,
      profile: PROFILE,
      // REQ-03 · What each project really applies, and any override that changes the measurement, so a report never
      // claims the 4G profile for runs that did not use it (fluidez runs on the dev server, where it would time Vite).
      effectiveProfile: {
        carga: { cpuThrottlingRate: PROFILE.cpuThrottlingRate, network: PROFILE.network },
        fluidez: {
          cpuThrottlingRate: PROFILE.cpuThrottlingRate,
          network: process.env.PERF_FLUID_NETWORK === '1' ? PROFILE.network : null,
        },
      },
      overrides: Object.fromEntries(
        Object.entries(process.env).filter(([key]) => key.startsWith('PERF_') && key !== 'PERF_OUT'),
      ),
      servers: {
        fluidez: `dev server in demo mode (${DEMO_URL}, VITE_DEMO=true, data only in localStorage)`,
        carga: `vite build + vite preview (${PREVIEW_URL}) against the simulated Supabase (${mockUrl()}, extra latency ${MOCK_LATENCY_MS} ms per request)`,
      },
      stubs: STUBS,
      command: 'pnpm perf',
    },
    scenarios,
  };
  const out = outputFile();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  return out;
}
