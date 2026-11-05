import { IS_DEMO } from './mode';
import { demoPush } from './push.demo';
import { supabasePush } from './push.supabase';
import type { PushBackend } from './types';

// REQ-08 · `IS_DEMO` is a build-time constant (false in production), so the demo branch and its module drop out.
export const pushBackend: PushBackend = IS_DEMO ? demoPush : supabasePush;

export type { PushBackend, PushKeys } from './types';
