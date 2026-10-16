import type { Clip } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Play, RotateCcw, Save, Shuffle } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { guardNav } from '@/components/AppShell';
import { Seal } from '@/components/Seal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useAllClips } from '@/data/bags';
import { useVideo } from '@/data/videos';
import { clipTone } from '@/features/bags/tones';
import { useDesignVariant } from '@/features/lab/designLab';
import type { ClipWithVideo } from '@/lib/backend';
import { cn } from '@/lib/cn';
import { tick, unlockAudio } from '@/lib/metronome';
import { soft } from '@/lib/motion';
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
  clipEndAt,
  followingPlayable,
  IDLE_ROUND,
  nextPlayable,
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

interface Entry {
  key: string;
  clip: ClipWithVideo | null;
}

/** F14 · /rpd/jugar: the round on a screen made to be seen from across the room. */
export function RpdPlayPage() {
  const draft = useRoundDraft((s) => s.draft);
  const clips = useAllClips();

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
              className="mt-6 inline-flex h-11 items-center rounded-[10px] bg-washi px-5 font-bold text-sumi-900"
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
  return <RoundRunner key={draft.clipIds.join(',')} draft={draft} all={clips.data} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[45] overflow-y-auto bg-sumi-950">{children}</div>;
}

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

function useFullscreen(ref: React.RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [ref]);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void ref.current?.requestFullscreen?.().catch(() => undefined);
  }, [ref]);
  const supported = typeof document !== 'undefined' && Boolean(document.documentElement.requestFullscreen);
  return supported ? { on, toggle } : null;
}

