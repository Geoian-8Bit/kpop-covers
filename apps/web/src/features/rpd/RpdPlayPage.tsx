import type { Clip } from '@coverscape/shared';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, Play, RotateCcw, Save, Shuffle } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { guardNav } from '@/components/AppShell';
import { Seal } from '@/components/Seal';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { useAllClips } from '@/data/bags';
import { useVideo } from '@/data/videos';
import { clipTone } from '@/features/bags/tones';
import type { ClipWithVideo } from '@/lib/backend';
import { cn } from '@/lib/cn';
import { tick, unlockAudio } from '@/lib/metronome';
import { soft } from '@/lib/motion';
import { useBackToClose } from '@/lib/useBackToClose';
import { loadYouTubeApi } from '@/lib/youtubeIframe';
import type { PlayerEngine } from '@/player/engine';
import { FileStage } from '@/player/FileStage';
import { usePlayer } from '@/player/store';
import { useLoopController } from '@/player/useLoopController';
import { YouTubeStage } from '@/player/YouTubeStage';
import { RandomPlayScreen, type PlayCard } from './RandomPlayScreen';
import { RoundControls } from './RoundControls';
import { setRoundDraft, useRoundDraft, type RoundDraft } from './roundDraft';
import {
  clipAnnouncement,
  clipEndAt,
  exitNeedsConfirm,
  followingPlayable,
  IDLE_ROUND,
  isLayerEntry,
  leaveFallback,
  leaveRoundBy,
  nextPlayable,
  optionsSummary,
  roundKeyAction,
  roundLeadStatus,
  roundReducer,
  shuffle,
  spreadBy,
  titleShown,
  type RoundAction,
  type RoundOptions,
  type RoundState,
} from './roundRules';
import { SaveTrackDialog } from './SaveTrackDialog';
import { releaseClipSources, useClipSource, type ClipSource } from './useClipSource';
import { useHistorySettled, WAIT_MS } from './useHistorySettled';

interface Entry {
  key: string;
  clip: ClipWithVideo | null;
}

/** F14 · /rpd/jugar: the round on a screen made to be seen from across the room. */
export function RpdPlayPage() {
  const draft = useRoundDraft((s) => s.draft);
  const clips = useAllClips();
  // Out here, above the runner's `key`: «Volver a mezclar» remounts the runner but stays in full screen.
  const fullscreen = useFullscreen();

  if (!draft || draft.clipIds.length === 0) {
    return (
      <Shell>
        <div className="grid min-h-[60dvh] place-items-center p-6 text-center">
          <div>
            <Seal glyph="舞" size={64} stamp />
            <h1 className="mt-5 font-display text-2xl font-bold">No hay ninguna ronda preparada</h1>
            <p className="mt-2 text-washi-muted">Crea una ronda o abre una pista guardada.</p>
            <Link
              to="/rpd"
              onClick={guardNav}
              className="mt-6 inline-flex h-12 items-center rounded-[10px] bg-washi px-5 font-bold text-sumi-900"
            >
              Ir a Random Play Dance
            </Link>
          </div>
        </div>
      </Shell>
    );
  }
  if (!clips.data) {
    return (
      <Shell>
        <div className="grid min-h-[60dvh] place-items-center" role="status">
          {clips.isError ? (
            <div className="text-center">
              <p className="text-washi-muted">No se pudieron cargar los clips.</p>
              <Button className="mt-3" variant="secondary" onClick={() => void clips.refetch()}>
                Reintentar
              </Button>
            </div>
          ) : (
            <Spinner className="size-8 text-kin-300" label="Cargando la ronda" />
          )}
        </div>
      </Shell>
    );
  }
  return (
    <RoundRunner
      key={`${draft.mix ?? 0}:${draft.clipIds.join(',')}`}
      draft={draft}
      all={clips.data}
      fullscreen={fullscreen}
    />
  );
}

