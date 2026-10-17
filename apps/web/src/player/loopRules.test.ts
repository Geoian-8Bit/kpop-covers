import { describe, expect, it } from 'vitest';
import {
  FILE_MAX_SEEK_MS,
  FRAME_MS,
  loopLead,
  measuresFileSeek,
  MIN_LEAD,
  msUntilWrap,
  nextLatency,
  seekLanded,
  songWrapPoint,
  wrapLead,
  wrapPoint,
  YOUTUBE_BUFFERING_MS,
  YOUTUBE_MAX_SEEK_MS,
  youtubeSeekSample,
  type LoopTiming,
} from './loopRules';

const youtube: LoopTiming = { latencyMs: 120, maxLatencyMs: 300, endMargin: 0.3 };
const file: LoopTiming = { latencyMs: 40, maxLatencyMs: FILE_MAX_SEEK_MS, endMargin: 0 };

describe('loopLead', () => {
  it('anticipates the seek latency plus half a frame at normal speed', () => {
    expect(loopLead(file, 1, 10)).toBeCloseTo((40 + FRAME_MS / 2) / 1000, 5);
  });

  it('scales with the speed: faster songs need more song time ahead', () => {
    expect(loopLead(youtube, 2, 10)).toBeCloseTo(2 * loopLead(youtube, 1, 10), 5);
    expect(loopLead(youtube, 0.5, 10)).toBeCloseTo(0.5 * loopLead(youtube, 1, 10), 5);
  });

  it('caps a bad latency estimate', () => {
    const slow = { ...youtube, latencyMs: 5000 };
    expect(loopLead(slow, 1, 30)).toBeCloseTo((300 + FRAME_MS / 2) / 1000, 5);
  });

  it('never takes more than a quarter of a short clip', () => {
    expect(loopLead(youtube, 2, 0.4)).toBeCloseTo(0.1, 5);
  });

  it('keeps the old minimum margin', () => {
    expect(loopLead({ ...file, latencyMs: 0 }, 0.25, 0.01)).toBe(MIN_LEAD);
  });
});

describe('wrap points', () => {
  it('jumps the lead before the end of a range', () => {
    expect(wrapPoint(20, 0.15)).toBeCloseTo(19.85, 5);
    expect(wrapPoint(20, 0)).toBeCloseTo(20 - MIN_LEAD, 5);
  });

  it('keeps YouTube away from its end screen on the whole-song loop', () => {
    expect(songWrapPoint(180, 0.1, youtube)).toBeCloseTo(179.7, 5);
    expect(songWrapPoint(180, 0.5, youtube)).toBeCloseTo(179.5, 5);
  });

  it('lets a file loop the whole song up to its lead', () => {
    expect(songWrapPoint(180, 0.06, file)).toBeCloseTo(179.94, 5);
  });
});

describe('msUntilWrap', () => {
  it('is due at once on or past the point', () => {
    expect(msUntilWrap(10, 10, 1)).toBe(0);
    expect(msUntilWrap(10.2, 10, 1)).toBe(0);
  });

  it('times a jump that falls before the next frame', () => {
    expect(msUntilWrap(9.99, 10, 1)).toBeCloseTo(10, 5);
    expect(msUntilWrap(9.99, 10, 2)).toBeCloseTo(5, 5);
  });

  it('leaves later jumps to the next frame', () => {
    expect(msUntilWrap(9.9, 10, 1)).toBeNull();
  });
});

describe('nextLatency', () => {
  it('starts from the first sample', () => {
    expect(nextLatency(null, 80)).toBe(80);
  });

  it('moves part of the way towards a new sample', () => {
    expect(nextLatency(100, 200)).toBeCloseTo(135, 5);
  });

  it('ignores samples that say nothing', () => {
    expect(nextLatency(100, -5)).toBe(100);
    expect(nextLatency(100, 9000)).toBe(100);
    expect(nextLatency(null, Number.NaN)).toBeNull();
  });
});

