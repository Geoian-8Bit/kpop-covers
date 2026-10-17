import { useCallback, useEffect, useState } from 'react';
import { usePlayer } from '@/player/store';
import type { EnvelopeState, PlaybackClock } from './controlParts';
import {
  declaredBytes,
  remoteWaveAllowed,
  remoteWaveOffer,
  waveByteLimit,
  type ConnectionHints,
} from './studioWaveRules';
import { envelopeFromChannels, ENVELOPE_BINS, type VoiceEnvelope } from './waveRules';

/**
 * F17 · What «Olas del audio real» needs from the studio: the playhead (read from the player store outside React)
 * and the envelope of the file on the stage, computed once per file and kept in memory.
 *
 * Cost: the file is read once into memory and decoded, resampled to 8 kHz, by the browser's decoder (a 4-minute
 * stereo song leaves ~15 MB of samples, freed right after). So the limits are low (`studioWaveRules.ts`): 60 MB, or
 * 30 MB on a phone with little memory. A file in the cloud is a second download next to the one the <video>
 * streams: on its own only on wifi (or a computer), never with «ahorro de datos»; elsewhere (an iPhone, mobile data)
 * the variant asks first, with the size from a HEAD request, and downloads it when the button is tapped. A device copy
 * (blob: URL) has no such limit. Leaving the studio or the variant cancels a download nobody else is waiting for.
 */

/** The studio's playhead: the store's time and duration (the same numbers the timeline paints). */
export const studioClock: PlaybackClock = {
  read: () => {
    const { time, duration } = usePlayer.getState();
    return { time, duration };
  },
  subscribe: (listener) => usePlayer.subscribe(listener),
};

const RATES = [8000, 22050, 44100];
const CACHE_SIZE = 4;

interface Job {
  promise: Promise<VoiceEnvelope>;
  abort: AbortController;
  /** Components waiting for it; when the last one leaves before it is done, the job is cancelled. */
  users: number;
  done: boolean;
}

const cache = new Map<string, Job>();
/** Cloud files the user agreed to download on this connection (this session). */
const consented = new Set<string>();

/** Why a file isn't drawn: it needs the user's go-ahead on this connection, or it is past the limit. */
export class WaveRefusal extends Error {
  constructor(
    readonly reason: 'ask' | 'too-big',
    readonly bytes: number | null = null,
  ) {
    super(reason === 'ask' ? 'not on this connection' : 'too big');
  }
}

/** The envelope as the studio sees it: also «ask before downloading» and «too big to read». */
export type StudioEnvelopeState =
  EnvelopeState | { status: 'ask'; bytes: number | null } | { status: 'too-big' };

type OfflineCtor = typeof OfflineAudioContext;

function offlineContext(): OfflineAudioContext {
  const Ctor: OfflineCtor | undefined =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: OfflineCtor }).webkitOfflineAudioContext;
  if (!Ctor) throw new Error('no OfflineAudioContext');
  // Low rates keep the decoded samples small; older Safari only accepts the usual ones.
  for (const rate of RATES) {
    try {
      return new Ctor(2, 1, rate);
    } catch {
      /* try the next rate */
    }
  }
  throw new Error('no usable sample rate');
}

function connectionHints(): ConnectionHints | undefined {
  return (navigator as Navigator & { connection?: ConnectionHints }).connection;
}

function coarsePointer(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

function deviceMemory(): number | undefined {
  return (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
}

/** Reads a stream to the end, refusing (and cancelling) past `limit`; for responses that don't say their size. */
async function readCapped(res: Response, limit: number, abort: AbortController): Promise<ArrayBuffer> {
  const reader = res.body?.getReader();
  if (!reader) return res.arrayBuffer();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      abort.abort();
      throw new WaveRefusal('too-big');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes.buffer;
}

/** The size of a cloud file without downloading it (HEAD); null when the server doesn't say or refuses. */
async function headBytes(url: string, abort: AbortController): Promise<number | null> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: abort.signal });
    return res.ok ? declaredBytes(res.headers.get('content-length')) : null;
  } catch {
    return null;
  }
}

