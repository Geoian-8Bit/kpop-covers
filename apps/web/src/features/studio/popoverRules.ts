/** Breathing room kept between a popover and the screen's edge, in px. */
export const POPOVER_EDGE = 12;

/**
 * How far to slide a popover sideways so it stays on screen: positive moves it right, negative left.
 * `left`/`width` are its box as laid out (before any shift); when it is wider than the room available
 * it lines up with the left margin.
 */
export function popoverShift(left: number, width: number, viewportWidth: number, edge = POPOVER_EDGE): number {
  if (!(viewportWidth > 0) || !(width > 0)) return 0;
  const min = edge;
  const max = viewportWidth - edge;
  if (width >= max - min) return Math.round(min - left);
  if (left < min) return Math.round(min - left);
  if (left + width > max) return Math.round(max - (left + width));
  return 0;
}

/** Which way an anchored popover opens: where its classes put it, flipped below its button, or a bottom sheet. */
export type PopoverSide = 'natural' | 'below' | 'sheet';

export interface PopoverFit {
  /** The popover's box where its classes put it (above its button), before any shift. */
  top: number;
  height: number;
  /** Its button's (anchor's) box. */
  anchorTop: number;
  anchorBottom: number;
  /** Lowest edge of what sits pinned over the page above it (the top bar, the pinned video); 0 for none. */
  ceiling: number;
  /** The screen's bottom edge (the viewport's height). */
  floor: number;
  /** A phone-sized screen: there a popover that fits nowhere becomes a sheet along the bottom. */
  narrow: boolean;
}

/**
 * Whether a popover that fits nowhere becomes a bottom sheet: a narrow screen, a short one (a phone on its side,
 * 844×390, where the top bar alone takes 64 px) or a touch screen, where dragging to see a cut-off menu would close it.
 */
export function sheetScreen({ width, height, coarse }: { width: number; height: number; coarse: boolean }): boolean {
  return width < 640 || (height > 0 && height < 500) || coarse;
}

/** Arrow-key moves in a grid menu: the next item's index, or null for a key that doesn't move. Wraps sideways. */
export function menuStep(at: number, count: number, key: string, columns: number): number | null {
  if (count <= 0 || at < 0) return null;
  const cols = Math.max(1, columns);
  switch (key) {
    case 'ArrowRight':
      return (at + 1) % count;
    case 'ArrowLeft':
      return (at - 1 + count) % count;
    case 'ArrowDown':
      // Into a shorter last row: its last item. Already on the last row: stays.
      if (at + cols < count) return at + cols;
      return Math.floor(at / cols) < Math.floor((count - 1) / cols) ? count - 1 : at;
    case 'ArrowUp':
      return at - cols >= 0 ? at - cols : at;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * 7 · Keeps a popover that opens upwards clear of what is pinned above it (on phones the video stays pinned under
 * the top bar and used to cover the speed and pause menus): it stays put when it fits under the `ceiling`, opens
 * below its button (same gap) when that fits above the screen's bottom, and otherwise becomes a bottom sheet on a
 * phone, or takes the roomier side on a bigger screen.
 */
export function popoverSide(fit: PopoverFit, edge = POPOVER_EDGE): PopoverSide {
  const { top, height, anchorTop, anchorBottom, ceiling, floor, narrow } = fit;
  if (!(height > 0) || !(floor > 0)) return 'natural';
  const minTop = Math.max(0, ceiling) + edge;
  if (top >= minTop) return 'natural';
  const gap = Math.max(0, anchorTop - (top + height));
  const belowBottom = anchorBottom + gap + height;
  if (belowBottom <= floor - edge) return 'below';
  if (narrow) return 'sheet';
  // Neither fits on a big screen: the side with more of it showing.
  return floor - anchorBottom > anchorTop - minTop ? 'below' : 'natural';
}
