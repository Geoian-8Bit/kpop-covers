import { buildMp4, type Mp4Codec } from './mp4';
import { estimateLag, headFrameCount, LAG_HEAD_SECONDS, monoHead, stemBitrate } from './separateRules';

/**
 * 18 · The two separated tracks as small audio files (3–6 MB each for a 4-minute song): WebCodecs' AudioEncoder
 * (no extra library), AAC-LC where the browser has it (Chrome on Windows and Mac, Safari), else Opus; both in an
 * MP4 (`.m4a`) written by `mp4.ts`, which every browser plays, iPhone included. Not real time: a song encodes in
 * a second or two.
 *
 * Afterwards each file is decoded back and compared with what went in: that proves the browser can play it and
 * measures the encoder's fixed delay (AAC priming, Opus pre-skip), which the player compensates.
 */

export interface EncodedStem {
  blob: Blob;
  mime: 'audio/mp4';
  ext: 'm4a';
  codec: Mp4Codec;
  /** Seconds the track's sound comes after the file's (measured). */
  delaySeconds: number;
  /** Encoder priming written as the file's edit list (0: none). The other track of the same song uses the same. */
  primingSamples: number;
}

interface CodecChoice {
  codec: Mp4Codec;
  config: AudioEncoderConfig;
  sampleRate: number;
}

const hasEncoder = () => typeof AudioEncoder !== 'undefined' && typeof AudioData !== 'undefined';

/** Whether this browser can write the tracks (WebCodecs audio). */
export function canEncodeStems(): boolean {
  return hasEncoder();
}

/** AAC at the song's rate if possible (no resampling); else Opus, which always runs at 48 kHz. */
export async function pickCodec(durationSeconds: number, inputRate: number): Promise<CodecChoice | null> {
  if (!hasEncoder()) return null;
  const candidates: CodecChoice[] = [];
  const aacRate = stemBitrate(durationSeconds, 'aac');
  if (aacRate) {
    candidates.push({
      codec: 'aac',
      sampleRate: inputRate,
      config: { codec: 'mp4a.40.2', sampleRate: inputRate, numberOfChannels: 2, bitrate: aacRate },
    });
  }
  const opusRate = stemBitrate(durationSeconds, 'opus');
  if (opusRate) {
    candidates.push({
      codec: 'opus',
      sampleRate: 48000,
      config: { codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: opusRate },
    });
  }
  for (const c of candidates) {
    try {
      const support = await AudioEncoder.isConfigSupported(c.config);
      if (support.supported) return c;
    } catch {
      /* try the next */
    }
  }
  return null;
}

type OfflineCtor = typeof OfflineAudioContext;
function offlineCtor(): OfflineCtor {
  const Ctor =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: OfflineCtor }).webkitOfflineAudioContext;
  if (!Ctor) throw new Error('no OfflineAudioContext');
  return Ctor;
}

/** The browser's own resampler (good quality, off the main thread). */
async function resample(left: Float32Array, right: Float32Array, from: number, to: number) {
  if (from === to) return [left, right] as const;
  const Ctor = offlineCtor();
  const frames = Math.ceil((left.length * to) / from);
  const ctx = new Ctor(2, frames, to);
  const buffer = ctx.createBuffer(2, left.length, from);
  buffer.copyToChannel(left as Float32Array<ArrayBuffer>, 0);
  buffer.copyToChannel(right as Float32Array<ArrayBuffer>, 1);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
  const out = await ctx.startRendering();
  return [out.getChannelData(0), out.getChannelData(1)] as const;
}

const toBytes = (d: AllowSharedBufferSource): Uint8Array =>
  ArrayBuffer.isView(d)
    ? new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength))
    : new Uint8Array(d.slice(0));

async function encodeFrames(left: Float32Array, right: Float32Array, choice: CodecChoice) {
  const frames: Uint8Array[] = [];
  const frameSamples: number[] = [];
  let description: Uint8Array | null = null;
  let failure: unknown = null;
  const rate = choice.sampleRate;
  const fallbackSamples = choice.codec === 'aac' ? 1024 : 960;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      frames.push(data);
      const samples = chunk.duration ? Math.round((chunk.duration * rate) / 1e6) : fallbackSamples;
      frameSamples.push(samples > 0 ? samples : fallbackSamples);
      const d = meta?.decoderConfig?.description;
      if (d && !description) description = toBytes(d);
    },
    error: (e) => {
      failure = e;
    },
  });
  encoder.configure(choice.config);
  const block = 4800;
  for (let at = 0; at < left.length; at += block) {
    if (failure) break;
    const n = Math.min(block, left.length - at);
    const planar = new Float32Array(n * 2);
    planar.set(left.subarray(at, at + n), 0);
    planar.set(right.subarray(at, at + n), n);
    const data = new AudioData({
      format: 'f32-planar',
      sampleRate: rate,
      numberOfFrames: n,
      numberOfChannels: 2,
      timestamp: Math.round((at / rate) * 1e6),
      data: planar,
    });
    encoder.encode(data);
    data.close();
    // Don't queue the whole song at once.
    if (encoder.encodeQueueSize > 64) await new Promise((r) => setTimeout(r, 0));
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure instanceof Error ? failure : new Error(String(failure));
  return { frames, frameSamples, description };
}

