import { afterEach, describe, expect, it, vi } from 'vitest';

// The voice split builds a real Web Audio graph: here only its connect/dispose surface matters.
vi.mock('@/features/voice/voiceSplit', () => ({
  createVoiceSplit: () => ({ output: { connect: vi.fn() }, dispose: vi.fn(), resetAnalysis: vi.fn() }),
}));

import { createMediaEngine, recordingTap, releaseMediaAudio } from './engine';

function fakeTrack() {
  return { kind: 'audio', readyState: 'live', stop: vi.fn() } as unknown as MediaStreamTrack & {
    stop: ReturnType<typeof vi.fn>;
  };
}

class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  readonly track = fakeTrack();
  readonly destination = {};
  state = 'running';
  close = vi.fn(() => Promise.resolve());
  constructor() {
    FakeAudioContext.last = this;
  }
  resume() {
    return Promise.resolve();
  }
  createMediaElementSource() {
    return { connect: vi.fn() };
  }
  createMediaStreamDestination() {
    const tracks = [this.track];
    return { stream: { getAudioTracks: () => tracks, getTracks: () => tracks } };
  }
  createDelay() {
    return { delayTime: { value: 0 }, connect: vi.fn() };
  }
}

describe('releaseMediaAudio', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stops and forgets the recordable tracks of the element graph (long-use leak)', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    // No captureStream: the engine takes the sound through its Web Audio graph.
    const el = { addEventListener: vi.fn() } as unknown as HTMLMediaElement;
    const track = createMediaEngine(el).captureAudio?.();
    const ctx = FakeAudioContext.last!;
    expect(track).toBe(ctx.track);
    expect(recordingTap(ctx.track)).not.toBeNull();

    releaseMediaAudio(el);

    expect(ctx.track.stop).toHaveBeenCalledTimes(1);
    expect(recordingTap(ctx.track)).toBeNull();
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });
});
