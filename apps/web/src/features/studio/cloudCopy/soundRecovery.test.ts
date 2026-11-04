import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioWorkerUnavailable, type AudioWorkerClient } from '@/lib/mp4/audioWorkerClient';
import { workerCoder, type EncodedSound } from './sound';
import type { SoundJob } from './soundJobs';

vi.mock('@/lib/supabase', () => ({
  FriendlyError: class FriendlyError extends Error {},
}));

/**
 * REQ-26 · A worker lost AFTER it encoded the copy's sound (the encoded samples lived only there) must not change the
 * outcome: the page encodes again from the original it still holds and goes on, exactly as it did before workers.
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
  static async isConfigSupported(config: unknown) {
    return { supported: true, config };
  }
  static instances = 0;
  state = 'unconfigured';
  encodeQueueSize = 0;
  private first = true;
  constructor(private readonly init: { output: (chunk: unknown, meta?: unknown) => void }) {
    FakeAudioEncoder.instances++;
  }
  configure() {
    this.state = 'configured';
  }
  encode(data: FakeAudioData) {
    const bytes = Uint8Array.of(data.numberOfFrames & 255, 1, 2, 3);
    const duration = Math.round((data.numberOfFrames / data.sampleRate) * 1e6);
    const meta = this.first ? { decoderConfig: { description: Uint8Array.of(0x11, 0x90) } } : undefined;
    this.first = false;
    this.init.output(
      { byteLength: 4, timestamp: data.timestamp, duration, copyTo: (d: Uint8Array) => d.set(bytes) },
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
  FakeAudioEncoder.instances = 0;
  g.AudioEncoder = FakeAudioEncoder;
  g.AudioData = FakeAudioData;
});
afterEach(() => {
  delete g.AudioEncoder;
  delete g.AudioData;
});

const rate = 48000;
const sound = { sampleRate: rate, channels: [new Float32Array(rate * 3), new Float32Array(rate * 3)] };
const picked = {
  codec: 'mp4a' as const,
  config: { codec: 'mp4a.40.2', sampleRate: rate, numberOfChannels: 2 } as AudioEncoderConfig,
};
const video = () => ({
  codec: 'avc1' as const,
  width: 64,
  height: 36,
  description: Uint8Array.of(1, 2, 3),
  samples: Array.from({ length: 6 }, (_, i) => ({
    data: Uint8Array.of(i, i + 1, i + 2),
    time: i * 50_000,
    duration: 50_000,
    key: i === 0,
  })),
});

/** A worker that encodes fine and is then lost: every later job is `AudioWorkerUnavailable`. */
function dyingWorker() {
  const client = {
    runs: 0,
    broken: false,
    async encode() {
      return { bytes: 100, durations: new Array(100).fill(21333), description: Uint8Array.of(0x11, 0x90) };
    },
    async run() {
      client.runs++;
      client.broken = true;
      throw new AudioWorkerUnavailable('no answer');
    },
    close() {},
  };
  return client;
}

describe('workerCoder · worker lost after encoding', () => {
  it('the head and the file are written on the page, from the sound encoded again', async () => {
    const worker = dyingWorker();
    const coder = workerCoder(worker as unknown as AudioWorkerClient<SoundJob>);
    const encoded = await coder.encode(sound, picked, 96_000, 0);
    expect(encoded.track.samples).toHaveLength(0);

    const head = await coder.head(encoded, 1e6);
    expect(head?.type).toBe('audio/mp4');
    expect(head!.size).toBeGreaterThan(0);

    // The worker is now known lost, before the picture is handed over: the page writes the whole file.
    const file = await coder.file(video(), encoded);
    expect(file.type).toBe('video/mp4');
    expect(file.size).toBeGreaterThan(head!.size);
  });

  it('a worker lost after taking the picture ends with a friendly error, not a raw one', async () => {
    const worker = dyingWorker();
    const coder = workerCoder(worker as unknown as AudioWorkerClient<SoundJob>);
    const encoded = await coder.encode(sound, picked, 96_000, 0);
    // The file is asked first: the worker dies while it holds the picture's buffers.
    await expect(coder.file(video(), encoded)).rejects.toMatchObject({
      message: 'No se pudo preparar el sonido de la copia.',
    });
  });

  it('encodes again only once for all the requests, and keeps the edit list set on the track', async () => {
    const worker = dyingWorker();
    const coder = workerCoder(worker as unknown as AudioWorkerClient<SoundJob>);
    const encoded = await coder.encode(sound, picked, 96_000, 0);
    const edited: EncodedSound = { ...encoded, track: { ...encoded.track, primingSamples: 1024 } };
    const before = FakeAudioEncoder.instances;
    await coder.head(encoded, 1e6);
    await coder.head(edited, 1e6);
    await coder.file(video(), edited);
    expect(FakeAudioEncoder.instances - before).toBe(1);
    expect(worker.runs).toBe(2);
  });
});
