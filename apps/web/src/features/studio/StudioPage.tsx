import { formatSpeed, round3, youTubeWatchUrl, type Clip, type Video } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ArrowLeft, ExternalLink, FileVideo, Keyboard, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Page } from '@/components/AppShell';
import { Seal } from '@/components/Seal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useClips } from '@/data/clips';
import { signedVideoUrl, useLinkLocalFile, useUpdateVideo, useVideo } from '@/data/videos';
import { loadLocalVideo } from '@/lib/localVideos';
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
import { Timeline } from './Timeline';
import { LoopTile, MirrorTile, PlaybackTile, SpeedTile } from './Transport';
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
      <div className="paper mx-auto max-w-[1500px] rounded-[16px] sm:rounded-[20px]">
        {/* Title bar */}
        <div className="flex items-center gap-3 border-b border-rule px-4 py-3.5 sm:px-6">
          <Link
            to="/"
            aria-label="Volver a la biblioteca"
            className="grid size-11 shrink-0 place-items-center rounded-[10px] border border-line-strong bg-sumi-800 text-washi-muted transition-colors hover:border-washi/40 hover:text-washi"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[20px] font-bold leading-tight sm:text-[26px]">{current.title}</h1>
            <p className="truncate text-sm text-washi-muted">
              {current.artist || 'Artista sin especificar'} · {current.source === 'youtube' ? 'YouTube' : current.file_name}
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
          <Button variant="secondary" size="icon" aria-label="Atajos de teclado" onClick={openHelp} className="max-sm:hidden">
            <Keyboard className="size-5" />
          </Button>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Work area */}
          <div className="min-w-0">
            {/* On phones the stage stays pinned under the top bar while the controls scroll. */}
            <div className="sticky top-16 z-20 rounded-t-[15px] bg-sumi-850 px-2.5 pb-2.5 pt-2.5 shadow-[0_12px_18px_-12px_rgb(0_0_0/0.85)] sm:static sm:rounded-none sm:bg-transparent sm:px-5 sm:pb-1 sm:pt-5 sm:shadow-none">
              <MediaStage video={current} />
            </div>
            <Timeline seed={current.id} clips={clips.data ?? []} onClipSelect={applyClip} />
            <div className="grid border-t border-rule sm:grid-cols-2 2xl:grid-cols-[1fr_1.35fr_1fr]">
              <PlaybackTile />
              <SpeedTile className="border-t border-rule sm:border-l sm:border-t-0" />
              <MirrorTile className="border-t border-rule sm:col-span-2 2xl:col-span-1 2xl:border-l 2xl:border-t-0" />
            </div>
            <LoopTile onSaveClip={openSave} className="border-t border-rule" />
          </div>

          {/* Clips column */}
          <div className="border-t border-rule lg:border-l lg:border-t-0">
            <ClipList clips={clips.data ?? []} loading={clips.isPending} onApply={applyClip} onNew={openSave} />
          </div>
        </div>
      </div>

      <SaveClipDialog open={saving} onClose={() => setSaving(false)} video={current} clipCount={clips.data?.length ?? 0} />
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

function MediaStage({ video }: { video: Video }) {
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
    <div>
    <div className="relative aspect-video w-full overflow-hidden rounded-[12px] bg-black shadow-[0_0_0_1px_rgb(243_236_223/0.16),0_0_0_5px_var(--color-sumi-850),0_0_0_6px_var(--color-rule),0_20px_40px_-24px_rgb(0_0_0/0.95)]">
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
        onClick={() => usePlayer.getState().togglePlay()}
        disabled={!ready}
        className="absolute inset-0 z-10 cursor-pointer rounded-[12px] disabled:cursor-default"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3.5">
        <AnimatePresence>{mirrored && <Seal key="mirror-seal" glyph="鏡" size={44} stamp title="Modo espejo" />}</AnimatePresence>
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

      <AnimatePresence>
        {ready && !playing && !counting && !error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.25, transition: { duration: 0.18 } }}
            transition={jelly}
            className="pointer-events-none absolute inset-0 z-20 m-auto grid size-20 place-items-center rounded-full bg-washi text-sumi-900 shadow-[0_16px_30px_-14px_rgb(0_0_0/0.9)]"
          >
            <Play className="ml-1 size-8 fill-sumi-900" />
          </motion.div>
        )}
      </AnimatePresence>

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
              Pesaba demasiado para la nube. Elige tu copia de <span className="font-medium text-washi">{video.file_name}</span> para
              usarla aquí; los clips del grupo se aplican igual.
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
    </div>
    </div>
  );
}

function Countdown() {
  const endsAt = usePlayer((s) => s.countdownEndsAt);
  const [now, setNow] = useState(() => performance.now());

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
