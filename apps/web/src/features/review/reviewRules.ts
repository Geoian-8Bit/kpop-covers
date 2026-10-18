import { clamp, clampAdjust, clipInTake, type Clip, type Note, type Take } from '@coverscape/shared';
import type { TakeItem } from '@/features/takes/takeRules';
import { needsAlignOnPlay } from '@/player/reviewAlign';

/**
 * F5 / F6 · Pure rules of the review screen: layout limits, the two-finger fit of the original over the take,
 * which take opens by default, which notes show where, the note drawing's size and the categories.
 * No DOM, no network: the screen and the tests share them.
 */

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

export { takeSongZero } from '@/features/takes/takeRules';

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

// ───────────── Keeping the original with the take (51) ─────────────

/**
 * The take is the clock (it carries the sound by default): it never waits for the original. The original follows
 * it gently: a file is nudged a few per cent faster or slower for small gaps and only jumps for big ones; YouTube
 * can't take fine speeds, so when it runs ahead it holds still for the gap, and when it falls behind it jumps a
 * little ahead of the take (its own seek delay). Every jump waits for the previous one to land, and jumps that keep
 * failing back off (2 s, 4 s, 8 s…) so the original never stutters in a loop of seeks.
 */
export type OriginalKind = 'file' | 'youtube';

export const SYNC = {
  file: {
    /** Below this (s) the original is in step. */
    nudgeOver: 0.03,
    /** Above this (s) a nudge would take too long: jump. */
    seekOver: 0.5,
    /** Most a nudge changes the speed (±6 %: not heard on a muted original, not seen). */
    maxNudge: 0.06,
    /** After a jump, wait this long before judging again (the jump lands). */
    settleMs: 450,
    cooldownMs: 1200,
  },
  youtube: {
    /** Ahead by more than this (s): hold still for the gap. */
    holdOver: 0.1,
    /** Behind by more than this (s): jump ahead. */
    seekOver: 0.2,
    settleMs: 900,
    cooldownMs: 2000,
    /** Longest hold (ms): a bigger gap is a jump instead. */
    maxHoldMs: 1500,
  },
  /** Backoff ceiling between corrections that keep failing. */
  maxCooldownMs: 8000,
  /** In step this long: the backoff starts again from the bottom. */
  calmMs: 3000,
} as const;

/** What the clock remembers between frames. */
export interface SyncMemory {
  /** performance.now() of the last correction (a jump, or the end of a hold). */
  lastFixAt: number;
  /** Corrections without a calm stretch between them. */
  streak: number;
  /** Since when the original has been in step (null: it isn't). */
  calmSince: number | null;
  /** A speed nudge is in effect (files). */
  nudged: boolean;
}
export const FRESH_SYNC: SyncMemory = { lastFixAt: Number.NEGATIVE_INFINITY, streak: 0, calmSince: null, nudged: false };

export type SyncAction =
  | { kind: 'none' }
  /** Play the original at this speed for now (files). */
  | { kind: 'rate'; rate: number }
  /**
   * Play the take at this speed for now (files, while the original is the one heard: its tempo must not wobble,
   * so the muted take follows it instead).
   */
  | { kind: 'takeRate'; rate: number }
  /** Jump the take to this second (the original is heard: the muted take is what moves). */
  | { kind: 'takeSeek'; to: number }
  /** Both back to their normal speeds (files). */
  | { kind: 'base' }
  /** Jump the original to this second (its own seconds). */
  | { kind: 'seek'; to: number }
  /** Pause the original this long, then play it again (YouTube ahead). */
  | { kind: 'hold'; ms: number };

export interface SyncInput {
  kind: OriginalKind;
  /** Original's time − where it should be (s, original's seconds): > 0 ahead, < 0 behind. */
  drift: number;
  /** Where the original should be now (original's seconds). */
  target: number;
  /** The original's normal speed (the take's recording speed × the common speed). */
  baseRate: number;
  /** performance.now(). */
  now: number;
  /** The original is playing with data (not loading, not landing a seek): only then is its clock judged. */
  ready: boolean;
  /** How long its jumps take to show (ms, measured): it jumps that much ahead. */
  seekLatencyMs: number;
  /** Which of the two is heard (default: the take). */
  heard?: 'take' | 'original';
  /** The take's normal speed (the common speed), for nudging it instead of the original. */
  takeRate?: number;
  /** The take's second now and the song's speed in the take (song s per take s), to jump the take instead. */
  takeTime?: number;
  songSpeed?: number;
}

