import { describe, expect, it } from 'vitest';
import {
  CAMERA_FIXED_MS,
  DEFAULT_DRAW_MS,
  DEFAULT_SPEAKER_MS,
  MAX_AUDIO_DELAY_MS,
  cameraLatencyMs,
  clampTrim,
  delaySeconds,
  medianOf,
  planSync,
  renderAheadMs,
  speakerLatency,
  syncSummary,
  trimLabel,
} from './syncRules';

describe('speaker latency', () => {
  it('uses outputLatency + baseLatency when the phone says', () => {
    expect(speakerLatency({ outputLatency: 0.04, baseLatency: 0.01 })).toEqual({ ms: 50, measured: true });
    // Bluetooth: much later, still believed.
    expect(speakerLatency({ outputLatency: 0.22, baseLatency: 0.02 }).ms).toBeCloseTo(240);
  });

  it('falls back to how far the context renders ahead, then to the default', () => {
    expect(speakerLatency({ outputLatency: 0, baseLatency: 0.01, renderAheadMs: 72 })).toEqual({ ms: 72, measured: true });
    expect(speakerLatency({ outputLatency: 0 })).toEqual({ ms: DEFAULT_SPEAKER_MS, measured: false });
    expect(speakerLatency({})).toEqual({ ms: DEFAULT_SPEAKER_MS, measured: false });
  });

  it('does not believe absurd numbers', () => {
    expect(speakerLatency({ outputLatency: 5 })).toEqual({ ms: DEFAULT_SPEAKER_MS, measured: false });
    expect(speakerLatency({ outputLatency: Number.NaN, renderAheadMs: 5000 }).measured).toBe(false);
    // An absurd base latency is ignored, the output latency is kept.
    expect(speakerLatency({ outputLatency: 0.03, baseLatency: 3 }).ms).toBeCloseTo(30);
  });
});

describe('camera latency', () => {
  it('is a fixed part plus one frame', () => {
    expect(cameraLatencyMs(30)).toBeCloseTo(CAMERA_FIXED_MS + 33.33, 1);
    expect(cameraLatencyMs(60)).toBeCloseTo(CAMERA_FIXED_MS + 16.67, 1);
    expect(cameraLatencyMs(0)).toBeCloseTo(cameraLatencyMs(30));
    expect(cameraLatencyMs(1000)).toBeCloseTo(cameraLatencyMs(120));
  });
});

describe('planSync', () => {
  it('a direct take with the song captured from the element: speaker + camera, the hop of the second context taken off', () => {
    const plan = planSync({ sound: 'song', path: 'direct', fps: 30, outputLatency: 0.06, baseLatency: 0.02, crossContext: true });
    // 60 + 20 (speaker) + 45 + 33.3 (camera) − 20 (hop) ≈ 138
    expect(plan.delayMs).toBe(138);
    expect(plan).toMatchObject({ speakerMs: 80, speakerMeasured: true, cameraMs: 78, drawMs: 0, hopMs: 20 });
  });

  it('a song delayed inside the graph of the engine has no hop', () => {
    const plan = planSync({ sound: 'song', path: 'canvas', fps: 30, outputLatency: 0.06, baseLatency: 0.02, drawLagMs: 30 });
    expect(plan.hopMs).toBe(0);
    expect(plan.delayMs).toBe(Math.round(80 + CAMERA_FIXED_MS + 1000 / 30 + 30));
  });

  it('a canvas take adds the measured draw lag, or the default without capture times', () => {
    const measured = planSync({ sound: 'song', path: 'canvas', fps: 60, outputLatency: 0.04, baseLatency: 0.01, drawLagMs: 38, crossContext: true });
    expect(measured.drawMs).toBe(38);
    expect(measured.drawMeasured).toBe(true);
    expect(measured.delayMs).toBe(Math.round(50 + CAMERA_FIXED_MS + 1000 / 60 + 38 - 10));
    const unknown = planSync({ sound: 'song', path: 'canvas', fps: 60, outputLatency: 0.04, baseLatency: 0.01, drawLagMs: null });
    expect(unknown.drawMs).toBe(DEFAULT_DRAW_MS);
    expect(unknown.drawMeasured).toBe(false);
    // An absurd lag (a stale frame from before a pause) isn't believed.
    expect(planSync({ sound: 'song', path: 'canvas', fps: 30, drawLagMs: 2000 }).drawMs).toBe(DEFAULT_DRAW_MS);
  });

  it('nothing measurable: a prudent default', () => {
    const plan = planSync({ sound: 'song', path: 'direct', fps: 30 });
    expect(plan.speakerMeasured).toBe(false);
    expect(plan.delayMs).toBe(Math.round(DEFAULT_SPEAKER_MS + CAMERA_FIXED_MS + 1000 / 30));
    expect(plan.delayMs).toBeGreaterThan(80);
    expect(plan.delayMs).toBeLessThan(200);
  });

  it('with the microphone only the picture is compensated, and no hop is taken off', () => {
    const plan = planSync({ sound: 'mic', path: 'direct', fps: 30, outputLatency: 0.2, baseLatency: 0.01, crossContext: true });
    expect(plan.speakerMs).toBe(0);
    expect(plan.hopMs).toBe(0);
    expect(plan.delayMs).toBe(Math.round(CAMERA_FIXED_MS + 1000 / 30));
    // At 60 fps with a large render buffer it still compensates the camera (it used to fall to ~0).
    expect(planSync({ sound: 'mic', path: 'direct', fps: 60, baseLatency: 0.07, crossContext: true }).delayMs).toBe(Math.round(CAMERA_FIXED_MS + 1000 / 60));
    expect(planSync({ sound: 'mic', path: 'canvas', fps: 30, drawLagMs: 20 }).delayMs).toBe(Math.round(CAMERA_FIXED_MS + 1000 / 30 + 20));
  });

  it('a manual trim moves it, within limits, and the delay stays within the line', () => {
    const base = planSync({ sound: 'song', path: 'direct', fps: 30 }).delayMs;
    expect(planSync({ sound: 'song', path: 'direct', fps: 30, trimMs: 40 }).delayMs).toBe(base + 40);
    expect(planSync({ sound: 'song', path: 'direct', fps: 30, trimMs: -1000 }).delayMs).toBe(0);
    expect(planSync({ sound: 'song', path: 'canvas', fps: 30, outputLatency: 0.7, trimMs: 300 }).delayMs).toBe(MAX_AUDIO_DELAY_MS);
    // The microphone takes the trim too.
    expect(planSync({ sound: 'mic', path: 'direct', fps: 30, trimMs: -30 }).delayMs).toBe(Math.round(CAMERA_FIXED_MS + 1000 / 30 - 30));
    expect(planSync({ sound: 'mic', path: 'direct', fps: 30, trimMs: -30 }).trimMs).toBe(-30);
    expect(clampTrim(1000)).toBe(150);
    expect(clampTrim(-1000)).toBe(-150);
    expect(clampTrim(23)).toBe(20);
    expect(clampTrim(-4)).toBe(0);
    expect(Object.is(clampTrim(-4), -0)).toBe(false);
    expect(clampTrim(Number.NaN)).toBe(0);
    expect(trimLabel(30)).toBe('+30 ms');
    expect(trimLabel(-20)).toBe('−20 ms');
    expect(trimLabel(0)).toBe('0 ms');
  });
});

