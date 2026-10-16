import { clamp, clampAdjust, hasLinkedFile, round3, songTimeAt, type Clip, type Note, type Video } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { FileVideo, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { askWho, currentMemberId, useMe, useMembers } from '@/data/members';
import { useCreateNote, useDeleteNote, useNotes, useUpdateNote } from '@/data/notes';
import { useUpdateTakeReview, type TakeItem, type TakeReviewPatch } from '@/data/takes';
import { useDesignVariant } from '@/features/lab/designLab';
import { useFileSource } from '@/features/studio/fileSource';
import { takeDateLabel } from '@/features/takes/takeRules';
import { soft } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { useBackToClose } from '@/lib/useBackToClose';
import { useReview } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';
import { CompareStage } from './CompareStage';
import { ReviewSettings, ReviewTimeline, ReviewTransport } from './ReviewControls';
import { OriginalFile, OriginalYouTube, TakeVideo, useReviewClock } from './ReviewMedia';
import {
  clipsInTake,
  crossedNote,
  fitOf,
  isValidSketch,
  NO_FIT,
  parseViewPrefs,
  sameFit,
  takeLength,
  takeNotes,
  takeTiming,
  type Fit,
  type ViewPrefs,
} from './reviewRules';
import { captureFrame, TakeNoteComposer, type ComposerDraft, type ComposerValues } from './TakeNoteComposer';
import { NoteAlert, TakeNoteCard } from './TakeNoteCard';

/**
 * F5 · «Repaso»: the take next to (or over) the original, in sync, to find what to fix. F6 · notes on the take,
 * with a drawing over the frame. A screen of its own above the studio (Escape or back closes it).
 */

const PREFS_KEY = 'oneshoot.review.v1';
export const OVERLAY_NEEDS_FILE = 'Necesita el archivo del vídeo: vincúlalo en el estudio.';

function readPrefs(): ViewPrefs {
  try {
    return parseViewPrefs(localStorage.getItem(PREFS_KEY));
  } catch {
    return parseViewPrefs(null);
  }
}

function writePrefs(prefs: ViewPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode: this visit only */
  }
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Debounced, optimistic save of one of the review's values on the take. */
function useTakeSaver(take: TakeItem, onError: (message: string) => void) {
  const mutation = useUpdateTakeReview();
  const [status, setStatus] = useState<SaveStatus>('idle');
  const pending = useRef<TakeReviewPatch | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const mutate = mutation.mutate;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = null;
    if (!patch) return;
    if (mounted.current) setStatus('saving');
    mutate(
      { take, patch },
      {
        onSuccess: () => {
          if (mounted.current) setStatus('saved');
        },
        onError: (err) => {
          if (mounted.current) setStatus('error');
          onErrorRef.current(friendlyError(err));
        },
      },
    );
  }, [mutate, take]);

  const save = useCallback(
    (patch: TakeReviewPatch, wait = 600) => {
      pending.current = { ...pending.current, ...patch };
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, wait);
    },
    [flush],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      flush(); // closing within the wait still saves
    };
  }, [flush]);

  return { save, status };
}

