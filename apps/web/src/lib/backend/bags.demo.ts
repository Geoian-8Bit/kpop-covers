import { drawOrder } from '@/features/bags/drawRules';
import { cutChars, songYoutubeId, youtubeSongRow } from '@/features/bags/songRules';
import type { Bag, BagDraw, BagItem, Clip, Track, TrackItem, Wish } from '@coverscape/shared';
import { demoError, mutate, now, query } from './demoDb';
import type { DemoDb } from './demoDb';
import type { BagItemView, BagsBackend, ClipWithVideo, NewBagItem } from './types';

// Demo twin: the same rules as the database (kinds, one of each per bag, unique names, draws, archived refs vanish).

type BagsDemoDb = DemoDb & {
  bags?: Bag[];
  bag_items?: BagItem[];
  bag_draws?: BagDraw[];
  tracks?: Track[];
  track_items?: TrackItem[];
};

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
  return v
    ? {
        ...clip,
        video: { id: v.id, title: v.title, artist: v.artist, source: v.source, youtube_id: v.youtube_id },
      }
    : null;
}

function checkBagName(db: BagsDemoDb, name: string, exceptId?: string) {
  const clean = name.trim();
  if (clean.length < 1 || clean.length > 60) throw demoError('bags_name_check', '23514');
  if ((db.bags ?? []).some((b) => b.id !== exceptId && b.name.trim().toLowerCase() === clean.toLowerCase())) {
    throw demoError('duplicate key value violates unique constraint "bags_crew_name_key"', '23505');
  }
  return clean;
}

export const demoBags: BagsBackend = {
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
            ((db as { wishes?: Wish[] }).wishes ?? []).some(
              (w) => w.id === row.wish_id && w.archived_at == null,
            )) ||
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
      for (const item of (raw as BagsDemoDb).bag_items ?? [])
        if (item.bag_id === bagId) item.removed_at = null;
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
        (db.bag_items ?? [])
          .filter((i) => i.archived_at == null && i.video_id === videoId)
          .map((i) => i.bag_id),
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
      Object.assign(track, patch, patch.name != null ? { name: patch.name.trim() } : {}, {
        updated_at: now(),
      });
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