describe('summary for the «i» panel', () => {
  it('says what was applied and what it was made of', () => {
    const plan = planSync({ sound: 'song', path: 'canvas', fps: 30, outputLatency: 0.06, baseLatency: 0.02, drawLagMs: 30, trimMs: 20 });
    expect(syncSummary({ ...plan, applied: true, sound: 'song', path: 'canvas' })).toBe(
      'Sonido retrasado 208 ms (altavoz 80 ms medido, cámara 78 ms, lienzo 30 ms, ajuste fino +20 ms)',
    );
    const mic = planSync({ sound: 'mic', path: 'direct', fps: 30 });
    expect(syncSummary({ ...mic, applied: false, sound: 'mic', path: 'direct' })).toBe('Sin retraso aplicado; tocaba 78 ms (cámara 78 ms)');
    // A fine adjustment that takes it to 0 is not a failure, applied or not.
    const zero = planSync({ sound: 'mic', path: 'direct', fps: 30, trimMs: -150 });
    expect(zero.delayMs).toBe(0);
    for (const applied of [true, false])
      expect(syncSummary({ ...zero, applied, sound: 'mic', path: 'direct' })).toBe(
        'Sin retraso (ajuste fino) · cámara 78 ms, ajuste fino −150 ms',
      );
  });
});

describe('helpers', () => {
  it('delays on whole samples', () => {
    expect(delaySeconds(100, 48000)).toBe(4800 / 48000);
    expect(delaySeconds(10.01, 44100) * 44100).toBeCloseTo(441, 6);
    expect(delaySeconds(0, 48000)).toBe(0);
    expect(delaySeconds(50, 0)).toBe(0);
  });

  it('reads how far a context renders ahead of the speaker', () => {
    expect(renderAheadMs(10.1, 10.04)).toBeCloseTo(60);
    expect(renderAheadMs(10, 0)).toBeNull(); // not playing yet
    expect(renderAheadMs(10, undefined)).toBeNull();
    expect(renderAheadMs(10, 10.5)).toBeNull();
    expect(renderAheadMs(20, 10)).toBeNull();
  });

  it('medians a buffer', () => {
    expect(medianOf([])).toBeNull();
    expect(medianOf([30, 10, 20])).toBe(20);
    expect(medianOf([40, 10, 30, 20])).toBe(25);
    expect(medianOf(new Float32Array([5, 1, 9, 0, 0]), 3)).toBe(5);
  });
});
