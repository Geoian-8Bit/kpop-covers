import { AudioPassEncoder, YIELD_EVERY_BLOCKS, yieldToPage, type AudioPass } from '@/lib/mp4/audioEncode';
import { AudioWorkerUnavailable, openAudioWorker, type AudioWorkerClient } from '@/lib/mp4/audioWorkerClient';
import { FriendlyError } from '@/lib/supabase';
import { measureShift, type ShiftMeasure } from '../audioAlign';
import { SHIFT_ACCEPT_SECONDS, SHIFT_TOLERANCE_SECONDS, shiftSamples } from '../cloudCopyRules';
import type { PickedAudio } from '../cloudCopySupport';
import { muxMp4, type MuxAudioTrack, type MuxVideoTrack } from '../mp4Mux';
import { abortError, decodeSound, isAbort, sleep, throwIfAborted, type Sound } from './media';
import { muxAudioTrack, shiftInputs, type AudioTrackMeta, type SoundJob } from './soundJobs';

/**
 * 13 · REQ-27 · The copy's sound: encoded from the original's first sample, its start measured and corrected.
 *
 * REQ-26 · Encoding, measuring and writing the MP4 run in a worker (`sound.worker.ts`): the page keeps the decoded
 * sound, hands it over a stretch at a time and decodes back (OfflineAudioContext only exists here). Where workers
 * have no AudioEncoder (some Safari) the same blocks are encoded here, giving the thread back every few of them.
 */

/** Seconds of sound compared to find the start shift. */
const CHECK_SECONDS = 45;

// ───────────── Sound ─────────────

export interface EncodedSound {
  /** On the worker its samples stay there (`samples` is empty here). */
  track: MuxAudioTrack;
  bytes: number;
  /**
   * Only for a sound encoded in the worker: encodes it again on this page (once; the original is still here), for when
   * the worker is lost before it has written what is asked of it.
   */
  onPage?: () => Promise<EncodedSound>;
}

/** Where the copy's sound is encoded and written: the worker, or this page. */
export interface SoundCoder {
  /**
   * Encodes the sound from its first sample. `shift` > 0 drops that many samples at the start, < 0 adds that much
   * silence (to undo a delay the encoder adds).
   */
  encode(
    sound: Sound,
    picked: PickedAudio,
    bitrate: number,
    shift: number,
    signal?: AbortSignal,
  ): Promise<EncodedSound>;
  /** The encoded sound's first `endUs` as a short MP4 (null: nothing there). */
  head(encoded: EncodedSound, endUs: number, signal?: AbortSignal): Promise<Blob | null>;
  measure(
    original: Sound,
    back: Sound,
    windowSeconds: number,
    signal?: AbortSignal,
  ): Promise<ShiftMeasure | null>;
  /** The whole copy: the picture with this sound. */
  file(video: MuxVideoTrack, encoded: EncodedSound, signal?: AbortSignal): Promise<Blob>;
  close(): void;
}

function passFor(sound: Sound, picked: PickedAudio, bitrate: number, shift: number): AudioPass {
  const total = sound.channels[0]!.length;
  const skip = Math.max(0, shift);
  const pad = Math.max(0, -shift);
  return {
    config: { ...picked.config, bitrate },
    rate: sound.sampleRate,
    length: total - skip + pad,
    total,
    skip,
    pad,
  };
}

/** Opus: the decoder must not drop anything we didn't ask for; our own shift takes care of the delay. */
function trackFor(
  sound: Sound,
  picked: PickedAudio,
  bitrate: number,
  description: Uint8Array | undefined,
): AudioTrackMeta {
  return {
    codec: picked.codec,
    sampleRate: sound.sampleRate,
    channels: picked.config.numberOfChannels,
    description: picked.codec === 'mp4a' ? description : undefined,
    preSkip: 0,
    bitrate,
  };
}

/** The same outcome on both paths: a cancel or a friendly error passes, anything else is the encoder failing. */
function soundFailure(error: unknown): unknown {
  if (isAbort(error) || error instanceof FriendlyError) return error;
  console.error('[cloudCopy] sound', error);
  return new FriendlyError('No se pudo preparar el sonido de la copia.');
}

const blobOf = (parts: Uint8Array[], type: string) => new Blob(parts as BlobPart[], { type });