/** With YouTube heard, the take jumps when they're this far apart (s): YouTube itself is never touched then. */
const HEARD_YOUTUBE_SEEK_OVER = 0.15;

/** The wait before the next correction: doubles with each one that didn't settle it. */
export function syncCooldown(kind: OriginalKind, streak: number): number {
  const base = kind === 'file' ? SYNC.file.cooldownMs : SYNC.youtube.cooldownMs;
  return Math.min(SYNC.maxCooldownMs, base * 2 ** Math.max(0, Math.min(streak, 6)));
}

/** Where to jump so the original shows `target` when the jump lands: ahead by its delay at its speed (≤ 1,5 s). */
export function seekAhead(target: number, latencyMs: number, rate: number): number {
  const lead = (clamp(Number.isFinite(latencyMs) ? latencyMs : 0, 0, 1500) / 1000) * (rate > 0 ? rate : 1);
  return Math.max(0, Math.round((target + lead) * 1000) / 1000);
}

/** A jump's measured delay folded into the running estimate (ms); first samples count more. */
export function blendLatency(previous: number | null, sampleMs: number): number {
  if (!Number.isFinite(sampleMs) || sampleMs < 0) return previous ?? 0;
  const sample = Math.min(sampleMs, 3000);
  return previous == null ? sample : Math.round(previous * 0.6 + sample * 0.4);
}

export { needsAlignOnPlay };

/** One frame of the follow: what to do with the original, and what to remember. */
export function syncStep(input: SyncInput, memory: SyncMemory): { action: SyncAction; memory: SyncMemory } {
  const { kind, drift, now } = input;
  if (!input.ready || !Number.isFinite(drift)) return { action: { kind: 'none' }, memory };
  const abs = Math.abs(drift);
  const calmBand = kind === 'file' ? SYNC.file.nudgeOver * 2 : SYNC.youtube.holdOver;
  let next: SyncMemory = memory;
  if (abs <= calmBand) {
    const calmSince = memory.calmSince ?? now;
    next = { ...memory, calmSince, streak: now - calmSince >= SYNC.calmMs ? 0 : memory.streak };
  } else if (memory.calmSince != null) {
    next = { ...memory, calmSince: null };
  }
  const since = now - next.lastFixAt;
  const settle = kind === 'file' ? SYNC.file.settleMs : SYNC.youtube.settleMs;
  if (since < settle) return { action: { kind: 'none' }, memory: next };
  const cooled = since >= syncCooldown(kind, next.streak);
  const jump = (): { action: SyncAction; memory: SyncMemory } => ({
    action: { kind: 'seek', to: seekAhead(input.target, input.seekLatencyMs, input.baseRate) },
    memory: { ...next, lastFixAt: now, streak: next.streak + 1, calmSince: null, nudged: false },
  });

  if (input.heard === 'original' && input.takeTime != null) {
    // The original is the one heard: its sound is never moved, held or sped up. The muted take follows it instead:
    // a jump of the take (a file here, quick) for big gaps, a nudge of its speed for small ones (files).
    const songSpeed = input.songSpeed && input.songSpeed > 0 ? input.songSpeed : 1;
    const over = kind === 'file' ? SYNC.file.seekOver : HEARD_YOUTUBE_SEEK_OVER;
    if (abs > over && cooled) {
      return {
        action: { kind: 'takeSeek', to: Math.max(0, Math.round((input.takeTime + drift / songSpeed) * 1000) / 1000) },
        memory: { ...next, lastFixAt: now, streak: next.streak + 1, calmSince: null, nudged: false },
      };
    }
  }

  if (kind === 'file') {
    const f = SYNC.file;
    if (abs > f.seekOver && cooled && input.heard !== 'original') return jump();
    if (abs > f.nudgeOver) {
      // drift > 0: ahead → a little slower. Past the jump threshold (cooling down) it nudges at the most.
      const factor = 1 - clamp(drift * 0.5, -f.maxNudge, f.maxNudge);
      if (input.heard === 'original') {
        // The original is heard: the take (muted) speeds up when the original is ahead, slows when it's behind.
        const takeRate = input.takeRate && input.takeRate > 0 ? input.takeRate : 1;
        return { action: { kind: 'takeRate', rate: Math.round((takeRate / factor) * 1000) / 1000 }, memory: { ...next, nudged: true } };
      }
      return { action: { kind: 'rate', rate: Math.round(input.baseRate * factor * 1000) / 1000 }, memory: { ...next, nudged: true } };
    }
    if (next.nudged) return { action: { kind: 'base' }, memory: { ...next, nudged: false } };
    return { action: { kind: 'none' }, memory: next };
  }

  const y = SYNC.youtube;
  if (!cooled || input.heard === 'original') return { action: { kind: 'none' }, memory: next };
  if (drift > y.holdOver) {
    // Playing again takes a moment too (about half a jump): the hold is that much shorter.
    const restart = clamp(Number.isFinite(input.seekLatencyMs) ? input.seekLatencyMs : 0, 0, 1500) / 2;
    const ms = Math.round((drift / (input.baseRate > 0 ? input.baseRate : 1)) * 1000 - restart);
    if (ms < 60) return { action: { kind: 'none' }, memory: next };
    if (ms <= y.maxHoldMs) {
      // The hold ends `ms` from now: that is when the next judgement may start settling.
      return { action: { kind: 'hold', ms }, memory: { ...next, lastFixAt: now + ms, streak: next.streak + 1, calmSince: null } };
    }
    return jump();
  }
  if (drift < -y.seekOver) return jump();
  return { action: { kind: 'none' }, memory: next };
}