/** Lets the page breathe between the heavy steps (the studio's loop and clips run on this thread). */
const breathe = () =>
  new Promise<void>((resolve) => {
    const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    if (s?.yield) void s.yield().then(resolve, () => setTimeout(resolve, 0));
    else setTimeout(resolve, 0);
  });

/**
 * Encodes one track. `left`/`right` are at `inputRate` (44.1 kHz from the model). Throws when the result can't be
 * decoded back here (better to stop than to share a broken file). `primingSamples`: what the other track of the same
 * song settled on (same encoder, same priming), so both tracks always start the same way.
 *
 * Global review [5] · Light on the page: the delay is measured on the first seconds only (a short file of the first
 * frames, decoded back, against a mono mix of the same seconds), the whole file is decoded once only to prove it
 * plays (and let go at once), and the thread is given back between steps.
 */
export async function encodeStem(
  left: Float32Array,
  right: Float32Array,
  inputRate: number,
  choice: CodecChoice,
  primingSamples?: number,
): Promise<EncodedStem> {
  const rate = choice.sampleRate;
  const maxLag = Math.round(rate * 0.15);
  const headSamples = LAG_HEAD_SECONDS * rate;
  // The resampled song only lives inside this block: once encoded, only its first seconds (mono) are kept.
  const { encoded, reference } = await (async () => {
    const [l, r] = await resample(left, right, inputRate, rate);
    await breathe();
    const out = await encodeFrames(l, r, choice);
    return { encoded: out, reference: monoHead(l, r, headSamples + 2 * maxLag) };
  })();
  await breathe();
  const { frames, frameSamples, description } = encoded;
  const build = (primingSamples = 0) =>
    buildMp4({ codec: choice.codec, sampleRate: rate, channels: 2, frames, frameSamples, description, primingSamples });
  const headCount = headFrameCount(frameSamples, headSamples + 2 * maxLag);
  const buildHead = (primingSamples = 0) =>
    buildMp4({
      codec: choice.codec,
      sampleRate: rate,
      channels: 2,
      frames: frames.slice(0, headCount),
      frameSamples: frameSamples.slice(0, headCount),
      description,
      primingSamples,
    });

  const Ctor = offlineCtor();
  const decode = async (file: Uint8Array) => {
    const ctx = new Ctor(2, 1, rate);
    return ctx.decodeAudioData(file.slice().buffer);
  };
  // The encoder's delay, on the first seconds of the track.
  const measure = async (primingSamples = 0) => {
    const decoded = await decode(buildHead(primingSamples));
    const back = monoHead(
      decoded.getChannelData(0),
      decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : decoded.getChannelData(0),
      reference.length,
    );
    await breathe();
    const lag = estimateLag(reference, back, maxLag, rate);
    await breathe();
    return lag && lag.confidence > 0.5 ? lag.lag : null;
  };
  // It must play here, whole (the decoded sound is dropped right away: only its length is read).
  const provePlays = async (file: Uint8Array) => {
    const seconds = (await decode(file)).duration;
    await breathe();
    if (!(seconds > 0)) throw new Error('empty track');
  };
  const result = (bytes: Uint8Array, delaySeconds: number, priming: number): EncodedStem => ({
    blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'audio/mp4' }),
    mime: 'audio/mp4',
    ext: 'm4a',
    codec: choice.codec,
    delaySeconds,
    primingSamples: priming,
  });

  if (primingSamples != null) {
    const bytes = build(primingSamples);
    await provePlays(bytes);
    const lag = await measure(primingSamples);
    return result(bytes, lag == null ? Number.NaN : lag / rate, primingSamples);
  }
  let bytes = build();
  await provePlays(bytes);
  let priming = 0;
  const lag = await measure();
  // A quiet track (an instrumental-only song's voice) can't be measured: same encoder, so the other's delay holds.
  let delaySeconds = lag == null ? Number.NaN : lag / rate;
  // AAC priming: written as an edit list (the standard every player follows), so the file itself starts with the
  // sound on any browser, not only on one that decodes like this one. Kept only if this browser honours it too
  // (then what's left to compensate is ~0); otherwise the plain file and the measured delay, as before.
  if (choice.codec === 'aac' && lag != null && lag > 0 && lag < maxLag) {
    const left = await measure(lag).catch(() => null);
    if (left != null && Math.abs(left) <= Math.round(rate * 0.002)) {
      bytes = build(lag);
      priming = lag;
      delaySeconds = left / rate;
    } else {
      console.info('[stems] this browser ignores the AAC edit list; the measured delay is kept instead', lag, left);
    }
  }
  return result(bytes, delaySeconds, priming);
}
