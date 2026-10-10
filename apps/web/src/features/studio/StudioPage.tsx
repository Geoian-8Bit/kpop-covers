import {
  formatSpeed,
  formatTime,
  round3,
  SPEED_PRESETS,
  youTubeWatchUrl,
  type Clip,
  type Video,
} from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  FileVideo,
  FlipHorizontal2,
  Keyboard,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Page } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { CLIP_SWATCH, useClips } from '@/data/clips';
import { signedVideoUrl, useLinkLocalFile, useUpdateVideo, useVideo } from '@/data/videos';
import { loadLocalVideo } from '@/lib/localVideos';
import { scheduleCountIn } from '@/lib/metronome';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { FileStage } from '@/player/FileStage';
import { hasRange, usePlayer } from '@/player/store';
import { useLoopController } from '@/player/useLoopController';
import { YouTubeStage } from '@/player/YouTubeStage';
import { useToast } from '@/providers/ToastProvider';
import { ClipList } from './ClipList';
import { SaveClipDialog } from './SaveClipDialog';
import { ShortcutsDialog } from './ShortcutsDialog';
import { assignLanes, Timeline } from './Timeline';
import { GapPicker, PlayerBar, useLongPress } from './Transport';
import { useShortcuts } from './useShortcuts';

export function StudioPage() {
  const { videoId } = useParams();
  const video = useVideo(videoId);
  const clips = useClips(videoId);
  const toast = useToast();
  const { mutate: patchVideo } = useUpdateVideo();
  const [saving, setSaving] = useState(false);
  const [help, setHelp] = useState(false);
  const [params, setParams] = useSearchParams();
  const clipParam = params.get('clip');
  const ready = usePlayer((s) => s.ready);
  const duration = usePlayer((s) => s.duration);

  useLoopController();

  // Reset only on cleanup: child stages attach their engine in effects that run *before* this
  // parent effect, so resetting on mount could wipe a freshly attached engine.
  useEffect(() => () => usePlayer.getState().reset(), [videoId]);

  const openSave = useCallback(() => {
    if (!hasRange(usePlayer.getState().loop)) {
      toast('Marca A y B en la línea de tiempo primero', 'info');
      return;
    }
    setSaving(true);
  }, [toast]);
  const openHelp = useCallback(() => setHelp(true), []);
  useShortcuts({ onSave: openSave, onHelp: openHelp, enabled: !saving && !help });

  const applyClip = useCallback((clip: Clip) => usePlayer.getState().applyClip(clip), []);

  // Deep link from quick access: /v/:id?clip=<clipId>
  useEffect(() => {
    if (!ready || !clipParam || !clips.data) return;
    const clip = clips.data.find((c) => c.id === clipParam);
    if (clip) usePlayer.getState().applyClip(clip);
    setParams(
      (prev) => {
        prev.delete('clip');
        return prev;
      },
      { replace: true },
    );
  }, [ready, clipParam, clips.data, setParams]);

  // First time a file/stream reports its length, remember it for the library cards.
  const current = video.data;
  useEffect(() => {
    if (current && duration > 0 && !current.duration_seconds) {
      patchVideo({ id: current.id, patch: { duration_seconds: round3(duration) } });
    }
  }, [current, duration, patchVideo]);

  if (video.isPending) {
    return (
      <div className="grid min-h-[70dvh] place-items-center">
        <Spinner className="size-9 text-washi-muted" />
      </div>
    );
  }

  if (!current) {
    return (
      <Page className="mx-auto max-w-lg px-5 py-24 text-center">
        <h1 className="font-display text-3xl font-bold">Vídeo no encontrado</h1>
        <p className="mt-2 text-washi-muted">Puede que alguien del grupo lo haya borrado.</p>
        <Link to="/" className="mt-6 inline-block font-medium text-kin-300 hover:underline">
          Volver a la biblioteca
        </Link>
      </Page>
    );
  }

  return (
    <Page className="px-2.5 pb-16 pt-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-[1500px] rounded-[10px] sm:rounded-[12px]">
        {/* Title bar */}
        <div className="sep-b flex items-center gap-3 px-4 py-4 sm:px-6">
          <Link
            to="/"
            aria-label="Volver a la biblioteca"
            className="grid size-11 shrink-0 place-items-center rounded-[10px] border border-line-strong bg-sumi-800 text-washi-muted transition-colors hover:border-washi/40 hover:text-washi"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[20px] font-bold leading-tight sm:text-[26px]">
              {current.title}
            </h1>
            <p className="truncate text-sm text-washi-muted">
              {current.artist || 'Artista sin especificar'} ·{' '}
              {current.source === 'youtube' ? 'YouTube' : current.file_name}
            </p>
          </div>
          {current.source === 'youtube' && current.youtube_id && (
            <a
              href={youTubeWatchUrl(current.youtube_id)}
              target="_blank"
              rel="noreferrer"
              aria-label="Abrir en YouTube"
              className="hidden size-11 place-items-center rounded-[10px] border border-line-strong bg-sumi-800 text-washi-muted hover:text-washi sm:grid"
            >
              <ExternalLink className="size-4.5" />
            </a>
          )}
          <Button
            variant="secondary"
            size="icon"
            aria-label="Atajos de teclado"
            onClick={openHelp}
            className="max-sm:hidden"
          >
            <Keyboard className="size-5" />
          </Button>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Work area */}
          <div className="min-w-0">
            {/* On phones the stage stays pinned under the top bar while the controls scroll. */}
            <div className="sticky top-16 z-20 rounded-t-[9px] bg-sumi-850 px-2.5 pb-2.5 pt-2.5 shadow-[0_12px_18px_-12px_rgb(0_0_0/0.85)] sm:static sm:rounded-none sm:bg-transparent sm:px-5 sm:pb-1 sm:pt-5 sm:shadow-none">
              <MediaStage video={current} clips={clips.data ?? []} onClipSelect={applyClip} />
            </div>
            <Timeline seed={current.id} clips={clips.data ?? []} onClipSelect={applyClip} />
            <PlayerBar onSaveClip={openSave} />
          </div>

          {/* Clips column */}
          <div className="sep-t lg:sep-l">
            <ClipList
              clips={clips.data ?? []}
              loading={clips.isPending}
              onApply={applyClip}
              onNew={openSave}
            />
          </div>
        </div>
      </div>

      <SaveClipDialog
        open={saving}
        onClose={() => setSaving(false)}
        video={current}
        clipCount={clips.data?.length ?? 0}
      />
      <ShortcutsDialog open={help} onClose={() => setHelp(false)} />
    </Page>
  );
}

