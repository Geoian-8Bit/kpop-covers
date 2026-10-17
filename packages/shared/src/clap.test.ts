import { describe, expect, it } from 'vitest';
import {
  CLAP_LEVELS,
  CLAP_SCALE,
  CLAP_SENSITIVITIES,
  clapLogEntry,
  clapRejection,
  CLAP_VERDICT_LABEL,
  clapsAlike,
  clapThreshold,
  createClapDetector,
  DECIDE_AFTER,
  levelToMeter,
  migrateClapSensitivity,
  peakOf,
  samplesSince,
  type ClapFeatures,
  type ClapLogEntry,
  type ClapHit,
  type ClapReject,
  type ClapSensitivity,
  type ClapState,
} from './clap';

// ───────────── Synthetic room: sample-level signals ─────────────

/** Deterministic noise (mulberry32 + Box–Muller). */
function noiseSource(seed: number) {
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
}

/** In-place 2nd-order high-pass (test-side, independent of the detector's own filters). */
function highPass(x: Float32Array, hz: number, sr: number) {
  const w = (2 * Math.PI * hz) / sr;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / Math.SQRT2;
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / 2 / a0;
  const b1 = -(1 + cos) / a0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = b0 * x[i]! + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i]!;
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
}

function normalize(x: Float32Array, peak: number) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] = (x[i]! * peak) / m;
}

type Sound = (buf: Float32Array, sr: number, gauss: () => number) => void;

function addAt(buf: Float32Array, sr: number, at: number, part: Float32Array) {
  const start = Math.round(at * sr);
  for (let i = 0; i < part.length && start + i < buf.length; i++) buf[start + i]! += part[i]!;
}

/** Attack (linear) then exponential decay; t and times in ms. */
const envelope = (t: number, attackMs: number, tauMs: number) =>
  t < attackMs ? t / attackMs : Math.exp(-(t - attackMs) / tauMs);

/** A bright noise burst: the sound of a crack, a click or a clap. */
function burst(sr: number, gauss: () => number, peak: number, attackMs: number, tauMs: number, hz = 1000) {
  const len = Math.round(((attackMs + tauMs * 8) / 1000) * sr);
  const b = new Float32Array(len);
  for (let i = 0; i < len; i++) b[i] = gauss() * envelope((i / sr) * 1000, attackMs, tauMs);
  highPass(b, hz, sr);
  normalize(b, peak);
  return b;
}

/** Hand clap: white noise high-passed, attack < 2 ms, decay of a few ms (gone in ~10–30 ms); optional room tail. */
const clap =
  (at: number, peak = 0.6, o: { attackMs?: number; tauMs?: number; reverb?: number } = {}): Sound =>
  (buf, sr, gauss) => {
    addAt(buf, sr, at, burst(sr, gauss, peak, o.attackMs ?? 0.8, o.tauMs ?? 5));
    if (o.reverb) {
      const len = Math.round(0.5 * sr);
      const tail = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = (i / sr) * 1000;
        tail[i] = gauss() * Math.min(1, t / 3) * Math.exp(-t / 80);
      }
      highPass(tail, 1000, sr);
      normalize(tail, peak * o.reverb);
      addAt(buf, sr, at + 0.002, tail);
    }
  };

/** A dull hit: a low tone (chair leg, table, door, heel) plus a small bright click on top. */
const knock =
  (
    at: number,
    o: { amp?: number; hz?: number; attackMs?: number; tauMs?: number; click?: number; clickAttackMs?: number; clickTauMs?: number } = {},
  ): Sound =>
  (buf, sr, gauss) => {
    const amp = o.amp ?? 0.7;
    const hz = o.hz ?? 110;
    const attackMs = o.attackMs ?? 6;
    const tauMs = o.tauMs ?? 40;
    const len = Math.round(((attackMs + tauMs * 8) / 1000) * sr);
    const tone = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const wave = (Math.sin(2 * Math.PI * hz * t) + 0.5 * Math.sin(4 * Math.PI * hz * t)) / 1.5;
      tone[i] = amp * wave * envelope(t * 1000, attackMs, tauMs);
    }
    addAt(buf, sr, at, tone);
    const click = o.click ?? 0.35;
    if (click > 0) addAt(buf, sr, at, burst(sr, gauss, amp * click, o.clickAttackMs ?? 1, o.clickTauMs ?? 12));
  };

