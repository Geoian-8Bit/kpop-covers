import type {
  Clip,
  Crew,
  Member,
  MemberColor,
  Note,
  Profile,
  Take,
  TablesInsert,
  TablesUpdate,
  Video,
} from '@coverscape/shared';
import { supabase, TAKE_BUCKET, VIDEO_BUCKET } from './supabase';

/**
 * Data access behind one interface so the app can run against Supabase (normal) or against
 * browser storage (local demo: `VITE_DEMO=true` in dev only – no login, nothing leaves the device).
 */
export const IS_DEMO = import.meta.env.DEV && import.meta.env.VITE_DEMO === 'true';
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';

// No thumbnail: an uploaded video's poster is an inline data URL, and the quick row would repeat it once per clip.
export type ClipVideo = Pick<Video, 'id' | 'title' | 'artist' | 'source' | 'youtube_id'>;
export type ClipWithVideo = Clip & { video: ClipVideo | null };

/** Only what the library cards and the add dialog read (file_name: «con archivo», F1); no audit columns. */
const LIBRARY_COLUMNS =
  'id, crew_id, title, artist, source, youtube_id, thumbnail_url, duration_seconds, created_at, file_name';
export type LibraryVideo = Pick<
  Video,
  | 'id'
  | 'crew_id'
  | 'title'
  | 'artist'
  | 'source'
  | 'youtube_id'
  | 'thumbnail_url'
  | 'duration_seconds'
  | 'created_at'
  | 'file_name'
>;
export type VideoWithClipCount = LibraryVideo & { clips: { count: number }[] };

/** Why a file stayed on this device instead of reaching the group's cloud. */
/** 'exists': a file with that name is already there (a take's earlier upload that went through). */
export type UploadFailure = 'too-big' | 'type' | 'network' | 'denied' | 'unavailable' | 'exists';
export type UploadResult = { ok: true; path: string } | { ok: false; reason: UploadFailure };

function uploadFailure(error: unknown): UploadFailure {
  const e = (error ?? {}) as { name?: string; status?: number; statusCode?: string; code?: string; message?: string };
  const status = Number(e.status ?? e.statusCode) || 0;
  const message = e.message ?? '';
  if (status === 413 || e.code === 'EntityTooLarge' || /too large|maximum allowed size|exceeded the maximum/i.test(message)) {
    return 'too-big';
  }
  if (status === 415 || e.code === 'InvalidMimeType' || /mime type/i.test(message)) return 'type';
  if (e.name === 'StorageUnknownError' || !status || /failed to fetch|network|load failed/i.test(message)) return 'network';
  return 'denied';
}

export interface StorageUsage {
  takes: number;
  total: number;
}

