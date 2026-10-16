/**
 * 5.5 · Prueba rápida del análisis de postura: the numbers of a run and how they are kept on this device. Pure
 * (no DOM besides the guarded localStorage access), shared by the lab screen and its tests.
 */

export interface LabRun {
  id: string;
  /** ISO date. */
  at: string;
  model: string;
  /** TensorFlow.js backend («webgl», «webgpu») or MediaPipe delegate («GPU», «CPU»). */
  backend: string;
  /** Download and set-up in this session (0: it was already loaded). */
  loadMs: number;
  /** The first frame alone (the graphics card prepares its programs): left out of the averages. */
  firstMs: number;
  frames: number;
  /** Model time per frame. */
  avgMs: number;
  medianMs: number;
  p95Ms: number;
  /** Frames per second the model alone could do (1000 / average). */
  modelFps: number;
  /** Frames per second of the whole run, seeking included (what an analysis really takes). */
  runFps: number;
  /** People (MoveNet) or poses (MediaPipe) found per frame, on average. */
  people: number;
  video: string;
  device: string;
}

export const LAB_KEY = 'oneshoot.poseLab.results';
export const LAB_MAX_RUNS = 40;

const round = (v: number, places = 1) => {
  const k = 10 ** places;
  return Math.round(v * k) / k;
};

export function percentile(values: readonly number[], p: number): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank]!;
}

/** The figures of a run from the time of each frame (ms), the people found and the whole run's length. */
export function summarize(
  frameMs: readonly number[],
  peoplePerFrame: readonly number[],
  wallMs: number,
): Pick<LabRun, 'frames' | 'avgMs' | 'medianMs' | 'p95Ms' | 'modelFps' | 'runFps' | 'people'> {
  const frames = frameMs.length;
  if (!frames) return { frames: 0, avgMs: 0, medianMs: 0, p95Ms: 0, modelFps: 0, runFps: 0, people: 0 };
  const avg = frameMs.reduce((a, b) => a + b, 0) / frames;
  return {
    frames,
    avgMs: round(avg),
    medianMs: round(percentile(frameMs, 50)),
    p95Ms: round(percentile(frameMs, 95)),
    modelFps: avg > 0 ? round(1000 / avg) : 0,
    runFps: wallMs > 0 ? round((frames * 1000) / wallMs) : 0,
    people: round(peoplePerFrame.reduce((a, b) => a + b, 0) / Math.max(1, peoplePerFrame.length)),
  };
}

const isRun = (v: unknown): v is LabRun =>
  typeof v === 'object' &&
  v != null &&
  typeof (v as LabRun).id === 'string' &&
  typeof (v as LabRun).model === 'string';

/** Newest first; whatever is unreadable is ignored. */
export function parseRuns(raw: string | null): LabRun[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? list.filter(isRun).slice(0, LAB_MAX_RUNS) : [];
  } catch {
    return [];
  }
}

export function addRun(runs: readonly LabRun[], run: LabRun): LabRun[] {
  return [run, ...runs.filter((r) => r.id !== run.id)].slice(0, LAB_MAX_RUNS);
}

export function loadRuns(): LabRun[] {
  try {
    return parseRuns(localStorage.getItem(LAB_KEY));
  } catch {
    return [];
  }
}

export function saveRuns(runs: readonly LabRun[]): void {
  try {
    localStorage.setItem(LAB_KEY, JSON.stringify(runs));
  } catch {
    /* private mode or full: the results stay on screen only */
  }
}

/** A table to paste in the group's chat or a sheet (tab separated, one run per line). */
export function runsToText(runs: readonly LabRun[]): string {
  const head = [
    'fecha',
    'modelo',
    'motor',
    'carga ms',
    'primer fotograma ms',
    'fotogramas',
    'ms/fotograma',
    'mediana',
    'p95',
    'fps modelo',
    'fps análisis',
    'personas',
    'vídeo',
    'dispositivo',
  ];
  const rows = runs.map((r) =>
    [
      r.at,
      r.model,
      r.backend,
      Math.round(r.loadMs),
      Math.round(r.firstMs ?? 0),
      r.frames,
      r.avgMs,
      r.medianMs,
      r.p95Ms,
      r.modelFps,
      r.runFps,
      r.people,
      r.video,
      r.device,
    ]
      .map((v) => String(v).replace(/[\t\n]/g, ' '))
      .join('\t'),
  );
  return [head.join('\t'), ...rows].join('\n');
}

/** «Chrome 141 · Windows · 8 núcleos · 8 GB» from what the browser tells. */
export function describeDevice(nav: {
  userAgent: string;
  hardwareConcurrency?: number;
  deviceMemory?: number;
}): string {
  const ua = nav.userAgent;
  const browser =
    /Edg\/(\d+)/.exec(ua)?.[0]?.replace('Edg/', 'Edge ') ??
    /Chrome\/(\d+)/.exec(ua)?.[0]?.replace('Chrome/', 'Chrome ') ??
    (/Version\/(\d+).*Safari/.exec(ua) ? `Safari ${/Version\/(\d+)/.exec(ua)![1]}` : null) ??
    /Firefox\/(\d+)/.exec(ua)?.[0]?.replace('Firefox/', 'Firefox ') ??
    'Navegador';
  const os =
    /Android [\d.]+/.exec(ua)?.[0] ??
    (/iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'otro');
  const parts = [browser, os];
  if (nav.hardwareConcurrency) parts.push(`${nav.hardwareConcurrency} núcleos`);
  if (nav.deviceMemory) parts.push(`${nav.deviceMemory} GB`);
  return parts.join(' · ');
}
