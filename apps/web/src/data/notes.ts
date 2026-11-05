import type { Note } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { backend, type ListedNote, type NotePatch } from '@/lib/backend/core';
import { whenIdle } from '@/lib/idle';
import { pendingOf, pendingReady, submitWrite } from '@/lib/pendingWrites';
import { overlayRows } from '@/lib/pendingWritesRules';

export const noteKeys = {
  forVideo: (videoId: string | undefined) => ['notes', videoId] as const,
  sketches: (videoId: string | undefined) => ['note-sketches', videoId] as const,
};

/** REQ-17 · The drawings of a video's notes, by note id. */
export type SketchMap = Readonly<Record<string, string>>;

const byTime = (a: ListedNote, b: ListedNote) => a.at_seconds - b.at_seconds;

/**
 * REQ-17 · A listed note with its drawing put back: a written note's own answer carries it (`sketch` present);
 * a listed one takes it from the drawings query. A note without a drawing has none to wait for.
 */
export function withSketch(note: ListedNote, sketches: SketchMap | undefined): Note {
  const sketch = note.has_sketch ? (note.sketch ?? sketches?.[note.id] ?? null) : null;
  return { ...note, sketch };
}

/** REQ-17 · The list with every drawing combined by id. */
export function withSketches(list: readonly ListedNote[], sketches: SketchMap | undefined): Note[] {
  return list.map((n) => withSketch(n, sketches));
}

/**
 * REQ-17 · True while a note's drawing is still on its way (its list came first). Opening it waits for it, with no
 * indicator: the drawings query starts right after the list, so the wait is next to nothing.
 */
export function isSketchPending(
  note: Pick<ListedNote, 'id' | 'has_sketch' | 'sketch'> | null | undefined,
  sketches: { data?: SketchMap; isFetching: boolean; isError: boolean },
): boolean {
  if (!note?.has_sketch || note.sketch != null || sketches.data?.[note.id] != null) return false;
  return !sketches.isError && (sketches.isFetching || sketches.data === undefined);
}

const idle = () => new Promise<void>((resolve) => void whenIdle(resolve, { timeout: 300, fallbackMs: 1 }));

/**
 * REQ-17 · True when the kept drawings no longer match a freshly listed `list`: a note gained a drawing elsewhere
 * (none kept for it), or a note with a drawing was edited elsewhere (its `updated_at` differs from the one last seen
 * in `previous`, so its drawing may have changed).
 */
export function sketchesOutdated(
  list: readonly ListedNote[],
  previous: readonly ListedNote[] | undefined,
  known: SketchMap,
): boolean {
  const seen = new Map(previous?.map((n) => [n.id, n.updated_at]));
  return list.some(
    (n) => n.has_sketch && (known[n.id] == null || (seen.has(n.id) && seen.get(n.id) !== n.updated_at)),
  );
}

/**
 * Timed notes on a video, earliest moment first. They are the dots on the timeline wave; a note on a take (F6)
 * also carries the take's moment, and shows on the song only for its recipient (`songNotes`).
 * REQ-17 · Listed without drawings (`has_sketch` only); a note whose drawing changed elsewhere refreshes them.
 */
const notesQuery = (queryClient: QueryClient, videoId: string | undefined) => ({
  queryKey: noteKeys.forVideo(videoId),
  queryFn: async () => {
    const [list] = await Promise.all([backend.listNotes(videoId!), pendingReady(queryClient)]);
    const known = queryClient.getQueryData<SketchMap>(noteKeys.sketches(videoId));
    const previous = queryClient.getQueryData<ListedNote[]>(noteKeys.forVideo(videoId));
    if (known && sketchesOutdated(list, previous, known)) {
      void queryClient.invalidateQueries({ queryKey: noteKeys.sketches(videoId) });
    }
    return withPendingNotes(list, videoId!);
  },
});

/** A note written on this device and still waiting to reach the server, with the database's defaults. */
function localNote(row: Record<string, unknown>): Note {
  const now = new Date().toISOString();
  return {
    created_at: now,
    updated_at: now,
    archived_at: null,
    created_by: null,
    author_member_id: null,
    take_id: null,
    take_seconds: null,
    category: null,
    for_member_id: null,
    status: 'open',
    sketch: null,
    ...row,
    has_sketch: row.sketch != null,
  } as Note;
}

/** A patch as the cached note shows it: a drawing in it sets `has_sketch` to match. */
const patched = <T extends ListedNote>(note: T, patch: Record<string, unknown>): T => ({
  ...note,
  ...patch,
  ...('sketch' in patch ? { has_sketch: patch.sketch != null } : {}),
});

/** The fetched notes with this device's waiting writes laid over them (a refetch never undoes them). */
function withPendingNotes(list: ListedNote[], videoId: string): ListedNote[] {
  const out = overlayRows<ListedNote>(list, pendingOf('note'), {
    belongs: (data) => data.video_id === videoId,
    toRow: localNote,
    patch: patched,
  });
  return out === list ? list : [...out].sort(byTime);
}

const noteLists = (note: Pick<Note, 'video_id'>) => [
  noteKeys.forVideo(note.video_id),
  noteKeys.sketches(note.video_id),
];

const anySketch = (list: ListedNote[]) => list.some((n) => n.has_sketch);

/**
 * REQ-17 · The drawings, asked for at an idle moment right after the list, and only when some note has one.
 * Shared by the studio, the review and the note dialogs (one request).
 */
