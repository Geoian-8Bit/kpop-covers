// REQ-27 · Barrel: the player state lives in playerStore.ts (studio), reviewStore.ts (take vs original), prefs.ts and
// loopActions.ts. Importers keep using '@/player/store'.
export { hasRange } from './loopActions';
export { usePlayer } from './playerStore';
export { msSinceReviewAlign, reviewOriginalRate, useReview } from './reviewStore';