/**
 * The round covers the whole app: everything outside it is made inert (keyboard and screen readers stay inside;
 * Tab can't reach the navigation hidden underneath) and restored on leaving. The toast host stays live: the round
 * still says «Guardado» or an error through it.
 */
function useInertOutside(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const touched: HTMLElement[] = [];
    let node: HTMLElement | null = ref.current;
    while (node && node.parentElement && node !== document.body) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert && !sibling.hasAttribute('data-toast-host')) {
          sibling.inert = true;
          touched.push(sibling);
        }
      }
      node = node.parentElement;
    }
    return () => {
      for (const el of touched) el.inert = false;
    };
  }, [ref]);
}

function Shell({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useInertOutside(ref);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Random Play Dance"
      className={ROOT}
    >
      {children}
    </div>
  );
}

/** The round's own layer: the app's seigaiha ground (not a black box), clear of the notch and the home bar. */
const ROOT =
  'seigaiha fixed inset-0 z-[45] overflow-y-auto pb-[max(8px,env(safe-area-inset-bottom))] pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] pt-[max(8px,env(safe-area-inset-top))]';

function toCard(entry: Entry): PlayCard | null {
  const clip = entry.clip;
  if (!clip) return null;
  return {
    key: entry.key,
    title: clip.video?.title ?? 'Sin título',
    artist: clip.video?.artist ?? null,
    clipName: clip.name,
    tone: clipTone(clip.color),
  };
}

/**
 * The whole page goes full screen, not the round's layer: dialogs («¿Salir de la ronda?», «Guardar como pista») and
 * the toasts are mounted in `body`, and only what is inside the full-screen element gets painted. The round is
 * already `fixed inset-0` over the app, so it still fills the screen. Leaving the round's page leaves full screen too
 * (a new mix of the same round doesn't: the hook lives in the page, not in the runner it remounts).
 */
type Fullscreen = { on: boolean; toggle: () => void } | null;

