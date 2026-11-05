/**
 * REQ-03 · Statistics of a measurement: median and p95 (linear interpolation, so 5 samples still give a p95 that
 * moves with the worst one), and the pass runner of spec 3.1: 5 passes, 9 when the spread (p95/p50) goes over 1,3.
 */
export type Sample = number | null | undefined;

export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  const at = (sorted.length - 1) * p;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

export interface Summary {
  n: number;
  median: number;
  p95: number;
  min: number;
  max: number;
  /** p95 / median, or null when the median is 0. */
  spread: number | null;
  values: number[];
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function summarize(samples: Sample[]): Summary | null {
  const values = samples.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (values.length === 0) return null;
  const median = percentile(values, 0.5);
  const p95 = percentile(values, 0.95);
  return {
    n: values.length,
    median: round(median),
    p95: round(p95),
    min: round(Math.min(...values)),
    max: round(Math.max(...values)),
    spread: median > 0 ? round(p95 / median) : null,
    values: values.map(round),
  };
}

export type PassMetrics = Record<string, Sample>;

export interface PassOutcome {
  metrics: PassMetrics;
  /** Free-form evidence of this pass (request waterfall, probe flags…). The last pass's is kept. */
  details?: Record<string, unknown>;
}

export interface Aggregated {
  passes: number;
  extended: boolean;
  metrics: Record<string, Summary | null>;
  details?: Record<string, unknown>;
}

export interface PassOptions {
  passes?: number;
  maxPasses?: number;
  /** Metrics whose spread decides whether more passes are needed. Defaults to every metric. */
  headline?: string[];
  /** Spread over which the run is repeated with more passes (spec: 30 %). */
  threshold?: number;
}

export async function runPasses(
  fn: (pass: number) => Promise<PassOutcome>,
  options: PassOptions = {},
): Promise<Aggregated> {
  // PERF_PASSES=1 is for debugging the harness: one pass, no extension.
  const forced = Number(process.env.PERF_PASSES) || 0;
  const { headline, threshold = 1.3 } = options;
  const passes = forced || options.passes || 5;
  const maxPasses = forced || options.maxPasses || 9;
  const outcomes: PassOutcome[] = [];
  const summarizeAll = (): Aggregated['metrics'] => {
    const keys = new Set(outcomes.flatMap((o) => Object.keys(o.metrics)));
    return Object.fromEntries([...keys].map((k) => [k, summarize(outcomes.map((o) => o.metrics[k]))]));
  };
  const noisy = (metrics: Aggregated['metrics']) =>
    Object.entries(metrics).some(
      ([key, s]) =>
        (!headline || headline.includes(key)) &&
        s !== null &&
        s.spread !== null &&
        s.spread > threshold &&
        s.median > 5,
    );
  for (let i = 0; i < passes; i++) outcomes.push(await fn(i));
  let metrics = summarizeAll();
  let extended = false;
  if (maxPasses > passes && noisy(metrics)) {
    extended = true;
    for (let i = passes; i < maxPasses; i++) outcomes.push(await fn(i));
    metrics = summarizeAll();
  }
  return { passes: outcomes.length, extended, metrics, details: outcomes.at(-1)?.details };
}
