import {
  cameraRateFps,
  createFrameIntervalLog,
  createLagLog,
  frameIntervalMs,
  frameLagMs,
  type LagLog,
  type MedianLog,
} from '@coverscape/shared';
import { medianOf } from './syncRules';

/**
 * The recorded picture when it has to be redrawn (Q6). Every camera frame is drawn upright onto a canvas of the
 * picture's own shape (vertical when the phone is held upright, horizontal when it's turned), and that canvas is
 * the video track that gets recorded.
 *
 * P19 · It is not the preview: the live <video> is (the browser composites it without the page, so a busy main
 * thread never holds the picture up), with a digital zoom shown as the same centre crop in CSS. The canvas only
 * draws while something records it, and goes on screen only when a turned phone made the recorded frame differ
 * from the live one. A 1:1 copy is drawn without filtering (the cheapest draw); a zoom is resampled in high quality.
 *
 * Drawing it ourselves is what allows a digital zoom on lenses without a browser zoom, flipping the camera or
 * turning the phone between parts of a take, and upright files on browsers that save them on their side. When
 * none of that is needed the recorder takes the camera's own picture instead (Q5, see RecordStudio).
 *
 * Q6: a frame is drawn when the camera delivers one (requestVideoFrameCallback), not on every screen refresh, and
 * pushed to the recording right then (captureStream(0) + requestFrame): no duplicated or skipped frames, at 30 or
 * 60 fps alike, at the camera's full resolution, scaled with high-quality smoothing.
 */
export interface Compositor {
  canvas: HTMLCanvasElement;
  /** Digital zoom (crop of the centre), 1 = the whole picture. */
  setZoom(zoom: number): void;
  /** The camera's frame rate (only paces the fallback loop on browsers without frame callbacks). */
  setFps(fps: number): void;
  /** Keep the frame's size for the whole take; a turned phone or another lens fits inside it. */
  lock(locked: boolean): void;
  /** Stop drawing while nobody looks (a take under review, or a direct recording that doesn't need it). */
  freeze(frozen: boolean): void;
  /** The canvas as a recordable video stream: one recorded frame per drawn frame. */
  stream(): MediaStream;
  /** Frames drawn so far and frames the camera delivered (R4). */
  counts(): { drawn: number; delivered: number };
  /**
   * 43 · Median time from a camera frame's capture to its drawing (ms) over the last frames drawn: a canvas take
   * stamps each frame when drawn, this much after the camera's own stamp. Null where the browser gives no capture
   * times (or nothing was drawn since drawing resumed).
   */
  drawLagMs(): number | null;
  dispose(): void;
}

type CapturableCanvas = HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };
type FrameTrack = MediaStreamTrack & { requestFrame?: () => void };
type FrameMeta = { presentedFrames: number; captureTime?: number; expectedDisplayTime?: number };
type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: FrameMeta) => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

/** Long side cap: the camera's own size up to 4K (Q3); beyond that the browser can't encode anyway. */
const MAX_LONG = 3840;
/** 43 · Draw lags kept (the last ones before a take starts say how late its frames are stamped). */
const DRAW_LAGS = 64;
/** Fallback pacing: the screen refreshes at 60–120 Hz, the camera at 30 or 60. */
const frameGap = (fps: number) => 1000 / (fps + 2);
/** No camera frame for this long while drawing per frame: the source stopped being presented, pace by the screen. */
const STALL_MS = 250;

/** The canvas size for a camera picture: its own, up to 4K on the long side, in even numbers (encoders want them). */
export function canvasSize(sw: number, sh: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_LONG / Math.max(sw, sh));
  return { width: Math.round(sw * scale) & ~1, height: Math.round(sh * scale) & ~1 };
}

/**
 * R4 · Counts frames only while a take is rolling (pauses don't count): `read` gives an ever-growing frame count
 * (frames drawn on the canvas, or frames the camera presented for a direct recording).
 */