// ───────────── Two panels: which way and how much each (51) ─────────────

/** Width / height of a picture (a phone take in portrait ≈ 0,56; YouTube 16:9 ≈ 1,78). */
export type Aspect = number;
export const YOUTUBE_ASPECT: Aspect = 16 / 9;
/**
 * YouTube's embedded player must be at least 200×200 px (its terms). Ours keeps 16:9 inside its panel, so the panel
 * needs 200 px of height and 356 of width for the player to reach that — plus its 1 px border on each side.
 */
export const YOUTUBE_MIN_BOX: Size = { width: 358, height: 202 };

/** A picture's aspect from its size, or `fallback` when unknown. */
export function aspectOf(size: { width?: number | null; height?: number | null } | null | undefined, fallback: Aspect): Aspect {
  const w = Number(size?.width);
  const h = Number(size?.height);
  return w > 0 && h > 0 ? w / h : fallback;
}

/** Area (px²) a picture of `aspect` shows inside a box (contain). */
export function containArea(box: Size, aspect: Aspect): number {
  if (!(box.width > 0) || !(box.height > 0) || !(aspect > 0)) return 0;
  const width = Math.min(box.width, box.height * aspect);
  return width * (width / aspect);
}

export interface PanelLayout {
  /** 'row': side by side · 'column': one above the other. */
  direction: 'row' | 'column';
  /** Share of the first panel (SPLIT_MIN–SPLIT_MAX). */
  split: number;
}

/** The boxes of the two panels for a way and a share (the hinge `gap` between them). */
export function panelBoxes(frame: Size, direction: PanelLayout['direction'], split: number, gap = 0): [Size, Size] {
  const total = Math.max(0, (direction === 'row' ? frame.width : frame.height) - gap);
  const a = Math.round(total * split);
  const b = Math.max(0, total - a);
  return direction === 'row'
    ? [
        { width: a, height: frame.height },
        { width: b, height: frame.height },
      ]
    : [
        { width: frame.width, height: a },
        { width: frame.width, height: b },
      ];
}

/** How far a box is from a minimum: ≥ 1 when it meets it (the smaller of its two ratios). */
function meets(box: Size, min: Size | null): number {
  if (!min) return Number.POSITIVE_INFINITY;
  return Math.min(box.width / min.width, box.height / min.height);
}

export type PanelMins = readonly [Size | null, Size | null];

const SPLIT_STEPS = 70;
const splitAt = (i: number) => Math.round((SPLIT_MIN + ((SPLIT_MAX - SPLIT_MIN) * i) / SPLIT_STEPS) * 1000) / 1000;

/**
 * The shares a way allows with each panel at least its minimum (YouTube: `YOUTUBE_MIN_BOX`). When none does (a
 * screen too small), the single share that comes closest for the panel with a minimum.
 */
