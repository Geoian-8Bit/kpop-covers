import { describe, expect, it } from 'vitest';
import { renderDemoMix } from './voiceDemoMix';
import {
  DEFAULT_RAMP_MS,
  DEFAULT_TUNING,
  frameStats,
  isVoiceMode,
  judgeMono,
  modeGains,
  MONO_RULES,
  pushFrame,
  rampSeconds,
  resolveTuning,
  stepMode,
  VOICE_MODES,
  type FrameStats,
} from './voiceRules';

/** Deterministic pseudo-noise in −1…1. */
function noise(seed: number, n: number): Float32Array {
  const out = new Float32Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = s / 0x80000000 - 1;
  }
  return out;
}

const scale = (a: Float32Array, k: number) => a.map((v) => v * k);
const mix = (a: Float32Array, b: Float32Array, ka = 1, kb = 1) => a.map((v, i) => v * ka + b[i]! * kb);

describe('modeGains', () => {
  it('passes the song untouched in original', () => {
    expect(modeGains('original')).toEqual({ dry: 1, side: 0, bass: 0, highs: 0, voice: 0 });
  });

  it('keeps the sides and the centre lows in sin-voz, without the dry signal or the voice band', () => {
    const g = modeGains('sin-voz');
    expect(g.dry).toBe(0);
    expect(g.voice).toBe(0);
    expect(g.side).toBe(DEFAULT_TUNING.sideGain);
    expect(g.bass).toBe(1);
    expect(g.highs).toBe(0); // highs are opt-in: the voice's sibilants live there too
    expect(modeGains('sin-voz', { ...DEFAULT_TUNING, keepHighs: 0.4 }).highs).toBe(0.4);
  });

  it('keeps only the centre voice band in voz', () => {
    expect(modeGains('voz')).toEqual({ dry: 0, side: 0, bass: 0, highs: 0, voice: DEFAULT_TUNING.voiceGain });
  });

  it('never leaves every path silent', () => {
    for (const mode of VOICE_MODES) {
      const g = modeGains(mode);
      expect(g.dry + g.side + g.bass + g.voice).toBeGreaterThan(0);
    }
  });
});

describe('resolveTuning', () => {
  it('fills the defaults, ignores garbage and clamps', () => {
    expect(resolveTuning()).toEqual(DEFAULT_TUNING);
    const t = resolveTuning({ bassHz: Number.NaN, keepHighs: 3, voiceLowHz: 5, sideGain: 1 });
    expect(t.bassHz).toBe(DEFAULT_TUNING.bassHz);
    expect(t.keepHighs).toBe(1);
    expect(t.voiceLowHz).toBe(60);
    expect(t.sideGain).toBe(1);
  });
});

describe('rampSeconds', () => {
  it('defaults, clamps and converts', () => {
    expect(rampSeconds()).toBe(DEFAULT_RAMP_MS / 1000);
    expect(rampSeconds(Number.NaN)).toBe(DEFAULT_RAMP_MS / 1000);
    expect(rampSeconds(-50)).toBe(0);
    expect(rampSeconds(0)).toBe(0);
    expect(rampSeconds(250)).toBe(0.25);
    expect(rampSeconds(10_000)).toBe(2);
  });
});

describe('frameStats', () => {
  const n = 2048;
  const a = noise(1, n);
  const b = noise(2, n);

  it('reads identical channels as fully correlated with no side', () => {
    const s = frameStats(a, a)!;
    expect(s.correlation).toBeCloseTo(1, 6);
    expect(s.sideRatio).toBeCloseTo(0, 6);
  });

  it('reads independent channels as uncorrelated, and opposite ones as −1', () => {
    expect(Math.abs(frameStats(a, b)!.correlation)).toBeLessThan(0.1);
    expect(frameStats(a, scale(a, -1))!.correlation).toBeCloseTo(-1, 6);
  });

  it('treats one silent channel as not mono', () => {
    const s = frameStats(a, new Float32Array(n))!;
    expect(s.correlation).toBe(0);
    expect(s.sideRatio).toBeCloseTo(1, 6); // L only: mid and side carry the same energy
  });

  it('ignores silence', () => {
    expect(frameStats(new Float32Array(n), new Float32Array(n))).toBeNull();
    expect(frameStats(scale(a, 1e-5), scale(a, 1e-5))).toBeNull();
    expect(frameStats([], [])).toBeNull();
  });

  it('sees a typical stereo mix (shared centre + different sides) as below the mono threshold', () => {
    const centre = noise(3, n);
    const s = frameStats(mix(centre, a, 1, 0.6), mix(centre, b, 1, 0.6))!;
    expect(s.correlation).toBeLessThan(MONO_RULES.correlation);
    expect(s.correlation).toBeGreaterThan(0.5);
  });
});

