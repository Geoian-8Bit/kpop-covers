import { motion, useMotionValue, useReducedMotion } from 'motion/react';
import { Sun } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { soft } from '@/lib/motion';
import {
  exposureFromDrag,
  formatExposure,
  placeQuickBar,
  QUICK_BAR_HEIGHT,
  QUICK_BAR_WIDTH,
  QUICK_HIDE_MS,
  QUICK_TRACK,
  snapExposure,
  sunOffset,
  type Box,
  type ExposureRange,
} from './quickExposureRules';

/** The sun's size; the track is the bar minus it. */
const SUN = QUICK_BAR_HEIGHT - QUICK_TRACK;

/**
 * Where the bar goes for a tap at (`clientX`, `clientY`) on `root` (the studio), in `root`'s own coordinates: beside
 * the focus ring and clear of every control on screen. Read once per tap (never while dragging).
 */
export function quickBarBox(root: HTMLElement, clientX: number, clientY: number): Box {
  const r = root.getBoundingClientRect();
  const big = r.width * r.height * 0.3;
  const obstacles: Box[] = [];
  root.querySelectorAll<HTMLElement>('button, a[href], input, [role="slider"], [role="radio"]').forEach((el) => {
    if (el.closest('[data-quick-light]')) return;
    const b = el.getBoundingClientRect();
    // Hidden, or a layer that covers the screen (not a control to keep clear of).
    if (b.width < 1 || b.height < 1 || b.width * b.height > big) return;
    obstacles.push({ left: b.left - r.left, top: b.top - r.top, width: b.width, height: b.height });
  });
  // Inside the safe area (notch, status bar, home bar), as the rest of the studio.
  const safe = safeInsets(root);
  const bounds = {
    left: safe.left,
    top: safe.top,
    width: Math.max(QUICK_BAR_WIDTH, r.width - safe.left - safe.right),
    height: Math.max(QUICK_BAR_HEIGHT, r.height - safe.top - safe.bottom),
  };
  return placeQuickBar(clientX - r.left, clientY - r.top, bounds, obstacles);
}

/** `env(safe-area-inset-*)` in px, read through a probe (CSS only exposes them to styles). */
function safeInsets(root: HTMLElement): { top: number; right: number; bottom: number; left: number } {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  root.appendChild(probe);
  const s = getComputedStyle(probe);
  const px = (v: string) => Number.parseFloat(v) || 0;
  const out = { top: px(s.paddingTop), right: px(s.paddingRight), bottom: px(s.paddingBottom), left: px(s.paddingLeft) };
  probe.remove();
  return out;
}

/**
 * P49 · Quick light: the panel's «Luz» (exposure compensation) as a small vertical bar beside the focus ring, like
 * the sun of the phone's camera app. Drag along it with the thumb, up is brighter (relative: grabbing it anywhere
 * never jumps). It hides by itself after a few seconds untouched.
 *
 * One source of truth: `value` is the recorder's exposure; a drag sends each new camera step through `onPreview`
 * (the camera only, coalesced) and the final one through `onCommit` (the recorder's state, as the panel does). The
 * sun and its number move straight on the DOM: no React render while dragging.
 */