/** A footstep: a deep thud with a slower, softer heel tick. */
const step = (at: number, amp = 0.6): Sound =>
  knock(at, { amp, hz: 70, attackMs: 10, tauMs: 50, click: 0.3, clickAttackMs: 3, clickTauMs: 20 });

/** A chair dragged: a bright scrape that swells in and goes on. */
const scrape =
  (at: number, amp = 0.4, seconds = 0.35): Sound =>
  (buf, sr, gauss) => {
    const len = Math.round(seconds * sr);
    const b = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      b[i] = gauss() * Math.min(1, t / 0.03) * Math.min(1, (seconds - t) / 0.03);
    }
    highPass(b, 1000, sr);
    normalize(b, amp);
    addAt(buf, sr, at, b);
  };

/** A syllable: harmonics of a voice, swelling in; `plosive` adds the crack of a «t» before the vowel. */
const syllable =
  (at: number, o: { amp?: number; f0?: number; plosive?: number } = {}): Sound =>
  (buf, sr, gauss) => {
    const amp = o.amp ?? 0.5;
    const f0 = o.f0 ?? 170;
    const len = Math.round(0.25 * sr);
    const v = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      let s = 0;
      for (let k = 1; f0 * k < 5000; k++) s += Math.sin(2 * Math.PI * f0 * k * t + k) / k;
      v[i] = s * Math.min(1, t / 0.025) * Math.min(1, (0.25 - t) / 0.04);
    }
    normalize(v, amp);
    if (o.plosive) addAt(buf, sr, at, burst(sr, gauss, o.plosive, 0.5, 4, 2000));
    addAt(buf, sr, at + (o.plosive ? 0.006 : 0), v);
  };

/** Sustained broadband sound (music, a hairdryer, chatter). */
const hum =
  (at: number, amp: number, seconds: number): Sound =>
  (buf, sr, gauss) => {
    const len = Math.round(seconds * sr);
    const b = new Float32Array(len);
    for (let i = 0; i < len; i++) b[i] = gauss() * amp;
    addAt(buf, sr, at, b);
  };

interface Scene {
  sounds?: Sound[];
  seconds?: number;
  /** Background noise (white, standard deviation). A quiet room by default. */
  background?: number;
  sr?: number;
  seed?: number;
}

function render({ sounds = [], seconds = 3, background = 0.002, sr = 48_000, seed = 7 }: Scene): Float32Array {
  const gauss = noiseSource(seed);
  const buf = new Float32Array(Math.round(seconds * sr));
  for (let i = 0; i < buf.length; i++) buf[i] = gauss() * background;
  for (const s of sounds) s(buf, sr, gauss);
  return buf;
}

/** Irregular chunks, like animation frames at 60, 30 and 45 fps. */
const CHUNKS = [800, 1024, 512, 1600, 700, 1100];

interface Run {
  state: ClapState;
  firedAt: number | null;
  hits: { at: number; hit: ClapHit }[];
  rejected: ClapReject[];
  judged: ClapFeatures[];
}

function run(scene: Scene, sensitivity: ClapSensitivity = 'medium'): Run {
  const sr = scene.sr ?? 48_000;
  const signal = render(scene);
  const detector = createClapDetector({ sampleRate: sr, sensitivity });
  const out: Run = { state: 'idle', firedAt: null, hits: [], rejected: [], judged: [] };
  for (let i = 0, c = 0; i < signal.length; c++) {
    const to = Math.min(signal.length, i + CHUNKS[c % CHUNKS.length]!);
    const r = detector.process(signal, i, to);
    i = to;
    if (r.hit) out.hits.push({ at: detector.time, hit: r.hit });
    if (r.rejected) out.rejected.push(r.rejected);
    if (r.judged) out.judged.push({ ...r.judged });
    if (r.state === 'fired' && out.firedAt == null) out.firedAt = detector.time;
  }
  out.state = detector.state;
  return out;
}