/** On this page: the path for browsers whose workers have no AudioEncoder. */
function pageCoder(): SoundCoder {
  return {
    async encode(sound, picked, bitrate, shift, signal) {
      const pass = passFor(sound, picked, bitrate, shift);
      const encoder = (() => {
        try {
          return new AudioPassEncoder(pass);
        } catch (error) {
          throw soundFailure(error);
        }
      })();
      try {
        const slice = { start: 0, channels: sound.channels };
        for (let blocks = 1; !encoder.done; blocks++) {
          throwIfAborted(signal);
          if (encoder.failure) throw encoder.failure;
          encoder.encodeBlock(slice);
          while (encoder.queueSize > 8 && !encoder.failure) await sleep(4);
          // REQ-26 · The thread is given back every few blocks even when the encoder keeps up.
          if (blocks % YIELD_EVERY_BLOCKS === 0) await yieldToPage();
        }
        await encoder.flush();
        if (encoder.failure) throw encoder.failure;
      } catch (error) {
        throw soundFailure(error);
      } finally {
        encoder.close();
      }
      return {
        track: muxAudioTrack(trackFor(sound, picked, bitrate, encoder.description), encoder.samples),
        bytes: encoder.bytes,
      };
    },
    async head(encoded, endUs) {
      const head = encoded.track.samples.filter((s) => s.time < endUs);
      if (!head.length) return null;
      return blobOf(muxMp4({ audio: { ...encoded.track, samples: head } }), 'audio/mp4');
    },
    async measure(original, back, windowSeconds) {
      return measureShift(original.channels, back.channels, original.sampleRate, { windowSeconds });
    },
    async file(video, encoded) {
      return blobOf(muxMp4({ video, audio: encoded.track }), 'video/mp4');
    },
    close: () => undefined,
  };
}

/** The track as the worker needs it: everything but the samples (they live there). */
function metaOf({ track }: EncodedSound): AudioTrackMeta {
  const { codec, sampleRate, channels, description, preSkip, primingSamples, bitrate } = track;
  return { codec, sampleRate, channels, description, preSkip, primingSamples, bitrate };
}

/** A sound encoded on the page keeps its samples there; one encoded in the worker has none here. */
const livesOnPage = (encoded: EncodedSound) => encoded.track.samples.length > 0;

/**
 * In the worker: the samples live there; the page only keeps the track's description and size. REQ-26 · If the
 * worker can't take the configuration, dies or goes silent, the page does the work as it always did: the encoding
 * (the page still has the decoded sound), the start measure and, for a sound already encoded in the lost worker, its
 * short head and its file: the original is still here, so it is encoded again on the page and written from there.
 */
export function workerCoder(worker: AudioWorkerClient<SoundJob>): SoundCoder {
  const page = pageCoder();
  /** The sound as the page encodes it, under the track (edit list, description) the worker's one had. */
  const recoded = async (encoded: EncodedSound): Promise<EncodedSound> => {
    if (!encoded.onPage) throw new AudioWorkerUnavailable('nothing to encode again');
    const local = await encoded.onPage();
    return { ...encoded, track: { ...encoded.track, samples: local.track.samples } };
  };
  return {
    async encode(sound, picked, bitrate, shift, signal) {
      if (worker.broken) return page.encode(sound, picked, bitrate, shift, signal);
      try {
        const done = await worker.encode(passFor(sound, picked, bitrate, shift), sound.channels, signal);
        let again: Promise<EncodedSound> | undefined;
        return {
          track: { ...trackFor(sound, picked, bitrate, done.description ?? undefined), samples: [] },
          bytes: done.bytes,
          onPage: () => (again ??= page.encode(sound, picked, bitrate, shift)),
        };
      } catch (error) {
        if (error instanceof AudioWorkerUnavailable) {
          worker.close();
          return page.encode(sound, picked, bitrate, shift, signal);
        }
        throw soundFailure(error);
      }
    },
    async head(encoded, endUs, signal) {
      if (livesOnPage(encoded)) return page.head(encoded, endUs);
      try {
        const bytes = await worker.run<Uint8Array | null>(
          { kind: 'head', track: metaOf(encoded), endUs },
          [],
          signal,
        );
        return bytes ? blobOf([bytes], 'audio/mp4') : null;
      } catch (error) {
        if (!(error instanceof AudioWorkerUnavailable)) throw error;
        return page.head(await recoded(encoded), endUs);
      }
    },
    async measure(original, back, windowSeconds, signal) {
      const onPage = () => page.measure(original, back, windowSeconds);
      if (worker.broken) return onPage();
      const input = shiftInputs(original.channels, back.channels, original.sampleRate, windowSeconds);
      // The buffers are copied for the worker (inside shiftInputs) and handed over: the page keeps its own.
      try {
        return await worker.run<ShiftMeasure | null>(
          { kind: 'shift', ...input, sampleRate: original.sampleRate, windowSeconds },
          [...input.original, ...input.copy].map((c) => c.buffer),
          signal,
        );
      } catch (error) {
        if (isAbort(error)) throw error;
        return onPage();
      }
    },
    async file(video, encoded, signal) {
      if (livesOnPage(encoded)) return page.file(video, encoded);
      try {
        // A worker already lost before the hand-over: the picture is still whole here, so the page writes the file.
        if (worker.broken) return await page.file(video, await recoded(encoded));
        // The picture's samples are handed over (not copied, so the peak memory is what it always was): if the worker
        // is lost with them there is nothing to write from, and it ends as any other failure to write the copy.
        const parts = await worker.run<Uint8Array[]>(
          { kind: 'file', track: metaOf(encoded), video },
          video.samples.map((s) => s.data.buffer),
          signal,
        );
        return blobOf(parts, 'video/mp4');
      } catch (error) {
        throw soundFailure(error);
      }
    },
    close: worker.close,
  };
}