export function QuickExposure({
  box,
  range,
  value,
  onAdjustStart,
  onPreview,
  onCommit,
  onDismiss,
}: {
  box: Box;
  range: ExposureRange;
  value: number;
  onAdjustStart: () => void;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
  onDismiss: () => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const sunY = useMotionValue(sunOffset(value, range));
  const current = useRef(value);
  const drag = useRef<{ id: number; y0: number; v0: number; sun0: number } | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const handlers = useRef({ onAdjustStart, onPreview, onCommit, onDismiss });
  handlers.current = { onAdjustStart, onPreview, onCommit, onDismiss };
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const step = range.step && range.step > 0 ? range.step : 0.1;

  /**
   * The focus came by keyboard (or a screen reader): then the bar stays while it has it. A tap also focuses it
   * (Chrome on Android): that must not keep it on screen for good.
   */
  const keyboard = useRef(false);
  const armHide = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // Never while it is held or has the keyboard focus (a screen reader needs longer than a few seconds).
      if (drag.current || (keyboard.current && sliderRef.current && sliderRef.current === document.activeElement)) return;
      handlers.current.onDismiss();
    }, QUICK_HIDE_MS);
  }, []);
  // A new tap moves the bar: its few seconds start again.
  useEffect(() => {
    armHide();
    return () => clearTimeout(timer.current);
  }, [box, armHide]);
  // Closed with the focus inside (Esc, a turn, another panel): the focus goes to the shutter, not to the page.
  useEffect(() => {
    const slider = sliderRef.current;
    return () => {
      if (!slider || !slider.contains(document.activeElement)) return;
      const next = document.querySelector<HTMLElement>('[data-record-shutter]:not([disabled])');
      next?.focus({ preventScroll: true });
    };
  }, []);
  // Turned or resized: its place was worked out for the other layout. It goes; the next tap places it again.
  useEffect(() => {
    // Only a real change of layout: the browser bars showing or hiding change the height alone.
    const width = window.innerWidth;
    const away = () => {
      if (window.innerWidth !== width) handlers.current.onDismiss();
    };
    window.addEventListener('resize', away);
    window.addEventListener('orientationchange', away);
    return () => {
      window.removeEventListener('resize', away);
      window.removeEventListener('orientationchange', away);
    };
  }, []);

  const show = useCallback((v: number) => {
    const el = sliderRef.current;
    if (el) {
      el.setAttribute('aria-valuenow', String(v));
      el.setAttribute('aria-valuetext', valueText(v));
    }
    if (labelRef.current) labelRef.current.textContent = formatExposure(v);
  }, []);

  // The value from elsewhere (the panel, a camera that reopened): followed while the bar is not held.
  useEffect(() => {
    if (drag.current) return;
    current.current = value;
    sunY.set(sunOffset(value, range));
    show(value);
  }, [value, range, sunY, show]);

  const setLabelVisible = (on: boolean) => {
    if (labelRef.current) labelRef.current.style.opacity = on ? '1' : '0';
  };

  const end = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    sunY.set(sunOffset(current.current, range));
    setLabelVisible(false);
    handlers.current.onCommit(current.current);
    armHide();
  };

  const nudge = (v: number) => {
    const next = snapExposure(v, range);
    current.current = next;
    sunY.set(sunOffset(next, range));
    show(next);
    handlers.current.onCommit(next);
    armHide();
  };

  return (
    <motion.div
      data-quick-light
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      transition={reduce ? { duration: 0.15 } : soft}
      className="absolute z-30"
      style={{ left: box.left, top: box.top, width: QUICK_BAR_WIDTH, height: QUICK_BAR_HEIGHT }}
    >
      <div
        ref={sliderRef}
        role="slider"
        tabIndex={0}
        aria-label="Luz"
        aria-orientation="vertical"
        aria-valuemin={range.min}
        aria-valuemax={range.max}
        aria-valuenow={value}
        aria-valuetext={valueText(value)}
        className="relative size-full cursor-ns-resize touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-kin-300"
        onPointerDown={(e) => {
          e.stopPropagation();
          if (drag.current) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* pointer already gone */
          }
          clearTimeout(timer.current);
          drag.current = { id: e.pointerId, y0: e.clientY, v0: current.current, sun0: sunY.get() };
          setLabelVisible(true);
          handlers.current.onAdjustStart();
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const dy = e.clientY - d.y0;
          // The sun follows the finger smoothly; the camera gets its own steps only.
          sunY.set(Math.min(QUICK_TRACK, Math.max(0, d.sun0 + dy)));
          const v = exposureFromDrag(d.v0, dy, range);
          if (v === current.current) return;
          current.current = v;
          show(v);
          handlers.current.onPreview(v);
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onFocus={(e) => {
          let visible = false;
          try {
            visible = e.currentTarget.matches(':focus-visible');
          } catch {
            /* old browser: treat as a tap */
          }
          keyboard.current = visible;
          if (visible) clearTimeout(timer.current);
        }}
        onBlur={() => {
          keyboard.current = false;
          armHide();
        }}
        onKeyDown={(e) => {
          // Moved from the keyboard: it stays while focused.
          keyboard.current = true;
          clearTimeout(timer.current);
          const keys: Record<string, number> = {
            ArrowUp: step,
            ArrowRight: step,
            ArrowDown: -step,
            ArrowLeft: -step,
            PageUp: step * 5,
            PageDown: -step * 5,
          };
          if (e.key === 'Home') nudge(range.max);
          else if (e.key === 'End') nudge(range.min);
          else if (e.key in keys) nudge(current.current + keys[e.key]!);
          else if (e.key === 'Escape') handlers.current.onDismiss();
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {/* The track: a hairline, the sun travels along it. */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-kin-300/75 shadow-[0_0_0_1px_rgb(0_0_0/0.25)]"
          style={{ top: SUN / 2, bottom: SUN / 2 }}
        />
        <motion.span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -ml-[14px] grid place-items-center rounded-full bg-kin-300 text-sumi-900 shadow-[0_0_0_1px_rgb(0_0_0/0.35)]"
          style={{ y: sunY, width: SUN, height: SUN }}
        >
          <Sun className="size-4" strokeWidth={2.5} />
        </motion.span>
        <span
          ref={labelRef}
          aria-hidden
          className="tabular pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-sumi-900/85 px-2 py-0.5 font-mono text-[11px] font-bold text-kin-300 opacity-0 transition-opacity duration-150"
        >
          {formatExposure(value)}
        </span>
      </div>
    </motion.div>
  );
}

function valueText(v: number): string {
  return v === 0 ? 'luz sin cambio' : `${v > 0 ? 'más' : 'menos'} luz, ${formatExposure(v)}`;
}
