import { clamp, clampAdjust, clipInTake, type Clip, type Note, type Take } from '@coverscape/shared';
import type { TakeItem } from '@/features/takes/takeRules';

/**
 * F5 / F6 · Pure rules of the review screen: layout limits, the two-finger fit of the original over the take,
 * which take opens by default, which notes show where, the note drawing's size and the categories.
 * No DOM, no network: the screen and the tests share them.
 */

// ───────────── Layout and transport ─────────────

/** «Apilado»: the first panel takes 30–70 % of the stage. */
export const SPLIT_MIN = 0.3;
export const SPLIT_MAX = 0.7;
export function clampSplit(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.round(clamp(value, SPLIT_MIN, SPLIT_MAX) * 1000) / 1000;
}

/** «Cortina» sweeps the whole frame, a little short of each edge so the curtain can always be grabbed. */
export function clampWipe(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.round(clamp(value, 0.04, 0.96) * 1000) / 1000;
}

/** Common speed of the review (applied to the take; the original follows in proportion). */
export const REVIEW_RATE_MIN = 0.5;
export const REVIEW_RATE_MAX = 1.25;
export const REVIEW_RATES = [0.5, 0.75, 1, 1.25] as const;
export function clampReviewRate(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.round(clamp(value, REVIEW_RATE_MIN, REVIEW_RATE_MAX) * 100) / 100;
}

/** How this device likes to see the review (kept in localStorage; never shared). */
export type CompareMode = 'stacked' | 'overlay';
export interface ViewPrefs {
  mode: CompareMode;
  /** «Apilado»: which goes first (top in portrait, left in landscape). */
  order: 'original-first' | 'take-first';
  /** Share of the first panel (30–70 %). */
  split: number;
  /** «Cortina»: where the curtain stands (0–1 of the width). */
  wipe: number;
  /** «Superpuesto»: opacity of the one on top (0–1). */
  opacity: number;
  onTop: 'original' | 'take';
}
export const DEFAULT_PREFS: ViewPrefs = {
  mode: 'stacked',
  order: 'original-first',
  split: 0.5,
  wipe: 0.5,
  opacity: 0.5,
  onTop: 'original',
};

/** Stored prefs, repaired field by field (anything odd falls back to the default). */
export function parseViewPrefs(raw: string | null): ViewPrefs {
  let value: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) value = parsed as Record<string, unknown>;
  } catch {
    /* garbage: defaults */
  }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const opacity = num(value.opacity);
  return {
    mode: value.mode === 'overlay' ? 'overlay' : 'stacked',
    order: value.order === 'take-first' ? 'take-first' : 'original-first',
    split: clampSplit(num(value.split) ?? DEFAULT_PREFS.split),
    wipe: clampWipe(num(value.wipe) ?? DEFAULT_PREFS.wipe),
    opacity: opacity == null ? DEFAULT_PREFS.opacity : Math.round(clamp(opacity, 0, 1) * 100) / 100,
    onTop: value.onTop === 'take' ? 'take' : 'original',
  };
}

/** One frame of a 30 fps phone video. */
export const FRAME_STEP = 1 / 30;

/**
 * Speed of the original for a take recorded at `takeSpeed`, played at the common `rate`: a take recorded at
 * 0,75× follows a song at 0,75×, so watched at 1× the original goes at 0,75×.
 */
export function originalRate(takeSpeed: number | null | undefined, rate: number): number {
  const speed = Number(takeSpeed) > 0 ? Number(takeSpeed) : 1;
  return Math.round(clamp(speed * rate, 0.25, 2) * 1000) / 1000;
}

/** The take's length: the media's own when it knows it (WebMs learn it late), else the saved one. */
export function takeLength(mediaSeconds: number, savedSeconds: number | null | undefined): number {
  if (Number.isFinite(mediaSeconds) && mediaSeconds > 0) return mediaSeconds;
  const saved = Number(savedSeconds);
  return Number.isFinite(saved) && saved > 0 ? saved : 0;
}

/** Song timing of a take (old demo rows may lack the adjustment). */
export function takeTiming(take: Pick<Take, 'song_start_seconds' | 'speed' | 'sync_adjust_seconds' | 'duration_seconds'>) {
  return {
    songStart: Number(take.song_start_seconds) || 0,
    speed: Number(take.speed) > 0 ? Number(take.speed) : 1,
    adjust: clampAdjust(Number(take.sync_adjust_seconds ?? 0)),
    duration: Number(take.duration_seconds) || 0,
  };
}

/** The song's clips that fall inside the take, as ranges of the take (to loop them in both). */
export function clipsInTake(
  clips: readonly Clip[],
  take: Pick<Take, 'song_start_seconds' | 'speed' | 'sync_adjust_seconds' | 'duration_seconds'>,
  duration?: number,
): { clip: Clip; start: number; end: number }[] {
  const timing = takeTiming(take);
  const length = duration && duration > 0 ? duration : timing.duration;
  if (!(length > 0)) return [];
  const out: { clip: Clip; start: number; end: number }[] = [];
  for (const clip of clips) {
    const range = clipInTake({ ...timing, duration: length }, { start: clip.start_seconds, end: clip.end_seconds });
    if (range) out.push({ clip, ...range });
  }
  return out.sort((a, b) => a.start - b.start);
}

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
export const FIT_SCALE_MIN = 0.2;
export const FIT_SCALE_MAX = 5;