describe('file seek measuring', () => {
  it("only measures the loop's own exact jumps while playing", () => {
    expect(measuresFileSeek({ loop: true }, false)).toBe(true);
    expect(measuresFileSeek({ loop: true }, true)).toBe(false);
    expect(measuresFileSeek({ loop: true, preview: true }, false)).toBe(false);
  });

  it('ignores ±5 s, timeline taps and clips far away (they may stream from the cloud)', () => {
    expect(measuresFileSeek(undefined, false)).toBe(false);
    expect(measuresFileSeek({}, false)).toBe(false);
    expect(measuresFileSeek({ preview: true }, false)).toBe(false);
  });

  it("caps a file's lead at 120 ms", () => {
    const slow: LoopTiming = { ...file, latencyMs: 800 };
    expect(loopLead(slow, 1, 30)).toBeCloseTo((120 + FRAME_MS / 2) / 1000, 5);
  });
});

describe('wrapLead', () => {
  it('jumps early without a pause between repetitions', () => {
    expect(wrapLead(youtube, 1, 10, 0)).toBeCloseTo(loopLead(youtube, 1, 10), 5);
  });

  it('never anticipates with a pause: the clip plays to its very end', () => {
    expect(wrapLead(youtube, 1, 10, 2)).toBe(0);
    expect(wrapPoint(20, wrapLead(youtube, 2, 10, 1))).toBeCloseTo(20 - MIN_LEAD, 5);
  });

  it('has nothing to anticipate without timing', () => {
    expect(wrapLead(null, 1, 10, 0)).toBe(0);
  });
});

describe('YouTube seek measuring', () => {
  const landing = { elapsedMs: 260, raw: 12, target: 12, rate: 1, bufferingMs: 0 };

  it('takes off what the song already played at the new spot when the report is seen', () => {
    // Report at 12.125 for a seek to 12: it landed 125 ms before the page saw it.
    expect(youtubeSeekSample({ ...landing, raw: 12.125 })).toBeCloseTo(135, 5);
    // A report sent right on landing (a state change): the whole time counts, nothing guessed away.
    expect(youtubeSeekSample(landing)).toBe(260);
  });

  it('does not depend on the speed', () => {
    // At 2× the same 125 ms covers 0.25 s of song.
    expect(youtubeSeekSample({ ...landing, raw: 12.25, rate: 2 })).toBeCloseTo(135, 5);
    expect(youtubeSeekSample({ ...landing, raw: 12.0625, rate: 0.5 })).toBeCloseTo(135, 5);
  });

  it('never goes below zero, and a landing short of the target counts whole', () => {
    expect(youtubeSeekSample({ ...landing, elapsedMs: 100, raw: 12.5 })).toBe(0);
    expect(youtubeSeekSample({ ...landing, raw: 11.96 })).toBe(260);
  });

  it('drops a seek that had to buffer, not a short flicker', () => {
    expect(youtubeSeekSample({ ...landing, bufferingMs: 900 })).toBeNull();
    expect(youtubeSeekSample({ ...landing, bufferingMs: YOUTUBE_BUFFERING_MS })).toBe(260);
    expect(youtubeSeekSample({ ...landing, elapsedMs: Number.NaN })).toBeNull();
  });

  it('caps the lead at 200 ms', () => {
    const slow: LoopTiming = { latencyMs: 450, maxLatencyMs: YOUTUBE_MAX_SEEK_MS, endMargin: 0.3 };
    expect(loopLead(slow, 1, 30)).toBeCloseTo((200 + FRAME_MS / 2) / 1000, 5);
  });

  it('sees a loop jump back land', () => {
    expect(seekLanded(12.05, 20.1, 12)).toBe(true);
    expect(seekLanded(20.35, 20.1, 12)).toBe(false);
  });

  it('does not mistake a short clip still playing on for the landing', () => {
    // Clip 2.0–2.8: sent at 2.7, the old position goes on to 2.95, within a second of the start.
    expect(seekLanded(2.95, 2.7, 2)).toBe(false);
    expect(seekLanded(2.04, 2.7, 2)).toBe(true);
  });

  it('accepts a seek to where the song already was', () => {
    expect(seekLanded(5.02, 5.0, 5)).toBe(true);
  });
});