type FileSource = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; url: string };

function useFileSource(video: Video, reloadKey: number): FileSource {
  const [state, setState] = useState<FileSource>({ status: 'loading' });

  useEffect(() => {
    if (video.source !== 'upload') return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ status: 'loading' });

    void (async () => {
      const blob = await loadLocalVideo(video.id);
      if (cancelled) return;
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        setState({ status: 'ready', url: objectUrl });
        return;
      }
      if (video.storage_path) {
        const url = await signedVideoUrl(video.storage_path);
        if (cancelled) return;
        if (url) {
          setState({ status: 'ready', url });
          return;
        }
      }
      setState({ status: 'missing' });
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [video.id, video.source, video.storage_path, reloadKey]);

  return state;
}

function MediaStage({
  video,
  clips,
  onClipSelect,
}: {
  video: Video;
  clips: Clip[];
  onClipSelect: (clip: Clip) => void;
}) {
  const mirrored = usePlayer((s) => s.mirrored);
  const playing = usePlayer((s) => s.playing);
  const ready = usePlayer((s) => s.ready);
  const buffering = usePlayer((s) => s.buffering);
  const error = usePlayer((s) => s.error);
  const rate = usePlayer((s) => s.rate);
  const counting = usePlayer((s) => s.countdownEndsAt != null);
  const [reloadKey, setReloadKey] = useState(0);
  const file = useFileSource(video, reloadKey);
  const link = useLinkLocalFile();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);

  const missing = video.source === 'upload' && file.status === 'missing';
  const loading = !ready && !error && !missing;
  const { stageRef, fullscreen, toggleFullscreen } = useFullscreen();
  const [menuOpen, setMenuOpen] = useState(false);
  const chrome = useAutoHideChrome(fullscreen, playing, menuOpen);
  const pointerType = useRef<string>('mouse');
  const lastTap = useRef<{ at: number; timer?: ReturnType<typeof setTimeout> }>({ at: 0 });
  const [seekFlash, setSeekFlash] = useState<{ side: 'left' | 'right'; key: number } | null>(null);
  // Plain timer, not an animation callback, so the badge can never get stranded on screen.
  useEffect(() => {
    if (!seekFlash) return;
    const id = setTimeout(() => setSeekFlash(null), 650);
    return () => clearTimeout(id);
  }, [seekFlash]);

  /**
   * Mouse / desktop: click toggles playback. Touch in fullscreen (YouTube-style): one tap shows/hides the
   * controls, a double tap on the left or right side jumps 5 s, in the middle it plays/pauses.
   */
  function onStageClick(event: React.MouseEvent<HTMLButtonElement>) {
    const player = usePlayer.getState();
    if (!fullscreen || pointerType.current !== 'touch') {
      player.togglePlay();
      chrome.wake();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const now = performance.now();
    const tap = lastTap.current;
    if (now - tap.at < 300) {
      clearTimeout(tap.timer);
      tap.at = 0;
      if (x < 0.4) {
        player.nudge(-5);
        setSeekFlash({ side: 'left', key: now });
      } else if (x > 0.6) {
        player.nudge(5);
        setSeekFlash({ side: 'right', key: now });
      } else {
        player.togglePlay();
      }
      return;
    }
    tap.at = now;
    tap.timer = setTimeout(() => chrome.toggle(), 280);
  }

  async function onPick(picked: File | undefined) {
    if (!picked) return;
    try {
      await link.mutateAsync({ video, file: picked });
      toast('Archivo vinculado en este dispositivo', 'success');
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  }

  return (
    <div
      ref={stageRef}
      className={cn(
        fullscreen && 'fixed inset-0 z-[70] grid place-items-center bg-black',
        fullscreen && !chrome.visible && 'cursor-none',
      )}
    >
      <div
        className={cn(
          'relative aspect-video w-full overflow-hidden bg-black',
          fullscreen
            ? 'max-h-dvh max-w-[calc(100dvh*16/9)]'
            : 'rounded-[12px] shadow-[0_0_0_1px_rgb(243_236_223/0.16),0_0_0_5px_var(--color-sumi-850),0_0_0_6px_var(--color-rule),0_20px_40px_-24px_rgb(0_0_0/0.95)]',
        )}
      >
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={{ scaleX: mirrored ? -1 : 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18, mass: 0.9 }}
        >
          {video.source === 'youtube' && video.youtube_id ? (
            <YouTubeStage videoId={video.youtube_id} />
          ) : file.status === 'ready' ? (
            <FileStage src={file.url} />
          ) : null}
        </motion.div>

        {/* Click-catcher keeps YouTube's own UI from intercepting and toggles playback. */}
        <button
          type="button"
          data-stage
          aria-label={playing ? 'Pausar' : 'Reproducir'}
          onPointerDown={(e) => (pointerType.current = e.pointerType)}
          onClick={onStageClick}
          disabled={!ready}
          className="absolute inset-0 z-10 cursor-pointer rounded-[12px] disabled:cursor-default"
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3.5">
          <AnimatePresence>
            {rate !== 1 && (
              <motion.span
                key="rate"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={jelly}
                className="tabular ml-auto rounded-[8px] bg-sumi-950/85 px-2.5 py-1.5 font-mono text-sm font-semibold text-washi"
              >
                {formatSpeed(rate)}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/*
          Always mounted and driven by a CSS transition: YouTube fires PAUSED/BUFFERING/PLAYING in quick
          bursts and a mount/unmount exit animation could get stranded mid-way, leaving the icon stuck.
          In fullscreen it also fades out together with the controls.
        */}
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 z-20 m-auto grid size-20 place-items-center rounded-full bg-washi text-sumi-900 shadow-[0_16px_30px_-14px_rgb(0_0_0/0.9)] transition-[opacity,scale] duration-200 ease-out',
            ready && !playing && !counting && !error && (!fullscreen || chrome.visible)
              ? 'scale-100 opacity-100'
              : 'scale-125 opacity-0',
          )}
        >
          <Play className="ml-1 size-8 fill-sumi-900" />
        </div>

        {(loading || (buffering && playing)) && (
          <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
            <Spinner className="size-10 text-washi" label="Cargando vídeo" />
          </div>
        )}

        <Countdown />

        {missing && (
          <div className="seigaiha absolute inset-0 z-30 grid place-items-center p-6 text-center">
            <div className="paper-raised max-w-sm rounded-[16px] p-6">
              <FileVideo className="mx-auto size-8 text-kin-300" />
              <p className="mt-3 font-display text-lg font-bold">Este archivo está en otro dispositivo</p>
              <p className="mt-1.5 text-sm text-washi-muted">
                Pesaba demasiado para la nube. Elige tu copia de{' '}
                <span className="font-medium text-washi">{video.file_name}</span> para usarla aquí; los clips
                del grupo se aplican igual.
              </p>
              <input
                ref={input}
                type="file"
                accept="video/*,audio/*"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => void onPick(e.target.files?.[0])}
              />
              <Button className="mt-5" loading={link.isPending} onClick={() => input.current?.click()}>
                Vincular archivo
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-sumi-900/95 p-6 text-center">
            <div className="max-w-sm">
              <AlertTriangle className="mx-auto size-8 text-enji-300" />
              <p className="mt-3 font-medium">{error}</p>
            </div>
          </div>
        )}

        {!fullscreen && (
          <button
            type="button"
            aria-label="Pantalla completa"
            title="Pantalla completa (F)"
            onClick={() => void toggleFullscreen()}
            className="absolute bottom-3 right-3 z-20 grid size-10 place-items-center rounded-[8px] bg-sumi-950/80 text-washi transition-colors hover:bg-sumi-950"
          >
            <Maximize2 className="size-4.5" />
          </button>
        )}
      </div>
      {fullscreen && (
        <>
          <AnimatePresence>
            {seekFlash && (
              <motion.span
                key={seekFlash.key}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  'pointer-events-none absolute top-1/2 z-30 -translate-y-1/2 rounded-full bg-black/55 px-4 py-2 font-mono text-sm font-semibold text-washi',
                  seekFlash.side === 'left' ? 'left-[12%]' : 'right-[12%]',
                )}
              >
                {seekFlash.side === 'left' ? '−5 s' : '+5 s'}
              </motion.span>
            )}
          </AnimatePresence>
          <FullscreenBar
            visible={chrome.visible}
            onMenuChange={setMenuOpen}
            clips={clips}
            onClipSelect={onClipSelect}
            onExit={() => void toggleFullscreen()}
          />
        </>
      )}
    </div>
  );
}

