/**
 * F5 · 51 · Starting the review from a pause: jump the original only if it isn't already where it should be (a jump
 * makes YouTube load again and start late). `drift` is the original's time minus where it should be (s).
 */
export function needsAlignOnPlay(kind: 'file' | 'youtube', drift: number): boolean {
  if (!Number.isFinite(drift)) return true;
  return Math.abs(drift) > (kind === 'file' ? 0.06 : 0.25);
}
