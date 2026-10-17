import { describe, expect, it } from 'vitest';
import {
  analysisDuty,
  BACKGROUND_DUTY_PAUSED,
  BACKGROUND_DUTY_PLAYING,
  BACKGROUND_DUTY_PLAYING_WASM,
  idleAfterMs,
  MAX_RATE,
  MIN_BACKGROUND_RATE,
  playbackRate,
  PRIORITY_DUTY,
  steadyRemaining,
} from './followPlan';

describe('15 · the background part leaves the studio room', () => {
  it('the stretch being waited for works hardest; the rest less, and less still while the studio plays', () => {
    expect(analysisDuty(true, true)).toBe(PRIORITY_DUTY);
    expect(analysisDuty(false, true)).toBe(BACKGROUND_DUTY_PLAYING);
    expect(analysisDuty(false, false)).toBe(BACKGROUND_DUTY_PAUSED);
    expect(BACKGROUND_DUTY_PLAYING).toBeLessThan(BACKGROUND_DUTY_PAUSED);
    expect(BACKGROUND_DUTY_PAUSED).toBeLessThan(PRIORITY_DUTY);
  });

  it('on WASM (the main thread) the background takes less still while the studio plays; the rest is the same', () => {
    expect(analysisDuty(false, true, true)).toBe(BACKGROUND_DUTY_PLAYING_WASM);
    expect(BACKGROUND_DUTY_PLAYING_WASM).toBeLessThan(BACKGROUND_DUTY_PLAYING);
    expect(analysisDuty(false, false, true)).toBe(BACKGROUND_DUTY_PAUSED);
    expect(analysisDuty(true, true, true)).toBe(PRIORITY_DUTY);
  });

  it('the copy plays at the speed that keeps the model to its share of the time', () => {
    // 4 frames a second at 40 ms each: 35 % of the time → 2.19× (it was 4.8× whatever the studio did).
    const rate = playbackRate(4, 0.04, BACKGROUND_DUTY_PLAYING, false);
    expect(rate).toBeCloseTo(2.19, 2);
    // Busy share = fps × rate × cost.
    expect(4 * rate * 0.04).toBeCloseTo(BACKGROUND_DUTY_PLAYING, 5);
    expect(playbackRate(4, 0.001, 0.6, false)).toBe(MAX_RATE);
  });

  it('a slow device: the background goes below real time; the stretch being waited for never does', () => {
    expect(playbackRate(3, 0.3, BACKGROUND_DUTY_PLAYING, false)).toBeCloseTo(0.389, 2);
    expect(playbackRate(3, 2, BACKGROUND_DUTY_PLAYING, false)).toBe(MIN_BACKGROUND_RATE);
    expect(playbackRate(3, 0.3, PRIORITY_DUTY, true)).toBe(1);
  });

  it('frame by frame, it rests after each frame in proportion', () => {
    expect(idleAfterMs(0.1, 0.5)).toBeCloseTo(100);
    expect(idleAfterMs(0.07, 0.35)).toBeCloseTo(130);
    expect(idleAfterMs(0.1, 1)).toBe(0);
    expect(idleAfterMs(10, 0.1)).toBe(2000);
  });
});

describe('15 · the time left does not dance', () => {
  it('an estimate on a boundary keeps the step shown', () => {
    let shown: number | null = null;
    const said: number[] = [];
    for (const s of [24, 22.4, 22.6, 22.4, 22.6, 22.4]) {
      shown = steadyRemaining(shown, s);
      said.push(shown!);
    }
    expect(said).toEqual([25, 20, 20, 20, 20, 20]);
  });

  it('goes up only when clearly longer (two steps), down once half a step under', () => {
    expect(steadyRemaining(20, 27)).toBe(20);
    expect(steadyRemaining(20, 31)).toBe(30);
    expect(steadyRemaining(40, 37.6)).toBe(40);
    expect(steadyRemaining(40, 37.4)).toBe(35);
    expect(steadyRemaining(120, 100)).toBe(120);
    expect(steadyRemaining(120, 85)).toBe(60);
  });

  it('unknown stays unknown', () => {
    expect(steadyRemaining(30, null)).toBeNull();
    expect(steadyRemaining(null, 33)).toBe(35);
  });
});
