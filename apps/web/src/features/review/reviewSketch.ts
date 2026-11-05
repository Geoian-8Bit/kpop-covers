import type { Pt } from './reviewFit';

// ───────────── The drawing over the frame ─────────────

/** Same as the database (`notes_sketch_shape`). */
const SKETCH_MAX_CHARS = 60_000;
const SKETCH_PATTERN = /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/;
const SKETCH_WIDTHS = [320, 240, 160] as const;
const QUALITIES = [0.8, 0.62, 0.45, 0.3] as const;

export function isValidSketch(value: unknown): value is string {
  return typeof value === 'string' && value.length <= SKETCH_MAX_CHARS && SKETCH_PATTERN.test(value);
}

/** How close (s) the take must stand to a note's moment for its drawing to show. */
const SKETCH_MOMENT = 0.2;
/**
 * Whether the take stands at the note's moment (its drawing is a still of it). A boolean, so the screen subscribes
 * to this instead of the 60 Hz clock and only repaints when it flips.
 */
export function atNoteMoment(time: number, takeSeconds: number | string | null | undefined): boolean {
  if (takeSeconds == null) return false;
  const at = Number(takeSeconds);
  return Number.isFinite(at) && Math.abs(time - at) < SKETCH_MOMENT;
}

/** Draws the sketch at `width` px and encodes it (canvas.toDataURL); null if it can't. */
export type SketchEncoder = (
  type: 'image/webp' | 'image/jpeg',
  quality: number,
  width: number,
) => string | null;

/**
 * The smallest good-looking image that fits: WebP at 320 px, lowering quality, then narrower; JPEG when the
 * browser doesn't make WebP (toDataURL then hands back a PNG). Null when nothing fits.
 */
export function encodeSketch(encode: SketchEncoder, maxChars: number = SKETCH_MAX_CHARS): string | null {
  let webp = true;
  for (const width of SKETCH_WIDTHS) {
    for (const type of webp ? (['image/webp', 'image/jpeg'] as const) : (['image/jpeg'] as const)) {
      for (const quality of QUALITIES) {
        const url = encode(type, quality, width);
        if (!url) continue;
        if (type === 'image/webp' && !url.startsWith('data:image/webp')) {
          webp = false;
          break;
        }
        if (url.length <= maxChars && SKETCH_PATTERN.test(url)) return url;
      }
      if (webp && type === 'image/webp') break; // WebP works: narrower WebP before trying JPEG
    }
  }
  return null;
}

/** A shape drawn over the frame, in the frame's own pixels. */
export type SketchShape = { kind: 'circle' | 'arrow'; from: Pt; to: Pt };

/** A circle from a drag: the drag's box, a round circle when the box is nearly square. */
export function ellipseOf(shape: SketchShape): { cx: number; cy: number; rx: number; ry: number } {
  const cx = (shape.from.x + shape.to.x) / 2;
  const cy = (shape.from.y + shape.to.y) / 2;
  const rx = Math.max(6, Math.abs(shape.to.x - shape.from.x) / 2);
  const ry = Math.max(6, Math.abs(shape.to.y - shape.from.y) / 2);
  return { cx, cy, rx, ry };
}

/** The two barbs of an arrow pointing at `to`. */
export function arrowHead(from: Pt, to: Pt, size: number): [Pt, Pt] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const spread = Math.PI / 7;
  return [
    { x: to.x - size * Math.cos(angle - spread), y: to.y - size * Math.sin(angle - spread) },
    { x: to.x - size * Math.cos(angle + spread), y: to.y - size * Math.sin(angle + spread) },
  ];
}

/** Long enough to be a shape and not a stray tap. */
export function isShape(shape: SketchShape): boolean {
  return Math.hypot(shape.to.x - shape.from.x, shape.to.y - shape.from.y) >= 8;
}
