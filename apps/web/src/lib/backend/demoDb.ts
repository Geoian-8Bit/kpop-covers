import type { Clip, Crew, Member, Note, Profile, Take, Video } from '@coverscape/shared';
import { DEMO_USER_ID } from './mode';

// REQ-08 · The local demo's store. Only the `*.demo.ts` twins import it, and they are only reached behind the
// build-time `IS_DEMO` constant, so none of this reaches a production bundle (checked by grepping the build).

export interface DemoDb {
  crews: Crew[];
  profiles: Profile[];
  videos: Video[];
  clips: Clip[];
  /** Added later; older demo stores don't have it yet. */
  notes?: Note[];
  members?: Member[];
  takes?: Take[];
}

const DEMO_KEY = 'coverscape.demo.v1';
export const now = () => new Date().toISOString();

export function readDb(): DemoDb {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (raw) return JSON.parse(raw) as DemoDb;
  } catch {
    /* fall through to a fresh db */
  }
  const db: DemoDb = {
    crews: [
      {
        id: crypto.randomUUID(),
        name: 'Demo',
        invite_code: 'DEMO0000',
        created_by: DEMO_USER_ID,
        created_at: now(),
      },
    ],
    profiles: [{ id: DEMO_USER_ID, display_name: 'Demo', avatar_hue: 210, created_at: now() }],
    videos: [],
    clips: [],
  };
  writeDb(db);
  return db;
}

function writeDb(db: DemoDb) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(db));
}

export function mutate<T>(fn: (db: DemoDb) => T): Promise<T> {
  const db = readDb();
  const result = fn(db);
  writeDb(db);
  return Promise.resolve(structuredClone(result));
}

export const query = <T>(fn: (db: DemoDb) => T): Promise<T> => Promise.resolve(structuredClone(fn(readDb())));

export const demoError = (message: string, code = 'P0001') => Object.assign(new Error(message), { code });

export const isLive = <T extends { archived_at: string | null }>(row: T) => row.archived_at == null;
