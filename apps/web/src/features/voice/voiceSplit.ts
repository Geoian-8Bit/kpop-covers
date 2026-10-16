import {
  frameStats,
  judgeMono,
  modeGains,
  MONO_RULES,
  pushFrame,
  rampSeconds,
  resolveTuning,
  type FrameStats,
  type MonoJudgement,
  type SplitTuning,
  type VoiceMode,
} from './voiceRules';

export type { VoiceMode } from './voiceRules';

/**
 * F17 · Separar la voz y la música, live in the browser with plain Web Audio nodes (no models, no workers): a
 * centre-channel (mid/side) split.
 *
 * Graph (every path always runs; the mode only moves gains, with short ramps so nothing clicks):
 *
 *     source ─► input (forced to stereo: a mono file becomes L = R) ─┬─────────────── dry ─────────────┐
 *                                                                     └► splitter ─ L ─┬─ ½ ─┐          │
 *                                                                                  R ─┼─ ½ ─┼─► mid    │
 *                                                                                     └ −½ ─┴─► side   │
 *     mid  ─► low-pass ×2 (bassHz)                    ─► bass  ─► L and R ─┐                            │
 *     mid  ─► high-pass (highHz)                      ─► highs ─► L and R ─┤                            │
 *     mid  ─► high-pass ×2 (voiceLowHz) ─► low-pass ×2 (voiceHighHz) ─► voice ─► L and R ─┤            │
 *     side ─► side gain ─► L and R (same sign)             ──────────────────────┴► merger ─► output ◄────┘
 *
 * - `original`: only the dry path.
 * - `sin-voz` (instrumental): the side (L − R, where the centre cancels) on both channels, plus the centre below
 *   ~150 Hz so the kick and the bass stay, plus optionally some of the centre's highs (`keepHighs`).
 * - `voz`: the centre alone (which is exactly «subtracting the side»: everything that differs between the channels
 *   cancels in L + R), band-passed to ~200–6000 Hz to drop kick, bass and cymbals, to both channels.
 *
 * Limits — this is not stem separation; it only works as well as the mix is centred:
 * - Anything else in the centre goes with the voice in «sin voz»: snare, centred keys, a mono guitar.
 * - Doubled or harmony vocals panned left/right, stereo reverb and delay on the voice, and wide vocal effects stay
 *   (you hear a ghostly voice from the sides).
 * - Mono tracks (L = R, common in old recordings, phone videos and some dance-practice uploads) leave only the
 *   bass in «sin voz»: `analyse()` detects them (correlation of L and R over a few seconds) so the UI can warn.
 * - Lossy encoding at low bitrates (joint stereo) blurs the side: expect some voice residue and swirly artefacts.
 * - «Sin voz» comes out mono (the side on both channels, in phase): a ±side stereo image would cancel itself on a
 *   phone speaker or a mono Bluetooth box, leaving only the bass (measured in review round 1).
 * - «Voz» still carries whatever the band lets through from the centre (snare body, centred keys).
 */
export interface VoiceSplit {
  /** Connect this to the speakers and/or a MediaStreamDestination (stereo). */
  readonly output: AudioNode;
  /** The mode last asked for. */
  readonly mode: VoiceMode;
  /** Glides to a mode (default ~180 ms). Safe to call again mid-glide: it continues from where the gains are. */
  setMode(mode: VoiceMode, opts?: { rampMs?: number }): void;
  /** What has been heard so far: whether the track looks mono (then «sin voz» can't work). */
  analyse(): VoiceAnalysis;
  /** Forgets what was heard (call it when the element loads another file). */
  resetAnalysis(): void;
  /** Disconnects everything this created and stops listening. Does not close the context. */
  dispose(): void;
}

export type VoiceAnalysis = MonoJudgement;

export interface VoiceSplitOptions {
  /** Mode at creation, applied without a glide. Default `original`. */
  initialMode?: VoiceMode;
  tuning?: Partial<SplitTuning>;
  /** How often L and R are read for the mono check. Default 250 ms; 0 turns the check off. */
  sampleEveryMs?: number;
}