const fires = (scene: Scene, s: ClapSensitivity = 'medium') => run(scene, s).state === 'fired';
const ALL = CLAP_SENSITIVITIES;

// ───────────── Tests ─────────────

describe('double clap', () => {
  it('fires on two claps 0.4 s apart, just after the second one', () => {
    const r = run({ sounds: [clap(1), clap(1.4)] });
    expect(r.state).toBe('fired');
    expect(r.firedAt).toBeGreaterThanOrEqual(1.4);
    expect(r.firedAt).toBeLessThan(1.55);
    expect(r.hits.map((h) => h.hit)).toEqual(['first', 'second']);
  });

  it('measures a clap as sharp, short, bright and spiky', () => {
    const [f] = run({ sounds: [clap(1)] }).judged;
    expect(f).toBeDefined();
    expect(f!.attackMs).toBeLessThanOrEqual(2);
    expect(f!.decayMs).toBeLessThan(20);
    expect(f!.brightness).toBeGreaterThan(10);
    expect(f!.crest).toBeGreaterThan(5);
    expect(f!.peak).toBeGreaterThan(0.5);
    expect(f!.peak).toBeLessThan(0.75);
  });

  it('fires at both ends of the allowed gap', () => {
    expect(fires({ sounds: [clap(1), clap(1.23)] })).toBe(true);
    expect(fires({ sounds: [clap(1), clap(1.77)] })).toBe(true);
  });

  it('a single clap does not fire', () => {
    const r = run({ sounds: [clap(1)] });
    expect(r.state).toBe('idle');
    expect(r.hits.map((h) => h.hit)).toEqual(['first']);
  });

  it('claps too far apart do not fire; a third close to the second does', () => {
    const r = run({ sounds: [clap(1), clap(2.2)], seconds: 4 });
    expect(r.state).toBe('idle');
    expect(r.hits.map((h) => h.hit)).toEqual(['first', 'first']);
    expect(fires({ sounds: [clap(1), clap(2.2), clap(2.6)] })).toBe(true);
  });

  it('an echo right after a clap counts as the same clap', () => {
    const r = run({ sounds: [clap(1, 0.8), clap(1.12, 0.45)] });
    expect(r.state).toBe('idle');
    expect(r.hits.map((h) => h.hit)).toEqual(['first', 'echo']);
  });

  it('claps in a reverberant room (a tail at a third of the peak) still fire', () => {
    expect(fires({ sounds: [clap(1, 0.7, { reverb: 0.3 }), clap(1.45, 0.7, { reverb: 0.3 })] })).toBe(true);
  });

  it('two very different hits are not a pair', () => {
    // A loud crack and a faint one: at «Muy alta» both count as claps, but not as the same gesture.
    const r = run({ sounds: [clap(1, 0.6), clap(1.4, 0.075)] }, 'max');
    expect(r.state).not.toBe('fired');
    expect(r.rejected).toContain('unlike');
  });

  it('a long sound cancels a clap waiting for its pair', () => {
    expect(fires({ sounds: [clap(1), scrape(1.25, 0.4, 0.6), clap(1.6)] })).toBe(false);
  });

  it('does not count anything while it is still measuring the room', () => {
    expect(fires({ sounds: [clap(0.1), clap(0.4)] })).toBe(false);
  });

  it('works at 44.1 kHz too', () => {
    expect(fires({ sr: 44_100, sounds: [clap(1), clap(1.4)] })).toBe(true);
  });
});

