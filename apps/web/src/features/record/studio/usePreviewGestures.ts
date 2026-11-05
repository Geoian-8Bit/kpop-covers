import { useRef } from 'react';
import { canLock } from '../camera';
import { preloadQuickExposure } from './lazyPanels';
import type { ImageApi } from './useImageControls';
import type { Studio } from './useStudioSession';

/** Pinch zooms (as before); a tap focuses there (C1); a long press holds focus and light (C2). */
export function usePreviewGestures(S: Studio, img: ImageApi) {
  const { fx, cam, view, phase, setQuickLight } = S;
  const { trackInfo, focusHere } = img;
  const press = useRef<{
    id: number;
    x: number;
    y: number;
    at: number;
    multi: boolean;
    moved: boolean;
    held: boolean;
    timer?: ReturnType<typeof setTimeout>;
  } | null>(null);
  const tapEnabled =
    view.status === 'ready' && (phase === 'idle' || phase === 'paused' || phase === 'recording');
  return {
    onPointerDown: (e: React.PointerEvent) => {
      cam.pinchHandlers.onPointerDown(e);
      const p = press.current;
      if (p) {
        // A second finger: a pinch is coming (zoom), which a rehearsal must not measure.
        fx.stopBench();
        // The quick light bar would sit under the fingers: it goes until the next tap.
        if (!p.multi) setQuickLight(null);
        p.multi = true;
        clearTimeout(p.timer);
        return;
      }
      if (!tapEnabled) return;
      // REQ-23 · A tap may bring up the quick light bar: fetch it as the finger lands.
      preloadQuickExposure();
      const next: NonNullable<typeof press.current> = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        at: performance.now(),
        multi: false,
        moved: false,
        held: false,
      };
      press.current = next;
      if (trackInfo && canLock(trackInfo)) {
        next.timer = setTimeout(() => {
          if (press.current !== next || next.multi || next.moved) return;
          next.held = true;
          focusHere(next.x, next.y, true);
        }, 650);
      }
    },
    onPointerMove: (e: React.PointerEvent) => {
      cam.pinchHandlers.onPointerMove(e);
      const p = press.current;
      if (p && p.id === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) {
        p.moved = true;
        clearTimeout(p.timer);
      }
    },
    onPointerUp: (e: React.PointerEvent) => {
      cam.pinchHandlers.onPointerUp(e);
      const p = press.current;
      if (!p) return;
      if (p.id === e.pointerId) {
        clearTimeout(p.timer);
        if (!p.multi && !p.moved && !p.held && performance.now() - p.at < 500)
          focusHere(e.clientX, e.clientY, false);
      }
      if (cam.pinchHandlers.pointerCount() === 0) press.current = null;
    },
    onPointerCancel: (e: React.PointerEvent) => {
      cam.pinchHandlers.onPointerUp(e);
      clearTimeout(press.current?.timer);
      if (cam.pinchHandlers.pointerCount() === 0) press.current = null;
    },
  };
}

export type PreviewHandlers = ReturnType<typeof usePreviewGestures>;
