import type { CrewEvent } from '@coverscape/shared';
import { supabase } from '../supabase';
import { must } from './shared';
import type { EventSongView, EventsBackend } from './types';

const EVENT_SONG_SELECT =
  '*, video:videos(id, title, artist, thumbnail_url:list_thumbnail_url, source, youtube_id, poster_inline, poster_rev)';

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
  async setEventSongPositions(eventId, ids) {
    // REQ-20 · One call, all or nothing (it was one PATCH per song).
    must(await supabase.rpc('set_event_song_positions', { p_event: eventId, p_ids: ids }));
  },
};
