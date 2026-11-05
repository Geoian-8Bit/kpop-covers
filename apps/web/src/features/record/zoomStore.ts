import { create } from 'zustand';

/**
 * REQ-23 · The camera's zoom, apart from the rest of the camera's state: a pinch changes it every frame, and only what
 * shows it reads it (the live <video>'s transform, the zoom chip's number, the «i» panel). The recorder itself
 * re-renders only when what it draws changes (a digital crop starting or ending, another chip becoming the active one).
 */
export interface CameraZoom {
  /** Zoom as the phone's camera app shows it: 0.5 is the ultra-wide, 1 the main lens. */
  zoom: number;
  /** P19 · The digital crop (1 = the whole frame): the preview shows it with CSS, the canvas records it. */
  crop: number;
  /** Bumped when a lens zoom has been applied to the camera (the «i» panel reads the track again then). */
  applied: number;
}

export const ZOOM_INITIAL = { zoom: 1, crop: 1 } as const;

export const useCameraZoom = create<CameraZoom>(() => ({ ...ZOOM_INITIAL, applied: 0 }));

/**
 * REQ-23 · A lens zoom pinched every frame asks the camera for at most one change at a time: while one is in flight
 * the newest value waits (older ones are dropped), and it is applied as soon as the camera answers. The last value
 * asked for is always the one that lands.
 */
export function createZoomApplier(
  apply: (track: MediaStreamTrack | undefined, zoom: number) => Promise<unknown>,
  onApplied?: () => void,
) {
  let running = false;
  let next: { track: MediaStreamTrack | undefined; zoom: number } | null = null;
  const run = (job: { track: MediaStreamTrack | undefined; zoom: number }) => {
    running = true;
    let asked: Promise<unknown>;
    try {
      asked = Promise.resolve(apply(job.track, job.zoom));
    } catch {
      asked = Promise.resolve();
    }
    void asked
      .catch(() => undefined)
      .then(() => {
        running = false;
        onApplied?.();
        const queued = next;
        next = null;
        if (queued) run(queued);
      });
  };
  return (track: MediaStreamTrack | undefined, zoom: number) => {
    if (running) {
      next = { track, zoom };
      return;
    }
    run({ track, zoom });
  };
}
