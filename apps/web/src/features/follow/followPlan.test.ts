import { describe, expect, it } from 'vitest';
import {
  adaptFps,
  ANALYSIS_FPS,
  backwardChunks,
  createEta,
  planAnalysis,
  planProgress,
  prioritySpan,
  remainingPhrase,
  remainingStep,
  segmentCost,
} from './followPlan';

describe('what is analysed first', () => {
  it('without a range: the next 25 s and the 5 s before, then the rest of the song both ways', () => {
    const plan = planAnalysis({ at: 60, length: 180, both: true });
    expect(plan).toEqual([
      { dir: 'forward', from: 60, to: 85, priority: true },
      { dir: 'backward', from: 55, to: 60, priority: true },
      { dir: 'forward', from: 85, to: 180, priority: false },
      { dir: 'backward', from: 0, to: 55, priority: false },
    ]);
    expect(prioritySpan(plan, 60)).toEqual({ start: 55, end: 85 });
  });

  it('the A–B range or clip being practised comes first when the moment is in it', () => {
    const plan = planAnalysis({ at: 70, length: 180, both: true, focus: { start: 62, end: 95 } });
    expect(plan.filter((s) => s.priority)).toEqual([
      { dir: 'forward', from: 70, to: 95, priority: true },
      { dir: 'backward', from: 62, to: 70, priority: true },
    ]);
    // A range somewhere else is not what is being watched now.
    const away = planAnalysis({ at: 10, length: 180, both: true, focus: { start: 62, end: 95 } });
    expect(away[0]).toEqual({ dir: 'forward', from: 10, to: 35, priority: true });
  });

  it('covers the whole song exactly once', () => {
    for (const at of [0, 3, 60, 170, 180]) {
      const plan = planAnalysis({ at, length: 180, both: true, focus: { start: 50, end: 70 } });
      const covered = plan.reduce((sum, s) => sum + (s.to - s.from), 0);
      expect(covered).toBeCloseTo(180, 5);
    }
  });

  it('a correction only goes forwards from the moment', () => {
    const plan = planAnalysis({ at: 100, length: 158, both: false });
    expect(plan).toEqual([
      { dir: 'forward', from: 100, to: 125, priority: true },
      { dir: 'forward', from: 125, to: 158, priority: false },
    ]);
  });

  it('near the ends there is nothing left to add', () => {
    expect(planAnalysis({ at: 0, length: 20, both: true })).toEqual([
      { dir: 'forward', from: 0, to: 20, priority: true },
    ]);
    expect(planAnalysis({ at: 20, length: 20, both: true })).toEqual([
      { dir: 'backward', from: 15, to: 20, priority: true },
      { dir: 'backward', from: 0, to: 15, priority: false },
    ]);
  });
});

describe('progress of the whole plan', () => {
  it('weighs each part by its length and its cost', () => {
    const plan = planAnalysis({ at: 60, length: 180, both: true });
    const total = plan.reduce((sum, s) => sum + segmentCost(s), 0);
    expect(planProgress(plan, 0, 0)).toBe(0);
    expect(planProgress(plan, 0, 1)).toBeCloseTo(25 / total);
    expect(planProgress(plan, 2, 0.5)).toBeCloseTo((25 + 5 * 1.8 + 95 / 2) / total);
    expect(planProgress(plan, plan.length, 0)).toBe(1);
  });

  it('only grows as the parts go by', () => {
    const plan = planAnalysis({ at: 60, length: 180, both: true });
    let last = -1;
    for (let i = 0; i < plan.length; i++) {
      for (let f = 0; f <= 1; f += 0.1) {
        const p = planProgress(plan, i, f);
        expect(p).toBeGreaterThanOrEqual(last - 1e-9);
        last = p;
      }
    }
  });

  it('backwards in chunks from the end', () => {
    expect(backwardChunks(0, 30, 12)).toEqual([
      { start: 18, end: 30 },
      { start: 6, end: 18 },
      { start: 0, end: 6 },
    ]);
    expect(backwardChunks(5, 5)).toEqual([]);
  });

  it('fewer frames a second only on a slow device, and it stays lowered', () => {
    expect(adaptFps(ANALYSIS_FPS, 40)).toBe(4);
    expect(adaptFps(ANALYSIS_FPS, 220)).toBe(3);
    expect(adaptFps(3, 20)).toBe(3);
  });
});

describe('time left', () => {
  it('unknown at first, then from the recent speed', () => {
    const eta = createEta(8000);
    eta.push(0, 0);
    expect(eta.remaining()).toBeNull();
    eta.push(1000, 0.05);
    expect(eta.remaining()).toBeNull(); // too soon to tell
    eta.push(2000, 0.1);
    // 10 % in 2 s: 90 % left takes 18 s.
    expect(eta.remaining()).toBeCloseTo(18);
  });

  it('follows a change of speed within the window', () => {
    const eta = createEta(4000);
    for (let s = 0; s <= 10; s++) eta.push(s * 1000, s * 0.01); // slow start: 1 % a second
    for (let s = 11; s <= 20; s++) eta.push(s * 1000, 0.1 + (s - 10) * 0.04); // then 4 % a second
    expect(eta.remaining()).toBeCloseTo(0.5 / 0.04, 0);
  });

  it('reads as a short phrase in steps, so it doesn’t flicker', () => {
    expect(remainingPhrase(null)).toBe('');
    expect(remainingPhrase(4)).toBe('quedan menos de 10 s');
    expect(remainingPhrase(38)).toBe('quedan unos 40 s');
    expect(remainingPhrase(41.9)).toBe('quedan unos 40 s');
    expect(remainingPhrase(70)).toBe('queda cerca de 1 min');
    expect(remainingPhrase(170)).toBe('quedan unos 3 min');
    expect(remainingStep(38)).toBe(remainingStep(41.9));
    expect(remainingPhrase(remainingStep(38))).toBe('quedan unos 40 s');
    expect(remainingPhrase(remainingStep(170))).toBe('quedan unos 3 min');
    expect(remainingPhrase(remainingStep(70))).toBe('queda cerca de 1 min');
    expect(remainingPhrase(remainingStep(3))).toBe('quedan menos de 10 s');
  });
});
