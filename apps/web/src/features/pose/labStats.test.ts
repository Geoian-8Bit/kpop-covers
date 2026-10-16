import { describe, expect, it } from 'vitest';
import {
  addRun,
  describeDevice,
  LAB_MAX_RUNS,
  parseRuns,
  percentile,
  runsToText,
  summarize,
  type LabRun,
} from './labStats';

const run = (id: string, extra: Partial<LabRun> = {}): LabRun => ({
  id,
  at: '2026-10-16T20:00:00.000Z',
  model: 'movenet-multipose-lightning',
  backend: 'webgl',
  loadMs: 1234.5,
  firstMs: 300,
  frames: 60,
  avgMs: 20,
  medianMs: 19,
  p95Ms: 30,
  modelFps: 50,
  runFps: 12,
  people: 3,
  video: 'practica.mp4 · 1280×720',
  device: 'Chrome 141 · Windows',
  ...extra,
});

describe('pose lab figures', () => {
  it('percentiles and the summary of a run', () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 100], 95)).toBe(100);
    expect(percentile([], 50)).toBe(0);
    expect(summarize([10, 20, 30, 40], [2, 2, 3, 3], 1000)).toEqual({
      frames: 4,
      avgMs: 25,
      medianMs: 20,
      p95Ms: 40,
      modelFps: 40,
      runFps: 4,
      people: 2.5,
    });
    expect(summarize([], [], 0).frames).toBe(0);
  });

  it('keeps the newest runs, up to the limit, and ignores junk', () => {
    let runs: LabRun[] = [];
    for (let i = 0; i < LAB_MAX_RUNS + 5; i++) runs = addRun(runs, run(`r${i}`));
    expect(runs).toHaveLength(LAB_MAX_RUNS);
    expect(runs[0]!.id).toBe(`r${LAB_MAX_RUNS + 4}`);
    expect(parseRuns(JSON.stringify([run('a'), { nope: 1 }, 3]))).toHaveLength(1);
    expect(parseRuns('{bad json')).toEqual([]);
    expect(parseRuns(null)).toEqual([]);
  });

  it('copies as a tab-separated table', () => {
    const text = runsToText([run('a', { video: 'con\ttab' })]);
    const [head, row] = text.split('\n');
    expect(head!.split('\t')).toHaveLength(14);
    expect(row!.split('\t')).toHaveLength(14);
    expect(row).toContain('con tab');
  });

  it('describes the device briefly', () => {
    expect(
      describeDevice({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
        hardwareConcurrency: 8,
        deviceMemory: 8,
      }),
    ).toBe('Chrome 141 · Windows · 8 núcleos · 8 GB');
    expect(
      describeDevice({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      }),
    ).toBe('Safari 18 · iOS');
  });
});
