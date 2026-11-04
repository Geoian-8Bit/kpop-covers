import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plainPass, type AudioPageMessage, type AudioWorkerMessage } from './audioEncode';
import { AudioWorkerUnavailable, openAudioWorker } from './audioWorkerClient';

/**
 * REQ-26 · The page side of the audio worker, with a scripted fake worker: a refused configuration, a failing job,
 * a cancel and a worker that goes silent all end the way the pre-worker code ended (the page does it itself, or the
 * same error comes out), and nothing is left hanging.
 */

type Reply = AudioWorkerMessage | 'silent';

class FakeWorker {
  onmessage: ((e: MessageEvent<AudioWorkerMessage>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  readonly seen: AudioPageMessage<unknown>[] = [];
  constructor(private readonly script: (m: AudioPageMessage<unknown>) => Reply) {
    queueMicrotask(() => this.say({ type: 'ready', encoder: true }));
  }
  say(m: AudioWorkerMessage) {
    if (!this.terminated) this.onmessage?.({ data: m } as MessageEvent<AudioWorkerMessage>);
  }
  postMessage(m: AudioPageMessage<unknown>) {
    this.seen.push(m);
    const reply = this.script(m);
    if (reply !== 'silent') queueMicrotask(() => this.say(reply));
  }
  terminate() {
    this.terminated = true;
  }
}

const g = globalThis as Record<string, unknown>;
beforeEach(() => {
  g.Worker = class {};
});
afterEach(() => {
  delete g.Worker;
  vi.useRealTimers();
});

const abortError = () => new DOMException('cancelled', 'AbortError');
const open = (script: (m: AudioPageMessage<unknown>) => Reply, limits = { readyMs: 50, baseMs: 50 }) => {
  const fake = new FakeWorker(script);
  return openAudioWorker<unknown>(() => fake as unknown as Worker, abortError, limits).then((client) => ({
    client,
    fake,
  }));
};
const config = { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2 } as AudioEncoderConfig;
const pass = plainPass(config, 4800);
const channels = [new Float32Array(4800), new Float32Array(4800)];

describe('audio worker client', () => {
  it('a refused configuration rejects the pass as unavailable (the page encodes) and leaves the worker alone', async () => {
    const { client, fake } = await open((m) =>
      m.type === 'pass' ? { type: 'unsupported' } : { type: 'ack' },
    );
    await expect(client!.encode(pass, channels)).rejects.toBeInstanceOf(AudioWorkerUnavailable);
    expect(fake.terminated).toBe(false);
  });

  it('a failing job rejects only that request: the worker stays usable and a later job works', async () => {
    let jobs = 0;
    const { client, fake } = await open((m) => {
      if (m.type !== 'job') return { type: 'ack' };
      return ++jobs === 1 ? { type: 'error', message: 'boom' } : { type: 'result', value: 7 };
    });
    await expect(client!.run({ kind: 'head' })).rejects.toThrow('boom');
    expect(client!.broken).toBe(false);
    await expect(client!.run({ kind: 'file' })).resolves.toBe(7);
    expect(fake.terminated).toBe(false);
  });

  it('onerror / onmessageerror break it for good: the next job is rejected as unavailable', async () => {
    const { client, fake } = await open(() => 'silent');
    const pending = client!.run({ kind: 'head' });
    fake.onmessageerror?.();
    await expect(pending).rejects.toBeInstanceOf(AudioWorkerUnavailable);
    expect(client!.broken).toBe(true);
    expect(fake.terminated).toBe(true);
    await expect(client!.run({ kind: 'file' })).rejects.toBeInstanceOf(AudioWorkerUnavailable);
  });

  it('aborting stops the worker and rejects with the abort error', async () => {
    const { client, fake } = await open(() => 'silent', { readyMs: 50, baseMs: 5000 });
    const controller = new AbortController();
    const pending = client!.run({ kind: 'file' }, [], controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fake.terminated).toBe(true);
  });

  it('a worker that goes silent is given up on after its allowance, never left hanging', async () => {
    const { client, fake } = await open(() => 'silent', { readyMs: 50, baseMs: 30 });
    await expect(client!.encode(pass, channels)).rejects.toBeInstanceOf(AudioWorkerUnavailable);
    expect(fake.terminated).toBe(true);
    expect(client!.broken).toBe(true);
  });

  it('requests made while one is pending queue up: none is left hanging and they reach the worker in order', async () => {
    const { client, fake } = await open(() => 'silent', { readyMs: 50, baseMs: 5000 });
    const first = client!.run<number>({ kind: 'a' });
    const second = client!.run<number>({ kind: 'b' });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    // Only the first is out; the second waits for its answer.
    expect(fake.seen.map((m) => (m as { job?: { kind: string } }).job?.kind)).toEqual(['a']);
    fake.say({ type: 'result', value: 1 });
    await expect(first).resolves.toBe(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.seen).toHaveLength(2);
    fake.say({ type: 'result', value: 2 });
    await expect(second).resolves.toBe(2);
  });

  it('a failed request does not stop the ones queued behind it', async () => {
    let jobs = 0;
    const { client } = await open((m) =>
      m.type === 'job'
        ? ++jobs === 1
          ? { type: 'error', message: 'boom' }
          : { type: 'result', value: 5 }
        : { type: 'ack' },
    );
    const first = client!.run({ kind: 'a' });
    const second = client!.run({ kind: 'b' });
    await expect(first).rejects.toThrow('boom');
    await expect(second).resolves.toBe(5);
  });
});