export function useNoteSketches(videoId: string | undefined) {
  const queryClient = useQueryClient();
  const hasAny = useQuery({
    ...notesQuery(queryClient, videoId),
    enabled: Boolean(videoId),
    select: anySketch,
  }).data;
  return useQuery({
    queryKey: noteKeys.sketches(videoId),
    queryFn: async (): Promise<SketchMap> => {
      await idle();
      const rows = await backend.listNoteSketches(videoId!);
      return Object.fromEntries(rows.map((r) => [r.id, r.sketch]));
    },
    enabled: Boolean(videoId) && hasAny === true,
  });
}

export function useNotes(videoId: string | undefined) {
  const queryClient = useQueryClient();
  const sketches = useNoteSketches(videoId).data;
  const select = useCallback((list: ListedNote[]) => withSketches(list, sketches), [sketches]);
  return useQuery({ ...notesQuery(queryClient, videoId), enabled: Boolean(videoId), select });
}

/** P3 · Warm a video's notes before the studio opens (no request when they're cached and fresh). */
export function prefetchNotes(queryClient: QueryClient, videoId: string): void {
  void queryClient.prefetchQuery(notesQuery(queryClient, videoId));
}

/**
 * REQ-17 · A written note's drawing goes into the drawings map too, so a later list refresh keeps it. The first
 * drawing of a video has no map yet: it starts one with this drawing and marks it stale, so the other notes'
 * drawings (if any) still arrive with the next read.
 */
function keepSketch(queryClient: QueryClient, note: Note) {
  const key = noteKeys.sketches(note.video_id);
  const existed = queryClient.getQueryData<SketchMap>(key) !== undefined;
  if (!existed && note.sketch == null) return;
  queryClient.setQueryData<SketchMap>(key, (current = {}) => {
    const { [note.id]: _old, ...rest } = current;
    return note.sketch != null ? { ...rest, [note.id]: note.sketch } : rest;
  });
  if (!existed) void queryClient.invalidateQueries({ queryKey: key });
}

export interface NewNote {
  video_id: string;
  crew_id: string;
  at_seconds: number;
  body: string;
  /** F2: who wrote it (null = «Sin nombre»). */
  author_member_id?: string | null;
  /** F6 · a note on a take: the take, its moment, and optionally category, recipient and a small drawing. */
  take_id?: string | null;
  take_seconds?: number | null;
  category?: string | null;
  for_member_id?: string | null;
  sketch?: string | null;
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    // Offline too: the write goes to the pending queue instead of waiting, paused, for the network.
    networkMode: 'always',
    // The id is made here, so a write retried after a lost answer finds its row instead of making a second one.
    mutationFn: async (note: NewNote) => {
      const row = { ...note, id: crypto.randomUUID() };
      const outcome = await submitWrite<Note | undefined>(queryClient, {
        kind: 'note',
        action: 'create',
        id: row.id,
        data: row,
        invalidate: noteLists(row),
      });
      return (outcome.sent && outcome.result) || localNote(row);
    },
    onSuccess: (note) => {
      keepSketch(queryClient, note);
      // A refetch while it was on its way may already show it (laid over from the queue).
      queryClient.setQueryData<ListedNote[]>(noteKeys.forVideo(note.video_id), (current = []) =>
        [...current.filter((n) => n.id !== note.id), note].sort(byTime),
      );
    },
  });
}

/**
 * Edit a note: its text, or (F6) its category, recipient, drawing and «pendiente / resuelta» status.
 * Optimistic, so a status tap flips at once; on failure the list is put back.
 * REQ-17 · A drawing in the patch rides in the cached note (with `has_sketch` to match); others keep theirs.
 */
export function useUpdateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    // Offline too: the write goes to the pending queue instead of waiting, paused, for the network.
    networkMode: 'always',
    mutationFn: async ({ note, patch }: { note: Note; patch: NotePatch }) => {
      const outcome = await submitWrite<Note>(queryClient, {
        kind: 'note',
        action: 'update',
        id: note.id,
        data: patch,
        invalidate: noteLists(note),
      });
      return outcome.sent ? outcome.result : patched(note, patch);
    },
    onMutate: async ({ note, patch }) => {
      const key = noteKeys.forVideo(note.video_id);
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<ListedNote[]>(key);
      const drawn = patch.sketch !== undefined ? { has_sketch: patch.sketch != null } : {};
      queryClient.setQueryData<ListedNote[]>(key, (current = []) =>
        current.map((n) => (n.id === note.id ? { ...n, ...patch, ...drawn } : n)),
      );
      return { before, key };
    },
    onError: (_err, _vars, context) => {
      if (context?.before) queryClient.setQueryData(context.key, context.before);
    },
    onSuccess: (note) => {
      keepSketch(queryClient, note);
      queryClient.setQueryData<ListedNote[]>(noteKeys.forVideo(note.video_id), (current = []) =>
        current.map((n) => (n.id === note.id ? note : n)),
      );
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    // Offline too: the write goes to the pending queue instead of waiting, paused, for the network.
    networkMode: 'always',
    mutationFn: async (note: Note) => {
      await submitWrite(queryClient, {
        kind: 'note',
        action: 'delete',
        id: note.id,
        invalidate: noteLists(note),
      });
    },
    onMutate: async (note) => {
      // A refetch already in flight would bring the deleted note back.
      await queryClient.cancelQueries({ queryKey: noteKeys.forVideo(note.video_id) });
      queryClient.setQueryData<ListedNote[]>(noteKeys.forVideo(note.video_id), (current = []) =>
        current.filter((n) => n.id !== note.id),
      );
    },
    onError: (_error, note) => {
      void queryClient.invalidateQueries({ queryKey: noteKeys.forVideo(note.video_id) });
    },
  });
}