describe('judgeMono', () => {
  const mono: FrameStats = { correlation: 0.995, sideRatio: 0.002 };
  const stereo: FrameStats = { correlation: 0.7, sideRatio: 0.18 };
  const many = (frame: FrameStats, count: number) => Array.from({ length: count }, () => frame);

  it('does not decide before hearing enough', () => {
    expect(judgeMono([])).toEqual({ monoLike: false, settled: false, correlation: null });
    const early = judgeMono(many(mono, MONO_RULES.minFrames - 1));
    expect(early.settled).toBe(false);
    expect(early.monoLike).toBe(false);
  });

  it('calls a track mono when (nearly) every frame is', () => {
    const j = judgeMono([...many(mono, 14), stereo]);
    expect(j).toMatchObject({ monoLike: true, settled: true });
    expect(j.correlation).toBeCloseTo(0.995);
  });

  it('keeps a stereo song stereo despite centred moments', () => {
    expect(judgeMono([...many(mono, 6), ...many(stereo, 10)]).monoLike).toBe(false);
  });

  it('uses the median correlation', () => {
    expect(judgeMono([stereo, mono, mono, stereo]).correlation).toBeCloseTo((0.7 + 0.995) / 2);
  });
});

describe('pushFrame', () => {
  it('keeps only the newest frames, without mutating', () => {
    const frames: FrameStats[] = [];
    let next = frames;
    for (let i = 0; i < 5; i++) next = pushFrame(next, { correlation: i, sideRatio: 0 }, 3);
    expect(frames).toEqual([]);
    expect(next.map((f) => f.correlation)).toEqual([2, 3, 4]);
  });
});

describe('stepMode', () => {
  it('moves with arrows (wrapping) and jumps with Home/End', () => {
    expect(stepMode('original', 'ArrowRight')).toBe('sin-voz');
    expect(stepMode('voz', 'ArrowDown')).toBe('original');
    expect(stepMode('original', 'ArrowLeft')).toBe('voz');
    expect(stepMode('sin-voz', 'ArrowUp')).toBe('original');
    expect(stepMode('voz', 'Home')).toBe('original');
    expect(stepMode('original', 'End')).toBe('voz');
    expect(stepMode('original', 'Enter')).toBeNull();
  });
});

describe('isVoiceMode', () => {
  it('accepts only the three modes', () => {
    expect(VOICE_MODES.every(isVoiceMode)).toBe(true);
    expect(isVoiceMode('karaoke')).toBe(false);
    expect(isVoiceMode(undefined)).toBe(false);
  });
});

describe('renderDemoMix', () => {
  it('renders a stereo loop whose sides differ, and a mono one that the check calls mono', () => {
    const rate = 8000;
    const stereo = renderDemoMix(rate);
    const mono = renderDemoMix(rate, { mono: true });
    expect(stereo.left.length).toBe(Math.round(stereo.seconds * rate));
    expect(mono.left).toEqual(mono.right);

    const frames = (m: typeof stereo) => {
      const out: FrameStats[] = [];
      for (let i = 0; i + 1024 <= m.left.length; i += 1024) {
        const s = frameStats(m.left.subarray(i, i + 1024), m.right.subarray(i, i + 1024));
        if (s) out.push(s);
      }
      return out;
    };
    expect(judgeMono(frames(mono)).monoLike).toBe(true);
    expect(judgeMono(frames(stereo)).monoLike).toBe(false);
    // Loud enough to hear, never clipping.
    let peak = 0;
    for (let i = 0; i < stereo.left.length; i++)
      peak = Math.max(peak, Math.abs(stereo.left[i]!), Math.abs(stereo.right[i]!));
    expect(peak).toBeGreaterThan(0.2);
    expect(peak).toBeLessThan(1);
  });
});
