import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { muxMp4 } from '@/features/studio/mp4Mux';
import {
  muxAudioTrack,
  runSoundJob,
  shiftInputs,
  type SoundJob,
} from '@/features/studio/cloudCopy/soundJobs';
import { measureShift } from '@/features/studio/audioAlign';
import { estimateLagSliced } from '@/features/voice/separate/separateRules';
import {
  muxStem,
  runStemJob,
  stemFrameSamples,
  type StemJob,
  type StemMuxJob,
} from '@/features/voice/separate/stemFrames';
import {
  AUDIO_BLOCK,
  AudioPassEncoder,
  BLOCKS_PER_CHUNK,
  createAudioEncodeHost,
  fillBlock,
  plainPass,
  sliceSource,
  type AudioPass,
  type AudioWorkerMessage,
  type EncodedAudioSample,
} from './audioEncode';

/**
 * REQ-26 · The worker path and the page path feed the encoder the very same blocks, so they write the very same
 * files. A fake, deterministic AudioEncoder (its "packet" is a digest of the block it got) stands in for WebCodecs.
 */

class FakeAudioData {
  readonly planar: Float32Array;
  readonly timestamp: number;
  readonly numberOfFrames: number;
  readonly sampleRate: number;
  constructor(init: { data: Float32Array; timestamp: number; numberOfFrames: number; sampleRate: number }) {
    this.planar = init.data.slice();
    this.timestamp = init.timestamp;
    this.numberOfFrames = init.numberOfFrames;
    this.sampleRate = init.sampleRate;
  }
  close() {}
}

class FakeAudioEncoder {
  static supported = true;
  static async isConfigSupported(config: unknown) {
    return { supported: FakeAudioEncoder.supported, config };
  }
  state = 'unconfigured';
  encodeQueueSize = 0;
  private readonly out: (chunk: unknown, meta?: unknown) => void;
  private first = true;
  constructor(init: { output: (chunk: unknown, meta?: unknown) => void }) {
    this.out = init.output;
  }
  configure() {
    this.state = 'configured';
  }
  encode(data: FakeAudioData) {
    let h = 0x811c9dc5;
    const view = new Uint8Array(data.planar.buffer);
    for (let i = 0; i < view.length; i++) h = Math.imul(h ^ view[i]!, 0x01000193) >>> 0;
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setUint32(0, h);
    new DataView(bytes.buffer).setUint32(4, data.numberOfFrames);
    const duration = Math.round((data.numberOfFrames / data.sampleRate) * 1e6);
    const meta = this.first ? { decoderConfig: { description: Uint8Array.of(0x11, 0x90) } } : undefined;
    this.first = false;
    this.out(
      { byteLength: 8, timestamp: data.timestamp, duration, copyTo: (d: Uint8Array) => d.set(bytes) },
      meta,
    );
  }
  async flush() {}
  close() {
    this.state = 'closed';
  }
}

const g = globalThis as Record<string, unknown>;
beforeEach(() => {
  FakeAudioEncoder.supported = true;
  g.AudioEncoder = FakeAudioEncoder;
  g.AudioData = FakeAudioData;
});
afterEach(() => {
  delete g.AudioEncoder;
  delete g.AudioData;
});

function tone(n: number, seed: number): Float32Array {
  const out = new Float32Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = 0.4 * Math.sin(i / (7 + seed)) + (s / 2 ** 32 - 0.5) * 0.05;
  }
  return out;
}

const config = (channels: number): AudioEncoderConfig => ({
  codec: 'mp4a.40.2',
  sampleRate: 48000,
  numberOfChannels: channels,
  bitrate: 96_000,
});

function copyPass(total: number, shift: number, channels = 2): AudioPass {
  const skip = Math.max(0, shift);
  const pad = Math.max(0, -shift);
  return { config: config(channels), rate: 48000, length: total - skip + pad, total, skip, pad };
}

/** The page path: every block from the whole source. */
async function onPage(pass: AudioPass, source: Float32Array[]) {
  const enc = new AudioPassEncoder(pass);
  while (!enc.done) enc.encodeBlock({ start: 0, channels: source });
  await enc.flush();
  enc.close();
  return { samples: enc.samples, description: enc.description, bytes: enc.bytes };
}

