import { describe, expect, it } from 'vitest';
import { clockMoved, shouldSwapSource, STALL, stallAction } from './stallRules';

describe('stallAction', () => {
  it('waits quietly during a short wait (a normal seek)', () => {
    expect(stallAction({ stuckMs: 1200, retries: 0, readyState: 2 })).toBe('none');
  });

  it('first plays again when the data is there, else asks for it with a re-seek', () => {
    expect(stallAction({ stuckMs: STALL.firstMs, retries: 0, readyState: 4 })).toBe('play');
    expect(stallAction({ stuckMs: STALL.firstMs, retries: 0, readyState: 2 })).toBe('reseek');
  });

  it('spaces the retries and escalates to a reload', () => {
    const second = STALL.firstMs + STALL.everyMs;
    expect(stallAction({ stuckMs: second - 1, retries: 1, readyState: 1 })).toBe('none');
    expect(stallAction({ stuckMs: second, retries: 1, readyState: 1 })).toBe('reseek');
    expect(stallAction({ stuckMs: STALL.firstMs + 2 * STALL.everyMs, retries: 2, readyState: 1 })).toBe('reload');
  });

  it('reloads a source that never opened', () => {
    expect(stallAction({ stuckMs: STALL.firstMs, retries: 0, readyState: 0 })).toBe('reload');
  });

  it('stops retrying after the last attempt', () => {
    expect(stallAction({ stuckMs: 999_999, retries: STALL.maxRetries, readyState: 1 })).toBe('none');
  });
});

describe('clockMoved', () => {
  it('ignores float noise', () => {
    expect(clockMoved(10, 10.005)).toBe(false);
    expect(clockMoved(10, 10.3)).toBe(true);
    expect(clockMoved(30, 12)).toBe(true);
  });
});

describe('shouldSwapSource', () => {
  it('swaps while paused, stuck or on a jump', () => {
    for (const moment of ['paused', 'stalled', 'seek'] as const) {
      expect(shouldSwapSource({ pending: true, captured: false, moment })).toBe(true);
    }
  });

  it('never cuts smooth playback', () => {
    expect(shouldSwapSource({ pending: true, captured: false, moment: 'playing' })).toBe(false);
  });

  it('never under a recording that taps the element, nor without a copy', () => {
    expect(shouldSwapSource({ pending: true, captured: true, moment: 'paused' })).toBe(false);
    expect(shouldSwapSource({ pending: false, captured: false, moment: 'stalled' })).toBe(false);
  });
});
