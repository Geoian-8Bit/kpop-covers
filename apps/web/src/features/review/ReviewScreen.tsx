import {
  clamp,
  clampAdjust,
  formatSpeed,
  formatTime,
  hasLinkedFile,
  MIN_LOOP_LENGTH,
  round3,
  songTimeAt,
  takeRangeToSong,
  type Clip,
  type Note,
  type Video,
} from '@coverscape/shared';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BookmarkPlus, FileVideo, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { askWho, currentMemberId, useMe, useMembers } from '@/data/members';
import { useCreateNote, useDeleteNote, useNotes, useUpdateNote } from '@/data/notes';
import { useUpdateTakeReview, type TakeItem, type TakeReviewPatch } from '@/data/takes';
import { useFileSource } from '@/features/studio/fileSource';
import { SaveClipDialog, type ClipDraft } from '@/features/studio/SaveClipDialog';
import { takeDateLabel } from '@/features/takes/takeRules';
import { cn } from '@/lib/cn';
import { soft } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { useBackToClose } from '@/lib/useBackToClose';
import { hasRange, useReview } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';
import { CompareStage, type ChosenSplit } from './CompareStage';
import { useTapAnyFinger } from './tapAnyFinger';
import { PlayCrest, QuickStrip, ReviewSettings, ReviewTimeline, ReviewTransport, SettingsButton, SoundPill } from './ReviewControls';
import { OriginalFile, OriginalYouTube, TakeVideo, useReviewClock } from './ReviewMedia';
import {
  aspectOf,
  atNoteMoment,
  bottomSheetHeight,
  coverPanelWidth,
  YOUTUBE_MIN_BOX,
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
  overlayStartOpacity,
  type CompareMode,
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
  let prefs: ViewPrefs;
  try {
    prefs = parseViewPrefs(localStorage.getItem(PREFS_KEY));
  } catch {
    prefs = parseViewPrefs(null);
  }
  // Opening straight in «Superpuesto»: never with the one on top hiding the other.
  return prefs.mode === 'overlay' ? { ...prefs, opacity: overlayStartOpacity(prefs.opacity) } : prefs;
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
  // 43 · The row holds where the take's second 0 is in the song (corrected once, when it was saved).
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
  const adjustTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The adjustment the original was last put in place for (a let-go reported twice jumps once). */
  const alignedAdjust = useRef(timing.adjust);
  const alignFor = (value: number) => {
    if (value === alignedAdjust.current) return;
    alignedAdjust.current = value;
    useReview.getState().alignOriginal();
  };
  useEffect(() => () => clearTimeout(adjustTimer.current), []);
  const onAdjust = (value: number, settled: boolean | 'soon' = true) => {
    const next = clampAdjust(value);
    setAdjust(next);
    clearTimeout(adjustTimer.current);
    if (settled === 'soon') {
      // ±0,01 taps: one jump of the original once they stop (each would make YouTube load again).
      useReview.setState({ timing: { ...useReview.getState().timing, adjust: next } });
      adjustTimer.current = setTimeout(() => alignFor(next), 300);
      adjustSaver.save({ sync_adjust_seconds: next });
      return;
    }
    // While the slider moves only the timing changes (a jump per step would make YouTube load over and over); the
    // original is put in place once, when it is let go.
    const r = useReview.getState();
    useReview.setState({ timing: { ...r.timing, adjust: next } });
    if (settled) alignFor(next);
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
  // P1 · A boolean of the clock, not the clock: the screen repaints when the take reaches or leaves the note's
  // moment, not 60 times a second.
  const noteSeconds = openNote?.take_seconds;
  const atOpenNote = useReview((s) => atNoteMoment(s.time, noteSeconds));
  const [alert, setAlert] = useState<Note | null>(null);
  const [composer, setComposer] = useState<ComposerDraft | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** «Separados»: the share the hinge was dragged to (this visit only); null: the best for these two pictures. */
  const [split, setSplit] = useState<ChosenSplit | null>(null);
  /** A slider of the panel over the take is being dragged. */
  const [sliding, setSliding] = useState(false);
  // 51 · A phone on its side (the usual way to watch it big) gets the stage at full height and a one-row bar.
  const low = useMatch(LOW_SCREEN);
  const wide = useMatch(WIDE_SCREEN);
  const roomRef = useRef<HTMLDivElement>(null);
  const room = useSize(roomRef);
  const insetsRef = useRef<HTMLDivElement>(null);
  const insets = useInsets(insetsRef, room);
  const [takeRect, setTakeRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const settingsTitleRef = useRef<HTMLHeadingElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  // Focus goes into the settings when they open and back to their button when they close.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (settingsOpen && !wasOpen.current) settingsTitleRef.current?.focus();
    else if (!settingsOpen && wasOpen.current) {
      const active = document.activeElement;
      if (!active || active === document.body || !rootRef.current?.contains(active)) settingsButtonRef.current?.focus();
    }
    wasOpen.current = settingsOpen;
  }, [settingsOpen]);
  const playing = useReview((s) => s.playing);
  const takeError = useReview((s) => s.takeError);
  const originalError = useReview((s) => s.originalError);
  const reduceMotion = useReducedMotion();
  const duration = useReview((s) => s.duration);
  const mirrorTake = useReview((s) => s.mirrorTake);
  const mirrorOriginal = useReview((s) => s.mirrorOriginal);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const loop = useReview((s) => s.loop);
  const activeClipId = useReview((s) => s.activeClipId);
  // F9 · The zooms are read by the stage (ReviewCompareStage) and the dialog: a gesture never repaints this screen.

  // ── F9 · Zoom: the take always (a file of this phone or the cloud); the original only as a file. ──
  const canZoomOriginal = source === 'file';
  /** «Superpuesto»: the fingers fit the original over the take, or zoom both. */
  const [overlayGesture, setOverlayGesture] = useState<'fit' | 'zoom'>('zoom');
  const zoomHintAt = useRef(0);
  const onZoomUnavailable = useCallback(() => {
    const now = performance.now();
    if (now - zoomHintAt.current < 4000) return;
    zoomHintAt.current = now;
    toast('El original es de YouTube: vincula el archivo del vídeo para ampliarlo.', 'info');
  }, [toast]);

  // ── F8 · A range marked on the take, saved as a clip of the song: it serves in every take and in practice. ──
  const [savingClip, setSavingClip] = useState(false);
  const [clipDraft, setClipDraft] = useState<ClipDraft | null>(null);
  const openSaveRange = useCallback(() => {
    const r = useReview.getState();
    if (!hasRange(r.loop)) {
      toast('Marca A y B en la toma primero', 'info');
      return;
    }
    const song = takeRangeToSong({ songStart: timing.songStart, speed: timing.speed, adjust }, r.loop);
    if (song.end - song.start < MIN_LOOP_LENGTH) {
      toast('El tramo es demasiado corto para un clip', 'info');
      return;
    }
    r.pause();
    // The take's speed and mirror: the range is practised as it was danced.
    setClipDraft({ start: song.start, end: song.end, speed: timing.speed, mirrored: take.mirrored });
    setSavingClip(true);
  }, [adjust, take.mirrored, timing.songStart, timing.speed, toast]);

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
  // The X answers to any finger (a thumb may rest on the video while the phone is on its side).
  const closeTap = useTapAnyFinger(close);
  // «Atrás» closes only what is on top (each layer has its own entry): the settings, an open note, then the review.
  useBackToClose(true, close, composer != null || savingClip);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  useBackToClose(settingsOpen, closeSettings);
  const closeNote = useCallback(() => setOpenNoteId(null), []);
  useBackToClose(openNoteId != null, closeNote, composer != null);

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

  /** Which of the settings and a note opened last (Escape closes it first, as «Atrás» does). */
  const openedOrder = useRef<('settings' | 'note')[]>([]);
  useEffect(() => {
    const order = openedOrder.current.filter((k) => (k === 'settings' ? settingsOpen : openNoteId != null));
    if (settingsOpen && !order.includes('settings')) order.push('settings');
    if (openNoteId != null && !order.includes('note')) order.push('note');
    openedOrder.current = order;
  }, [settingsOpen, openNoteId]);
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
        // Same order as «Atrás»: the last one opened goes first.
        const top = openedOrder.current.at(-1);
        if (top === 'settings' && st.settingsOpen) setSettingsOpen(false);
        else if (st.openNoteId) setOpenNoteId(null);
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
      // A zoom panel moves its view with the arrows itself (when zoomed); on a whole picture they still seek.
      if (key.startsWith('Arrow') && onControl && !onControl.hasAttribute('data-zoom-panel')) return;
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
      <OriginalYouTube
        videoId={video.youtube_id!}
        onRateAdjusted={(actual) =>
          toast(`YouTube no admite esa velocidad en este vídeo: el original va a ${formatSpeed(actual)} y se recoloca de vez en cuando.`, 'info')
        }
        onStuck={() => toast('YouTube no ha arrancado: toca ▶ otra vez para seguir.', 'info')}
      />
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
    atOpenNote ? (
      <img
        src={openNote.sketch}
        alt={`Dibujo de la nota: ${openNote.body}`}
        className="pointer-events-none absolute inset-0 z-[1] size-full object-contain"
      />
    ) : null;

  const hasOriginal = source === 'file' || source === 'youtube';
  const loopMissing = () => toast('Marca A y B para repetir un tramo', 'info');
  const overlayRefused = () => toast(`«Superpuesto» no va con YouTube. ${OVERLAY_NEEDS_FILE}`, 'info');
  const settingsProps = {
    mode,
    prefs,
    onPrefs: setPrefs,
    split: split?.value ?? null,
    onAutoSplit: () => setSplit(null),
    onResetFit: () => onFit(NO_FIT, true),
    fitStatus: fitSaver.status,
    adjust,
    onAdjust,
    adjustStatus: adjustSaver.status,
    hasOriginal,
    originalIsYouTube: source === 'youtube',
    practisedMirrored: take.mirrored,
    clips: inTake,
    canZoomOriginal,
    onSaveRange: openSaveRange,
    compact: low,
  } as const;

  // Where the settings and an open note go, never over YouTube. On a wide screen the settings sit beside the stage.
  // On a phone on its side they open as a panel of a comfortable width over the take's side: the take's panel is made
  // that wide and covered, YouTube keeps its own box (at least its minimum); on a very narrow screen the panel covers
  // the take whole. In portrait the settings go under the stage, as tall as the pictures allow, with the one-row bar
  // (▶ and the time) still under them.
  const youtube = source === 'youtube';
  const takeAspect = aspectOf(take, 9 / 16);
  const lowStageWidth = Math.max(0, room.width - insets.left - insets.right);
  const coverOpen = low && (settingsOpen || openNote != null);
  const coverWidth = coverOpen ? coverPanelWidth(lowStageWidth, youtube) : 0;
  const asideShown = wide;
  const sheetBelow = !wide && !low && settingsOpen;
  const belowMax = sheetBelow ? bottomSheetHeight(room.height - BAR_H - insets.bottom, youtube) : 0;
  /** The take's side of a phone on its side (where the panel opens). */
  const takeAtEnd = prefs.order === 'original-first';
  // Elsewhere, notes, their pop-ups and errors sit over the take, never over YouTube.
  const noteArea = youtube && mode === 'stacked' ? takeRect : null;
  // A narrow phone in portrait (360 px): no side padding, or YouTube would fall under its minimum.
  const tightPortrait = youtube && !low && !wide && room.width > 0 && room.width - 16 < YOUTUBE_MIN_BOX.width;

  const noteCard = (
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
          onStatus={(status) => updateNote.mutate({ note: openNote, patch: { status } }, { onError: (err) => toast(friendlyError(err), 'error') })}
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
  );

  /** Separate / overlaid; overlaid never starts hiding the take (or barely showing the original). */
  const setMode = (m: CompareMode) =>
    setPrefs(m === 'overlay' ? { mode: m, opacity: overlayStartOpacity(prefs.opacity) } : { mode: m });
  const quickProps = {
    mode,
    canOverlay,
    hasOriginal,
    opacity: prefs.opacity,
    onTop: prefs.onTop,
    onMode: setMode,
    onOpacity: (opacity: number) => setPrefs({ opacity }),
    onNote: newNote,
    onLoopMissing: loopMissing,
  } as const;
  // A phone on its side: the quick strip stands by the take's side of the stage (never by YouTube), out of the way
  // while the panel over the take is open.
  const strip =
    low && !coverOpen ? (
      <div className={cn('flex shrink-0 flex-col justify-center py-1.5', takeAtEnd ? 'pl-1.5' : 'pr-1.5')}>
        <QuickStrip orientation="column" {...quickProps} />
      </div>
    ) : null;

  const stage = (
    <div
      className={cn(
        // Isolated: whatever the stage draws stays under the controls.
        'seigaiha relative isolate flex min-h-0 flex-1',
        low
          ? 'pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]'
          : tightPortrait
            ? 'py-2 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]'
            : 'p-2 pl-[max(8px,env(safe-area-inset-left))] pr-[max(8px,env(safe-area-inset-right))] sm:p-3',
      )}
    >
      {!takeAtEnd && strip}
      <div className="relative min-w-0 flex-1">
        <ReviewCompareStage
          mode={mode}
          prefs={prefs}
          split={split}
          onSplit={setSplit}
          fit={fit}
          onFit={onFit}
          mirrorTake={mirrorTake}
          mirrorOriginal={mirrorOriginal}
          take={<TakeVideo url={url} videoRef={takeVideo} onBlocked={() => toast('El móvil no dejó empezar la toma: toca ▶ para reproducirla.', 'info')} />}
          original={original}
          originalIsYouTube={youtube}
          takeAspect={takeAspect}
          takeExtra={sketch}
          onTap={() => useReview.getState().togglePlay()}
          isPlaying={() => useReview.getState().playing}
          takeRoom={coverOpen && coverWidth > 0 ? coverWidth : undefined}
          onTakeRect={setTakeRect}
          canZoomOriginal={canZoomOriginal}
          onZoom={(which, z) => useReview.getState().setZoom(which, z)}
          onZoomUnavailable={onZoomUnavailable}
          overlayGesture={overlayGesture}
          onOverlayGesture={setOverlayGesture}
        />
        <div
          // Over the panel when it is open: a note arriving or an error must show while adjusting.
          className={cn('pointer-events-none absolute [&>*]:pointer-events-auto', coverOpen ? 'z-40' : 'z-20')}
          style={noteArea ? { left: noteArea.left, top: noteArea.top, width: noteArea.width, height: noteArea.height } : { inset: 0 }}
        >
          {!coverOpen && noteCard}
          <AnimatePresence>{alert && !openNote && <NoteAlert key={alert.id} note={alert} onOpen={() => showNote(alert)} />}</AnimatePresence>
          {(takeError || originalError) && (
            <p
              role="alert"
              className="paper-raised absolute inset-x-2 bottom-2 mx-auto flex max-w-md items-start gap-2 rounded-[12px] p-3 text-[13px] text-washi"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-enji-300" />
              {takeError ?? originalError}
            </p>
          )}
        </div>
      </div>
      {takeAtEnd && strip}
      {coverOpen && (
        // A phone on its side: settings and the open note in a panel over the take's side (never over YouTube).
        <motion.div
          initial={{ opacity: 0, x: reduceMotion ? 0 : takeAtEnd ? 24 : -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={reduceMotion ? { duration: 0.15 } : soft}
          className={cn('absolute inset-y-0 z-30', takeAtEnd ? 'right-[env(safe-area-inset-right)]' : 'left-[env(safe-area-inset-left)]')}
          style={{ width: coverWidth }}
        >
          {settingsOpen && (
            <section
              aria-label="Ajustes del repaso"
              // While a slider is dragged the panel fades, so the take under it shows (only opacity: no layout).
              className="absolute inset-0 overflow-y-auto overscroll-contain bg-sumi-900 p-3 pt-[max(12px,env(safe-area-inset-top))] transition-opacity duration-150 motion-reduce:transition-none"
              style={{ opacity: sliding ? 0.25 : 1 }}
            >
              <ReviewSettings {...settingsProps} titleRef={settingsTitleRef} onClose={() => setSettingsOpen(false)} onSliding={setSliding} />
            </section>
          )}
          {noteCard}
        </motion.div>
      )}
    </div>
  );

  const settingsSheet = (
    <ReviewSettings {...settingsProps} titleRef={settingsTitleRef} onClose={wide ? undefined : () => setSettingsOpen(false)} />
  );

  /** One row: close, play, time and line, what's heard, settings (a phone on its side, or under the settings). */
  const bar = (
    <footer
      className={cn(
        'sep-t relative z-20 box-content flex h-14 shrink-0 items-center gap-1 bg-sumi-900 pb-[env(safe-area-inset-bottom)] pl-[max(6px,env(safe-area-inset-left))]',
        'pr-[max(6px,env(safe-area-inset-right))]',
      )}
    >
      <Button variant="ghost" size="icon" aria-label="Cerrar el repaso" {...closeTap}>
        <X className="size-6" />
      </Button>
      <PlayCrest size="sm" />
      <ReviewTimeline variant="bar" notes={notes} openNoteId={openNoteId} onNote={showNote} />
      <SoundPill hasOriginal={hasOriginal} />
      <SettingsButton ref={settingsButtonRef} open={settingsOpen} onClick={() => setSettingsOpen((v) => !v)} />
    </footer>
  );

  return createPortal(
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0.15 } : soft}
      className="fixed inset-0 z-[45] flex flex-col bg-sumi-950 text-washi outline-none"
    >
      {/* Measures the screen's safe areas (the notch, the home bar) for the room rules above. */}
      <div
        ref={insetsRef}
        aria-hidden
        className="pointer-events-none invisible fixed left-0 top-0 h-0 w-0 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
      />
      {low ? (
        // A phone on its side: no header, the stage takes the whole height; the title stays for screen readers.
        <h2 id={titleId} className="sr-only">
          Repaso · {memberName} · {takeDateLabel(take.recorded_at)}
        </h2>
      ) : (
        <header className="sep-b flex shrink-0 items-center gap-2 bg-sumi-900 pb-1.5 pl-[max(8px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] pt-[max(6px,env(safe-area-inset-top))]">
          <Button variant="ghost" size="icon" aria-label="Cerrar el repaso" {...closeTap}>
            <X className="size-6" />
          </Button>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="flex items-baseline gap-1.5 truncate font-display text-[19px] font-bold leading-tight">
              Repaso <span aria-hidden className="text-[14px] text-shu-400">比</span>
            </h2>
            <p className="truncate text-[12px] text-washi-muted">
              {memberName} · {takeDateLabel(take.recorded_at)}
            </p>
          </div>
          {hasOriginal && (
            <Segmented
              label="Cómo comparar"
              layoutId={`review-mode-${take.id}`}
              size="sm"
              value={mode}
              onChange={setMode}
              onDisabled={overlayRefused}
              options={[
                { value: 'stacked', label: 'Separados' },
                {
                  value: 'overlay',
                  label: 'Superpuesto',
                  disabled: !canOverlay,
                  ariaLabel: canOverlay ? undefined : `Superpuesto, no disponible: ${OVERLAY_NEEDS_FILE}`,
                },
              ]}
            />
          )}
        </header>
      )}

      <div ref={roomRef} className="flex min-h-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {stage}

          {low ? (
            bar
          ) : sheetBelow ? (
            <>
              <motion.section
                aria-label="Ajustes del repaso"
                initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduceMotion ? { duration: 0.15 } : soft}
                className="paper-raised relative z-10 shrink-0 overflow-y-auto overscroll-contain rounded-t-[20px] border-b-0 p-4 pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] before:hidden"
                style={{ maxHeight: belowMax }}
              >
                {settingsSheet}
              </motion.section>
              {bar}
            </>
          ) : (
            <footer className="paper relative z-20 shrink-0 rounded-t-[20px] border-x-0 border-b-0 px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 before:hidden sm:px-5">
              <div className="mx-auto max-w-2xl">
                <ReviewTimeline
                  notes={notes}
                  openNoteId={openNoteId}
                  onNote={showNote}
                  // Portrait: the quick ones share the clock's row (no row of their own: the stage keeps its height).
                  showTotal={false}
                  actions={
                    <>
                      <SoundPill hasOriginal={hasOriginal} />
                      <QuickStrip orientation="row" bare {...quickProps} withLoop={false} withMode={false} />
                    </>
                  }
                />
                {hasRange(loop) && !activeClipId && (
                  <div className="flex items-center justify-between gap-2 pb-1">
                    <span className="tabular truncate font-mono text-[12px] text-washi-muted">
                      A–B {formatTime(loop.start, { tenths: true })}–{formatTime(loop.end, { tenths: true })}
                    </span>
                    <Button variant="secondary" size="sm" className="min-h-11" onClick={openSaveRange}>
                      <BookmarkPlus className="size-4" /> Guardar como clip
                    </Button>
                  </div>
                )}
                <ReviewTransport
                  settingsOpen={settingsOpen}
                  onSettings={() => setSettingsOpen((v) => !v)}
                  onLoopMissing={loopMissing}
                  settingsRef={settingsButtonRef}
                  hideSettings={wide}
                />
              </div>
            </footer>
          )}
        </div>
        {asideShown && (
          <motion.aside
            aria-label="Ajustes del repaso"
            initial={wide ? false : { opacity: 0, x: reduceMotion ? 0 : 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={reduceMotion ? { duration: 0.15 } : soft}
            className={cn(
              'sep-l min-h-0 shrink-0 overflow-y-auto overscroll-contain bg-sumi-900 p-4',
              'pb-[max(16px,env(safe-area-inset-bottom))] pr-[max(16px,env(safe-area-inset-right))] pt-[max(12px,env(safe-area-inset-top))]',
              wide && 'w-[360px]',
            )}
          >
            {settingsSheet}
          </motion.aside>
        )}
      </div>

      <SaveClipDialog
        open={savingClip}
        onClose={() => setSavingClip(false)}
        video={video}
        clipCount={clips.length}
        draft={clipDraft}
        zoomFrom={mode === 'stacked' && canZoomOriginal ? 'review-original' : null}
        description="Un tramo de la canción: sirve en todas las tomas y en la práctica. Se guarda con la velocidad y el espejo de esta toma."
        onSaved={(clip) => useReview.setState({ activeClipId: clip.id })}
      />
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

/** F9 · The stage with the review's zooms, read here so a pinch or a wheel turn repaints only the stage. */
function ReviewCompareStage(props: Omit<ComponentProps<typeof CompareStage>, 'zoomTake' | 'zoomOriginal'>) {
  const zoomTake = useReview((s) => s.zoomTake);
  const zoomOriginal = useReview((s) => s.zoomOriginal);
  return <CompareStage {...props} zoomTake={zoomTake} zoomOriginal={zoomOriginal} />;
}

/** Below this height (a phone on its side) the review drops its header and keeps one row of controls. */
const LOW_SCREEN = '(max-height: 520px)';
/** A computer or tablet: the settings sit beside the stage. */
const WIDE_SCREEN = '(min-width: 1024px) and (min-height: 521px)';

/** The one-row bar's height (px, without the safe area). */
const BAR_H = 56;

function useSize(ref: React.RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setSize((s) => (s.width === el.clientWidth && s.height === el.clientHeight ? s : { width: el.clientWidth, height: el.clientHeight }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** The safe areas (px), read from an element padded by them; read again whenever the room changes (a turn). */
function useInsets(ref: React.RefObject<HTMLElement | null>, room: { width: number; height: number }) {
  const [insets, setInsets] = useState({ left: 0, right: 0, bottom: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const next = { left: parseFloat(cs.paddingLeft) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
    setInsets((s) => (s.left === next.left && s.right === next.right && s.bottom === next.bottom ? s : next));
  }, [ref, room.width, room.height]);
  return insets;
}

function useMatch(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
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

