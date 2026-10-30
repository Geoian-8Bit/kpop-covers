import { describe, expect, it } from 'vitest';
import {
  CLAP_VERDICT_LABEL,
  clapLogEntry,
  clapThreshold,
  createClapDetector,
  levelToMeter,
  migrateClapSensitivity,
  peakOf,
  type ClapHit,
  type ClapLogEntry,
  type ClapReject,
  type ClapSensitivity,
  type ClapState,
} from './clap';

const FRAME = 1 / 60;

interface Sound {
  at: number;
  /** Peak level. */
  peak: number;
  /** Seconds at the peak before the tail. */
  length?: number;
  /** Seconds the tail takes to fade (reverb). */
  tail?: number;
  /** Seconds to rise from the background to the peak (0 = a sharp attack, like a clap). */
  rise?: number;
}

/** A deterministic room: a background with a little ripple, plus sounds. */
function levelAt(t: number, sounds: Sound[], background: number): number {
  let level = background * (1 + 0.25 * Math.sin(t * 37) * Math.sin(t * 11));
  for (const s of sounds) {
    const length = s.length ?? 0.03;
    const tail = s.tail ?? 0.05;
    if (t < s.at) continue;
    const rise = s.rise ?? 0;
    if (rise > 0 && t < s.at + rise) level = Math.max(level, s.peak * ((t - s.at) / rise));
    else if (t <= s.at + rise + length) level = Math.max(level, s.peak);
    else level = Math.max(level, s.peak * Math.exp(-(t - s.at - rise - length) / (tail / 4)));
  }
  return level;
}

function run(
  sounds: Sound[],
  { seconds = 4, background = 0.01, sensitivity = 'medium' as ClapSensitivity } = {},
): { state: ClapState; firedAt: number | null; hits: { at: number; hit: ClapHit }[] } {
  const detector = createClapDetector({ sensitivity });
  let firedAt: number | null = null;
  const hits: { at: number; hit: ClapHit }[] = [];
  for (let t = 0; t <= seconds; t += FRAME) {
    const reading = detector.push(t, levelAt(t, sounds, background));
    if (reading.hit) hits.push({ at: t, hit: reading.hit });
    if (reading.state === 'fired' && firedAt == null) firedAt = t;
  }
  return { state: detector.state, firedAt, hits };
}

const clap = (at: number, peak = 0.7): Sound => ({ at, peak });

describe('double clap', () => {
  it('fires on two claps 0.4 s apart, at the second one', () => {
    const r = run([clap(1), clap(1.4)]);
    expect(r.state).toBe('fired');
    expect(r.firedAt).toBeGreaterThanOrEqual(1.4);
    expect(r.firedAt).toBeLessThan(1.45);
    expect(r.hits.map((h) => h.hit)).toEqual(['first', 'second']);
  });

  it('fires at both ends of the allowed gap', () => {
    expect(run([clap(1), clap(1.22)]).state).toBe('fired');
    expect(run([clap(1), clap(1.78)]).state).toBe('fired');
  });

  it('a single clap does not fire, and is forgotten after the gap', () => {
    const r = run([clap(1)]);
    expect(r.state).toBe('idle');
    expect(r.hits.map((h) => h.hit)).toEqual(['first']);
  });

  it('claps too far apart do not fire (the second starts over)', () => {
    const r = run([clap(1), clap(2.2)]);
    expect(r.state).toBe('idle');
    expect(r.hits.map((h) => h.hit)).toEqual(['first', 'first']);
    // …and a third close to the second does.
    expect(run([clap(1), clap(2.2), clap(2.6)]).state).toBe('fired');
  });

  it('an echo right after a clap counts as the same clap', () => {
    // A reflection 0.12 s later, weaker: not a second clap.
    const r = run([clap(1, 0.8), { at: 1.12, peak: 0.45 }]);
    expect(r.state).toBe('idle');
    expect(r.hits.map((h) => h.hit)).toEqual(['first', 'echo']);
  });

  it('a long reverberant tail does not turn a clap into a long sound', () => {
    const r = run([{ at: 1, peak: 0.9, tail: 0.6 }, { at: 1.5, peak: 0.9, tail: 0.6 }]);
    expect(r.state).toBe('fired');
  });

  it('a long sound is not a clap and cancels a clap waiting for its pair', () => {
    // Someone shouts right after the first clap, then claps again.
    expect(run([clap(1), { at: 1.15, peak: 0.6, length: 0.7 }, clap(1.6)]).state).toBe('idle');
    // Music or a voice alone never fires.
    expect(run([{ at: 1, peak: 0.6, length: 2 }]).state).toBe('idle');
  });

  it('does not count anything while it is still measuring the room', () => {
    expect(run([clap(0.1), clap(0.4)]).state).toBe('idle');
  });
});

