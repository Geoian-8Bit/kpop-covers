/**
 * Tiny Web Audio metronome for the count-in between loop repetitions.
 * Browsers only allow audio after a user gesture, so `unlockAudio` is wired to the first tap/key.
 */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

export function unlockAudio(): void {
  const c = context();
  if (c && c.state === 'suspended') void c.resume();
}

/** Short woodblock-like click. `accent` is the higher "go" tick when playback resumes. */
export function tick(accent = false): void {
  const c = context();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(accent ? 1568 : 988, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.35, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (accent ? 0.16 : 0.09));
  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

/**
 * Schedules a count-in on the audio clock: one tick per second for `seconds`, then an accented
 * "go" tick exactly when playback resumes. Returns a cancel function (e.g. when the user pauses).
 */
export function scheduleCountIn(seconds: number): () => void {
  const c = context();
  if (!c || seconds <= 0) return () => undefined;
  if (c.state === 'suspended') void c.resume();
  const start = c.currentTime + 0.02;
  const nodes: OscillatorNode[] = [];
  for (let i = 0; i <= seconds; i++) {
    const accent = i === seconds;
    const at = start + i;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(accent ? 1568 : 988, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.35, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + (accent ? 0.16 : 0.09));
    osc.connect(gain).connect(c.destination);
    osc.start(at);
    osc.stop(at + 0.2);
    nodes.push(osc);
  }
  return () => {
    for (const osc of nodes) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    }
  };
}
