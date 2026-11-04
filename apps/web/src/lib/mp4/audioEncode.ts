/**
 * REQ-26 · Encoding a sound with WebCodecs' AudioEncoder, block by block, the same way wherever it runs: in a worker
 * (the separated tracks, the copy for the cloud) or, where workers have no AudioEncoder (some Safari), on the page.
 * Both paths feed the encoder the very same blocks (same size, same samples, same timestamps), so the files come out
 * the same byte for byte for the same input with a deterministic codec.
 *
 * The page keeps the decoded sound (the memory peak doesn't grow) and hands the worker one stretch at a time, copied
 * and transferred; the worker builds the blocks, encodes them, keeps the encoded samples and writes the MP4 on demand.
 */

/** Frames per block (0.1 s at 48 kHz): the size both callers always used. */
export const AUDIO_BLOCK = 4800;
/** Blocks per stretch handed to the worker (~4 s): a small copy, few messages. */
export const BLOCKS_PER_CHUNK = 40;
/** On the page, the thread is given back every so many blocks even when the encoder keeps up. */
export const YIELD_EVERY_BLOCKS = 8;

/** One encoding of a sound: what goes in and how it lines up with the source. */
export interface AudioPass {
  config: AudioEncoderConfig;
  /** Rate of the samples handed to the encoder (each AudioData's, and its timestamps'). */
  rate: number;
  /** Frames the encoded sound has. */
  length: number;
  /** Samples per channel in the source. */
  total: number;
  /** Source samples dropped at the start. */
  skip: number;
  /** Frames of silence added at the start. */
  pad: number;
}

/** A stretch of the source: its channels from sample `start` on. */
export interface SourceSlice {
  start: number;
  channels: readonly Float32Array[];
}

export interface EncodedAudioSample {
  data: Uint8Array;
  /** µs */
  time: number;
  /** µs; 0 when the encoder gave none. */
  duration: number;
}

/** The pass for a source with no shift (the separated tracks). */
export function plainPass(config: AudioEncoderConfig, total: number): AudioPass {
  return { config, rate: config.sampleRate, length: total, total, skip: 0, pad: 0 };
}

/** Source sample range [from, to) that output frames [pos, pos + frames) read. */
export function sourceRange(pass: AudioPass, pos: number, frames: number): [from: number, to: number] {
  const offset = pos - pass.pad + pass.skip;
  return [Math.min(pass.total, Math.max(0, offset)), Math.max(0, Math.min(pass.total, offset + frames))];
}

/** The stretch the worker needs for output frames [pos, pos + frames), copied (its buffers can be transferred). */
export function sliceSource(
  channels: readonly Float32Array[],
  pass: AudioPass,
  pos: number,
  frames: number,
): SourceSlice {
  const [from, to] = sourceRange(pass, pos, Math.max(frames, 0));
  return { start: from, channels: channels.map((ch) => ch.slice(from, Math.max(from, to))) };
}

/**
 * Fills one planar block (output frames [pos, pos + n)): channel `c` reads source channel min(c, last), silence
 * where the source has no sample (the pad before it, past its end). A whole stretch is a plain `set` of a subarray.
 */
export function fillBlock(
  planar: Float32Array,
  pass: AudioPass,
  slice: SourceSlice,
  pos: number,
  n: number,
  channels: number,
) {
  const offset = pos - pass.pad + pass.skip;
  const [from, to] = sourceRange(pass, pos, n);
  for (let c = 0; c < channels; c++) {
    const src = slice.channels[Math.min(c, slice.channels.length - 1)]!;
    if (to > from) planar.set(src.subarray(from - slice.start, to - slice.start), c * n + (from - offset));
  }
}

function toBytes(source: AllowSharedBufferSource | undefined): Uint8Array | undefined {
  if (!source) return undefined;
  if (source instanceof ArrayBuffer) return new Uint8Array(source.slice(0));
  const view = source as ArrayBufferView;
  return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer);
}

/** One AudioEncoder through one pass: blocks in, encoded samples (and the decoder's description) out. */
export class AudioPassEncoder {
  readonly samples: EncodedAudioSample[] = [];
  description: Uint8Array | undefined;
  bytes = 0;
  failure: unknown = null;
  /** Next output frame to encode. */
  pos = 0;
  private readonly encoder: AudioEncoder;
  private readonly channels: number;

  constructor(readonly pass: AudioPass) {
    this.channels = pass.config.numberOfChannels;
    this.encoder = new AudioEncoder({
      output: (chunk, meta) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        this.samples.push({ data, time: chunk.timestamp, duration: chunk.duration ?? 0 });
        this.bytes += data.byteLength;
        if (!this.description) this.description = toBytes(meta?.decoderConfig?.description);
      },
      error: (e) => {
        this.failure = e;
      },
    });
    this.encoder.configure(pass.config);
  }

  get done(): boolean {
    return this.pos >= this.pass.length;
  }

  get queueSize(): number {
    return this.encoder.encodeQueueSize;
  }

  /** Encodes the next block (the slice must hold its samples). */
  encodeBlock(slice: SourceSlice) {
    const n = Math.min(AUDIO_BLOCK, this.pass.length - this.pos);
    const planar = new Float32Array(n * this.channels);
    fillBlock(planar, this.pass, slice, this.pos, n, this.channels);
    const data = new AudioData({
      format: 'f32-planar',
      sampleRate: this.pass.rate,
      numberOfFrames: n,
      numberOfChannels: this.channels,
      timestamp: Math.round((this.pos / this.pass.rate) * 1e6),
      data: planar,
    });
    this.encoder.encode(data);
    data.close();
    this.pos += n;
  }

  async flush() {
    await this.encoder.flush();
  }

  close() {
    if (this.encoder.state !== 'closed') this.encoder.close();
  }
}

