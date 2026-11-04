import type { Bag, BagDraw, Track } from '@coverscape/shared';
import { VIDEO_BUCKET, supabase, withStorage } from '../supabase';
import { fetchAll, must } from './shared';
import { SIGN_BATCH, SIGN_SECONDS, peekSigned, seedSigned } from './signedUrls';
import type { BagItemView, BagsBackend, ClipWithVideo, PlayableVideo, TrackItemView } from './types';

const CLIP_VIDEO_COLUMNS = 'id, title, artist, source, youtube_id';
const BAG_ITEM_SELECT =
  `*, video:videos(id, title, artist, thumbnail_url:list_thumbnail_url, source, youtube_id, poster_inline, poster_rev), ` +
  `clip:clips(id, name, video_id, start_seconds, end_seconds, speed, mirrored, color, video:videos(${CLIP_VIDEO_COLUMNS})), ` +
  `member:members(id, name, color), wish:wishes(id, title, artist, thumbnail_url, youtube_id, added_video_id)`;

/** REQ-19 · A round plays files and YouTube ids: these columns and no poster. */
const PLAYABLE_COLUMNS = 'id, source, youtube_id, storage_path, file_name, file_size, file_offset_seconds';
/** Ids per request, so a long round never builds an over-long URL. */
const BATCH = 100;

