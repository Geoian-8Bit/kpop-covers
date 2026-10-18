import { createClapDetector, peakOf, type ClapReading, type ClapSensitivity } from '@coverscape/shared';

/**
 * F7 · Listening for the double clap: the microphone goes through an AnalyserNode (never to the speakers) and the
 * peak of each short window feeds the pure detector of `@coverscape/shared`. Everything is freed on `stop()`.
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
  // ~85 ms at 48 kHz: longer than a frame even at 15 fps, so no clap falls between two reads.
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0;
  // Some browsers only run a graph that reaches the output: it does, at zero volume.
  const silent = ctx.createGain();
  silent.gain.value = 0;
  // A clap's crack is bright; footsteps, the floor and voices are mostly low: measure only above ~1.5 kHz.
  const highPass = ctx.createBiquadFilter();
  highPass.type = 'highpass';
  highPass.frequency.value = 1500;
  source.connect(highPass);
  highPass.connect(analyser);
  analyser.connect(silent);
  silent.connect(ctx.destination);

  const samples = new Float32Array(analyser.fftSize);
  const detector = createClapDetector({ sensitivity: options.sensitivity });
  let frame = 0;
  let stopped = false;
  const read = () => {
    if (stopped) return;
    analyser.getFloatTimeDomainData(samples);
    options.onReading(detector.push(performance.now() / 1000, peakOf(samples)));
    frame = requestAnimationFrame(read);
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
        highPass.disconnect();
        analyser.disconnect();
        silent.disconnect();
      } catch {
        /* already disconnected */
      }
    },
  };
}
