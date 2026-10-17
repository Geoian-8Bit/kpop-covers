/**
 * 15 · Which TensorFlow.js backend «auto» means on this device. Pure rules (no DOM): models.ts gathers the facts,
 * the tests share them.
 *
 *  - WebGPU: Chromium on a computer with a real graphics chip (where TensorFlow.js's WebGPU backend is developed
 *    and tried). On a phone only when the pose test (Ajustes) measured it faster than WebGL here: on phone GPUs it
 *    can be slower for small models and it compiles more at the start.
 *  - WASM (SIMD, one thread): a computer whose WebGL is drawn by the processor (no graphics chip, or one blocked:
 *    SwiftShader, «Microsoft Basic Render Driver», llvmpipe), or where the pose test measured it faster than WebGL.
 *    Never on a phone (it runs on the main thread and would heat it).
 *  - WebGL everywhere else.
 */

export type TfBackend = 'webgl' | 'webgpu' | 'wasm';

/** Milliseconds per MultiPose frame measured by the pose test on this device, per backend (latest run). */
export type BackendBench = Partial<Record<TfBackend, number>>;

export interface BackendEnv {
  hasWebGpu: boolean;
  chromium: boolean;
  adapter: 'real' | 'fallback' | 'none';
  /** WebGPU failed here this session (unavailable, or a model run broke on it). */
  broken: boolean;
  /** A phone or a tablet. */
  mobile?: boolean;
  /** WebGL is drawn by the processor (software renderer). */
  softwareGl?: boolean;
  /** WASM failed here this session. */
  wasmBroken?: boolean;
  bench?: BackendBench | null;
}

/** A clear win only: measurements of one run vary by 10–15 %. */
const FASTER = 0.85;

const faster = (bench: BackendBench | null | undefined, a: TfBackend, b: TfBackend) => {
  const x = bench?.[a];
  const y = bench?.[b];
  return x != null && y != null && x > 0 && y > 0 && x < y * FASTER;
};

export function chooseBackend(env: BackendEnv): TfBackend {
  const mobile = env.mobile ?? false;
  const webgpuOk = !env.broken && env.hasWebGpu && env.chromium && env.adapter === 'real';
  if (mobile) return webgpuOk && faster(env.bench, 'webgpu', 'webgl') ? 'webgpu' : 'webgl';
  if (webgpuOk) return 'webgpu';
  if (!env.wasmBroken && (env.softwareGl || faster(env.bench, 'wasm', 'webgl'))) return 'wasm';
  return 'webgl';
}

/** WebGL drawn by the processor, from the renderer's name (WEBGL_debug_renderer_info). */
export function isSoftwareRenderer(renderer: string | null | undefined): boolean {
  if (!renderer) return false;
  return /swiftshader|basic render driver|llvmpipe|softpipe|software rasterizer|microsoft basic render/i.test(
    renderer,
  );
}

/** A phone or a tablet (an iPad says it is a Mac, but it has a touch screen). */
export function isMobileDevice(nav: { uaMobile?: boolean | null; ua: string; touchPoints: number }): boolean {
  if (nav.uaMobile) return true;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(nav.ua)) return true;
  return /Macintosh/.test(nav.ua) && nav.touchPoints > 1;
}

/**
 * 15 · On a computer, after the first frames on WebGL: try WASM when they took longer than this (a WebGL that is
 * really the processor, which the renderer's name didn't give away).
 */
export const WASM_PROBE_MS = 80;

export function shouldProbeWasm(opts: {
  backend: string;
  mobile: boolean;
  frameMs: number;
  wasmBroken: boolean;
  /** Already tried this session (in this analysis or an earlier one). */
  probed: boolean;
  /** The kept measurements: with both WASM and WebGL measured here, «auto» has already decided. */
  bench?: BackendBench | null;
}): boolean {
  const decided = opts.bench?.wasm != null && opts.bench?.webgl != null;
  return (
    opts.backend === 'webgl' &&
    !opts.mobile &&
    !opts.wasmBroken &&
    !opts.probed &&
    !decided &&
    opts.frameMs > WASM_PROBE_MS
  );
}

/** The probe's verdict: WASM only when clearly faster on the same frames. */
export function wasmWins(wasmMs: number, webglMs: number): boolean {
  return wasmMs > 0 && webglMs > 0 && wasmMs < webglMs * FASTER;
}

/**
 * The probe's outcome from its MultiPose timings (ms a frame, the same measure as the pose test's): what to keep
 * and whether WASM won. Decided on the very numbers kept, so the next session's «auto» says the same.
 */
export function probeOutcome(
  wasmMs: number,
  webglMs: number,
): { wasm: boolean; bench: { wasm: number; webgl: number } } {
  const bench = withBench(withBench({}, 'wasm', wasmMs), 'webgl', webglMs);
  const w = bench.wasm ?? wasmMs;
  const g = bench.webgl ?? webglMs;
  return { wasm: wasmWins(w, g), bench: { wasm: w, webgl: g } };
}

export const BENCH_KEY = 'oneshoot.pose.bench';

export function parseBench(raw: string | null): BackendBench {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v == null) return {};
    const out: BackendBench = {};
    for (const k of ['webgl', 'webgpu', 'wasm'] as const) {
      const n = (v as Record<string, unknown>)[k];
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

export function withBench(bench: BackendBench, backend: string, ms: number): BackendBench {
  if (backend !== 'webgl' && backend !== 'webgpu' && backend !== 'wasm') return bench;
  if (!(ms > 0) || !Number.isFinite(ms)) return bench;
  return { ...bench, [backend]: Math.round(ms * 10) / 10 };
}