/**
 * Fullscreen for the whole stage (video + mirror + overlays). Uses the Fullscreen API where it exists;
 * iPhone Safari only allows it on a bare <video>, so there we fall back to a fixed full-viewport layer.
 * `F` (useShortcuts) toggles it through a window event.
 */
function useFullscreen() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'none' | 'native' | 'css'>('none');

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (mode === 'css') {
      setMode('none');
      return;
    }
    const el = stageRef.current;
    if (el && document.fullscreenEnabled && el.requestFullscreen) {
      try {
        await el.requestFullscreen({ navigationUI: 'hide' });
        setMode('native');
        const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        void orientation.lock?.('landscape').catch(() => undefined);
        return;
      } catch {
        /* fall through to the CSS layer */
      }
    }
    setMode('css');
  }, [mode]);

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setMode((m) => (m === 'native' ? 'none' : m));
    };
    const onToggle = () => void toggleFullscreen();
    document.addEventListener('fullscreenchange', onChange);
    window.addEventListener('oneshoot:fullscreen', onToggle);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('oneshoot:fullscreen', onToggle);
    };
  }, [toggleFullscreen]);

  useEffect(() => {
    if (mode !== 'css') return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMode('none');
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [mode]);

  return { stageRef, fullscreen: mode !== 'none', toggleFullscreen };
}

