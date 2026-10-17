import { buildMp4, type Mp4Codec } from './mp4';
import { estimateLag, stemBitrate } from './separateRules';

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

const mono = (left: Float32Array, right: Float32Array) => {
  const out = new Float32Array(Math.min(left.length, right.length));
  for (let i = 0; i < out.length; i++) out[i] = (left[i]! + right[i]!) / 2;
  return out;
};

/**
 * Encodes one track. `left`/`right` are at `inputRate` (44.1 kHz from the model). Throws when the result can't be
 * decoded back here (better to stop than to share a broken file). `primingSamples`: what the other track of the same
 * song settled on (same encoder, same priming), so both tracks always start the same way.
 */
export async function encodeStem(
  left: Float32Array,
  right: Float32Array,
  inputRate: number,
  choice: CodecChoice,
  primingSamples?: number,
): Promise<EncodedStem> {
  const [l, r] = await resample(left, right, inputRate, choice.sampleRate);
  const { frames, frameSamples, description } = await encodeFrames(l, r, choice);
  const build = (primingSamples = 0) =>
    buildMp4({ codec: choice.codec, sampleRate: choice.sampleRate, channels: 2, frames, frameSamples, description, primingSamples });

  // Decode it back: it must play, and the comparison tells the encoder's delay.
  const Ctor = offlineCtor();
  const reference = mono(l, r);
  const measure = async (file: Uint8Array) => {
    const ctx = new Ctor(2, 1, choice.sampleRate);
    const decoded = await ctx.decodeAudioData(file.slice().buffer);
    const back = mono(decoded.getChannelData(0), decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : decoded.getChannelData(0));
    const lag = estimateLag(reference, back, Math.round(choice.sampleRate * 0.15), choice.sampleRate);
    return lag && lag.confidence > 0.5 ? lag.lag : null;
  };
  if (primingSamples != null) {
    const bytes = build(primingSamples);
    const lag = await measure(bytes);
    return { blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'audio/mp4' }), mime: 'audio/mp4', ext: 'm4a', codec: choice.codec, delaySeconds: lag == null ? Number.NaN : lag / choice.sampleRate, primingSamples };
  }
  let bytes = build();
  let priming = 0;
  const lag = await measure(bytes);
  // A quiet track (an instrumental-only song's voice) can't be measured: same encoder, so the other's delay holds.
  let delaySeconds = lag == null ? Number.NaN : lag / choice.sampleRate;
  // AAC priming: written as an edit list (the standard every player follows), so the file itself starts with the
  // sound on any browser, not only on one that decodes like this one. Kept only if this browser honours it too
  // (then what's left to compensate is ~0); otherwise the plain file and the measured delay, as before.
  if (choice.codec === 'aac' && lag != null && lag > 0 && lag < choice.sampleRate * 0.15) {
    const edited = build(lag);
    const left = await measure(edited).catch(() => null);
    if (left != null && Math.abs(left) <= Math.round(choice.sampleRate * 0.002)) {
      bytes = edited;
      priming = lag;
      delaySeconds = left / choice.sampleRate;
    } else {
      console.info('[stems] this browser ignores the AAC edit list; the measured delay is kept instead', lag, left);
    }
  }
  return { blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'audio/mp4' }), mime: 'audio/mp4', ext: 'm4a', codec: choice.codec, delaySeconds, primingSamples: priming };
}
