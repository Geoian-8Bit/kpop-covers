/**
 * Turns the live camera into the exact frame we record, like a phone's camera app: portrait when the
 * phone is upright, landscape when it's on its side, whatever orientation the camera itself delivers.
 * Each frame is centre-cropped from the camera onto a 9:16 (or 16:9) canvas, optionally zoomed in
 * digitally (for phones whose camera has no zoom control, e.g. iPhone in a browser); the canvas is both
 * the preview on screen and the video track that gets recorded, so what you see is what you get.
 */
export interface CameraFrame {
  canvas: HTMLCanvasElement;
  /** Portrait (9:16) or landscape (16:9). Ignored while locked (recording). */
  setPortrait(portrait: boolean): void;
  /** Digital zoom, 1 = the whole frame. */
  setZoom(zoom: number): void;
  /** Keep size and orientation fixed while a take is being recorded. */
  lock(locked: boolean): void;
  /** The canvas as a video track to record. */
  captureStream(fps?: number): MediaStream;
  dispose(): void;
}

type CapturableCanvas = HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };

export function createCameraFrame(source: HTMLVideoElement, portrait: boolean): CameraFrame {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  let wantPortrait = portrait;
  let zoom = 1;
  let locked = false;
  let frame = 0;
  let disposed = false;

  /** Short side follows the camera (never upscaled past it), capped at 1080 p. */
  const fit = () => {
    if (locked) return;
    const sw = source.videoWidth;
    const sh = source.videoHeight;
    if (!sw || !sh) return;
    const short = Math.min(1080, Math.min(sw, sh)) & ~1;
    const long = Math.round((short * 16) / 9) & ~1;
    const w = wantPortrait ? short : long;
    const h = wantPortrait ? long : short;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  const draw = () => {
    frame = 0;
    if (disposed) return;
    fit();
    const sw = source.videoWidth;
    const sh = source.videoHeight;
    if (ctx && sw && sh && canvas.width && source.readyState >= 2) {
      // Largest centred crop of the camera with the canvas's shape, shrunk further by the zoom.
      const target = canvas.width / canvas.height;
      let cw = sw;
      let ch = sw / target;
      if (ch > sh) {
        ch = sh;
        cw = sh * target;
      }
      cw /= zoom;
      ch /= zoom;
      ctx.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, canvas.width, canvas.height);
    }
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);

  return {
    canvas,
    setPortrait(next) {
      wantPortrait = next;
    },
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
