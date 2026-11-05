import {
  AUDIO_BLOCK,
  BLOCKS_PER_CHUNK,
  sliceSource,
  type AudioPageMessage,
  type AudioPass,
  type AudioWorkerMessage,
} from './audioEncode';

/**
 * REQ-26 · The page side of an audio encoding worker (`createAudioEncodeHost`): opens it, streams one pass to it a
 * stretch at a time and asks it for jobs. `null` from `openAudioWorker` means «encode on the page instead» (no
 * workers, or no AudioEncoder in them, as on some Safari).
 *
 * A job that fails rejects only its own request. The worker is given up on (`AudioWorkerUnavailable`) when it can't
 * take a pass's configuration, when it errors or can't be talked to, or when it stays silent past a deadline
 * (Chromium may kill a worker for memory without a word): whoever asked then does the work on the page, as before.
 */

interface EncodedSummary {
  bytes: number;
  /** Each encoded sample's duration (µs; 0 when the encoder gave none). */
  durations: number[];
  description: Uint8Array | null;
}

/** The worker can't do this (configuration refused, died, went silent): the page should. */
export class AudioWorkerUnavailable extends Error {
  constructor(reason: string) {
    super(`audio worker: ${reason}`);
    this.name = 'AudioWorkerUnavailable';
  }
}

export interface AudioWorkerClient<J> {
  /**
   * Encodes `channels` through `pass`. Rejects with `AudioWorkerUnavailable` when the page should encode instead,
   * with the worker's error for a failed encoding, or with `abortError()` when cancelled (the worker is stopped).
   */
  encode(pass: AudioPass, channels: readonly Float32Array[], signal?: AbortSignal): Promise<EncodedSummary>;
  /** `workMs`: extra time the job may take on top of the base allowance (default: proportional to `transfer`). */
  run<T>(job: J, transfer?: Transferable[], signal?: AbortSignal, workMs?: number): Promise<T>;
  /** Whether the worker was given up on (the next job goes to the page). */
  readonly broken: boolean;
  close(): void;
}

/** How long a worker may take to start before the page does the work itself. */
const READY_TIMEOUT_MS = 15_000;
/** Base time any answer may take; a slow machine encoding ~4 s of sound or writing a small file fits easily. */
const ANSWER_BASE_MS = 30_000;
/** Extra time per transferred megabyte (a job's input), for jobs whose work grows with it. */
const MS_PER_MB = 1_000;

const bytesOf = (transfer: Transferable[]) =>
  transfer.reduce<number>((sum, t) => sum + (t instanceof ArrayBuffer ? t.byteLength : 0), 0);