describe('sounds that are not claps', () => {
  it('a chair or a table knocked twice never fires, at any sensitivity (dull)', () => {
    for (const s of ALL) {
      // Loud enough that its click crosses even the «Baja» threshold.
      const r = run({ sounds: [knock(1, { amp: 0.9 }), knock(1.4, { amp: 0.9 })] }, s);
      expect(r.state, s).not.toBe('fired');
      expect(r.hits, s).toEqual([]);
      expect(r.rejected, s).toContain('dull');
    }
  });

  /** Attack, measured on 0.5 ms hops of a noise burst, varies with each draw: judge it over many. */
  const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
  const attacks = (attackMs: number, s: ClapSensitivity) =>
    SEEDS.map((seed) => run({ seed, sounds: [clap(1, 0.5, { attackMs })] }, s).rejected[0] === 'attack');

  it('a bright crack that rises slowly is rejected by its attack, nearly every time', () => {
    // 10 ms to rise: not a clap even at «Muy alta»; 6 ms: still too slow for «Media».
    expect(attacks(10, 'max').filter(Boolean).length).toBeGreaterThanOrEqual(10);
    expect(attacks(6, 'medium').filter(Boolean).length).toBeGreaterThanOrEqual(8);
    // And a pair of them never fires at «Media».
    for (const seed of SEEDS.slice(0, 4))
      expect(fires({ seed, sounds: [clap(1, 0.5, { attackMs: 10 }), clap(1.4, 0.5, { attackMs: 10 })] })).toBe(false);
  });

  it('real claps (attack up to 1.5 ms) pass every time, at every level', () => {
    for (const seed of SEEDS.slice(0, 6))
      for (const s of ALL) {
        const pair = { seed, sounds: [clap(1, 0.6, { attackMs: 1.5 }), clap(1.4, 0.6, { attackMs: 1.5 })] };
        expect(fires(pair, s), `${s} ${seed}`).toBe(true);
      }
  });

  it('footsteps never fire', () => {
    const walk = [0.8, 1.3, 1.8, 2.3, 2.8].map((t) => step(t));
    for (const s of ALL) expect(fires({ sounds: walk, seconds: 3.5 }, s), s).toBe(false);
  });

  it('a dragged chair never fires', () => {
    for (const s of ALL) expect(fires({ sounds: [scrape(1), scrape(1.5)] }, s), s).toBe(false);
  });

  it('voice: two syllables never fire, not even with a «t» crack', () => {
    for (const s of ALL) {
      expect(fires({ sounds: [syllable(1), syllable(1.4)] }, s), s).toBe(false);
      expect(fires({ sounds: [syllable(1, { plosive: 0.3 }), syllable(1.4, { plosive: 0.3 })] }, s), s).toBe(false);
    }
  });

  it('music or a steady noise alone never fires', () => {
    for (const s of ALL) expect(fires({ sounds: [hum(1, 0.15, 1.5)] }, s), s).toBe(false);
  });

  it('a clap still fires after a sound that swelled in', () => {
    expect(fires({ sounds: [syllable(0.7), clap(1.4), clap(1.8)] })).toBe(true);
  });
});

describe('the four sensitivities', () => {
  const pair = (peak: number) => ({ sounds: [clap(1, peak), clap(1.4, peak)] });
  const firing = (peak: number) => ALL.filter((s) => fires(pair(peak), s));

  it('a loud double clap fires at every level', () => {
    expect(firing(0.6)).toEqual(['low', 'medium', 'high', 'max']);
  });

  it('a normal one fires from «Media» up', () => {
    expect(firing(0.2)).toEqual(['medium', 'high', 'max']);
  });

  it('a soft one fires from «Alta» up', () => {
    expect(firing(0.12)).toEqual(['high', 'max']);
  });

  it('a faint one only at «Muy alta»', () => {
    expect(firing(0.075)).toEqual(['max']);
  });

  it('orders the thresholds low > medium > high > max and keeps them reachable', () => {
    for (const noise of [0.0005, 0.01, 0.05, 0.5]) {
      expect(clapThreshold(noise, 'low')).toBeGreaterThanOrEqual(clapThreshold(noise, 'medium'));
      expect(clapThreshold(noise, 'medium')).toBeGreaterThanOrEqual(clapThreshold(noise, 'high'));
      expect(clapThreshold(noise, 'high')).toBeGreaterThanOrEqual(clapThreshold(noise, 'max'));
      expect(clapThreshold(noise, 'low')).toBeLessThan(1);
    }
  });

  it('asks more than the old scale (low 0.22, medium 0.12, high 0.06 in a quiet room)', () => {
    expect(CLAP_LEVELS.low.floor).toBeGreaterThan(0.22);
    expect(CLAP_LEVELS.medium.floor).toBeGreaterThan(0.12);
    expect(CLAP_LEVELS.high.floor).toBeGreaterThan(0.06);
    // «Muy alta» is the old «Alta» level, with the timbre checks on top.
    expect(CLAP_LEVELS.max.floor).toBe(0.06);
  });

  it('can be changed while listening', () => {
    const signal = render({ sounds: [clap(1, 0.12), clap(1.4, 0.12)] });
    const detector = createClapDetector({ sensitivity: 'low' });
    detector.process(signal, 0, 38_400); // 0.8 s
    detector.setSensitivity('high');
    expect(detector.process(signal, 38_400).state).toBe('fired');
  });
});

