import { clamp, round3, songTimeAt, type Note, type Video } from '@coverscape/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { askWho, currentMemberId, useMembers } from '@/data/members';
import {
  isSketchPending,
  useCreateNote,
  useDeleteNote,
  useNotes,
  useNoteSketches,
  useUpdateNote,
} from '@/data/notes';
import type { TakeItem } from '@/data/takes';
import { friendlyError } from '@/lib/supabase';
import { useReview } from '@/player/store';
import type { useToast } from '@/providers/ToastProvider';
import { atNoteMoment, crossedNote, takeNotes, type NoteStatus } from './reviewRules';
import { captureFrame, type ComposerDraft, type ComposerValues } from './TakeNoteComposer';

/**
 * F6 · The take's notes on the review: the open one (REQ-17: with its drawing, once it arrived), the pop-up of a
 * note the playback crosses, and the composer (new, or «Dibujar de nuevo» over the note's own frame). REQ-27 · Moved
 * out of `ReviewScreen` as it was.
 */
export function useReviewNotes(
  video: Video,
  take: TakeItem,
  takeVideo: RefObject<HTMLVideoElement | null>,
  toast: ReturnType<typeof useToast>,
) {
  const members = useMembers();
  const notesQuery = useNotes(video.id);
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();

  const notes = useMemo(() => takeNotes(notesQuery.data ?? [], take.id), [notesQuery.data, take.id]);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  // REQ-17 · Notes carry their drawing combined by id; one opened before its drawing arrived waits for it (no
  // indicator) and opens with it.
  const noteSketches = useNoteSketches(video.id);
  const foundNote = openNoteId ? (notes.find((n) => n.id === openNoteId) ?? null) : null;
  const openNote = foundNote && !isSketchPending(foundNote, noteSketches) ? foundNote : null;
  const [sketchShown, setSketchShown] = useState(true);
  // P1 · A boolean of the clock, not the clock: the screen repaints when the take reaches or leaves the note's
  // moment, not 60 times a second.
  const noteSeconds = openNote?.take_seconds;
  const atOpenNote = useReview((s) => atNoteMoment(s.time, noteSeconds));
  const [alert, setAlert] = useState<Note | null>(null);
  const [composer, setComposer] = useState<ComposerDraft | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  useEffect(() => {
    let last = useReview.getState().time;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useReview.subscribe((s) => {
      const now = s.time;
      if (s.playing && !s.scrubbing) {
        const hit = crossedNote(notesRef.current, last, now);
        if (hit) {
          setAlert(hit);
          clearTimeout(timer);
          timer = setTimeout(() => setAlert(null), 4200);
        }
      }
      last = now;
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const showNote = useCallback((note: Note) => {
    const review = useReview.getState();
    review.pause();
    review.seek(Number(note.take_seconds ?? 0));
    setAlert(null);
    setSketchShown(true);
    setOpenNoteId(note.id);
  }, []);

  const newNote = useCallback(() => {
    const review = useReview.getState();
    review.pause();
    const takeSeconds = review.time;
    askWho('Así tus notas llevan tu nombre. Se recuerda en este dispositivo.', () => {
      setComposer({
        mode: 'new',
        takeSeconds,
        songSeconds: Math.max(0, songTimeAt(review.timing, takeSeconds)),
        frame: captureFrame(takeVideo.current),
      });
    });
  }, [takeVideo]);

  // «Dibujar de nuevo» draws over the note's own frame: go there first, then capture.
  const editNote = (note: Note) => {
    const review = useReview.getState();
    review.pause();
    const at = Number(note.take_seconds);
    const el = takeVideo.current;
    if (!el || !Number.isFinite(at) || Math.abs(el.currentTime - at) < 0.05) {
      setComposer({ mode: 'edit', note, frame: captureFrame(el) });
      return;
    }
    const done = () => {
      el.removeEventListener('seeked', done);
      setComposer({ mode: 'edit', note, frame: captureFrame(el) });
    };
    el.addEventListener('seeked', done);
    review.seek(at);
  };

  async function saveNote(values: ComposerValues) {
    const draft = composer;
    if (!draft) return;
    try {
      if (draft.mode === 'new') {
        const created = await createNote.mutateAsync({
          video_id: video.id,
          crew_id: video.crew_id,
          at_seconds: round3(Math.max(0, draft.songSeconds)),
          body: values.body,
          author_member_id: currentMemberId(members.data),
          take_id: take.id,
          take_seconds: round3(clamp(draft.takeSeconds, 0, 7200)),
          category: values.category,
          for_member_id: values.forMemberId,
          sketch: values.sketch ?? null,
        });
        toast('Nota guardada en la toma', 'success');
        setOpenNoteId(created.id);
      } else {
        await updateNote.mutateAsync({
          note: draft.note,
          patch: {
            body: values.body,
            category: values.category,
            for_member_id: values.forMemberId,
            ...(values.sketch !== undefined ? { sketch: values.sketch } : {}),
          },
        });
        toast('Nota actualizada', 'success');
      }
      setComposer(null);
    } catch (err) {
      throw new Error(friendlyError(err), { cause: err });
    }
  }

  const setNoteStatus = (note: Note, status: NoteStatus) =>
    updateNote.mutate({ note, patch: { status } }, { onError: (err) => toast(friendlyError(err), 'error') });
  const removeNote = (note: Note) => {
    setOpenNoteId(null);
    deleteNote.mutate(note, {
      onSuccess: () => toast('Nota borrada', 'success'),
      onError: (err) => toast(friendlyError(err), 'error'),
    });
  };

  return {
    notes,
    openNoteId,
    setOpenNoteId,
    openNote,
    sketchShown,
    setSketchShown,
    atOpenNote,
    alert,
    composer,
    setComposer,
    showNote,
    newNote,
    editNote,
    saveNote,
    setNoteStatus,
    removeNote,
  };
}
