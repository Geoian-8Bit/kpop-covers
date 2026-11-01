import type { BagHoldingRef } from '@/lib/backend/bags';

// REQ-08 · The bag query keys apart from `bags.ts` (hooks and mutations used by lazy screens only), so the events
// code in the entry chunk can invalidate them without carrying all of it.

/**
 * F13 · Bolsas para sortear: shared by the group. The draw happens on the server (atomic); here only the cache
 * follows: after a draw or a «Quitar» / «Devolver» the bag's items and history are fetched again.
 */
export const bagKeys = {
  all: ['bags'] as const,
  items: (bagId: string | undefined) => ['bag-items', bagId] as const,
  draws: (bagId: string | undefined) => ['bag-draws', bagId] as const,
  allClips: ['all-clips'] as const,
  /** REQ-19 · Which bags already hold a song, wish or clip (one query for «Añadir a una bolsa»). */
  holding: (ref: BagHoldingRef) => ['bag-holding', ref] as const,
  holdingAll: ['bag-holding'] as const,
};
