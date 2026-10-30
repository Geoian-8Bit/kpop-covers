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
import { MAX_CLOUD_UPLOAD_BYTES } from '@coverscape/shared';
import { demoCloudBytes, demoCloudUrl, saveDemoCloudFile } from './localVideos';
import type { Bag, BagDraw, BagItem, BagKind, DrawMode, Track, TrackItem } from '@coverscape/shared';
import type { Poll, PollOption, PollVote, Wish, WishInterest } from '@coverscape/shared';
import type { CrewEvent, EventSong, ReactionEmoji, TakeReaction } from '@coverscape/shared';
import type { Tables } from '@coverscape/shared';
import type { Absence, RehearsalException, RehearsalRule } from '@coverscape/shared';
import { isMemberColor } from '@coverscape/shared';
import { drawOrder } from '@/features/bags/drawRules';
import {
  ABSENCE_MAX_SPAN,
  ABSENCE_NOTE_MAX,
  addDays,
  daysBetween,
  hhmm,
  isDayKey,
  isTime,
  madridToday,
  minutes,
} from '@/features/calendar/calendarRules';
import { ruleRunsOn } from '@/features/calendar/rehearsalRules';
import { videosBucketHasRoom } from '@/features/studio/cloudSpace';
import { cutChars, songYoutubeId, youtubeSongRow } from '@/features/bags/songRules';

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
  'id, crew_id, title, artist, source, youtube_id, thumbnail_url, duration_seconds, created_at, file_name, aspect_ratio';
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
  | 'aspect_ratio'
>;
export type VideoWithClipCount = LibraryVideo & { clips: { count: number }[] };

/** Why a file stayed on this device instead of reaching the group's cloud. */
/** 'exists': a file with that name is already there (a take's earlier upload that went through). */
export type UploadFailure = 'too-big' | 'type' | 'network' | 'denied' | 'unavailable' | 'exists';
export type UploadResult = { ok: true; path: string } | { ok: false; reason: UploadFailure };

/** 13 · A long upload (a ~48 MB copy over mobile data): say how far it is, and let it be cancelled. */
export interface UploadOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

const isDuplicate = (error: unknown) => {
  const e = (error ?? {}) as { status?: number; statusCode?: string; message?: string; error?: string };
  return Number(e.status ?? e.statusCode) === 409 || /already exists|duplicate/i.test(`${e.message ?? ''} ${e.error ?? ''}`);
};

/**
 * One upload to Storage's REST endpoint with XMLHttpRequest, which (unlike fetch) reports the bytes sent. Same
 * request supabase-js makes (POST, no upsert), with the session's token or the public key.
 */
