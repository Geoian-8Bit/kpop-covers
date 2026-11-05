import { clamp } from '@coverscape/shared';
import { SPLIT_MAX, SPLIT_MIN } from './reviewBasics';
import type { Size } from './reviewFit';

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
export function aspectOf(
  size: { width?: number | null; height?: number | null } | null | undefined,
  fallback: Aspect,
): Aspect {
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
export function panelBoxes(
  frame: Size,
  direction: PanelLayout['direction'],
  split: number,
  gap = 0,
): [Size, Size] {
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
const splitAt = (i: number) =>
  Math.round((SPLIT_MIN + ((SPLIT_MAX - SPLIT_MIN) * i) / SPLIT_STEPS) * 1000) / 1000;

/**
 * The shares a way allows with each panel at least its minimum (YouTube: `YOUTUBE_MIN_BOX`). When none does (a
 * screen too small), the single share that comes closest for the panel with a minimum.
 */
export function splitBounds(
  frame: Size,
  direction: PanelLayout['direction'],
  gap = 0,
  mins: PanelMins = [null, null],
): { min: number; max: number } {
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
export function bestLayout(
  frame: Size,
  first: Aspect,
  second: Aspect,
  gap = 0,
  mins: PanelMins = [null, null],
): PanelLayout {
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
const COVER_PANEL = { min: 300, max: 360 } as const;
/** The hinge between the two panels (px), as the stage draws it. */
const PANEL_GAP = 10;

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
