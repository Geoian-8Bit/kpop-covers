import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, Play, RotateCcw, Save, Shuffle } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Seal } from '@/components/Seal';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import type { ClipWithVideo } from '@/lib/backend';
import { cn } from '@/lib/cn';
import { unlockAudio } from '@/lib/metronome';
import { soft } from '@/lib/motion';
import { useBackToClose } from '@/lib/useBackToClose';
import { usePlayer } from '@/player/store';
import { barLayout, escapeInFullscreen, stageTap } from './fullscreenRules';
import { roundOptions, toCard } from './playCards';
import { RandomPlayScreen, type PlayCard } from './RandomPlayScreen';
import { RoundControls } from './RoundControls';
import { roundChrome, useLandscape, useRoundChromeDriver } from './roundChrome';
import { setRoundDraft, type RoundDraft } from './roundDraft';
import { FS_ROOT, ROOT, useInertOutside } from './roundLayer';
import {
  clipAnnouncement,
  exitNeedsConfirm,
  followingPlayable,
  isLayerEntry,
  leaveFallback,
  leaveRoundBy,
  optionsSummary,
  roundKeyAction,
  shuffle,
  spreadBy,
  titleShown,
} from './roundRules';
import { Preloader, RoundStage, YouTubeCredit } from './RoundStage';
import { SaveTrackDialog } from './SaveTrackDialog';
import type { Fullscreen } from './useFullscreenRound';
import { useHistorySettled, WAIT_MS } from './useHistorySettled';
import { useRoundMachine } from './useRoundMachine';

// REQ-27 · Split out of RpdPlayPage.tsx: the round itself (its machine, its screen and its dialogs).