function useFullscreen(): Fullscreen {
  const [on, setOn] = useState(false);
  const ours = useRef(false);
  useEffect(() => {
    const sync = () => {
      const now = document.fullscreenElement != null;
      if (!now) ours.current = false;
      setOn(now);
    };
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      if (ours.current && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else {
      const request = document.documentElement.requestFullscreen?.();
      if (request) {
        ours.current = true;
        void request.catch(() => {
          ours.current = false;
        });
      }
    }
  }, []);
  const supported = typeof document !== 'undefined' && Boolean(document.documentElement.requestFullscreen);
  return supported ? { on, toggle } : null;
}

function RoundRunner({
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
  const options = draft.options;
  const byId = useMemo(() => new Map(all.map((c) => [c.id, c])), [all]);
  const entries = useMemo<Entry[]>(
    () => draft.clipIds.map((id, i) => ({ key: `${i}-${id}`, clip: byId.get(id) ?? null })),
    [draft.clipIds, byId],
  );
  const available = useMemo(() => entries.map((e) => Boolean(e.clip?.video)), [entries]);
  const ctx = useRef({ available, options });
  ctx.current = { available, options };
  const [state, dispatch] = useReducer(
    (s: RoundState, a: RoundAction) => roundReducer(s, a, ctx.current),
    IDLE_ROUND,
  );
  const [saving, setSaving] = useState(false);
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  useInertOutside(rootRef);

  useLoopController();
  const prefMirror = useRef(true);
  useLayoutEffect(() => {
    usePlayer.getState().reset();
    prefMirror.current = usePlayer.getState().mirrored;
    void loadYouTubeApi().catch(() => undefined);
    return () => {
      usePlayer.getState().reset();
      releaseClipSources();
    };
  }, []);

  const current = state.index >= 0 ? entries[state.index] : undefined;
  const clip = current?.clip ?? null;
  const video = useVideo(clip?.video_id);
  const source = useClipSource(video.data);
  const nextIndex =
    state.phase === 'idle'
      ? nextPlayable(available, 0)
      : state.index >= 0
        ? followingPlayable(available, state.index)
        : -1;
  const nextClip = nextIndex >= 0 ? entries[nextIndex]?.clip : null;
  const nextVideo = useVideo(nextClip?.video_id);
  const nextSource = useClipSource(nextVideo.data);

  // ── The stage: which media is mounted, and when its engine is really this media's ──
  const stageKey =
    clip && source.status === 'youtube'
      ? `${clip.video_id}:yt:${source.youtubeId}`
      : clip && source.status === 'file'
        ? `${clip.video_id}:file:${source.url}`
        : null;
  const engine = usePlayer((s) => s.engine);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const staleEngine = useRef<PlayerEngine | null>(null);
  useLayoutEffect(() => {
    // Another song: forget the old engine (and its length) before the new one attaches. The old media's error
    // goes too, even when it never got an engine (a file that failed to load, YouTube not answering): left behind,
    // it would skip every clip after it.
    const player = usePlayer.getState();
    staleEngine.current = player.engine;
    setReadyKey(null);
    if (staleEngine.current) player.reset();
    else if (player.error) player.sync({ error: null });
  }, [stageKey]);
  useEffect(() => {
    if (stageKey && engine && engine !== staleEngine.current) setReadyKey(stageKey);
  }, [engine, stageKey]);
  const stageReady = stageKey != null && readyKey === stageKey;

  // ── Clock for the lead-in ──
  const [now, setNow] = useState(() => performance.now());
  const leading = state.phase === 'lead' && state.pausedAt == null;
  useEffect(() => {
    if (!leading) return;
    const id = window.setInterval(() => setNow(performance.now()), 80);
    return () => window.clearInterval(id);
  }, [leading]);
  const lead = roundLeadStatus(state, leading ? Math.max(now, state.leadStart) : now);

  // ── Put the clip on (paused, at its start) as soon as its media is ready ──
  const leadKey = `${state.index}:${state.leadStart}`;
  const applied = useRef<string | null>(null);
  // Tied to its clip: the next clip (even of the same song, when its own notice is set in the same commit) never
  // inherits it, and nothing has to clear it on the way.
  const [notice, setNotice] = useState<{ index: number; text: string } | null>(null);
  const noticeText = notice?.index === state.index ? notice.text : null;
  useEffect(() => {
    if (state.phase !== 'lead' || !clip || !stageReady || applied.current === leadKey) return;
    const player = usePlayer.getState();
    player.pause();
    const settings: Pick<Clip, 'id' | 'start_seconds' | 'end_seconds' | 'speed' | 'mirrored'> =
      options.useClipSettings ? clip : { ...clip, speed: 1, mirrored: prefMirror.current };
    const ok = player.applyClip(settings, { autoplay: false });
    applied.current = leadKey;
    if (!ok) {
      setNotice({ index: state.index, text: 'Este clip queda fuera de su vídeo: se salta' });
      return;
    }
    setNotice(null);
    // The round moves on at the clip's end: no A–B loop wrapping back.
    if (usePlayer.getState().loop.enabled) usePlayer.getState().toggleLoop();
  }, [state.phase, state.index, clip, stageReady, leadKey, options.useClipSettings]);

  // ── Go: lead-in over and clip ready (and not paused: a pause while «Cargando el clip…» holds it) ──
  const goPending = lead?.phase === 'go';
  const paused = state.pausedAt != null;
  useEffect(() => {
    if (!goPending || paused || applied.current !== leadKey || noticeText || !stageReady) return;
    dispatch({ type: 'go' });
    usePlayer.getState().play();
  }, [goPending, paused, leadKey, noticeText, stageReady]);

  // Count-in ticks, when the studio's count sound is on.
  const count = lead?.phase === 'countdown' ? lead.count : null;
  useEffect(() => {
    if (count != null && usePlayer.getState().countSound) tick(false);
  }, [count]);

  // ── The clip's end: on to the next one ──
  useEffect(() => {
    if (state.phase !== 'play' || !clip) return;
    const end = clip.end_seconds;
    return usePlayer.subscribe((s) => {
      if (!s.playing || s.engine == null) return;
      if (s.time >= clipEndAt(end, s.duration)) {
        s.pause();
        dispatch({ type: 'advance', now: performance.now() });
      }
    });
  }, [state.phase, state.leadStart, clip]);

  // ── Problems: a song that can't play, or a clip outside its video → skip it ──
  const playerError = usePlayer((s) => s.error);
  // A failed background refetch keeps the song it already had (isError with data): that one still plays.
  const missing =
    clip != null &&
    (source.status === 'missing' || (video.isError && !video.data) || (video.isFetched && video.data == null));
  const problem =
    noticeText ??
    (missing
      ? 'Este vídeo no se puede reproducir aquí: se salta'
      : playerError && state.phase !== 'idle' && state.phase !== 'done'
        ? 'No se pudo reproducir: se salta'
        : null);
  // The skip waits while the round is paused, and gets its full time again on resuming.
  useEffect(() => {
    if (!problem || paused || state.phase === 'idle' || state.phase === 'done') return;
    const id = window.setTimeout(() => {
      setNotice(null);
      usePlayer.getState().pause();
      dispatch({ type: 'advance', now: performance.now() });
    }, 2200);
    return () => window.clearTimeout(id);
  }, [problem, paused, state.phase, state.index]);

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
  }, []);
  const togglePause = useCallback(() => {
    if (state.phase !== 'lead' && state.phase !== 'play') return;
    if (state.pausedAt != null) {
      dispatch({ type: 'resume', now: performance.now() });
      if (state.phase === 'play') usePlayer.getState().play();
    } else {
      dispatch({ type: 'pause', now: performance.now() });
      usePlayer.getState().pause();
    }
  }, [state.phase, state.pausedAt]);
  const repeat = useCallback(() => {
    if (!clip) return;
    const player = usePlayer.getState();
    player.pause();
    player.seek(clip.start_seconds);
    applied.current = null;
    dispatch({ type: 'repeat', now: performance.now() });
  }, [clip]);
  const skip = useCallback(() => {
    usePlayer.getState().pause();
    dispatch({ type: 'advance', now: performance.now() });
  }, []);
  const finish = useCallback(() => {
    usePlayer.getState().pause();
    dispatch({ type: 'finish' });
  }, []);
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
    [draft, byId],
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
      // Mid-round it pauses and asks, like «Salir»; on «¿Preparados?» and «Ronda terminada» it does nothing
      // (an Esc by mistake doesn't throw the round away). In full screen the browser keeps Esc to leave full screen.
      else if (action === 'exit' && exitNeedsConfirm(state.phase) && !document.fullscreenElement) {
        e.preventDefault();
        exit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePause, skip, repeat, exit, state.phase, saving, confirmExit, leaving]);

  // ── What the screen shows ──
  const total = available.filter(Boolean).length;
  const position = {
    index: state.index >= 0 ? available.slice(0, state.index + 1).filter(Boolean).length : 0,
    total,
  };
  const upcoming: PlayCard[] = [];
  for (let i = nextIndex; i >= 0 && upcoming.length < 4; i = followingPlayable(available, i)) {
    const card = toCard(entries[i]!);
    if (card) upcoming.push(card);
  }
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
  const shownCard = current ? toCard(current) : (upcoming[0] ?? null);
  // Modo adivinar: once revealed, the title stays for the rest of this clip (a pause no longer hides it again).
  const [revealedFor, setRevealedFor] = useState<string | null>(null);
  if (titleVisible && state.phase === 'play' && revealedFor !== leadKey) setRevealedFor(leadKey);
  const shownTitleVisible =
    state.phase === 'idle'
      ? options.titleMode === 'before'
      : titleVisible || (state.phase === 'play' && revealedFor === leadKey);
  const announcement =
    state.phase === 'lead' || state.phase === 'play'
      ? clipAnnouncement(position, shownCard?.title ?? null, !shownTitleVisible)
      : '';

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Random Play Dance"
      tabIndex={-1}
      className={cn(ROOT, 'outline-none')}
    >
      <h1 className="sr-only">Random Play Dance</h1>
      {/* Outside the inert part: a region that only enters the tree as the first clip is announced is often missed. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      {/* Behind «¿Preparados?» and «Ronda terminada» the screen is inert: Tab and readers stay on the card. */}
      <div inert={overlay} className="mx-auto flex min-h-full w-full max-w-[1800px] min-w-0 flex-col justify-center">
        <RandomPlayScreen
          top={
            <div className="flex min-w-0 items-center gap-2">
              <Button variant="ghost" size="sm" className="-ml-1 h-11 shrink-0 px-2.5 text-[14px]" onClick={exit}>
                <ArrowLeft aria-hidden className="size-4.5" /> Salir
              </Button>
              <p className="min-w-0 flex-1 truncate text-[13px] text-washi-muted xl:text-base">
                {draft.from || 'Ronda'}
                {unavailable > 0 && ` · ${unavailable} no disponible${unavailable === 1 ? '' : 's'} (se saltan)`}
              </p>
            </div>
          }
          stage={
            <RoundStage
              source={source}
              stageKey={stageKey}
              mirrored={mirrored}
              onToggle={togglePause}
              playing={state.phase === 'play' && !paused}
            />
          }
          current={shownCard}
          upcoming={state.phase === 'idle' ? upcoming.slice(1) : upcoming}
          position={position}
          lead={state.phase === 'lead' ? lead : null}
          waiting={waiting}
          titleVisible={shownTitleVisible}
          nextVisible={options.titleMode === 'before'}
          paused={paused}
          notice={problem}
          controls={
            <RoundControls
              paused={paused}
              onTogglePause={togglePause}
              onRepeat={repeat}
              onSkip={skip}
              onFinish={finish}
              onSave={draft.trackId ? null : () => setSaving(true)}
              disabled={state.phase !== 'lead' && state.phase !== 'play'}
              fullscreen={fullscreen}
            />
          }
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

