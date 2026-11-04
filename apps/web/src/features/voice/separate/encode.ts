import {
  AudioPassEncoder,
  plainPass,
  type AudioPass,
  YIELD_EVERY_BLOCKS,
  yieldToPage,
} from '@/lib/mp4/audioEncode';
import { AudioWorkerUnavailable, openAudioWorker } from '@/lib/mp4/audioWorkerClient';
import type { Mp4Codec } from './mp4';
import {
  estimateLagSliced,
  headFrameCount,
  LAG_HEAD_SECONDS,
  monoHead,
  stemBitrate,
  type LagEstimate,
} from './separateRules';
import { muxStem, stemFrameSamples, type StemJob, type StemMuxJob } from './stemFrames';

/**
 * 18 · The two separated tracks as small audio files (3–6 MB each for a 4-minute song): WebCodecs' AudioEncoder
 * (no extra library), AAC-LC where the browser has it (Chrome on Windows and Mac, Safari), else Opus; both in an
 * MP4 (`.m4a`) written by `mp4.ts`, which every browser plays, iPhone included. Not real time: a song encodes in
 * a second or two.
 *
 * Afterwards each file is decoded back and compared with what went in: that proves the browser can play it and
 * measures the encoder's fixed delay (AAC priming, Opus pre-skip), which the player compensates.
 *
 * REQ-26 · The encoding and the MP4 writing run in a worker (`stemEncoder.worker.ts`); the page keeps only what
 * needs OfflineAudioContext (resampling to Opus' 48 kHz, decoding back to measure). Where workers have no
 * AudioEncoder (some Safari) it all stays here, giving the thread back every few blocks. Same blocks, same bytes.
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

/**
 * The encoded track, wherever it lives: its frames' lengths, its file (whole, or its first `headCount` frames) and
 * the encoder's delay measured on a decoded-back start (in the worker when there is one).
 */
interface StemEncoding {
  frameSamples: number[];
  file(primingSamples: number, headCount?: number): Promise<Uint8Array>;
  lag(
    reference: Float32Array,
    back: Float32Array,
    maxLag: number,
    window: number,
  ): Promise<LagEstimate | null>;
  close(): void;
}

const cancelled = () => new DOMException('cancelled', 'AbortError');
const isCancel = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

export async function encodeFrames(
  left: Float32Array,
  right: Float32Array,
  choice: CodecChoice,
): Promise<StemEncoding> {
  const rate = choice.sampleRate;
  const pass = plainPass(choice.config, left.length);
  const job = (primingSamples: number, headCount?: number): StemMuxJob => ({
    codec: choice.codec,
    sampleRate: rate,
    channels: 2,
    primingSamples,
    headCount: headCount ?? null,
  });
  const worker = await openAudioWorker<StemJob>(
    () => new Worker(new URL('./stemEncoder.worker.ts', import.meta.url), { type: 'module' }),
    cancelled,
  );
  if (worker) {
    let again: Promise<StemEncoding> | undefined;
    const onPage = () => (again ??= encodeOnPage(left, right, choice, pass, job));
    try {
      const summary = await worker.encode(pass, [left, right]);
      return {
        frameSamples: stemFrameSamples(summary.durations, rate, choice.codec),
        // REQ-26 · The worker lost after it encoded (it alone held the samples): the page encodes again, once, from
        // the sound it still has, and writes the file itself, as it did before there were workers.
        file: async (primingSamples, headCount) => {
          try {
            return await worker.run<Uint8Array>({ kind: 'file', file: job(primingSamples, headCount) });
          } catch (error) {
            if (!(error instanceof AudioWorkerUnavailable)) throw error;
            return (await onPage()).file(primingSamples, headCount);
          }
        },
        // The reference serves several measures: copies go over (the page keeps its own, in case the worker is
        // lost mid-way and the page measures after all, as before).
        lag: async (reference, back, maxLag, window) => {
          if (!worker.broken) {
            const ref = reference.slice();
            const head = back.slice();
            try {
              return await worker.run<LagEstimate | null>(
                { kind: 'lag', reference: ref, back: head, maxLag, window },
                [ref.buffer, head.buffer],
              );
            } catch (error) {
              if (isCancel(error)) throw error;
            }
          }
          return estimateLagSliced(reference, back, maxLag, window, breathe);
        },
        close: worker.close,
      };
    } catch (error) {
      worker.close();
      // REQ-26 · The worker can't take this configuration (or is lost): the page encodes, as before.
      if (!(error instanceof AudioWorkerUnavailable))
        throw error instanceof Error ? error : new Error(String(error));
    }
  }
  return encodeOnPage(left, right, choice, pass, job);
}

