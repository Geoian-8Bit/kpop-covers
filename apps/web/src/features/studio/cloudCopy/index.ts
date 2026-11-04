import { FriendlyError } from '@/lib/supabase';
import {
  acceptableBytes,
  COPY,
  copyEncoding,
  retryVideoBps,
  sameLength,
  type CopyEncoding,
  type CopyHold,
} from '../cloudCopyRules';
import { hasApis, pickAudioConfig, pickVideoConfig, UNSUPPORTED_COPY } from '../cloudCopySupport';
import {
  decodeSound,
  isAbort,
  probeVideo,
  sleep,
  throwIfAborted,
  type CloudCopyOptions,
  type CloudCopyResult,
  type CopyProgress,
} from './media';
import { encodePicture, type PictureResult } from './picture';
import { encodeAlignedSound, openSoundCoder } from './sound';

export { isAbort, probeVideo } from './media';
export type { CloudCopyOptions, CloudCopyResult, CopyPaceNow, CopyPhase, CopyProgress } from './media';

/**
 * 13 · Makes, on this device, the reduced copy of a video for the group's cloud (under ~48 MB): same video, same
 * timeline, smaller picture and bitrate. The original stays here and keeps being the one this device plays.
 *
 * How (WebCodecs, no extra libraries):
 *  - Sound: the original's whole sound is decoded (`decodeAudioData`) and encoded again (AAC, or Opus) from its
 *    very first sample. Then the encoded sound is decoded back and compared with the original: if the encoder
 *    delayed it (AAC adds some silence at the start), the sound is encoded again moved by exactly that much, and
 *    checked again. So the copy's sound starts with the original's, to the sample.
 *  - Picture: the original plays muted in a hidden <video> (1× to 2×, slower if frames get lost, at most 1× while
 *    the studio plays) and each frame is drawn smaller and encoded (H.264, or VP9) with the frame's own time in the
 *    original (`mediaTime`). Pausing (hidden app, busy encoder, the recorder open, the voice being separated) can't
 *    shift anything: times come from the original, not from the clock.
 *  - Our own MP4 writer puts both together with those exact times.
 *  - Check: the finished file must open in the browser and last as long as the original.
 * Too big after an attempt (or heading there): again with less bitrate, up to 3 times.
 */

// ───────────── The whole copy ─────────────

/** Waits while the rest of the device asks the copy to (the recorder open, the voice being separated). */
async function untilFree(opts: CloudCopyOptions): Promise<void> {
  let shown: CopyHold | null = null;
  for (let hold = opts.pace?.().hold ?? null; hold; hold = opts.pace?.().hold ?? null) {
    throwIfAborted(opts.signal);
    if (hold !== shown) opts.onHold?.((shown = hold));
    await sleep(250);
  }
  throwIfAborted(opts.signal);
  if (shown) opts.onHold?.(null);
}

/**
 * The copy for the group: resolves with an MP4 under the limit, rejects with an AbortError when cancelled or a
 * FriendlyError with Spanish copy.
 */