/** Touch-friendly transport shown only in fullscreen; fades out while playing and nobody touches the screen. */
/**
 * Controls visibility in fullscreen, YouTube-style: shown on any activity, hidden after 2.5 s of
 * playback without input; always shown while paused.
 */
/** `hold` keeps the controls up (e.g. while a speed or pause menu is open). */
function useAutoHideChrome(active: boolean, playing: boolean, hold = false) {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (playingRef.current) setVisible(false);
    }, 2500);
  }, []);

  const wake = useCallback(() => {
    setVisible(true);
    schedule();
  }, [schedule]);

  const toggle = useCallback(() => {
    setVisible((v) => {
      if (!v) schedule();
      return !v;
    });
  }, [schedule]);

  useEffect(() => {
    if (!active) return;
    wake();
    const onMouse = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') wake();
    };
    window.addEventListener('pointermove', onMouse);
    window.addEventListener('keydown', wake);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('pointermove', onMouse);
      window.removeEventListener('keydown', wake);
    };
  }, [active, wake]);

  useEffect(() => {
    if (!playing) {
      clearTimeout(timer.current);
      setVisible(true);
    } else if (active) {
      schedule();
    }
  }, [playing, active, schedule]);

  // When a menu closes, start the hide countdown again from that moment.
  useEffect(() => {
    if (!hold && active) wake();
  }, [hold, active, wake]);

  return { visible: visible || !playing || hold, wake, toggle };
}

