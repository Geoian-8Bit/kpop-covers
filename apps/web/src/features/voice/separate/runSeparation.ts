import { formatBytes, type Video } from '@coverscape/shared';
import { isStaleCopy } from '@/data/videos';
import { backend, stemsBackend, type UploadFailure, type VideoStems } from '@/lib/backend';
import { beginHeavyWork, heavyWorkBusy, untilHeavyWork, type HeavyWork } from '@/lib/heavyWork';
import { loadLocalVideo } from '@/lib/localVideos';
import { FriendlyError } from '@/lib/supabase';
import { usePlayer } from '@/player/store';
import { canEncodeStems, encodeStem, pickCodec } from './encode';
import { formatMaxLength, maxOriginalBytes } from '@/features/studio/cloudCopyRules';
import { clearModelCache, hasModelCache, isModelCached, MODELS } from './model';
import type { PauseRequest, RunRequest, SeparationErrorCode, WorkerMessage } from './protocol';
import {
  chooseEngine,
  DEMUCS,
  estimateSeparationRange,
  estimateStemBytes,
  maxSeparateSeconds,
  modelCacheLooksBroken,
  reusablePendingStems,
  smallerStemBitrate,
  stemFits,
  spaceVerdict,
  stemBitrate,
  type DeviceCaps,
  type EngineChoice,
  type EngineKind,
  type ProgressState,
  type SpaceVerdict,
} from './separateRules';

/**
 * 18 · «Separar voz y música»: the whole job on this device, step by step — check the device, read and decode
 * the file's audio, separate it in the worker (model from Hugging Face, cached), encode both tracks, check the
 * group's space, upload them and record the separation. Loaded only when the button is used (dynamic import).
 */

interface GpuAdapterLike {
  features?: { has(name: string): boolean };
  limits?: { maxStorageBufferBindingSize?: number };
}

/** What this device offers for the separation (one adapter request, no device is created). */
export async function deviceCaps(): Promise<DeviceCaps> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(o?: object): Promise<GpuAdapterLike | null> } }).gpu;
  let adapter: GpuAdapterLike | null;
  try {
    adapter = gpu ? await gpu.requestAdapter({ powerPreference: 'high-performance' }) : null;
  } catch {
    adapter = null;
  }
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return {
    webgpu: adapter != null && typeof Worker !== 'undefined' && canEncodeStems(),
    shaderF16: adapter?.features?.has('shader-f16') ?? false,
    deviceMemoryGb: typeof memory === 'number' ? memory : null,
    maxBindingBytes: adapter?.limits?.maxStorageBufferBindingSize ?? null,
    mobile: coarse && Math.min(screen.width, screen.height) < 820,
  };
}

export async function checkDevice(): Promise<EngineChoice> {
  return chooseEngine(await deviceCaps());
}

export interface SeparationPreview {
  engine: EngineKind;
  mobile: boolean;
  durationSeconds: number;
  /** Seconds, a rough range before measuring. */
  estimate: [number, number];
  /** Bytes to download first (0 when the model is already on this device). */
  modelBytes: number;
  /** Any model file kept on this device, whole or a download left halfway («Borrar el modelo de IA»). */
  hasModelCache: boolean;
  space: SpaceVerdict;
}

/** The song's length as the group knows it (the linked file's, else the video's). */
export function songSeconds(video: Pick<Video, 'file_duration_seconds' | 'duration_seconds'>): number {
  return Number(video.file_duration_seconds ?? video.duration_seconds ?? 0) || 0;
}

/** Everything the confirmation says: time, download, space. */
export async function previewSeparation(video: Video, engine: EngineKind, mobile: boolean): Promise<SeparationPreview> {
  const durationSeconds = songSeconds(video) || 240;
  const bitrate = stemBitrate(durationSeconds, 'aac') ?? 128_000;
  const [usage, cached, anyCache] = await Promise.all([
    backend.storageUsage().catch(() => null),
    isModelCached(engine),
    hasModelCache(),
  ]);
  const needed = 2 * estimateStemBytes(durationSeconds, bitrate);
  return {
    engine,
    mobile,
    durationSeconds,
    estimate: estimateSeparationRange(durationSeconds, engine, mobile),
    modelBytes: cached ? 0 : MODELS[engine].bytes,
    hasModelCache: cached || anyCache,
    space: usage ? spaceVerdict(usage.total, needed) : { ok: true, needed, free: Number.NaN },
  };
}