/** On the page: the same blocks, with the thread given back every few of them even when the encoder keeps up. */
async function encodeOnPage(
  left: Float32Array,
  right: Float32Array,
  choice: CodecChoice,
  pass: AudioPass,
  job: (primingSamples: number, headCount?: number) => StemMuxJob,
): Promise<StemEncoding> {
  const rate = choice.sampleRate;
  const encoder = new AudioPassEncoder(pass);
  const slice = { start: 0, channels: [left, right] };
  try {
    for (let blocks = 1; !encoder.done && !encoder.failure; blocks++) {
      encoder.encodeBlock(slice);
      // Don't queue the whole song at once.
      if (encoder.queueSize > 64 || blocks % YIELD_EVERY_BLOCKS === 0) await breathe();
    }
    await encoder.flush();
  } finally {
    encoder.close();
  }
  const failure = encoder.failure;
  if (failure) throw failure instanceof Error ? failure : new Error(String(failure));
  const frameSamples = stemFrameSamples(
    encoder.samples.map((s) => s.duration),
    rate,
    choice.codec,
  );
  return {
    frameSamples,
    file: async (primingSamples, headCount) =>
      muxStem(encoder.samples, frameSamples, encoder.description, job(primingSamples, headCount)),
    lag: (reference, back, maxLag, window) => estimateLagSliced(reference, back, maxLag, window, breathe),
    close: () => undefined,
  };
}

/** Lets the page breathe between the heavy steps (the studio's loop and clips run on this thread). */
const breathe = yieldToPage;

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
  // The resampled song lives until the end (a lost worker's sound is encoded again from it); of it the delay measure
  // keeps only its first seconds (mono).
  const [l, r] = await resample(left, right, inputRate, rate);
  await breathe();
  const encoded = await encodeFrames(l, r, choice);
  let reference: Float32Array;
  try {
    reference = monoHead(l, r, headSamples + 2 * maxLag);
  } catch (error) {
    encoded.close();
    throw error;
  }
  try {
    await breathe();
    return await finishStem(encoded, reference, choice, maxLag, headSamples, primingSamples);
  } finally {
    encoded.close();
  }
}

async function finishStem(
  encoded: StemEncoding,
  reference: Float32Array,
  choice: CodecChoice,
  maxLag: number,
  headSamples: number,
  primingSamples: number | undefined,
): Promise<EncodedStem> {
  const rate = choice.sampleRate;
  const build = (primingSamples = 0) => encoded.file(primingSamples);
  const headCount = headFrameCount(encoded.frameSamples, headSamples + 2 * maxLag);
  const buildHead = (primingSamples = 0) => encoded.file(primingSamples, headCount);

  const Ctor = offlineCtor();
  const decode = async (file: Uint8Array) => {
    const ctx = new Ctor(2, 1, rate);
    return ctx.decodeAudioData(file.slice().buffer);
  };
  // The encoder's delay, on the first seconds of the track.
  const measure = async (primingSamples = 0) => {
    const decoded = await decode(await buildHead(primingSamples));
    const back = monoHead(
      decoded.getChannelData(0),
      decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : decoded.getChannelData(0),
      reference.length,
    );
    await breathe();
    const lag = await encoded.lag(reference, back, maxLag, rate);
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
    const bytes = await build(primingSamples);
    await provePlays(bytes);
    const lag = await measure(primingSamples);
    return result(bytes, lag == null ? Number.NaN : lag / rate, primingSamples);
  }
  let bytes = await build();
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
      bytes = await build(lag);
      priming = lag;
      delaySeconds = left / rate;
    } else {
      console.info(
        '[stems] this browser ignores the AAC edit list; the measured delay is kept instead',
        lag,
        left,
      );
    }
  }
  return result(bytes, delaySeconds, priming);
}
