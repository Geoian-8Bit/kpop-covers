import type { Clip, Note } from '@coverscape/shared';
import { describe, expect, it } from 'vitest';
import {
  assignLanes,
  buildPaths,
  H,
  layoutNoteDots,
  localPeakY,
  POINTS,
  seededSwell,
  W,
  waveY,
} from './timelineGeometry';

const clip = (id: string, start: number, end: number) =>
  ({ id, start_seconds: start, end_seconds: end }) as unknown as Clip;
const note = (id: string, at: number) => ({ id, at_seconds: at }) as unknown as Note;

describe('timelineGeometry · seededSwell', () => {
  it('is deterministic per seed and stays within 0.05..1', () => {
    const a = seededSwell('song-1');
    expect(a).toEqual(seededSwell('song-1'));
    expect(a).not.toEqual(seededSwell('song-2'));
    expect(a).toHaveLength(POINTS + 1);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0.05);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('timelineGeometry · buildPaths', () => {
  it('draws the line across the whole width and closes the area at the bottom', () => {
    const levels = Array.from({ length: POINTS + 1 }, () => 0.5);
    const { line, area } = buildPaths(levels);
    expect(line.startsWith(`M0,${H - 49}`)).toBe(true);
    expect(line.endsWith(`L${W},${H - 49}`)).toBe(true);
    expect(area).toBe(`${line} L${W},${H} L0,${H} Z`);
  });
});

describe('timelineGeometry · assignLanes', () => {
  it('puts overlapping (or nearly touching) clips on separate lanes and reuses free ones', () => {
    const { lanes, count } = assignLanes(
      [clip('a', 0, 10), clip('b', 5, 15), clip('c', 10.5, 20), clip('d', 30, 40)],
      100,
    );
    expect(lanes.get('a')).toBe(0);
    expect(lanes.get('b')).toBe(1);
    // The gap is 1.5 % of the song (1.5 s here): c starts 0.5 s after a ends, too close to share its lane.
    expect(lanes.get('c')).toBe(2);
    expect(lanes.get('d')).toBe(0);
    expect(count).toBe(3);
  });

  it('has no lanes without clips', () => {
    expect(assignLanes([], 100).count).toBe(0);
  });
});

describe('timelineGeometry · waveY / localPeakY', () => {
  const flat = Array.from({ length: POINTS + 1 }, () => 0.5);
  it('reads the height of the line as a fraction of the track', () => {
    expect(waveY(flat, 0.3)).toBeCloseTo((H - 49) / H);
    expect(waveY(flat, -1)).toBeCloseTo(waveY(flat, 0));
    expect(waveY(flat, 2)).toBeCloseTo(waveY(flat, 1));
  });
  it('finds the highest point around a position', () => {
    const hill = flat.map((v, i) => (i === 45 ? 1 : v));
    expect(localPeakY(hill, 0.5)).toBeCloseTo((H - 84) / H);
    expect(localPeakY(hill, 0.1)).toBeCloseTo((H - 49) / H);
  });
});

describe('timelineGeometry · layoutNoteDots', () => {
  const flat = Array.from({ length: POINTS + 1 }, () => 0.5);
  it('places each dot above the wave and steps up notes that are close together', () => {
    const [a, b, c] = layoutNoteDots([note('a', 10), note('b', 11), note('c', 50)], flat, 100);
    expect(a!.f).toBeCloseTo(0.1);
    expect(a!.dot).toBeLessThan(a!.anchor);
    expect(b!.dot).toBeCloseTo(a!.dot - 0.13);
    expect(c!.dot).toBeCloseTo(a!.dot);
  });
});