describe('background noise', () => {
  it('a loud room raises the threshold: its noise alone never fires', () => {
    const r = run([], { background: 0.2, seconds: 6 });
    expect(r.state).toBe('idle');
    expect(r.hits).toEqual([]);
  });

  it('claps clearly above a loud room still fire', () => {
    expect(run([clap(3, 0.95), clap(3.45, 0.95)], { background: 0.2, seconds: 5 }).state).toBe('fired');
  });

  it('a room that gets loud mid-way becomes the new background, and claps above it count again', () => {
    const detector = createClapDetector();
    let state: ClapState;
    let firedAt: number | null = null;
    for (let t = 0; t <= 9; t += FRAME) {
      const background = t < 2 ? 0.01 : 0.2;
      state = detector.push(t, levelAt(t, [clap(7, 0.95), clap(7.45, 0.95)], background)).state;
      if (state === 'fired' && firedAt == null) firedAt = t;
    }
    expect(firedAt).toBeGreaterThanOrEqual(7.45);
  });

  it('claps barely above a loud room do not', () => {
    expect(run([clap(3, 0.4), clap(3.45, 0.4)], { background: 0.2, seconds: 5 }).state).toBe('idle');
  });

  it('a burst of noise barely moves the background estimate', () => {
    const detector = createClapDetector();
    let noise = 0;
    for (let t = 0; t <= 3; t += FRAME) noise = detector.push(t, t > 2 && t < 2.1 ? 0.05 : 0.01).noise;
    expect(noise).toBeLessThan(0.015);
  });
});

describe('sensitivity', () => {
  const soft = [clap(1, 0.15), clap(1.4, 0.15)];

  it('high hears soft claps that medium and low ignore… in a quiet room', () => {
    expect(run(soft, { sensitivity: 'high' }).state).toBe('fired');
    expect(run([clap(1, 0.1), clap(1.4, 0.1)], { sensitivity: 'medium' }).state).toBe('idle');
    expect(run(soft, { sensitivity: 'low' }).state).toBe('idle');
  });

  it('low still hears loud claps', () => {
    expect(run([clap(1, 0.8), clap(1.4, 0.8)], { sensitivity: 'low' }).state).toBe('fired');
  });

  it('orders the thresholds low > medium > high and keeps them reachable', () => {
    for (const noise of [0.001, 0.05, 0.5]) {
      expect(clapThreshold(noise, 'low')).toBeGreaterThanOrEqual(clapThreshold(noise, 'medium'));
      expect(clapThreshold(noise, 'medium')).toBeGreaterThanOrEqual(clapThreshold(noise, 'high'));
      expect(clapThreshold(noise, 'low')).toBeLessThan(1);
    }
  });

  it('can be changed while listening', () => {
    const detector = createClapDetector({ sensitivity: 'low' });
    let state: ClapState = 'idle';
    for (let t = 0; t <= 3; t += FRAME) {
      if (t > 0.8 && t < 0.82) detector.setSensitivity('high');
      state = detector.push(t, levelAt(t, soft, 0.01)).state;
    }
    expect(state).toBe('fired');
  });
});