export function createVoiceSplit(
  ctx: BaseAudioContext,
  source: AudioNode,
  options: VoiceSplitOptions = {},
): VoiceSplit {
  const tuning = resolveTuning(options.tuning);
  const nodes: AudioNode[] = [];
  const track = <T extends AudioNode>(node: T): T => {
    nodes.push(node);
    return node;
  };
  const gain = (value: number, channels?: 1 | 2) => {
    const node = track(ctx.createGain());
    node.gain.value = value;
    if (channels) {
      node.channelCount = channels;
      node.channelCountMode = 'explicit';
      node.channelInterpretation = 'speakers';
    }
    return node;
  };
  const filter = (type: BiquadFilterType, frequency: number) => {
    const node = track(ctx.createBiquadFilter());
    node.type = type;
    node.frequency.value = frequency;
    // Butterworth (flat, no resonance bump). For low/high-pass, Web Audio reads Q in dB: 20·log10(1/√2) ≈ −3.01.
    node.Q.value = 20 * Math.log10(Math.SQRT1_2);
    return node;
  };
  const chain = (...chainNodes: AudioNode[]) => {
    for (let i = 0; i < chainNodes.length - 1; i++) chainNodes[i]!.connect(chainNodes[i + 1]!);
    return chainNodes[chainNodes.length - 1]!;
  };

  // Stereo in: 'speakers' up-mixes mono to L = R (a splitter alone would leave R silent) and folds 5.1 to stereo.
  const input = gain(1, 2);
  source.connect(input);

  const out = gain(1, 2);
  const dry = gain(0);
  input.connect(dry).connect(out);

  const splitter = track(ctx.createChannelSplitter(2));
  input.connect(splitter);
  const merger = track(ctx.createChannelMerger(2));
  merger.connect(out);

  const leftHalf = gain(0.5, 1);
  const rightHalf = gain(0.5, 1);
  const rightNegHalf = gain(-0.5, 1);
  splitter.connect(leftHalf, 0);
  splitter.connect(rightHalf, 1);
  splitter.connect(rightNegHalf, 1);
  const mid = gain(1, 1);
  const side = gain(1, 1);
  leftHalf.connect(mid);
  rightHalf.connect(mid);
  leftHalf.connect(side);
  rightNegHalf.connect(side);

  /** A mono path written to both output channels. */
  const toBoth = (node: AudioNode) => {
    node.connect(merger, 0, 0);
    node.connect(merger, 0, 1);
  };

  const bass = gain(0);
  chain(mid, filter('lowpass', tuning.bassHz), filter('lowpass', tuning.bassHz), bass);
  toBoth(bass);

  const highs = gain(0);
  chain(mid, filter('highpass', tuning.highHz), highs);
  toBoth(highs);

  const voice = gain(0);
  chain(
    mid,
    filter('highpass', tuning.voiceLowHz),
    filter('highpass', tuning.voiceLowHz),
    filter('lowpass', tuning.voiceHighHz),
    filter('lowpass', tuning.voiceHighHz),
    voice,
  );
  toBoth(voice);

  const sideGain = gain(0);
  side.connect(sideGain);
  toBoth(sideGain);

  const params = { dry: dry.gain, side: sideGain.gain, bass: bass.gain, highs: highs.gain, voice: voice.gain };

  /**
   * Glides a gain to `target` from wherever it is now, reaching ~95 % after `seconds`. An exponential approach
   * (`setTargetAtTime`) rather than a linear ramp, because it interrupts cleanly: its event sits at its *start*
   * time, so a later change cancels nothing in progress and simply continues from the current value. Measured in
   * Chrome: cancelling a linear ramp mid-way drops one sample to 0, and `cancelAndHoldAtTime` without an earlier
   * event restarts the next ramp from time 0 — both audible clicks.
   */
  const glide = (param: AudioParam, target: number, seconds: number) => {
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    if (seconds <= 0) param.setValueAtTime(target, now);
    else param.setTargetAtTime(target, now, seconds / 3);
  };

  let mode: VoiceMode = options.initialMode ?? 'original';
  const initial = modeGains(mode, tuning);
  for (const key of Object.keys(params) as (keyof typeof params)[]) params[key].value = initial[key];

  // ── Mono check: two analysers on L and R, read a few times a second while sound plays. ──
  const analyserL = track(ctx.createAnalyser());
  const analyserR = track(ctx.createAnalyser());
  analyserL.fftSize = 2048;
  analyserR.fftSize = 2048;
  splitter.connect(analyserL, 0);
  splitter.connect(analyserR, 1);
  const bufferL = new Float32Array(analyserL.fftSize);
  const bufferR = new Float32Array(analyserR.fftSize);
  let frames: FrameStats[] = [];

  const sample = () => {
    // A suspended context keeps returning its last frame: it would count the same moment again and again.
    if (ctx.state !== 'running') return;
    analyserL.getFloatTimeDomainData(bufferL);
    analyserR.getFloatTimeDomainData(bufferR);
    const stats = frameStats(bufferL, bufferR);
    if (stats) frames = pushFrame(frames, stats, MONO_RULES.maxFrames);
  };
  const every = options.sampleEveryMs ?? 250;
  const timer = every > 0 && typeof setInterval === 'function' ? setInterval(sample, every) : null;

  let disposed = false;

  return {
    output: out,
    get mode() {
      return mode;
    },
    setMode(next, opts) {
      if (disposed) return;
      mode = next;
      const target = modeGains(next, tuning);
      const seconds = rampSeconds(opts?.rampMs);
      for (const key of Object.keys(params) as (keyof typeof params)[]) glide(params[key], target[key], seconds);
    },
    analyse() {
      return judgeMono(frames);
    },
    resetAnalysis() {
      frames = [];
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer != null) clearInterval(timer);
      try {
        source.disconnect(input);
      } catch {
        /* already disconnected */
      }
      for (const node of nodes) node.disconnect();
    },
  };
}