export const supabaseBags: BagsBackend = {
  async listBags() {
    const data = must(await supabase.from('bags').select('*, bag_items(count)').order('created_at'));
    return (data as (Bag & { bag_items: { count: number }[] })[]).map(({ bag_items, ...bag }) => ({
      ...bag,
      items: bag_items[0]?.count ?? 0,
    }));
  },
  async insertBag(row) {
    // crew_id comes from the database (the default group).
    const data = must(
      await supabase
        .from('bags')
        .insert({ ...row, name: row.name.trim() })
        .select()
        .single(),
    );
    return data as Bag;
  },
  async updateBag(id, patch) {
    const clean = patch.name != null ? { ...patch, name: patch.name.trim() } : patch;
    const data = must(await supabase.from('bags').update(clean).eq('id', id).select().single());
    return data as Bag;
  },
  async deleteBag(id) {
    must(await supabase.from('bags').delete().eq('id', id));
  },
  async listBagItems(bagId) {
    return fetchAll<BagItemView>((from, to) =>
      supabase
        .from('bag_items')
        .select(BAG_ITEM_SELECT)
        .eq('bag_id', bagId)
        .order('created_at')
        .order('id')
        .range(from, to),
    );
  },
  async listBagsHolding(ref) {
    // REQ-19 · RLS already limits it to the group's live items in live bags.
    const [column, value] = Object.entries(ref)[0] as [string, string];
    const data = must(
      await supabase
        .from('bag_items')
        .select('bag_id')
        .eq(column as 'video_id', value),
    );
    return data.map((row) => row.bag_id);
  },
  async insertBagItem(row) {
    return must(await supabase.from('bag_items').insert(row).select().single());
  },
  async deleteBagItem(id) {
    must(await supabase.from('bag_items').delete().eq('id', id));
  },
  async setBagItemOut(id, out) {
    must(
      await supabase
        .from('bag_items')
        .update({ removed_at: out ? new Date().toISOString() : null })
        .eq('id', id),
    );
  },
  async refillBag(bagId) {
    must(
      await supabase
        .from('bag_items')
        .update({ removed_at: null })
        .eq('bag_id', bagId)
        .not('removed_at', 'is', null),
    );
  },
  async listBagDraws(bagId, limit = 40) {
    return must(
      await supabase
        .from('bag_draws')
        .select('*')
        .eq('bag_id', bagId)
        .order('seq', { ascending: false })
        .limit(limit),
    );
  },
  async drawFromBag(bagId, count, remove, memberId) {
    const data = must(
      await supabase.rpc('draw_from_bag', {
        p_bag: bagId,
        p_count: count,
        p_remove: remove,
        p_member: memberId,
      }),
    );
    return (data ?? []) as BagDraw[];
  },
  async setDrawRemoved(draw, removed) {
    must(await supabase.from('bag_draws').update({ removed }).eq('id', draw.id));
    if (draw.item_id) await supabaseBags.setBagItemOut(draw.item_id, removed);
  },
  async linkBagItemVideo(itemId, videoId) {
    // The trigger checks the video is the same YouTube song and clears the item's own YouTube columns.
    must(await supabase.from('bag_items').update({ video_id: videoId }).eq('id', itemId));
  },
  async linkYoutubeSongs(youtubeId, videoId) {
    // RLS limits both reads to the group's live items in live bags.
    const songs = must(
      await supabase.from('bag_items').select('id, bag_id').eq('youtube_id', youtubeId).is('video_id', null),
    );
    if (!songs.length) return [];
    const bagIds = [...new Set(songs.map((s) => s.bag_id))];
    const { data: holding, error: holdingError } = await supabase
      .from('bag_items')
      .select('bag_id')
      .eq('video_id', videoId)
      .in('bag_id', bagIds);
    if (holdingError) throw holdingError;
    const holds = new Set(holding.map((h) => h.bag_id));
    // REQ-19 · One request per song, all at once; every one runs to its end, then the first failure (if any) is thrown.
    const outcomes = await Promise.allSettled(
      songs.map(async (song) => {
        try {
          if (holds.has(song.bag_id)) await supabaseBags.deleteBagItem(song.id);
          else await supabaseBags.linkBagItemVideo(song.id, videoId);
        } catch (linkError) {
          // The video went into that bag meanwhile: the YouTube copy just leaves it.
          if ((linkError as { code?: string }).code === '23505') await supabaseBags.deleteBagItem(song.id);
          else throw linkError;
        }
      }),
    );
    const failed = outcomes.find((o): o is PromiseRejectedResult => o.status === 'rejected');
    if (failed) throw failed.reason;
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
  async listPlayableVideos(ids) {
    const unique = [...new Set(ids)];
    const rows: PlayableVideo[] = [];
    for (let i = 0; i < unique.length; i += BATCH) {
      const data = must(
        await supabase
          .from('videos')
          .select(PLAYABLE_COLUMNS)
          .in('id', unique.slice(i, i + BATCH)),
      );
      rows.push(...(data as PlayableVideo[]));
    }
    return rows;
  },
  async signVideoFiles(paths) {
    // REQ-15 · Only the files the memory doesn't hold: a URL still reused (or being signed) keeps its cache key.
    const unique = [...new Set(paths)].filter((path) => !peekSigned(`${VIDEO_BUCKET}/${path}`));
    for (let i = 0; i < unique.length; i += SIGN_BATCH) {
      const { data, error } = await withStorage((storage) =>
        storage.from(VIDEO_BUCKET).createSignedUrls(unique.slice(i, i + SIGN_BATCH), SIGN_SECONDS),
      );
      if (error) throw error;
      const expiresAt = Date.now() + SIGN_SECONDS * 1000;
      for (const entry of data) {
        // A file that failed to sign is left to the single signature, which reports it as today.
        if (entry.path && entry.signedUrl && !entry.error) {
          seedSigned(`${VIDEO_BUCKET}/${entry.path}`, entry.signedUrl, expiresAt);
        }
      }
    }
  },
  async listTracks() {
    const data = must(
      await supabase.from('tracks').select('*, track_items(count)').order('updated_at', { ascending: false }),
    );
    return (data as (Track & { track_items: { count: number }[] })[]).map(({ track_items, ...track }) => ({
      ...track,
      items: track_items[0]?.count ?? 0,
    }));
  },
  async getTrack(id) {
    const data = must(await supabase.from('tracks').select('*').eq('id', id).maybeSingle());
    return (data as Track | null) ?? null;
  },
  async listTrackItems(trackId) {
    const data = must(
      await supabase
        .from('track_items')
        .select(`*, clip:clips(*, video:videos(${CLIP_VIDEO_COLUMNS}))`)
        .eq('track_id', trackId)
        .order('position')
        .order('created_at'),
    );
    return data as TrackItemView[];
  },
  async insertTrack(row, clipIds) {
    const data = must(
      await supabase
        .from('tracks')
        .insert({ ...row, name: row.name.trim() })
        .select()
        .single(),
    );
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
    const data = must(await supabase.from('tracks').update(clean).eq('id', id).select().single());
    return data as Track;
  },
  async deleteTrack(id) {
    must(await supabase.from('tracks').delete().eq('id', id));
  },
  async insertTrackItems(trackId, clipIds, fromPosition) {
    if (!clipIds.length) return [];
    const rows = clipIds.map((clip_id, i) => ({ track_id: trackId, clip_id, position: fromPosition + i }));
    return must(await supabase.from('track_items').insert(rows).select());
  },
  async deleteTrackItem(id) {
    must(await supabase.from('track_items').delete().eq('id', id));
  },
  async setTrackPositions(trackId, ids) {
    // REQ-20 · One call, all or nothing (it was one PATCH per item).
    must(await supabase.rpc('set_track_positions', { p_track: trackId, p_ids: ids }));
  },
};