function RoundRunner({ draft, all }: { draft: RoundDraft; all: ClipWithVideo[] }) {
  const navigate = useNavigate();
  const variant = useDesignVariant('random-play');
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
  const rootRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(rootRef);

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
    // Another song: forget the old engine (and its length) before the new one attaches.
    staleEngine.current = usePlayer.getState().engine;
    setReadyKey(null);
    if (staleEngine.current) usePlayer.getState().reset();
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
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (state.phase !== 'lead' || !clip || !stageReady || applied.current === leadKey) return;
    const player = usePlayer.getState();
    player.pause();
    const settings: Pick<Clip, 'id' | 'start_seconds' | 'end_seconds' | 'speed' | 'mirrored'> =
      options.useClipSettings ? clip : { ...clip, speed: 1, mirrored: prefMirror.current };
    const ok = player.applyClip(settings, { autoplay: false });
    applied.current = leadKey;
    if (!ok) {
      setNotice('Este clip queda fuera de su vídeo: se salta');
      return;
    }
    // The round moves on at the clip's end: no A–B loop wrapping back.
    if (usePlayer.getState().loop.enabled) usePlayer.getState().toggleLoop();
  }, [state.phase, clip, stageReady, leadKey, options.useClipSettings]);

  // ── Go: lead-in over and clip ready ──
  const goPending = lead?.phase === 'go';
  useEffect(() => {
    if (!goPending || applied.current !== leadKey || notice || !stageReady) return;
    dispatch({ type: 'go' });
    usePlayer.getState().play();
  }, [goPending, leadKey, notice, stageReady]);

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
  const missing =
    clip != null && (source.status === 'missing' || video.isError || (video.isFetched && video.data == null));
  const problem =
    notice ??
    (missing
      ? 'Este vídeo no se puede reproducir aquí: se salta'
      : playerError && state.phase !== 'idle' && state.phase !== 'done'
        ? 'No se pudo reproducir: se salta'
        : null);
  useEffect(() => {
    if (!problem || state.phase === 'idle' || state.phase === 'done') return;
    const id = window.setTimeout(() => {
      setNotice(null);
      usePlayer.getState().pause();
      dispatch({ type: 'advance', now: performance.now() });
    }, 2200);
    return () => window.clearTimeout(id);
  }, [problem, state.phase, state.index]);
  useEffect(() => setNotice(null), [state.index]);

  // ── Controls ──
  const paused = state.pausedAt != null;
  const start = useCallback(() => {
    unlockAudio();
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
        setRoundDraft({ ...draft, clipIds: order });
        return; // a new list remounts the runner
      }
      unlockAudio();
      dispatch({ type: 'start', now: performance.now() });
    },
    [draft, byId],
  );

  // Keyboard, for a laptop by the TV: space pauses, → skips, R repeats.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (saving || target?.closest('input, textarea, select, [role="dialog"]')) return;
      if (e.key === ' ' && !target?.closest('button')) {
        e.preventDefault();
        togglePause();
      } else if (e.key === 'ArrowRight') skip();
      else if (e.key === 'r' || e.key === 'R') repeat();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePause, skip, repeat, saving]);

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

  return (
    <div ref={rootRef} className="fixed inset-0 z-[45] overflow-y-auto bg-sumi-950">
      <div className="mx-auto flex min-h-full w-full max-w-[min(1500px,max(560px,calc((100dvh-460px)*16/9)))] min-w-0 flex-col px-3 pb-4 pt-2 sm:px-5 sm:pt-3 [@media(max-aspect-ratio:4/3)]:max-w-[1500px]">
        <div className="mb-2 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-11 px-2.5" onClick={() => navigate('/rpd')}>
            <ArrowLeft aria-hidden className="size-4.5" /> Salir
          </Button>
          <p className="min-w-0 flex-1 truncate text-[13px] text-washi-subtle">
            {draft.from || 'Ronda'}
            {unavailable > 0 && ` · ${unavailable} no disponible${unavailable === 1 ? '' : 's'} (se saltan)`}
          </p>
          {!draft.trackId && (
            <Button variant="ghost" size="sm" className="h-11 px-2.5" onClick={() => setSaving(true)}>
              <Save aria-hidden className="size-4" /> Guardar como pista
            </Button>
          )}
        </div>

        <h1 className="sr-only">Random Play Dance</h1>
        <div className="relative min-h-0 flex-1">
          <RandomPlayScreen
            variant={variant}
            stage={
              <RoundStage
                source={source}
                stageKey={stageKey}
                mirrored={mirrored}
                onToggle={togglePause}
                playing={state.phase === 'play' && !paused}
              />
            }
            current={current ? toCard(current) : (upcoming[0] ?? null)}
            upcoming={state.phase === 'idle' ? upcoming.slice(1) : upcoming}
            position={position}
            lead={state.phase === 'lead' ? lead : null}
            waiting={waiting}
            titleVisible={state.phase === 'idle' ? options.titleMode === 'before' : titleVisible}
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
                disabled={state.phase !== 'lead' && state.phase !== 'play'}
                fullscreen={fullscreen}
              />
            }
          />
          <AnimatePresence>
            {(state.phase === 'idle' || state.phase === 'done') && (
              <motion.div
                key={state.phase}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                className="absolute inset-0 z-40 grid place-items-center rounded-[12px] bg-sumi-950/90 p-4 backdrop-blur-[2px]"
              >
                <motion.div
                  initial={{ y: 16, scale: 0.97 }}
                  animate={{ y: 0, scale: 1 }}
                  transition={soft}
                  className="paper-raised w-full max-w-md rounded-[16px] p-6 text-center sm:p-8"
                >
                  {state.phase === 'idle' ? (
                    <>
                      <Seal glyph="舞" size={56} stamp className="mx-auto" />
                      <h2 className="mt-4 font-display text-[26px] font-bold leading-tight">¿Preparados?</h2>
                      <p className="mt-2 text-[15px] text-washi-muted">
                        {total} clip{total === 1 ? '' : 's'} · pausa de {options.pauseSeconds} s
                        {options.countdown ? ' · cuenta atrás' : ''}
                        {options.titleMode === 'after' ? ' · modo adivinar' : ''}
                      </p>
                      {total === 0 ? (
                        <p className="mt-4 text-sm text-enji-300">Ninguno de estos clips está disponible.</p>
                      ) : (
                        <Button size="lg" className="mt-6 w-full" onClick={start}>
                          <Play aria-hidden className="size-5" /> Empezar
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <Seal glyph="終" size={56} stamp className="mx-auto" />
                      <h2 className="mt-4 font-display text-[26px] font-bold leading-tight">
                        Ronda terminada
                      </h2>
                      <p className="mt-2 text-[15px] text-washi-muted">
                        {state.played} de {total} clip{total === 1 ? '' : 's'} bailados.
                      </p>
                      <div className="mt-6 grid gap-2 sm:grid-cols-2">
                        <Button onClick={() => restart(false)}>
                          <RotateCcw aria-hidden className="size-4.5" /> Otra vez
                        </Button>
                        <Button variant="secondary" onClick={() => restart(true)}>
                          <Shuffle aria-hidden className="size-4.5" /> Volver a mezclar
                        </Button>
                        {!draft.trackId && (
                          <Button
                            variant="secondary"
                            className="sm:col-span-2"
                            onClick={() => setSaving(true)}
                          >
                            <Save aria-hidden className="size-4.5" /> Guardar como pista
                          </Button>
                        )}
                        <Button variant="ghost" className="sm:col-span-2" onClick={() => navigate('/rpd')}>
                          Salir
                        </Button>
                      </div>
                    </>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Preload: the next clip's own file buffers while this one plays (YouTube loads during the pause). */}
      <Preloader source={nextSource} current={source} />

      <SaveTrackDialog
        open={saving}
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