export async function openAudioWorker<J>(
  make: () => Worker,
  abortError: () => Error,
  /** Overridable for tests. */
  limits: { readyMs?: number; baseMs?: number } = {},
): Promise<AudioWorkerClient<J> | null> {
  if (typeof Worker === 'undefined') return null;
  const readyMs = limits.readyMs ?? READY_TIMEOUT_MS;
  const baseMs = limits.baseMs ?? ANSWER_BASE_MS;
  let worker: Worker;
  try {
    worker = make();
  } catch {
    return null;
  }
  let closed = false;
  let dead: Error | null = null;
  let waiting: { resolve: (m: AudioWorkerMessage) => void; reject: (e: unknown) => void } | null = null;
  const close = () => {
    if (closed) return;
    closed = true;
    worker.terminate();
  };
  const settle = (error: unknown) => {
    const w = waiting;
    waiting = null;
    w?.reject(error);
  };
  /** The worker is lost for good (script error, unreadable message, silence): stop it, fail what waits. */
  const die = (reason: string) => {
    dead ??= new AudioWorkerUnavailable(reason);
    close();
    settle(dead);
  };
  worker.onmessage = (event: MessageEvent<AudioWorkerMessage>) => {
    const message = event.data;
    const w = waiting;
    waiting = null;
    // An error is that request's alone: the worker stays usable for the next one.
    if (message.type === 'error') w?.reject(new Error(message.message));
    else w?.resolve(message);
  };
  worker.onerror = (event) => {
    event.preventDefault?.();
    die(event.message || 'error');
  };
  worker.onmessageerror = () => die('unreadable message');

  /** Waits for the next message from the worker, within `ms`, or until `signal` aborts. */
  const answer = (ms: number, signal?: AbortSignal) =>
    new Promise<AudioWorkerMessage>((resolve, reject) => {
      if (dead) return reject(dead);
      if (closed || signal?.aborted) {
        close();
        return reject(abortError());
      }
      const done = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };
      const timer = setTimeout(() => die('no answer'), ms);
      const onAbort = () => {
        close();
        settle(abortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      waiting = {
        resolve: (m) => (done(), resolve(m)),
        reject: (e) => (done(), reject(e)),
      };
    });
  /** Sends and waits for the answer (a send that can't go out leaves no stray rejection behind). */
  const ask = (message: AudioPageMessage<J>, transfer: Transferable[], ms: number, signal?: AbortSignal) => {
    const reply = answer(ms, signal);
    try {
      worker.postMessage(message, transfer);
    } catch (error) {
      settle(error);
    }
    return reply;
  };

  // It says at once whether it has an encoder; no answer (or a failure to load) means doing it on the page.
  const ready = await answer(readyMs).catch(() => null);
  if (!ready || ready.type !== 'ready' || !ready.encoder) {
    close();
    return null;
  }

  // The worker answers one request at a time (`waiting` is a single slot): requests made meanwhile queue up here, in
  // order, and each starts when the one before has ended (however it ended).
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const result = queue.then(fn);
    queue = result.catch(() => undefined);
    return result;
  };

  async function encodePass(pass: AudioPass, channels: readonly Float32Array[], signal?: AbortSignal) {
    const started = await ask({ type: 'pass', pass }, [], baseMs, signal);
    if (started.type === 'unsupported') throw new AudioWorkerUnavailable('configuration not supported');
    const step = AUDIO_BLOCK * BLOCKS_PER_CHUNK;
    for (let pos = 0; pos < pass.length; pos += step) {
      const frames = Math.min(step, pass.length - pos);
      const slice = sliceSource(channels, pass, pos, frames);
      const sent = await ask(
        { type: 'chunk', frames, slice },
        slice.channels.map((c) => c.buffer),
        baseMs,
        signal,
      );
      if (sent.type === 'unsupported') throw new AudioWorkerUnavailable('configuration not supported');
    }
    // Flushing waits for the encoder: allow time proportional to the sound (half real time at the very worst).
    const flushMs = baseMs + (pass.length / pass.rate) * 500;
    const done = await ask({ type: 'end' }, [], flushMs, signal);
    if (done.type === 'unsupported') throw new AudioWorkerUnavailable('configuration not supported');
    if (done.type !== 'encoded') throw new Error(`audio worker: ${done.type}`);
    return { bytes: done.bytes, durations: done.durations, description: done.description };
  }

  async function runJob<T>(job: J, transfer: Transferable[], signal?: AbortSignal, workMs?: number) {
    const ms = baseMs + (workMs ?? (bytesOf(transfer) / 1_048_576) * MS_PER_MB);
    const done = await ask({ type: 'job', job }, transfer, ms, signal);
    if (done.type !== 'result') throw new Error(`audio worker: ${done.type}`);
    return done.value as T;
  }

  return {
    encode: (pass, channels, signal) => exclusive(() => encodePass(pass, channels, signal)),
    run: <T>(job: J, transfer: Transferable[] = [], signal?: AbortSignal, workMs?: number) =>
      exclusive(() => runJob<T>(job, transfer, signal, workMs)),
    get broken() {
      return dead !== null || closed;
    },
    close,
  };
}
