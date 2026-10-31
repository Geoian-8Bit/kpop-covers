import type { CrewEvent, TakeReaction } from '@coverscape/shared';
import { supabase } from '../supabase';
import { fetchAll, must } from './shared';
import type { EventSongView, EventsBackend } from './types';

const EVENT_SONG_SELECT = '*, video:videos(id, title, artist, thumbnail_url, source, youtube_id)';

export const supabaseEvents: EventsBackend = {
  async listEvents() {
    const data = must(await supabase.from('events').select('*, event_songs(count)').order('starts_at'));
    return (data as (CrewEvent & { event_songs: { count: number }[] })[]).map(
      ({ event_songs, ...event }) => ({
        ...event,
        songs: event_songs[0]?.count ?? 0,
      }),
    );
  },
  async getEvent(id) {
    const data = must(await supabase.from('events').select('*').eq('id', id).maybeSingle());
    return data ?? null;
  },
  async insertEvent(row) {
    // crew_id comes from the database (the default group).
    return must(
      await supabase
        .from('events')
        .insert({ ...row, name: row.name.trim() })
        .select()
        .single(),
    );
  },
  async updateEvent(id, patch) {
    const clean = patch.name != null ? { ...patch, name: patch.name.trim() } : patch;
    return must(await supabase.from('events').update(clean).eq('id', id).select().single());
  },
  async deleteEvent(id) {
    must(await supabase.from('events').delete().eq('id', id));
  },
  async listEventSongs(eventId) {
    const data = must(
      await supabase
        .from('event_songs')
        .select(EVENT_SONG_SELECT)
        .eq('event_id', eventId)
        .order('position')
        .order('created_at'),
    );
    return data as EventSongView[];
  },
  async insertEventSongs(eventId, videoIds, positions) {
    if (!videoIds.length) return [];
    const rows = videoIds.map((video_id, i) => ({
      event_id: eventId,
      video_id,
      position: positions[i] ?? i,
    }));
    return must(await supabase.from('event_songs').insert(rows).select());
  },
  async deleteEventSong(id) {
    must(await supabase.from('event_songs').delete().eq('id', id));
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
    const data = must(await supabase.from('take_reactions').insert(row).select().single());
    return data as TakeReaction;
  },
  async removeReaction(id) {
    must(await supabase.from('take_reactions').delete().eq('id', id));
  },
};
