import type { EncodedAudioSample, JobOutcome } from '@/lib/mp4/audioEncode';
import { buildMp4, type Mp4Codec } from './mp4';
import { estimateLag } from './separateRules';

/**
 * 18 · REQ-26 · From the encoder's samples to a track's `.m4a`, the same in the encoding worker and on the page
 * (where workers have no AudioEncoder): pure, so both paths write the very same bytes.
 */

/** Writes the whole track, or only its first `headCount` frames (to measure the encoder's delay). */
export interface StemMuxJob {
  codec: Mp4Codec;
  sampleRate: number;
  channels: number;
  primingSamples: number;
  headCount: number | null;
}

/** Each frame's length in samples: from its duration, else the codec's usual frame (AAC 1024, Opus 960). */
export function stemFrameSamples(durations: readonly number[], rate: number, codec: Mp4Codec): number[] {
  const fallback = codec === 'aac' ? 1024 : 960;
  return durations.map((d) => {
    const samples = d ? Math.round((d * rate) / 1e6) : fallback;
    return samples > 0 ? samples : fallback;
  });
}

export function muxStem(
  samples: readonly Pick<EncodedAudioSample, 'data'>[],
  frameSamples: readonly number[],
  description: Uint8Array | null | undefined,
  job: StemMuxJob,
): Uint8Array {
  const count = job.headCount ?? samples.length;
  return buildMp4({
    codec: job.codec,
    sampleRate: job.sampleRate,
    channels: job.channels,
    frames: samples.slice(0, count).map((s) => s.data),
    frameSamples: frameSamples.slice(0, count),
    description: description ?? null,
    primingSamples: job.primingSamples,
  });
}

/**
 * What the encoding worker is asked: a file, or the encoder's delay (the correlation of the decoded-back start with
 * what went in: tens of millions of multiplications that used to run on the page between yields).
 */
export type StemJob =
  | { kind: 'file'; file: StemMuxJob }
  | { kind: 'lag'; reference: Float32Array; back: Float32Array; maxLag: number; window: number };

/** Runs a job in the worker on the samples it encoded. */
export function runStemJob(
  job: StemJob,
  samples: readonly EncodedAudioSample[],
  description: Uint8Array | undefined,
): JobOutcome {
  if (job.kind === 'lag') return { value: estimateLag(job.reference, job.back, job.maxLag, job.window) };
  const frameSamples = stemFrameSamples(
    samples.map((s) => s.duration),
    job.file.sampleRate,
    job.file.codec,
  );
  const bytes = muxStem(samples, frameSamples, description, job.file);
  return { value: bytes, transfer: [bytes.buffer] };
}
