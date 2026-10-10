import type { Clip, Crew, Profile, TablesInsert, TablesUpdate, Video } from '@coverscape/shared';
import { supabase, VIDEO_BUCKET } from './supabase';

/**
 * Data access behind one interface so the app can run against Supabase (normal) or against
 * browser storage (local demo: `VITE_DEMO=true` in dev only – no login, nothing leaves the device).
 */
export const IS_DEMO = import.meta.env.DEV && import.meta.env.VITE_DEMO === 'true';
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';

export type ClipVideo = Pick<Video, 'id' | 'title' | 'artist' | 'source' | 'youtube_id' | 'thumbnail_url'>;
export type ClipWithVideo = Clip & { video: ClipVideo | null };
export type VideoWithClipCount = Video & { clips: { count: number }[] };

export interface Backend {
  joinGroup(): Promise<Crew>;
  getProfile(userId: string): Promise<Profile | null>;
  listVideos(crewId: string): Promise<VideoWithClipCount[]>;
  getVideo(id: string): Promise<Video | null>;
  insertVideo(row: TablesInsert<'videos'> & { id: string }): Promise<Video>;
  updateVideo(id: string, patch: TablesUpdate<'videos'>): Promise<Video>;
  deleteVideo(video: Video): Promise<void>;
  listClips(videoId: string): Promise<Clip[]>;
  listQuickClips(crewId: string): Promise<ClipWithVideo[]>;
  insertClip(row: TablesInsert<'clips'>): Promise<Clip>;
  updateClip(id: string, patch: TablesUpdate<'clips'>): Promise<Clip>;
  deleteClip(id: string): Promise<void>;
  /** Returns the storage path, or null when the file stays on this device only. */
  uploadFile(path: string, file: File): Promise<string | null>;
  removeFile(path: string): Promise<void>;
  signedUrl(path: string): Promise<string | null>;
}

// ───────────────────────────── Supabase ─────────────────────────────