export type SeparationProgress = ProgressState;

const WORKER_ERRORS: Record<SeparationErrorCode, string> = {
  'no-webgpu': 'Este dispositivo no puede separar la voz; hazlo desde el ordenador.',
  'model-download': 'No se pudo bajar el modelo de IA. Revisa la conexión y vuelve a intentarlo.',
  'model-load': 'No se pudo preparar el modelo de IA en este dispositivo; prueba desde otro ordenador.',
  gpu: 'La tarjeta gráfica no ha podido con la separación; prueba desde otro ordenador.',
  unknown: 'No se pudo separar la voz. Inténtalo otra vez.',
};

/** This device as far as memory goes: a phone (coarse pointer, small screen) and `navigator.deviceMemory`. */
function deviceShape(): { mobile: boolean; memoryGb: number | null } {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return { mobile: coarse && Math.min(screen.width, screen.height) < 820, memoryGb: typeof memory === 'number' ? memory : null };
}

/**
 * The file's bytes on this device: its own copy if current, else the group's cloud copy (≤ 50 MB). An original too
 * heavy to read whole here (a 4K file of 1–2 GB on a phone would close the tab without a word) is refused first.
 */
async function readSongFile(video: Video): Promise<ArrayBuffer> {
  const local = await loadLocalVideo(video.id);
  if (local && !isStaleCopy(video)) {
    const max = maxOriginalBytes(deviceShape());
    if (local.size > max) {
      throw new FriendlyError(
        `Este archivo pesa ${formatBytes(local.size)}: es demasiado para separarlo en este dispositivo (hasta ${formatBytes(max)}). Hazlo desde el ordenador.`,
      );
    }
    return local.arrayBuffer();
  }
  if (video.storage_path) {
    const url = await backend.signedUrl(video.storage_path);
    if (url) {
      const res = await fetch(url);
      if (res.ok) return res.arrayBuffer();
    }
  }
  throw new FriendlyError('El archivo de esta canción no está en este dispositivo ni en la nube.');
}

/**
 * The audio at the model's 44.1 kHz, as two own arrays (they are handed over to the worker). The file's bytes are
 * consumed by the decoder and the decoded buffer is dropped on return: only the two arrays stay.
 */
async function decodeSong(bytes: ArrayBuffer, maxSeconds: number): Promise<{ left: Float32Array; right: Float32Array }> {
  const Ctor =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const ctx = new Ctor(2, 1, DEMUCS.sampleRate);
  let audio: AudioBuffer;
  try {
    audio = await ctx.decodeAudioData(bytes);
  } catch {
    throw new FriendlyError('No se pudo leer el sonido de este archivo.');
  }
  if (audio.duration > maxSeconds) throw new FriendlyError(tooLongCopy(maxSeconds));
  const left = new Float32Array(audio.getChannelData(0));
  const right = audio.numberOfChannels > 1 ? new Float32Array(audio.getChannelData(1)) : new Float32Array(left);
  return { left, right };
}

const tooLongCopy = (maxSeconds: number) =>
  `La canción es demasiado larga para separarla en este dispositivo (máximo: ${formatMaxLength(maxSeconds)}).`;

// ── Retrying on the same row: the id of the row a try left without its tracks, per video and file. ──
const PENDING_KEY = 'oneshoot.stems.pending.v1';
const pendingKey = (video: Pick<Video, 'id'>, fileName: string, fileSize: number) => `${video.id}|${fileName}|${fileSize}`;

function readPending(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function writePending(key: string, id: string | null): void {
  try {
    const all = readPending();
    if (id) all[key] = id;
    else delete all[key];
    localStorage.setItem(PENDING_KEY, JSON.stringify(all));
  } catch {
    /* this visit only: a retry makes a new row */
  }
}

const covered = () => usePlayer.getState().covered;

/**
 * Global review [6] · Waits while the recorder covers the studio (it needs the whole phone for the camera and the
 * take); meanwhile the work counts as idle, so the recorder's own measurements can trust what they see.
 */
async function whileCovered(signal: AbortSignal, work: HeavyWork): Promise<void> {
  if (!covered() || signal.aborted) return;
  work.idle(true);
  await untilUncovered(signal);
  work.idle(false);
  if (signal.aborted) throw new DOMException('cancelled', 'AbortError');
}

/** Resolves once the recorder no longer covers the studio (or the signal aborts). */
function untilUncovered(signal: AbortSignal): Promise<void> {
  if (!covered() || signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      off();
      signal.removeEventListener('abort', done);
      resolve();
    };
    const off = usePlayer.subscribe((s) => {
      if (!s.covered) done();
    });
    signal.addEventListener('abort', done);
  });
}

