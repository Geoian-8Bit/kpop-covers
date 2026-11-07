import { hasLinkedFile, type Clip, type Video } from '@coverscape/shared';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Columns2, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMe, useMembers } from '@/data/members';
import type { TakeItem } from '@/data/takes';
import { useFileSource } from '@/features/studio/fileSource';
import { SaveClipDialog } from '@/features/studio/SaveClipDialog';
import { takeDateLabel } from '@/features/takes/takeRules';
import { cn } from '@/lib/cn';
import { soft } from '@/lib/motion';
import { useBackToClose } from '@/lib/useBackToClose';
import { useReview } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';
import { QuickStrip } from './ReviewControls';
import { ReviewBar, ReviewFooter } from './ReviewBar';
import { OVERLAY_NEEDS_FILE, ReviewHeader } from './ReviewHeader';
import { TakeVideo, useReviewClock } from './ReviewMedia';
import { ReviewOriginal } from './ReviewOriginal';
import { readPrefs, writePrefs } from './reviewPrefs';
import {
  aspectOf,
  bottomSheetHeight,
  coverPanelWidth,
  fitOf,
  isValidSketch,
  overlayStartOpacity,
  parseViewPrefs,
  takeLength,
  takeTiming,
  YOUTUBE_MIN_BOX,
  type CompareMode,
  type ViewPrefs,
} from './reviewRules';
import { ReviewSettingsPanel } from './ReviewSettingsPanel';
import { NoteArea, ReviewCompareStage } from './ReviewStage';
import { createStageStore, type SaveStatus } from './reviewStageStore';
import { NoteAlert, TakeNoteCard } from './TakeNoteCard';
import { TakeNoteComposer } from './TakeNoteComposer';
import { useTapAnyFinger } from './tapAnyFinger';
import { useClipSave } from './useClipSave';
import { useFitAndSplit } from './useFitAndSplit';
import { useReviewKeys } from './useReviewKeys';
import { useSize } from '@/lib/useSize';
import { BAR_H, LOW_SCREEN, useInsets, useMatch, WIDE_SCREEN } from './useReviewLayout';
import { useReviewNotes } from './useReviewNotes';
import { useSongLead } from './useSongLead';
import { useSyncAdjust } from './useSyncAdjust';
import { useTakeSaver } from './useTakeSaver';

/**
 * F5 · «Repaso»: the take next to (or over) the original, in sync, to find what to fix. F6 · notes on the take,
 * with a drawing over the frame. A screen of its own above the studio (Escape or back closes it).
 *
 * REQ-25 · What a gesture changes many times a second (the overlay fit, the hinge, the take's rect, the fine sync)
 * lives in stores read only where it is painted; this screen keeps the settled values it saves. REQ-27 · Its hooks
 * and pieces live in their own files (notes, keys, saving, layout, header, bars, settings, stage).
 */

