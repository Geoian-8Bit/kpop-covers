import type { Bag, BagDraw, Track } from '@coverscape/shared';
import { supabase } from '../supabase';
import { fetchAll, must } from './shared';
import type { BagItemView, BagsBackend, ClipWithVideo, TrackItemView } from './types';

const CLIP_VIDEO_COLUMNS = 'id, title, artist, source, youtube_id';
const BAG_ITEM_SELECT =
  `*, video:videos(id, title, artist, thumbnail_url, source, youtube_id), ` +
  `clip:clips(id, name, video_id, start_seconds, end_seconds, speed, mirrored, color, video:videos(${CLIP_VIDEO_COLUMNS})), ` +
  `member:members(id, name, color), wish:wishes(id, title, artist, thumbnail_url, youtube_id, added_video_id)`;

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
  async setTrackPositions(patches) {
    const results = await Promise.all(
      patches.map(({ id, position }) => supabase.from('track_items').update({ position }).eq('id', id)),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
  },
};