function roundOptions(options: RoundOptions, count: number): RoundOptions {
  return { ...options, count };
}

function Preloader({ source, current }: { source: ClipSource; current: ClipSource }) {
  if (source.status !== 'file' || (current.status === 'file' && current.url === source.url)) return null;
  return <video aria-hidden src={source.url} preload="auto" muted playsInline className="hidden" />;
}

/** The app's own player (YouTube or the file), flipped for the mirror, with a tap-to-pause cover. */
function RoundStage({
  source,
  stageKey,
  mirrored,
  onToggle,
  playing,
}: {
  source: ClipSource;
  stageKey: string | null;
  mirrored: boolean;
  onToggle: () => void;
  playing: boolean;
}) {
  return (
    <>
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{ scaleX: mirrored ? -1 : 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18, mass: 0.9 }}
      >
        {stageKey && source.status === 'youtube' ? (
          <YouTubeStage key={stageKey} videoId={source.youtubeId} />
        ) : stageKey && source.status === 'file' ? (
          <FileStage key={stageKey} src={source.url} offset={source.offset} />
        ) : null}
      </motion.div>
      {!stageKey && (
        <div className="absolute inset-0 grid place-items-center" aria-hidden>
          <Spinner className="size-8 text-washi-subtle" />
        </div>
      )}
      <button
        type="button"
        aria-label={playing ? 'Pausar' : 'Seguir'}
        onClick={onToggle}
        className={cn('absolute inset-0 z-10 cursor-pointer')}
      />
    </>
  );
}