/** Gives the thread back (`scheduler.yield()` where there is one, else a macrotask). */
export const yieldToPage = () =>
  new Promise<void>((resolve) => {
    const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    if (s?.yield) void s.yield().then(resolve, () => setTimeout(resolve, 0));
    else setTimeout(resolve, 0);
  });

// ───────────── Worker protocol ─────────────

export type AudioPageMessage<J> =
  | { type: 'pass'; pass: AudioPass }
  | { type: 'chunk'; frames: number; slice: SourceSlice }
  | { type: 'end' }
  | { type: 'job'; job: J };

export type AudioWorkerMessage =
  | { type: 'ready'; encoder: boolean }
  | { type: 'ack' }
  /** REQ-26 · The worker has AudioEncoder but not this configuration: the page encodes this pass itself. */
  | { type: 'unsupported' }
  | { type: 'encoded'; bytes: number; durations: number[]; description: Uint8Array | null }
  | { type: 'result'; value: unknown }
  | { type: 'error'; message: string };

export interface JobOutcome {
  value: unknown;
  transfer?: Transferable[];
}

/** What a worker does with the encoded sound when asked (write the MP4, measure…). */
export type AudioJobRunner<J> = (
  job: J,
  encoded: { pass: AudioPass; samples: readonly EncodedAudioSample[]; description: Uint8Array | undefined },
) => JobOutcome;

/**
 * The worker side: one pass at a time, a stretch per message (answered once encoded, so the page never queues the
 * whole sound in messages), then the jobs on what was encoded. Posts `ready` at once, saying whether AudioEncoder
 * exists here.
 */
export function createAudioEncodeHost<J>(
  post: (message: AudioWorkerMessage, transfer?: Transferable[]) => void,
  runJob: AudioJobRunner<J>,
) {
  let current: AudioPassEncoder | null = null;
  let finished: {
    pass: AudioPass;
    samples: readonly EncodedAudioSample[];
    description: Uint8Array | undefined;
  } | null = null;
  const hasEncoder = typeof AudioEncoder !== 'undefined' && typeof AudioData !== 'undefined';
  post({ type: 'ready', encoder: hasEncoder });
  const fail = (error: unknown) => {
    current?.close();
    current = null;
    // The encoder refusing the configuration only now (some browsers report it late) is the same «unsupported».
    if ((error as { name?: string } | null)?.name === 'NotSupportedError') {
      post({ type: 'unsupported' });
      return;
    }
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  };
  // Messages are handled one after the other: the page waits for each answer before it sends the next.
  let chain = Promise.resolve();
  return (message: AudioPageMessage<J>) => {
    chain = chain.then(() => handle(message)).catch(fail);
  };

  async function handle(message: AudioPageMessage<J>) {
    if (message.type === 'pass') {
      current?.close();
      finished = null;
      current = null;
      // REQ-26 · The same check the page makes before it configures: if this worker can't, the page does (as before).
      try {
        const support = await AudioEncoder.isConfigSupported(message.pass.config);
        if (!support.supported) {
          post({ type: 'unsupported' });
          return;
        }
        current = new AudioPassEncoder(message.pass);
      } catch {
        post({ type: 'unsupported' });
        return;
      }
      post({ type: 'ack' });
      return;
    }
    if (message.type === 'chunk') {
      const enc = current;
      if (!enc) throw new Error('no pass');
      const end = enc.pos + message.frames;
      while (enc.pos < end && !enc.failure) enc.encodeBlock(message.slice);
      while (enc.queueSize > 64 && !enc.failure) await new Promise((r) => setTimeout(r, 0));
      if (enc.failure) throw enc.failure;
      post({ type: 'ack' });
      return;
    }
    if (message.type === 'end') {
      const enc = current;
      if (!enc) throw new Error('no pass');
      await enc.flush();
      if (enc.failure) throw enc.failure;
      enc.close();
      current = null;
      finished = { pass: enc.pass, samples: enc.samples, description: enc.description };
      post({
        type: 'encoded',
        bytes: enc.bytes,
        durations: enc.samples.map((s) => s.duration),
        description: enc.description ?? null,
      });
      return;
    }
    if (!finished) throw new Error('nothing encoded');
    const outcome = runJob(message.job, finished);
    post({ type: 'result', value: outcome.value }, outcome.transfer);
  }
}

/** REQ-26 · The whole worker entry point: wires `self` to the host above (both audio workers start the same way). */
export function createAudioWorker<J>(runJob: AudioJobRunner<J>) {
  const scope = self as unknown as {
    postMessage(message: unknown, transfer: Transferable[]): void;
    onmessage: ((event: MessageEvent<AudioPageMessage<J>>) => void) | null;
  };
  const handle = createAudioEncodeHost<J>(
    (message, transfer) => scope.postMessage(message, transfer ?? []),
    runJob,
  );
  scope.onmessage = (event) => handle(event.data);
}
