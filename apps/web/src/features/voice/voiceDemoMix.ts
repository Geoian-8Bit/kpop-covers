/**
 * A tiny synthetic song for the design lab's «Separar voz y música» demo, rendered in the browser (no files):
 * two bars at 120 bpm that loop. Built like a real mix so the split has something to do:
 *
 * - centre: a sung-ish melody (harmonics shaped like an «a» vowel, with vibrato), a kick and a bass line;
 * - sides: a plucked arpeggio hard left, another one hard right, and hi-hats alternating left and right.
 *
 * «Sin voz» drops the melody and keeps kick, bass (centre lows) and the side instruments; «voz» keeps the melody.
 * With `mono` both channels are the same downmix, which is what the mono warning is about.
 */

export interface DemoMix {
  left: Float32Array<ArrayBuffer>;
  right: Float32Array<ArrayBuffer>;
  seconds: number;
}

const BPM = 120;
const BEAT = 60 / BPM;
const BARS = 2;

const midiHz = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** Deterministic noise, so every render is the same. */
function noise(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x80000000 - 1;
  };
}

export function renderDemoMix(sampleRate: number, { mono = false }: { mono?: boolean } = {}): DemoMix {
  const seconds = BARS * 4 * BEAT;
  const length = Math.round(seconds * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  /** Adds `fn(t)` (t = seconds since the event) for `dur` seconds from `start`, scaled per channel. */
  const add = (start: number, dur: number, gl: number, gr: number, fn: (t: number) => number) => {
    const from = Math.max(0, Math.round(start * sampleRate));
    const to = Math.min(length, Math.round((start + dur) * sampleRate));
    for (let i = from; i < to; i++) {
      const v = fn((i - from) / sampleRate);
      left[i]! += v * gl;
      right[i]! += v * gr;
    }
  };

  // Chords per half bar: Am · F · C · G (roots for the bass, tones for the arpeggios).
  const chords = [
    [57, 60, 64],
    [53, 57, 60],
    [48, 52, 55],
    [55, 59, 62],
  ];

  for (let beat = 0; beat < BARS * 4; beat++) {
    const t0 = beat * BEAT;
    const chord = chords[Math.floor(beat / 2) % chords.length]!;

    // Kick (centre): a falling sine thump.
    add(t0, 0.28, 0.5, 0.5, (t) => {
      const f = 48 + 90 * Math.exp(-t * 30);
      return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 11);
    });

    // Bass (centre): chord root two octaves down, on every beat.
    const bassHz = midiHz(chord[0]! - 24);
    add(t0, BEAT * 0.9, 0.24, 0.24, (t) => {
      const env = Math.min(1, t / 0.01) * Math.exp(-t * 2.2);
      return (Math.sin(2 * Math.PI * bassHz * t) + 0.25 * Math.sin(4 * Math.PI * bassHz * t)) * env;
    });

    // Plucked arpeggios: eighths, hard left on the beat, hard right off the beat.
    for (let k = 0; k < 2; k++) {
      const hz = midiHz(chord[(beat + k) % 3]! + 12);
      const pluck = (t: number) => {
        const env = Math.min(1, t / 0.004) * Math.exp(-t * 7);
        const p = (hz * t) % 1;
        return (4 * Math.abs(p - 0.5) - 1) * env; // triangle
      };
      add(t0 + k * (BEAT / 2), BEAT * 0.5, k === 0 ? 0.22 : 0, k === 0 ? 0 : 0.22, pluck);
    }

    // Hi-hats: short noise ticks, alternating sides on sixteenths.
    for (let k = 0; k < 4; k++) {
      const rand = noise(beat * 4 + k + 1);
      let last = 0;
      add(t0 + k * (BEAT / 4), 0.05, k % 2 ? 0 : 0.09, k % 2 ? 0.09 : 0, (t) => {
        const n = rand();
        const v = n - last; // crude high-pass: only the hiss
        last = n;
        return v * Math.exp(-t * 70);
      });
    }
  }

  // The «voice» (centre): one note per beat, legato-ish, with vibrato and vowel-like harmonics.
  const melody = [69, 72, 71, 69, 65, 67, 69, 64];
  // Harmonic weights shaped like an «a» (formants near 800 and 1200 Hz on a ~220–440 Hz voice).
  const weights = [1, 0.7, 0.55, 0.35, 0.2, 0.12, 0.06];
  melody.forEach((note, i) => {
    const hz = midiHz(note - 12);
    const dur = BEAT * 0.92;
    add(i * BEAT, dur, 0.42, 0.42, (t) => {
      const vib = 1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t / 0.2);
      const env = Math.min(1, t / 0.04) * Math.min(1, (dur - t) / 0.06);
      let v = 0;
      for (let h = 0; h < weights.length; h++) v += weights[h]! * Math.sin(2 * Math.PI * hz * (h + 1) * vib * t);
      return (v / 2.2) * env;
    });
  });

  if (mono) {
    for (let i = 0; i < length; i++) {
      const m = (left[i]! + right[i]!) / 2;
      left[i] = m;
      right[i] = m;
    }
  }

  // Normalise to a −2 dBFS peak: headroom for «sin voz», whose side gain can lift a hard-panned peak.
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(left[i]!), Math.abs(right[i]!));
  if (peak > 0) {
    const k = 0.8 / peak;
    for (let i = 0; i < length; i++) {
      left[i]! *= k;
      right[i]! *= k;
    }
  }
  return { left, right, seconds };
}
