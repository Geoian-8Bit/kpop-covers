import { Profiler, type ReactNode } from 'react';

/**
 * REQ-03 · Development-only commit probe. With `localStorage['oneshoot.debug.perf'] === '1'` in a dev build,
 * `<PerfProbe id>` wraps its children in a `React.Profiler` and accumulates commits in `window.__oneshootPerf`
 * so the measurement scripts can count renders per component. In any other case it returns `children` as they
 * are; in production `import.meta.env.DEV` is a build-time `false`, so the minifier drops the Profiler entirely.
 */
interface PerfLogEntry {
  id: string;
  phase: string;
  t: number;
}

export interface OneShootPerf {
  commits: Record<string, number>;
  duration: Record<string, number>;
  log: PerfLogEntry[];
  reset(): void;
}

declare global {
  interface Window {
    __oneshootPerf?: OneShootPerf;
  }
}

const LOG_LIMIT = 5000;

// Read once at module load: a flag flipped later needs a reload, and production never pays for the lookup.
function readFlag(): boolean {
  try {
    return window.localStorage.getItem('oneshoot.debug.perf') === '1';
  } catch {
    return false;
  }
}

// `import.meta.env.DEV` is a build-time false in production: the whole probe folds away there.
const ENABLED: boolean = import.meta.env.DEV && readFlag();

function store(): OneShootPerf {
  return (window.__oneshootPerf ??= {
    commits: {},
    duration: {},
    log: [],
    reset() {
      this.commits = {};
      this.duration = {};
      this.log = [];
    },
  });
}

// Created up front, not on the first commit: a measurement window may open on a screen whose probe mounts only
// inside the measured action (the round runner mounts on «Empezar»), and it must find the store already there.
if (ENABLED) store();

function onRender(id: string, phase: string, actualDuration: number) {
  const perf = store();
  perf.commits[id] = (perf.commits[id] ?? 0) + 1;
  perf.duration[id] = (perf.duration[id] ?? 0) + actualDuration;
  perf.log.push({ id, phase, t: performance.now() });
  if (perf.log.length > LOG_LIMIT) perf.log.splice(0, perf.log.length - LOG_LIMIT);
}

export function PerfProbe({ id, children }: { id: string; children: ReactNode }) {
  if (!ENABLED) return children;
  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
}

/** REQ-03 · Named user-timing mark, invisible to the user; kept in production (negligible cost). */
export function perfMark(name: string) {
  try {
    performance.mark(`oneshoot:${name}`);
  } catch {
    /* no User Timing */
  }
}
