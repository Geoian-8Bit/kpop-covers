import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioWorkerUnavailable } from '@/lib/mp4/audioWorkerClient';
import { encodeFrames } from './encode';

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/mp4/audioWorkerClient', async (original) => ({
  ...(await original<typeof import('@/lib/mp4/audioWorkerClient')>()),
  openAudioWorker: async () => mocks.client,
}));

/**
 * REQ-26 · A stem worker lost after it encoded: the file (and the delay measure) are made on the page, from the
 * resampled sound it still holds, the very same bytes as when the page encoded from the start.
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
  state = 'unconfigured';
  encodeQueueSize = 0;
  private first = true;
  constructor(private readonly init: { output: (chunk: unknown, meta?: unknown) => void }) {}
  configure() {
    this.state = 'configured';
  }
  encode(data: FakeAudioData) {
    const bytes = Uint8Array.of(data.numberOfFrames & 255, 7, 8, 9);
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
  g.AudioEncoder = FakeAudioEncoder;
  g.AudioData = FakeAudioData;
  g.Worker = class {};
});
afterEach(() => {
  delete g.AudioEncoder;
  delete g.AudioData;
  delete g.Worker;
  mocks.client = null;
});

const rate = 48000;
const choice = {
  codec: 'aac' as const,
  sampleRate: rate,
  config: {
    codec: 'mp4a.40.2',
    sampleRate: rate,
    numberOfChannels: 2,
    bitrate: 96_000,
  } as AudioEncoderConfig,
};
const left = new Float32Array(rate * 2).map((_, i) => Math.sin(i / 9));
const right = left.slice();

describe('encodeFrames · worker lost after encoding', () => {
  it('file() and lag() fall back to the page and match a page-only encoding', async () => {
    mocks.client = null;
    const pageOnly = await encodeFrames(left, right, choice);
    const expected = await pageOnly.file(1024);
    const expectedHead = await pageOnly.file(0, 5);

    const dead = {
      broken: false,
      encode: async () => ({
        bytes: 1,
        durations: pageOnly.frameSamples.map((n) => Math.round((n / rate) * 1e6)),
        description: Uint8Array.of(0x11, 0x90),
      }),
      run: async () => {
        dead.broken = true;
        throw new AudioWorkerUnavailable('no answer');
      },
      close: vi.fn(),
    };
    mocks.client = dead;
    const lost = await encodeFrames(left, right, choice);
    expect(lost.frameSamples).toEqual(pageOnly.frameSamples);
    expect(await lost.file(1024)).toEqual(expected);
    expect(await lost.file(0, 5)).toEqual(expectedHead);
    const lag = await lost.lag(left.slice(0, 4800), left.slice(0, 4800), 100, 4800);
    expect(lag).not.toBeUndefined();
  });
});
