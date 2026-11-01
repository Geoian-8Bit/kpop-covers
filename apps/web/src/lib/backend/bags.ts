import { demoBags } from './bags.demo';
import { supabaseBags } from './bags.supabase';
import { IS_DEMO } from './mode';
import type { BagsBackend } from './types';

// REQ-08 · `IS_DEMO` is a build-time constant (false in production), so the demo branch and its module drop out.
export const bagsBackend: BagsBackend = IS_DEMO ? demoBags : supabaseBags;

export type {
  BagHoldingRef,
  BagItemClip,
  BagItemMember,
  BagItemVideo,
  BagItemView,
  BagItemWish,
  BagPatch,
  BagsBackend,
  BagWithCount,
  NewBag,
  NewBagItem,
  PlayableVideo,
  TrackItemView,
  TrackOptionsRow,
  TrackPatch,
  TrackWithCount,
} from './types';
