import type { Clip } from '@coverscape/shared';
import { describe, expect, it } from 'vitest';
import {
  clipEditError,
  clipEditLimit,
  clipEditOf,
  clipEditPatch,
  clipRangeError,
  findDuplicateClip,
  markAt,
  nudgeTime,
  patchChangesPlayback,
  sortClips,
} from './clipRules';

const clip = (over: Partial<Clip> = {}): Clip =>
  ({
    id: 'c1',
    video_id: 'v1',
    crew_id: 'k1',
    name: 'Estribillo',
    color: 'wine',
    is_pinned: false,
    speed: 0.75,
    mirrored: true,
    start_seconds: 12.3,
    end_seconds: 20.5,
    ...over,
  }) as Clip;

describe('nudgeTime', () => {
  it('steps by tenths without float drift', () => {
    let t = 12.3;
    for (let i = 0; i < 7; i++) t = nudgeTime(t, 0.1, 200);
    expect(t).toBe(13);
  });

  it('never goes before 0 or past the end of the song', () => {
    expect(nudgeTime(0.4, -1, 200)).toBe(0);
    expect(nudgeTime(199.5, 1, 200)).toBe(200);
  });

  it('only stops at 0 while the length is unknown', () => {
    expect(nudgeTime(500, 1, 0)).toBe(501);
  });

  it('marks from the playhead with the same limits', () => {
    expect(markAt(15.23456, 200)).toBe(15.235);
    expect(markAt(250, 200)).toBe(200);
  });
});

describe('clipRangeError', () => {
  it('accepts a range inside the song', () => {
    expect(clipRangeError(10, 20, 180)).toBeNull();
  });

  it('wants the start before the end', () => {
    expect(clipRangeError(20, 20, 180)).toMatch(/después del inicio/);
    expect(clipRangeError(21, 20, 180)).toMatch(/después del inicio/);
  });

  it('refuses ranges shorter than the smallest loop', () => {
    expect(clipRangeError(10, 10.1, 180)).toMatch(/demasiado corto/);
    expect(clipRangeError(10, 10.2, 180)).toBeNull();
  });

  it('keeps the range inside the song', () => {
    expect(clipRangeError(-1, 5, 180)).toMatch(/antes de 0:00/);
    expect(clipRangeError(170, 181, 180)).toMatch(/final de la canción \(3:00\)/);
    expect(clipRangeError(180, 185, 180)).toMatch(/inicio pasa/);
    // The media's own length rounds a little: an end right on it is fine.
    expect(clipRangeError(170, 180.03, 180)).toBeNull();
  });

  it('only checks the order while the length is unknown', () => {
    expect(clipRangeError(500, 520, 0)).toBeNull();
  });

  it('rejects times that are not numbers', () => {
    expect(clipRangeError(Number.NaN, 5, 180)).toMatch(/válidos/);
  });
});

describe('clipEditError', () => {
  it('asks for a name first', () => {
    expect(clipEditError({ ...clipEditOf(clip()), name: '   ' }, 180)).toMatch(/nombre/);
  });

  it('then checks the range', () => {
    expect(clipEditError({ ...clipEditOf(clip()), end_seconds: 5 }, 180)).toMatch(/después del inicio/);
    expect(clipEditError(clipEditOf(clip()), 180)).toBeNull();
  });
});

describe('clipEditPatch', () => {
  it('is empty when nothing changed', () => {
    expect(clipEditPatch(clip(), clipEditOf(clip()))).toEqual({});
  });

  it('carries only the changed columns, tidied', () => {
    const patch = clipEditPatch(clip(), {
      ...clipEditOf(clip()),
      name: '  Puente ',
      color: 'teal',
      is_pinned: true,
      speed: 0.62,
      mirrored: false,
      start_seconds: 11.30000001,
      end_seconds: 20.5,
    });
    expect(patch).toEqual({ name: 'Puente', color: 'teal', is_pinned: true, speed: 0.6, mirrored: false, start_seconds: 11.3 });
  });

  it('tells a playback change from a label change', () => {
    expect(patchChangesPlayback({ name: 'Otro', color: 'gold', is_pinned: true })).toBe(false);
    expect(patchChangesPlayback({ end_seconds: 30 })).toBe(true);
    expect(patchChangesPlayback({ speed: 1 })).toBe(true);
    expect(patchChangesPlayback({ mirrored: false })).toBe(true);
  });
});

describe('findDuplicateClip', () => {
  const list = [clip(), clip({ id: 'c2', start_seconds: 30, end_seconds: 40, speed: 1, mirrored: false })];

  it('finds a clip with the same range, speed and mirror', () => {
    expect(findDuplicateClip(list, { start: 30, end: 40, speed: 1, mirrored: false })?.id).toBe('c2');
  });

  it('ignores clips that differ in any of them', () => {
    expect(findDuplicateClip(list, { start: 30, end: 40, speed: 1, mirrored: true })).toBeUndefined();
    expect(findDuplicateClip(list, { start: 30, end: 40.1, speed: 1, mirrored: false })).toBeUndefined();
  });

  it('never counts the clip being edited as its own copy', () => {
    expect(findDuplicateClip(list, { start: 12.3, end: 20.5, speed: 0.75, mirrored: true }, 'c1')).toBeUndefined();
  });
});

describe('sortClips', () => {
  it('orders by start without touching the input', () => {
    const input = [clip({ id: 'b', start_seconds: 40 }), clip({ id: 'a', start_seconds: 5 })];
    expect(sortClips(input).map((c) => c.id)).toEqual(['a', 'b']);
    expect(input[0]!.id).toBe('b');
  });
});

describe('clipEditLimit', () => {
  it('never blocks a clip that ends past the file it is edited on', () => {
    // Cut on YouTube up to 200.4 s; the linked file reports 200.0 s.
    const long = clip({ start_seconds: 190, end_seconds: 200.4 });
    const limit = clipEditLimit(long, 200);
    expect(limit).toBe(200.4);
    expect(clipEditError({ ...clipEditOf(long), name: 'Final' }, limit)).toBeNull();
    // Its end isn't pulled back by a nudge on the start either.
    expect(nudgeTime(long.end_seconds, 0.1, limit)).toBe(200.4);
  });

  it('keeps the stage length when it is the longer one', () => {
    expect(clipEditLimit(clip(), 180)).toBe(180);
  });

  it('stays unknown while the length is', () => {
    expect(clipEditLimit(clip(), 0)).toBe(0);
  });
});
