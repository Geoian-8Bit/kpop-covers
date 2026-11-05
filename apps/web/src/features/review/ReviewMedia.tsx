/**
 * F5 · 51 · The review's two media: the take (the clock, with the sound) and the original (a file with its F1
 * offset, or YouTube's own player, shown whole). They register their engines in the review store; the clock below
 * keeps the original with the take (rules in `reviewRules.syncStep`). The take never waits for the original: a
 * dancer pressing play hears the take at once, and the original catches up.
 *
 * REQ-27 · Split into `TakeVideo`, `OriginalMedia` and `useReviewClock` (they share `reviewMediaSlot`); this barrel
 * keeps the old import path.
 */
export { TakeVideo } from './TakeVideo';
export { OriginalFile, OriginalYouTube } from './OriginalMedia';
export { useReviewClock } from './useReviewClock';
