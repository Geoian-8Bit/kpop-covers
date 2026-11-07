import type { TakeItem } from '@/features/takes/takeRules';
import { clamp, clampAdjust, clampLead, type Clip, clipInTake, type Take } from '@coverscape/shared';

// ───────────── Layout and transport ─────────────

/** «Separados»: the first panel takes 15–85 % of the stage (a portrait take beside YouTube needs little). */
export const SPLIT_MIN = 0.15;
export const SPLIT_MAX = 0.85;
export function clampSplit(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.round(clamp(value, SPLIT_MIN, SPLIT_MAX) * 1000) / 1000;
}

/** Common speed of the review (applied to the take; the original follows in proportion). */
export const REVIEW_RATE_MIN = 0.5;
export const REVIEW_RATE_MAX = 1.25;

// ───────────── Quick controls (one tap, while dancing) ─────────────

/** The speed button goes round these (1× → 0,75× → 0,5× → 1×). */
const QUICK_RATES = [1, 0.75, 0.5] as const;
/** The next speed of the quick button: the next one down the list, or back to 1× from anything else. */
export function nextQuickRate(rate: number): number {
  const i = QUICK_RATES.findIndex((r) => Math.abs(r - rate) < 0.001);
  return i < 0 ? 1 : QUICK_RATES[(i + 1) % QUICK_RATES.length]!;
}

/** «Superpuesto»: how much of the original shows (its opacity), round these with one tap. */
const QUICK_OPACITIES = [0.5, 0.75, 0.25] as const;
export function nextQuickOpacity(opacity: number): number {
  const i = QUICK_OPACITIES.findIndex((o) => Math.abs(o - opacity) < 0.01);
  return i < 0 ? 0.5 : QUICK_OPACITIES[(i + 1) % QUICK_OPACITIES.length]!;
}

/** Entering «Superpuesto» with an original that would hide the take (or barely show): start at half. */
export function overlayStartOpacity(opacity: number): number {
  return opacity >= 0.99 || opacity < 0.15 ? 0.5 : opacity;
}

/**
 * What fingers on the stage do. A finger on a whole picture never moves anything (a thumb resting on the screen
 * while the phone is held on its side must not take the stage); in «Superpuesto» the original moves and scales
 * only while «Encajar» is on; two fingers zoom what can be zoomed.
 */
export type StageGesture = 'fit' | 'zoom' | 'none';
export function stageGesture(o: {
  overlay: boolean;
  fitting: boolean;
  fingers: number;
  zoomed: boolean;
  zoomable: boolean;
}): StageGesture {
  if (o.overlay && o.fitting) return 'fit';
  if (!o.zoomable) return 'none';
  if (o.fingers >= 2) return 'zoom';
  return o.zoomed ? 'zoom' : 'none';
}
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
  /** «Superpuesto»: opacity of the one on top (0–1). */
  opacity: number;
  onTop: 'original' | 'take';
}
export const DEFAULT_PREFS: ViewPrefs = {
  mode: 'stacked',
  order: 'original-first',
  split: 0.5,
  opacity: 0.5,
  onTop: 'original',
};

/** Stored prefs, repaired field by field (anything odd falls back to the default). */
export function parseViewPrefs(raw: string | null): ViewPrefs {
  let value: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      value = parsed as Record<string, unknown>;
  } catch {
    /* garbage: defaults */
  }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const opacity = num(value.opacity);
  return {
    mode: value.mode === 'overlay' ? 'overlay' : 'stacked',
    order: value.order === 'take-first' ? 'take-first' : 'original-first',
    split: clampSplit(num(value.split) ?? DEFAULT_PREFS.split),
    opacity: opacity == null ? DEFAULT_PREFS.opacity : Math.round(clamp(opacity, 0, 1) * 100) / 100,
    onTop: value.onTop === 'take' ? 'take' : 'original',
  };
}

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

/** What the review reads of a take to place it on the song. */
export type TakeTimingRow = Pick<
  Take,
  'song_start_seconds' | 'speed' | 'sync_adjust_seconds' | 'duration_seconds'
> &
  Partial<Pick<Take, 'song_lead_seconds'>>;

/** Song timing of a take (old demo rows may lack the adjustment or the song's start in the take). */
export function takeTiming(take: TakeTimingRow) {
  return {
    songStart: Number(take.song_start_seconds) || 0,
    speed: Number(take.speed) > 0 ? Number(take.speed) : 1,
    adjust: clampAdjust(Number(take.sync_adjust_seconds ?? 0)),
    lead: clampLead(take.song_lead_seconds),
    duration: Number(take.duration_seconds) || 0,
  };
}

export { takeSongZero } from '@/features/takes/takeRules';

/** The song's clips that fall inside the take, as ranges of the take (to loop them in both). */
export function clipsInTake(
  clips: readonly Clip[],
  take: TakeTimingRow,
  duration?: number,
): { clip: Clip; start: number; end: number }[] {
  const timing = takeTiming(take);
  const length = duration && duration > 0 ? duration : timing.duration;
  if (!(length > 0)) return [];
  const out: { clip: Clip; start: number; end: number }[] = [];
  for (const clip of clips) {
    const range = clipInTake(
      { ...timing, duration: length },
      { start: clip.start_seconds, end: clip.end_seconds },
    );
    if (range) out.push({ clip, ...range });
  }
  return out.sort((a, b) => a.start - b.start);
}

// ───────────── Which take the review opens ─────────────

/**
 * «Repaso» opens (F4) the best take of whoever this device is; else their newest; else the newest on this phone;
 * else the newest that can be played at all. Takes on another phone can't be played and are never picked.
 */
export function defaultReviewTake<
  T extends Pick<TakeItem, 'where' | 'member_id' | 'is_best' | 'recorded_at'>,
>(takes: readonly T[], meId: string | null): T | null {
  const playable = takes.filter((t) => t.where !== 'elsewhere');
  const newest = (list: readonly T[]) =>
    list.reduce<T | null>(
      (best, t) => (!best || t.recorded_at.localeCompare(best.recorded_at) > 0 ? t : best),
      null,
    );
  if (meId) {
    const mine = playable.filter((t) => t.member_id === meId);
    const best = newest(mine.filter((t) => t.is_best));
    if (best) return best;
    const latest = newest(mine);
    if (latest) return latest;
  }
  return newest(playable.filter((t) => t.where === 'here')) ?? newest(playable);
}