export function ReviewScreen({
  video,
  take,
  url,
  clips,
  onClose,
}: {
  video: Video;
  take: TakeItem;
  /** The take's playable URL (released by the caller on close). */
  url: string;
  clips: Clip[];
  onClose: () => void;
}) {
  const variant = useDesignVariant('review-compare');
  const toast = useToast();
  const members = useMembers();
  const me = useMe();
  const notesQuery = useNotes(video.id);
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const takeVideo = useRef<HTMLVideoElement | null>(null);
  const timing = useMemo(() => takeTiming(take), [take]);

  // ── The original: the file (uploaded or linked, F1) when there is one here or in the cloud; else YouTube. ──
  const hasFile = video.source === 'upload' || hasLinkedFile(video);
  const file = useFileSource(video, 0, hasFile);
  const source: 'file' | 'youtube' | 'loading' | 'none' =
    hasFile && file.status === 'ready'
      ? 'file'
      : hasFile && file.status === 'loading'
        ? 'loading'
        : video.source === 'youtube' && video.youtube_id
          ? 'youtube'
          : 'none';
  const canOverlay = source === 'file';
  const offset = video.source === 'youtube' ? Number(video.file_offset_seconds ?? 0) : 0;

  const [prefs, setPrefsState] = useState<ViewPrefs>(readPrefs);
  const setPrefs = useCallback((patch: Partial<ViewPrefs>) => {
    setPrefsState((current) => {
      const next = parseViewPrefs(JSON.stringify({ ...current, ...patch }));
      writePrefs(next);
      return next;
    });
  }, []);
  const mode = prefs.mode === 'overlay' && canOverlay ? 'overlay' : 'stacked';

  // ── Store: a fresh review for this take; the media attach right after (their effects run later). ──
  useLayoutEffect(() => {
    useReview.getState().begin({
      timing: { songStart: timing.songStart, speed: timing.speed, adjust: timing.adjust, offset: 0, onFile: false },
      duration: takeLength(0, take.duration_seconds),
      mirrored: take.mirrored,
    });
    return () => useReview.getState().end();
    // Only when another take opens: fresh values of the same take come through `setTiming`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [take.id]);
  useEffect(() => {
    useReview.getState().setTiming({ onFile: source === 'file', offset });
  }, [source, offset]);
  useReviewClock(true);

  // ── Saved with the take: fine sync and overlay fit. ──
  const showSaveError = useCallback((message: string) => toast(message, 'error'), [toast]);
  const adjustSaver = useTakeSaver(take, showSaveError);
  const fitSaver = useTakeSaver(take, showSaveError);
  const [adjust, setAdjust] = useState(timing.adjust);
  const onAdjust = (value: number) => {
    const next = clampAdjust(value);
    setAdjust(next);
    useReview.getState().setTiming({ adjust: next });
    adjustSaver.save({ sync_adjust_seconds: next });
  };
  const [fit, setFit] = useState<Fit>(() => fitOf(take));
  const savedFit = useRef(fitOf(take));
  const onFit = (next: Fit, settled: boolean) => {
    setFit(next);
    if (settled && !sameFit(next, savedFit.current)) {
      savedFit.current = next;
      fitSaver.save({ fit_scale: next.scale, fit_x: next.x, fit_y: next.y }, 500);
    }
  };

  // ── Notes of this take ──
  const notes = useMemo(() => takeNotes(notesQuery.data ?? [], take.id), [notesQuery.data, take.id]);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const openNote = openNoteId ? (notes.find((n) => n.id === openNoteId) ?? null) : null;
  const [sketchShown, setSketchShown] = useState(true);
  const [alert, setAlert] = useState<Note | null>(null);
  const [composer, setComposer] = useState<ComposerDraft | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const playing = useReview((s) => s.playing);
  const takeTime = useReview((s) => s.time);
  const takeError = useReview((s) => s.takeError);
  const originalError = useReview((s) => s.originalError);
  const takeReady = useReview((s) => s.takeEngine != null);
  const duration = useReview((s) => s.duration);
  const mirrorTake = useReview((s) => s.mirrorTake);
  const mirrorOriginal = useReview((s) => s.mirrorOriginal);
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
  }, []);

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
      throw new Error(friendlyError(err));
    }
  }

  const close = useCallback(() => onClose(), [onClose]);
  useBackToClose(true, close, composer != null);

  // ── Focus, page scroll and keys ──
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    rootRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  const stateRef = useRef({ composer, openNoteId, settingsOpen });
  stateRef.current = { composer, openNoteId, settingsOpen };
  useEffect(() => {
    let swallowSpaceUp = false;
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' && swallowSpaceUp) {
        swallowSpaceUp = false;
        e.preventDefault();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const st = stateRef.current;
      if (st.composer || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      // Another layer on top (the «¿Quién eres?» dialog…) owns the keys.
      const modals = [...document.querySelectorAll('[aria-modal="true"]')];
      if (modals.some((m) => m !== rootRef.current)) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (st.openNoteId) setOpenNoteId(null);
        else if (st.settingsOpen) setSettingsOpen(false);
        else close();
        return;
      }
      if (e.key === 'Tab') {
        trapFocus(e, rootRef.current);
        return;
      }
      if (target && (target.isContentEditable || /^(TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (target?.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range') return;
      const onControl = target?.closest('[role="slider"], [role="separator"], [role="radiogroup"], [role="group"], input[type="range"]');
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key.startsWith('Arrow') && onControl) return;
      if (key === ' ' && target?.closest('[role="radio"], [role="switch"], input')) return;
      if (key === ' ' && target?.closest('button, a[href]')) {
        swallowSpaceUp = true;
        e.preventDefault();
      }
      if (e.repeat && !key.startsWith('Arrow') && key !== ',' && key !== '.') return;
      const r = useReview.getState();
      let handled = true;
      switch (key) {
        case ' ':
        case 'k':
          r.togglePlay();
          break;
        case ',':
          r.step(-1);
          break;
        case '.':
          r.step(1);
          break;
        case 'ArrowLeft':
          r.seek(r.time - (e.shiftKey ? 5 : 1));
          break;
        case 'ArrowRight':
          r.seek(r.time + (e.shiftKey ? 5 : 1));
          break;
        case 'a':
        case '[':
          r.markStart();
          break;
        case 'b':
        case ']':
          r.markEnd();
          break;
        case 'l':
          if (!r.toggleLoop()) toast('Marca A y B para repetir un tramo', 'info');
          break;
        case 'n':
          newNote();
          break;
        default:
          handled = false;
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [close, newNote, toast]);

  const memberName = take.member_id
    ? (members.data?.find((m) => m.id === take.member_id)?.name ?? 'Antiguo miembro')
    : 'Sin nombre';
  const inTake = useMemo(() => clipsInTake(clips, { ...take, sync_adjust_seconds: adjust }, duration), [clips, take, adjust, duration]);

  const original =
    source === 'file' && file.status === 'ready' ? (
      <OriginalFile url={file.url} />
    ) : source === 'youtube' ? (
      <OriginalYouTube videoId={video.youtube_id!} />
    ) : source === 'loading' ? (
      <div className="grid size-full place-items-center">
        <Spinner className="size-7 text-washi-muted" />
      </div>
    ) : (
      <div className="seigaiha grid size-full place-items-center p-4 text-center">
        <p className="flex max-w-[16rem] flex-col items-center gap-2 text-[13px] text-washi-muted">
          <FileVideo className="size-6 text-kin-300" />
          El archivo del vídeo no está en este dispositivo ni en la nube. Vincúlalo en el estudio para compararlo.
        </p>
      </div>
    );

  // The drawing is a still of its moment: shown only while the take stands at that moment (review round 1).
  const sketch =
    openNote &&
    sketchShown &&
    !playing &&
    isValidSketch(openNote.sketch) &&
    Math.abs(takeTime - Number(openNote.take_seconds ?? -10)) < 0.2 ? (
      <img
        src={openNote.sketch}
        alt={`Dibujo de la nota: ${openNote.body}`}
        className="pointer-events-none absolute inset-0 z-[1] size-full object-contain"
      />
    ) : null;

  const settingsProps = {
    mode,
    variant,
    prefs,
    onPrefs: setPrefs,
    onResetFit: () => onFit(NO_FIT, true),
    fitStatus: fitSaver.status,
    adjust,
    onAdjust,
    adjustStatus: adjustSaver.status,
    hasOriginal: source === 'file' || source === 'youtube',
    practisedMirrored: take.mirrored,
    clips: inTake,
  } as const;

  return createPortal(
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={soft}
      className="fixed inset-0 z-[45] flex flex-col bg-sumi-950 text-washi outline-none"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line-strong bg-sumi-900 px-2 pb-1.5 pt-[max(6px,env(safe-area-inset-top))] sm:px-4">
        <Button variant="ghost" size="icon" aria-label="Cerrar el repaso" onClick={close}>
          <X className="size-6" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="flex items-center gap-1.5 truncate font-display text-[18px] font-bold leading-tight">
            Repaso <span aria-hidden className="text-[15px] text-shu-400">比</span>
          </h2>
          <p className="truncate text-[12px] text-washi-muted">
            {memberName} · {takeDateLabel(take.recorded_at)} · {video.title}
          </p>
        </div>
        <Segmented
          label="Cómo comparar"
          layoutId={`review-mode-${take.id}`}
          value={mode}
          onChange={(m) => setPrefs({ mode: m })}
          onDisabled={() => toast(`«Superpuesto» no va con YouTube. ${OVERLAY_NEEDS_FILE}`, 'info')}
          options={[
            { value: 'stacked', label: 'Apilado' },
            { value: 'overlay', label: 'Superpuesto', disabled: !canOverlay, ariaLabel: canOverlay ? undefined : `Superpuesto, no disponible: ${OVERLAY_NEEDS_FILE}` },
          ]}
        />
        {source === 'youtube' && (
          <p className="w-full pl-1 text-[12px] leading-snug text-washi-subtle sm:w-auto sm:pl-0">
            Superpuesto: {OVERLAY_NEEDS_FILE.charAt(0).toLowerCase() + OVERLAY_NEEDS_FILE.slice(1)}
          </p>
        )}
      </header>

      <div className="flex min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <CompareStage
              variant={variant}
              mode={mode}
              prefs={prefs}
              onPrefs={setPrefs}
              fit={fit}
              onFit={onFit}
              mirrorTake={mirrorTake}
              mirrorOriginal={mirrorOriginal}
              take={<TakeVideo url={url} videoRef={takeVideo} />}
              original={original}
              takeExtra={sketch}
              onTap={() => useReview.getState().togglePlay()}
              labels={{ take: 'Toma', original: 'Original' }}
            />
            {!takeReady && !takeError && (
              <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
                <Spinner className="size-8 text-washi-muted" />
              </div>
            )}
            {(takeError || originalError) && (
              <p role="alert" className="absolute inset-x-3 bottom-3 z-20 mx-auto flex max-w-md items-start gap-2 rounded-[10px] bg-sumi-900/95 p-3 text-[13px] text-washi">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-enji-300" />
                {takeError ?? originalError}
              </p>
            )}
            <AnimatePresence>
              {openNote && (
                <TakeNoteCard
                  key={openNote.id}
                  note={openNote}
                  members={members.data ?? []}
                  sketchShown={sketchShown}
                  onToggleSketch={() => setSketchShown((v) => !v)}
                  onClose={() => setOpenNoteId(null)}
                  onEdit={() => editNote(openNote)}
                  onStatus={(status) =>
                    updateNote.mutate(
                      { note: openNote, patch: { status } },
                      { onError: (err) => toast(friendlyError(err), 'error') },
                    )
                  }
                  onDelete={() => {
                    setOpenNoteId(null);
                    deleteNote.mutate(openNote, {
                      onSuccess: () => toast('Nota borrada', 'success'),
                      onError: (err) => toast(friendlyError(err), 'error'),
                    });
                  }}
                />
              )}
            </AnimatePresence>
            <AnimatePresence>{alert && !openNote && <NoteAlert key={alert.id} note={alert} onOpen={() => showNote(alert)} />}</AnimatePresence>
            <AnimatePresence>
              {settingsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16, transition: { duration: 0.15 } }}
                  transition={soft}
                  className="paper-raised absolute inset-x-2 bottom-2 z-30 max-h-[calc(100%-16px)] overflow-y-auto overscroll-contain rounded-[14px] p-4 lg:hidden"
                >
                  <ReviewSettings {...settingsProps} onClose={() => setSettingsOpen(false)} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <footer className="shrink-0 border-t border-line-strong bg-sumi-900 px-3 pb-[max(6px,env(safe-area-inset-bottom))] sm:px-5">
            <ReviewTimeline notes={notes} openNoteId={openNoteId} onNote={showNote} />
            <ReviewTransport
              onNote={newNote}
              settingsOpen={settingsOpen}
              onSettings={() => setSettingsOpen((v) => !v)}
              onLoopMissing={() => toast('Marca A y B para repetir un tramo', 'info')}
            />
          </footer>
        </div>
        <aside aria-label="Ajustes del repaso" className="hidden min-h-0 overflow-y-auto border-l border-line-strong bg-sumi-900 p-4 lg:block">
          <ReviewSettings {...settingsProps} />
        </aside>
      </div>

      <TakeNoteComposer
        draft={composer}
        mirrored={mirrorTake}
        members={members.data ?? []}
        defaultFor={take.member_id}
        authorName={me?.name ?? null}
        onClose={() => setComposer(null)}
        onSave={saveNote}
      />
    </motion.div>,
    document.body,
  );
}

function trapFocus(event: KeyboardEvent, root: HTMLElement | null) {
  if (!root) return;
  const nodes = [
    ...root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((n) => n.offsetParent !== null);
  if (!nodes.length) return;
  const first = nodes[0]!;
  const last = nodes[nodes.length - 1]!;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !root.contains(active) || active === root)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