export function RoundRunner({
  draft,
  all,
  fullscreen,
}: {
  draft: RoundDraft;
  all: ClipWithVideo[];
  fullscreen: Fullscreen;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    options,
    byId,
    entries,
    available,
    state,
    dispatch,
    current,
    clip,
    source,
    nextIndex,
    nextSource,
    stageKey,
    stageReady,
    lead,
    leadKey,
    forgetApplied,
    problem,
    paused,
    syncClock,
  } = useRoundMachine(draft, all);
  const [saving, setSaving] = useState(false);
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  useInertOutside(rootRef);
  // 54 · Full screen sideways: the studio's bar on the bottom edge, hiding by itself while the clip plays.
  const landscape = useLandscape();
  const layout = barLayout(fullscreen.on, landscape);
  useRoundChromeDriver(layout === 'overlay');
  // Entering or leaving full screen swaps the bar, and so does turning the phone inside it (the turn after the
  // landscape lock comes later): the focus goes back to the full-screen button, not to `body`.
  const fsKey = `${fullscreen.mode}:${layout}`;
  const lastFsKey = useRef(fsKey);
  useLayoutEffect(() => {
    if (lastFsKey.current === fsKey) return;
    lastFsKey.current = fsKey;
    const active = document.activeElement;
    if (active && active !== document.body && active !== rootRef.current) return;
    rootRef.current?.querySelector<HTMLElement>('[data-fs-toggle]')?.focus({ preventScroll: true });
  }, [fsKey]);

  // ── Controls ──
  // «Empezar» and «Otra vez» leave with their overlay: the focus goes on to «Pausa» instead of falling to `body`.
  const focusPause = useRef(false);
  useEffect(() => {
    if (state.phase !== 'lead' || !focusPause.current) return;
    focusPause.current = false;
    rootRef.current?.querySelector<HTMLElement>('[data-round-pause]')?.focus({ preventScroll: true });
  }, [state.phase]);
  const start = useCallback(() => {
    unlockAudio();
    focusPause.current = true;
    dispatch({ type: 'start', now: performance.now() });
  }, [dispatch]);
  const togglePause = useCallback(() => {
    if (state.phase !== 'lead' && state.phase !== 'play') return;
    if (state.pausedAt != null) {
      // REQ-22 · The lead-in clock takes the same instant: no stale «3» (and no extra tick) on resuming.
      const at = performance.now();
      syncClock(at);
      dispatch({ type: 'resume', now: at });
      if (state.phase === 'play') usePlayer.getState().play();
    } else {
      dispatch({ type: 'pause', now: performance.now() });
      usePlayer.getState().pause();
    }
  }, [state.phase, state.pausedAt, syncClock, dispatch]);
  const repeat = useCallback(() => {
    if (!clip) return;
    const player = usePlayer.getState();
    player.pause();
    player.seek(clip.start_seconds);
    forgetApplied();
    dispatch({ type: 'repeat', now: performance.now() });
  }, [clip, dispatch, forgetApplied]);
  const skip = useCallback(() => {
    usePlayer.getState().pause();
    dispatch({ type: 'advance', now: performance.now() });
  }, [dispatch]);
  const finish = useCallback(() => {
    usePlayer.getState().pause();
    dispatch({ type: 'finish' });
  }, [dispatch]);
  const restart = useCallback(
    (mix: boolean) => {
      if (mix) {
        const order = spreadBy(shuffle(draft.clipIds), (id) => byId.get(id)?.video_id ?? id);
        setRoundDraft({ ...draft, clipIds: order, mix: (draft.mix ?? 0) + 1 });
        return; // a new list remounts the runner
      }
      unlockAudio();
      focusPause.current = true;
      dispatch({ type: 'start', now: performance.now() });
    },
    [draft, byId, dispatch],
  );

  // Leaving: once the history is quiet (a dialog that just closed has dropped its entry), step back to the entry
  // the round was opened from (`/rpd`, a bag, a track), or put `/rpd` in the round's place. Never a new entry on top: «Atrás» from
  // `/rpd` then doesn't come back to a dead round.
  const [leaving, setLeaving] = useState(false);
  const leaveReady = useHistorySettled(leaving);
  const openedFrom = useRef(location.state);
  const left = useRef(false);
  // The safety net of a leave on its way (listener and timer), dropped when the page unmounts.
  const leaveWatch = useRef<(() => void) | null>(null);
  useEffect(() => () => leaveWatch.current?.(), []);
  useEffect(() => {
    if (!leaveReady || left.current) return;
    left.current = true;
    const roundPath = window.location.pathname;
    let how = leaveRoundBy(openedFrom.current, isLayerEntry(window.history.state));
    let timer = 0;
    const stop = () => {
      window.clearTimeout(timer);
      window.removeEventListener('popstate', check);
      leaveWatch.current = null;
    };
    // Still on the round once the navigation has landed (a step back onto a stale entry with the same URL):
    // `/rpd` in place; still here after that, «leaving» is undone so «Salir» isn't left dead.
    function check() {
      stop();
      const next = leaveFallback(how, window.location.pathname === roundPath);
      if (next === 'replace') go('replace');
      else if (next === 'reset') {
        left.current = false;
        setLeaving(false);
      }
    }
    function go(by: 'back' | 'replace') {
      how = by;
      leaveWatch.current = stop;
      if (by === 'back') {
        window.addEventListener('popstate', check);
        timer = window.setTimeout(check, WAIT_MS * 2);
        navigate(-1);
      } else {
        timer = window.setTimeout(check, WAIT_MS);
        navigate('/rpd', { replace: true });
      }
    }
    go(how);
  }, [leaveReady, navigate]);
  const leave = useCallback(() => {
    usePlayer.getState().pause();
    setLeaving(true);
  }, []);

  // «Salir» mid-round asks first (the round pauses meanwhile; «Seguir en la ronda» resumes it if it was running).
  const [confirmExit, setConfirmExit] = useState(false);
  const pausedForExit = useRef(false);
  const exit = useCallback(() => {
    // A second tap (or Esc, then a tap) before the dialog is up: already asked, and the pause it made stays known.
    if (leaving || confirmExit) return;
    if (!exitNeedsConfirm(state.phase)) {
      leave();
      return;
    }
    pausedForExit.current = state.pausedAt == null;
    if (pausedForExit.current) togglePause();
    setConfirmExit(true);
  }, [leaving, confirmExit, state.phase, state.pausedAt, togglePause, leave]);
  const stayInRound = useCallback(() => {
    setConfirmExit(false);
    if (pausedForExit.current) {
      pausedForExit.current = false;
      togglePause();
    }
  }, [togglePause]);
  // The phone's «Atrás» (or the swipe back) mid-round asks the same question instead of leaving at once. Off while
  // another layer is open: that layer's own entry takes the back press (and closing it puts this one back).
  // Each entry is pushed only once the previous layer's own entry is gone (see `useHistorySettled`): pushed in the
  // same moment as that layer's `back()`, it would leave a stale entry with the round's URL behind.
  const guardWanted = exitNeedsConfirm(state.phase) && !confirmExit && !saving && !leaving;
  const guardReady = useHistorySettled(guardWanted);
  useBackToClose(guardWanted && guardReady, exit);
  const confirmReady = useHistorySettled(confirmExit);
  const saveReady = useHistorySettled(saving);

  // Keyboard, for a laptop by the TV: space pauses, → skips, R repeats.
  // The button the focus sits on only because it was clicked or tapped: Space on it still pauses (not «Saltar» again).
  // A native listener on the round's own node: taps inside the dialogs (portals) don't count.
  const pointerButton = useRef<Element | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onPointer = (e: PointerEvent) => {
      pointerButton.current = (e.target as Element | null)?.closest('button') ?? null;
    };
    root.addEventListener('pointerdown', onPointer, true);
    return () => root.removeEventListener('pointerdown', onPointer, true);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Moving with the keyboard: from here on the focus is the keyboard's.
      if (e.key === 'Tab') pointerButton.current = null;
      // Single keys only: Ctrl+R reloads, Alt+→ goes forward… those belong to the browser.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (saving || confirmExit || leaving || target?.closest('input, textarea, select')) return;
      // Inside another layer (a dialog over the round) the keys are that layer's; the round itself is a dialog too,
      // and a control of its own (after a tap on Pausa, say) must not switch the shortcuts off.
      const layer = target?.closest('[role="dialog"]');
      if (layer && layer !== rootRef.current) return;
      const button = target?.closest('button') ?? null;
      const action = roundKeyAction(e.key, {
        onButton: button != null,
        byPointer: button != null && button === pointerButton.current,
        repeat: e.repeat,
      });
      // A held Space still mustn't scroll the round or press the focused button again.
      if (e.repeat && e.key === ' ') e.preventDefault();
      if (action === 'pause') {
        e.preventDefault();
        // Off the clicked button, so its own Space (on keyup) doesn't fire it as well.
        if (button) rootRef.current?.focus({ preventScroll: true });
        togglePause();
      } else if (action === 'skip') skip();
      else if (action === 'repeat') repeat();
      // In full screen, Esc only leaves full screen (the browser's own keeps Esc; the CSS one is left by hand).
      else if (action === 'exit' && escapeInFullscreen(fullscreen.mode) === 'leave-css') {
        e.preventDefault();
        fullscreen.toggle();
      }
      // Mid-round it pauses and asks, like «Salir»; on «¿Preparados?» and «Ronda terminada» it does nothing
      // (an Esc by mistake doesn't throw the round away).
      else if (
        action === 'exit' &&
        exitNeedsConfirm(state.phase) &&
        fullscreen.mode === 'none' &&
        !document.fullscreenElement
      ) {
        e.preventDefault();
        exit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePause, skip, repeat, exit, state.phase, saving, confirmExit, leaving, fullscreen]);

  // ── What the screen shows ──
  // REQ-22 · Everything handed to the memoised screen keeps its identity until it really changes.
  const total = available.filter(Boolean).length;
  const position = useMemo(
    () => ({
      index: state.index >= 0 ? available.slice(0, state.index + 1).filter(Boolean).length : 0,
      total,
    }),
    [available, state.index, total],
  );
  const upcoming = useMemo(() => {
    const cards: PlayCard[] = [];
    for (let i = nextIndex; i >= 0 && cards.length < 4; i = followingPlayable(available, i)) {
      const card = toCard(entries[i]!);
      if (card) cards.push(card);
    }
    return cards;
  }, [nextIndex, available, entries]);
  const shownUpcoming = useMemo(
    () => (state.phase === 'idle' ? upcoming.slice(1) : upcoming),
    [state.phase, upcoming],
  );
  const clipSeconds = clip ? Math.max(0.1, clip.end_seconds - clip.start_seconds) : 1;
  const titleVisible = usePlayer((s) =>
    titleShown(
      options.titleMode,
      state.phase === 'play' && s.playing,
      clip ? s.time - clip.start_seconds : 0,
      clipSeconds,
    ),
  );
  const mirrored = usePlayer((s) => s.mirrored);
  const waiting = lead?.phase === 'go' && !stageReady && !problem;
  const unavailable = entries.length - total;
  const overlay = state.phase === 'idle' || state.phase === 'done';
  const shownCard = useMemo(() => (current ? toCard(current) : (upcoming[0] ?? null)), [current, upcoming]);
  // Modo adivinar: once revealed, the title stays for the rest of this clip (a pause no longer hides it again).
  const [revealedFor, setRevealedFor] = useState<string | null>(null);
  if (titleVisible && state.phase === 'play' && revealedFor !== leadKey) setRevealedFor(leadKey);
  const shownTitleVisible =
    state.phase === 'idle'
      ? options.titleMode === 'before'
      : titleVisible || (state.phase === 'play' && revealedFor === leadKey);
  /** A tap on the picture: pause or resume; full screen sideways, show or hide the bar (as the studio). */
  const onStageTap = useCallback(() => {
    const tap = stageTap(layout, roundChrome.isShown());
    if (tap === 'show-bar') roundChrome.wake();
    else if (tap === 'hide-bar') roundChrome.hide();
    else togglePause();
  }, [layout, togglePause]);
  /**
   * Full screen sideways, a tap on the black bands beside the picture (or on the card) shows or hides the bar too.
   * Not on a control, not inside a dialog over the round (portals bubble here in React), not on the overlays.
   */
  const onBackdropTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (layout !== 'overlay' || overlay) return;
    const target = e.target as Element;
    if (!rootRef.current?.contains(target)) return;
    if (target.closest('button, a, input, [data-round-bar], [role="dialog"]:not([data-round-root])')) return;
    onStageTap();
  };
  const announcement =
    state.phase === 'lead' || state.phase === 'play'
      ? clipAnnouncement(position, shownCard?.title ?? null, !shownTitleVisible)
      : '';
  // The lead-in as drawn (phase, 3-2-1, seconds): a new object only when one of those changes.
  // The screen reads the phase, the 3-2-1 and the whole seconds left: rebuilt only when one of those changes
  // (`lead` itself is a new object on every render).
  const leadPhase = state.phase === 'lead' ? (lead?.phase ?? null) : null;
  const leadCount = lead?.count ?? null;
  const leadSeconds = lead ? Math.ceil(lead.remainingMs / 1000) : 0;
  const shownLead = useMemo(
    () => (leadPhase ? { phase: leadPhase, count: leadCount, remainingMs: leadSeconds * 1000 } : null),
    [leadPhase, leadCount, leadSeconds],
  );
  const youtubeId = source.status === 'youtube' ? source.youtubeId : null;
  const credit = useMemo(() => (youtubeId ? <YouTubeCredit youtubeId={youtubeId} /> : null), [youtubeId]);
  const top = useMemo(
    () => (
      <div className="flex min-w-0 items-center gap-2">
        <Button variant="ghost" size="sm" className="-ml-1 h-11 shrink-0 px-2.5 text-[14px]" onClick={exit}>
          <ArrowLeft aria-hidden className="size-4.5" /> Salir
        </Button>
        <p className="min-w-0 flex-1 truncate text-[13px] text-washi-muted xl:text-base">
          {draft.from || 'Ronda'}
          {unavailable > 0 && ` · ${unavailable} no disponible${unavailable === 1 ? '' : 's'} (se saltan)`}
        </p>
      </div>
    ),
    [exit, draft.from, unavailable],
  );
  const playing = state.phase === 'play' && !paused;
  const stage = useMemo(
    () => (
      <RoundStage
        source={source}
        stageKey={stageKey}
        mirrored={mirrored}
        onToggle={onStageTap}
        playing={playing}
        tapShowsBar={layout === 'overlay'}
      />
    ),
    [source, stageKey, mirrored, onStageTap, playing, layout],
  );
  const openSave = useCallback(() => setSaving(true), []);
  const controlsDisabled = state.phase !== 'lead' && state.phase !== 'play';
  const controls = useMemo(
    () => (
      <RoundControls
        paused={paused}
        onTogglePause={togglePause}
        onRepeat={repeat}
        onSkip={skip}
        onFinish={finish}
        onSave={draft.trackId ? null : openSave}
        disabled={controlsDisabled}
        fullscreen={fullscreen}
        compact={fullscreen.on}
      />
    ),
    [paused, togglePause, repeat, skip, finish, draft.trackId, openSave, controlsDisabled, fullscreen],
  );

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Random Play Dance"
      tabIndex={-1}
      data-round-root
      onClick={onBackdropTap}
      // 54 · Full screen: only the picture and the round's bar, on black.
      className={cn(fullscreen.on ? FS_ROOT : ROOT, 'outline-none')}
    >
      <h1 className="sr-only">Random Play Dance</h1>
      {/* Outside the inert part: a region that only enters the tree as the first clip is announced is often missed. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      {/* Behind «¿Preparados?» and «Ronda terminada» the screen is inert: Tab and readers stay on the card. */}
      <div
        inert={overlay}
        className={cn(
          'mx-auto flex w-full min-w-0 flex-col justify-center',
          fullscreen.on ? 'h-full' : 'min-h-full max-w-[1800px]',
        )}
      >
        <RandomPlayScreen
          fullscreen={fullscreen.on}
          credit={credit}
          top={top}
          stage={stage}
          current={shownCard}
          upcoming={shownUpcoming}
          position={position}
          lead={shownLead}
          waiting={waiting}
          titleVisible={shownTitleVisible}
          nextVisible={options.titleMode === 'before'}
          paused={paused}
          notice={problem}
          controls={controls}
        />
      </div>

      <AnimatePresence>
        {overlay && (
          <motion.div
            key={state.phase}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-sumi-900/75 p-4 backdrop-blur-[3px]"
          >
            <motion.div
              initial={reduce ? false : { y: 16, scale: 0.97 }}
              animate={{ y: 0, scale: 1 }}
              transition={soft}
              className="paper-raised w-full max-w-md rounded-[16px] p-6 text-center sm:p-8"
            >
              {state.phase === 'idle' ? (
                <>
                  <Seal glyph="舞" size={52} stamp className="mx-auto" />
                  <h2 className="mt-3 font-display text-[28px] font-bold leading-tight">¿Preparados?</h2>
                  <p className="mt-2 text-[15px] text-washi-muted">
                    {total} clip{total === 1 ? '' : 's'} · {optionsSummary(options)}
                  </p>
                  {total === 0 ? (
                    <p className="mt-4 text-sm text-enji-300">Ninguno de estos clips está disponible.</p>
                  ) : (
                    <Button size="lg" className="mt-5 w-full" onClick={start} autoFocus data-autofocus>
                      <Play aria-hidden className="size-5" /> Empezar
                    </Button>
                  )}
                  <Button variant="ghost" className="mt-2 w-full" onClick={leave}>
                    Salir
                  </Button>
                </>
              ) : (
                <>
                  <Seal glyph="終" size={52} stamp className="mx-auto" />
                  <h2 className="mt-3 font-display text-[28px] font-bold leading-tight">Ronda terminada</h2>
                  <p className="mt-2 text-[15px] text-washi-muted">
                    {state.played} de {total} clip{total === 1 ? '' : 's'} bailados.
                  </p>
                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    <Button autoFocus onClick={() => restart(false)}>
                      <RotateCcw aria-hidden className="size-4.5" /> Otra vez
                    </Button>
                    <Button variant="secondary" onClick={() => restart(true)}>
                      <Shuffle aria-hidden className="size-4.5" /> Volver a mezclar
                    </Button>
                    {!draft.trackId && (
                      <Button variant="secondary" className="sm:col-span-2" onClick={() => setSaving(true)}>
                        <Save aria-hidden className="size-4.5" /> Guardar como pista
                      </Button>
                    )}
                    <Button variant="ghost" className="sm:col-span-2" onClick={leave}>
                      Salir
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog
        open={confirmExit && confirmReady}
        onClose={stayInRound}
        title="¿Salir de la ronda?"
        description="La ronda se para aquí. Puedes volver a empezarla desde Random Play Dance."
        size="sm"
        hideClose
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={stayInRound}>
            Seguir en la ronda
          </Button>
          <Button
            onClick={() => {
              pausedForExit.current = false;
              setConfirmExit(false);
              // After the dialog's own entry is gone: «Atrás» later doesn't land on a dead confirmation.
              leave();
            }}
          >
            <ArrowLeft aria-hidden className="size-4.5" /> Salir
          </Button>
        </div>
      </Dialog>

      {/* Preload: the next clip's own file buffers while this one plays (YouTube loads during the pause). */}
      <Preloader source={nextSource} current={source} />

      <SaveTrackDialog
        open={saving && saveReady}
        onClose={() => setSaving(false)}
        clipIds={draft.clipIds}
        options={roundOptions(options, draft.clipIds.length)}
        suggestedName={draft.from.startsWith('Bolsa') ? `RPD ${draft.from.replace(/^Bolsa\s*/, '')}` : ''}
        onSaved={(trackId) => setRoundDraft({ ...draft, trackId })}
      />
    </div>
  );
}
