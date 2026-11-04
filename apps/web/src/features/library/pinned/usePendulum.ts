import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  replayHidden,
  stepPendulum,
  subscribeTick,
  wake,
  type Pendulum,
  type PendingImpulse,
  type PendulumConfig,
} from '@/lib/hanging';

// REQ-27 · Split out of PinnedClips.tsx: drag-to-swing and the pendulum every hanging item runs on.

/** Watches whether a hanging item is on screen (or one item away); `onChange` gets true / false. */
export interface HangingView {
  observe: (el: Element, onChange: (visible: boolean) => void) => () => void;
}
export const HangingViewContext = createContext<HangingView | null>(null);

/**
 * REQ-22 · One IntersectionObserver for the whole row (root: the sideways scroller, one item of margin each side):
 * only the items in view respond to the rail's nudges, tick and keep their own layer. Items register before the
 * row's effect creates the observer (children's effects run first), so they wait in the map until then.
 */
export function useHangingView(
  root: RefObject<HTMLElement | null>,
  marginPx: number,
  deps: unknown,
): HangingView {
  const watched = useRef(new Map<Element, (visible: boolean) => void>());
  const io = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) watched.current.get(entry.target)?.(entry.isIntersecting);
      },
      { root: el, rootMargin: `0px ${marginPx}px` },
    );
    io.current = observer;
    for (const target of watched.current.keys()) observer.observe(target);
    return () => {
      observer.disconnect();
      io.current = null;
    };
  }, [root, marginPx, deps]);
  return useMemo(
    () => ({
      observe(el, onChange) {
        watched.current.set(el, onChange);
        io.current?.observe(el);
        return () => {
          watched.current.delete(el);
          io.current?.unobserve(el);
        };
      },
    }),
    [],
  );
}

interface GrabHandlers {
  /** Pointer pressed and moved past the tap threshold (client coordinates of the press). */
  onGrab: (x: number, y: number) => void;
  onDrag: (x: number, y: number) => void;
  onRelease: () => void;
  /** A mouse brushing past without pressing; `dx` is the horizontal movement. */
  onBrush?: (dx: number) => void;
}

/**
 * Drag-to-swing on top of a link: a press that moves more than a few pixels becomes a grab and the
 * following click is swallowed; a plain tap still opens the clip. Items use `touch-action: pan-y`,
 * so on phones a sideways drag grabs the item at once while an up/down drag still scrolls the page.
 */
export function useGrab(h: GrabHandlers) {
  const handlers = useRef(h);
  handlers.current = h;
  const s = useRef({ down: false, moved: false, sx: 0, sy: 0 });
  return {
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      if (e.button > 0) return;
      s.current = { down: true, moved: false, sx: e.clientX, sy: e.clientY };
    },
    onPointerMove(e: ReactPointerEvent<HTMLElement>) {
      const st = s.current;
      if (!st.down) {
        if (e.pointerType === 'mouse') handlers.current.onBrush?.(e.movementX);
        return;
      }
      if (!st.moved) {
        if (Math.hypot(e.clientX - st.sx, e.clientY - st.sy) < 6) return;
        st.moved = true;
        handlers.current.onGrab(st.sx, st.sy);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already gone; the drag still works while it stays over the item */
        }
      }
      handlers.current.onDrag(e.clientX, e.clientY);
    },
    onPointerUp(e: ReactPointerEvent<HTMLElement>) {
      s.current.down = false;
      if (s.current.moved) {
        handlers.current.onRelease();
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    onPointerCancel() {
      if (s.current.moved) handlers.current.onRelease();
      s.current.down = false;
      s.current.moved = false;
    },
    onClickCapture(e: React.MouseEvent) {
      if (s.current.moved) {
        e.preventDefault();
        e.stopPropagation();
        s.current.moved = false;
      }
    },
    // A long press on a link would open the system preview / context menu.
    onContextMenu(e: React.MouseEvent) {
      if (s.current.down) e.preventDefault();
    },
  };
}

export const HANGING = 'relative touch-pan-y select-none [-webkit-touch-callout:none]';

/**
 * A rigid body hanging from `pivot` (px inside `wrap`): the pointer pulls it towards its angle and
 * releasing lets it swing back under gravity. `onFrame` runs after each step for attached effects and
 * returns whether they are still moving; `draw` is false while the time spent off screen is replayed (nothing is
 * written to the DOM then).
 */
