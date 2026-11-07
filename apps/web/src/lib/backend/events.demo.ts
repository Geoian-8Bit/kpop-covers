import type { CrewEvent, EventSong } from '@coverscape/shared';
import { withGenerated } from './core.demo';
import { demoError, isLive, mutate, now, query } from './demoDb';
import type { DemoDb } from './demoDb';
import type { EventSongView, EventsBackend, NewEvent } from './types';

// Demo twin: the same rules as the database (name 1–80, place ≤ 120, a song once per event and only from the
// library, positions 0–999).

type EventsDemoDb = DemoDb & {
  events?: CrewEvent[];
  event_songs?: EventSong[];
};

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
      thumbnail_url: withGenerated(video).list_thumbnail_url,
      source: video.source,
      youtube_id: video.youtube_id,
      poster_inline: withGenerated(video).poster_inline,
      poster_rev: withGenerated(video).poster_rev,
    },
  };
}

export const demoEvents: EventsBackend = {
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
          throw demoError(
            'new row for relation "event_songs" violates check constraint "event_songs_position_check"',
            '23514',
          );
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
  setEventSongPositions: async (eventId, ids) =>
    mutate((raw) => {
      const db = raw as EventsDemoDb;
      // REQ-20 · Same rules as set_event_song_positions: a live event, a non-empty list without repeats, every id one
      // of its live songs; nothing is written unless all of it holds. Same order of checks and the same error for
      // all of them (an archived event too), as the RPC raises.
      const mine = (db.event_songs ?? []).filter((s) => s.event_id === eventId && isLive(s));
      if (!ids.length || new Set(ids).size !== ids.length || !liveEvent(db, eventId)) {
        throw demoError('event_song_positions_invalid');
      }
      if (ids.some((id) => !mine.some((s) => s.id === id))) throw demoError('event_song_positions_invalid');
      if (ids.length > 1000) {
        throw demoError(
          'new row for relation "event_songs" violates check constraint "event_songs_position_check"',
          '23514',
        );
      }
      ids.forEach((id, position) => {
        const song = mine.find((s) => s.id === id);
        if (song) song.position = position;
      });
    }),
};