/** Thin YouTube-like progress line: scrub anywhere, A–B band in vermilion, saved clips as thin lines above. */
function FsProgress({ clips, onClipSelect }: { clips: Clip[]; onClipSelect: (clip: Clip) => void }) {
  const time = usePlayer((s) => s.time);
  const duration = usePlayer((s) => s.duration);
  const loop = usePlayer((s) => s.loop);
  const activeClipId = usePlayer((s) => s.activeClipId);
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [hover, setHover] = useState<number | null>(null);
  const layout = useMemo(() => assignLanes(clips, duration), [clips, duration]);

  const pct = (t: number) => (duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0);
  const fractionAt = (clientX: number) => {
    const rect = barRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };
  const seekTo = (clientX: number) => usePlayer.getState().seek(fractionAt(clientX) * duration);

  return (
    <div className="relative">
      {/* clip lines */}
      <div
        className="relative mb-1"
        style={{ height: Math.max(1, layout.count) * 7 }}
        aria-label="Clips guardados"
      >
        {duration > 0 &&
          clips.map((clip) => (
            <button
              key={clip.id}
              type="button"
              title={`${clip.name} · ${formatTime(clip.start_seconds)}–${formatTime(clip.end_seconds)}`}
              aria-label={`Reproducir clip ${clip.name}`}
              onClick={() => onClipSelect(clip)}
              className="group/clip absolute flex items-center"
              style={{
                left: `${pct(clip.start_seconds)}%`,
                width: `${Math.max(0.6, pct(clip.end_seconds) - pct(clip.start_seconds))}%`,
                top: (layout.lanes.get(clip.id) ?? 0) * 7,
                height: 7,
              }}
            >
              <span
                className={cn(
                  'block h-[3px] w-full rounded-full transition-[height,opacity] group-hover/clip:h-[5px]',
                  CLIP_SWATCH[clip.color].dot,
                  clip.id === activeClipId ? 'opacity-100' : 'opacity-70',
                )}
              />
            </button>
          ))}
      </div>

      <div
        ref={barRef}
        role="slider"
        tabIndex={0}
        aria-label="Progreso"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={formatTime(time)}
        onPointerDown={(e) => {
          if (!duration) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = true;
          usePlayer.getState().setScrubbing(true);
          seekTo(e.clientX);
        }}
        onPointerMove={(e) => {
          setHover(fractionAt(e.clientX));
          if (dragging.current) seekTo(e.clientX);
        }}
        onPointerUp={() => {
          dragging.current = false;
          usePlayer.getState().setScrubbing(false);
        }}
        onPointerCancel={() => {
          dragging.current = false;
          usePlayer.getState().setScrubbing(false);
        }}
        onPointerLeave={() => setHover(null)}
        className="group/bar relative flex h-5 cursor-pointer touch-none items-center"
      >
        <div className="relative h-[3px] w-full rounded-full bg-washi/25 transition-[height] duration-150 group-hover/bar:h-[5px]">
          {hover != null && (
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-washi/25"
              style={{ width: `${hover * 100}%` }}
            />
          )}
          {hasRange(loop) && (
            <div
              className={cn('absolute inset-y-0', loop.enabled ? 'bg-shu-400/55' : 'bg-washi/20')}
              style={{ left: `${pct(loop.start)}%`, width: `${pct(loop.end) - pct(loop.start)}%` }}
            />
          )}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-shu-500"
            style={{ width: `${pct(time)}%` }}
          />
        </div>
        <span
          className="pointer-events-none absolute size-3.5 -translate-x-1/2 scale-0 rounded-full bg-shu-500 shadow transition-transform duration-150 group-hover/bar:scale-100"
          style={{ left: `${pct(time)}%` }}
        />
        {hover != null && duration > 0 && (
          <span
            className="tabular pointer-events-none absolute -top-8 -translate-x-1/2 rounded-[6px] bg-sumi-950/90 px-2 py-1 font-mono text-xs text-washi"
            style={{ left: `${hover * 100}%` }}
          >
            {formatTime(hover * duration, { tenths: true })}
          </span>
        )}
      </div>
    </div>
  );
}

