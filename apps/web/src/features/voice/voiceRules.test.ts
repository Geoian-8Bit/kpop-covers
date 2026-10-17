import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RAMP_MS,
  DEFAULT_TUNING,
  frameStats,
  isVoiceMode,
  judgeMono,
  modeGains,
  MONO_RULES,
  pickStems,
  pushFrame,
  rampSeconds,
  resolveTuning,
  learnLead,
  STEM_SYNC,
  stemNudge,
  stemModeGains,
  stemSyncAction,
  stepMode,
  VOICE_MODES,
  type FrameStats,
  type StemRow,
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

// ───────────── 18 · Separated tracks ─────────────


describe('stemModeGains', () => {
  it('each mode sounds exactly one source', () => {
    expect(stemModeGains('original')).toEqual({ dry: 1, instrumental: 0, vocals: 0 });
    expect(stemModeGains('sin-voz')).toEqual({ dry: 0, instrumental: 1, vocals: 0 });
    expect(stemModeGains('voz')).toEqual({ dry: 0, instrumental: 0, vocals: 1 });
  });
});

describe('stemSyncAction', () => {
  const base = { masterTime: 30, masterRate: 1, trackTime: 30, trackDuration: 200, delay: 0 };

  it('in step: plays at the video\'s rate (also at practice speed)', () => {
    expect(stemSyncAction(base)).toEqual({ kind: 'rate', rate: 1 });
    expect(stemSyncAction({ ...base, masterRate: 0.75, trackTime: 30.01 })).toEqual({ kind: 'rate', rate: 0.75 });
  });

  it('small drift: a gentle nudge the right way, capped', () => {
    const ahead = stemSyncAction({ ...base, trackTime: 30.06 });
    expect(ahead.kind).toBe('rate');
    expect((ahead as { rate: number }).rate).toBeLessThan(1);
    const behind = stemSyncAction({ ...base, trackTime: 29.95 });
    expect((behind as { rate: number }).rate).toBeGreaterThan(1);
    expect((behind as { rate: number }).rate).toBeLessThanOrEqual(1 + STEM_SYNC.maxNudge);
  });

  it('a late start after a jump (beyond ~60 ms): a stronger catch-up, still capped', () => {
    const late = stemSyncAction({ ...base, trackTime: 29.9 });
    expect((late as { rate: number }).rate).toBeGreaterThan(1 + STEM_SYNC.maxNudge);
    expect((late as { rate: number }).rate).toBeLessThanOrEqual(1 + STEM_SYNC.maxCatchUp);
    expect(stemNudge(-0.2)).toBe(-STEM_SYNC.maxCatchUp);
    expect(stemNudge(0.03)).toBeCloseTo(0.03);
    expect(stemNudge(0.055)).toBe(STEM_SYNC.maxNudge);
    expect(stemNudge(0.01)).toBe(0);
    expect(stemNudge(Number.NaN)).toBe(0);
    // 100 ms late is back under 40 ms (not heard as late) within a second, instead of 2–3 s.
    let drift = -0.1;
    let t = 0;
    while (Math.abs(drift) > 0.04 && t < 5) {
      drift -= stemNudge(drift) * 0.2;
      t += 0.2;
    }
    expect(t).toBeLessThanOrEqual(1);
  });

  it('a jump lands ahead by the learnt lead', () => {
    expect(stemSyncAction({ ...base, trackTime: 12, seekLead: 0.09 })).toEqual({ kind: 'seek', to: 30.09 });
    expect(stemSyncAction({ ...base, masterRate: 0.5, trackTime: 12, seekLead: 0.1 })).toEqual({ kind: 'seek', to: 30.05 });
    // Never an absurd lead.
    expect(stemSyncAction({ ...base, trackTime: 12, seekLead: 5 })).toEqual({ kind: 'seek', to: 30 + STEM_SYNC.maxLead });
  });

  it('a jump, a loop or a stall: seek to where it should be, slightly ahead', () => {
    expect(stemSyncAction({ ...base, trackTime: 12 })).toEqual({ kind: 'seek', to: 30 + STEM_SYNC.seekLead });
    expect(stemSyncAction({ ...base, masterTime: 0, trackTime: 5 })).toEqual({ kind: 'seek', to: STEM_SYNC.seekLead });
  });

  it('compensates the encoder delay', () => {
    expect(stemSyncAction({ ...base, delay: 0.045, trackTime: 30.045 })).toEqual({ kind: 'rate', rate: 1 });
    expect(stemSyncAction({ ...base, delay: 0.045, trackTime: 29.5 })).toEqual({ kind: 'seek', to: 30.045 + STEM_SYNC.seekLead });
  });

  it('past the end of the track: stop', () => {
    expect(stemSyncAction({ ...base, masterTime: 199.99, trackTime: 199.99 })).toEqual({ kind: 'stop' });
    expect(stemSyncAction({ ...base, trackDuration: Number.NaN })).toEqual({ kind: 'rate', rate: 1 });
  });
});

