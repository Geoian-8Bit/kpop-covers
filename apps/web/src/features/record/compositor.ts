/**
 * The recorded picture. Every camera frame is drawn upright onto a canvas of the picture's own shape
 * (vertical when the phone is held upright, horizontal when it's turned), and that canvas is both the
 * preview and the video track that gets recorded: what you see is exactly what you get.
 *
 * Drawing it ourselves also fixes what browsers get wrong when recording a camera directly: iPhones
 * can save MP4s lying on their side, lenses without a browser zoom get a digital one here, and the
 * camera can be flipped between parts of a take without the recording noticing.
 */
export interface Compositor {
  canvas: HTMLCanvasElement;
  /** Digital zoom (crop of the centre), 1 = the whole picture. */
  setZoom(zoom: number): void;
  /** Keep the frame's size for the whole take; a turned phone or another lens fits inside it. */
  lock(locked: boolean): void;
  /** Stop drawing while nobody looks (a take under review). */
  freeze(frozen: boolean): void;
  /** The canvas as a recordable video stream. */
  stream(fps: number): MediaStream;
  dispose(): void;
}

type CapturableCanvas = HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };

/** Long side cap: 1080p is plenty for a dance video and keeps the per-frame copy cheap on phones. */
const MAX_LONG = 1920;
/** Draw at most this often: the camera gives ~30 fps, the screen refreshes at 60–120 Hz. */
const FRAME_MS = 1000 / 32;

export function canRecordCanvas(): boolean {
  return typeof (document.createElement('canvas') as CapturableCanvas).captureStream === 'function';
}

export function createCompositor(source: HTMLVideoElement): Compositor {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('2d', { alpha: false });
  let zoom = 1;
  let locked = false;
  let frozen = false;
  let disposed = false;
  let raf = 0;
  let last = 0;

  const draw = (now: number) => {
    raf = 0;
    if (disposed || frozen) return;
    raf = requestAnimationFrame(draw);
    if (now - last < FRAME_MS) return;
    const sw = source.videoWidth;
    const sh = source.videoHeight;
    if (!ctx || !sw || !sh || source.readyState < 2) return;
    last = now;
    if (!locked) {
      const scale = Math.min(1, MAX_LONG / Math.max(sw, sh));
      const w = Math.round(sw * scale) & ~1;
      const h = Math.round(sh * scale) & ~1;
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
    ctx.drawImage(
      source,
      (sw - cw) / 2,
      (sh - ch) / 2,
      cw,
      ch,
      (canvas.width - dw) / 2,
      (canvas.height - dh) / 2,
      dw,
      dh,
    );
  };
  raf = requestAnimationFrame(draw);

  return {
    canvas,
    setZoom(next) {
      zoom = Math.max(1, next);
    },
    lock(next) {
      locked = next;
    },
    freeze(next) {
      frozen = next;
      if (!frozen && !disposed && !raf) raf = requestAnimationFrame(draw);
    },
    stream(fps) {
      const capture = (canvas as CapturableCanvas).captureStream;
      if (!capture) throw new Error('canvas capture not supported');
      return capture.call(canvas, fps);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
    },
  };
}