/** The worker path: the host fed stretch by stretch, as the page client sends them (copies, in order). */
async function inWorker<J>(
  pass: AudioPass,
  source: Float32Array[],
  jobs: J[] = [],
  run: (j: J, s: readonly EncodedAudioSample[], d?: Uint8Array) => { value: unknown } = () => ({
    value: null,
  }),
) {
  const posted: AudioWorkerMessage[] = [];
  let kept: readonly EncodedAudioSample[] = [];
  let wake: (() => void) | null = null;
  const handle = createAudioEncodeHost<J>(
    (m) => {
      posted.push(m);
      wake?.();
    },
    (job, encoded) => {
      kept = encoded.samples;
      return run(job, encoded.samples, encoded.description);
    },
  );
  const answer = async () => {
    const at = posted.length;
    while (posted.length === at) await new Promise<void>((r) => (wake = r));
    return posted[posted.length - 1]!;
  };
  const started = answer();
  handle({ type: 'pass', pass });
  expect((await started).type).toBe('ack');
  const step = AUDIO_BLOCK * BLOCKS_PER_CHUNK;
  for (let pos = 0; pos < pass.length; pos += step) {
    const frames = Math.min(step, pass.length - pos);
    const next = answer();
    handle({ type: 'chunk', frames, slice: sliceSource(source, pass, pos, frames) });
    expect((await next).type).toBe('ack');
  }
  let next = answer();
  handle({ type: 'end' });
  const encoded = await next;
  const results: unknown[] = [];
  for (const job of jobs) {
    next = answer();
    handle({ type: 'job', job });
    const m = await next;
    if (m.type !== 'result') throw new Error(m.type === 'error' ? m.message : m.type);
    results.push(m.value);
  }
  return { posted, encoded, results, kept };
}

/** The copy's block as it was filled before REQ-26: sample by sample. */
function oldBlock(
  source: Float32Array[],
  pass: AudioPass,
  pos: number,
  n: number,
  channels: number,
): Float32Array {
  const planar = new Float32Array(n * channels);
  for (let c = 0; c < channels; c++) {
    const src = source[Math.min(c, source.length - 1)]!;
    const offset = pos - pass.pad + pass.skip;
    for (let i = 0; i < n; i++) {
      const j = offset + i;
      planar[c * n + i] = j >= 0 && j < pass.total ? src[j]! : 0;
    }
  }
  return planar;
}