export function splitBounds(frame: Size, direction: PanelLayout['direction'], gap = 0, mins: PanelMins = [null, null]): { min: number; max: number } {
  let lo: number | null = null;
  let hi: number | null = null;
  let closest = { split: 0.5, score: Number.NEGATIVE_INFINITY };
  for (let i = 0; i <= SPLIT_STEPS; i++) {
    const split = splitAt(i);
    const [a, b] = panelBoxes(frame, direction, split, gap);
    const score = Math.min(meets(a, mins[0]), meets(b, mins[1]));
    if (score >= 1) {
      lo ??= split;
      hi = split;
    }
    if (score > closest.score) closest = { split, score };
  }
  return lo != null && hi != null ? { min: lo, max: hi } : { min: closest.split, max: closest.split };
}

/**
 * «Separados»: the way (side by side or one above the other) and the share that show both pictures biggest — the
 * smaller of the two as big as it can be, then the most in total — keeping each panel at its minimum (`mins`: the
 * YouTube player never under 200×200). On a phone in landscape, a portrait take beside the YouTube video, the take
 * just as wide as it needs; in portrait, one above the other.
 */
export function bestLayout(frame: Size, first: Aspect, second: Aspect, gap = 0, mins: PanelMins = [null, null]): PanelLayout {
  let best: PanelLayout = { direction: frame.width >= frame.height ? 'row' : 'column', split: 0.5 };
  if (!(frame.width > 0) || !(frame.height > 0)) return best;
  let bestMin = -1;
  let bestSum = -1;
  let fallback = { layout: best, score: Number.NEGATIVE_INFINITY };
  for (const direction of ['column', 'row'] as const) {
    for (let i = 0; i <= SPLIT_STEPS; i++) {
      const split = splitAt(i);
      const [boxA, boxB] = panelBoxes(frame, direction, split, gap);
      const score = Math.min(meets(boxA, mins[0]), meets(boxB, mins[1]));
      if (score > fallback.score) fallback = { layout: { direction, split }, score };
      if (score < 1) continue;
      const areaA = containArea(boxA, first);
      const areaB = containArea(boxB, second);
      const min = Math.min(areaA, areaB);
      const sum = areaA + areaB;
      // 1 % margins: among near-equal layouts, the one that shows more in total (and the earlier, steadier one).
      if (min > bestMin * 1.01 || (min >= bestMin * 0.99 && sum > bestSum * 1.01)) {
        best = { direction, split };
        bestMin = min;
        bestSum = sum;
      }
    }
  }
  // Nothing meets the minimums (a tiny screen): the panel with a minimum as close to it as it gets.
  return bestMin < 0 ? fallback.layout : best;
}

// ───────────── Room for the settings (51) ─────────────

/** The take never smaller than this (px of height) while the settings are open. */
export const TAKE_MIN_HEIGHT = 120;
/** The panel of settings and notes over the take (a phone on its side): this wide when it can be. */
export const COVER_PANEL = { min: 300, max: 360 } as const;
/** The hinge between the two panels (px), as the stage draws it. */
export const PANEL_GAP = 10;

/**
 * A phone on its side: how wide the panel of settings and notes is. It opens over the take's side and the take's
 * panel is made that wide under it, so it never reaches YouTube, which keeps its minimum box: a comfortable 300–360
 * px when there is room, else all that is left beside YouTube (it then covers the take whole). With a file it takes
 * half the stage, within the same bounds.
 */
export function coverPanelWidth(stageWidth: number, youtube: boolean): number {
  if (!(stageWidth > 0)) return 0;
  const room = youtube ? stageWidth - YOUTUBE_MIN_BOX.width - PANEL_GAP : stageWidth;
  if (room <= 0) return 0;
  const wanted = youtube ? COVER_PANEL.max : clamp(stageWidth / 2, COVER_PANEL.min, COVER_PANEL.max);
  return Math.round(Math.min(wanted, room));
}

/**
 * Portrait: how tall the settings under the stage may be (`available`: the height for the stage and the settings
 * together). The stage keeps room for YouTube's minimum and a take of 120 px; the settings scroll.
 */
export function bottomSheetHeight(available: number, youtube: boolean): number {
  if (!(available > 0)) return 0;
  const stageNeed = (youtube ? YOUTUBE_MIN_BOX.height + PANEL_GAP : 0) + TAKE_MIN_HEIGHT + 16;
  const most = available * 0.6;
  return Math.round(Math.max(Math.min(140, most), Math.min(available - stageNeed, most)));
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

/** How close (s) the take must stand to a note's moment for its drawing to show. */
export const SKETCH_MOMENT = 0.2;
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
