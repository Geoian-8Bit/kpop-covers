/**
 * 54 · Full screen for the round, the studio's way: the browser's own full screen where it exists, and where it
 * doesn't (iPhone Safari only allows it on a bare <video>) the round's «video only» layout over the page, which
 * already covers the whole app. Pure rules (no DOM): `fullscreenRules.test.ts`.
 */

/** none: the round's usual screen. native: the browser's full screen. css: the same layout, without the API. */
export type FullscreenMode = 'none' | 'native' | 'css';

export type FullscreenStep = 'exit-native' | 'leave-css' | 'request-native' | 'enter-css';

/** What the «Pantalla completa» button does now. */
export function fullscreenStep(mode: FullscreenMode, nativeAvailable: boolean): FullscreenStep {
  if (mode === 'native') return 'exit-native';
  if (mode === 'css') return 'leave-css';
  return nativeAvailable ? 'request-native' : 'enter-css';
}

/**
 * Esc in full screen: the browser's own full screen keeps Esc for itself (it leaves full screen and the round
 * goes on); the CSS one does the same by hand. Only outside full screen does Esc ask to leave the round.
 */
export function escapeInFullscreen(mode: FullscreenMode): 'browser' | 'leave-css' | null {
  if (mode === 'native') return 'browser';
  if (mode === 'css') return 'leave-css';
  return null;
}

/**
 * Where the round's actions go. normal: the usual screen. below: full screen upright, a bar under the picture.
 * overlay: full screen sideways (how it is used: the phone turned, the video as tall as the screen), the studio's
 * bar on the bottom edge that hides by itself while the clip plays.
 */
export type BarLayout = 'normal' | 'below' | 'overlay';

export function barLayout(fullscreen: boolean, landscape: boolean): BarLayout {
  if (!fullscreen) return 'normal';
  return landscape ? 'overlay' : 'below';
}

/**
 * A tap on the picture. With the bar on the edge (sideways full screen), as in the studio: a hidden bar comes
 * back, a shown one goes; pausing is the bar's own button. Otherwise the tap pauses or resumes, as always.
 */
export function stageTap(layout: BarLayout, barShown: boolean): 'toggle-pause' | 'show-bar' | 'hide-bar' {
  if (layout !== 'overlay') return 'toggle-pause';
  return barShown ? 'hide-bar' : 'show-bar';
}