export function createFrameMeter(read: () => number) {
  let total = 0;
  let from: number | null = null;
  return {
    run() {
      if (from == null) from = read();
    },
    hold() {
      if (from == null) return;
      total += read() - from;
      from = null;
    },
    value: () => total + (from != null ? read() - from : 0),
  };
}
export type FrameMeter = ReturnType<typeof createFrameMeter>;

export interface FrameWatch {
  /** Frames presented so far. */
  count(): number;
  /** Of those, frames the page's callbacks missed (jumps in `presentedFrames`) while sampling. */
  missed(): number;
  /** P19 review · Camera → screen delays seen while sampling (empty where the browser doesn't tell them). */
  lag: LagLog;
  /** Time between camera frames while sampling (from `captureTime`): the camera's real rate. */
  intervals: MedianLog;
  /** The camera's real rate from `intervals` (null when the browser gives no capture times, or too few). */
  cameraFps(): number | null;
  /** Collect delays, intervals and missed frames or not (off during a take's pauses). */
  sampleLag(on: boolean): void;
  stop(): void;
}

/** Frames the camera presents to the page (a direct recording records exactly those), and how late they show. */
export function watchPresentedFrames(source: HTMLVideoElement): FrameWatch {
  const video = source as FrameVideo;
  let count = 0;
  let missed = 0;
  let last: number | null = null;
  /** The previous frame seen while sampling (reset by a pause: its interval would span it). */
  let prev: { presentedFrames: number; captureTime?: number } | null = null;
  let handle = 0;
  let stopped = false;
  let sampling = true;
  const lag = createLagLog();
  const intervals = createFrameIntervalLog();
  const cameraFps = () => cameraRateFps(intervals);
  if (typeof video.requestVideoFrameCallback !== 'function')
    return { count: () => 0, missed: () => 0, lag, intervals, cameraFps, sampleLag: () => undefined, stop: () => undefined };
  const tick = (_now: number, meta: FrameMeta) => {
    if (stopped) return;
    count += last == null ? 1 : Math.max(1, meta.presentedFrames - last);
    last = meta.presentedFrames;
    if (sampling) {
      const ms = frameLagMs(meta);
      if (ms != null) lag.add(ms);
      if (prev) {
        missed += Math.max(0, meta.presentedFrames - prev.presentedFrames - 1);
        const gap = frameIntervalMs(prev, meta);
        if (gap != null) intervals.add(gap);
      }
      if (!prev) prev = { presentedFrames: 0 };
      prev.presentedFrames = meta.presentedFrames;
      prev.captureTime = meta.captureTime;
    }
    handle = video.requestVideoFrameCallback!(tick);
  };
  handle = video.requestVideoFrameCallback(tick);
  return {
    count: () => count,
    missed: () => missed,
    lag,
    intervals,
    cameraFps,
    sampleLag(on) {
      sampling = on;
      prev = null;
    },
    stop() {
      stopped = true;
      video.cancelVideoFrameCallback?.(handle);
    },
  };
}

export function canRecordCanvas(): boolean {
  return typeof (document.createElement('canvas') as CapturableCanvas).captureStream === 'function';
}