export function clampFit(fit: Fit): Fit {
  const scale = Number.isFinite(fit.scale) ? clamp(fit.scale, FIT_SCALE_MIN, FIT_SCALE_MAX) : 1;
  const x = Number.isFinite(fit.x) ? clamp(fit.x, -1, 1) : 0;
  const y = Number.isFinite(fit.y) ? clamp(fit.y, -1, 1) : 0;
  return { scale: Math.round(scale * 1000) / 1000, x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 };
}

export function fitOf(take: Partial<Pick<Take, 'fit_scale' | 'fit_x' | 'fit_y'>>): Fit {
  return clampFit({ scale: Number(take.fit_scale ?? 1), x: Number(take.fit_x ?? 0), y: Number(take.fit_y ?? 0) });
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
  const k = from.length >= 2 && dist(from[0]!, from[1]!) > 4 ? dist(to[0]!, to[1]!) / dist(from[0]!, from[1]!) : 1;
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

// ───────────── Which take the review opens ─────────────

/**
 * «Repaso» opens (F4) the best take of whoever this device is; else their newest; else the newest on this phone;
 * else the newest that can be played at all. Takes on another phone can't be played and are never picked.
 */
export function defaultReviewTake<T extends Pick<TakeItem, 'where' | 'member_id' | 'is_best' | 'recorded_at'>>(
  takes: readonly T[],
  meId: string | null,
): T | null {
  const playable = takes.filter((t) => t.where !== 'elsewhere');
  const newest = (list: readonly T[]) =>
    list.reduce<T | null>((best, t) => (!best || t.recorded_at.localeCompare(best.recorded_at) > 0 ? t : best), null);
  if (meId) {
    const mine = playable.filter((t) => t.member_id === meId);
    const best = newest(mine.filter((t) => t.is_best));
    if (best) return best;
    const latest = newest(mine);
    if (latest) return latest;
  }
  return newest(playable.filter((t) => t.where === 'here')) ?? newest(playable);
}

// ───────────── Notes on a take (F6) ─────────────

export const NOTE_CATEGORIES = [
  { id: 'tiempo', label: 'Tiempo' },
  { id: 'brazos', label: 'Brazos' },
  { id: 'piernas', label: 'Piernas' },
  { id: 'direccion', label: 'Dirección o mirada' },
  { id: 'espacio', label: 'Espacio' },
  { id: 'expresion', label: 'Expresión' },
  { id: 'energia', label: 'Energía' },
] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number]['id'];

export function isNoteCategory(value: unknown): value is NoteCategory {
  return NOTE_CATEGORIES.some((c) => c.id === value);
}

export function categoryLabel(value: string | null | undefined): string | null {
  return NOTE_CATEGORIES.find((c) => c.id === value)?.label ?? null;
}

export type NoteStatus = 'open' | 'done';
export function noteStatus(note: Partial<Pick<Note, 'status'>>): NoteStatus {
  return note.status === 'done' ? 'done' : 'open';
}

export const NOTE_MAX = 500;
/** The text as saved: trimmed, 1–500 characters; null when empty. */
export function cleanNoteBody(body: string): string | null {
  const text = body.trim().slice(0, NOTE_MAX).trim();
  return text ? text : null;
}

/** A take's notes, in the order of the take. */
export function takeNotes(notes: readonly Note[], takeId: string): Note[] {
  return notes
    .filter((n) => n.take_id === takeId && n.take_seconds != null)
    .sort((a, b) => Number(a.take_seconds) - Number(b.take_seconds));
}

/**
 * The notes the song (studio) shows on this device: every note not tied to a take, and a take's notes only
 * for their recipient (or when they are for nobody in particular).
 */
export function songNotes(notes: readonly Note[], meId: string | null): Note[] {
  return notes.filter((n) => !n.take_id || !n.for_member_id || n.for_member_id === meId);
}

/**
 * The note a playing review crosses between two clock ticks: only natural forward playback (no scrubs, no
 * jumps longer than a slow tick), like the studio's note bubble.
 */
export function crossedNote(notes: readonly Note[], last: number, now: number): Note | null {
  if (!(now > last) || now - last >= 2.5) return null;
  return notes.find((n) => n.take_seconds != null && Number(n.take_seconds) > last && Number(n.take_seconds) <= now) ?? null;
}

// ───────────── The drawing over the frame ─────────────

/** Same as the database (`notes_sketch_shape`). */
export const SKETCH_MAX_CHARS = 60_000;
export const SKETCH_PATTERN = /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/;
export const SKETCH_WIDTHS = [320, 240, 160] as const;
const QUALITIES = [0.8, 0.62, 0.45, 0.3] as const;

export function isValidSketch(value: unknown): value is string {
  return typeof value === 'string' && value.length <= SKETCH_MAX_CHARS && SKETCH_PATTERN.test(value);
}

/** Draws the sketch at `width` px and encodes it (canvas.toDataURL); null if it can't. */
export type SketchEncoder = (type: 'image/webp' | 'image/jpeg', quality: number, width: number) => string | null;

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