describe('learnLead', () => {
  it('a track that started 80 ms late: the next jump lands further ahead', () => {
    const next = learnLead(0.04, -0.08);
    expect(next).toBeGreaterThan(0.04);
    expect(next).toBeLessThanOrEqual(0.12);
  });

  it('converges on the real start-up delay of the device', () => {
    const real = 0.09;
    let lead: number = STEM_SYNC.seekLead;
    for (let i = 0; i < 8; i++) lead = learnLead(lead, lead - real);
    expect(lead).toBeCloseTo(real, 2);
  });

  it('started early: the lead shrinks, never below 0', () => {
    expect(learnLead(0.04, 0.03)).toBeLessThan(0.04);
    expect(learnLead(0.01, 0.2)).toBe(0);
  });

  it('a jump that did not move the track learns from where it really was', () => {
    // It stayed 10 ms ahead (within «ok»), started 60 ms late → drift −50 ms → ideal 60 ms.
    expect(learnLead(0.04, -0.05, 1, 0.01)).toBeCloseTo(0.05);
  });

  it('at practice speed the delay is in wall time', () => {
    // Half speed: 80 ms late = 40 ms of track behind.
    expect(learnLead(0, -0.04, 0.5, 0)).toBeCloseTo(0.04);
  });

  it('a stall or nonsense teaches nothing', () => {
    expect(learnLead(0.05, -0.6)).toBe(0.05);
    expect(learnLead(0.05, Number.NaN)).toBe(0.05);
    expect(learnLead(0.05, -0.1, 0)).toBeCloseTo(0.1);
    expect(learnLead(0.18, -0.2)).toBe(STEM_SYNC.maxLead);
  });
});

describe('pickStems', () => {
  const row = (over: Partial<StemRow>): StemRow => ({
    id: 'a',
    source_file_name: 'song.mp4',
    source_file_size: 1000,
    vocals_path: 'g/stems/a/vocals.m4a',
    instrumental_path: 'g/stems/a/instrumental.m4a',
    delay_seconds: 0,
    created_at: '2026-10-17T10:00:00Z',
    ...over,
  });
  const video = { file_name: 'song.mp4', file_size: 1000 };

  it('takes the newest complete separation of this same file', () => {
    const rows = [
      row({ id: 'old' }),
      row({ id: 'new', created_at: '2026-10-17T12:00:00Z' }),
      row({ id: 'half', created_at: '2026-10-17T13:00:00Z', vocals_path: null, instrumental_path: null }),
    ];
    expect(pickStems(video, rows)?.id).toBe('new');
  });

  it('never the tracks of another file, nor without a file', () => {
    expect(pickStems({ file_name: 'song.mp4', file_size: 999 }, [row({})])).toBeNull();
    expect(pickStems({ file_name: 'other.mp4', file_size: 1000 }, [row({})])).toBeNull();
    expect(pickStems({ file_name: null, file_size: null }, [row({})])).toBeNull();
    expect(pickStems(video, [])).toBeNull();
  });
});
