import { demoBackend } from './core.demo';
import { supabaseBackend } from './core.supabase';
import { IS_DEMO } from './mode';
import type { Backend } from './types';

// REQ-08 · `IS_DEMO` is a build-time constant (false in production), so the demo branch and its module drop out.
export const backend: Backend = IS_DEMO ? demoBackend : supabaseBackend;

export type {
  Backend,
  ClipVideo,
  ClipWithVideo,
  LibraryVideo,
  ListedNote,
  NoteSketch,
  NotePatch,
  StorageUsage,
  TakePatch,
  UploadFailure,
  UploadOptions,
  UploadResult,
  VideoPoster,
  VideoPosterRev,
  VideoWithClipCount,
} from './types';
