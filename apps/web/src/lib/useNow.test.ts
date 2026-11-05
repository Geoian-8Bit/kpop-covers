// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNow, useNowDate } from './useNow';

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('ticks every interval', () => {
    const { result } = renderHook(() => useNow(1000));
    const first = result.current;
    act(() => void vi.advanceTimersByTime(999));
    expect(result.current).toBe(first);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe(first + 1000);
  });

  it('ignores the return to the front unless asked', () => {
    const plain = renderHook(() => useNow(60_000));
    const eager = renderHook(() => useNow(60_000, { refreshOnVisible: true }));
    const before = plain.result.current;
    vi.setSystemTime(new Date('2026-01-01T10:00:05Z'));
    act(() => setVisibility('visible'));
    expect(plain.result.current).toBe(before);
    expect(eager.result.current).toBe(before + 5000);
  });

  it('useNowDate gives a Date that follows the clock, also on coming back', () => {
    const { result } = renderHook(() => useNowDate());
    expect(result.current).toBeInstanceOf(Date);
    expect(result.current.toISOString()).toBe('2026-01-01T10:00:00.000Z');
    act(() => void vi.advanceTimersByTime(30_000));
    expect(result.current.toISOString()).toBe('2026-01-01T10:00:30.000Z');
    vi.setSystemTime(new Date('2026-01-01T10:01:00Z'));
    act(() => setVisibility('visible'));
    expect(result.current.toISOString()).toBe('2026-01-01T10:01:00.000Z');
  });
});
