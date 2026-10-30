import { describe, expect, it } from 'vitest';
import { addTap, beatsBetween, bpmFromTaps, countAt, nearestBeat, snapFormationsToBeats, validBpm } from './beatRules';

describe('bpmFromTaps', () => {
  it('needs at least 4 taps', () => {
    expect(bpmFromTaps([0, 0.5, 1])).toBeNull();
    expect(bpmFromTaps([0, 0.5, 1, 1.5])).toBe(120);
  });

  it('uses the median, so one sloppy tap does not matter', () => {
    expect(bpmFromTaps([0, 0.5, 1, 1.9, 2.4, 2.9])).toBe(120);
  });

  it('refuses a tempo outside 40–240', () => {
    expect(bpmFromTaps([0, 0.2, 0.4, 0.6, 0.8])).toBeNull(); // 300
    expect(bpmFromTaps([0, 2, 4, 6])).toBeNull(); // 30
    expect(validBpm(40) && validBpm(240)).toBe(true);
    expect(validBpm(241) || validBpm(null)).toBe(false);
  });

  it('starts over after a long pause and keeps the last 16 taps', () => {
    expect(addTap([1, 1.5], 9)).toEqual([9]);
    let taps: number[] = [];
    for (let i = 0; i < 20; i++) taps = addTap(taps, i * 0.5);
    expect(taps).toHaveLength(16);
  });
});

describe('beats', () => {
  it('places the beats and numbers the eights from the first beat', () => {
    const beats = beatsBetween(120, 1, 0, 6);
    expect(beats[0]).toEqual({ t: 0, count: 7, eight: -1 });
    expect(beats[1]).toEqual({ t: 0.5, count: 8, eight: -1 });
    expect(beats[2]).toEqual({ t: 1, count: 1, eight: 0 });
    expect(beats.find((b) => b.t === 5)).toEqual({ t: 5, count: 1, eight: 1 });
    expect(beats.at(-1)!.t).toBe(6);
    expect(beatsBetween(10, 0, 0, 10)).toEqual([]);
  });

  it('finds the nearest beat and the count at a moment', () => {
    expect(nearestBeat(2.2, 120, 1)).toBe(2);
    expect(nearestBeat(2.3, 120, 1)).toBe(2.5);
    expect(countAt(4.5, 120, 1)).toEqual({ count: 8, eight: 0 });
    expect(countAt(5, 120, 1)).toEqual({ count: 1, eight: 1 });
  });

  it('snaps formations onto beats without two on the same one', () => {
    const list = [
      { id: 'a', at: 0.9, transition: 2, positions: {} },
      { id: 'b', at: 2.2, transition: 2, positions: {} },
      { id: 'c', at: 2.1, transition: 2, positions: {} },
    ];
    const out = snapFormationsToBeats(list, 120, 1);
    expect(out.map((f) => [f.id, f.at])).toEqual([
      ['a', 1],
      ['c', 2],
      ['b', 2.1],
    ]);
  });
});