/** Compact fullscreen transport: progress line + one small row of controls. */
function FullscreenBar({
  visible,
  clips,
  onClipSelect,
  onExit,
  onMenuChange,
}: {
  visible: boolean;
  clips: Clip[];
  onClipSelect: (clip: Clip) => void;
  onExit: () => void;
  /** Reports whether a menu is open so the controls never auto-hide underneath it. */
  onMenuChange: (open: boolean) => void;
}) {
  const playing = usePlayer((s) => s.playing);
  const time = usePlayer((s) => s.time);
  const duration = usePlayer((s) => s.duration);
  const mirrored = usePlayer((s) => s.mirrored);
  const rate = usePlayer((s) => s.rate);
  const loop = usePlayer((s) => s.loop);
  const loopAll = usePlayer((s) => s.loopAll);
  const gap = usePlayer((s) => s.gap);
  const gapAll = usePlayer((s) => s.gapAll);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [gapMenu, setGapMenu] = useState<'all' | 'clip' | null>(null);
  const menuOpen = speedOpen || gapMenu != null;
  useEffect(() => onMenuChange(menuOpen), [menuOpen, onMenuChange]);
  const allPress = useLongPress(
    () => setGapMenu('all'),
    () => usePlayer.getState().toggleLoopAll(),
  );
  const clipPress = useLongPress(
    () => setGapMenu('clip'),
    () => usePlayer.getState().toggleLoop(),
  );
  const p = usePlayer.getState();
  const btn = 'grid size-10 place-items-center rounded-full text-washi transition-colors hover:bg-washi/15';

  useEffect(() => {
    if (!visible) setSpeedOpen(false);
  }, [visible]);

  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-0 z-30 transition-opacity duration-200',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgb(0_0_0/0.75),transparent)]" />
      <div className="px-3 pb-[max(6px,env(safe-area-inset-bottom))] pt-10 sm:px-5">
        <FsProgress clips={clips} onClipSelect={onClipSelect} />
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            aria-label={playing ? 'Pausar' : 'Reproducir'}
            className={btn}
            onClick={() => p.togglePlay()}
          >
            {playing ? (
              <Pause className="size-5 fill-washi" />
            ) : (
              <Play className="ml-0.5 size-5 fill-washi" />
            )}
          </button>
          <button
            type="button"
            aria-label="Retroceder 5 segundos"
            className={btn}
            onClick={() => p.nudge(-5)}
          >
            <RotateCcw className="size-[18px]" />
          </button>
          <button type="button" aria-label="Avanzar 5 segundos" className={btn} onClick={() => p.nudge(5)}>
            <RotateCw className="size-[18px]" />
          </button>
          <span className="tabular ml-1.5 font-mono text-[13px] text-washi">
            {formatTime(time)}
            <span className="text-washi-subtle"> / {formatTime(duration)}</span>
          </span>

          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            <div className="relative">
              <button
                type="button"
                aria-label="Velocidad"
                aria-haspopup="menu"
                aria-expanded={speedOpen}
                onClick={() => setSpeedOpen((v) => !v)}
                className="tabular h-10 rounded-full px-3 font-mono text-[13px] font-semibold text-washi transition-colors hover:bg-washi/15"
              >
                {formatSpeed(rate)}
              </button>
              <AnimatePresence>
                {speedOpen && (
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, y: 6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, transition: { duration: 0.1 } }}
                    transition={jelly}
                    className="absolute bottom-12 right-0 w-28 rounded-[12px] bg-sumi-950/95 p-1.5 shadow-xl ring-1 ring-washi/15"
                  >
                    {SPEED_PRESETS.map((s) => (
                      <button
                        key={s}
                        role="menuitemradio"
                        aria-checked={s === rate}
                        type="button"
                        onClick={() => {
                          p.setRate(s);
                          setSpeedOpen(false);
                        }}
                        className={cn(
                          'tabular flex h-9 w-full items-center justify-between rounded-[8px] px-3 font-mono text-[13px]',
                          s === rate ? 'bg-washi text-sumi-900' : 'text-washi hover:bg-washi/10',
                        )}
                      >
                        {formatSpeed(s)}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="relative">
              <button
                type="button"
                aria-label="Repetir la canción entera (mantén pulsado para la pausa)"
                aria-pressed={loopAll}
                {...allPress}
                className={cn(btn, 'relative', loopAll && 'text-ai-300')}
              >
                <Repeat1 className="size-[18px]" />
                {gapAll > 0 && <GapBadge seconds={gapAll} />}
              </button>
              <AnimatePresence>
                {gapMenu === 'all' && (
                  <GapPicker
                    title="Pausa entre vueltas de la canción"
                    value={gapAll}
                    onChange={(s) => p.setGapAll(s)}
                    onClose={() => setGapMenu(null)}
                    className="absolute bottom-12 right-0"
                  />
                )}
              </AnimatePresence>
            </div>
            <div className="relative">
              <button
                type="button"
                aria-label="Repetir tramo (mantén pulsado para la pausa)"
                aria-pressed={loop.enabled && hasRange(loop)}
                {...clipPress}
                className={cn(
                  btn,
                  'relative',
                  !hasRange(loop) && 'opacity-50',
                  loop.enabled && hasRange(loop) && 'text-shu-400',
                )}
              >
                <Repeat className="size-[18px]" />
                {gap > 0 && <GapBadge seconds={gap} />}
              </button>
              <AnimatePresence>
                {gapMenu === 'clip' && (
                  <GapPicker
                    title="Pausa entre vueltas del clip"
                    value={gap}
                    onChange={(s) => p.setGap(s)}
                    onClose={() => setGapMenu(null)}
                    className="absolute bottom-12 right-0"
                  />
                )}
              </AnimatePresence>
            </div>
            <button
              type="button"
              aria-label="Espejo"
              aria-pressed={mirrored}
              onClick={() => p.toggleMirror()}
              className={cn(btn, mirrored && 'text-ai-300')}
            >
              <FlipHorizontal2 className="size-[18px]" />
            </button>
            <button type="button" aria-label="Salir de pantalla completa" className={btn} onClick={onExit}>
              <Minimize2 className="size-[18px]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GapBadge({ seconds }: { seconds: number }) {
  return (
    <span className="tabular pointer-events-none absolute -right-0.5 -top-0.5 rounded-full bg-shu-500 px-1 font-mono text-[9px] font-bold leading-[14px] text-washi">
      {seconds}s
    </span>
  );
}

function Countdown() {
  const endsAt = usePlayer((s) => s.countdownEndsAt);
  const [now, setNow] = useState(() => performance.now());

  // Metronome: one tick per second of the pause, accented tick when the loop starts again.
  useEffect(() => {
    if (endsAt == null || !usePlayer.getState().countSound) return;
    const cancel = scheduleCountIn(Math.round((endsAt - performance.now()) / 1000));
    // Only silence the ticks if the pause was interrupted; a natural end must keep the accented "go" tick.
    return () => {
      if (performance.now() < endsAt - 80) cancel();
    };
  }, [endsAt]);

  useEffect(() => {
    if (endsAt == null) return;
    setNow(performance.now());
    const id = setInterval(() => setNow(performance.now()), 80);
    return () => clearInterval(id);
  }, [endsAt]);

  const remaining = endsAt == null ? null : Math.max(1, Math.ceil((endsAt - now) / 1000));

  return (
    <AnimatePresence>
      {remaining != null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-sumi-950/45"
        >
          <AnimatePresence mode="popLayout">
            <motion.span
              key={remaining}
              initial={{ scale: 1.6, opacity: 0, rotate: -10 }}
              animate={{ scale: 1, opacity: 1, rotate: -4 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={jelly}
              className="grid size-[clamp(96px,16vw,150px)] place-items-center rounded-[14px] bg-shu-500 font-display text-[clamp(56px,10vw,96px)] font-extrabold leading-none text-washi shadow-[0_20px_40px_-20px_rgb(0_0_0/0.9)]"
            >
              {remaining}
            </motion.span>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