export interface Backend {
  joinGroup(): Promise<Crew>;
  getProfile(userId: string): Promise<Profile | null>;
  listVideos(crewId: string): Promise<VideoWithClipCount[]>;
  getVideo(id: string): Promise<Video | null>;
  insertVideo(row: TablesInsert<'videos'> & { id: string }): Promise<Video>;
  updateVideo(id: string, patch: TablesUpdate<'videos'>): Promise<Video>;
  deleteVideo(video: Pick<Video, 'id'>): Promise<void>;
  listClips(videoId: string): Promise<Clip[]>;
  listQuickClips(crewId: string): Promise<ClipWithVideo[]>;
  insertClip(row: TablesInsert<'clips'>): Promise<Clip>;
  updateClip(id: string, patch: TablesUpdate<'clips'>): Promise<Clip>;
  deleteClip(id: string): Promise<void>;
  listNotes(videoId: string): Promise<Note[]>;
  insertNote(row: TablesInsert<'notes'>): Promise<Note>;
  updateNote(id: string, patch: TablesUpdate<'notes'>): Promise<Note>;
  deleteNote(id: string): Promise<void>;
  /**
   * Never overwrites (each name is unique per video). Failures come back typed so the UI can say why.
   * There is deliberately no way to delete cloud files from the client: deleting archives, files stay.
   */
  uploadFile(path: string, file: File): Promise<UploadResult>;
  signedUrl(path: string): Promise<string | null>;
  /** F2 · the group's members (name + colour), oldest first. */
  listMembers(): Promise<Member[]>;
  insertMember(row: { id?: string; name: string; color: MemberColor }): Promise<Member>;
  updateMember(id: string, patch: { name?: string; color?: MemberColor }): Promise<Member>;
  /** Archives (the delete trigger keeps the row). */
  deleteMember(id: string): Promise<void>;
  /** F3 · takes of a video (rows: the videos live on phones, or shared in the `takes` bucket). */
  listTakes(videoId: string): Promise<Take[]>;
  insertTake(row: TablesInsert<'takes'>): Promise<Take>;
  /** One live take by id (null when it doesn't exist or was deleted). */
  getTake(id: string): Promise<Take | null>;
  updateTake(id: string, patch: Pick<TablesUpdate<'takes'>, 'is_best' | 'shared_path' | 'shared_size' | 'member_id' | 'clip_id'>): Promise<Take>;
  deleteTake(id: string): Promise<void>;
  uploadTakeFile(path: string, file: Blob): Promise<UploadResult>;
  signedTakeUrl(path: string): Promise<string | null>;
  /**
   * Bytes really used in the cloud: by shared takes (deleted ones included: their files stay until the admin
   * purges them) and in total (with the library's videos), against the free plan's 1 GB.
   */
  storageUsage(): Promise<StorageUsage>;
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
      .select(`${LIBRARY_COLUMNS}, clips(count)`)
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
      .select('*, video:videos(id, title, artist, source, youtube_id)')
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
  async listNotes(videoId) {
    const { data, error } = await supabase.from('notes').select('*').eq('video_id', videoId).order('at_seconds');
    if (error) throw error;
    return data;
  },
  async insertNote(row) {
    const { data, error } = await supabase.from('notes').insert(row).select().single();
    if (error) throw error;
    return data;
  },
  async updateNote(id, patch) {
    const { data, error } = await supabase.from('notes').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteNote(id) {
    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error) throw error;
  },
  async uploadFile(path, file) {
    // No upsert: overwriting needs an UPDATE grant the bucket doesn't give, and the name is already unique.
    const { error } = await supabase.storage.from(VIDEO_BUCKET).upload(path, file, { contentType: file.type || 'video/mp4' });
    if (!error) return { ok: true, path };
    console.error('[uploadFile]', error);
    return { ok: false, reason: uploadFailure(error) };
  },
  async signedUrl(path) {
    const { data, error } = await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(path, 6 * 60 * 60);
    return error ? null : data.signedUrl;
  },
  async listMembers() {
    const { data, error } = await supabase.from('members').select('*').order('created_at');
    if (error) throw error;
    return data as Member[];
  },
  async insertMember(row) {
    // crew_id is set by the database (the default group); the client's value is ignored.
    const { data, error } = await supabase
      .from('members')
      .insert({ ...row, name: row.name.trim() })
      .select()
      .single();
    if (error) throw error;
    return data as Member;
  },
  async updateMember(id, patch) {
    const clean = { ...patch, ...(patch.name != null ? { name: patch.name.trim() } : {}) };
    const { data, error } = await supabase.from('members').update(clean).eq('id', id).select().single();
    if (error) throw error;
    return data as Member;
  },
  async deleteMember(id) {
    const { error } = await supabase.from('members').delete().eq('id', id);
    if (error) throw error;
  },
  async listTakes(videoId) {
    const { data, error } = await supabase
      .from('takes')
      .select('*')
      .eq('video_id', videoId)
      .order('recorded_at', { ascending: false });
    if (error) throw error;
    return data as Take[];
  },
  async insertTake(row) {
    const { data, error } = await supabase.from('takes').insert(row).select().single();
    if (error) throw error;
    return data as Take;
  },
  async getTake(id) {
    const { data, error } = await supabase.from('takes').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as Take | null) ?? null;
  },
  async updateTake(id, patch) {
    const { data, error } = await supabase.from('takes').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data as Take;
  },
  async deleteTake(id) {
    const { error } = await supabase.from('takes').delete().eq('id', id);
    if (error) throw error;
  },
  async uploadTakeFile(path, file) {
    const { error } = await supabase.storage.from(TAKE_BUCKET).upload(path, file, { contentType: file.type || 'video/mp4' });
    if (!error) return { ok: true, path };
    console.error('[uploadTakeFile]', error);
    const e = error as { status?: number; statusCode?: string; message?: string };
    if (Number(e.status ?? e.statusCode) === 409 || /already exists|duplicate/i.test(e.message ?? '')) {
      return { ok: false, reason: 'exists' };
    }
    return { ok: false, reason: uploadFailure(error) };
  },
  async signedTakeUrl(path) {
    const { data, error } = await supabase.storage.from(TAKE_BUCKET).createSignedUrl(path, 6 * 60 * 60);
    return error ? null : data.signedUrl;
  },
  async storageUsage() {
    const { data, error } = await supabase.rpc('storage_usage');
    if (error) throw error;
    const usage = (data ?? {}) as { takes?: number; total?: number };
    return { takes: Number(usage.takes) || 0, total: Number(usage.total) || 0 };
  },
};

// ───────────────────────────── Local demo ─────────────────────────────

