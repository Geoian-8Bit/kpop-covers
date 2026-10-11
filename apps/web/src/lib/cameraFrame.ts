/**
 * The camera picture exactly as the phone shows it, ready to record — like the camera app, nothing is
 * cropped. Browsers rotate the camera to how the phone is held when you draw its <video>, but the
 * recorded file doesn't always carry that rotation (iOS can save MP4s lying on their side). So every
 * frame is drawn upright onto a canvas of the same shape as the picture, and the canvas is both the
 * preview on screen and the video track that gets recorded: what you see is exactly what you get.
 *
 * Phones whose camera has no zoom control in the browser (iPhone) zoom digitally here instead.
 */
export interface CameraFrame {
  canvas: HTMLCanvasElement;
  /** Digital zoom, 1 = the whole picture. */
  setZoom(zoom: number): void;
  /** Keep the frame's size for the whole take; turning the phone mid-take letterboxes instead. */
  lock(locked: boolean): void;
  /** The canvas as a video track to record. */
  captureStream(fps?: number): MediaStream;
  dispose(): void;
}

type CapturableCanvas = HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };

/** Long side cap: 1080p is plenty for a dance video and keeps the per-frame copy cheap. */
const MAX_LONG = 1920;

export function createCameraFrame(source: HTMLVideoElement): CameraFrame {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  let zoom = 1;
  let locked = false;
  let frame = 0;
  let disposed = false;

  const draw = () => {
    frame = 0;
    if (disposed) return;
    const sw = source.videoWidth;
    const sh = source.videoHeight;
    if (ctx && sw && sh && source.readyState >= 2) {
      if (!locked) {
        // Same shape as the picture, scaled down only if it is larger than 1080p.
        const scale = Math.min(1, MAX_LONG / Math.max(sw, sh));
        const w = Math.round(sw * scale) & ~1;
        const h = Math.round(sh * scale) & ~1;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
      }
      // Whole picture (or its zoomed centre), fitted into the canvas; bars only if the phone turned mid-take.
      const cw = sw / zoom;
      const ch = sh / zoom;
      const fit = Math.min(canvas.width / cw, canvas.height / ch);
      const dw = cw * fit;
      const dh = ch * fit;
      if (dw < canvas.width || dh < canvas.height) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    }
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);

  return {
    canvas,
    setZoom(next) {
      zoom = Math.max(1, next);
    },
    lock(next) {
      locked = next;
    },
    captureStream(fps = 30) {
      const capture = (canvas as CapturableCanvas).captureStream;
      if (!capture) throw new Error('canvas capture not supported');
      return capture.call(canvas, fps);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
    },
  };
}
