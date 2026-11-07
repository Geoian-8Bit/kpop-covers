import { describe, expect, it } from 'vitest';
import { inView, needsWindow, TIMELINE_WINDOW, timelineWindow, viewPct } from './timelineRules';

describe('timelineWindow', () => {
  it('shows a short song whole', () => {
    expect(needsWindow(40)).toBe(false);
    expect(timelineWindow(12, 40)).toEqual({ from: 0, to: 40 });
  });

  it('pages a long song with the playhead, keeping room ahead', () => {
    expect(needsWindow(224)).toBe(true);
    expect(timelineWindow(0, 224)).toEqual({ from: 0, to: TIMELINE_WINDOW });
    expect(timelineWindow(23.9, 224)).toEqual({ from: 0, to: 30 });
    expect(timelineWindow(24, 224)).toEqual({ from: 24, to: 54 });
  });

  it('never runs past the end of the song', () => {
    expect(timelineWindow(223, 224)).toEqual({ from: 194, to: 224 });
    expect(timelineWindow(999, 224)).toEqual({ from: 194, to: 224 });
  });

  it('copes with an unknown length', () => {
    expect(timelineWindow(5, 0)).toEqual({ from: 0, to: 0 });
  });
});

describe('viewPct / inView', () => {
  const view = { from: 24, to: 54 };
  it('places a moment inside the window', () => {
    expect(viewPct(39, view)).toBe(50);
    expect(inView(39, view)).toBe(true);
  });
  it('clamps moments outside it', () => {
    expect(viewPct(10, view)).toBe(0);
    expect(viewPct(80, view)).toBe(100);
    expect(inView(10, view)).toBe(false);
  });
});