export function createCompositor(source: HTMLVideoElement): Compositor {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  // Hidden until it holds a real frame (the live camera underneath shows meanwhile).
  canvas.style.opacity = '0';
  const ctx = canvas.getContext('2d', { alpha: false });
  const video = source as FrameVideo;
  /**
   * Frame callbacks when the browser has them. A source that isn't presented (hidden, on some browsers) never calls
   * back: when frames stop coming for STALL_MS, at any moment and not only at the start, the screen-refresh loop
   * takes over, drawing only frames the camera really changed, and goes back to the frame callbacks as soon as one
   * answers (a frame callback stays asked for meanwhile).
   */
  const canPerFrame = typeof video.requestVideoFrameCallback === 'function';
  let perFrame = canPerFrame;
  let lastFrameAt = 0;
  let watchdog: ReturnType<typeof setInterval> | undefined;
  let zoom = 1;
  let locked = false;
  let frozen = false;
  let disposed = false;
  let handle = 0;
  let last = 0;
  let gap = frameGap(30);
  let drawn = 0;
  let delivered = 0;
  let presentedAt: number | null = null;
  let track: FrameTrack | null = null;
  /** 43 · Ring of capture → draw delays (nothing allocated per frame). */
  const drawLags = new Float32Array(DRAW_LAGS);
  let drawLagCount = 0;
  let drawLagAt = 0;

  const draw = (captureTime?: number) => {
    const sw = source.videoWidth;
    const sh = source.videoHeight;
    if (!ctx || !sw || !sh || source.readyState < 2) return;
    if (!locked) {
      const { width: w, height: h } = canvasSize(sw, sh);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }
    // The whole picture (or its zoomed centre), fitted in; bars only when the shape changed mid-take.
    const cw = sw / zoom;
    const ch = sh / zoom;
    const fit = Math.min(canvas.width / cw, canvas.height / ch);
    const dw = cw * fit;
    const dh = ch * fit;
    if (dw < canvas.width - 1 || dh < canvas.height - 1) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    // P19 · A 1:1 copy needs no filtering (the cheapest draw); only a zoom or a refit is resampled, and well.
    const scaled = Math.abs(dw - cw) > 0.5 || Math.abs(dh - ch) > 0.5;
    if (ctx.imageSmoothingEnabled !== scaled) ctx.imageSmoothingEnabled = scaled;
    if (scaled && ctx.imageSmoothingQuality !== 'high') ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    if (drawn === 0) canvas.style.opacity = '';
    drawn++;
    if (typeof captureTime === 'number' && captureTime > 0) {
      const lag = performance.now() - captureTime;
      if (lag >= 0 && lag < 2000) {
        drawLags[drawLagAt] = lag;
        drawLagAt = (drawLagAt + 1) % DRAW_LAGS;
        if (drawLagCount < DRAW_LAGS) drawLagCount++;
      }
    }
    try {
      track?.requestFrame?.();
    } catch {
      track = null; // the recording's track was stopped
    }
  };

  const onVideoFrame = (_now: number, meta: FrameMeta) => {
    handle = 0;
    lastFrameAt = performance.now();
    if (disposed || frozen) return;
    handle = video.requestVideoFrameCallback!(onVideoFrame);
    // presentedFrames jumps by more than one when the page missed frames (busy main thread).
    delivered += presentedAt == null ? 1 : Math.max(1, meta.presentedFrames - presentedAt);
    presentedAt = meta.presentedFrames;
    draw(meta.captureTime);
  };

  /**
   * Screen loop · whether the camera has a new frame since the last draw, from the element's own frame counter:
   * true (draw), false (the same frame: drawing it again would only duplicate it in the take), or null (no counter
   * that moves here: draw on the screen's pace as before).
   */
  let shownFrames: number | null = null;
  let shownSince = 0;
  let counterMoved = false;
  let counterUseful = true;
  const newFrames = (now: number): number | null => {
    if (!counterUseful) return null;
    const q = video.getVideoPlaybackQuality?.().totalVideoFrames;
    if (typeof q !== 'number' || !(q > 0)) return null;
    if (shownFrames == null || q < shownFrames) {
      // A first look at the counter (after a stall, the frame callbacks drew the current frame already) says nothing
      // new: wait for it to move rather than draw that frame twice; only a canvas still empty draws at once. A counter
      // that went back (a camera reopened) is a new frame.
      const first = shownFrames == null;
      shownFrames = q;
      shownSince = now;
      return first && drawn > 0 ? 0 : 1;
    }
    if (q === shownFrames) {
      // A counter that never moves for a camera stream (some browsers) would freeze the canvas: stop trusting it.
      if (!counterMoved && now - shownSince > STALL_MS && source.readyState >= 2) counterUseful = false;
      return counterUseful ? 0 : null;
    }
    counterMoved = true;
    const fresh = q - shownFrames;
    shownFrames = q;
    shownSince = now;
    return fresh;
  };

  const onAnimationFrame = (now: number) => {
    handle = 0;
    if (disposed || frozen) return;
    handle = requestAnimationFrame(onAnimationFrame);
    if (now - last < gap) return;
    const fresh = newFrames(now);
    if (fresh === 0) return;
    last = now;
    delivered += fresh ?? 1;
    draw();
  };

  /**
   * While on the screen's loop a frame callback stays asked for: as soon as the camera is presented again (a flash
   * or a lens that reconfigured the camera, a camera reopening), drawing goes back to one per camera frame.
   */
  let probe = 0;
  const onProbe = (now: number, meta: FrameMeta) => {
    probe = 0;
    if (disposed || frozen || perFrame) return;
    if (handle) cancelAnimationFrame(handle);
    handle = 0;
    perFrame = true;
    presentedAt = null;
    watch();
    onVideoFrame(now, meta);
  };

  const schedule = () => {
    if (handle || disposed || frozen) return;
    presentedAt = null;
    // 43 · Lags from before a pause or a stall would describe another moment.
    drawLagCount = 0;
    drawLagAt = 0;
    if (perFrame) {
      handle = video.requestVideoFrameCallback!(onVideoFrame);
      watch();
      return;
    }
    shownFrames = null;
    counterMoved = false;
    counterUseful = true;
    handle = requestAnimationFrame(onAnimationFrame);
    if (canPerFrame && !probe) probe = video.requestVideoFrameCallback!(onProbe);
  };
  const unschedule = () => {
    if (probe) video.cancelVideoFrameCallback?.(probe);
    probe = 0;
    if (!handle) return;
    if (perFrame) video.cancelVideoFrameCallback?.(handle);
    else cancelAnimationFrame(handle);
    handle = 0;
  };
  /** Armed for as long as frames are drawn per frame: frames that stop coming switch to the screen's loop. */
  const watch = () => {
    clearInterval(watchdog);
    lastFrameAt = performance.now();
    watchdog = setInterval(() => {
      if (disposed || frozen || !perFrame) {
        clearInterval(watchdog);
        return;
      }
      // A camera still opening (or reopening) has nothing to present yet: not a stall.
      if (source.readyState < 2) {
        lastFrameAt = performance.now();
        return;
      }
      if (performance.now() - lastFrameAt < STALL_MS) return;
      clearInterval(watchdog);
      unschedule();
      perFrame = false;
      schedule();
    }, STALL_MS / 2);
  };
  schedule();

  return {
    canvas,
    setZoom(next) {
      zoom = Math.max(1, next);
    },
    setFps(fps) {
      gap = frameGap(fps > 0 ? fps : 30);
    },
    lock(next) {
      locked = next;
    },
    freeze(next) {
      if (next === frozen) return;
      frozen = next;
      if (frozen) {
        unschedule();
        clearInterval(watchdog);
      } else {
        // Drawing again: the frame callbacks get another chance (the source may be presented again).
        perFrame = canPerFrame;
        schedule();
      }
    },
    stream() {
      const capture = (canvas as CapturableCanvas).captureStream;
      if (!capture) throw new Error('canvas capture not supported');
      // 0 = a frame only when we say so (requestFrame); without requestFrame, let the browser sample.
      const probe = capture.call(canvas, 0);
      const t = probe.getVideoTracks()[0] as FrameTrack | undefined;
      if (t && typeof t.requestFrame === 'function') {
        track = t;
        t.addEventListener('ended', () => {
          if (track === t) track = null;
        });
        return probe;
      }
      probe.getTracks().forEach((x) => x.stop());
      return capture.call(canvas);
    },
    counts: () => ({ drawn, delivered }),
    drawLagMs: () => medianOf(drawLags, drawLagCount),
    dispose() {
      disposed = true;
      clearInterval(watchdog);
      unschedule();
      track = null;
    },
  };
}
