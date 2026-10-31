import { isVerticalAspect } from '@coverscape/shared';

/** «Fijar orientación» in fullscreen: follow the phone, or hold upright / sideways. */
export type OrientationPref = 'auto' | 'portrait' | 'landscape';

/** The button cycles automática → vertical → horizontal → automática. */
export function nextOrientationPref(pref: OrientationPref): OrientationPref {
  return pref === 'auto' ? 'portrait' : pref === 'portrait' ? 'landscape' : 'auto';
}

/** Spanish name of the state, for the button's accessible name. */
export function orientationLabel(pref: OrientationPref): string {
  return pref === 'auto' ? 'automática' : pref === 'portrait' ? 'vertical' : 'horizontal';
}

/** What the button's accessible name says: the current state, and what a press does. */
export function orientationButtonLabel(pref: OrientationPref): string {
  return `Fijar orientación: ${orientationLabel(pref)}. Cambiar a ${orientationLabel(nextOrientationPref(pref))}`;
}

/** The value for `screen.orientation.lock()`, or null when nothing is to be locked. */
export function lockTarget(pref: OrientationPref): 'portrait' | 'landscape' | null {
  return pref === 'auto' ? null : pref;
}

/**
 * The content turns 90° with CSS when a fixed orientation differs from the device's and the system did not do it
 * (iPhone has no lock; or the lock was refused). With the lock held the device itself turns: nothing to rotate.
 */
export function needsCssRotation(opts: { pref: OrientationPref; deviceLandscape: boolean; lockHeld: boolean }): boolean {
  if (opts.pref === 'auto' || opts.lockHeld) return false;
  return (opts.pref === 'landscape') !== opts.deviceLandscape;
}

/**
 * The button only shows where it can do something: the CSS fullscreen (iPhone), or a touch screen (a phone or
 * tablet turns). A mouse-only desktop has nothing to turn.
 */
export function showOrientationButton(opts: { cssMode: boolean; touch: boolean }): boolean {
  return opts.cssMode || opts.touch;
}

/** Whether the video on the stage is vertical: the file's own size when known, else the stored YouTube ratio. */
export function stageIsVertical(opts: {
  media: { width: number; height: number } | null;
  aspectRatio: number | null | undefined;
}): boolean {
  if (opts.media && opts.media.width > 0 && opts.media.height > 0) return opts.media.height > opts.media.width;
  return isVerticalAspect(opts.aspectRatio);
}

/**
 * The proportion of the YouTube frame in fullscreen. Horizontal (or unknown) stays 16:9, where the 24 % crop that
 * hides the title still works; a vertical video takes its own shape and is not cropped.
 */
export function youtubeFrameRatio(aspectRatio: number | null | undefined): number {
  return isVerticalAspect(aspectRatio) ? (aspectRatio as number) : 16 / 9;
}

/**
 * How much a vertical YouTube frame may grow past «fits whole» in fullscreen, cropping only its sides: 1.25 covers
 * a 9:16 short on phones up to 20:9 (390×844 needs 1.22), so it fills the upright screen with no bands.
 */
export const VERTICAL_FILL_ZOOM = 1.25;

/**
 * The YouTube frame box in fullscreen (the stage is a size container). Horizontal or unknown: 16:9, the largest that
 * fits. Vertical: as tall as the screen, its sides cropped up to VERTICAL_FILL_ZOOM, never its top or bottom (heads
 * and feet stay); on a wide screen that leaves side bands, the minimum its shape asks for.
 */
export function youtubeFsBox(aspectRatio: number | null | undefined): { aspectRatio: string; width: string } {
  const r = youtubeFrameRatio(aspectRatio);
  if (!isVerticalAspect(aspectRatio)) return { aspectRatio: String(r), width: `min(100cqw, calc(100cqh * ${r}))` };
  return { aspectRatio: String(r), width: `min(calc(100cqh * ${r}), calc(100cqw * ${VERTICAL_FILL_ZOOM}))` };
}

/** Outside fullscreen a vertical YouTube video keeps its own shape, centred and no taller than ~60 % of the screen. */
export function youtubeInlineBox(aspectRatio: number | null | undefined): { aspectRatio: string; width: string } | null {
  if (!isVerticalAspect(aspectRatio)) return null;
  return { aspectRatio: String(aspectRatio), width: `min(100%, calc(60dvh * ${aspectRatio}))` };
}

/**
 * Videos saved before REQ-02, from the search, or measured through /watch?v= (always 16:9) may be vertical while
 * stored as unknown or horizontal: the studio asks oEmbed again for those. A stored vertical ratio is trusted.
 */
export function needsAspectProbe(video: { youtube_id: string | null; aspect_ratio: number | null | undefined }): boolean {
  return Boolean(video.youtube_id) && !isVerticalAspect(video.aspect_ratio);
}

/** The ratio the stage uses: a fresh measurement when there is one, else the stored value. */
export function resolveAspect(stored: number | null | undefined, probed: number | null | undefined): number | null {
  if (typeof probed === 'number' && Number.isFinite(probed) && probed > 0) return probed;
  return stored ?? null;
}

/**
 * Where a pointer falls along an element's own horizontal axis, 0–1. In the CSS-turned fullscreen (`turned`, a
 * 90° clockwise turn) that axis runs down the screen, so the screen's vertical position is the one that counts.
 */
export function axisFraction(
  point: { clientX: number; clientY: number },
  rect: { left: number; top: number; width: number; height: number },
  turned: boolean,
): number {
  const f = turned ? (point.clientY - rect.top) / rect.height : (point.clientX - rect.left) / rect.width;
  return Number.isFinite(f) ? Math.min(1, Math.max(0, f)) : 0;
}

/** The fullscreen layer is turned with CSS (marked `data-fs-turned` on the stage). */
export function inTurnedLayer(el: Element | null | undefined): boolean {
  return Boolean(el?.closest('[data-fs-turned]'));
}

/**
 * A pointer in an element's own (layout) coordinates, px from its top-left corner. In the CSS-turned fullscreen
 * (`turned`: 90° clockwise, see ROTATED_STAGE_STYLE) the element's x runs down the screen and its y runs right to
 * left, while `rect` (getBoundingClientRect) is in screen axes; so the zoom's pinch and drag land where the fingers
 * are on the turned picture.
 */
export function layerPoint(
  point: { clientX: number; clientY: number },
  rect: { left: number; top: number; width: number; height: number },
  turned: boolean,
): { x: number; y: number } {
  if (!turned) return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  return { x: point.clientY - rect.top, y: rect.left + rect.width - point.clientX };
}
