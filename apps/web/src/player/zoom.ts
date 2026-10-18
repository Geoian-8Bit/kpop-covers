/**
 * F9 · Zoom over the video. Pure rules shared by the studio (practice) and the review: limits, the conversion
 * between the picture and the box it is shown in, gestures (two fingers, wheel, drag, keys) and the zoom saved
 * with a clip. No DOM: the stages and the tests share them.
 *
 * A zoom is kept in PICTURE coordinates: `x`, `y` are the centre of the zoomed area as a fraction of the video's
 * own frame (0…1, 0.5 = centre), `scale` 1 (whole video) … 4. So the same zoom shows the same spot in any box
 * (the studio's 16:9 stage, a review panel), and with the mirror the zoom follows the picture: it is applied
 * inside the mirrored layer, and only the fingers on screen are flipped back to the picture's side.
 */

export interface Zoom {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** A point in px from the box's top-left corner. */
export interface Pt {
  x: number;
  y: number;
}

/** Same limits as the database (`clips_zoom_range`). */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
export const NO_ZOOM: Zoom = { scale: 1, x: 0.5, y: 0.5 };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const finite = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

/** Scale 1–4 and centre inside the picture; anything odd falls back to the whole video. */
export function clampZoom(zoom: Partial<Zoom> | null | undefined): Zoom {
  const scale = clamp(finite(zoom?.scale, 1), ZOOM_MIN, ZOOM_MAX);
  if (scale <= ZOOM_MIN + 0.005) return NO_ZOOM;
  return {
    scale: Math.round(scale * 100) / 100,
    x: Math.round(clamp(finite(zoom?.x, 0.5), 0, 1) * 10000) / 10000,
    y: Math.round(clamp(finite(zoom?.y, 0.5), 0, 1) * 10000) / 10000,
  };
}

export function isZoomed(zoom: Zoom | null | undefined): boolean {
  return zoom != null && zoom.scale > ZOOM_MIN + 0.005;
}

export function sameZoom(a: Zoom, b: Zoom): boolean {
  const ca = clampZoom(a);
  const cb = clampZoom(b);
  return ca.scale === cb.scale && ca.x === cb.x && ca.y === cb.y;
}

/** «250 %». */
export function zoomLabel(zoom: Zoom): string {
  return `${Math.round(clampZoom(zoom).scale * 100)} %`;
}

/**
 * P12 · What the zoom controls show, as plain values a store selector can compare: a pinch or a drag moves the
 * zoom every frame, but the controls only repaint when the label or a limit actually changes.
 */
export interface ZoomControlsView {
  zoomed: boolean;
  label: string;
  atMax: boolean;
}
export function zoomControlsView(zoom: Zoom): ZoomControlsView {
  return { zoomed: isZoomed(zoom), label: zoomLabel(zoom), atMax: zoom.scale >= ZOOM_MAX };
}
/** The badge over the video: its label while zoomed, null otherwise. */
export function zoomBadgeLabel(zoom: Zoom): string | null {
  return isZoomed(zoom) ? zoomLabel(zoom) : null;
}

// ───────────── Picture ↔ box ─────────────

/** Where the picture sits inside its box with `object-fit: contain` (the whole box when its size is unknown). */
export function contentBox(
  box: Size,
  media?: Size | null,
): { left: number; top: number; width: number; height: number } {
  if (!media || !(media.width > 0) || !(media.height > 0) || !(box.width > 0) || !(box.height > 0)) {
    return { left: 0, top: 0, width: Math.max(0, box.width), height: Math.max(0, box.height) };
  }
  const k = Math.min(box.width / media.width, box.height / media.height);
  const width = media.width * k;
  const height = media.height * k;
  return { left: (box.width - width) / 2, top: (box.height - height) / 2, width, height };
}

/**
 * The zoom as shown in a box: its scale and the box point (px) brought to the box's centre, held so the view
 * never shows past the box's edges.
 */
export function zoomInBox(
  zoom: Zoom,
  box: Size,
  media?: Size | null,
): { scale: number; cx: number; cy: number } {
  const z = clampZoom(zoom);
  const c = contentBox(box, media);
  const s = z.scale;
  const halfW = box.width / (2 * s);
  const halfH = box.height / (2 * s);
  const cx = clamp(c.left + z.x * c.width, halfW, box.width - halfW);
  const cy = clamp(c.top + z.y * c.height, halfH, box.height - halfH);
  return { scale: s, cx, cy };
}

/** Back from a box point (px) to the picture's fractions. */
export function zoomFromBox(scale: number, cx: number, cy: number, box: Size, media?: Size | null): Zoom {
  const c = contentBox(box, media);
  if (!(c.width > 0) || !(c.height > 0)) return clampZoom({ scale });
  return clampZoom({ scale, x: (cx - c.left) / c.width, y: (cy - c.top) / c.height });
}

/**
 * The zoomed layer's move and scale (translate first, then scale around its centre): the layer sits inside the
 * mirror, so the zoom follows the picture when it flips.
 */
export function zoomOffsets(
  zoom: Zoom,
  box: Size,
  media?: Size | null,
): { x: number; y: number; scale: number } {
  if (!isZoomed(zoom) || !(box.width > 0) || !(box.height > 0)) return { x: 0, y: 0, scale: 1 };
  const { scale, cx, cy } = zoomInBox(zoom, box, media);
  return { x: round2((box.width / 2 - cx) * scale), y: round2((box.height / 2 - cy) * scale), scale };
}

/** The same as a CSS transform (transform-origin at the layer's centre). */
export function zoomTransform(zoom: Zoom, box: Size, media?: Size | null): string {
  if (!isZoomed(zoom) || !(box.width > 0) || !(box.height > 0)) return 'none';
  const { x, y, scale } = zoomOffsets(zoom, box, media);
  return `translate(${x}px, ${y}px) scale(${scale})`;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The zoom as seen on screen when the picture is mirrored (for a layer outside the mirror, like the review's
 * «Superpuesto», which zooms both together following the take).
 */
export function mirrorZoom(zoom: Zoom, mirrored: boolean): Zoom {
  const z = clampZoom(zoom);
  return mirrored && isZoomed(z) ? { ...z, x: Math.round((1 - z.x) * 10000) / 10000 } : z;
}

/** A point on screen (px in the box) as a point of the layer under the mirror. */
export function unmirror(p: Pt, box: Size, mirrored: boolean): Pt {
  return mirrored ? { x: box.width - p.x, y: p.y } : { x: p.x, y: p.y };
}

// ───────────── Gestures ─────────────

const mid = (pts: readonly Pt[]): Pt =>
  pts.length >= 2 ? { x: (pts[0]!.x + pts[1]!.x) / 2, y: (pts[0]!.y + pts[1]!.y) / 2 } : { ...pts[0]! };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** The layer point under `from` (on screen) lands under `to`, with the scale times `k`. */
function scaledAround(
  start: Zoom,
  from: Pt,
  to: Pt,
  k: number,
  box: Size,
  media: Size | null | undefined,
  mirrored: boolean,
): Zoom {
  if (!(box.width > 0) || !(box.height > 0) || !Number.isFinite(k)) return clampZoom(start);
  const { scale, cx, cy } = zoomInBox(start, box, media);
  const f = unmirror(from, box, mirrored);
  const t = unmirror(to, box, mirrored);
  // The layer's point under the finger: centre of the view + its distance from the box's centre, unscaled.
  const ax = cx + (f.x - box.width / 2) / scale;
  const ay = cy + (f.y - box.height / 2) / scale;
  const next = clamp(scale * k, ZOOM_MIN, ZOOM_MAX);
  const nx = ax - (t.x - box.width / 2) / next;
  const ny = ay - (t.y - box.height / 2) / next;
  // Hold the view inside the box before going back to the picture (no dead zone at the edges).
  const halfW = box.width / (2 * next);
  const halfH = box.height / (2 * next);
  return zoomFromBox(
    next,
    clamp(nx, halfW, box.width - halfW),
    clamp(ny, halfH, box.height - halfH),
    box,
    media,
  );
}

/**
 * The zoom after a gesture that started at `from` (1 or 2 pointers, px in the box) with the zoom `start` and is
 * now at `to`. One finger (or the mouse) moves the zoomed picture; two also scale around their midpoint, so the
 * spot under the fingers stays under them.
 */
export function gestureZoom(
  start: Zoom,
  from: readonly Pt[],
  to: readonly Pt[],
  box: Size,
  media: Size | null | undefined,
  mirrored: boolean,
): Zoom {
  if (!from.length || from.length !== to.length) return clampZoom(start);
  const k =
    from.length >= 2 && dist(from[0]!, from[1]!) > 4 ? dist(to[0]!, to[1]!) / dist(from[0]!, from[1]!) : 1;
  return scaledAround(start, mid(from), mid(to), k, box, media, mirrored);
}

/** Wheel over the video: scale around the cursor (`at`, px in the box). Up = closer. */
export function wheelZoom(
  zoom: Zoom,
  deltaY: number,
  at: Pt,
  box: Size,
  media: Size | null | undefined,
  mirrored: boolean,
): Zoom {
  if (!Number.isFinite(deltaY)) return clampZoom(zoom);
  const k = Math.exp(-clamp(deltaY, -400, 400) * 0.002);
  return scaledAround(zoom, at, at, k, box, media, mirrored);
}

/**
 * «Ampliar» / «Reducir» buttons and + / − keys: only the scale changes; the zoomed spot (x, y) stays where it is,
 * whatever box or picture shape it is shown in (each view holds it inside its own box when drawing).
 */
export function stepZoom(zoom: Zoom, factor: number): Zoom {
  const z = clampZoom(zoom);
  if (!Number.isFinite(factor) || factor <= 0) return z;
  return clampZoom({ ...z, scale: z.scale * factor });
}

/**
 * Keys on the video: arrows move the view a tenth of the box the way they point on screen (the mirror is taken
 * into account), + / − scale, 0 shows the whole video. Null for any other key.
 */
export function keyZoom(
  zoom: Zoom,
  key: string,
  box: Size,
  media: Size | null | undefined,
  mirrored: boolean,
): Zoom | null {
  const centre = { x: box.width / 2, y: box.height / 2 };
  const step = { x: box.width / 10, y: box.height / 10 };
  const pan = (dx: number, dy: number) =>
    scaledAround(zoom, centre, { x: centre.x - dx, y: centre.y - dy }, 1, box, media, mirrored);
  switch (key) {
    case 'ArrowLeft':
      return pan(-step.x, 0);
    case 'ArrowRight':
      return pan(step.x, 0);
    case 'ArrowUp':
      return pan(0, -step.y);
    case 'ArrowDown':
      return pan(0, step.y);
    case '+':
    case '=':
      return stepZoom(zoom, 1.25);
    case '-':
    case '_':
      return stepZoom(zoom, 1 / 1.25);
    case '0':
      return NO_ZOOM;
    default:
      return null;
  }
}

/** Two taps on the same spot within 300 ms (and 30 px). */
export function isDoubleTap(
  last: { at: number; x: number; y: number } | null,
  now: { at: number; x: number; y: number },
): boolean {
  return last != null && now.at - last.at < 300 && Math.hypot(now.x - last.x, now.y - last.y) < 30;
}

// ───────────── Saved with a clip ─────────────

export interface ClipZoomColumns {
  zoom_scale: number;
  zoom_x: number;
  zoom_y: number;
}

/** A clip's saved zoom (older rows without the columns: the whole video). */
export function zoomOfClip(clip: Partial<Record<keyof ClipZoomColumns, unknown>> | null | undefined): Zoom {
  if (!clip) return NO_ZOOM;
  return clampZoom({
    scale: finite(clip.zoom_scale, 1),
    x: finite(clip.zoom_x, 0.5),
    y: finite(clip.zoom_y, 0.5),
  });
}

/** The columns to save on the clip (database precision: scale 2 decimals, centre 4); no zoom = 1, centred. */
export function clipZoomColumns(zoom: Zoom | null | undefined): ClipZoomColumns {
  const z = clampZoom(zoom);
  return isZoomed(z)
    ? { zoom_scale: z.scale, zoom_x: z.x, zoom_y: z.y }
    : { zoom_scale: 1, zoom_x: 0.5, zoom_y: 0.5 };
}

export function clipHasZoom(
  clip: Partial<Record<keyof ClipZoomColumns, unknown>> | null | undefined,
): boolean {
  return isZoomed(zoomOfClip(clip));
}
