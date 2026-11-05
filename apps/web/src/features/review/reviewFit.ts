import { clamp, type Take } from '@coverscape/shared';

// ───────────── Overlay fit (two fingers, wheel, drag) ─────────────

/**
 * How the original sits over the take: its scale and the offset of its centre as a fraction of the frame
 * (translate = x × width, y × height). Same limits as the database (`takes_fit_range`).
 */
export interface Fit {
  scale: number;
  x: number;
  y: number;
}
export const NO_FIT: Fit = { scale: 1, x: 0, y: 0 };
const FIT_SCALE_MIN = 0.2;
const FIT_SCALE_MAX = 5;

export function clampFit(fit: Fit): Fit {
  const scale = Number.isFinite(fit.scale) ? clamp(fit.scale, FIT_SCALE_MIN, FIT_SCALE_MAX) : 1;
  const x = Number.isFinite(fit.x) ? clamp(fit.x, -1, 1) : 0;
  const y = Number.isFinite(fit.y) ? clamp(fit.y, -1, 1) : 0;
  return {
    scale: Math.round(scale * 1000) / 1000,
    x: Math.round(x * 10000) / 10000,
    y: Math.round(y * 10000) / 10000,
  };
}

export function fitOf(take: Partial<Pick<Take, 'fit_scale' | 'fit_x' | 'fit_y'>>): Fit {
  return clampFit({
    scale: Number(take.fit_scale ?? 1),
    x: Number(take.fit_x ?? 0),
    y: Number(take.fit_y ?? 0),
  });
}

export function sameFit(a: Fit, b: Fit): boolean {
  return a.scale === b.scale && a.x === b.x && a.y === b.y;
}

export interface Pt {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}

const mid = (pts: readonly Pt[]): Pt =>
  pts.length >= 2 ? { x: (pts[0]!.x + pts[1]!.x) / 2, y: (pts[0]!.y + pts[1]!.y) / 2 } : { ...pts[0]! };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The fit after a gesture that started at `from` (1 or 2 pointers, px relative to the frame's centre) with the
 * fit `start`, and is now at `to`. One finger (or the mouse) moves; two also scale around their midpoint, so the
 * point under the fingers stays under them.
 */
export function gestureFit(start: Fit, from: readonly Pt[], to: readonly Pt[], frame: Size): Fit {
  if (!from.length || from.length !== to.length || !(frame.width > 0) || !(frame.height > 0)) return start;
  const k =
    from.length >= 2 && dist(from[0]!, from[1]!) > 4 ? dist(to[0]!, to[1]!) / dist(from[0]!, from[1]!) : 1;
  return scaledAround(start, mid(from), mid(to), k, frame);
}

/** Wheel over the frame: scale around the cursor (`at`, px from the centre). Up = bigger. */
export function wheelFit(fit: Fit, deltaY: number, at: Pt, frame: Size): Fit {
  if (!(frame.width > 0) || !(frame.height > 0) || !Number.isFinite(deltaY)) return fit;
  const k = Math.exp(-clamp(deltaY, -400, 400) * 0.0015);
  return scaledAround(fit, at, at, k, frame);
}

/** The original's point under `from` lands under `to`, scaled by `k`. */
function scaledAround(start: Fit, from: Pt, to: Pt, k: number, frame: Size): Fit {
  const scale = clamp(start.scale * k, FIT_SCALE_MIN, FIT_SCALE_MAX);
  const real = scale / start.scale;
  const ox = start.x * frame.width;
  const oy = start.y * frame.height;
  const nx = to.x - (from.x - ox) * real;
  const ny = to.y - (from.y - oy) * real;
  return clampFit({ scale, x: nx / frame.width, y: ny / frame.height });
}

/** Arrow keys on the frame: nudge (2 % of the frame) or, with +/−, scale by 4 %. */
export function keyFit(fit: Fit, key: string): Fit | null {
  const step = 0.02;
  switch (key) {
    case 'ArrowLeft':
      return clampFit({ ...fit, x: fit.x - step });
    case 'ArrowRight':
      return clampFit({ ...fit, x: fit.x + step });
    case 'ArrowUp':
      return clampFit({ ...fit, y: fit.y - step });
    case 'ArrowDown':
      return clampFit({ ...fit, y: fit.y + step });
    case '+':
    case '=':
      return clampFit({ ...fit, scale: fit.scale * 1.04 });
    case '-':
      return clampFit({ ...fit, scale: fit.scale / 1.04 });
    default:
      return null;
  }
}