export async function makeCloudCopy(source: Blob, opts: CloudCopyOptions): Promise<CloudCopyResult> {
  const { signal } = opts;
  throwIfAborted(signal);
  if (!hasApis()) throw new FriendlyError(UNSUPPORTED_COPY);
  const report = (p: CopyProgress) => opts.onProgress?.(p);
  report({ phase: 'sound', progress: 0, attempt: 1 });

  const probe = await probeVideo(source, signal);
  if (!probe.width || !probe.height) throw new FriendlyError('El archivo no tiene imagen.');
  const planned = copyEncoding({
    seconds: probe.duration,
    targetBytes: opts.targetBytes,
    srcWidth: probe.width,
    srcHeight: probe.height,
    sourceBps: (source.size * 8) / probe.duration,
  });
  if (!planned)
    throw new FriendlyError('El vídeo dura demasiado para que su copia quepa en un solo archivo de la nube.');
  let enc: CopyEncoding = planned;

  const pickedAudio = await pickAudioConfig(2, enc.audioBps);
  if (!pickedAudio) throw new FriendlyError(UNSUPPORTED_COPY);

  // The sound is encoded on this thread too: not while the recorder or the separation needs the device.
  await untilFree(opts);
  // REQ-26 · The sound is encoded and the file written in a worker where this browser can (else on this page). It
  // keeps the encoded sound for the picture's attempts and goes when the copy ends, however it ends.
  const coder = await openSoundCoder();
  try {
    // Sound: 0–8 % of the bar. The decoded original (~90 MB of samples for 4 min) only lives inside this block: it
    // is let go before the picture pass, which takes most of the time and memory.
    const { sound, corrected } = await (async () => {
      const original = await decodeSound(source);
      throwIfAborted(signal);
      report({ phase: 'sound', progress: 0.02, attempt: 1 });
      // Global review 2 [4] · Each step of the sound is seconds of work on a phone: the recorder opened (or the
      // separation started) meanwhile is waited for between them, not only before the first.
      await untilFree(opts);
      const channels = Math.min(2, original.channels.length);
      const audioPicked = { ...pickedAudio, config: { ...pickedAudio.config, numberOfChannels: channels } };
      return encodeAlignedSound(
        coder,
        original,
        audioPicked,
        enc.audioBps,
        signal,
        (f) => report({ phase: 'sound', progress: 0.02 + 0.06 * f, attempt: 1 }),
        () => untilFree(opts),
      );
    })();

    // Picture: 8–96 %, up to three attempts.
    let picture: Extract<PictureResult, { ok: true }> | null = null;
    let blob: Blob | null = null;
    for (let attempt = 1; attempt <= COPY.maxAttempts; attempt++) {
      const picked = await pickVideoConfig(enc);
      if (!picked) throw new FriendlyError(UNSUPPORTED_COPY);
      const current = enc;
      const result = await encodePicture(
        source,
        current,
        picked,
        probe.duration,
        { audioBytes: sound.bytes, limitBytes: opts.limitBytes },
        signal,
        (f) =>
          report({
            phase: 'picture',
            progress: 0.08 + 0.88 * f,
            attempt,
            width: current.width,
            height: current.height,
          }),
        { pace: opts.pace, onHold: opts.onHold },
      );
      let projected: number;
      if (result.ok) {
        picture = result;
        blob = await coder.file(result.track, sound, signal);
        if (blob.size <= acceptableBytes(opts.limitBytes, opts.targetBytes)) break;
        projected = blob.size;
      } else {
        projected = result.projectedBytes;
      }
      picture = null;
      blob = null;
      const next = retryVideoBps({
        videoBps: current.videoBps,
        projectedBytes: projected,
        audioBytes: sound.bytes,
        targetBytes: opts.targetBytes,
      });
      const retry =
        next == null
          ? null
          : copyEncoding({
              seconds: probe.duration,
              targetBytes: opts.targetBytes,
              srcWidth: probe.width,
              srcHeight: probe.height,
              videoBpsCap: next,
            });
      if (!retry || attempt === COPY.maxAttempts) {
        throw new FriendlyError('No se ha conseguido una copia que quepa en la nube (50 MB por archivo).');
      }
      // The sound stays as it is: only the picture is made again.
      enc = { ...retry, audioBps: current.audioBps };
    }
    if (!picture || !blob)
      throw new FriendlyError('No se ha conseguido una copia que quepa en la nube (50 MB por archivo).');

    // Check: the browser opens it and it lasts as long as the original.
    report({ phase: 'checking', progress: 0.97, attempt: 1, width: enc.width, height: enc.height });
    const check = await probeVideo(blob, signal).catch((e) => {
      if (isAbort(e)) throw e;
      throw new FriendlyError(
        'La copia ha salido mal (el navegador no la abre). Prueba desde un ordenador con Chrome o Edge.',
      );
    });
    if (!sameLength(probe.duration, check.duration, enc.fps)) {
      console.error('[cloudCopy] length', probe.duration, check.duration);
      throw new FriendlyError(
        'La copia no dura lo mismo que el original, así que no se ha subido. Inténtalo otra vez.',
      );
    }
    report({ phase: 'checking', progress: 1, attempt: 1, width: enc.width, height: enc.height });
    return {
      blob,
      width: enc.width,
      height: enc.height,
      durationSeconds: check.duration,
      correctedShiftSeconds: corrected,
    };
  } finally {
    coder.close();
  }
}
