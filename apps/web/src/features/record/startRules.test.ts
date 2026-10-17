import { describe, expect, it } from 'vitest';
import { clipSection, currentChoice, nextStartKind, startKinds, startLabel } from './startRules';

describe('start point (P22)', () => {
  it('offers the moment only when it is not the start nor the end', () => {
    expect(startKinds({ hereAt: 0, duration: 200, hasRange: false })).toEqual(['start']);
    expect(startKinds({ hereAt: 26, duration: 200, hasRange: false })).toEqual(['start', 'here']);
    expect(startKinds({ hereAt: 199, duration: 200, hasRange: true })).toEqual(['start', 'range']);
    expect(startKinds({ hereAt: 26, duration: 0, hasRange: true })).toEqual(['start', 'here', 'range']);
  });

  it('a tap goes round', () => {
    const kinds = startKinds({ hereAt: 26, duration: 200, hasRange: true });
    expect(nextStartKind('start', kinds)).toBe('here');
    expect(nextStartKind('here', kinds)).toBe('range');
    expect(nextStartKind('range', kinds)).toBe('start');
    expect(nextStartKind('here', ['start'])).toBe('start');
  });

  it('names a section that is a clip after the clip', () => {
    const clip = { id: 'c1', name: 'Estribillo', start_seconds: 43, end_seconds: 60 };
    expect(currentChoice({ kind: 'range', hereAt: 0, range: { start: 43, end: 60 }, clip })).toEqual({
      kind: 'clip',
      clipId: 'c1',
      start: 43,
      end: 60,
      name: 'Estribillo',
    });
    expect(currentChoice({ kind: 'range', hereAt: 0, range: { start: 40, end: 60 }, clip }).kind).toBe('range');
    expect(currentChoice({ kind: 'range', hereAt: 0, range: null, clip }).kind).toBe('start');
    expect(currentChoice({ kind: 'here', hereAt: 26, range: null, clip: null })).toEqual({ kind: 'here', at: 26 });
  });

  it('writes the value out', () => {
    expect(startLabel({ kind: 'start' }).short).toBe('Inicio');
    expect(startLabel({ kind: 'here', at: 26 }).short).toBe('0:26');
    expect(startLabel({ kind: 'range', start: 43, end: 60 }).short).toBe('Tramo A–B');
    expect(startLabel({ kind: 'clip', clipId: 'c', start: 43, end: 60, name: 'Estribillo' }).spoken).toBe(
      'el clip «Estribillo», de 0:43 a 1:00',
    );
  });
});

describe('a clip picked as the start (P22 review)', () => {
  it('becomes its span only, and only when it fits in the video', () => {
    expect(clipSection({ start_seconds: 30, end_seconds: 45 }, 200)).toEqual({ start: 30, end: 45 });
    expect(clipSection({ start_seconds: 45, end_seconds: 30 }, 200)).toEqual({ start: 30, end: 45 });
    expect(clipSection({ start_seconds: 190, end_seconds: 230 }, 200)).toEqual({ start: 190, end: 200 });
    expect(clipSection({ start_seconds: 250, end_seconds: 260 }, 200)).toBeNull();
    // Duration not known yet: the clip's own end stands in.
    expect(clipSection({ start_seconds: 10, end_seconds: 20 }, 0)).toEqual({ start: 10, end: 20 });
  });
});