interface DemoDb {
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
        archived_at: null,
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
      db.notes = (db.notes ?? []).filter((n) => n.video_id !== video.id);
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
              ? { id: v.id, title: v.title, artist: v.artist, source: v.source, youtube_id: v.youtube_id }
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
        archived_at: null,
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
  listNotes: (videoId) =>
    query((db) => (db.notes ?? []).filter((n) => n.video_id === videoId).sort((a, b) => a.at_seconds - b.at_seconds)),
  insertNote: (row) =>
    mutate((db) => {
      const video = db.videos.find((v) => v.id === row.video_id);
      const note: Note = {
        id: crypto.randomUUID(),
        created_by: DEMO_USER_ID,
        archived_at: null,
        created_at: now(),
        updated_at: now(),
        ...row,
        author_member_id: row.author_member_id ?? null,
        crew_id: video?.crew_id ?? row.crew_id,
      };
      (db.notes ??= []).push(note);
      return note;
    }),
  updateNote: (id, patch) =>
    mutate((db) => {
      const note = db.notes?.find((n) => n.id === id);
      if (!note) throw new Error('not found');
      Object.assign(note, patch, { updated_at: now() });
      return note;
    }),
  deleteNote: (id) =>
    mutate((db) => {
      db.notes = (db.notes ?? []).filter((n) => n.id !== id);
    }),
  uploadFile: () => Promise.resolve({ ok: false, reason: 'unavailable' }),
  signedUrl: () => Promise.resolve(null),
  listMembers: () => query((db) => [...(db.members ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))),
  insertMember: (row) =>
    mutate((db) => {
      const name = row.name.trim();
      const members = (db.members ??= []);
      if (members.some((m) => m.name.trim().toLowerCase() === name.toLowerCase())) {
        throw Object.assign(new Error('duplicate key value violates unique constraint "members_crew_name_key"'), {
          code: '23505',
        });
      }
      const member: Member = {
        id: row.id ?? crypto.randomUUID(),
        crew_id: db.crews[0]!.id,
        name,
        color: row.color,
        created_at: now(),
        archived_at: null,
      };
      members.push(member);
      return member;
    }),
  updateMember: (id, patch) =>
    mutate((db) => {
      const member = db.members?.find((m) => m.id === id);
      if (!member) throw new Error('not found');
      Object.assign(member, patch, patch.name != null ? { name: patch.name.trim() } : {});
      return member;
    }),
  deleteMember: (id) =>
    mutate((db) => {
      db.members = (db.members ?? []).filter((m) => m.id !== id);
    }),
  listTakes: (videoId) =>
    query((db) =>
      (db.takes ?? []).filter((t) => t.video_id === videoId).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at)),
    ),
  insertTake: (row) =>
    mutate((db) => {
      const video = db.videos.find((v) => v.id === row.video_id);
      if (!video) throw new Error('video not found');
      const take: Take = {
        clip_id: null,
        device_id: null,
        duration_seconds: 0,
        file_name: null,
        height: null,
        is_best: false,
        member_id: null,
        mime_type: null,
        mirrored: false,
        recorded_at: now(),
        song_end_seconds: null,
        speed: 1,
        width: null,
        ...row,
        crew_id: video.crew_id,
        shared_path: null,
        shared_size: null,
        created_at: now(),
        archived_at: null,
      };
      (db.takes ??= []).push(take);
      if (take.is_best) clearOtherBest(db, take);
      return take;
    }),
  updateTake: (id, patch) =>
    mutate((db) => {
      const take = db.takes?.find((t) => t.id === id);
      if (!take) throw new Error('not found');
      Object.assign(take, patch);
      if (patch.is_best) clearOtherBest(db, take);
      return take;
    }),
  deleteTake: (id) =>
    mutate((db) => {
      db.takes = (db.takes ?? []).filter((t) => t.id !== id);
    }),
  uploadTakeFile: () => Promise.resolve({ ok: false, reason: 'unavailable' }),
  signedTakeUrl: () => Promise.resolve(null),
  getTake: (id) => query((db) => (db.takes ?? []).find((t) => t.id === id) ?? null),
  storageUsage: () =>
    query((db) => {
      const takes = (db.takes ?? []).reduce((s, t) => s + (t.shared_size ?? 0), 0);
      return { takes, total: takes };
    }),
};

/** Demo twin of the database's one-best-take trigger (F4). */
function clearOtherBest(db: DemoDb, take: Take) {
  for (const t of db.takes ?? []) {
    if (t.id !== take.id && t.video_id === take.video_id && t.member_id === take.member_id && t.clip_id === take.clip_id) {
      t.is_best = false;
    }
  }
}

export const backend: Backend = IS_DEMO ? demoBackend : supabaseBackend;
