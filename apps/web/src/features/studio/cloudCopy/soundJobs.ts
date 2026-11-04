import type { EncodedAudioSample, JobOutcome } from '@/lib/mp4/audioEncode';
import { MAX_SHIFT_SECONDS, measureShift } from '../audioAlign';
import { muxMp4, type MuxAudioTrack, type MuxVideoTrack } from '../mp4Mux';

/**
 * 13 · REQ-26 · What the copy's sound worker does with the encoded sound, kept pure (no DOM, no Supabase) so the worker
 * bundle stays small: the first seconds as a short MP4 (to measure the start), the shift measure itself, and the
 * whole copy (the picture's samples handed over, the sound's kept for another attempt).
 */

/** The sound track without its samples (those stay where they were encoded). */
export type AudioTrackMeta = Omit<MuxAudioTrack, 'samples'>;

export type SoundJob =
  | { kind: 'head'; track: AudioTrackMeta; endUs: number }
  | {
      kind: 'shift';
      original: Float32Array[];
      copy: Float32Array[];
      sampleRate: number;
      windowSeconds: number;
    }
  | { kind: 'file'; track: AudioTrackMeta; video: MuxVideoTrack };

/** The encoded samples as the MP4 writer takes them (every sound sample is a key). */
export function muxAudioTrack(track: AudioTrackMeta, samples: readonly EncodedAudioSample[]): MuxAudioTrack {
  return {
    ...track,
    samples: samples.map((s) => ({ data: s.data, time: s.time, duration: s.duration, key: true })),
  };
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/** Runs a job in the worker on the samples it encoded. */
export function runSoundJob(job: SoundJob, samples: readonly EncodedAudioSample[]): JobOutcome {
  if (job.kind === 'shift') {
    return {
      value: measureShift(job.original, job.copy, job.sampleRate, { windowSeconds: job.windowSeconds }),
    };
  }
  if (job.kind === 'head') {
    const head = samples.filter((s) => s.time < job.endUs);
    if (!head.length) return { value: null };
    const bytes = concat(muxMp4({ audio: muxAudioTrack(job.track, head) }));
    return { value: bytes, transfer: [bytes.buffer] };
  }
  const own = new Set(samples.map((s) => s.data));
  // The sound's samples go back as copies (they stay here in case the picture is made again); the picture's go back
  // as they came, and the index is new: all of it is handed over, not copied again.
  const parts = muxMp4({ video: job.video, audio: muxAudioTrack(job.track, samples) }).map((p) =>
    own.has(p) ? p.slice() : p,
  );
  return { value: parts, transfer: parts.map((p) => p.buffer) };
}

/** The heads of both sounds a shift measure reads, copied so they can be handed to the worker. */
export function shiftInputs(
  original: readonly Float32Array[],
  copy: readonly Float32Array[],
  sampleRate: number,
  windowSeconds: number,
): { original: Float32Array[]; copy: Float32Array[] } {
  // measureShift reads the original's first `window` samples and the copy's first `window` + the furthest shift.
  const window = Math.min(Math.floor(windowSeconds * sampleRate), original[0]?.length ?? 0);
  const reach = window + Math.floor(MAX_SHIFT_SECONDS * sampleRate);
  return { original: original.map((ch) => ch.slice(0, window)), copy: copy.map((ch) => ch.slice(0, reach)) };
}