async function uploadWithProgress(bucket: string, path: string, file: Blob, options: UploadOptions): Promise<UploadResult> {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '');
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!base || !key) return { ok: false, reason: 'unavailable' };
  const token = (await supabase.auth.getSession().catch(() => null))?.data.session?.access_token ?? key;
  const url = `${base}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
  if (options.signal?.aborted) throw new DOMException('Subida cancelada', 'AbortError');
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const done = () => options.signal?.removeEventListener('abort', onAbort);
    xhr.open('POST', url);
    xhr.setRequestHeader('authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', key);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', 'max-age=3600');
    xhr.setRequestHeader('content-type', file.type || 'video/mp4');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) options.onProgress?.(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.(1);
        resolve({ ok: true, path });
        return;
      }
      let body: { statusCode?: string; error?: string; message?: string } = {};
      try {
        body = JSON.parse(xhr.responseText) as typeof body;
      } catch {
        /* not JSON */
      }
      const error = { status: Number(body.statusCode) || xhr.status, message: body.message ?? body.error ?? '', error: body.error };
      console.error('[uploadFile]', error);
      resolve(isDuplicate(error) ? { ok: false, reason: 'exists' } : { ok: false, reason: uploadFailure(error) });
    };
    xhr.onerror = () => {
      done();
      resolve({ ok: false, reason: 'network' });
    };
    xhr.onabort = () => {
      done();
      reject(new DOMException('Subida cancelada', 'AbortError'));
    };
    xhr.send(file);
  });
}

/**
 * 13 · Biggest file the group's cloud takes (50 MB, free plan). Only the local demo can lower it to try the reduced
 * copy with small files: `localStorage['oneshoot.dev.cloudLimitMB'] = '5'`.
 */
export function cloudLimitBytes(): number {
  if (IS_DEMO) {
    try {
      const mb = Number(localStorage.getItem('oneshoot.dev.cloudLimitMB'));
      if (mb >= 1 && mb < 50) return Math.round(mb * 1024 * 1024);
    } catch {
      /* the real limit */
    }
  }
  return MAX_CLOUD_UPLOAD_BYTES;
}

/**
 * Every row of a list, page by page: the server answers at most 1000 rows per request, so a longer list would be
 * cut short without a word (review round 1). `page(from, to)` must order by a unique key so pages don't overlap.
 */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < size) return out;
  }
}

function uploadFailure(error: unknown): UploadFailure {
  const e = (error ?? {}) as { name?: string; status?: number; statusCode?: string; code?: string; message?: string };
  const status = Number(e.status ?? e.statusCode) || 0;
  const message = e.message ?? '';
  if (status === 413 || e.code === 'EntityTooLarge' || /too large|maximum allowed size|exceeded the maximum/i.test(message)) {
    return 'too-big';
  }
  if (status === 415 || e.code === 'InvalidMimeType' || /mime type/i.test(message)) return 'type';
  // A server or gateway error (e.g. a 504 on a slow 48 MB upload) is not a refusal: never «no room».
  if (status >= 500) return 'unavailable';
  if (e.name === 'StorageUnknownError' || !status || /failed to fetch|network|load failed/i.test(message)) return 'network';
  return 'denied';
}

/** What the app may change on a take (the database grants exactly these columns). F5 adds the review's sync and fit. */
export type TakePatch = Pick<
  TablesUpdate<'takes'>,
  'is_best' | 'shared_path' | 'shared_size' | 'member_id' | 'clip_id' | 'sync_adjust_seconds' | 'fit_scale' | 'fit_x' | 'fit_y'
>;

/** What the app may change on a note (granted columns; a note's take and moment are set when it's written). */
export type NotePatch = Pick<TablesUpdate<'notes'>, 'body' | 'at_seconds' | 'category' | 'for_member_id' | 'status' | 'sketch'>;

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
  updateNote(id: string, patch: NotePatch): Promise<Note>;
  deleteNote(id: string): Promise<void>;
  /**
   * Never overwrites (each name is unique per video). Failures come back typed so the UI can say why.
   * There is deliberately no way to delete cloud files from the client: deleting archives, files stay.
   */
  /**
   * Never overwrites: `exists` when a file with that name is already in the bucket (an earlier try that got
   * through). With `options`: progress (0–1) as the bytes go out, and an abort that rejects with an AbortError.
   */
  uploadFile(path: string, file: File, options?: UploadOptions): Promise<UploadResult>;
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
  updateTake(id: string, patch: TakePatch): Promise<Take>;
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
  async uploadFile(path, file, options) {
    if (options?.onProgress || options?.signal) return uploadWithProgress(VIDEO_BUCKET, path, file, options);
    // No upsert: overwriting needs an UPDATE grant the bucket doesn't give, and the name is already unique.
    const { error } = await supabase.storage.from(VIDEO_BUCKET).upload(path, file, { contentType: file.type || 'video/mp4' });
    if (!error) return { ok: true, path };
    console.error('[uploadFile]', error);
    // 409: the file is already there (an earlier try got through; the row just didn't get its path).
    if (isDuplicate(error)) return { ok: false, reason: 'exists' };
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
        aspect_ratio: null,
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
        // F9 · Same defaults as the database: no zoom.
        zoom_scale: 1,
        zoom_x: 0.5,
        zoom_y: 0.5,
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
        take_id: null,
        take_seconds: null,
        category: null,
        for_member_id: null,
        status: 'open',
        sketch: null,
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
  // 13 · A pretend cloud on this browser (IndexedDB), with the bucket's size limit, «never overwrite» and the
  // database's room rule (H1: the upload counts as the per-file limit and 50 MB stay free for one take).
  uploadFile: async (path, file, options) => {
    if (options?.signal?.aborted) throw new DOMException('Subida cancelada', 'AbortError');
    if (file.size > cloudLimitBytes()) return { ok: false, reason: 'too-big' };
    const db = readDb();
    const videoId = /\/([0-9a-f-]{36})(--[0-9a-z]+)?\.[A-Za-z0-9]+$/.exec(path)?.[1];
    const video = db.videos.find((v) => v.id === videoId);
    if (!video || (video.storage_path && video.storage_path !== path)) return { ok: false, reason: 'denied' };
    if ((await demoCloudUrl(path)) != null) return { ok: false, reason: 'exists' };
    if (video.storage_path) return { ok: false, reason: 'denied' };
    const takes = (db.takes ?? []).reduce((s, t) => s + (t.shared_size ?? 0), 0);
    if (!videosBucketHasRoom(takes + (await demoCloudBytes()), cloudLimitBytes())) return { ok: false, reason: 'denied' };
    const saved = await saveDemoCloudFile(path, file);
    if (saved) options?.onProgress?.(1);
    return saved ? { ok: true, path } : { ok: false, reason: 'denied' };
  },
  signedUrl: (path) => demoCloudUrl(path),
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
        sync_adjust_seconds: 0,
        fit_scale: 1,
        fit_x: 0,
        fit_y: 0,
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
  storageUsage: async () => {
    const takes = (readDb().takes ?? []).reduce((s, t) => s + (t.shared_size ?? 0), 0);
    // The pretend cloud's videos count too (13), as in the real one.
    return { takes, total: takes + (await demoCloudBytes()) };
  },
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

// ───────────────────────────── F13 bags · F14 tracks ─────────────────────────────

export type BagWithCount = Bag & { items: number };
export type BagItemVideo = Pick<Video, 'id' | 'title' | 'artist' | 'thumbnail_url' | 'source' | 'youtube_id'>;
export type BagItemClip = Pick<
  Clip,
  'id' | 'name' | 'video_id' | 'start_seconds' | 'end_seconds' | 'speed' | 'mirrored' | 'color'
> & { video: ClipVideo | null };
export type BagItemMember = Pick<Member, 'id' | 'name' | 'color'>;
/** A bag item with what it points at (songs, clips or people; archived ones never come back). */
/** F12: a bag of songs also takes wishes from the list (not in the library yet). */
export type BagItemWish = Pick<Wish, 'id' | 'title' | 'artist' | 'thumbnail_url' | 'youtube_id' | 'added_video_id'>;
export type BagItemView = BagItem & {
  video: BagItemVideo | null;
  clip: BagItemClip | null;
  member: BagItemMember | null;
  wish: BagItemWish | null;
};
export type TrackWithCount = Track & { items: number };
/** A track's clip; `clip` is null when it was archived (shown as «no disponible», skipped when playing). */
export type TrackItemView = TrackItem & { clip: ClipWithVideo | null };
export type NewBag = { name: string; kind: BagKind; draw_mode: DrawMode; no_repeat: boolean };
export type BagPatch = Partial<Pick<Bag, 'name' | 'draw_mode' | 'no_repeat'>>;
/** Exactly one source. A YouTube song (point 28) lives only in its bag: youtube_id with its title and details. */
export type NewBagItem = {
  bag_id: string;
  video_id?: string;
  clip_id?: string;
  member_id?: string;
  wish_id?: string;
  youtube_id?: string;
  title?: string;
  artist?: string | null;
  thumbnail_url?: string | null;
  duration_seconds?: number | null;
};
export type TrackOptionsRow = Pick<Track, 'pause_seconds' | 'countdown' | 'use_clip_settings' | 'title_mode'>;
export type TrackPatch = Partial<Pick<Track, 'name' | 'pause_seconds' | 'countdown' | 'use_clip_settings' | 'title_mode'>>;

/**
 * F13 · bags and F14 · tracks, shared by the group. Only the columns the database grants are ever written:
 * bags (name, draw_mode, no_repeat), bag_items (removed_at), bag_draws (removed), tracks (name and options),
 * track_items (position). Deleting archives. The draw itself happens on the server (`draw_from_bag`).
 */
export interface BagsBackend {
  listBags(): Promise<BagWithCount[]>;
  insertBag(row: NewBag): Promise<Bag>;
  updateBag(id: string, patch: BagPatch): Promise<Bag>;
  deleteBag(id: string): Promise<void>;
  listBagItems(bagId: string): Promise<BagItemView[]>;
  insertBagItem(row: NewBagItem): Promise<BagItem>;
  deleteBagItem(id: string): Promise<void>;
  /** Takes an item out of the bag (or puts it back). */
  setBagItemOut(id: string, out: boolean): Promise<void>;
  /** «Rellenar»: everything taken out goes back in. */
  refillBag(bagId: string): Promise<void>;
  /** Newest first. */
  listBagDraws(bagId: string, limit?: number): Promise<BagDraw[]>;
  /** Draws `count` (1–10) at random; `remove` null = the bag's mode. Empty when nothing is left. */
  drawFromBag(bagId: string, count: number, remove: boolean | null, memberId: string | null): Promise<BagDraw[]>;
  /** «Quitar de la bolsa» / «Devolver» after a draw: the draw's record and its item follow. */
  setDrawRemoved(draw: Pick<BagDraw, 'id' | 'item_id'>, removed: boolean): Promise<void>;
  /**
   * «Añadir a la biblioteca» for a YouTube song of a bag: the item now points at the library video with the same
   * YouTube id (same row, so its history stays). Anything else is refused (`bag_item_invalid`).
   */
  linkBagItemVideo(itemId: string, videoId: string): Promise<void>;
  /**
   * «Añadir a la biblioteca», for every bag at once: each live YouTube song of the group with this YouTube id points
   * at the library video (one link per row, each checked by the trigger); in a bag that already holds the video, the
   * YouTube copy leaves the bag instead. Returns the bags it touched.
   */
  linkYoutubeSongs(youtubeId: string, videoId: string): Promise<string[]>;
  /** Every live clip of the group with its song (pickers, rounds). */
  listAllClips(): Promise<ClipWithVideo[]>;
  listTracks(): Promise<TrackWithCount[]>;
  getTrack(id: string): Promise<Track | null>;
  listTrackItems(trackId: string): Promise<TrackItemView[]>;
  insertTrack(row: { name: string } & TrackOptionsRow, clipIds: string[]): Promise<Track>;
  updateTrack(id: string, patch: TrackPatch): Promise<Track>;
  deleteTrack(id: string): Promise<void>;
  insertTrackItems(trackId: string, clipIds: string[], fromPosition: number): Promise<TrackItem[]>;
  deleteTrackItem(id: string): Promise<void>;
  setTrackPositions(patches: { id: string; position: number }[]): Promise<void>;
}

const CLIP_VIDEO_COLUMNS = 'id, title, artist, source, youtube_id';
const BAG_ITEM_SELECT =
  `*, video:videos(id, title, artist, thumbnail_url, source, youtube_id), ` +
  `clip:clips(id, name, video_id, start_seconds, end_seconds, speed, mirrored, color, video:videos(${CLIP_VIDEO_COLUMNS})), ` +
  `member:members(id, name, color), wish:wishes(id, title, artist, thumbnail_url, youtube_id, added_video_id)`;

const supabaseBags: BagsBackend = {
  async listBags() {
    const { data, error } = await supabase.from('bags').select('*, bag_items(count)').order('created_at');
    if (error) throw error;
    return (data as unknown as (Bag & { bag_items: { count: number }[] })[]).map(({ bag_items, ...bag }) => ({
      ...bag,
      items: bag_items[0]?.count ?? 0,
    }));
  },
  async insertBag(row) {
    // crew_id comes from the database (the default group).
    const { data, error } = await supabase
      .from('bags')
      .insert({ ...row, name: row.name.trim() })
      .select()
      .single();
    if (error) throw error;
    return data as Bag;
  },
  async updateBag(id, patch) {
    const clean = patch.name != null ? { ...patch, name: patch.name.trim() } : patch;
    const { data, error } = await supabase.from('bags').update(clean).eq('id', id).select().single();
    if (error) throw error;
    return data as Bag;
  },
  async deleteBag(id) {
    const { error } = await supabase.from('bags').delete().eq('id', id);
    if (error) throw error;
  },
  async listBagItems(bagId) {
    return fetchAll<BagItemView>((from, to) =>
      supabase.from('bag_items').select(BAG_ITEM_SELECT).eq('bag_id', bagId).order('created_at').order('id').range(from, to),
    );
  },
  async insertBagItem(row) {
    const { data, error } = await supabase.from('bag_items').insert(row).select().single();
    if (error) throw error;
    return data;
  },
  async deleteBagItem(id) {
    const { error } = await supabase.from('bag_items').delete().eq('id', id);
    if (error) throw error;
  },
  async setBagItemOut(id, out) {
    const { error } = await supabase
      .from('bag_items')
      .update({ removed_at: out ? new Date().toISOString() : null })
      .eq('id', id);
    if (error) throw error;
  },
  async refillBag(bagId) {
    const { error } = await supabase
      .from('bag_items')
      .update({ removed_at: null })
      .eq('bag_id', bagId)
      .not('removed_at', 'is', null);
    if (error) throw error;
  },
  async listBagDraws(bagId, limit = 40) {
    const { data, error } = await supabase
      .from('bag_draws')
      .select('*')
      .eq('bag_id', bagId)
      .order('seq', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  },
  async drawFromBag(bagId, count, remove, memberId) {
    const { data, error } = await supabase.rpc('draw_from_bag', {
      p_bag: bagId,
      p_count: count,
      p_remove: remove,
      p_member: memberId,
    });
    if (error) throw error;
    return (data ?? []) as BagDraw[];
  },
  async setDrawRemoved(draw, removed) {
    const { error } = await supabase.from('bag_draws').update({ removed }).eq('id', draw.id);
    if (error) throw error;
    if (draw.item_id) await supabaseBags.setBagItemOut(draw.item_id, removed);
  },
  async linkBagItemVideo(itemId, videoId) {
    // The trigger checks the video is the same YouTube song and clears the item's own YouTube columns.
    const { error } = await supabase.from('bag_items').update({ video_id: videoId }).eq('id', itemId);
    if (error) throw error;
  },
  async linkYoutubeSongs(youtubeId, videoId) {
    // RLS limits both reads to the group's live items in live bags.
    const { data: songs, error } = await supabase
      .from('bag_items')
      .select('id, bag_id')
      .eq('youtube_id', youtubeId)
      .is('video_id', null);
    if (error) throw error;
    if (!songs.length) return [];
    const bagIds = [...new Set(songs.map((s) => s.bag_id))];
    const { data: holding, error: holdingError } = await supabase
      .from('bag_items')
      .select('bag_id')
      .eq('video_id', videoId)
      .in('bag_id', bagIds);
    if (holdingError) throw holdingError;
    const holds = new Set(holding.map((h) => h.bag_id));
    let failure: unknown = null;
    for (const song of songs) {
      try {
        if (holds.has(song.bag_id)) await supabaseBags.deleteBagItem(song.id);
        else await supabaseBags.linkBagItemVideo(song.id, videoId);
      } catch (linkError) {
        // The video went into that bag meanwhile: the YouTube copy just leaves it.
        if ((linkError as { code?: string }).code === '23505') {
          await supabaseBags.deleteBagItem(song.id).catch((e: unknown) => (failure ??= e));
        } else {
          failure ??= linkError;
        }
      }
    }
    if (failure) throw failure;
    return bagIds;
  },
  async listAllClips() {
    return fetchAll<ClipWithVideo>((from, to) =>
      supabase
        .from('clips')
        .select(`*, video:videos(${CLIP_VIDEO_COLUMNS})`)
        .order('created_at')
        .order('id')
        .range(from, to),
    );
  },
  async listTracks() {
    const { data, error } = await supabase
      .from('tracks')
      .select('*, track_items(count)')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data as unknown as (Track & { track_items: { count: number }[] })[]).map(({ track_items, ...track }) => ({
      ...track,
      items: track_items[0]?.count ?? 0,
    }));
  },
  async getTrack(id) {
    const { data, error } = await supabase.from('tracks').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as Track | null) ?? null;
  },
  async listTrackItems(trackId) {
    const { data, error } = await supabase
      .from('track_items')
      .select(`*, clip:clips(*, video:videos(${CLIP_VIDEO_COLUMNS}))`)
      .eq('track_id', trackId)
      .order('position')
      .order('created_at');
    if (error) throw error;
    return data as unknown as TrackItemView[];
  },
  async insertTrack(row, clipIds) {
    const { data, error } = await supabase
      .from('tracks')
      .insert({ ...row, name: row.name.trim() })
      .select()
      .single();
    if (error) throw error;
    const track = data as Track;
    if (clipIds.length) {
      try {
        await supabaseBags.insertTrackItems(track.id, clipIds, 0);
      } catch (err) {
        // A track without its clips is no use: archive it and report the failure.
        await supabase.from('tracks').delete().eq('id', track.id);
        throw err;
      }
    }
    return track;
  },
  async updateTrack(id, patch) {
    const clean = patch.name != null ? { ...patch, name: patch.name.trim() } : patch;
    const { data, error } = await supabase.from('tracks').update(clean).eq('id', id).select().single();
    if (error) throw error;
    return data as Track;
  },
  async deleteTrack(id) {
    const { error } = await supabase.from('tracks').delete().eq('id', id);
    if (error) throw error;
  },
  async insertTrackItems(trackId, clipIds, fromPosition) {
    if (!clipIds.length) return [];
    const rows = clipIds.map((clip_id, i) => ({ track_id: trackId, clip_id, position: fromPosition + i }));
    const { data, error } = await supabase.from('track_items').insert(rows).select();
    if (error) throw error;
    return data;
  },
  async deleteTrackItem(id) {
    const { error } = await supabase.from('track_items').delete().eq('id', id);
    if (error) throw error;
  },
  async setTrackPositions(patches) {
    const results = await Promise.all(
      patches.map(({ id, position }) => supabase.from('track_items').update({ position }).eq('id', id)),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
  },
};

// Demo twin: the same rules as the database (kinds, one of each per bag, unique names, draws, archived refs vanish).

type BagsDemoDb = DemoDb & {
  bags?: Bag[];
  bag_items?: BagItem[];
  bag_draws?: BagDraw[];
  tracks?: Track[];
  track_items?: TrackItem[];
};

const demoError = (message: string, code = 'P0001') => Object.assign(new Error(message), { code });

function demoItemView(db: BagsDemoDb, item: BagItem): BagItemView | null {
  const video = item.video_id ? db.videos.find((v) => v.id === item.video_id) : null;
  const clip = item.clip_id ? db.clips.find((c) => c.id === item.clip_id) : null;
  const clipVideo = clip ? db.videos.find((v) => v.id === clip.video_id) : null;
  const member = item.member_id ? (db.members ?? []).find((m) => m.id === item.member_id) : null;
  const wish = item.wish_id
    ? ((db as { wishes?: Wish[] }).wishes ?? []).find((w) => w.id === item.wish_id && w.archived_at == null)
    : null;
  if (
    (item.video_id && !video) ||
    (item.clip_id && (!clip || !clipVideo)) ||
    (item.member_id && !member) ||
    (item.wish_id && !wish)
  )
    return null;
  return {
    ...item,
    // Rows saved by a demo older than the YouTube songs of point 28 lack these columns.
    youtube_id: item.youtube_id ?? null,
    title: item.title ?? null,
    artist: item.artist ?? null,
    thumbnail_url: item.thumbnail_url ?? null,
    duration_seconds: item.duration_seconds ?? null,
    video: video
      ? {
          id: video.id,
          title: video.title,
          artist: video.artist,
          thumbnail_url: video.thumbnail_url,
          source: video.source,
          youtube_id: video.youtube_id,
        }
      : null,
    clip:
      clip && clipVideo
        ? {
            id: clip.id,
            name: clip.name,
            video_id: clip.video_id,
            start_seconds: clip.start_seconds,
            end_seconds: clip.end_seconds,
            speed: clip.speed,
            mirrored: clip.mirrored,
            color: clip.color,
            video: {
              id: clipVideo.id,
              title: clipVideo.title,
              artist: clipVideo.artist,
              source: clipVideo.source,
              youtube_id: clipVideo.youtube_id,
            },
          }
        : null,
    member: member ? { id: member.id, name: member.name, color: member.color } : null,
    wish: wish
      ? {
          id: wish.id,
          title: wish.title,
          artist: wish.artist,
          thumbnail_url: wish.thumbnail_url,
          youtube_id: wish.youtube_id,
          added_video_id: wish.added_video_id,
        }
      : null,
  };
}

const liveBagItems = (db: BagsDemoDb, bagId: string) =>
  (db.bag_items ?? []).filter((i) => i.bag_id === bagId && demoItemView(db, i) != null);

function demoClipWithVideo(db: BagsDemoDb, clip: Clip): ClipWithVideo | null {
  const v = db.videos.find((x) => x.id === clip.video_id);
  return v ? { ...clip, video: { id: v.id, title: v.title, artist: v.artist, source: v.source, youtube_id: v.youtube_id } } : null;
}

function checkBagName(db: BagsDemoDb, name: string, exceptId?: string) {
  const clean = name.trim();
  if (clean.length < 1 || clean.length > 60) throw demoError('bags_name_check', '23514');
  if ((db.bags ?? []).some((b) => b.id !== exceptId && b.name.trim().toLowerCase() === clean.toLowerCase())) {
    throw demoError('duplicate key value violates unique constraint "bags_crew_name_key"', '23505');
  }
  return clean;
}

const demoBags: BagsBackend = {
  listBags: () =>
    query((raw) => {
      const db = raw as BagsDemoDb;
      return (db.bags ?? [])
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((bag) => ({ ...bag, items: liveBagItems(db, bag.id).length }));
    }),
  insertBag: async (row) =>
    mutate((raw) => {
      const db = raw as BagsDemoDb;
      const bag: Bag = {
        id: crypto.randomUUID(),
        crew_id: db.crews[0]!.id,
        name: checkBagName(db, row.name),
        kind: row.kind,
        draw_mode: row.draw_mode,
        no_repeat: row.no_repeat,
        created_at: now(),
        archived_at: null,
      };
      (db.bags ??= []).push(bag);
      return bag;
    }),
  updateBag: async (id, patch) =>
    mutate((raw) => {
      const db = raw as BagsDemoDb;
      const bag = db.bags?.find((b) => b.id === id);
      if (!bag) throw demoError('PGRST116 0 rows');
      Object.assign(bag, patch, patch.name != null ? { name: checkBagName(db, patch.name, id) } : {});
      return bag;
    }),
  deleteBag: async (id) =>
    mutate((raw) => {
      const db = raw as BagsDemoDb;
      db.bags = (db.bags ?? []).filter((b) => b.id !== id);
      db.bag_items = (db.bag_items ?? []).filter((i) => i.bag_id !== id);
      db.bag_draws = (db.bag_draws ?? []).filter((d) => d.bag_id !== id);
    }),
  listBagItems: (bagId) =>
    query((raw) => {
      const db = raw as BagsDemoDb;
      return (db.bag_items ?? [])
        .filter((i) => i.bag_id === bagId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((i) => demoItemView(db, i))
        .filter((i): i is BagItemView => i != null);
    }),
  insertBagItem: async (asked) =>
    mutate((raw) => {
      const db = raw as BagsDemoDb;
      const bag = db.bags?.find((b) => b.id === asked.bag_id);
      if (!bag) throw demoError('bag_not_found');
      // Point 28, as guard_bag_item: a YouTube song already in the library goes in as the library video.
      const library =
        bag.kind === 'songs' && asked.youtube_id && !asked.video_id
          ? db.videos.find((v) => v.youtube_id === asked.youtube_id)
          : undefined;
      const row: NewBagItem = library ? { bag_id: asked.bag_id, video_id: library.id } : asked;
      const yt = row.youtube_id
        ? youtubeSongRow({
            youtubeId: row.youtube_id,
            title: row.title ?? '',
            artist: row.artist,
            thumbnailUrl: row.thumbnail_url,
            durationSeconds: row.duration_seconds,
          })
        : null;
      if (row.youtube_id && !yt) throw demoError('bag_items_youtube_fields', '23514');
      const refs = [row.video_id, row.clip_id, row.member_id, row.wish_id, row.youtube_id].filter(Boolean);
      const ok =
        refs.length === 1 &&
        ((bag.kind === 'songs' && row.video_id && db.videos.some((v) => v.id === row.video_id)) ||
          (bag.kind === 'songs' &&
            row.wish_id &&
            ((db as { wishes?: Wish[] }).wishes ?? []).some((w) => w.id === row.wish_id && w.archived_at == null)) ||
          (bag.kind === 'songs' && yt != null) ||
          (bag.kind === 'clips' && row.clip_id && db.clips.some((c) => c.id === row.clip_id)) ||
          (bag.kind === 'people' && row.member_id && (db.members ?? []).some((m) => m.id === row.member_id)));
      if (!ok) throw demoError('bag_item_invalid');
      const ref = refs[0];
      const live = liveBagItems(db, bag.id);
      if (live.some((i) => (i.video_id ?? i.clip_id ?? i.member_id ?? i.wish_id ?? i.youtube_id) === ref)) {
        throw demoError('duplicate key value violates unique constraint "bag_items_once_key"', '23505');
      }
      // The same YouTube video by another source (a library song, a wish or a YouTube-only copy).
      const ytId =
        yt?.youtube_id ??
        (row.video_id
          ? db.videos.find((v) => v.id === row.video_id)?.youtube_id
          : row.wish_id
            ? ((db as { wishes?: Wish[] }).wishes ?? []).find((w) => w.id === row.wish_id)?.youtube_id
            : null);
      if (
        bag.kind === 'songs' &&
        ytId &&
        live.some((i) => {
          const view = demoItemView(db, i);
          return view != null && songYoutubeId(view) === ytId;
        })
      ) {
        throw demoError('bag_item_duplicate', '23505');
      }
      const item: BagItem = {
        id: crypto.randomUUID(),
        crew_id: bag.crew_id,
        bag_id: bag.id,
        video_id: row.video_id ?? null,
        clip_id: row.clip_id ?? null,
        member_id: row.member_id ?? null,
        wish_id: row.wish_id ?? null,
        youtube_id: yt?.youtube_id ?? null,
        title: yt?.title ?? null,
        artist: yt?.artist ?? null,
        thumbnail_url: yt?.thumbnail_url ?? null,
        duration_seconds: yt?.duration_seconds ?? null,
        removed_at: null,
        created_at: now(),
        archived_at: null,
      };
      (db.bag_items ??= []).push(item);
      return item;
    }),
  deleteBagItem: async (id) =>
    mutate((raw) => {
      const db = raw as BagsDemoDb;
      db.bag_items = (db.bag_items ?? []).filter((i) => i.id !== id);
    }),
  setBagItemOut: async (id, out) =>
    mutate((raw) => {
      const item = (raw as BagsDemoDb).bag_items?.find((i) => i.id === id);
      if (item) item.removed_at = out ? now() : null;
    }),
  refillBag: async (bagId) =>
    mutate((raw) => {
      for (const item of (raw as BagsDemoDb).bag_items ?? []) if (item.bag_id === bagId) item.removed_at = null;
    }),
  listBagDraws: (bagId, limit = 40) =>
    query((raw) =>
      ((raw as BagsDemoDb).bag_draws ?? [])
        .filter((d) => d.bag_id === bagId)
        .sort((a, b) => b.seq - a.seq)
        .slice(0, limit),
    ),
  drawFromBag: async (bagId, count, remove, memberId) =>
    mutate((raw) => {
      const db = raw as BagsDemoDb;
      const bag = db.bags?.find((b) => b.id === bagId);
      if (!bag) throw demoError('bag_not_found');
      const removes = remove ?? bag.draw_mode === 'remove';
      const draws = (db.bag_draws ??= []);
      const last = bag.no_repeat
        ? (draws.filter((d) => d.bag_id === bagId).sort((a, b) => b.seq - a.seq)[0]?.item_id ?? null)
        : null;
      const picked = drawOrder(liveBagItems(db, bagId), { count, noRepeat: bag.no_repeat, lastItemId: last });
      let seq = draws.reduce((m, d) => Math.max(m, d.seq), 0);
      const member = memberId && (db.members ?? []).some((m) => m.id === memberId) ? memberId : null;
      return picked.map((item) => {
        const view = demoItemView(db, item)!;
        const label =
          view.video?.title ??
          view.wish?.title ??
          (view.clip ? `${view.clip.name} · ${view.clip.video?.title ?? ''}` : view.member?.name) ??
          (view.title?.trim() || '—');
        const draw: BagDraw = {
          id: crypto.randomUUID(),
          crew_id: bag.crew_id,
          bag_id: bag.id,
          item_id: item.id,
          label: cutChars(label, 200),
          removed: removes,
          member_id: member,
          drawn_at: now(),
          seq: ++seq,
        };
        draws.push(draw);
        if (removes) item.removed_at = now();
        return draw;
      });
    }),
  setDrawRemoved: async (draw, removed) =>
    mutate((raw) => {
      const db = raw as BagsDemoDb;
      const row = db.bag_draws?.find((d) => d.id === draw.id);
      if (row) row.removed = removed;
      const item = draw.item_id ? db.bag_items?.find((i) => i.id === draw.item_id) : null;
      if (item) item.removed_at = removed ? now() : null;
    }),
  linkBagItemVideo: async (itemId, videoId) =>
    mutate((raw) => {
      // As guard_bag_item_link: only a YouTube song, only to the library video of the same YouTube id.
      const db = raw as BagsDemoDb;
      const item = db.bag_items?.find((i) => i.id === itemId);
      if (!item) return;
      const video = db.videos.find((v) => v.id === videoId);
      if (!item.youtube_id || item.video_id || !video || video.youtube_id !== item.youtube_id) {
        throw demoError('bag_item_invalid');
      }
      if (liveBagItems(db, item.bag_id).some((i) => i.id !== item.id && i.video_id === videoId)) {
        throw demoError('duplicate key value violates unique constraint "bag_items_once_key"', '23505');
      }
      Object.assign(item, {
        video_id: videoId,
        youtube_id: null,
        title: null,
        artist: null,
        thumbnail_url: null,
        duration_seconds: null,
      });
    }),
  linkYoutubeSongs: async (youtubeId, videoId) =>
    mutate((raw) => {
      // As linkYoutubeSongs on Supabase: every live YouTube song with this id, in every bag.
      const db = raw as BagsDemoDb;
      const video = db.videos.find((v) => v.id === videoId);
      if (!video || video.youtube_id !== youtubeId) throw demoError('bag_item_invalid');
      const songs = (db.bag_items ?? []).filter(
        (i) => i.archived_at == null && i.youtube_id === youtubeId && !i.video_id,
      );
      const bagIds = [...new Set(songs.map((s) => s.bag_id))];
      const holds = new Set(
        (db.bag_items ?? []).filter((i) => i.archived_at == null && i.video_id === videoId).map((i) => i.bag_id),
      );
      const leaving = new Set(songs.filter((s) => holds.has(s.bag_id)).map((s) => s.id));
      db.bag_items = (db.bag_items ?? []).filter((i) => !leaving.has(i.id));
      for (const song of songs) {
        if (leaving.has(song.id)) continue;
        Object.assign(song, {
          video_id: videoId,
          youtube_id: null,
          title: null,
          artist: null,
          thumbnail_url: null,
          duration_seconds: null,
        });
      }
      return bagIds;
    }),
  listAllClips: () =>
    query((raw) => {
      const db = raw as BagsDemoDb;
      return db.clips
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((c) => demoClipWithVideo(db, c))
        .filter((c): c is ClipWithVideo => c != null);
    }),
  listTracks: () =>
    query((raw) => {
      const db = raw as BagsDemoDb;
      return (db.tracks ?? [])
        .slice()
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map((t) => ({ ...t, items: (db.track_items ?? []).filter((i) => i.track_id === t.id).length }));
    }),
  getTrack: (id) => query((raw) => (raw as BagsDemoDb).tracks?.find((t) => t.id === id) ?? null),
  listTrackItems: (trackId) =>
    query((raw) => {
      const db = raw as BagsDemoDb;
      return (db.track_items ?? [])
        .filter((i) => i.track_id === trackId)
        .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
        .map((i) => {
          const clip = db.clips.find((c) => c.id === i.clip_id);
          return { ...i, clip: clip ? demoClipWithVideo(db, clip) : null };
        });
    }),
  insertTrack: async (row, clipIds) =>
    mutate((raw) => {
      const db = raw as BagsDemoDb;
      const name = row.name.trim();
      if (name.length < 1 || name.length > 80) throw demoError('tracks_name_check', '23514');
      const pause = Number(row.pause_seconds);
      if (!(pause >= 0 && pause <= 5)) throw demoError('tracks_pause_seconds_check', '23514');
      const track: Track = {
        id: crypto.randomUUID(),
        crew_id: db.crews[0]!.id,
        name,
        pause_seconds: pause,
        countdown: row.countdown,
        use_clip_settings: row.use_clip_settings,
        title_mode: row.title_mode,
        created_at: now(),
        updated_at: now(),
        archived_at: null,
      };
      if (clipIds.some((id) => !db.clips.some((c) => c.id === id))) throw demoError('track_item_invalid');
      (db.tracks ??= []).push(track);
      const items = (db.track_items ??= []);
      clipIds.forEach((clip_id, position) => {
        items.push({
          id: crypto.randomUUID(),
          crew_id: track.crew_id,
          track_id: track.id,
          clip_id,
          position,
          created_at: now(),
          archived_at: null,
        });
      });
      return track;
    }),
  updateTrack: async (id, patch) =>
    mutate((raw) => {
      const track = (raw as BagsDemoDb).tracks?.find((t) => t.id === id);
      if (!track) throw demoError('PGRST116 0 rows');
      if (patch.pause_seconds != null && !(patch.pause_seconds >= 0 && patch.pause_seconds <= 5)) {
        throw demoError('tracks_pause_seconds_check', '23514');
      }
      Object.assign(track, patch, patch.name != null ? { name: patch.name.trim() } : {}, { updated_at: now() });
      return track;
    }),
  deleteTrack: async (id) =>
    mutate((raw) => {
      const db = raw as BagsDemoDb;
      db.tracks = (db.tracks ?? []).filter((t) => t.id !== id);
      db.track_items = (db.track_items ?? []).filter((i) => i.track_id !== id);
    }),
  insertTrackItems: async (trackId, clipIds, fromPosition) =>
    mutate((raw) => {
      const db = raw as BagsDemoDb;
      const track = db.tracks?.find((t) => t.id === trackId);
      if (!track) throw demoError('track_not_found');
      if (clipIds.some((id) => !db.clips.some((c) => c.id === id))) throw demoError('track_item_invalid');
      const rows: TrackItem[] = clipIds.map((clip_id, i) => ({
        id: crypto.randomUUID(),
        crew_id: track.crew_id,
        track_id: trackId,
        clip_id,
        position: fromPosition + i,
        created_at: now(),
        archived_at: null,
      }));
      (db.track_items ??= []).push(...rows);
      track.updated_at = now();
      return rows;
    }),
  deleteTrackItem: async (id) =>
    mutate((raw) => {
      const db = raw as BagsDemoDb;
      db.track_items = (db.track_items ?? []).filter((i) => i.id !== id);
    }),
  setTrackPositions: async (patches) =>
    mutate((raw) => {
      const db = raw as BagsDemoDb;
      for (const { id, position } of patches) {
        const item = db.track_items?.find((i) => i.id === id);
        if (item) item.position = position;
      }
    }),
};

export const bagsBackend: BagsBackend = IS_DEMO ? demoBags : supabaseBags;

// ───────────────────────────── F12 wish list · F11 polls ─────────────────────────────

/** What the app may change on a wish (the database grants exactly these columns). */
export type WishPatch = Partial<
  Pick<Wish, 'title' | 'artist' | 'members_count' | 'difficulty' | 'comment' | 'added_video_id'>
>;
export type NewWish = Pick<Wish, 'youtube_id' | 'title'> &
  Partial<Pick<Wish, 'artist' | 'thumbnail_url' | 'members_count' | 'difficulty' | 'comment' | 'proposed_by_member_id'>>;
/**
 * What the app changes on a poll: the title, and closing = closed_at (once); the winner only at that moment, and
 * only an option. 52 · results_live / anonymous / closes_at are no longer edited (older rows keep theirs).
 */
export type PollPatch = Partial<Pick<Poll, 'title' | 'closed_at' | 'winner_wish_id'>>;
export type CloseResolve = 'auto' | 'pick' | 'none';
export interface CloseResult {
  status: 'closed' | 'tie';
  winner: string | null;
  /** The leaders (wish ids) when it is a tie. */
  tied: string[];
}
/** 52 · Every new vote: results live, named votes, closed by hand (the column defaults, written explicitly). */
export const NEW_POLL_RULES = { results_live: true, anonymous: false, closes_at: null } as const satisfies Pick<
  Poll,
  'results_live' | 'anonymous' | 'closes_at'
>;
export type NewPoll = Pick<Poll, 'title' | 'vote_type'> & {
  created_by_member_id: string | null;
  parent_poll_id: string | null;
};

/**
 * F12 · the wish list («Me apunto» included) and F11 · its votes. Shared by the group; deleting archives. Votes
 * only go in through `cast_vote()` (one ballot per person, replaced while the poll is open; empty = withdraw).
 */
export interface WishesBackend {
  listWishes(): Promise<Wish[]>;
  insertWish(row: NewWish): Promise<Wish>;
  updateWish(id: string, patch: WishPatch): Promise<Wish>;
  deleteWish(id: string): Promise<void>;
  listInterest(): Promise<WishInterest[]>;
  addInterest(wishId: string, memberId: string): Promise<WishInterest>;
  removeInterest(id: string): Promise<void>;
  listPolls(): Promise<Poll[]>;
  listPollOptions(): Promise<PollOption[]>;
  /** Live votes of these polls only (a poll's page asks for its own; the list for the closed ones it shows). */
  listPollVotes(pollIds: string[]): Promise<PollVote[]>;
  /**
   * Closes on the server with the votes as they are at that moment (`close_poll`): 'auto' closes with a clear
   * winner (or none if nobody voted) and answers 'tie' without closing; 'pick' closes with one of the tied leaders;
   * 'none' closes without a winner (a second round follows). An already closed poll answers with its winner.
   */
  closePoll(pollId: string, resolve: CloseResolve, winnerWishId?: string | null): Promise<CloseResult>;
  /** The poll and its options (the wishes that take part); a poll left without options is archived again. */
  insertPoll(row: NewPoll, wishIds: string[]): Promise<Poll>;
  updatePoll(id: string, patch: PollPatch): Promise<Poll>;
  deletePoll(id: string): Promise<void>;
  /** Replaces this person's ballot (ranking: the order of the array). Returns how many options it holds. */
  castVote(pollId: string, memberId: string, optionIds: string[]): Promise<number>;
}

const supabaseWishes: WishesBackend = {
  async listWishes() {
    const { data, error } = await supabase.from('wishes').select('*').order('created_at');
    if (error) throw error;
    return data as Wish[];
  },
  async insertWish(row) {
    // crew_id comes from the database (the default group).
    const { data, error } = await supabase
      .from('wishes')
      .insert({ ...row, title: row.title.trim() })
      .select()
      .single();
    if (error) throw error;
    return data as Wish;
  },
  async updateWish(id, patch) {
    const clean = patch.title != null ? { ...patch, title: patch.title.trim() } : patch;
    const { data, error } = await supabase.from('wishes').update(clean).eq('id', id).select().single();
    if (error) throw error;
    return data as Wish;
  },
  async deleteWish(id) {
    const { error } = await supabase.from('wishes').delete().eq('id', id);
    if (error) throw error;
  },
  async listInterest() {
    return fetchAll<WishInterest>((from, to) =>
      supabase.from('wish_interest').select('*').order('created_at').order('id').range(from, to),
    );
  },
  async addInterest(wishId, memberId) {
    const { data, error } = await supabase
      .from('wish_interest')
      .insert({ wish_id: wishId, member_id: memberId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async removeInterest(id) {
    const { error } = await supabase.from('wish_interest').delete().eq('id', id);
    if (error) throw error;
  },
  async listPolls() {
    const { data, error } = await supabase.from('polls').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data as Poll[];
  },
  async listPollOptions() {
    return fetchAll<PollOption>((from, to) =>
      supabase.from('poll_options').select('*').order('created_at').order('id').range(from, to),
    );
  },
  async listPollVotes(pollIds) {
    if (!pollIds.length) return [];
    return fetchAll<PollVote>((from, to) =>
      supabase
        .from('poll_votes')
        .select('*')
        .in('poll_id', pollIds)
        .is('archived_at', null)
        .order('created_at')
        .order('id')
        .range(from, to),
    );
  },
  async closePoll(pollId, resolve, winnerWishId = null) {
    const { data, error } = await supabase.rpc('close_poll', { p_poll: pollId, p_resolve: resolve, p_winner: winnerWishId });
    if (error) throw error;
    const r = (data ?? {}) as Partial<CloseResult>;
    return { status: r.status === 'tie' ? 'tie' : 'closed', winner: r.winner ?? null, tied: r.tied ?? [] };
  },
  async insertPoll(row, wishIds) {
    const { data, error } = await supabase
      .from('polls')
      .insert({ ...row, ...NEW_POLL_RULES, title: row.title.trim() })
      .select()
      .single();
    if (error) throw error;
    const poll = data as Poll;
    const { error: optionsError } = await supabase
      .from('poll_options')
      .insert(wishIds.map((wish_id) => ({ poll_id: poll.id, wish_id })));
    if (optionsError) {
      // A vote without its candidates is no use: archive it and report the failure.
      await supabase.from('polls').delete().eq('id', poll.id);
      throw optionsError;
    }
    return poll;
  },
  async updatePoll(id, patch) {
    const clean = patch.title != null ? { ...patch, title: patch.title.trim() } : patch;
    const { data, error } = await supabase.from('polls').update(clean).eq('id', id).select().single();
    if (error) throw error;
    return data as Poll;
  },
  async deletePoll(id) {
    const { error } = await supabase.from('polls').delete().eq('id', id);
    if (error) throw error;
  },
  async castVote(pollId, memberId, optionIds) {
    const { data, error } = await supabase.rpc('cast_vote', { p_poll: pollId, p_member: memberId, p_options: optionIds });
    if (error) throw error;
    return Number(data) || 0;
  },
};

// Demo twin: the same rules as the database (one live entry per video, «Me apunto» once, close once with a winner
// among the options, cast_vote's checks). Archived rows stay with archived_at and are hidden, as with RLS.

type WishesDemoDb = DemoDb & {
  wishes?: Wish[];
  wish_interest?: WishInterest[];
  polls?: Poll[];
  poll_options?: PollOption[];
  poll_votes?: PollVote[];
};

const isLive = <T extends { archived_at: string | null }>(row: T) => row.archived_at == null;
const memberExists = (db: WishesDemoDb, id: string | null | undefined) =>
  Boolean(id && (db.members ?? []).some((m) => m.id === id));

function checkWish(row: Partial<Wish>) {
  if (row.title != null && (row.title.trim().length < 1 || row.title.trim().length > 200)) {
    throw demoError('wishes_title_check', '23514');
  }
  if (row.artist != null && row.artist.length > 120) throw demoError('wishes_artist_check', '23514');
  if (row.comment != null && row.comment.length > 300) throw demoError('wishes_comment_check', '23514');
  if (row.members_count != null && !(row.members_count >= 1 && row.members_count <= 30)) {
    throw demoError('wishes_members_count_check', '23514');
  }
  if (row.difficulty != null && !['facil', 'media', 'dificil'].includes(row.difficulty)) {
    throw demoError('wishes_difficulty_check', '23514');
  }
}

/** The leaders of a poll right now (twin of the count inside close_poll). */
function demoLeaders(db: WishesDemoDb, poll: Poll): { ids: string[]; top: number } {
  const liveWish = new Set((db.wishes ?? []).filter(isLive).map((w) => w.id));
  const options = (db.poll_options ?? []).filter((o) => isLive(o) && o.poll_id === poll.id && liveWish.has(o.wish_id));
  const n = options.length;
  const score = new Map(options.map((o) => [o.wish_id, 0]));
  for (const v of db.poll_votes ?? []) {
    if (!isLive(v) || v.poll_id !== poll.id) continue;
    const option = options.find((o) => o.id === v.option_id);
    if (!option) continue;
    score.set(option.wish_id, score.get(option.wish_id)! + (poll.vote_type === 'ranking' ? n - (v.rank ?? n) + 1 : 1));
  }
  const top = Math.max(0, ...score.values());
  return { ids: [...score].filter(([, s]) => s === top).map(([id]) => id).sort(), top };
}

const demoWishes: WishesBackend = {
  listWishes: () =>
    query((raw) =>
      ((raw as WishesDemoDb).wishes ?? []).filter(isLive).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    ),
  insertWish: async (row) =>
    mutate((raw) => {
      const db = raw as WishesDemoDb;
      if (!/^[A-Za-z0-9_-]{11}$/.test(row.youtube_id)) throw demoError('wishes_youtube_id_check', '23514');
      checkWish(row);
      const wishes = (db.wishes ??= []);
      if (wishes.some((w) => isLive(w) && w.added_video_id == null && w.youtube_id === row.youtube_id)) {
        throw demoError('duplicate key value violates unique constraint "wishes_crew_youtube_key"', '23505');
      }
      const wish: Wish = {
        id: crypto.randomUUID(),
        crew_id: db.crews[0]!.id,
        youtube_id: row.youtube_id,
        title: row.title.trim(),
        artist: row.artist ?? null,
        thumbnail_url: row.thumbnail_url ?? null,
        members_count: row.members_count ?? null,
        difficulty: row.difficulty ?? null,
        comment: row.comment ?? null,
        proposed_by_member_id: memberExists(db, row.proposed_by_member_id) ? row.proposed_by_member_id! : null,
        added_video_id: null,
        created_at: now(),
        archived_at: null,
      };
      wishes.push(wish);
      return wish;
    }),
  updateWish: async (id, patch) =>
    mutate((raw) => {
      const db = raw as WishesDemoDb;
      const wish = db.wishes?.find((w) => w.id === id && isLive(w));
      if (!wish) throw demoError('PGRST116 0 rows');
      checkWish(patch);
      if (patch.added_video_id && !db.videos.some((v) => v.id === patch.added_video_id)) {
        throw demoError('wish_video_invalid');
      }
      Object.assign(wish, patch, patch.title != null ? { title: patch.title.trim() } : {});
      return wish;
    }),
  deleteWish: async (id) =>
    mutate((raw) => {
      const wish = (raw as WishesDemoDb).wishes?.find((w) => w.id === id);
      if (wish && isLive(wish)) wish.archived_at = now();
    }),
  listInterest: () =>
    query((raw) => {
      const db = raw as WishesDemoDb;
      const live = new Set((db.wishes ?? []).filter(isLive).map((w) => w.id));
      return (db.wish_interest ?? [])
        .filter((i) => isLive(i) && live.has(i.wish_id) && memberExists(db, i.member_id))
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    }),
  addInterest: async (wishId, memberId) =>
    mutate((raw) => {
      const db = raw as WishesDemoDb;
      if (!db.wishes?.some((w) => w.id === wishId && isLive(w)) || !memberExists(db, memberId)) {
        throw demoError('wish_interest_invalid');
      }
      const rows = (db.wish_interest ??= []);
      if (rows.some((i) => isLive(i) && i.wish_id === wishId && i.member_id === memberId)) {
        throw demoError('duplicate key value violates unique constraint "wish_interest_once_key"', '23505');
      }
      const row: WishInterest = {
        id: crypto.randomUUID(),
        crew_id: db.crews[0]!.id,
        wish_id: wishId,
        member_id: memberId,
        created_at: now(),
        archived_at: null,
      };
      rows.push(row);
      return row;
    }),
  removeInterest: async (id) =>
    mutate((raw) => {
      const row = (raw as WishesDemoDb).wish_interest?.find((i) => i.id === id);
      if (row && isLive(row)) row.archived_at = now();
    }),
  listPolls: () =>
    query((raw) =>
      ((raw as WishesDemoDb).polls ?? []).filter(isLive).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    ),
  listPollOptions: () =>
    query((raw) => {
      const db = raw as WishesDemoDb;
      const live = new Set((db.polls ?? []).filter(isLive).map((p) => p.id));
      return (db.poll_options ?? []).filter((o) => isLive(o) && live.has(o.poll_id));
    }),
  listPollVotes: (pollIds) =>
    query((raw) => {
      const db = raw as WishesDemoDb;
      const wanted = new Set(pollIds);
      const live = new Set((db.polls ?? []).filter((p) => isLive(p) && wanted.has(p.id)).map((p) => p.id));
      return (db.poll_votes ?? []).filter((v) => isLive(v) && live.has(v.poll_id));
    }),
  closePoll: async (pollId, resolve, winnerWishId = null) =>
    mutate((raw): CloseResult => {
      // Twin of close_poll(): counts the live candidates (wish not deleted) with the votes as they are now.
      const db = raw as WishesDemoDb;
      const poll = db.polls?.find((p) => p.id === pollId && isLive(p));
      if (!poll) throw demoError('poll_not_found');
      if (poll.closed_at != null) return { status: 'closed', winner: poll.winner_wish_id, tied: [] };
      const leaders = demoLeaders(db, poll);
      const close = (winner: string | null) => {
        poll.closed_at = now();
        poll.winner_wish_id = winner;
      };
      if (resolve === 'none') {
        close(null);
        return { status: 'closed', winner: null, tied: leaders.ids };
      }
      if (resolve === 'pick') {
        if (!winnerWishId || !leaders.ids.includes(winnerWishId)) throw demoError('poll_winner_invalid');
        close(winnerWishId);
        return { status: 'closed', winner: winnerWishId, tied: leaders.ids };
      }
      if (!leaders.ids.length || leaders.top === 0) {
        close(null);
        return { status: 'closed', winner: null, tied: [] };
      }
      if (leaders.ids.length > 1) return { status: 'tie', winner: null, tied: leaders.ids };
      close(leaders.ids[0]!);
      return { status: 'closed', winner: leaders.ids[0]!, tied: [] };
    }),
  insertPoll: async (row, wishIds) =>
    mutate((raw) => {
      const db = raw as WishesDemoDb;
      const title = row.title.trim();
      if (title.length < 1 || title.length > 80) throw demoError('polls_title_check', '23514');
      if (!['single', 'multi', 'ranking'].includes(row.vote_type)) throw demoError('polls_vote_type_check', '23514');
      const liveWishIds = new Set((db.wishes ?? []).filter(isLive).map((w) => w.id));
      if (wishIds.some((id) => !liveWishIds.has(id))) throw demoError('poll_option_invalid');
      if (new Set(wishIds).size !== wishIds.length) {
        throw demoError('duplicate key value violates unique constraint "poll_options_once_key"', '23505');
      }
      const poll: Poll = {
        id: crypto.randomUUID(),
        crew_id: db.crews[0]!.id,
        title,
        vote_type: row.vote_type,
        ...NEW_POLL_RULES,
        closed_at: null,
        winner_wish_id: null,
        parent_poll_id: row.parent_poll_id && db.polls?.some((p) => p.id === row.parent_poll_id) ? row.parent_poll_id : null,
        created_by_member_id: memberExists(db, row.created_by_member_id) ? row.created_by_member_id : null,
        created_at: now(),
        archived_at: null,
      };
      (db.polls ??= []).push(poll);
      const options = (db.poll_options ??= []);
      for (const wish_id of wishIds) {
        options.push({ id: crypto.randomUUID(), crew_id: poll.crew_id, poll_id: poll.id, wish_id, created_at: now(), archived_at: null });
      }
      return poll;
    }),
  updatePoll: async (id, patch) =>
    mutate((raw) => {
      const db = raw as WishesDemoDb;
      const poll = db.polls?.find((p) => p.id === id && isLive(p));
      if (!poll) throw demoError('PGRST116 0 rows');
      const next = { ...poll, ...patch };
      // Twin of guard_poll_update(): closed once; then frozen; the winner only while closing, and an option.
      if (poll.closed_at != null) {
        if (
          next.closed_at !== poll.closed_at ||
          next.winner_wish_id !== poll.winner_wish_id ||
          next.closes_at !== poll.closes_at ||
          next.anonymous !== poll.anonymous ||
          next.results_live !== poll.results_live
        ) {
          throw demoError('poll_closed');
        }
      } else if (poll.closes_at != null && Date.parse(poll.closes_at) <= Date.now() && next.closes_at !== poll.closes_at) {
        throw demoError('poll_closed');
      } else if (next.closed_at != null) {
        next.closed_at = now();
      }
      if (next.winner_wish_id != null && next.winner_wish_id !== poll.winner_wish_id) {
        const isOption = (db.poll_options ?? []).some((o) => isLive(o) && o.poll_id === id && o.wish_id === next.winner_wish_id);
        if (next.closed_at == null || !isOption) throw demoError('poll_winner_invalid');
      }
      if (next.title.trim().length < 1 || next.title.trim().length > 80) throw demoError('polls_title_check', '23514');
      Object.assign(poll, next, { title: next.title.trim() });
      return poll;
    }),
  deletePoll: async (id) =>
    mutate((raw) => {
      const db = raw as WishesDemoDb;
      const poll = db.polls?.find((p) => p.id === id);
      if (!poll || !isLive(poll)) return;
      poll.archived_at = now();
      for (const o of db.poll_options ?? []) if (o.poll_id === id && isLive(o)) o.archived_at = now();
    }),
  castVote: async (pollId, memberId, optionIds) =>
    mutate((raw) => {
      // Twin of cast_vote().
      const db = raw as WishesDemoDb;
      const poll = db.polls?.find((p) => p.id === pollId && isLive(p));
      if (!poll) throw demoError('poll_not_found');
      if (poll.closed_at != null || (poll.closes_at != null && Date.parse(poll.closes_at) <= Date.now())) {
        throw demoError('poll_closed');
      }
      if (!memberExists(db, memberId)) throw demoError('vote_member_invalid');
      const valid = new Set(
        (db.poll_options ?? []).filter((o) => isLive(o) && o.poll_id === pollId).map((o) => o.id),
      );
      if (new Set(optionIds.filter((id) => valid.has(id))).size !== optionIds.length) {
        throw demoError('vote_options_invalid');
      }
      if (poll.vote_type === 'single' && optionIds.length > 1) throw demoError('vote_options_invalid');
      const votes = (db.poll_votes ??= []);
      for (const v of votes) if (v.poll_id === pollId && v.member_id === memberId && isLive(v)) v.archived_at = now();
      // A candidate whose wish was deleted meanwhile is skipped; the ranks of the rest close up.
      const liveWish = new Set((db.wishes ?? []).filter(isLive).map((w) => w.id));
      const kept = optionIds.filter((id) => {
        const option = db.poll_options?.find((o) => o.id === id);
        return option != null && liveWish.has(option.wish_id);
      });
      kept.forEach((option_id, i) => {
        votes.push({
          id: crypto.randomUUID(),
          crew_id: poll.crew_id,
          poll_id: pollId,
          option_id,
          member_id: memberId,
          rank: poll.vote_type === 'ranking' ? i + 1 : null,
          created_at: now(),
          archived_at: null,
        });
      });
      return optionIds.length;
    }),
};

export const wishesBackend: WishesBackend = IS_DEMO ? demoWishes : supabaseWishes;

// ───────────────────────────── F16 events · F15 reactions ─────────────────────────────

export type EventWithCount = CrewEvent & { songs: number };
export type EventSongVideo = Pick<Video, 'id' | 'title' | 'artist' | 'thumbnail_url' | 'source' | 'youtube_id'>;
/** A song of the repertoire with its video (a song archived from the library never comes back). */
export type EventSongView = EventSong & { video: EventSongVideo | null };
/** The granted columns of an event: name, starts_at, place. */
export type NewEvent = Pick<CrewEvent, 'name' | 'starts_at' | 'place'>;
export type EventPatch = Partial<NewEvent>;
export type NewReaction = { take_id: string; member_id: string | null; emoji: ReactionEmoji };

/**
 * F16 · events and their repertoire, F15 · reactions on shared takes. Shared by the group; deleting archives.
 * Only granted columns are written: events (name, starts_at, place), event_songs (position); reactions are only
 * added or removed. The database checks the rest (the song is in the library, the take is shared…).
 */
export interface EventsBackend {
  listEvents(): Promise<EventWithCount[]>;
  getEvent(id: string): Promise<CrewEvent | null>;
  insertEvent(row: NewEvent): Promise<CrewEvent>;
  updateEvent(id: string, patch: EventPatch): Promise<CrewEvent>;
  deleteEvent(id: string): Promise<void>;
  listEventSongs(eventId: string): Promise<EventSongView[]>;
  insertEventSongs(eventId: string, videoIds: string[], positions: number[]): Promise<EventSong[]>;
  deleteEventSong(id: string): Promise<void>;
  setEventSongPositions(patches: { id: string; position: number }[]): Promise<void>;
  /** The reactions on the takes of one song, oldest first. */
  listReactions(videoId: string): Promise<TakeReaction[]>;
  addReaction(row: NewReaction): Promise<TakeReaction>;
  removeReaction(id: string): Promise<void>;
}

const EVENT_SONG_SELECT = '*, video:videos(id, title, artist, thumbnail_url, source, youtube_id)';

const supabaseEvents: EventsBackend = {
  async listEvents() {
    const { data, error } = await supabase.from('events').select('*, event_songs(count)').order('starts_at');
    if (error) throw error;
    return (data as unknown as (CrewEvent & { event_songs: { count: number }[] })[]).map(({ event_songs, ...event }) => ({
      ...event,
      songs: event_songs[0]?.count ?? 0,
    }));
  },
  async getEvent(id) {
    const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ?? null;
  },
  async insertEvent(row) {
    // crew_id comes from the database (the default group).
    const { data, error } = await supabase
      .from('events')
      .insert({ ...row, name: row.name.trim() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async updateEvent(id, patch) {
    const clean = patch.name != null ? { ...patch, name: patch.name.trim() } : patch;
    const { data, error } = await supabase.from('events').update(clean).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteEvent(id) {
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) throw error;
  },
  async listEventSongs(eventId) {
    const { data, error } = await supabase
      .from('event_songs')
      .select(EVENT_SONG_SELECT)
      .eq('event_id', eventId)
      .order('position')
      .order('created_at');
    if (error) throw error;
    return data as unknown as EventSongView[];
  },
  async insertEventSongs(eventId, videoIds, positions) {
    if (!videoIds.length) return [];
    const rows = videoIds.map((video_id, i) => ({ event_id: eventId, video_id, position: positions[i] ?? i }));
    const { data, error } = await supabase.from('event_songs').insert(rows).select();
    if (error) throw error;
    return data;
  },
  async deleteEventSong(id) {
    const { error } = await supabase.from('event_songs').delete().eq('id', id);
    if (error) throw error;
  },
  async setEventSongPositions(patches) {
    const results = await Promise.all(
      patches.map(({ id, position }) => supabase.from('event_songs').update({ position }).eq('id', id)),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
  },
  async listReactions(videoId) {
    const rows = await fetchAll<TakeReaction & { take: unknown }>((from, to) =>
      supabase
        .from('take_reactions')
        .select('id, crew_id, take_id, member_id, emoji, created_at, archived_at, take:takes!inner(video_id)')
        .eq('take.video_id', videoId)
        .order('created_at')
        .order('id')
        .range(from, to),
    );
    return rows.map(({ take: _take, ...row }) => row);
  },
  async addReaction(row) {
    const { data, error } = await supabase.from('take_reactions').insert(row).select().single();
    if (error) throw error;
    return data as TakeReaction;
  },
  async removeReaction(id) {
    const { error } = await supabase.from('take_reactions').delete().eq('id', id);
    if (error) throw error;
  },
};

// Demo twin: the same rules as the database (name 1–80, place ≤ 120, a song once per event and only from the
// library, positions 0–999, reactions only on shared takes, one of each per person or «sin nombre», known emoji).

type EventsDemoDb = DemoDb & {
  events?: CrewEvent[];
  event_songs?: EventSong[];
  take_reactions?: TakeReaction[];
};

const DEMO_EMOJIS = ['🔥', '👏', '💯', '😂'];

function checkEventRow(row: Partial<NewEvent>) {
  if (row.name != null && (row.name.trim().length < 1 || row.name.trim().length > 80)) {
    throw demoError('new row for relation "events" violates check constraint "events_name_check"', '23514');
  }
  if (row.place != null && row.place.length > 120) {
    throw demoError('new row for relation "events" violates check constraint "events_place_check"', '23514');
  }
  if (row.starts_at !== undefined && (row.starts_at == null || Number.isNaN(Date.parse(row.starts_at)))) {
    throw demoError('invalid input syntax for type timestamp with time zone', '22007');
  }
}

const liveEvent = (db: EventsDemoDb, id: string) => (db.events ?? []).find((e) => e.id === id && isLive(e));

function demoSongView(db: EventsDemoDb, song: EventSong): EventSongView | null {
  const video = db.videos.find((v) => v.id === song.video_id);
  if (!video || !isLive(song) || !liveEvent(db, song.event_id)) return null;
  return {
    ...song,
    video: {
      id: video.id,
      title: video.title,
      artist: video.artist,
      thumbnail_url: video.thumbnail_url,
      source: video.source,
      youtube_id: video.youtube_id,
    },
  };
}

const demoEvents: EventsBackend = {
  listEvents: () =>
    query((raw) => {
      const db = raw as EventsDemoDb;
      return (db.events ?? [])
        .filter(isLive)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        .map((event) => ({
          ...event,
          songs: (db.event_songs ?? []).filter((s) => s.event_id === event.id && demoSongView(db, s)).length,
        }));
    }),
  getEvent: (id) => query((raw) => liveEvent(raw as EventsDemoDb, id) ?? null),
  insertEvent: async (row) =>
    mutate((raw) => {
      const db = raw as EventsDemoDb;
      checkEventRow(row);
      const event: CrewEvent = {
        id: crypto.randomUUID(),
        crew_id: db.crews[0]!.id,
        name: row.name.trim(),
        starts_at: new Date(row.starts_at).toISOString(),
        place: row.place ?? null,
        created_at: now(),
        archived_at: null,
      };
      (db.events ??= []).push(event);
      return event;
    }),
  updateEvent: async (id, patch) =>
    mutate((raw) => {
      const event = liveEvent(raw as EventsDemoDb, id);
      if (!event) throw demoError('PGRST116 0 rows');
      checkEventRow(patch);
      Object.assign(
        event,
        patch,
        patch.name != null ? { name: patch.name.trim() } : {},
        patch.starts_at != null ? { starts_at: new Date(patch.starts_at).toISOString() } : {},
      );
      return event;
    }),
  deleteEvent: async (id) =>
    mutate((raw) => {
      const db = raw as EventsDemoDb;
      const event = liveEvent(db, id);
      if (!event) return;
      event.archived_at = now();
      for (const s of db.event_songs ?? []) if (s.event_id === id && isLive(s)) s.archived_at = now();
    }),
  listEventSongs: (eventId) =>
    query((raw) => {
      const db = raw as EventsDemoDb;
      return (db.event_songs ?? [])
        .filter((s) => s.event_id === eventId)
        .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
        .map((s) => demoSongView(db, s))
        .filter((s): s is EventSongView => s != null);
    }),
  insertEventSongs: async (eventId, videoIds, positions) =>
    mutate((raw) => {
      const db = raw as EventsDemoDb;
      const event = liveEvent(db, eventId);
      if (!event) throw demoError('event_not_found');
      const songs = (db.event_songs ??= []);
      const rows = videoIds.map((video_id, i): EventSong => {
        if (!db.videos.some((v) => v.id === video_id)) throw demoError('event_song_invalid');
        const position = positions[i] ?? i;
        if (!(position >= 0 && position <= 999)) {
          throw demoError('new row for relation "event_songs" violates check constraint "event_songs_position_check"', '23514');
        }
        return {
          id: crypto.randomUUID(),
          crew_id: event.crew_id,
          event_id: eventId,
          video_id,
          position,
          created_at: now(),
          archived_at: null,
        };
      });
      // All or nothing, like one insert statement.
      const taken = new Set(songs.filter((s) => s.event_id === eventId && isLive(s)).map((s) => s.video_id));
      for (const row of rows) {
        if (taken.has(row.video_id)) {
          throw demoError('duplicate key value violates unique constraint "event_songs_once_key"', '23505');
        }
        taken.add(row.video_id);
      }
      songs.push(...rows);
      return rows;
    }),
  deleteEventSong: async (id) =>
    mutate((raw) => {
      const song = (raw as EventsDemoDb).event_songs?.find((s) => s.id === id);
      if (song && isLive(song)) song.archived_at = now();
    }),
  setEventSongPositions: async (patches) =>
    mutate((raw) => {
      const db = raw as EventsDemoDb;
      for (const { id, position } of patches) {
        if (!(position >= 0 && position <= 999)) {
          throw demoError('new row for relation "event_songs" violates check constraint "event_songs_position_check"', '23514');
        }
        const song = db.event_songs?.find((s) => s.id === id && isLive(s));
        if (song && !liveEvent(db, song.event_id)) throw demoError('event_not_found');
        if (song) song.position = position;
      }
    }),
  listReactions: (videoId) =>
    query((raw) => {
      const db = raw as EventsDemoDb;
      const takes = new Set((db.takes ?? []).filter((t) => t.video_id === videoId && t.archived_at == null).map((t) => t.id));
      return (db.take_reactions ?? [])
        .filter((r) => isLive(r) && takes.has(r.take_id))
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    }),
  addReaction: async (row) =>
    mutate((raw) => {
      const db = raw as EventsDemoDb;
      if (!DEMO_EMOJIS.includes(row.emoji)) {
        throw demoError('new row for relation "take_reactions" violates check constraint "take_reactions_emoji_check"', '23514');
      }
      const take = (db.takes ?? []).find((t) => t.id === row.take_id && t.archived_at == null && t.shared_path != null);
      if (!take) throw demoError('reaction_take_invalid');
      const member = row.member_id && (db.members ?? []).some((m) => m.id === row.member_id) ? row.member_id : null;
      const reactions = (db.take_reactions ??= []);
      if (reactions.some((r) => isLive(r) && r.take_id === take.id && r.member_id === member && r.emoji === row.emoji)) {
        throw demoError('duplicate key value violates unique constraint "take_reactions_once_key"', '23505');
      }
      const reaction: TakeReaction = {
        id: crypto.randomUUID(),
        crew_id: take.crew_id,
        take_id: take.id,
        member_id: member,
        emoji: row.emoji,
        created_at: now(),
        archived_at: null,
      };
      reactions.push(reaction);
      return reaction;
    }),
  removeReaction: async (id) =>
    mutate((raw) => {
      const reaction = (raw as EventsDemoDb).take_reactions?.find((r) => r.id === id);
      if (reaction && isLive(reaction)) reaction.archived_at = now();
    }),
};

export const eventsBackend: EventsBackend = IS_DEMO ? demoEvents : supabaseEvents;

// ───────────────────────────── 18 · voice and music, separated with AI ─────────────────────────────

/** One separation of a video's file: two tracks (voice, instrumental) in the `videos` bucket, shared by the group. */
export type VideoStems = Tables<'video_stems'>;
/** What the device that separated says about it (the database sets the group, the date and the files). */
export type NewVideoStems = Pick<
  VideoStems,
  'id' | 'video_id' | 'member_id' | 'source_file_name' | 'source_file_size' | 'model' | 'duration_seconds' | 'delay_seconds' | 'mime_type'
>;

/**
 * 18 · Separating happens once on a powerful device; this keeps the result for everyone: a row (born without
 * files), the two uploads under `<group>/stems/<row id>/`, then both paths at once (the database checks the files
 * are there and records their real sizes). Deleting archives; files are never deleted from the client.
 */
export interface StemsBackend {
  listStems(videoId: string): Promise<VideoStems[]>;
  insertStems(row: NewVideoStems): Promise<VideoStems>;
  /** Never overwrites. `exists` means an earlier attempt already uploaded it (fine to carry on). */
  uploadStemFile(path: string, file: Blob): Promise<UploadResult>;
  completeStems(id: string, paths: { vocals_path: string; instrumental_path: string }): Promise<VideoStems>;
  deleteStems(id: string): Promise<void>;
  signedStemUrl(path: string): Promise<string | null>;
}

const STEM_COLUMNS =
  'id, crew_id, video_id, member_id, source_file_name, source_file_size, model, duration_seconds, delay_seconds, mime_type, vocals_path, instrumental_path, vocals_size, instrumental_size, created_at, archived_at';

const supabaseStems: StemsBackend = {
  async listStems(videoId) {
    const { data, error } = await supabase
      .from('video_stems')
      .select(STEM_COLUMNS)
      .eq('video_id', videoId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as unknown as VideoStems[];
  },
  async insertStems(row) {
    const { data, error } = await supabase.from('video_stems').insert(row).select(STEM_COLUMNS).single();
    if (error) throw error;
    return data as unknown as VideoStems;
  },
  async uploadStemFile(path, file) {
    const { error } = await supabase.storage.from(VIDEO_BUCKET).upload(path, file, { contentType: file.type || 'audio/mp4' });
    if (!error) return { ok: true, path };
    console.error('[uploadStemFile]', error);
    const e = error as { status?: number; statusCode?: string; message?: string };
    if (Number(e.status ?? e.statusCode) === 409 || /already exists|duplicate/i.test(e.message ?? '')) {
      return { ok: false, reason: 'exists' };
    }
    return { ok: false, reason: uploadFailure(error) };
  },
  async completeStems(id, paths) {
    const { data, error } = await supabase.from('video_stems').update(paths).eq('id', id).select(STEM_COLUMNS).single();
    if (error) throw error;
    return data as unknown as VideoStems;
  },
  async deleteStems(id) {
    const { error } = await supabase.from('video_stems').delete().eq('id', id);
    if (error) throw error;
  },
  async signedStemUrl(path) {
    const { data, error } = await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(path, 6 * 60 * 60);
    return error ? null : data.signedUrl;
  },
};

// Demo twin: the same rules (group from the video, never born with files, both paths at once and only once, files
// under the row's folder and ≤ 16 MiB, deleting archives); the files go to the demo's pretend cloud.

type StemsDemoDb = DemoDb & { video_stems?: VideoStems[] };
const STEM_FILE_CAP = 16 * 1024 * 1024;

const demoStems: StemsBackend = {
  listStems: (videoId) =>
    query((raw) => {
      const db = raw as StemsDemoDb;
      if (!db.videos.some((v) => v.id === videoId)) return [];
      return (db.video_stems ?? [])
        .filter((s) => s.video_id === videoId && isLive(s))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }),
  insertStems: async (row) =>
    mutate((raw) => {
      const db = raw as StemsDemoDb;
      const video = db.videos.find((v) => v.id === row.video_id);
      if (!video) throw demoError(`video ${row.video_id} not found`);
      const rows = (db.video_stems ??= []);
      if (rows.filter(isLive).length >= 300) throw demoError('video_stems_cap_reached');
      const stems: VideoStems = {
        ...row,
        crew_id: video.crew_id,
        member_id: row.member_id && (db.members ?? []).some((m) => m.id === row.member_id && m.archived_at == null) ? row.member_id : null,
        vocals_path: null,
        instrumental_path: null,
        vocals_size: null,
        instrumental_size: null,
        created_at: now(),
        archived_at: null,
      };
      rows.push(stems);
      return stems;
    }),
  // Same order as `stem_object_allowed` and then the unique name: a live row with no tracks yet, no second copy of
  // this kind under another extension, then «already there» (409) before the room check, then the room.
  uploadStemFile: async (path, file) => {
    const parts = /^([0-9a-f-]{36})\/stems\/([0-9a-f-]{36})\/(vocals|instrumental)\.(m4a|mp4|webm|ogg)$/.exec(path);
    if (!parts) return { ok: false, reason: 'denied' };
    const [, crewId, rowId, kind, ext] = parts as unknown as [string, string, string, string, string];
    const db = readDb() as StemsDemoDb;
    const row = db.video_stems?.find((s) => s.id === rowId && isLive(s) && s.crew_id === crewId);
    // (The demo removes a deleted video outright.)
    if (!row || !db.videos.some((v) => v.id === row.video_id) || row.vocals_path || row.instrumental_path) {
      return { ok: false, reason: 'denied' };
    }
    const dir = `${crewId}/stems/${rowId}`;
    const stored = async (k: string) => {
      for (const e of ['m4a', 'mp4', 'webm', 'ogg']) if ((await demoCloudUrl(`${dir}/${k}.${e}`)) != null) return e;
      return null;
    };
    const sameKind = await stored(kind);
    if (sameKind != null && sameKind !== ext) return { ok: false, reason: 'denied' };
    if (sameKind === ext) return { ok: false, reason: 'exists' };
    // The database's room rule: the tracks still missing (16 MiB each) and 50 MB left for one take.
    const missing = (await stored(kind === 'vocals' ? 'instrumental' : 'vocals')) != null ? 1 : 2;
    const takes = (readDb().takes ?? []).reduce((s, t) => s + (t.shared_size ?? 0), 0);
    if (!videosBucketHasRoom(takes + (await demoCloudBytes()), missing * STEM_FILE_CAP)) return { ok: false, reason: 'denied' };
    return (await saveDemoCloudFile(path, file)) ? { ok: true, path } : { ok: false, reason: 'denied' };
  },
  completeStems: async (id, paths) => {
    const sizes = await Promise.all(
      [paths.vocals_path, paths.instrumental_path].map(async (p) => {
        const url = await demoCloudUrl(p);
        return url ? (await fetch(url).then((r) => r.blob())).size : null;
      }),
    );
    return mutate((raw) => {
      const db = raw as StemsDemoDb;
      const stems = db.video_stems?.find((s) => s.id === id && isLive(s));
      if (!stems) throw demoError('PGRST116 0 rows');
      if (stems.vocals_path || stems.instrumental_path) throw demoError('stems_locked');
      const own = (p: string, kind: string) => new RegExp(`^${stems.crew_id}/stems/${stems.id}/${kind}\.(m4a|mp4|webm|ogg)$`).test(p);
      if (!own(paths.vocals_path, 'vocals') || !own(paths.instrumental_path, 'instrumental')) {
        throw demoError('new row for relation "video_stems" violates check constraint "video_stems_vocals_path_own"', '23514');
      }
      const [vocals, instrumental] = sizes;
      if (vocals == null || instrumental == null) throw demoError('stems_file_missing');
      if (vocals > STEM_FILE_CAP || instrumental > STEM_FILE_CAP) throw demoError('stems_too_big');
      Object.assign(stems, paths, { vocals_size: Math.max(1, vocals), instrumental_size: Math.max(1, instrumental) });
      return stems;
    });
  },
  deleteStems: async (id) =>
    mutate((raw) => {
      const stems = (raw as StemsDemoDb).video_stems?.find((s) => s.id === id && isLive(s));
      if (stems) stems.archived_at = now();
    }),
  signedStemUrl: (path) => demoCloudUrl(path),
};

export const stemsBackend: StemsBackend = IS_DEMO ? demoStems : supabaseStems;

// ───────────────────────────── REQ-03 absences · REQ-04 rehearsals ─────────────────────────────

/** A person the calendar can name: the live members plus archived ones that still have absences (greyed out). */
export type CalendarMember = Pick<Member, 'id' | 'name' | 'color'> & { archived: boolean };
export type NewAbsence = Pick<Absence, 'member_id' | 'starts_on' | 'ends_on' | 'kind' | 'at_time' | 'note'> & {
  created_by_member: string | null;
};
/** The granted columns: dates, kind, time and note (the person and who marked it are fixed). */
export type AbsencePatch = Pick<Absence, 'starts_on' | 'ends_on' | 'kind' | 'at_time' | 'note'>;
export type NewRehearsalRule = Pick<RehearsalRule, 'weekday' | 'starts_at' | 'ends_at'>;
export type NewRehearsalException =
  | { kind: 'cancel'; on_date: string; rule_id: string }
  | { kind: 'extra'; on_date: string; starts_at: string; ends_at: string };

/**
 * REQ-03 / REQ-04 · the calendar: absences, weekly rehearsal rules and their per-date exceptions. Shared by the
 * group; deleting archives. Rules are never edited in place: `editRehearsalRule` and `endRehearsalRule` close the
 * old rule yesterday (Madrid) in one RPC so past weeks keep their timetable.
 */
export interface CalendarBackend {
  listCalendarMembers(): Promise<CalendarMember[]>;
  /** Absences touching the days from `from` to `to` (both included). */
  listAbsences(from: string, to: string): Promise<Absence[]>;
  insertAbsence(row: NewAbsence): Promise<Absence>;
  updateAbsence(id: string, patch: AbsencePatch): Promise<Absence>;
  deleteAbsence(id: string): Promise<void>;
  /** Every rule (ended ones too: past weeks are drawn from them). */
  listRehearsalRules(): Promise<RehearsalRule[]>;
  insertRehearsalRule(row: NewRehearsalRule): Promise<RehearsalRule>;
  editRehearsalRule(id: string, row: NewRehearsalRule): Promise<RehearsalRule>;
  endRehearsalRule(id: string): Promise<void>;
  listRehearsalExceptions(from: string, to: string): Promise<RehearsalException[]>;
  insertRehearsalException(row: NewRehearsalException): Promise<RehearsalException>;
  deleteRehearsalException(id: string): Promise<void>;
}

const supabaseCalendar: CalendarBackend = {
  async listCalendarMembers() {
    const { data, error } = await supabase.rpc('calendar_members');
    if (error) throw error;
    return (data ?? []).map((m) => ({ ...m, color: isMemberColor(m.color) ? m.color : 'ai' }));
  },
  async listAbsences(from, to) {
    const rows = await fetchAll<Tables<'absences'>>((start, end) =>
      supabase
        .from('absences')
        .select('*')
        .lte('starts_on', to)
        .gte('ends_on', from)
        .order('starts_on')
        .order('id')
        .range(start, end),
    );
    return rows as Absence[];
  },
  async insertAbsence(row) {
    // crew_id comes from the database (the default group).
    const { data, error } = await supabase.from('absences').insert(row).select().single();
    if (error) throw error;
    return data as Absence;
  },
  async updateAbsence(id, patch) {
    const { data, error } = await supabase.from('absences').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data as Absence;
  },
  async deleteAbsence(id) {
    const { error } = await supabase.from('absences').delete().eq('id', id);
    if (error) throw error;
  },
  async listRehearsalRules() {
    const { data, error } = await supabase.from('rehearsal_rules').select('*').order('weekday').order('starts_at');
    if (error) throw error;
    return data;
  },
  async insertRehearsalRule(row) {
    const { data, error } = await supabase.from('rehearsal_rules').insert(row).select().single();
    if (error) throw error;
    return data;
  },
  async editRehearsalRule(id, row) {
    const { data, error } = await supabase
      .rpc('edit_rehearsal_rule', { p_rule: id, p_weekday: row.weekday, p_starts: row.starts_at, p_ends: row.ends_at })
      .single();
    if (error) throw error;
    return data as RehearsalRule;
  },
  async endRehearsalRule(id) {
    const { error } = await supabase.rpc('end_rehearsal_rule', { p_rule: id });
    if (error) throw error;
  },
  async listRehearsalExceptions(from, to) {
    const { data, error } = await supabase
      .from('rehearsal_exceptions')
      .select('*')
      .gte('on_date', from)
      .lte('on_date', to)
      .order('on_date');
    if (error) throw error;
    return data as RehearsalException[];
  },
  async insertRehearsalException(row) {
    const insert: TablesInsert<'rehearsal_exceptions'> = { ...row };
    const { data, error } = await supabase.from('rehearsal_exceptions').insert(insert).select().single();
    if (error) throw error;
    return data as RehearsalException;
  },
  async deleteRehearsalException(id) {
    const { error } = await supabase.from('rehearsal_exceptions').delete().eq('id', id);
    if (error) throw error;
  },
};

// Demo twin: the same rules as the database (range of at most 61 days, time only with arrives / leaves, note up to
// 140, only live members, rules born today and edited from today, one cancellation per session on its weekday).

type CalendarDemoDb = DemoDb & {
  absences?: Absence[];
  rehearsal_rules?: RehearsalRule[];
  rehearsal_exceptions?: RehearsalException[];
};

const checkViolation = (constraint: string, table: string) =>
  demoError(`new row for relation "${table}" violates check constraint "${constraint}"`, '23514');

function checkDemoAbsence(row: AbsencePatch) {
  if (!isDayKey(row.starts_on) || !isDayKey(row.ends_on)) throw checkViolation('absences_range_check', 'absences');
  const span = daysBetween(row.starts_on, row.ends_on);
  if (span < 0 || span > ABSENCE_MAX_SPAN) throw checkViolation('absences_range_check', 'absences');
  if ((row.kind === 'all_day') !== (row.at_time == null)) throw checkViolation('absences_time_check', 'absences');
  if (row.note != null && row.note.length > ABSENCE_NOTE_MAX) throw checkViolation('absences_note_check', 'absences');
}

const demoTime = (time: string) => `${hhmm(time)}:00`;

function checkDemoTimes(starts: string, ends: string, table: string) {
  if (!isTime(starts) || !isTime(ends) || minutes(ends) <= minutes(starts)) throw checkViolation(`${table}_times_check`, table);
}

const liveDemoRule = (db: CalendarDemoDb, id: string, today: string) =>
  (db.rehearsal_rules ?? []).find((r) => r.id === id && isLive(r) && (r.valid_until == null || r.valid_until >= today));

const demoCalendar: CalendarBackend = {
  // The demo removes members outright, so there are no archived ones to name.
  listCalendarMembers: () =>
    query((db) =>
      [...(db.members ?? [])]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((m) => ({ id: m.id, name: m.name, color: m.color, archived: false })),
    ),
  listAbsences: (from, to) =>
    query((raw) =>
      ((raw as CalendarDemoDb).absences ?? [])
        .filter((a) => isLive(a) && a.starts_on <= to && a.ends_on >= from)
        .sort((a, b) => a.starts_on.localeCompare(b.starts_on) || a.id.localeCompare(b.id)),
    ),
  insertAbsence: async (row) =>
    mutate((raw) => {
      const db = raw as CalendarDemoDb;
      checkDemoAbsence(row);
      if (!(db.members ?? []).some((m) => m.id === row.member_id)) throw demoError('absence_member_invalid');
      const absence: Absence = {
        id: crypto.randomUUID(),
        crew_id: db.crews[0]!.id,
        member_id: row.member_id,
        starts_on: row.starts_on,
        ends_on: row.ends_on,
        kind: row.kind,
        at_time: row.at_time ? demoTime(row.at_time) : null,
        note: row.note,
        created_by_member:
          row.created_by_member && (db.members ?? []).some((m) => m.id === row.created_by_member) ? row.created_by_member : null,
        created_at: now(),
        archived_at: null,
      };
      (db.absences ??= []).push(absence);
      return absence;
    }),
  updateAbsence: async (id, patch) =>
    mutate((raw) => {
      const absence = ((raw as CalendarDemoDb).absences ?? []).find((a) => a.id === id && isLive(a));
      if (!absence) throw demoError('PGRST116 0 rows');
      checkDemoAbsence(patch);
      Object.assign(absence, { ...patch, at_time: patch.at_time ? demoTime(patch.at_time) : null });
      return absence;
    }),
  deleteAbsence: async (id) =>
    mutate((raw) => {
      const absence = ((raw as CalendarDemoDb).absences ?? []).find((a) => a.id === id);
      if (absence && isLive(absence)) absence.archived_at = now();
    }),
  listRehearsalRules: () =>
    query((raw) =>
      ((raw as CalendarDemoDb).rehearsal_rules ?? [])
        .filter(isLive)
        .sort((a, b) => a.weekday - b.weekday || a.starts_at.localeCompare(b.starts_at)),
    ),
  insertRehearsalRule: async (row) =>
    mutate((raw) => {
      const db = raw as CalendarDemoDb;
      if (!Number.isInteger(row.weekday) || row.weekday < 1 || row.weekday > 7) {
        throw checkViolation('rehearsal_rules_weekday_check', 'rehearsal_rules');
      }
      checkDemoTimes(row.starts_at, row.ends_at, 'rehearsal_rules');
      const rule: RehearsalRule = {
        id: crypto.randomUUID(),
        crew_id: db.crews[0]!.id,
        weekday: row.weekday,
        starts_at: demoTime(row.starts_at),
        ends_at: demoTime(row.ends_at),
        valid_from: madridToday(new Date()),
        valid_until: null,
        created_at: now(),
        archived_at: null,
      };
      (db.rehearsal_rules ??= []).push(rule);
      return rule;
    }),
  editRehearsalRule: async (id, row) =>
    mutate((raw) => {
      const db = raw as CalendarDemoDb;
      const today = madridToday(new Date());
      const old = liveDemoRule(db, id, today);
      if (!old) throw demoError('rehearsal_rule_not_found');
      checkDemoTimes(row.starts_at, row.ends_at, 'rehearsal_rules');
      old.valid_until = addDays(today, -1);
      const rule: RehearsalRule = {
        id: crypto.randomUUID(),
        crew_id: old.crew_id,
        weekday: row.weekday,
        starts_at: demoTime(row.starts_at),
        ends_at: demoTime(row.ends_at),
        valid_from: today,
        valid_until: null,
        created_at: now(),
        archived_at: null,
      };
      db.rehearsal_rules!.push(rule);
      if (row.weekday === old.weekday) {
        for (const e of db.rehearsal_exceptions ?? []) {
          if (e.rule_id === old.id && e.kind === 'cancel' && e.on_date >= today && isLive(e)) e.rule_id = rule.id;
        }
      }
      return rule;
    }),
  endRehearsalRule: async (id) =>
    mutate((raw) => {
      const today = madridToday(new Date());
      const rule = liveDemoRule(raw as CalendarDemoDb, id, today);
      if (!rule) throw demoError('rehearsal_rule_not_found');
      rule.valid_until = addDays(today, -1);
    }),
  listRehearsalExceptions: (from, to) =>
    query((raw) => {
      const db = raw as CalendarDemoDb;
      const liveRules = new Set((db.rehearsal_rules ?? []).filter(isLive).map((r) => r.id));
      return (db.rehearsal_exceptions ?? [])
        .filter((e) => isLive(e) && e.on_date >= from && e.on_date <= to && (e.rule_id == null || liveRules.has(e.rule_id)))
        .sort((a, b) => a.on_date.localeCompare(b.on_date));
    }),
  insertRehearsalException: async (row) =>
    mutate((raw) => {
      const db = raw as CalendarDemoDb;
      if (!isDayKey(row.on_date)) throw demoError('invalid input syntax for type date', '22007');
      const list = (db.rehearsal_exceptions ??= []);
      const base = { id: crypto.randomUUID(), crew_id: db.crews[0]!.id, on_date: row.on_date, created_at: now(), archived_at: null };
      let exception: RehearsalException;
      if (row.kind === 'cancel') {
        const rule = (db.rehearsal_rules ?? []).find((r) => r.id === row.rule_id && isLive(r));
        if (!rule || !ruleRunsOn(rule, row.on_date)) throw demoError('rehearsal_cancel_invalid');
        if (list.some((e) => isLive(e) && e.kind === 'cancel' && e.rule_id === row.rule_id && e.on_date === row.on_date)) {
          throw demoError('duplicate key value violates unique constraint "rehearsal_exceptions_cancel_once_key"', '23505');
        }
        exception = { ...base, kind: 'cancel', rule_id: row.rule_id, starts_at: null, ends_at: null };
      } else {
        checkDemoTimes(row.starts_at, row.ends_at, 'rehearsal_exceptions');
        exception = { ...base, kind: 'extra', rule_id: null, starts_at: demoTime(row.starts_at), ends_at: demoTime(row.ends_at) };
      }
      list.push(exception);
      return exception;
    }),
  deleteRehearsalException: async (id) =>
    mutate((raw) => {
      const exception = ((raw as CalendarDemoDb).rehearsal_exceptions ?? []).find((e) => e.id === id);
      if (exception && isLive(exception)) exception.archived_at = now();
    }),
};

export const calendarBackend: CalendarBackend = IS_DEMO ? demoCalendar : supabaseCalendar;
