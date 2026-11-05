import { IS_DEMO } from './mode';
import { demoStems } from './stems.demo';
import { supabaseStems } from './stems.supabase';
import type { StemsBackend } from './types';

// REQ-08 · `IS_DEMO` is a build-time constant (false in production), so the demo branch and its module drop out.
export const stemsBackend: StemsBackend = IS_DEMO ? demoStems : supabaseStems;

export type { StemsBackend, VideoStems } from './types';
