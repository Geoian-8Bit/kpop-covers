// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TakeItem } from '@/data/takes';
import { useReview } from '@/player/store';
import { NO_FIT, type Fit } from './reviewRules';
import { createStageStore } from './reviewStageStore';
import { useFitAndSplit } from './useFitAndSplit';
import { useSyncAdjust } from './useSyncAdjust';
import { useTakeSaver } from './useTakeSaver';

/**
 * REQ-25 · Fit, hinge and fine sync moved out of the review screen's state into stores. For the same sequence of
 * gestures the values saved on the take must be the ones the screen saved before: the last settled fit (500 ms after
 * it), every sync value through the 600 ms debounce (so the last one), and nothing for the hinge (this visit only).
 */

const mutate = vi.fn();
vi.mock('@/data/takes', () => ({ useUpdateTakeReview: () => ({ mutate }) }));

const take = { id: 't1', fit_scale: 1, fit_x: 0, fit_y: 0 } as TakeItem;

function setup() {
  const stage = createStageStore(NO_FIT);
  const hook = renderHook(() => {
    const adjustSaver = useTakeSaver(
      take,
      () => undefined,
      (adjustStatus) => stage.setState({ adjustStatus }),
    );
    const fitSaver = useTakeSaver(
      take,
      () => undefined,
      (fitStatus) => stage.setState({ fitStatus }),
    );
    return { onAdjust: useSyncAdjust(0, adjustSaver.save), ...useFitAndSplit(stage, take, fitSaver.save) };
  });
  return { stage, ...hook };
}

describe('review saving (REQ-25)', () => {
  const align = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    mutate.mockReset();
    align.mockReset();
    useReview.setState({
      alignOriginal: align,
      timing: { songStart: 0, speed: 1, adjust: 0, offset: 0, onFile: false },
    } as never);
  });
  afterEach(() => vi.useRealTimers());

  it('fine sync: live while dragging, the original placed once on let-go, the last value saved', () => {
    const { result } = setup();
    act(() => {
      result.current.onAdjust(0.1, false);
      result.current.onAdjust(0.2, false);
    });
    expect(useReview.getState().timing.adjust).toBe(0.2);
    expect(align).not.toHaveBeenCalled();
    act(() => result.current.onAdjust(0.25, true));
    expect(align).toHaveBeenCalledTimes(1);
    act(() => result.current.onAdjust(0.25, true)); // a let-go reported twice jumps once
    expect(align).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(600));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({ take, patch: { sync_adjust_seconds: 0.25 } });

    // ±0,01 taps: one jump 300 ms after the last, one save.
    act(() => {
      result.current.onAdjust(0.26, 'soon');
      result.current.onAdjust(0.27, 'soon');
    });
    act(() => vi.advanceTimersByTime(300));
    expect(align).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(300));
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate.mock.calls[1]![0]).toEqual({ take, patch: { sync_adjust_seconds: 0.27 } });
  });

  it('overlay fit: every step in the stage store, the settled one saved once', () => {
    const { result, stage } = setup();
    const steps: Fit[] = [
      { scale: 1.1, x: 0.01, y: 0 },
      { scale: 1.2, x: 0.02, y: -0.01 },
      { scale: 1.25, x: 0.03, y: -0.02 },
    ];
    act(() => steps.forEach((f) => result.current.onFit(f, false)));
    expect(stage.getState().fit).toEqual(steps[2]);
    act(() => vi.advanceTimersByTime(1000));
    expect(mutate).not.toHaveBeenCalled();
    act(() => result.current.onFit(steps[2]!, true));
    act(() => vi.advanceTimersByTime(499));
    expect(mutate).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({ take, patch: { fit_scale: 1.25, fit_x: 0.03, fit_y: -0.02 } });
    expect(stage.getState().fitStatus).toBe('saving');
    act(() => (mutate.mock.calls[0]![1] as { onSuccess: () => void }).onSuccess());
    expect(stage.getState().fitStatus).toBe('saved');

    // The same fit settled again saves nothing; «Restablecer» saves the plain fit.
    act(() => result.current.onFit(steps[2]!, true));
    act(() => vi.advanceTimersByTime(1000));
    expect(mutate).toHaveBeenCalledTimes(1);
    act(() => result.current.onResetFit());
    act(() => vi.advanceTimersByTime(500));
    expect(mutate.mock.calls[1]![0]).toEqual({ take, patch: { fit_scale: 1, fit_x: 0, fit_y: 0 } });
  });

  it('hinge and take rect: only the stage store, never saved', () => {
    const { result, stage } = setup();
    act(() => result.current.onSplit({ value: 0.3, direction: 'row' }));
    expect(stage.getState().split).toEqual({ value: 0.3, direction: 'row' });
    act(() => result.current.onTakeRect({ left: 1, top: 2, width: 3, height: 4 }));
    expect(stage.getState().takeRect).toEqual({ left: 1, top: 2, width: 3, height: 4 });
    act(() => result.current.onAutoSplit());
    expect(stage.getState().split).toBeNull();
    act(() => vi.advanceTimersByTime(2000));
    expect(mutate).not.toHaveBeenCalled();
  });

  it('closing within the wait still saves the pending value', () => {
    const { result, unmount } = setup();
    act(() => result.current.onAdjust(-0.2, true));
    unmount();
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({ take, patch: { sync_adjust_seconds: -0.2 } });
  });
});
