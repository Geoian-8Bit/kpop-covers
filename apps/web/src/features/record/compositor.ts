/**
 * The recorded picture when it has to be redrawn (Q6). Every camera frame is drawn upright onto a canvas of the
 * picture's own shape (vertical when the phone is held upright, horizontal when it's turned), and that canvas is
 * both the preview and the video track that gets recorded: what you see is exactly what you get.
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
  dispose(): void;
}

type CapturableCanvas = HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };
type FrameTrack = MediaStreamTrack & { requestFrame?: () => void };
type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { presentedFrames: number }) => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

/** Long side cap: the camera's own size up to 4K (Q3); beyond that the browser can't encode anyway. */
const MAX_LONG = 3840;
/** Fallback pacing: the screen refreshes at 60–120 Hz, the camera at 30 or 60. */
const frameGap = (fps: number) => 1000 / (fps + 2);

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

/** Frames the camera presents to the page (a direct recording records exactly those). */
export function watchPresentedFrames(source: HTMLVideoElement): { count(): number; stop(): void } {
  const video = source as FrameVideo;
  let count = 0;
  let last: number | null = null;
  let handle = 0;
  let stopped = false;
  if (typeof video.requestVideoFrameCallback !== 'function') return { count: () => 0, stop: () => undefined };
  const tick = (_now: number, meta: { presentedFrames: number }) => {
    if (stopped) return;
    count += last == null ? 1 : Math.max(1, meta.presentedFrames - last);
    last = meta.presentedFrames;
    handle = video.requestVideoFrameCallback!(tick);
  };
  handle = video.requestVideoFrameCallback(tick);
  return {
    count: () => count,
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
  if (ctx) ctx.imageSmoothingQuality = 'high';
  const video = source as FrameVideo;
  /** Frame callbacks when the browser has them; dropped for the screen-refresh loop if they never fire. */
  let perFrame = typeof video.requestVideoFrameCallback === 'function';
  let heardFrame = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
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

  const draw = () => {
    const sw = source.videoWidth;
    const sh = source.videoHeight;
    if (!ctx || !sw || !sh || source.readyState < 2) return;
    if (!locked) {
      const scale = Math.min(1, MAX_LONG / Math.max(sw, sh));
      const w = Math.round(sw * scale) & ~1;
      const h = Math.round(sh * scale) & ~1;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        ctx.imageSmoothingQuality = 'high';
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
    ctx.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    if (drawn === 0) canvas.style.opacity = '';
    drawn++;
    try {
      track?.requestFrame?.();
    } catch {
      track = null; // the recording's track was stopped
    }
  };

  const onVideoFrame = (_now: number, meta: { presentedFrames: number }) => {
    handle = 0;
    heardFrame = true;
    if (disposed || frozen) return;
    handle = video.requestVideoFrameCallback!(onVideoFrame);
    // presentedFrames jumps by more than one when the page missed frames (busy main thread).
    delivered += presentedAt == null ? 1 : Math.max(1, meta.presentedFrames - presentedAt);
    presentedAt = meta.presentedFrames;
    draw();
  };

  const onAnimationFrame = (now: number) => {
    handle = 0;
    if (disposed || frozen) return;
    handle = requestAnimationFrame(onAnimationFrame);
    if (now - last < gap) return;
    last = now;
    delivered++;
    draw();
  };

  const schedule = () => {
    if (handle || disposed || frozen) return;
    presentedAt = null;
    handle = perFrame ? video.requestVideoFrameCallback!(onVideoFrame) : requestAnimationFrame(onAnimationFrame);
    // A hidden source may never be "presented" on some browsers: then pace by the screen instead.
    if (perFrame && !heardFrame) {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        if (heardFrame || disposed || frozen || source.readyState < 2) return;
        unschedule();
        perFrame = false;
        schedule();
      }, 1000);
    }
  };
  const unschedule = () => {
    if (!handle) return;
    if (perFrame) video.cancelVideoFrameCallback?.(handle);
    else cancelAnimationFrame(handle);
    handle = 0;
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
      frozen = next;
      if (frozen) unschedule();
      else schedule();
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
    dispose() {
      disposed = true;
      clearTimeout(watchdog);
      unschedule();
      track = null;
    },
  };
}
