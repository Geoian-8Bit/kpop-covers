import type { Note } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backend } from '@/lib/backend';

export const noteKeys = {
  forVideo: (videoId: string | undefined) => ['notes', videoId] as const,
};

const byTime = (a: Note, b: Note) => a.at_seconds - b.at_seconds;

/** Timed notes on a video, earliest moment first. They are the dots on the timeline wave. */
export function useNotes(videoId: string | undefined) {
  return useQuery({
    queryKey: noteKeys.forVideo(videoId),
    enabled: Boolean(videoId),
    queryFn: () => backend.listNotes(videoId!),
  });
}

export interface NewNote {
  video_id: string;
  crew_id: string;
  at_seconds: number;
  body: string;
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

export function useUpdateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ note, body }: { note: Note; body: string }) => backend.updateNote(note.id, { body }),
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