function runWorker(
  request: RunRequest,
  onProgress: (p: SeparationProgress) => void,
  signal: AbortSignal,
  work: HeavyWork,
): Promise<Extract<WorkerMessage, { type: 'done' }>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./stemSeparator.worker.ts', import.meta.url), { type: 'module' });
    // Global review [6] · The recorder open: the worker holds before loading the model and before each segment
    // (idle once it says it has). Global review 2 [2] · Downloading the model only waits on the network: idle too, so
    // the copy for the group may go on meanwhile.
    let paused = false;
    let held = false;
    let downloading = false;
    const syncIdle = () => work.idle(downloading || (paused && held));
    const syncCover = () => {
      const now = covered();
      if (now === paused) return;
      paused = now;
      if (!now) held = false;
      worker.postMessage({ type: 'pause', paused: now } satisfies PauseRequest);
      syncIdle();
    };
    const offCover = usePlayer.subscribe((s, prev) => {
      if (s.covered !== prev.covered) syncCover();
    });
    const finish = () => {
      offCover();
      work.idle(false);
    };
    const stop = () => {
      finish();
      worker.terminate(); // frees the GPU and the worker's memory at once
      reject(new DOMException('cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', stop, { once: true });
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const msg = event.data;
      if (msg.type === 'held') {
        held = paused;
        syncIdle();
        return;
      }
      if (msg.type === 'progress') {
        downloading = msg.phase === 'model';
        syncIdle();
        if (msg.phase === 'model') onProgress({ phase: 'model', loaded: msg.loaded, total: msg.total });
        else if (msg.phase === 'compile') onProgress({ phase: 'compile' });
        else onProgress({ phase: 'separate', done: msg.done, total: msg.total, etaSeconds: msg.etaSeconds });
        return;
      }
      signal.removeEventListener('abort', stop);
      finish();
      worker.terminate();
      if (msg.type === 'done') resolve(msg);
      else {
        console.error('[separate]', msg.code, msg.message);
        const fail = () => reject(new FriendlyError(WORKER_ERRORS[msg.code] ?? WORKER_ERRORS.unknown));
        // A model that can't be read may be a broken copy on this device: forget it, the next try downloads it
        // again. A GPU that can't build the session keeps the copy (no 120–172 MB download for nothing).
        if (msg.code === 'model-load' && modelCacheLooksBroken(msg.message)) void clearModelCache().finally(fail);
        else fail();
      }
    };
    worker.onerror = (event) => {
      console.error('[separate] worker', event.message);
      signal.removeEventListener('abort', stop);
      finish();
      worker.terminate();
      reject(new FriendlyError(WORKER_ERRORS.unknown));
    };
    // The pause first: the worker reads it before it starts on the model.
    syncCover();
    worker.postMessage(request, [request.left.buffer, request.right.buffer]);
  });
}

type SeparationRequest = {
  video: Video;
  engine: EngineKind;
  memberId: string | null;
  onProgress: (p: SeparationProgress) => void;
  signal: AbortSignal;
};

/**
 * Marked as heavy work while it runs: the copy for the group pauses
 * (lib/heavyWork). Global review [6] · It first waits for a copy being made (one encoder at a time).
 */
export async function runSeparation(opts: SeparationRequest): Promise<VideoStems> {
  await untilFreeToStart(opts);
  // Marked right after the last check (no await between): the copy sees it before it could start anything.
  const work = beginHeavyWork('voice');
  try {
    return await separate(opts, work);
  } finally {
    work();
  }
}

/**
 * Global review 2 [4] · Before starting: while the copy for the group loads the device (one encoder at a time) and
 * while the recorder is open (the copy rests then, and reading and decoding the song would run under the take).
 */