describe('reset and helpers', () => {
  it('reset listens again after firing', () => {
    const detector = createClapDetector();
    for (let t = 0; t <= 2; t += FRAME) detector.push(t, levelAt(t, [clap(1), clap(1.4)], 0.01));
    expect(detector.state).toBe('fired');
    detector.reset();
    expect(detector.state).toBe('idle');
  });

  it('ignores bad input', () => {
    const detector = createClapDetector();
    expect(detector.push(0, Number.NaN).level).toBe(0);
    expect(detector.push(0.1, 7).level).toBe(1);
  });

  it('peakOf and levelToMeter', () => {
    expect(peakOf([0.1, -0.6, 0.3])).toBeCloseTo(0.6);
    expect(peakOf([])).toBe(0);
    expect(levelToMeter(0)).toBe(0);
    expect(levelToMeter(1)).toBe(1);
    expect(levelToMeter(0.5)).toBeGreaterThan(0.85);
    expect(levelToMeter(0.001)).toBe(0);
  });
});

describe('sounds that are not claps (review round 1)', () => {
  it('two syllables that swell in do not fire', () => {
    const syllable = (at: number): Sound => ({ at, peak: 0.6, rise: 0.08, length: 0.1, tail: 0.1 });
    expect(run([syllable(1), syllable(1.45)]).state).not.toBe('fired');
  });

  it('a clap still fires right after a soft swell', () => {
    const r = run([{ at: 0.9, peak: 0.4, rise: 0.1, length: 0.05 }, clap(1.6), clap(2)]);
    expect(r.state).toBe('fired');
  });
});

describe('P42 · the F7 detector is back: what it reports, and the stored sensitivity', () => {
  function verdicts(sounds: Sound[], seconds = 4): (ClapHit | ClapReject)[] {
    const detector = createClapDetector();
    const out: ClapLogEntry[] = [];
    for (let t = 0; t <= seconds; t += FRAME) {
      const e = clapLogEntry(detector.push(t, levelAt(t, sounds, 0.01)));
      if (e) out.push(e);
    }
    return out.map((e) => e.verdict);
  }

  it('the log follows the decisions: two claps, then the signal', () => {
    const detector = createClapDetector();
    const out: ClapLogEntry[] = [];
    for (let t = 0; t <= 2; t += FRAME) {
      const e = clapLogEntry(detector.push(t, levelAt(t, [clap(1), clap(1.4)], 0.01)));
      if (e) out.push(e);
    }
    expect(out.map((e) => e.verdict)).toEqual(['first', 'second']);
    // Loud claps in a quiet room: well over the threshold.
    expect(out[0]!.overThreshold).toBeGreaterThan(3);
    expect(CLAP_VERDICT_LABEL[out[1]!.verdict]).toMatch(/señal/);
  });

  it('says why a loud sound was not a clap: a syllable swells, a shout lasts', () => {
    expect(verdicts([{ at: 1, peak: 0.6, rise: 0.08, length: 0.1, tail: 0.1 }])).toContain('slow');
    expect(verdicts([{ at: 1, peak: 0.6, length: 2 }])).toContain('long');
  });

  it('reporting never changes a decision (same hits as before)', () => {
    const r = run([clap(1, 0.8), { at: 1.12, peak: 0.45 }]);
    expect(r.hits.map((h) => h.hit)).toEqual(['first', 'echo']);
    expect(verdicts([clap(1, 0.8), { at: 1.12, peak: 0.45 }])).toEqual(['first', 'echo']);
  });

  it('keeps the F7 levels: low 5×/0.22, medium 3.5×/0.12, high 2.5×/0.06', () => {
    expect(clapThreshold(0.001, 'low')).toBeCloseTo(0.22);
    expect(clapThreshold(0.001, 'medium')).toBeCloseTo(0.12);
    expect(clapThreshold(0.001, 'high')).toBeCloseTo(0.06);
    expect(clapThreshold(0.1, 'low')).toBeCloseTo(0.5);
    expect(clapThreshold(0.1, 'medium')).toBeCloseTo(0.35);
    expect(clapThreshold(0.1, 'high')).toBeCloseTo(0.25);
  });

  it('a sensitivity stored on the four-level scale maps back: «Muy alta» is «Alta» again', () => {
    expect(migrateClapSensitivity('max')).toBe('high');
    expect(migrateClapSensitivity('high')).toBe('high');
    expect(migrateClapSensitivity('medium')).toBe('medium');
    expect(migrateClapSensitivity('low')).toBe('low');
    expect(migrateClapSensitivity('loud')).toBeNull();
    expect(migrateClapSensitivity(undefined)).toBeNull();
  });
});
