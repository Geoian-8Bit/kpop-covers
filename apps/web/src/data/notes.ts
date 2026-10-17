import type { Note } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { backend, type NotePatch } from '@/lib/backend';

export const noteKeys = {
  forVideo: (videoId: string | undefined) => ['notes', videoId] as const,
};

const byTime = (a: Note, b: Note) => a.at_seconds - b.at_seconds;

/**
 * Timed notes on a video, earliest moment first. They are the dots on the timeline wave; a note on a take (F6)
 * also carries the take's moment, and shows on the song only for its recipient (`songNotes`).
 */
const notesQuery = (videoId: string | undefined) => ({
  queryKey: noteKeys.forVideo(videoId),
  queryFn: () => backend.listNotes(videoId!),
});

export function useNotes(videoId: string | undefined) {
  return useQuery({ ...notesQuery(videoId), enabled: Boolean(videoId) });
}

/** P3 · Warm a video's notes before the studio opens (no request when they're cached and fresh). */
export function prefetchNotes(queryClient: QueryClient, videoId: string): void {
  void queryClient.prefetchQuery(notesQuery(videoId));
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
    mutationFn: (note: NewNote) => backend.insertNote(note),
    onSuccess: (note) => {
      queryClient.setQueryData<Note[]>(noteKeys.forVideo(note.video_id), (current = []) => [...current, note].sort(byTime));
    },
  });
}

/**
 * Edit a note: its text, or (F6) its category, recipient, drawing and «pendiente / resuelta» status.
 * Optimistic, so a status tap flips at once; on failure the list is put back.
 */
export function useUpdateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ note, patch }: { note: Note; patch: NotePatch }) => backend.updateNote(note.id, patch),
    onMutate: async ({ note, patch }) => {
      const key = noteKeys.forVideo(note.video_id);
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<Note[]>(key);
      queryClient.setQueryData<Note[]>(key, (current = []) => current.map((n) => (n.id === note.id ? { ...n, ...patch } : n)));
      return { before, key };
    },
    onError: (_err, _vars, context) => {
      if (context?.before) queryClient.setQueryData(context.key, context.before);
    },
    onSuccess: (note) => {
      queryClient.setQueryData<Note[]>(noteKeys.forVideo(note.video_id), (current = []) =>
        current.map((n) => (n.id === note.id ? note : n)),
      );
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note: Note) => backend.deleteNote(note.id),
    onMutate: async (note) => {
      // A refetch already in flight would bring the deleted note back.
      await queryClient.cancelQueries({ queryKey: noteKeys.forVideo(note.video_id) });
      queryClient.setQueryData<Note[]>(noteKeys.forVideo(note.video_id), (current = []) =>
        current.filter((n) => n.id !== note.id),
      );
    },
    onError: (_error, note) => {
      void queryClient.invalidateQueries({ queryKey: noteKeys.forVideo(note.video_id) });
    },
  });
}