async function untilFreeToStart({ signal, onProgress }: SeparationRequest): Promise<void> {
  let waited = false;
  for (;;) {
    if (signal.aborted) throw new DOMException('cancelled', 'AbortError');
    if (heavyWorkBusy('copy')) {
      onProgress({ phase: 'wait-copy' });
      await untilHeavyWork(() => heavyWorkBusy('copy'), signal);
    } else if (covered()) {
      await untilUncovered(signal);
    } else break;
    waited = true;
  }
  if (waited) onProgress({ phase: 'read' });
}

const STEMS_TOO_BIG =
  'Las pistas han salido demasiado grandes para la nube del grupo (16 MB cada una como mucho). Vuelve a intentarlo; si pasa otra vez, prueba con una canción más corta.';

type StemCodecChoice = NonNullable<Awaited<ReturnType<typeof pickCodec>>>;

/**
 * Global review BD [3] · Encodes a track, and again with less bitrate if the encoder (VBR) overshot the 16 MiB the
 * database takes: a little less quality rather than two tracks uploaded for nothing.
 */
async function encodeFitting(left: Float32Array, right: Float32Array, choice: StemCodecChoice, primingSamples?: number) {
  let current = choice;
  for (let attempt = 0; attempt < 3; attempt++) {
    const stem = await encodeStem(left, right, DEMUCS.sampleRate, current, primingSamples);
    if (stemFits(stem.blob.size)) return stem;
    const next = smallerStemBitrate(current.config.bitrate ?? 128_000, stem.blob.size);
    console.info('[separate] track too big, encoding it again', stem.blob.size, next);
    if (next == null) break;
    current = { ...current, config: { ...current.config, bitrate: next } };
  }
  throw new FriendlyError(STEMS_TOO_BIG);
}

