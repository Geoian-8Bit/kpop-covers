/**
 * REQ-06 · What the formations' timeline shows on a phone. A whole song squeezed into ~300 px puts formations a few
 * pixels apart (their 44 px markers pile up), so a long song is shown through a window of a few seconds that pages
 * with the playhead, with a strip of the whole song under it.
 */

/** Seconds the window shows (≈ 10 px per second on an upright phone). */
export const TIMELINE_WINDOW = 30;

export interface TimelineView {
  from: number;
  to: number;
}

/** True when the song is long enough to need the window (and the strip of the whole song). */
export function needsWindow(span: number, size = TIMELINE_WINDOW): boolean {
  return span > size * 1.5;
}

/**
 * The stretch shown around `time`. Short songs: all of it. Long ones: pages of `size` seconds that move by 80 % of a
 * page, so the playhead always has a fifth of the window ahead of it; the last page ends at the end of the song.
 */
export function timelineWindow(time: number, span: number, size = TIMELINE_WINDOW): TimelineView {
  if (span <= 0) return { from: 0, to: 0 };
  if (!needsWindow(span, size)) return { from: 0, to: span };
  const step = size * 0.8;
  const page = Math.floor(Math.max(0, Math.min(time, span)) / step);
  const from = Math.min(page * step, span - size);
  return { from, to: from + size };
}

/** Where `t` falls in the view, 0–100 (%); outside it, clamped to the edges. */
export function viewPct(t: number, view: TimelineView): number {
  const len = view.to - view.from;
  if (len <= 0) return 0;
  return Math.min(100, Math.max(0, ((t - view.from) / len) * 100));
}

/** Whether `t` is inside the view (with a little slack so a marker on the edge still shows). */
export function inView(t: number, view: TimelineView, slack = 0.01): boolean {
  return t >= view.from - slack && t <= view.to + slack;
}