describe('REQ-26 · audio blocks', () => {
  it('fills each block exactly as the sample-by-sample loop did (pad, skip, mono to stereo, both ends)', () => {
    const total = 20_000;
    const stereo = [tone(total, 1), tone(total, 2)];
    for (const shift of [0, 1, 2112, -1024, -7000, 19_990, -30_000]) {
      for (const source of [stereo, [stereo[0]!]]) {
        const pass = copyPass(total, shift);
        for (let pos = 0; pos < pass.length; pos += AUDIO_BLOCK) {
          const n = Math.min(AUDIO_BLOCK, pass.length - pos);
          const planar = new Float32Array(n * 2);
          const slice = sliceSource(source, pass, pos, n);
          fillBlock(planar, pass, slice, pos, n, 2);
          expect(planar).toEqual(oldBlock(source, pass, pos, n, 2));
        }
      }
    }
  });

  it('the worker and the page encode the same samples, for every shift', async () => {
    const total = AUDIO_BLOCK * BLOCKS_PER_CHUNK * 2 + 3333;
    const source = [tone(total, 3), tone(total, 4)];
    for (const shift of [0, 2112, -1500]) {
      const pass = copyPass(total, shift);
      const page = await onPage(pass, source);
      const worker = await inWorker(pass, source, [0]);
      expect(worker.encoded).toEqual({
        type: 'encoded',
        bytes: page.bytes,
        durations: page.samples.map((s) => s.duration),
        description: page.description,
      });
      expect(worker.kept).toEqual(page.samples);
    }
  });

  it('separated tracks: the same .m4a bytes from the worker and from the page', async () => {
    const total = 190_000;
    const left = tone(total, 5);
    const right = tone(total, 6);
    const pass = plainPass({ ...config(2), sampleRate: 44100 }, total);
    const job: StemMuxJob = {
      codec: 'aac',
      sampleRate: 44100,
      channels: 2,
      primingSamples: 1024,
      headCount: null,
    };
    const head: StemMuxJob = { ...job, primingSamples: 0, headCount: 12 };
    const reference = new Float32Array(100_000);
    let seed = 9;
    for (let i = 0; i < reference.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      reference[i] = seed / 2 ** 32 - 0.5;
    }
    const back = new Float32Array(100_000);
    back.set(reference.subarray(0, 100_000 - 37), 37);
    const jobs: StemJob[] = [
      { kind: 'file', file: job },
      { kind: 'file', file: head },
      { kind: 'lag', reference, back, maxLag: 6615, window: 44100 },
    ];
    const worker = await inWorker<StemJob>(pass, [left, right], jobs, runStemJob);
    const page = await onPage(pass, [left, right]);
    const frameSamples = stemFrameSamples(
      page.samples.map((s) => s.duration),
      44100,
      'aac',
    );
    expect(worker.results[0]).toEqual(muxStem(page.samples, frameSamples, page.description, job));
    expect(worker.results[1]).toEqual(muxStem(page.samples, frameSamples, page.description, head));
    // The delay measured in the worker is the one the page measured between yields.
    const sliced = await estimateLagSliced(reference, back, 6615, 44100, async () => undefined);
    expect(worker.results[2]).toEqual(sliced);
    expect(sliced?.lag).toBe(37);
  });

  it('copy for the cloud: the same head, shift measure and whole file from the worker and from the page', async () => {
    const total = 48000 * 3;
    const source = [tone(total, 7), tone(total, 8)];
    const pass = copyPass(total, -1024);
    const track = {
      codec: 'mp4a' as const,
      sampleRate: 48000,
      channels: 2,
      description: Uint8Array.of(0x11, 0x90),
      preSkip: 0,
      bitrate: 96_000,
      primingSamples: 1024,
    };
    const video = () => ({
      codec: 'avc1' as const,
      width: 64,
      height: 36,
      description: Uint8Array.of(1, 2, 3),
      samples: Array.from({ length: 60 }, (_, i) => ({
        data: Uint8Array.of(i, i + 1, i + 2),
        time: Math.round((i / 20) * 1e6),
        duration: 50_000,
        key: i % 20 === 0,
      })),
    });
    const inputs = shiftInputs(source, source, 48000, 2);
    const jobs: SoundJob[] = [
      { kind: 'head', track, endUs: 1e6 },
      { kind: 'shift', ...inputs, sampleRate: 48000, windowSeconds: 2 },
      { kind: 'file', track, video: video() },
    ];
    const worker = await inWorker<SoundJob>(pass, source, jobs, runSoundJob);
    const page = await onPage(pass, source);
    const audio = muxAudioTrack(track, page.samples);
    const flat = (parts: Uint8Array[]) => new Uint8Array(parts.flatMap((p) => [...p]));
    expect(worker.results[0]).toEqual(
      flat(muxMp4({ audio: { ...audio, samples: audio.samples.filter((s) => s.time < 1e6) } })),
    );
    expect(worker.results[1]).toEqual(measureShift(source, source, 48000, { windowSeconds: 2 }));
    expect(flat(worker.results[2] as Uint8Array[])).toEqual(flat(muxMp4({ video: video(), audio })));
    // The sound's samples stay usable in the worker for another attempt.
    expect(worker.kept.every((s) => s.data.byteLength === 8)).toBe(true);
  });

  it('a worker without AudioEncoder says so at once (the page then encodes itself)', () => {
    delete g.AudioEncoder;
    const posted: AudioWorkerMessage[] = [];
    createAudioEncodeHost(
      (m) => posted.push(m),
      () => ({ value: null }),
    );
    expect(posted).toEqual([{ type: 'ready', encoder: false }]);
  });

  it("a worker that has AudioEncoder but refuses the configuration answers 'unsupported' (the page then encodes)", async () => {
    const tries: [string, () => void][] = [
      ['isConfigSupported says no', () => void (FakeAudioEncoder.supported = false)],
      [
        'isConfigSupported throws',
        () => void (FakeAudioEncoder.isConfigSupported = () => Promise.reject(new Error('nope'))),
      ],
      [
        'configure throws',
        () =>
          void (FakeAudioEncoder.prototype.configure = () => {
            throw new DOMException('no', 'NotSupportedError');
          }),
      ],
    ];
    const saved = { is: FakeAudioEncoder.isConfigSupported, cfg: FakeAudioEncoder.prototype.configure };
    try {
      for (const [, arrange] of tries) {
        FakeAudioEncoder.supported = true;
        FakeAudioEncoder.isConfigSupported = saved.is;
        FakeAudioEncoder.prototype.configure = saved.cfg;
        arrange();
        const posted: AudioWorkerMessage[] = [];
        const handle = createAudioEncodeHost<null>(
          (m) => posted.push(m),
          () => ({ value: null }),
        );
        handle({ type: 'pass', pass: copyPass(AUDIO_BLOCK, 0) });
        await vi.waitFor(() => expect(posted.length).toBe(2));
        expect(posted[1]).toEqual({ type: 'unsupported' });
      }
    } finally {
      FakeAudioEncoder.isConfigSupported = saved.is;
      FakeAudioEncoder.prototype.configure = saved.cfg;
    }
  });
});
