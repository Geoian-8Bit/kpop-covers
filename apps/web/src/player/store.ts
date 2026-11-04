// REQ-27 · Barrel: the player state lives in playerStore.ts (studio), reviewStore.ts (take vs original), prefs.ts and
// loopActions.ts. Importers keep using '@/player/store'.
export { hasRange, type LoopState } from './loopActions';
export { usePlayer, playState, scrubState, type ClipSettings } from './playerStore';
export {
  msSinceReviewAlign,
  reviewAlignState,
  reviewOriginalRate,
  useReview,
  type ReviewAudio,
  type ReviewTiming,
} from './reviewStore';
