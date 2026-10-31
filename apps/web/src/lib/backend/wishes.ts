import { IS_DEMO } from './mode';
import type { WishesBackend } from './types';
import { demoWishes } from './wishes.demo';
import { supabaseWishes } from './wishes.supabase';

// REQ-08 · `IS_DEMO` is a build-time constant (false in production), so the demo branch and its module drop out.
export const wishesBackend: WishesBackend = IS_DEMO ? demoWishes : supabaseWishes;

export { NEW_POLL_RULES } from './shared';
export type {
  CloseResolve,
  CloseResult,
  NewPoll,
  NewWish,
  PollPatch,
  WishesBackend,
  WishPatch,
} from './types';
