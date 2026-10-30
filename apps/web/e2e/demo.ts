import type { Page } from '@playwright/test';

/**
 * REQ-00 · Seeds the local demo's browser storage (src/lib/backend.ts, key `coverscape.demo.v1`) before the app
 * runs. Only the demo store: nothing here can reach Supabase.
 */
export const DEMO_KEY = 'coverscape.demo.v1';
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';
export const CREW_ID = '00000000-0000-4000-8000-0000000000c1';
/** A YouTube entry (the player is muted in the demo, see devSilence.ts). */
export const VIDEO_ID = '00000000-0000-4000-8000-0000000000a1';

const T0 = '2026-01-01T10:00:00.000Z';

export interface SeedMember {
  id: string;
  name: string;
  color: string;
}

export const MEMBERS: SeedMember[] = [
  { id: '00000000-0000-4000-8000-0000000000e1', name: 'Hana', color: 'shu' },
  { id: '00000000-0000-4000-8000-0000000000e2', name: 'Mina', color: 'ai' },
  { id: '00000000-0000-4000-8000-0000000000e3', name: 'Yuna', color: 'kin' },
];

export interface SeedOptions {
  members?: SeedMember[];
  /** Adds the YouTube song `VIDEO_ID`. */
  video?: boolean;
  /** Extra tables merged into the store as they are. */
  extra?: Record<string, unknown>;
}

export function demoDb({ members = MEMBERS, video = true, extra = {} }: SeedOptions = {}) {
  return {
    crews: [{ id: CREW_ID, name: 'Demo', invite_code: 'DEMO0000', created_by: DEMO_USER_ID, created_at: T0 }],
    profiles: [{ id: DEMO_USER_ID, display_name: 'Demo', avatar_hue: 210, created_at: T0 }],
    videos: video
      ? [
          {
            id: VIDEO_ID,
            crew_id: CREW_ID,
            title: 'PRUEBA canción',
            artist: 'Demo',
            source: 'youtube',
            youtube_id: 'WPdWvnAAurg',
            storage_path: null,
            file_name: null,
            file_size: null,
            file_duration_seconds: null,
            file_offset_seconds: null,
            duration_seconds: 180,
            thumbnail_url: null,
            aspect_ratio: null,
            created_by: DEMO_USER_ID,
            archived_at: null,
            created_at: T0,
            updated_at: T0,
          },
        ]
      : [],
    clips: [],
    notes: [],
    takes: [],
    members: members.map((m) => ({ ...m, crew_id: CREW_ID, created_at: T0, archived_at: null })),
    ...extra,
  };
}

/**
 * Writes the store once per test (an init script runs on every navigation; the sessionStorage flag keeps later
 * reloads from wiping what the test did).
 */
export async function seedDemo(page: Page, options: SeedOptions = {}): Promise<void> {
  const db = demoDb(options);
  await page.addInitScript(
    ([key, value]) => {
      if (sessionStorage.getItem('e2e.seeded')) return;
      localStorage.clear();
      localStorage.setItem(key, value);
      sessionStorage.setItem('e2e.seeded', '1');
    },
    [DEMO_KEY, JSON.stringify(db)] as const,
  );
}

/** The demo store as the app left it. */
export async function readDemo<T = Record<string, unknown>>(page: Page): Promise<T> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), DEMO_KEY) as Promise<T>;
}
