import type { Browser, Page } from '@playwright/test';
import { percentile, type PassMetrics } from './stats';

/**
 * REQ-03 · In-page probes and the readers of spec 3.2:
 *   M-03/M-04 LCP · M-05/M-13 marks and measures · M-08 React commits per second (the dev probe) ·
 *   M-09 frame duration p50/p95 and Long Animation Frames · M-10 Paint events per second (a CDP trace).
 */

/** Installed before the app runs (context.addInitScript): observers that must see the page from its first byte. */
export function pageProbes(): void {
  type W = Window & { __perf?: unknown; __frames?: unknown };
  const w = window as W;
  const state = {
    lcp: null as { time: number; size: number; tag: string; url: string } | null,
    loaf: [] as { start: number; duration: number; blocking: number }[],
  };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & {
        size: number;
        url: string;
        element?: Element;
      })[])
        state.lcp = { time: e.startTime, size: e.size, tag: e.element?.tagName ?? '', url: e.url ?? '' };
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    /* not supported: LCP stays null and is reported as such */
  }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { blockingDuration?: number })[])
        state.loaf.push({ start: e.startTime, duration: e.duration, blocking: e.blockingDuration ?? 0 });
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {
    /* Long Animation Frames need Chromium 123+ */
  }
  const frames = { running: false, last: 0, durations: [] as number[], t0: 0 };
  const tick = (t: number) => {
    if (!frames.running) return;
    if (frames.last) frames.durations.push(t - frames.last);
    frames.last = t;
    requestAnimationFrame(tick);
  };
  w.__perf = state;
  w.__frames = {
    start() {
      frames.running = true;
      frames.last = 0;
      frames.durations = [];
      frames.t0 = performance.now();
      requestAnimationFrame(tick);
    },
    stop() {
      frames.running = false;
      const t1 = performance.now();
      return {
        durations: frames.durations,
        t0: frames.t0,
        t1,
        loaf: state.loaf.filter((l) => l.start >= frames.t0 - 1 && l.start <= t1),
      };
    },
  };
}

export interface Lcp {
  time: number;
  size: number;
  tag: string;
  url: string;
}

export async function readLcp(page: Page): Promise<Lcp | null> {
  return page.evaluate(() => (window as unknown as { __perf?: { lcp: Lcp | null } }).__perf?.lcp ?? null);
}

/** A mark of the app (`oneshoot:*`), as milliseconds since navigation start; null if it was never set. */
export async function markTime(page: Page, name: string): Promise<number | null> {
  return page.evaluate((n) => performance.getEntriesByName(n, 'mark').at(-1)?.startTime ?? null, name);
}

/** M-13 · `performance.measure` between two marks. Null if a mark is missing. */
export async function measureMarks(
  page: Page,
  name: string,
  from: string,
  to: string,
): Promise<number | null> {
  return page.evaluate(
    ([n, a, b]) => {
      try {
        return performance.measure(n!, a!, b!).duration;
      } catch {
        return null;
      }
    },
    [name, from, to] as const,
  );
}

/** Puts a mark of the harness itself (the user's action) so `measureMarks` can span it to an app mark. */
export async function mark(page: Page, name: string): Promise<void> {
  await page.evaluate((n) => performance.mark(n), name);
}

// ───────────────────────────── React commits (M-08) ─────────────────────────────

interface ProbeState {
  commits: Record<string, number>;
  duration: Record<string, number>;
}
type ProbeWindow = Window & { __oneshootPerf?: ProbeState & { reset?: () => void } };

/** The dev probe is on only with `localStorage['oneshoot.debug.perf']='1'` (set by the fluid seed) in a dev server. */
export async function probeAvailable(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean((window as ProbeWindow).__oneshootPerf));
}
export async function resetCommits(page: Page): Promise<void> {
  await page.evaluate(() => (window as ProbeWindow).__oneshootPerf?.reset?.());
}
export async function readCommits(page: Page): Promise<ProbeState | null> {
  return page.evaluate(() => {
    const p = (window as ProbeWindow).__oneshootPerf;
    return p ? { commits: { ...p.commits }, duration: { ...p.duration } } : null;
  });
}

// ───────────────────────────── a measured window ─────────────────────────────

export interface WindowOptions {
  /** Count Paint events with a CDP trace (heavy: the passes that use it are kept apart from the frame passes). */
  trace?: boolean;
}

type Raw = { durations: number[]; t0: number; t1: number; loaf: { duration: number; blocking: number }[] };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Frame statistics from the rAF sampler: p50/p95 duration, frames over 50 ms, Long Animation Frames. */
export function frameStats(raw: Raw) {
  const d = raw.durations;
  return {
    frames: d.length,
    seconds: (raw.t1 - raw.t0) / 1000,
    p50: d.length ? r1(percentile(d, 0.5)) : null,
    p95: d.length ? r1(percentile(d, 0.95)) : null,
    max: d.length ? r1(Math.max(...d)) : null,
    over50: d.filter((x) => x > 50).length,
    loaf: raw.loaf.length,
    loafBlockingMs: r1(raw.loaf.reduce((s, l) => s + l.blocking, 0)),
  };
}

export interface WindowResult {
  metrics: PassMetrics;
  details: Record<string, unknown>;
}

/**
 * Opens a measured window: resets the commit probe, starts the rAF sampler and (optionally) a trace. `stop()` returns
 * flat metrics named after spec 3.2 (`m09.*`, `m08.*`, `m10.*`) plus the raw evidence in `details`.
 */
export async function startWindow(page: Page, browser: Browser, options: WindowOptions = {}) {
  const probe = await probeAvailable(page);
  if (probe) await resetCommits(page);
  if (options.trace) await browser.startTracing(page, { categories: ['devtools.timeline'] });
  await page.evaluate(() => (window as unknown as { __frames: { start(): void } }).__frames.start());
  const started = Date.now();
  return {
    async stop(): Promise<WindowResult> {
      const raw = await page.evaluate(() =>
        (window as unknown as { __frames: { stop(): Raw } }).__frames.stop(),
      );
      const wallSeconds = (Date.now() - started) / 1000;
      let paints: number | null = null;
      if (options.trace) paints = countPaints(await browser.stopTracing());
      const f = frameStats(raw);
      const metrics: PassMetrics = {
        'm09.frameP50Ms': f.p50,
        'm09.frameP95Ms': f.p95,
        'm09.frameMaxMs': f.max,
        'm09.framesOver50ms': f.over50,
        'm09.longAnimationFrames': f.loaf,
        'm09.loafBlockingMs': f.loafBlockingMs,
        'm09.framesPerSecond': f.seconds > 0 ? r1(f.frames / f.seconds) : null,
      };
      if (options.trace) metrics['m10.paintsPerSecond'] = paints === null ? null : r1(paints / wallSeconds);
      const details: Record<string, unknown> = { window: f, commitProbe: probe };
      if (probe) {
        const state = await readCommits(page);
        const seconds = f.seconds || wallSeconds;
        for (const [id, n] of Object.entries(state?.commits ?? {}))
          metrics[`m08.commitsPerSecond.${id}`] = r1(n / seconds);
        details.commits = state;
      }
      return { metrics, details };
    },
  };
}

/** `Paint` events in a Chromium trace (category devtools.timeline), as M-10 asks. */
export function countPaints(trace: Buffer): number {
  const parsed = JSON.parse(trace.toString('utf8')) as
    { traceEvents?: { name?: string }[] } | { name?: string }[];
  const events = Array.isArray(parsed) ? parsed : (parsed.traceEvents ?? []);
  return events.filter((e) => e.name === 'Paint').length;
}
