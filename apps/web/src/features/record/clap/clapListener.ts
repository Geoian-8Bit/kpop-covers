import { createClapDetector, samplesSince, type ClapReading, type ClapSensitivity } from '@coverscape/shared';

/**
 * F7 · Listening for the double clap: the microphone goes through an AnalyserNode (never to the speakers) and, on
 * each animation frame, the samples that arrived since the last frame feed the pure detector of
 * `@coverscape/shared` (which filters and measures them itself). One buffer for the whole session: nothing is
 * allocated per frame. Everything is freed on `stop()`.
 */

/** An AudioContext for the analysis. Create it inside the tap that arms (Safari only lets audio start there). */
export function createListeningContext(): AudioContext | null {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    const ctx = new Ctor({ latencyHint: 'interactive' });
    void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

export interface ClapListener {
  setSensitivity(sensitivity: ClapSensitivity): void;
  stop(): void;
}

export function listenForClap(
  ctx: AudioContext,
  track: MediaStreamTrack,
  options: { sensitivity: ClapSensitivity; onReading: (reading: ClapReading) => void },
): ClapListener {
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  const source = ctx.createMediaStreamSource(new MediaStream([track]));
  const analyser = ctx.createAnalyser();
  // ~85 ms at 48 kHz: longer than a frame even at 15 fps, so no sample goes by unread.
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0;
  // Some browsers only run a graph that reaches the output: it does, at zero volume.
  const silent = ctx.createGain();
  silent.gain.value = 0;
  // The raw signal: the detector splits it into its bands (bright crack vs dull thump) itself.
  source.connect(analyser);
  analyser.connect(silent);
  silent.connect(ctx.destination);

  const samples = new Float32Array(analyser.fftSize);
  const detector = createClapDetector({ sampleRate: ctx.sampleRate, sensitivity: options.sensitivity });
  /** Audio clock (in samples) at the last read; null before the first. */
  let lastClock: number | null = null;
  let frame = 0;
  let stopped = false;
  const read = () => {
    if (stopped) return;
    frame = requestAnimationFrame(read);
    // The analyser holds the newest `fftSize` samples up to the audio clock: only the ones after the previous
    // read are new. A suspended context doesn't move its clock, so nothing is read twice.
    const clock = Math.round(ctx.currentTime * ctx.sampleRate);
    const elapsed = samplesSince(lastClock, clock, samples.length);
    lastClock = clock;
    if (elapsed <= 0) return;
    const fresh = Math.min(elapsed, samples.length);
    if (elapsed > fresh) detector.skip(elapsed - fresh);
    analyser.getFloatTimeDomainData(samples);
    options.onReading(detector.process(samples, samples.length - fresh, samples.length));
  };
  frame = requestAnimationFrame(read);

  return {
    setSensitivity: (sensitivity) => detector.setSensitivity(sensitivity),
    stop() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(frame);
      try {
        source.disconnect();
        analyser.disconnect();
        silent.disconnect();
      } catch {
        /* already disconnected */
      }
    },
  };
}