const supabaseBackend: Backend = {
  async joinGroup() {
    // Open access: the shared group is the oldest crew; readable without a session.
    const { data, error } = await supabase.from('crews').select('*').order('created_at').limit(1).single();
    if (error) throw error;
    return data;
  },
  async getProfile(userId) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data;
  },
  async listVideos(crewId) {
    const { data, error } = await supabase
      .from('videos')
      .select('*, clips(count)')
      .eq('crew_id', crewId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as unknown as VideoWithClipCount[];
  },
  async getVideo(id) {
    const { data, error } = await supabase.from('videos').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data as Video | null;
  },
  async insertVideo(row) {
    const { data, error } = await supabase.from('videos').insert(row).select().single();
    if (error) throw error;
    return data as Video;
  },
  async updateVideo(id, patch) {
    const { data, error } = await supabase.from('videos').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data as Video;
  },
  async deleteVideo(video) {
    const { error } = await supabase.from('videos').delete().eq('id', video.id);
    if (error) throw error;
  },
  async listClips(videoId) {
    const { data, error } = await supabase.from('clips').select('*').eq('video_id', videoId).order('start_seconds');
    if (error) throw error;
    return data as Clip[];
  },
  async listQuickClips(crewId) {
    const { data, error } = await supabase
      .from('clips')
      .select('*, video:videos(id, title, artist, source, youtube_id, thumbnail_url)')
      .eq('crew_id', crewId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(14);
    if (error) throw error;
    return data as unknown as ClipWithVideo[];
  },
  async insertClip(row) {
    const { data, error } = await supabase.from('clips').insert(row).select().single();
    if (error) throw error;
    return data as Clip;
  },
  async updateClip(id, patch) {
    const { data, error } = await supabase.from('clips').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data as Clip;
  },
  async deleteClip(id) {
    const { error } = await supabase.from('clips').delete().eq('id', id);
    if (error) throw error;
  },
  async uploadFile(path, file) {
    const { error } = await supabase.storage
      .from(VIDEO_BUCKET)
      .upload(path, file, { contentType: file.type || 'video/mp4', upsert: true });
    return error ? null : path;
  },
  async removeFile(path) {
    await supabase.storage.from(VIDEO_BUCKET).remove([path]);
  },
  async signedUrl(path) {
    const { data, error } = await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(path, 6 * 60 * 60);
    return error ? null : data.signedUrl;
  },
};

// ───────────────────────────── Local demo ─────────────────────────────

interface DemoDb {
  crews: Crew[];
  profiles: Profile[];
  videos: Video[];
  clips: Clip[];
}

const DEMO_KEY = 'coverscape.demo.v1';
const now = () => new Date().toISOString();

function readDb(): DemoDb {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (raw) return JSON.parse(raw) as DemoDb;
  } catch {
    /* fall through to a fresh db */
  }
  const db: DemoDb = {
    crews: [{ id: crypto.randomUUID(), name: 'Demo', invite_code: 'DEMO0000', created_by: DEMO_USER_ID, created_at: now() }],
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

function mutate<T>(fn: (db: DemoDb) => T): Promise<T> {
  const db = readDb();
  const result = fn(db);
  writeDb(db);
  return Promise.resolve(structuredClone(result));
}

const query = <T>(fn: (db: DemoDb) => T): Promise<T> => Promise.resolve(structuredClone(fn(readDb())));

const demoBackend: Backend = {
  joinGroup: () => query((db) => db.crews[0]!),
  getProfile: (userId) => query((db) => db.profiles.find((p) => p.id === userId) ?? null),
  listVideos: (crewId) =>
    query((db) =>
      db.videos
        .filter((v) => v.crew_id === crewId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((v) => ({ ...v, clips: [{ count: db.clips.filter((c) => c.video_id === v.id).length }] })),
    ),
  getVideo: (id) => query((db) => db.videos.find((v) => v.id === id) ?? null),
  insertVideo: (row) =>
    mutate((db) => {
      const video = {
        artist: null,
        storage_path: null,
        file_name: null,
        file_size: null,
        duration_seconds: null,
        thumbnail_url: null,
        youtube_id: null,
        created_by: DEMO_USER_ID,
        created_at: now(),
        updated_at: now(),
        ...row,
      } as Video;
      db.videos.push(video);
      return video;
    }),
  updateVideo: (id, patch) =>
    mutate((db) => {
      const video = db.videos.find((v) => v.id === id);
      if (!video) throw new Error('not found');
      Object.assign(video, patch, { updated_at: now() });
      return video;
    }),
  deleteVideo: (video) =>
    mutate((db) => {
      db.videos = db.videos.filter((v) => v.id !== video.id);
      db.clips = db.clips.filter((c) => c.video_id !== video.id);
    }),
  listClips: (videoId) =>
    query((db) => db.clips.filter((c) => c.video_id === videoId).sort((a, b) => a.start_seconds - b.start_seconds)),
  listQuickClips: (crewId) =>
    query((db) =>
      db.clips
        .filter((c) => c.crew_id === crewId)
        .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || b.created_at.localeCompare(a.created_at))
        .slice(0, 14)
        .map((c) => {
          const v = db.videos.find((x) => x.id === c.video_id);
          return {
            ...c,
            video: v
              ? { id: v.id, title: v.title, artist: v.artist, source: v.source, youtube_id: v.youtube_id, thumbnail_url: v.thumbnail_url }
              : null,
          };
        }),
    ),
  insertClip: (row) =>
    mutate((db) => {
      const video = db.videos.find((v) => v.id === row.video_id);
      const clip = {
        id: crypto.randomUUID(),
        speed: 1,
        mirrored: true,
        color: 'wine',
        is_pinned: false,
        created_by: DEMO_USER_ID,
        created_at: now(),
        ...row,
        crew_id: video?.crew_id ?? row.crew_id,
      } as Clip;
      db.clips.push(clip);
      return clip;
    }),
  updateClip: (id, patch) =>
    mutate((db) => {
      const clip = db.clips.find((c) => c.id === id);
      if (!clip) throw new Error('not found');
      Object.assign(clip, patch);
      return clip;
    }),
  deleteClip: (id) =>
    mutate((db) => {
      db.clips = db.clips.filter((c) => c.id !== id);
    }),
  uploadFile: () => Promise.resolve(null),
  removeFile: () => Promise.resolve(),
  signedUrl: () => Promise.resolve(null),
};

export const backend: Backend = IS_DEMO ? demoBackend : supabaseBackend;
