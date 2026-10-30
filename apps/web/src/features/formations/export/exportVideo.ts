import { pickAudioConfig, pickVideoConfig, SAMPLE_RATE, offlineAudio, type PickedAudio } from '@/features/studio/cloudCopySupport';
import { audioSpecificConfig, muxMp4, vpcConfig, type MuxAudioTrack, type MuxSample } from '@/features/studio/mp4Mux';
import { FriendlyError } from '@/lib/supabase';
import { activeIndex, positionsAt, propsAt } from '../formationRules';
import { exportFileName, exportPercent, formatClock, frameCount, frameStamp, frameTime, isKeyFrame, soundWindow, VIDEO_FPS, videoSize } from './exportRules';
import type { PlanSnapshot } from './exportStill';
import { cssColor, cssFont, fontsReady, makeCanvas, paintStage, wrapText } from './stagePainter';

/**
 * REQ-12 · «Exportar vídeo»: the stage's animation, frame by frame on a canvas (never in real time, so a slow phone
 * makes the same video, only later), encoded with WebCodecs and put in an MP4 by the studio's own `mp4Mux.ts`. With
 * the song's file the sound goes in too. Loaded only when an export starts.
 */

const VIDEO_BPS = 2_500_000;
const AUDIO_BPS = 128_000;

export interface VideoJob {
  snap: PlanSnapshot;
  start: number;
  end: number;
  /** The song's file (null: a silent video, e.g. with YouTube). */
  sound: Blob | null;
  /** File time = song time + offset (a linked file). */
  fileOffset: number;
  signal: AbortSignal;
  onProgress: (percent: number) => void;
}

export interface VideoResult {
  file: File;
  /** False when a sound was wanted but couldn't be read or encoded here: the video went out silent. */
  withSound: boolean;
}

const abortError = () => new DOMException('Exportación cancelada', 'AbortError');
export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MEMORY = 'No hay memoria suficiente para este vídeo. Prueba con un bucle A–B más corto o desde un ordenador.';

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw abortError();
}

function toBytes(source: AllowSharedBufferSource | undefined): Uint8Array | undefined {
  if (!source) return undefined;
  if (source instanceof ArrayBuffer) return new Uint8Array(source.slice(0));
  const view = source as ArrayBufferView;
  return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer);
}

function isMemoryError(e: unknown): boolean {
  if (e instanceof RangeError) return true;
  if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NotReadableError')) return true;
  return e instanceof Error && /memory|allocation|out of/i.test(e.message);
}

/** Whether this browser can export the video (WebCodecs with an H.264 or VP9 encoder for this size). */
export async function canExportVideo(snap: Pick<PlanSnapshot, 'stage'>): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return false;
  const { width, height } = videoSize(snap.stage);
  return (await pickVideoConfig({ width, height, videoBps: VIDEO_BPS, fps: VIDEO_FPS })) != null;
}

/** The video of the plan between `start` and `end`. Throws AbortError when cancelled, FriendlyError on trouble. */
export async function formationsVideo(job: VideoJob): Promise<VideoResult> {
  const { snap, start, end, signal } = job;
  const size = videoSize(snap.stage);
  const picked = await pickVideoConfig({ width: size.width, height: size.height, videoBps: VIDEO_BPS, fps: VIDEO_FPS });
  if (!picked) throw new FriendlyError('Este navegador no puede crear vídeos. Prueba con Chrome o Edge en un ordenador.');
  await fontsReady();
  throwIfAborted(signal);

  // Sound first (it may fail, and then the video goes out silent): about a tenth of the work.
  let audio: MuxAudioTrack | null = null;
  let withSound = job.sound == null;
  if (job.sound) {
    try {
      audio = await encodeSound(job.sound, start, end, job.fileOffset, signal);
      withSound = audio != null;
    } catch (e) {
      if (isAbort(e)) throw e;
      if (isMemoryError(e)) throw new FriendlyError(MEMORY);
      console.error('[formations] video sound', e);
      audio = null;
    }
  }
  job.onProgress(exportPercent(1, 10));

  const total = frameCount(end - start);
  const samples: MuxSample[] = [];
  let description: Uint8Array | undefined;
  let failure: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push({ data, time: chunk.timestamp, duration: chunk.duration ?? 0, key: chunk.type === 'key' });
      if (!description) description = toBytes(meta?.decoderConfig?.description);
    },
    error: (e) => {
      failure = e;
    },
  });
  const { canvas, ctx } = makeCanvas(size.width, size.height);
  try {
    encoder.configure(picked.config);
    for (let i = 0; i < total; i++) {
      throwIfAborted(signal);
      if (failure) throw failure;
      drawFrame(ctx, snap, frameTime(i, start), size);
      const { timestamp, duration } = frameStamp(i);
      const frame = new VideoFrame(canvas, { timestamp, duration });
      encoder.encode(frame, { keyFrame: isKeyFrame(i) });
      frame.close();
      while (encoder.encodeQueueSize > 4 && !failure) await sleep(2);
      if (i % 15 === 0) {
        job.onProgress(Math.max(exportPercent(1, 10), exportPercent(total / 9 + i, total + total / 9)));
        // Let the page breathe (progress, «Cancelar») between batches.
        await sleep(0);
      }
    }
    await encoder.flush();
    if (failure) throw failure;
  } catch (e) {
    if (isAbort(e) || e instanceof FriendlyError) throw e;
    if (isMemoryError(e)) throw new FriendlyError(MEMORY);
    console.error('[formations] video', e);
    throw new FriendlyError('No se pudo crear el vídeo en este navegador.');
  } finally {
    if (encoder.state !== 'closed') encoder.close();
    canvas.width = 0;
  }
  throwIfAborted(signal);

  if (picked.codec === 'vp09') description = vpcConfig(size.width * size.height > 1280 * 720 ? 40 : 31);
  if (!description || samples.length === 0) throw new FriendlyError('No se pudo crear el vídeo en este navegador.');
  let parts: Uint8Array[];
  try {
    parts = muxMp4({
      video: { codec: picked.codec, width: size.width, height: size.height, description, samples },
      audio: audio ?? undefined,
    });
  } catch (e) {
    if (isMemoryError(e)) throw new FriendlyError(MEMORY);
    throw e;
  }
  const file = new File(parts as BlobPart[], exportFileName(snap.planName, 'mp4'), { type: 'video/mp4' });
  job.onProgress(100);
  return { file, withSound };
}