export { OVERLAY_NEEDS_FILE };

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
      timing: {
        songStart: timing.songStart,
        speed: timing.speed,
        adjust: timing.adjust,
        lead: timing.lead,
        offset: 0,
        onFile: false,
      },
      duration: takeLength(0, take.duration_seconds),
      mirrored: take.mirrored,
    });
    return () => useReview.getState().end();
    // Only when another take opens: fresh values of the same take come through `setTiming`.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- REQ-30 · kept (layout effect: the review must begin before paint)
  }, [take.id]);
  useEffect(() => {
    useReview.getState().setTiming({ onFile: source === 'file', offset });
  }, [source, offset]);
  useReviewClock(true);

  // ── Saved with the take: fine sync and overlay fit. REQ-25 · Live values in the stores, settled ones saved. ──
  const [stage] = useState(() => createStageStore(fitOf(take)));
  const showSaveError = useCallback((message: string) => toast(message, 'error'), [toast]);
  const adjustSaver = useTakeSaver(take, showSaveError, (adjustStatus: SaveStatus) =>
    stage.setState({ adjustStatus }),
  );
  const fitSaver = useTakeSaver(take, showSaveError, (fitStatus: SaveStatus) =>
    stage.setState({ fitStatus }),
  );
  const onAdjust = useSyncAdjust(timing.adjust, adjustSaver.save);
  const onLead = useSongLead(adjustSaver.save);
  const fitAndSplit = useFitAndSplit(stage, take, fitSaver.save);

  // ── Notes of this take ──
  const {
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
  } = useReviewNotes(video, take, takeVideo, toast);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** A slider of the panel over the take is being dragged. */
  const [sliding, setSliding] = useState(false);
  // 51 · A phone on its side (the usual way to watch it big) gets the stage at full height and a one-row bar.
  const low = useMatch(LOW_SCREEN);
  const wide = useMatch(WIDE_SCREEN);
  const roomRef = useRef<HTMLDivElement>(null);
  const room = useSize(roomRef);
  const insetsRef = useRef<HTMLDivElement>(null);
  const insets = useInsets(insetsRef, room);
  const settingsTitleRef = useRef<HTMLHeadingElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  // Focus goes into the settings when they open and back to their button when they close.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (settingsOpen && !wasOpen.current) settingsTitleRef.current?.focus();
    else if (!settingsOpen && wasOpen.current) {
      const active = document.activeElement;
      if (!active || active === document.body || !rootRef.current?.contains(active))
        settingsButtonRef.current?.focus();
    }
    wasOpen.current = settingsOpen;
  }, [settingsOpen]);
  const playing = useReview((s) => s.playing);
  const takeError = useReview((s) => s.takeError);
  const originalError = useReview((s) => s.originalError);
  const reduceMotion = useReducedMotion();
  const mirrorTake = useReview((s) => s.mirrorTake);
  const mirrorOriginal = useReview((s) => s.mirrorOriginal);
  /** «Solo toma»: the take alone and big (the original paused, out of sight). */
  const solo = useReview((s) => s.solo);
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
  const { savingClip, setSavingClip, clipDraft, openSaveRange } = useClipSave(timing, take.mirrored, toast);

  const close = useCallback(() => onClose(), [onClose]);
  // The X answers to any finger (a thumb may rest on the video while the phone is on its side).
  const closeTap = useTapAnyFinger(close);
  // «Atrás» closes only what is on top (each layer has its own entry): the settings, an open note, then the review.
  useBackToClose(true, close, composer != null || savingClip);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  useBackToClose(settingsOpen, closeSettings);
  const closeNote = useCallback(() => setOpenNoteId(null), [setOpenNoteId]);
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
  useReviewKeys(
    rootRef,
    { composer, openNoteId, settingsOpen },
    { closeSettings, closeNote, close, newNote, toast },
  );

  const memberName = take.member_id
    ? (members.data?.find((m) => m.id === take.member_id)?.name ?? 'Antiguo miembro')
    : 'Sin nombre';

  const original = (
    <ReviewOriginal
      source={source}
      fileUrl={file.status === 'ready' ? file.url : null}
      youtubeId={video.youtube_id ?? null}
      toast={toast}
    />
  );

  // The drawing is a still of its moment: shown only while the take stands at that moment (review round 1).
  const sketch =
    openNote && sketchShown && !playing && isValidSketch(openNote.sketch) && atOpenNote ? (
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
    stage,
    take,
    allClips: clips,
    mode,
    prefs,
    onPrefs: setPrefs,
    onAutoSplit: fitAndSplit.onAutoSplit,
    onResetFit: fitAndSplit.onResetFit,
    onAdjust,
    onLead,
    hasOriginal,
    originalIsYouTube: source === 'youtube',
    practisedMirrored: take.mirrored,
    canZoomOriginal,
    onSaveRange: openSaveRange,
    compact: low,
  } as const;

  // Where the settings and an open note go, never over YouTube. On a wide screen the settings sit beside the stage.
  // On a phone on its side they open as a panel of a comfortable width over the take's side: the take's panel is made
  // that wide and covered, YouTube keeps its own box (at least its minimum); on a very narrow screen the panel covers
  // the take whole. In portrait the settings go under the stage, as tall as the pictures allow, with the one-row bar
  // (▶ and the time) still under them.
  // YouTube on the stage (never covered, kept at its minimum): not while the take is alone.
  const youtube = source === 'youtube' && !solo;
  const takeAspect = aspectOf(take, 9 / 16);
  const lowStageWidth = Math.max(0, room.width - insets.left - insets.right);
  const coverOpen = low && (settingsOpen || openNote != null);
  const coverWidth = coverOpen ? coverPanelWidth(lowStageWidth, youtube) : 0;
  const asideShown = wide;
  const sheetBelow = !wide && !low && settingsOpen;
  const belowMax = sheetBelow ? bottomSheetHeight(room.height - BAR_H - insets.bottom, youtube) : 0;
  /** The take's side of a phone on its side (where the panel opens). */
  const takeAtEnd = prefs.order === 'original-first';
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
          onStatus={(status) => setNoteStatus(openNote, status)}
          onDelete={() => removeNote(openNote)}
        />
      )}
    </AnimatePresence>
  );

  /** Separate / overlaid (back from «Solo toma»); overlaid never starts hiding the take (or barely showing the original). */
  const setMode = (m: CompareMode) => {
    useReview.getState().setSolo(false);
    setPrefs(m === 'overlay' ? { mode: m, opacity: overlayStartOpacity(prefs.opacity) } : { mode: m });
  };
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

  const stageView = (
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
          stage={stage}
          mode={mode}
          prefs={prefs}
          onSplit={fitAndSplit.onSplit}
          onFit={fitAndSplit.onFit}
          mirrorTake={mirrorTake}
          mirrorOriginal={mirrorOriginal}
          solo={solo}
          take={
            <TakeVideo
              url={url}
              videoRef={takeVideo}
              onBlocked={() => toast('El móvil no dejó empezar la toma: toca ▶ para reproducirla.', 'info')}
            />
          }
          original={original}
          originalIsYouTube={source === 'youtube'}
          takeAspect={takeAspect}
          takeExtra={sketch}
          onTap={() => useReview.getState().togglePlay()}
          isPlaying={() => useReview.getState().playing}
          takeRoom={coverOpen && coverWidth > 0 ? coverWidth : undefined}
          onTakeRect={fitAndSplit.onTakeRect}
          canZoomOriginal={canZoomOriginal}
          onZoom={(which, z) => useReview.getState().setZoom(which, z)}
          onZoomUnavailable={onZoomUnavailable}
          overlayGesture={overlayGesture}
          onOverlayGesture={setOverlayGesture}
        />
        {/* Elsewhere, notes, their pop-ups and errors sit over the take, never over YouTube. */}
        {solo && low && !coverOpen && (
          // A phone on its side has no header: the way back to comparing sits on the stage.
          <button
            type="button"
            onClick={() => useReview.getState().setSolo(false)}
            className="absolute right-2 top-2 z-30 flex min-h-11 items-center gap-1.5 rounded-[10px] bg-sumi-950/85 px-3 text-[13px] font-bold text-washi"
          >
            <Columns2 className="size-4" /> Comparar
          </button>
        )}
        <NoteArea stage={stage} overTake={youtube && mode === 'stacked'} coverOpen={coverOpen}>
          {!coverOpen && noteCard}
          <AnimatePresence>
            {alert && !openNote && <NoteAlert key={alert.id} note={alert} onOpen={() => showNote(alert)} />}
          </AnimatePresence>
          {(takeError || originalError) && (
            <p
              role="alert"
              className="paper-raised absolute inset-x-2 bottom-2 mx-auto flex max-w-md items-start gap-2 rounded-[12px] p-3 text-[13px] text-washi"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-enji-300" />
              {takeError ?? originalError}
            </p>
          )}
        </NoteArea>
      </div>
      {takeAtEnd && strip}
      {coverOpen && (
        // A phone on its side: settings and the open note in a panel over the take's side (never over YouTube).
        <motion.div
          initial={{ opacity: 0, x: reduceMotion ? 0 : takeAtEnd ? 24 : -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={reduceMotion ? { duration: 0.15 } : soft}
          className={cn(
            'absolute inset-y-0 z-30',
            takeAtEnd ? 'right-[env(safe-area-inset-right)]' : 'left-[env(safe-area-inset-left)]',
          )}
          style={{ width: coverWidth }}
        >
          {settingsOpen && (
            <section
              aria-label="Ajustes del repaso"
              // While a slider is dragged the panel fades, so the take under it shows (only opacity: no layout).
              className="absolute inset-0 overflow-y-auto overscroll-contain bg-sumi-900 p-3 pt-[max(12px,env(safe-area-inset-top))] transition-opacity duration-150 motion-reduce:transition-none"
              style={{ opacity: sliding ? 0.25 : 1 }}
            >
              <ReviewSettingsPanel
                {...settingsProps}
                titleRef={settingsTitleRef}
                onClose={() => setSettingsOpen(false)}
                onSliding={setSliding}
              />
            </section>
          )}
          {noteCard}
        </motion.div>
      )}
    </div>
  );

  const settingsSheet = (
    <ReviewSettingsPanel
      {...settingsProps}
      titleRef={settingsTitleRef}
      onClose={wide ? undefined : () => setSettingsOpen(false)}
    />
  );

  const toggleSettings = () => setSettingsOpen((v) => !v);
  const bar = (
    <ReviewBar
      closeTap={closeTap}
      notes={notes}
      openNoteId={openNoteId}
      onNote={showNote}
      hasOriginal={hasOriginal}
      settingsOpen={settingsOpen}
      onSettings={toggleSettings}
      settingsRef={settingsButtonRef}
    />
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
      <ReviewHeader
        low={low}
        titleId={titleId}
        subtitle={`${memberName} · ${takeDateLabel(take.recorded_at)}`}
        closeTap={closeTap}
        hasOriginal={hasOriginal}
        layoutId={`review-mode-${take.id}`}
        mode={mode}
        solo={solo}
        onMode={setMode}
        canOverlay={canOverlay}
        onOverlayRefused={overlayRefused}
      />

      <div ref={roomRef} className="flex min-h-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {stageView}

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
            <ReviewFooter
              notes={notes}
              openNoteId={openNoteId}
              onNote={showNote}
              hasOriginal={hasOriginal}
              quickProps={quickProps}
              onSaveRange={openSaveRange}
              settingsOpen={settingsOpen}
              onSettings={toggleSettings}
              onLoopMissing={loopMissing}
              settingsRef={settingsButtonRef}
              hideSettings={wide}
            />
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