async function separate(opts: SeparationRequest, work: HeavyWork): Promise<VideoStems> {
  const { video, engine, signal, onProgress } = opts;
  if (!video.file_name || video.file_size == null) throw new FriendlyError('Esta canción no tiene archivo.');
  const fileName = video.file_name;
  const fileSize = video.file_size;
  const check = () => {
    if (signal.aborted) throw new DOMException('cancelled', 'AbortError');
  };

  const maxSeconds = maxSeparateSeconds(deviceShape().memoryGb);
  // Known to be too long: not even read.
  if (songSeconds(video) > maxSeconds + 1) throw new FriendlyError(tooLongCopy(maxSeconds));

  onProgress({ phase: 'read' });
  // The song goes to the worker (transferred: the page no longer holds it).
  let durationSeconds = 0;
  let done: Extract<WorkerMessage, { type: 'done' }> | null = await (async () => {
    const bytes = await readSongFile(video);
    check();
    // Decoding the whole song (~160 MB of samples) runs on this thread: not under the recorder either.
    await whileCovered(signal, work);
    const { left, right } = await decodeSong(bytes, maxSeconds);
    check();
    durationSeconds = left.length / DEMUCS.sampleRate;
    return runWorker({ type: 'run', engine, left, right }, onProgress, signal, work);
  })();
  check();

  // Encoding runs on this thread: not while the recorder is open.
  await whileCovered(signal, work);
  onProgress({ phase: 'encode' });
  const choice = await pickCodec(durationSeconds, DEMUCS.sampleRate);
  if (!choice) throw new FriendlyError('Este navegador no puede guardar las pistas; prueba con Chrome en el ordenador.');
  // Each track's raw samples are let go as soon as it is encoded (a 10-minute song is ~200 MB per track).
  const instrumental = await encodeFitting(done.instrumental[0], done.instrumental[1], choice);
  done = { ...done, instrumental: [new Float32Array(0), new Float32Array(0)] };
  check();
  await whileCovered(signal, work);
  // The voice gets the instrumental's edit list (a quiet voice can't be measured on its own).
  const vocals = await encodeFitting(done.vocals[0], done.vocals[1], choice, instrumental.primingSamples);
  // Not useless: drops the last reference to the voice's raw samples before the network waits below.
  // eslint-disable-next-line no-useless-assignment
  done = null;
  check();
  const measured = [instrumental.delaySeconds, vocals.delaySeconds].find((d) => Number.isFinite(d));
  const delay = Math.max(-1, Math.min(1, measured ?? 0));

  // Global review 2 [2] · From here on it only waits on the network (space, upload, the row): no load on the device.
  work.idle(true);
  // Space: the real sizes against what the group has left now.
  const usage = await backend.storageUsage().catch(() => null);
  if (usage) {
    const verdict = spaceVerdict(usage.total, instrumental.blob.size + vocals.blob.size);
    if (!verdict.ok) {
      throw new FriendlyError('No queda espacio en la nube del grupo para las dos pistas. Borra algo y vuelve a intentarlo.');
    }
  }
  check();

  onProgress({ phase: 'upload' });
  const key = pendingKey(video, fileName, fileSize);
  const delaySeconds = Math.round(delay * 10000) / 10000;
  // A retry goes on the row its earlier try left without tracks: what that try uploaded is reused, not orphaned.
  const earlier = reusablePendingStems(
    await stemsBackend.listStems(video.id).catch(() => []),
    { fileName, fileSize, model: MODELS[engine].id, mime: instrumental.mime, delaySeconds },
    readPending()[key] ?? null,
  );
  const newRow = async () => {
    const created = await stemsBackend.insertStems({
      id: crypto.randomUUID(),
      video_id: video.id,
      member_id: opts.memberId,
      source_file_name: fileName,
      source_file_size: fileSize,
      model: MODELS[engine].id,
      duration_seconds: Math.round(durationSeconds * 1000) / 1000,
      delay_seconds: delaySeconds,
      mime_type: instrumental.mime,
    });
    writePending(key, created.id);
    return created;
  };
  let row = earlier ?? (await newRow());
  let reused = earlier != null;
  /**
   * Records the tracks on the row. Global review BD [3] · `stems_too_big` (a track over 16 MiB, e.g. left by an
   * earlier try): that row can never be completed, so it is archived and forgotten (a retry starts afresh).
   */
  const complete = async (paths: { vocals_path: string; instrumental_path: string }) => {
    try {
      const completed = await stemsBackend.completeStems(row.id, paths);
      writePending(key, null);
      return completed;
    } catch (err) {
      if (!/stems_too_big/.test(String((err as { message?: string })?.message ?? err))) throw err;
      console.error('[separate] tracks too big for the row', err);
      await stemsBackend.deleteStems(row.id).catch(() => undefined);
      writePending(key, null);
      throw new FriendlyError(STEMS_TOO_BIG);
    }
  };
  for (;;) {
    const dir = `${row.crew_id}/stems/${row.id}`;
    const paths = { vocals_path: `${dir}/vocals.${vocals.ext}`, instrumental_path: `${dir}/instrumental.${instrumental.ext}` };
    let refused: UploadFailure | null = null;
    for (const [path, blob] of [
      [paths.instrumental_path, instrumental.blob],
      [paths.vocals_path, vocals.blob],
    ] as const) {
      const result = await stemsBackend.uploadStemFile(path, blob);
      if (!result.ok && result.reason !== 'exists') {
        refused = result.reason;
        break;
      }
    }
    if (!refused) return complete(paths);
    // Safety net for a retry on an earlier row the cloud refuses (like sharing a take): its tracks may already be
    // up, and the database only completes it if both really are. If one is missing, that row can't be finished:
    // archive it, forget it and start a fresh one (once).
    if (refused !== 'denied' || !reused) throw new FriendlyError(stemUploadCopy(refused));
    reused = false;
    try {
      return await complete(paths);
    } catch (err) {
      if (err instanceof FriendlyError) throw err;
      if (!/stems_file_missing/.test(String((err as { message?: string })?.message ?? err))) {
        console.error('[separate] complete earlier row', err);
        throw new FriendlyError(stemUploadCopy('denied'));
      }
    }
    await stemsBackend.deleteStems(row.id).catch(() => undefined);
    writePending(key, null);
    check();
    row = await newRow();
  }
}

/** What the dancer reads when a track didn't go up. */
function stemUploadCopy(reason: UploadFailure): string {
  if (reason === 'network') return 'Sin conexión: las pistas no se han subido. Vuelve a intentarlo.';
  if (reason === 'unavailable') return 'La nube no responde ahora: las pistas no se han subido. Vuelve a intentarlo en un rato.';
  return 'La nube no ha aceptado las pistas: puede que no quede sitio en la nube del grupo. Borra algo y vuelve a intentarlo.';
}