/** The worker when this browser can encode there, else this page. */
export async function openSoundCoder(): Promise<SoundCoder> {
  const worker = await openAudioWorker<SoundJob>(
    () => new Worker(new URL('./sound.worker.ts', import.meta.url), { type: 'module' }),
    abortError,
  );
  return worker ? workerCoder(worker) : pageCoder();
}

/** How late the encoded sound starts against the original (decoded back from a short MP4 of its start). */
async function soundShift(
  coder: SoundCoder,
  original: Sound,
  encoded: EncodedSound,
  signal?: AbortSignal,
): Promise<ShiftMeasure | null> {
  const file = await coder.head(encoded, CHECK_SECONDS * 1e6, signal);
  if (!file) return null;
  const back = await decodeSound(file);
  return coder.measure(original, back, CHECK_SECONDS - 5, signal);
}

/** Encode, measure the start, correct it if needed and check again. */
export async function encodeAlignedSound(
  coder: SoundCoder,
  original: Sound,
  picked: PickedAudio,
  bitrate: number,
  signal: AbortSignal | undefined,
  onStep: (fraction: number) => void,
  /** Global review 2 [4] · Waits between the steps while the device is asked for (the recorder opened meanwhile). */
  between: () => Promise<void> = async () => undefined,
): Promise<{ sound: EncodedSound; corrected: number }> {
  let shift = 0;
  let sound = await coder.encode(original, picked, bitrate, shift, signal);
  onStep(0.4);
  await between();
  let first = await soundShift(coder, original, sound, signal).catch(() => null);
  // AAC starts late by its priming. The standard fix is an edit list that tells every player to drop exactly that
  // (so the copy plays in step on any browser, not only on one that decodes like this one). Kept only if this
  // browser honours it too; otherwise the sound itself is moved, as before.
  if (
    picked.codec === 'mp4a' &&
    first &&
    first.confidence >= 0.5 &&
    first.seconds > SHIFT_TOLERANCE_SECONDS &&
    first.seconds < 0.15
  ) {
    const priming = shiftSamples(first.seconds, original.sampleRate);
    const edited: EncodedSound = { ...sound, track: { ...sound.track, primingSamples: priming } };
    await between();
    const check = await soundShift(coder, original, edited, signal).catch(() => null);
    if (check && check.confidence >= 0.5 && Math.abs(check.seconds) <= SHIFT_ACCEPT_SECONDS) {
      onStep(1);
      return { sound: edited, corrected: 0 };
    }
    console.info('[cloudCopy] this browser ignores the AAC edit list; moving the sound instead');
  }
  for (let round = 0; round < 2; round++) {
    throwIfAborted(signal);
    if (round > 0) await between();
    const measured = round === 0 ? first : await soundShift(coder, original, sound, signal).catch(() => null);
    first = null;
    onStep(0.6 + round * 0.2);
    // Nothing to compare (silence) or not alike enough to trust: leave it as it is.
    if (!measured || measured.confidence < 0.5) break;
    if (Math.abs(measured.seconds) <= (round === 0 ? SHIFT_TOLERANCE_SECONDS : SHIFT_ACCEPT_SECONDS)) break;
    if (round === 1) {
      throw new FriendlyError(
        'No se ha podido ajustar el inicio del sonido de la copia. Prueba desde un ordenador con Chrome o Edge.',
      );
    }
    shift += shiftSamples(measured.seconds, original.sampleRate);
    await between();
    sound = await coder.encode(original, picked, bitrate, shift, signal);
  }
  onStep(1);
  return { sound, corrected: shift / original.sampleRate };
}