/** One frame: the moment's clock, formation and note above the stage. */
function drawFrame(ctx: CanvasRenderingContext2D, snap: PlanSnapshot, t: number, size: { width: number; height: number }) {
  const { width: W, height: H } = size;
  const header = Math.round(H * 0.09);
  const sans = cssFont('--font-sans');
  ctx.fillStyle = cssColor('--color-sumi-900');
  ctx.fillRect(0, 0, W, H);
  const fs = Math.round(header * 0.42);
  const m = Math.round(W * 0.025);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = cssColor('--color-kin-300');
  ctx.font = `700 ${fs}px ${sans}`;
  ctx.fillText(formatClock(t), m, header * 0.55);
  const clockW = ctx.measureText('00:00').width + m;
  const i = activeIndex(snap.list, t);
  const note = i >= 0 ? snap.list[i]!.note : null;
  ctx.font = `600 ${Math.round(fs * 0.7)}px ${sans}`;
  ctx.fillStyle = cssColor('--color-washi-muted');
  const label = i >= 0 ? `Formación ${i + 1} de ${snap.list.length}` : snap.planName;
  const text = note ? `${label} · ${note}` : label;
  const line = wrapText(ctx, text, W - clockW - m * 2, 1)[0] ?? '';
  ctx.fillText(line, m + clockW, header * 0.55);
  ctx.textBaseline = 'alphabetic';
  paintStage(
    ctx,
    {
      stage: snap.stage,
      memberIds: snap.memberIds,
      people: snap.people,
      positions: positionsAt(snap.list, t, snap.memberIds, snap.stage),
      props: propsAt(snap.list, t),
      mirrored: snap.mirrored,
    },
    { x: 0, y: header, w: W, h: H - header },
  );
}

/** The song's sound between `start` and `end`, encoded (AAC, or Opus). Null when this browser can't. */
async function encodeSound(blob: Blob, start: number, end: number, fileOffset: number, signal: AbortSignal): Promise<MuxAudioTrack | null> {
  const Ctor = offlineAudio();
  if (!Ctor || typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return null;
  const data = await blob.arrayBuffer();
  throwIfAborted(signal);
  const ctx = new Ctor(2, 1, SAMPLE_RATE);
  const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
    const p = ctx.decodeAudioData(data, resolve, reject);
    (p as Promise<AudioBuffer> | undefined)?.then?.(resolve, reject);
  });
  throwIfAborted(signal);
  const channels = Math.min(2, buffer.numberOfChannels);
  const picked: PickedAudio | null = await pickAudioConfig(channels, AUDIO_BPS);
  if (!picked) return null;
  const sources = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  const rate = buffer.sampleRate;
  const win = soundWindow(start, end, fileOffset, rate, sources[0]!.length);

  const samples: MuxSample[] = [];
  let description: Uint8Array | undefined;
  let failure: unknown = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes);
      samples.push({ data: bytes, time: chunk.timestamp, duration: chunk.duration ?? 0, key: true });
      if (!description) description = toBytes(meta?.decoderConfig?.description);
    },
    error: (e) => {
      failure = e;
    },
  });
  try {
    encoder.configure({ ...picked.config, numberOfChannels: channels, bitrate: AUDIO_BPS });
    const block = 4800;
    const total = sources[0]!.length;
    for (let pos = 0; pos < win.count; pos += block) {
      throwIfAborted(signal);
      if (failure) throw failure;
      const n = Math.min(block, win.count - pos);
      const planar = new Float32Array(n * channels);
      for (let c = 0; c < channels; c++) {
        const src = sources[c]!;
        for (let k = 0; k < n; k++) {
          const j = win.from + pos + k - win.pad;
          planar[c * n + k] = pos + k >= win.pad && j >= 0 && j < total ? src[j]! : 0;
        }
      }
      const frame = new AudioData({
        format: 'f32-planar',
        sampleRate: rate,
        numberOfFrames: n,
        numberOfChannels: channels,
        timestamp: Math.round((pos / rate) * 1e6),
        data: planar,
      });
      encoder.encode(frame);
      frame.close();
      while (encoder.encodeQueueSize > 8 && !failure) await sleep(2);
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  if (samples.length === 0) return null;
  return {
    codec: picked.codec,
    sampleRate: rate,
    channels,
    description: picked.codec === 'mp4a' ? (description ?? audioSpecificConfig(rate, channels)) : undefined,
    preSkip: 0,
    bitrate: AUDIO_BPS,
    samples,
  };
}