async function readBytes(url: string, abort: AbortController): Promise<ArrayBuffer> {
  const local = url.startsWith('blob:');
  const limit = waveByteLimit(deviceMemory());
  if (!local && !consented.has(url) && !remoteWaveAllowed(connectionHints(), coarsePointer())) {
    const offer = remoteWaveOffer(await headBytes(url, abort), limit);
    throw offer.kind === 'too-big' ? new WaveRefusal('too-big') : new WaveRefusal('ask', offer.bytes);
  }
  const res = await fetch(url, { signal: abort.signal });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const declared = declaredBytes(res.headers.get('content-length'));
  if (declared !== null) {
    if (declared > limit) throw new WaveRefusal('too-big');
    // Straight into one buffer (a Blob first would hold the file twice).
    return res.arrayBuffer();
  }
  return readCapped(res, limit, abort);
}

async function computeEnvelope(url: string, abort: AbortController): Promise<VoiceEnvelope> {
  let bytes: ArrayBuffer | null = await readBytes(url, abort).catch((error: unknown) => {
    abort.abort(); // a refused file stops downloading at once
    throw error;
  });
  if (abort.signal.aborted) throw new Error('cancelled');
  const ctx = offlineContext();
  const audio = await ctx.decodeAudioData(bytes);
  bytes = null; // detached by the decoder anyway; nothing else should keep it
  if (abort.signal.aborted) throw new Error('cancelled');
  const left = audio.getChannelData(0);
  const right = audio.numberOfChannels > 1 ? audio.getChannelData(1) : left;
  return envelopeFromChannels(left, right, audio.sampleRate, ENVELOPE_BINS);
}

/**
 * The envelope of a media URL, computed once (the last few are kept; a failure is forgotten, to retry later).
 * `release` says the caller no longer waits: the last one to leave an unfinished job cancels it. `consent`: the user
 * tapped «Dibujar la ola», so a cloud file is downloaded on any connection (the byte limit still applies).
 */
export function loadEnvelope(
  url: string,
  options: { consent?: boolean } = {},
): { promise: Promise<VoiceEnvelope>; release: () => void } {
  if (options.consent && !consented.has(url)) {
    consented.add(url);
    // The refusal that asked is normally forgotten already; never reuse it.
    if (cache.get(url)?.done) cache.delete(url);
  }
  let job = cache.get(url);
  if (!job) {
    const abort = new AbortController();
    const created: Job = { promise: computeEnvelope(url, abort), abort, users: 0, done: false };
    job = created;
    cache.set(url, created);
    created.promise.then(
      () => {
        created.done = true;
      },
      () => {
        created.done = true;
        if (cache.get(url) === created) cache.delete(url);
      },
    );
    while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  }
  const current = job;
  current.users++;
  let released = false;
  return {
    promise: current.promise,
    release: () => {
      if (released) return;
      released = true;
      current.users--;
      if (current.users > 0 || current.done) return;
      current.abort.abort();
      if (cache.get(url) === current) cache.delete(url);
    },
  };
}

/**
 * The envelope of the file playing in the studio, while `enabled` (the variant is on screen and the source is a
 * file). Follows the player: a new engine, or the same one ready again with another file → a new envelope. The URL
 * comes from the engine itself (`mediaUrl`), not from the page's markup. `download` is the button's action when the
 * state is «ask»: it downloads that file and draws it (leaving still cancels it).
 */
export function useStudioEnvelope(enabled: boolean): { state: StudioEnvelopeState; download: () => void } {
  const engine = usePlayer((s) => s.engine);
  const ready = usePlayer((s) => s.ready);
  const [state, setState] = useState<StudioEnvelopeState>({ status: 'none' });
  const [consentFor, setConsentFor] = useState<string | null>(null);
  const url = enabled && engine && ready ? (engine.mediaUrl?.() ?? null) : null;
  const consent = url !== null && consentFor === url;

  useEffect(() => {
    if (!url) {
      setState({ status: 'none' });
      return;
    }
    let live = true;
    setState({ status: 'loading' });
    const { promise, release } = loadEnvelope(url, { consent });
    promise.then(
      (envelope) => live && setState({ status: 'ready', envelope }),
      (error: unknown) => live && setState(refusedState(error)),
    );
    return () => {
      live = false;
      release();
    };
  }, [url, consent]);

  const download = useCallback(() => {
    if (url) setConsentFor(url);
  }, [url]);

  return { state, download };
}

function refusedState(error: unknown): StudioEnvelopeState {
  if (error instanceof WaveRefusal) {
    return error.reason === 'ask' ? { status: 'ask', bytes: error.bytes } : { status: 'too-big' };
  }
  return { status: 'failed' };
}
