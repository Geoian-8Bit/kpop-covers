import { describe, expect, it } from 'vitest';
import { countedPace, createSkipWindows } from './paceSkip';

const at = (seconds: number, fps = 60, lost = 0) => ({ drawn: seconds * fps - lost, delivered: seconds * fps, seconds });

describe('take pace skips (P19 review)', () => {
  it('skips the first 2 s of a take', () => {
    const w = createSkipWindows(2);
    w.start(at(0));
    expect(w.skipping()).toBe(true);
    expect(w.tick(at(1))).toBe(false);
    expect(w.tick(at(2, 60, 20))).toBe(true);
    expect(w.skipping()).toBe(false);
    expect(w.skipped(at(30))).toEqual({ drawn: 100, delivered: 120, seconds: 2 });
    expect(countedPace(at(30, 60, 20), w.skipped(at(30, 60, 20)))).toEqual({ drawn: 1680, delivered: 1680, seconds: 28 });
  });

  it('skips 2 s after each resume too, so restarts don’t add up against the margin', () => {
    const w = createSkipWindows(2);
    // Start: 20 frames lost in its first 2 s.
    w.start({ drawn: 0, delivered: 0, seconds: 0 });
    w.tick({ drawn: 100, delivered: 120, seconds: 2 });
    // Clean until 10 s, then a pause; resumed, 20 more lost in the 2 s after.
    w.start({ drawn: 580, delivered: 600, seconds: 10 });
    expect(w.skipping()).toBe(true);
    w.tick({ drawn: 680, delivered: 720, seconds: 12 });
    // Another pause and resume at 20 s, 20 lost again.
    w.start({ drawn: 1280, delivered: 1320, seconds: 20 });
    w.tick({ drawn: 1380, delivered: 1440, seconds: 22 });
    const total = { drawn: 1860, delivered: 1920, seconds: 30 };
    const c = countedPace(total, w.skipped(total));
    expect(c.seconds).toBe(24);
    expect(c.delivered - c.drawn).toBe(0); // the three starts' 60 lost frames don't count
  });

  it('a stretch paused before its 2 s, or still open at the end, is skipped up to there', () => {
    const w = createSkipWindows(2);
    w.start({ drawn: 0, delivered: 0, seconds: 0 });
    w.tick({ drawn: 120, delivered: 120, seconds: 2 });
    // Resumed at 10 s, paused again at 11 s (the counts freeze), resumed later.
    w.start({ drawn: 600, delivered: 600, seconds: 10 });
    w.start({ drawn: 660, delivered: 660, seconds: 11 });
    // Finished 1 s after that resume, the stretch still open.
    const end = { drawn: 720, delivered: 720, seconds: 12 };
    expect(w.skipped(end)).toEqual({ drawn: 240, delivered: 240, seconds: 4 });
    expect(countedPace(end, w.skipped(end)).seconds).toBe(8);
  });

  it('a take shorter than its first 2 s counts nothing', () => {
    const w = createSkipWindows(2);
    w.start({ drawn: 0, delivered: 0, seconds: 0 });
    const end = { drawn: 90, delivered: 90, seconds: 1.5 };
    expect(countedPace(end, w.skipped(end))).toEqual({ drawn: 0, delivered: 0, seconds: 0 });
  });
});