describe('background noise', () => {
  it('a loud room raises the threshold: its noise alone never fires', () => {
    const r = run({ background: 0.03, seconds: 5 });
    expect(r.state).toBe('idle');
    expect(r.hits).toEqual([]);
  });

  it('claps clearly above a loud room still fire, at every level', () => {
    for (const s of ALL)
      expect(fires({ background: 0.03, seconds: 4, sounds: [clap(2.5, 0.95), clap(2.95, 0.95)] }, s), s).toBe(true);
  });

  it('claps barely above a loud room do not', () => {
    expect(fires({ background: 0.03, seconds: 4, sounds: [clap(2.5, 0.3), clap(2.95, 0.3)] })).toBe(false);
  });

  it('a room that gets loud mid-way becomes the new background, and claps above it count again', () => {
    const r = run({ seconds: 9, sounds: [hum(2, 0.03, 7), clap(7, 0.95), clap(7.45, 0.95)] });
    expect(r.firedAt).toBeGreaterThanOrEqual(7.45);
  });

  it('a burst of noise barely moves the background estimate', () => {
    const quiet = run({ seconds: 3 });
    const signal = render({ seconds: 3, sounds: [hum(2, 0.02, 0.1)] });
    const detector = createClapDetector();
    let noise = 0;
    for (let i = 0; i < signal.length; i += 800) noise = detector.process(signal, i, i + 800).noise;
    expect(quiet.state).toBe('idle');
    expect(noise).toBeLessThan(0.01);
  });
});

describe('rules', () => {
  const clapLike: ClapFeatures = { at: 1, peak: 0.5, attackMs: 1, decayMs: 8, brightness: 30, crest: 9 };

  it('clapRejection names what gives a sound away', () => {
    expect(clapRejection(clapLike, 'low')).toBeNull();
    expect(clapRejection({ ...clapLike, attackMs: 6 }, 'max')).toBe('attack');
    expect(clapRejection({ ...clapLike, attackMs: Infinity }, 'max')).toBe('attack');
    expect(clapRejection({ ...clapLike, decayMs: 120 }, 'max')).toBe('decay');
    expect(clapRejection({ ...clapLike, brightness: 0.2 }, 'max')).toBe('dull');
    expect(clapRejection({ ...clapLike, crest: 2 }, 'max')).toBe('steady');
    // Lower sensitivities ask for a cleaner clap.
    expect(clapRejection({ ...clapLike, attackMs: 3.2 }, 'high')).toBeNull();
    expect(clapRejection({ ...clapLike, attackMs: 3.2 }, 'medium')).toBe('attack');
    expect(clapRejection({ ...clapLike, brightness: 1.5 }, 'medium')).toBeNull();
    expect(clapRejection({ ...clapLike, brightness: 1.5 }, 'low')).toBe('dull');
  });

  it('clapsAlike', () => {
    expect(clapsAlike(clapLike, { ...clapLike, peak: 0.3 })).toBe(true);
    expect(clapsAlike(clapLike, { ...clapLike, peak: 0.1 })).toBe(false);
    expect(clapsAlike(clapLike, { ...clapLike, brightness: 2 })).toBe(false);
  });

  it('migrates the stored sensitivity from the old 3-level scale', () => {
    expect(migrateClapSensitivity('high', undefined)).toBe('max');
    expect(migrateClapSensitivity('medium', undefined)).toBe('medium');
    expect(migrateClapSensitivity('low', undefined)).toBe('low');
    expect(migrateClapSensitivity('max', undefined)).toBeNull();
    expect(migrateClapSensitivity('loud', undefined)).toBeNull();
    // On the current scale, values stay as they are.
    expect(migrateClapSensitivity('high', CLAP_SCALE)).toBe('high');
    expect(migrateClapSensitivity('max', CLAP_SCALE)).toBe('max');
    expect(migrateClapSensitivity(3, CLAP_SCALE)).toBeNull();
  });
});

