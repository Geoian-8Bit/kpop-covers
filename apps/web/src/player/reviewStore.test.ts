import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerEngine } from './engine';
import { originalWaitState, reviewOriginalRate, reviewTakeRate, useReview } from './store';

function fakeEngine(duration = 120) {
  let now = 0;
  return {
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn((s: number) => {
      now = s;
    }),
    getCurrentTime: () => now,
    getDuration: () => duration,
    setRate: vi.fn(),
    setMuted: vi.fn(),
  } satisfies PlayerEngine;
}

/** A video from the gallery: the dance (and the song) start 12,57 s into the take. */
function openGalleryTake() {
  const take = fakeEngine(60);
  const original = fakeEngine(200);
  useReview.getState().begin({
    timing: { songStart: 0, speed: 1, takeSpeed: 1, adjust: 0, lead: 12.57, offset: 0, onFile: true },
    duration: 60,
    mirrored: false,
  });
  useReview.getState().attachTake(take);
  useReview.getState().attachOriginal(original, 'file');
  return { take, original };
}

describe('review store · the song starts later in the take', () => {
  beforeEach(() => {
    useReview.getState().end();
    originalWaitState.waiting = false;
  });

  it('never sends the original below 0: before the lead it waits at 0', () => {
    const { original } = openGalleryTake();
    expect(useReview.getState().originalRawTarget(0)).toBeCloseTo(-12.57);
    expect(useReview.getState().originalTarget(0)).toBe(0);
    useReview.getState().seek(5);
    expect(original.seek).toHaveBeenLastCalledWith(0, undefined);
  });

  it('playing before the lead leaves the original paused, waiting; past it, it plays', () => {
    const { take, original } = openGalleryTake();
    useReview.getState().play();
    expect(take.play).toHaveBeenCalled();
    expect(original.play).not.toHaveBeenCalled();
    expect(originalWaitState.waiting).toBe(true);

    useReview.getState().pause();
    expect(originalWaitState.waiting).toBe(false);
    useReview.getState().seek(20);
    expect(original.getCurrentTime()).toBeCloseTo(7.43);
    useReview.getState().play();
    expect(original.play).toHaveBeenCalledTimes(1);
    expect(originalWaitState.waiting).toBe(false);
  });
});

describe('review store · «Solo toma»', () => {
  beforeEach(() => {
    useReview.getState().end();
    originalWaitState.waiting = false;
  });

  it('pauses and leaves the original alone, with the take heard', () => {
    const { take, original } = openGalleryTake();
    useReview.getState().seek(30);
    useReview.getState().setAudio('original');
    useReview.getState().play();
    expect(original.play).toHaveBeenCalledTimes(1);

    useReview.getState().setSolo(true);
    expect(original.pause).toHaveBeenCalled();
    expect(take.setMuted).toHaveBeenLastCalledWith(false);
    expect(original.setMuted).toHaveBeenLastCalledWith(true);
    const seeks = original.seek.mock.calls.length;
    useReview.getState().seek(40);
    expect(original.seek).toHaveBeenCalledTimes(seeks); // hidden: not moved at every scrub

    useReview.getState().setSolo(false);
    // Back to comparing while playing: placed at the take's moment, playing, heard as chosen before.
    expect(original.getCurrentTime()).toBeCloseTo(27.43);
    expect(original.play).toHaveBeenCalledTimes(2);
    expect(original.setMuted).toHaveBeenLastCalledWith(false);
    expect(take.setMuted).toHaveBeenLastCalledWith(true);
  });

  it('a new take opens comparing', () => {
    openGalleryTake();
    useReview.getState().setSolo(true);
    openGalleryTake();
    expect(useReview.getState().solo).toBe(false);
  });
});

describe('review store · a take of part of the song', () => {
  beforeEach(() => {
    useReview.getState().end();
    originalWaitState.waiting = false;
  });

  it('places the original at the song second of the sync point, live', () => {
    const { original } = openGalleryTake();
    useReview.getState().setTiming({ songStart: 65.3 });
    useReview.getState().seek(12.57);
    expect(original.getCurrentTime()).toBeCloseTo(65.3);
    useReview.getState().seek(20);
    expect(original.getCurrentTime()).toBeCloseTo(72.73);
    // Before the take's point the song is already playing (earlier in it): no wait.
    useReview.getState().seek(0);
    expect(original.getCurrentTime()).toBeCloseTo(52.73);
    useReview.getState().play();
    expect(original.play).toHaveBeenCalledTimes(1);
    expect(originalWaitState.waiting).toBe(false);
  });
});

describe('review store · each video at its own speed, placed alone', () => {
  beforeEach(() => {
    useReview.getState().end();
    originalWaitState.waiting = false;
  });

  it('plays the take at its speed and the original at the song speed, both × the common one', () => {
    expect(reviewTakeRate({ takeSpeed: 1.25 }, 0.5)).toBe(0.625);
    expect(reviewOriginalRate({ speed: 0.75 }, 1)).toBe(0.75);
    expect(reviewOriginalRate({ speed: 0.25 }, 0.5)).toBe(0.25);
    const { take, original } = openGalleryTake();
    useReview.getState().setTiming({ speed: 0.75, takeSpeed: 1 });
    expect(original.setRate).toHaveBeenLastCalledWith(0.75);
    expect(take.setRate).toHaveBeenLastCalledWith(1);
    useReview.getState().setRate(0.5);
    expect(original.setRate).toHaveBeenLastCalledWith(0.375);
    expect(take.setRate).toHaveBeenLastCalledWith(0.5);
    // 20 s of take past the lead at 0,75 song per take second.
    expect(useReview.getState().originalTarget(32.57)).toBeCloseTo(15);
  });

  it('the song alone: paused, the original heard and on stage; back to both on leaving', () => {
    const { take, original } = openGalleryTake();
    useReview.getState().seek(30);
    useReview.getState().play();
    useReview.getState().setSyncEdit('original');
    expect(useReview.getState().playing).toBe(false);
    expect(useReview.getState().solo).toBe(false);
    expect(original.setMuted).toHaveBeenLastCalledWith(false);
    expect(take.setMuted).toHaveBeenLastCalledWith(true);

    useReview.getState().setSyncEdit('take');
    expect(useReview.getState()).toMatchObject({ syncEdit: 'take', solo: true });
    expect(take.setMuted).toHaveBeenLastCalledWith(false);

    useReview.getState().setSyncEdit(null);
    expect(useReview.getState()).toMatchObject({ syncEdit: null, solo: false });
    // «Comparar» from elsewhere ends placing a video too.
    useReview.getState().setSyncEdit('take');
    useReview.getState().setSolo(false);
    expect(useReview.getState().syncEdit).toBeNull();
  });
});