export function usePendulum(
  wrap: RefObject<HTMLDivElement | null>,
  body: RefObject<HTMLDivElement | null>,
  pivot: { x: number; y: number },
  cfg: PendulumConfig,
  onFrame?: (p: Pendulum, dt: number, draw: boolean) => boolean,
) {
  const p = useRef<Pendulum>({ theta: 0, omega: 0, target: null });
  /**
   * At rest with everything attached settled: frames skip all work (the loop may still be running for
   * another item) until a nudge, the breeze or the pointer disturbs it again.
   */
  const asleep = useRef(false);
  const frameCb = useRef(onFrame);
  frameCb.current = onFrame;
  // REQ-22 · Off screen (as the row's observer says) the item neither ticks nor takes nudges: they wait here with
  // their time and are replayed when it comes back into view, so it never shows still when it should be swinging.
  const view = useContext(HangingViewContext);
  const visible = useRef(true);
  const pending = useRef<PendingImpulse[]>([]);
  const lastTick = useRef(0);
  const advance = useRef<(dt: number, draw: boolean) => boolean>(() => false);

  useEffect(() => {
    let shown = Number.NaN;
    asleep.current = false;
    advance.current = (dt, draw) => {
      const st = p.current;
      const moving = stepPendulum(st, cfg, dt);
      if (draw && body.current && st.theta !== shown) {
        shown = st.theta;
        body.current.style.transform = `rotate(${(-st.theta).toFixed(4)}rad)`;
      }
      const attached = frameCb.current?.(st, dt, draw) ?? false;
      return moving || attached;
    };
    return subscribeTick(
      (dt) => {
        if (asleep.current || !visible.current) return false;
        lastTick.current = performance.now();
        asleep.current = !advance.current(dt, true);
        return !asleep.current;
      },
      (impulse) => {
        if (!visible.current) {
          pending.current.push({ at: performance.now(), impulse });
          return;
        }
        p.current.omega += impulse;
        asleep.current = false;
      },
    );
  }, [body, cfg]);

  useEffect(() => {
    const el = wrap.current;
    if (!view || !el) return;
    return view.observe(el, (inView) => {
      if (inView === visible.current) return;
      // Its own layer only while it can be seen: the off-screen ones stop holding GPU memory.
      if (body.current) body.current.style.willChange = inView ? 'transform' : '';
      if (!inView) {
        visible.current = false;
        return;
      }
      if (!asleep.current || pending.current.length > 0) {
        const now = performance.now();
        const from = asleep.current ? (pending.current[0]?.at ?? now) : lastTick.current || now;
        replayHidden(
          from,
          now,
          pending.current,
          (impulse) => {
            p.current.omega += impulse;
          },
          (dt) => advance.current(dt, false),
        );
        pending.current = [];
        asleep.current = false;
      }
      visible.current = true;
      wake();
    });
  }, [view, wrap, body]);

  const rouse = () => {
    asleep.current = false;
    wake();
  };

  // The item's box, read once per grab instead of on every pointermove; a scroll (page or row) moves it.
  const rect = useRef<DOMRect | null>(null);
  const untrack = useRef<(() => void) | null>(null);
  const stopTracking = () => {
    untrack.current?.();
    untrack.current = null;
    rect.current = null;
  };
  useEffect(() => stopTracking, []);

  const aim = (x: number, y: number) => {
    const r = (rect.current ??= wrap.current!.getBoundingClientRect());
    const ang = Math.atan2(x - (r.left + pivot.x), Math.max(y - (r.top + pivot.y), 24));
    p.current.target = Math.max(-cfg.maxAngle, Math.min(cfg.maxAngle, ang));
    rouse();
  };
  return useGrab({
    onGrab: (x, y) => {
      stopTracking();
      const stale = () => {
        rect.current = null;
      };
      window.addEventListener('scroll', stale, { capture: true, passive: true });
      untrack.current = () => window.removeEventListener('scroll', stale, { capture: true });
      aim(x, y);
    },
    onDrag: aim,
    onRelease: () => {
      stopTracking();
      p.current.target = null;
      rouse();
    },
    onBrush: (dx) => {
      p.current.omega += dx * 0.012;
      rouse();
    },
  });
}