describe('detector plumbing', () => {
  it('reset listens again after firing', () => {
    const signal = render({ sounds: [clap(1), clap(1.4)], seconds: 2 });
    const detector = createClapDetector();
    detector.process(signal);
    expect(detector.state).toBe('fired');
    detector.reset();
    expect(detector.state).toBe('idle');
  });

  it('keeps time across skipped samples, and drops the sound it was following', () => {
    const signal = render({ sounds: [clap(1), clap(1.4)], seconds: 2 });
    const detector = createClapDetector();
    detector.process(signal, 0, 48_000 + 1_000); // into the first clap
    detector.skip(48_000 * 0.2);
    expect(detector.time).toBeCloseTo(49_000 / 48_000 + 0.2, 6);
    // The rest arrives late: what was being followed is gone, nothing fires by mistake.
    detector.process(signal, 49_000 + 9_600);
    expect(detector.state).not.toBe('fired');
  });

  it('ignores bad input and returns the same reading object each time', () => {
    const detector = createClapDetector();
    const a = detector.process([Number.NaN, 7, -9, 0.1]);
    const b = detector.process(new Float32Array(48));
    expect(a).toBe(b);
    expect(b.level).toBeLessThanOrEqual(1);
    expect(Number.isFinite(b.noise)).toBe(true);
  });

  it('samplesSince: the first read takes the buffer, then what the audio clock moved', () => {
    expect(samplesSince(null, 1000, 4096)).toBe(4096);
    expect(samplesSince(48_000, 48_800, 4096)).toBe(800);
    expect(samplesSince(48_000, 47_000, 4096)).toBe(0);
    expect(samplesSince(0, 10_000, 4096)).toBe(10_000);
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

describe('log of judged sounds («i» panel)', () => {
  const entries = (scene: Scene) => {
    const signal = render(scene);
    const detector = createClapDetector({ sampleRate: 48_000, sensitivity: 'medium' });
    const out: ClapLogEntry[] = [];
    for (let i = 0, c = 0; i < signal.length; c++) {
      const to = Math.min(signal.length, i + CHUNKS[c % CHUNKS.length]!);
      const e = clapLogEntry(detector.process(signal, i, to));
      if (e) out.push(e);
      i = to;
    }
    return out;
  };

  it('keeps each verdict with its measures, copied out of the reading', () => {
    const log = entries({ sounds: [clap(1), clap(1.4)] });
    expect(log.map((e) => e.verdict)).toEqual(['first', 'second']);
    expect(log[0]).not.toBe(log[1]);
    expect(log[0]!.overThreshold).toBeGreaterThan(1);
    expect(log[0]!.attackMs).toBeLessThanOrEqual(2);
    expect(CLAP_VERDICT_LABEL[log[1]!.verdict]).toMatch(/señal/);
  });

  it('says why a knock was not a clap', () => {
    const log = entries({ sounds: [knock(1, { amp: 0.9 })] });
    expect(log.map((e) => e.verdict)).toContain('dull');
  });

  it('nothing judged, nothing kept', () => {
    expect(entries({ sounds: [] })).toEqual([]);
  });
});

describe('decision delay', () => {
  it('covers the peak search (20 hops) and the longest decay of any level, plus 4 hops', () => {
    const hopMs = 0.5;
    const longest = Math.max(...Object.values(CLAP_LEVELS).map((l) => l.maxDecayMs));
    expect(DECIDE_AFTER).toBe(20 + Math.ceil(longest / hopMs) + 4);
  });
});
