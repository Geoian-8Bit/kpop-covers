import {
  formatSpeed,
  formatTime,
  hasLinkedFile,
  isVerticalAspect,
  round3,
  SPEED_PRESETS,
  youTubeWatchUrl,
  type Clip,
  type Note,
  type Video,
} from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  CloudUpload,
  FileVideo,
  FlipHorizontal2,
  Keyboard,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCw,
  Smartphone,
  Video as VideoIcon,
  WifiOff,
  Youtube,
} from 'lucide-react';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { markOpened } from '@/lib/recent';
import { askWho, useMe } from '@/data/members';
import { songNotes } from '@/features/review/reviewRules';
import { forgetStage, readStage, rememberStage } from '@/lib/stagePref';
import { loadLocalVideo } from '@/lib/localVideos';
import { groupCopyLabel, initialStage, needsLocalCheck, playsGroupCopy } from './stageRules';
import { fsChrome, useFsChrome, useFsChromeDriver } from './fullscreenChrome';
import {
  axisFraction,
  inTurnedLayer,
  layerPoint,
  lockTarget,
  needsCssRotation,
  nextOrientationPref,
  orientationButtonLabel,
  orientationLabel,
  showOrientationButton,
  needsAspectProbe,
  resolveAspect,
  youtubeFsBox,
  youtubeInlineBox,
  type OrientationPref,
} from './fullscreenRules';
import { Page } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { ButtonSkin } from '@/components/ui/ButtonSkin';
import { Spinner } from '@/components/ui/Spinner';
import { CLIP_SWATCH, useClips } from '@/data/clips';
import { useNotes } from '@/data/notes';
import {
  isStaleCopy,
  useLinkLocalFile,
  useUpdateVideo,
  useUploadToCloud,
  useVideo,
} from '@/data/videos';
import { scheduleCountIn } from '@/lib/metronome';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { useBackToClose } from '@/lib/useBackToClose';
import { refitViewport } from '@/lib/viewport';
import { friendlyError } from '@/lib/supabase';
import { FileStage } from '@/player/FileStage';
import { hasRange, usePlayer } from '@/player/store';
import { useLoopController } from '@/player/useLoopController';
import { YouTubeStage } from '@/player/YouTubeStage';
import { useMediaBox } from '@/player/ZoomLayer';
import { gestureZoom, isDoubleTap, isZoomed, keyZoom, NO_ZOOM, wheelZoom, type Pt, type Zoom } from '@/player/zoom';
import { useToast } from '@/providers/ToastProvider';
import { FsPanArrows, PlayerZoomLayer, ZoomBadge, ZoomRow, zoomAvailability } from './ZoomControls';
import { ClipList } from './ClipList';
import { NoteDialog, type NoteTarget } from './NoteDialog';
import { SaveClipDialog } from './SaveClipDialog';
import { LinkFilePanel } from './LinkFilePanel';
import { CloudCopyStatus } from './CloudCopyStatus';
import { cloudLimitBytes } from '@/lib/backend';
import { useYouTubeMeta } from '@/lib/youtubeMeta';
import { useFileSource } from './fileSource';
import type { TakeItem } from '@/data/takes';
import { VoiceSplitControl } from '@/features/voice/VoiceSplitControl';
import { FsVoiceButton } from './FsVoiceButton';
import { useVoiceSplit } from './useVoiceSplit';
import { hasSeparableFile } from '@/features/voice/voiceRules';
import { useStageStems } from '@/data/stems';
import { Segmented } from '@/components/ui/Segmented';
import { ShortcutsDialog } from './ShortcutsDialog';
import { assignLanes, Timeline, useNoteAlert } from './Timeline';
import { GapBadge, GapPicker, PlayerBar, useLongPress } from './Transport';
import { Dormant, useUnlessCovered } from './studioAsleep';
import { useShortcuts } from './useShortcuts';
import { useMenuFocus } from './useMenuFocus';

/** F5 · The review screen, loaded when a take is first opened. */
const ReviewScreen = lazy(() => import('@/features/review/ReviewScreen').then((m) => ({ default: m.ReviewScreen })));
/**
 * P4 · The recorder (camera, recorder, clap…) loads when «Grabar» is first hovered, focused or pressed, and is only
 * mounted while open: closing it unmounts it (it keeps nothing between sessions: every open starts afresh).
 */
const loadRecordStudio = () => import('@/features/record/RecordStudio');
const RecordStudio = lazy(() => loadRecordStudio().then((m) => ({ default: m.RecordStudio })));
const warmRecordStudio = () => void loadRecordStudio().catch(() => undefined);
/** P4 · «Tomas» loads when its tab is first opened. */
const TakesPanel = lazy(() => import('@/features/takes/TakesPanel').then((m) => ({ default: m.TakesPanel })));
/** REQ-06 · «Formaciones»: the tab's list and the editor load when first opened. */
const FormationsPanel = lazy(() => import('@/features/formations/FormationsPanel').then((m) => ({ default: m.FormationsPanel })));
const FormationEditor = lazy(() => import('@/features/formations/FormationEditor').then((m) => ({ default: m.FormationEditor })));
type SideTab = 'clips' | 'takes' | 'formations';
/**
 * Global review 2 [3] · An extra part of the studio in a chunk of its own: if the chunk can't load (offline before the
 * precache finished, no service worker, an iPhone that emptied its cache) it shows nothing, like the long countdowns,
 * instead of taking the whole studio to the error screen.
 */
function optionalPart<P extends object>(load: () => Promise<ComponentType<P>>) {
  const Nothing: ComponentType<P> = () => null;
  return lazy(() =>
    load().then(
      (Part) => ({ default: Part }),
      (error: unknown) => {
        console.warn('[studio] optional part not loaded', error);
        return { default: Nothing };
      },
    ),
  );
}
/** 18 · «Separar voz y música»: loads only for a song with a file of its own. */
const SeparateVoiceButton = optionalPart(() =>
  import('@/features/voice/SeparateVoiceButton').then((m) => m.SeparateVoiceButton),
);

/**
 * Same as `releaseTakeUrl` (data/takes): a take's object URL is let go. Here so the studio doesn't import data/takes
 * (with the recorder's store and sharing) to open: that loads with «Tomas», the review or the recorder.
 */
const releaseTakeUrl = (url: string | null | undefined) => {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
};

/** The stage's file source options (stable: no new object per render). */
const STAGE_SOURCE = { cacheRemote: true } as const;

/** Stable empty list, so the stage never re-renders for a new [] while notes load. */
const NO_NOTES: Note[] = [];

export function StudioPage() {
  const { videoId, planId } = useParams();
  const video = useVideo(videoId);
  const clips = useClips(videoId);
  const toast = useToast();
  const { mutate: patchVideo } = useUpdateVideo();
  const [saving, setSaving] = useState(false);
  const [help, setHelp] = useState(false);
  const notes = useNotes(videoId);
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null);
  const [recording, setRecording] = useState(false);
  const recordButton = useRef<HTMLButtonElement>(null);
  /**
   * Closing the recorder: back to «Grabar». While the recorder covered the studio, «Grabar» sat in a Dormant part
   * (content-visibility: hidden) and the browser dropped its focus to body. Tried for a few frames, until that part
   * shows again; never over a focus something else already took.
   */
  const closeRecorder = useCallback(() => {
    setRecording(false);
    let tries = 0;
    const refocus = () => {
      const el = recordButton.current;
      const active = document.activeElement;
      if (!el || (active && active !== document.body) || tries++ > 5) return;
      el.focus({ preventScroll: true });
      if (document.activeElement !== el) requestAnimationFrame(refocus);
    };
    requestAnimationFrame(refocus);
  }, []);
  const [linking, setLinking] = useState(false);
  // REQ-06 · Back from the formation editor (?tab=formaciones) the studio opens on «Formaciones».
  const [sideTab, setSideTab] = useState<SideTab>(() =>
    new URLSearchParams(window.location.search).get('tab') === 'formaciones' ? 'formations' : 'clips',
  );
  /** F5 · The take open in «Repaso» (its URL is released when the review closes). */
  const [playingTake, setPlayingTake] = useState<{ take: TakeItem; url: string } | null>(null);
  // The review's object URL goes when the review does, also when the page itself goes with it open.
  const playingUrl = playingTake?.url;
  useEffect(() => () => releaseTakeUrl(playingUrl), [playingUrl]);
  const me = useMe();
  // F6: a take's notes show on the song only for their recipient (or when they're for the whole group).
  const songNoteList = useMemo(() => songNotes(notes.data ?? NO_NOTES, me?.id ?? null), [notes.data, me?.id]);
  // F1: arriving from «Añadir vídeo» with this video's file: open the link panel with it.
  const location = useLocation();
  const navigateTo = useNavigate();
  const [incomingFile, setIncomingFile] = useState<File | null>(null);
  useEffect(() => {
    const state = location.state as { linkFile?: File } | null;
    if (!(state?.linkFile instanceof File)) return;
    setIncomingFile(state.linkFile);
    setLinking(true);
    navigateTo(location.pathname + location.search, { replace: true, state: null });
  }, [location, navigateTo]);
  const [params, setParams] = useSearchParams();
  const clipParam = params.get('clip');
  const tabParam = params.get('tab');
  useEffect(() => {
    if (!planId && tabParam === 'formaciones') setSideTab('formations');
  }, [planId, tabParam]);
  const ready = usePlayer((s) => s.ready);
  const duration = usePlayer((s) => s.duration);
  // F9 · No zoom subscription here: every gesture would repaint the whole page (the dialog reads it itself).
  const stage = usePlayer((s) => s.stage);

  useLoopController();

  // Reset only on cleanup: child stages attach their engine in effects that run *before* this
  // parent effect, so resetting on mount could wipe a freshly attached engine.
  useEffect(() => () => usePlayer.getState().reset(), [videoId]);
  // 12 · What a linked entry opens on: the file when this device can play it, unless the person chose YouTube
  // for this video here. Decided once per video, before any player mounts (no YouTube iframe started for nothing).
  const linkedFile = video.data ? hasLinkedFile(video.data) : false;
  // P3 · The library's row (placeholder) opens the stage, but only the real row may forget the choice.
  const loaded = video.data != null && !video.isPlaceholderData;
  const hasRow = video.data != null;
  const [stageFor, setStageFor] = useState<string | null>(null);
  // [4] · «Copia del grupo · 720p» while the stage plays the group's lighter copy (set by the stage), else null.
  const [copyLabel, setCopyLabel] = useState<string | null>(null);
  const decidedFor = useRef<string | null>(null);
  const rowRef = useRef(video.data);
  rowRef.current = video.data;
  useEffect(() => {
    const row = rowRef.current;
    if (!videoId || !row) return;
    if (!linkedFile) {
      if (loaded) forgetStage(videoId); // removed (here or on another phone): back to the default
      usePlayer.setState({ stage: 'youtube' });
      // Only the real row settles it: a stale placeholder without the file must not keep YouTube once the row says
      // the file was linked (on another phone).
      decidedFor.current = loaded ? videoId : null;
      setStageFor(videoId);
      return;
    }
    // Linked during this visit: keep what is playing (the link panel syncs on YouTube).
    if (decidedFor.current === videoId) return;
    const choice = readStage(videoId);
    const inCloud = Boolean(row.storage_path);
    let cancelled = false;
    const decide = (reachable: boolean) => {
      if (cancelled) return;
      decidedFor.current = videoId;
      usePlayer.setState({ stage: initialStage({ linked: true, choice, reachable }) });
      setStageFor(videoId);
    };
    if (!needsLocalCheck({ linked: true, choice, inCloud })) decide(inCloud);
    else void hasDeviceCopy(row).then(decide);
    return () => {
      cancelled = true;
    };
  }, [videoId, linkedFile, loaded, hasRow]);
  const stageHeld = stageFor !== videoId;
  // Remember this video as the last one opened on this device (the library leads with it).
  useEffect(() => {
    if (videoId) markOpened(videoId);
  }, [videoId]);

  const openSave = useCallback(() => {
    if (!hasRange(usePlayer.getState().loop)) {
      toast('Marca A y B en la línea de tiempo primero', 'info');
      return;
    }
    setSaving(true);
  }, [toast]);
  const openHelp = useCallback(() => setHelp(true), []);
  // A new note belongs to the moment the button is pressed, even if the song keeps playing.
  // F2: the first note (or take) without a name suggests «¿Quién eres?» once; the action goes on either way.
  const addNote = useCallback(() => {
    const at = usePlayer.getState().time;
    askWho('Así tus notas llevan tu nombre. Se recuerda en este dispositivo.', () => setNoteTarget({ note: null, at }));
  }, []);
  const openNote = useCallback((note: Note) => setNoteTarget({ note, at: note.at_seconds }), []);
  useShortcuts({ onSave: openSave, onHelp: openHelp, onNote: addNote, enabled: !planId && !saving && !help && !noteTarget && !recording && !playingTake });

  /** A clip cut on a longer copy of the song may not fit this one: say so instead of a stray loop. */
  const applyClip = useCallback(
    (clip: Clip) => {
      const ok = usePlayer.getState().applyClip(clip) as unknown as boolean | undefined;
      if (ok === false) toast('Este clip queda fuera de este vídeo', 'info');
      return ok !== false;
    },
    [toast],
  );
  const lastLineTap = useRef<{ id: string; at: number } | null>(null);
  /**
   * The clip lines above the timeline: one tap plays the clip (again, from its start); a quick second
   * tap on the same line takes the clip off, back to the whole song.
   */
  const tapClipLine = useCallback(
    (clip: Clip) => {
      const now = performance.now();
      const last = lastLineTap.current;
      if (last && last.id === clip.id && now - last.at < 350) {
        lastLineTap.current = null;
        usePlayer.getState().clearLoop();
        toast(`“${clip.name}” quitado`, 'info');
        return;
      }
      // A clip that didn't fit was never put on: a second tap must not "take it off".
      lastLineTap.current = applyClip(clip) ? { id: clip.id, at: now } : null;
    },
    [toast, applyClip],
  );

  // Deep link from quick access: /v/:id?clip=<clipId>
  useEffect(() => {
    if (!ready || !clipParam || !clips.data) return;
    const clip = clips.data.find((c) => c.id === clipParam);
    if (clip) applyClip(clip);
    else toast('Ese clip ya no existe: se abre la canción entera', 'info');
    setParams(
      (prev) => {
        prev.delete('clip');
        return prev;
      },
      { replace: true },
    );
  }, [ready, clipParam, clips.data, setParams, applyClip, toast]);

  // First time a file/stream reports its length, remember it for the library cards.
  const current = video.data;
  const fresh = !video.isPlaceholderData; // P3 · never write from the library's placeholder row
  useEffect(() => {
    // Only the stage that IS this entry: a linked file's own length is not the YouTube video's (F1).
    const fromFile = current?.source === 'youtube' && usePlayer.getState().stage === 'file';
    if (fresh && current && duration > 0 && !current.duration_seconds && !fromFile) {
      patchVideo({ id: current.id, patch: { duration_seconds: round3(duration) } });
    }
  }, [current, fresh, duration, patchVideo]);

  // A failed or paused (offline) load is not "deleted": offer a retry, and say when it's the connection.
  const offline = video.fetchStatus === 'paused' || (video.isError && !navigator.onLine);
  if (!current && (video.isError || offline)) {
    return (
      <Page className="mx-auto max-w-lg px-5 py-24 text-center">
        {offline ? (
          <WifiOff className="mx-auto size-8 text-washi-muted" />
        ) : (
          <AlertTriangle className="mx-auto size-8 text-enji-300" />
        )}
        <h1 className="mt-3 font-display text-3xl font-bold">{offline ? 'Sin conexión' : 'No pudimos cargar el vídeo'}</h1>
        <p className="mt-2 text-washi-muted">
          {offline
            ? 'Conéctate a internet para abrir este vídeo. Se cargará solo en cuanto vuelva la conexión.'
            : 'Revisa la conexión e inténtalo de nuevo.'}
        </p>
        <Button className="mt-6" loading={video.isFetching} onClick={() => void video.refetch()}>
          Reintentar
        </Button>
        <Link to="/" className="mt-4 block font-medium text-kin-300 hover:underline">
          Volver a la biblioteca
        </Link>
      </Page>
    );
  }

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

  if (planId) {
    // REQ-06 · The formation editor: the same player (and store) in the editor's layout.
    return (
      <Suspense
        fallback={
          <div className="grid min-h-[70dvh] place-items-center" role="status" aria-label="Abriendo el editor de formaciones">
            <Spinner className="size-9 text-washi-muted" />
          </div>
        }
      >
        <FormationEditor
          video={current}
          planId={planId}
          playsFile={current.source === 'upload' || (stage === 'file' && hasLinkedFile(current))}
          stage={
            <MediaStage
              video={current}
              clips={clips.data ?? []}
              notes={songNoteList}
              onClipSelect={tapClipLine}
              hold={stageHeld}
              onCopyLabel={setCopyLabel}
            />
          }
        />
      </Suspense>
    );
  }

  return (
    <Page className="px-2.5 pb-16 pt-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-[1500px] rounded-[10px] sm:rounded-[12px]">
        {/* Title bar (held still with the rest of the page, the stage aside, while the recorder covers it) */}
        <Dormant>
        <div className="sep-b flex items-center gap-3 px-4 py-4 sm:px-6">
          <Link
            to="/"
            aria-label="Volver a la biblioteca"
            className="size-11 shrink-0 drop-shadow-[0_6px_10px_rgb(0_0_0/0.5)] transition-transform hover:scale-105 active:scale-95"
          >
            <ButtonSkin kind="back" />
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
          {current.source === 'youtube' && (
            <Button
              size="sm"
              variant="secondary"
              aria-label={hasLinkedFile(current) ? 'Archivo de este vídeo' : 'Añadir archivo de este vídeo'}
              onClick={() => setLinking(true)}
            >
              <FileVideo className="size-4" />
              <span className="max-sm:sr-only">{hasLinkedFile(current) ? 'Archivo' : 'Añadir archivo'}</span>
            </Button>
          )}
          <Button ref={recordButton} size="sm" aria-label="Grabar baile con la canción" onClick={() => askWho('Así tus tomas llevan tu nombre. Se recuerda en este dispositivo.', () => setRecording(true))}
            disabled={!ready}
            onPointerEnter={warmRecordStudio}
            onPointerDown={warmRecordStudio}
            onFocus={warmRecordStudio}
          >
            <VideoIcon className="size-4" />
            <span className="max-sm:sr-only">Grabar</span>
          </Button>
        </div>
        </Dormant>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Work area */}
          <div className="min-w-0">
            {/*
              On phones the stage stays pinned under the top bar while the controls scroll. Menus below open clear of it
              (data-popover-ceiling). Its z-20 is a stacking context: in the CSS fullscreen (iPhone, data-fs) it rises
              over the top bar (z-40) and the quick menu, or they would cover the fullscreen bar and its YouTube credit.
            */}
            <div
              data-popover-ceiling
              className="sticky top-16 z-20 rounded-t-[9px] bg-sumi-850 px-2.5 pb-2.5 pt-2.5 shadow-[0_12px_18px_-12px_rgb(0_0_0/0.85)] has-[[data-fs]]:z-[75] sm:static sm:rounded-none sm:bg-transparent sm:px-5 sm:pb-1 sm:pt-5 sm:shadow-none"
            >
              <MediaStage
                video={current}
                clips={clips.data ?? []}
                notes={songNoteList}
                onClipSelect={tapClipLine}
                hold={stageHeld}
                onCopyLabel={setCopyLabel}
              />
            </div>
            <Dormant>
            <Timeline
              seed={current.id}
              clips={clips.data ?? []}
              onClipSelect={tapClipLine}
              notes={songNoteList}
              onNoteOpen={openNote}
            />
            <PlayerBar onSaveClip={openSave} onAddNote={addNote} />
            {hasLinkedFile(current) && <SourceRow video={current} copyLabel={copyLabel} />}
            {/* 13 · Only on this device: send a lighter copy to the group (shows only when there's something to say). */}
            <CloudCopyStatus video={current} variant="studio" announce={!linking} />
            {/* 44 · On a phone only the save/clear line of a clip's zoom shows; zooming itself is the fingers' (ZoomControls). */}
            <ZoomRow video={current} clips={clips.data ?? []} onLink={() => setLinking(true)} />
            <VoiceRow video={current} />
            </Dormant>
          </div>

          {/* Clips | Tomas column */}
          <Dormant className="sep-t lg:sep-l">
            <div className="px-4 pt-4 sm:px-5">
              <Segmented
                label="Clips, tomas o formaciones"
                layoutId={`side-${current.id}`}
                value={sideTab}
                onChange={setSideTab}
                options={[
                  { value: 'clips', label: 'Clips' },
                  { value: 'takes', label: 'Tomas' },
                  { value: 'formations', label: 'Formaciones' },
                ]}
              />
            </div>
            {sideTab === 'formations' ? (
              <Suspense
                fallback={
                  <div className="grid place-items-center py-10" role="status" aria-label="Cargando formaciones">
                    <Spinner className="size-6 text-washi-muted" />
                  </div>
                }
              >
                <FormationsPanel video={current} />
              </Suspense>
            ) : sideTab === 'clips' ? (
              <ClipList
                clips={clips.data ?? []}
                loading={clips.isPending}
                onApply={applyClip}
                onNew={openSave}
              />
            ) : (
              <Suspense
                fallback={
                  <div className="grid place-items-center py-10" role="status" aria-label="Cargando tomas">
                    <Spinner className="size-6 text-washi-muted" />
                  </div>
                }
              >
                <TakesPanel
                  video={current}
                  clips={clips.data ?? []}
                  onPlay={(take, url) => {
                    // One sound at a time: the song stops while a take plays.
                    usePlayer.getState().pause();
                    setPlayingTake({ take, url });
                  }}
                />
              </Suspense>
            )}
          </Dormant>
        </div>
      </div>

      <SaveClipDialog
        open={saving}
        onClose={() => setSaving(false)}
        video={current}
        clipCount={clips.data?.length ?? 0}
        zoomFrom={zoomAvailability(current, stage, ready).can ? 'player' : null}
      />
      <NoteDialog target={noteTarget} onClose={() => setNoteTarget(null)} video={current} />
      {recording && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[90] grid place-items-center bg-sumi-950" role="status" aria-label="Abriendo la cámara">
              <Spinner className="size-9 text-washi-muted" />
            </div>
          }
        >
          <RecordStudio open onClose={closeRecorder} video={current} />
        </Suspense>
      )}
      {current.source === 'youtube' && (
        <LinkFilePanel
          open={linking}
          onClose={() => {
            setLinking(false);
            setIncomingFile(null);
          }}
          video={current}
          initialFile={incomingFile}
        />
      )}
      <ShortcutsDialog open={help} onClose={() => setHelp(false)} />
      {playingTake && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[45] grid place-items-center bg-sumi-950" role="status" aria-label="Abriendo el repaso">
              <Spinner className="size-9 text-washi-muted" />
            </div>
          }
        >
          <ReviewScreen
            key={playingTake.take.id}
            video={current}
            take={playingTake.take}
            url={playingTake.url}
            clips={clips.data ?? []}
            onClose={() => {
              releaseTakeUrl(playingTake.url);
              setPlayingTake(null);
            }}
          />
        </Suspense>
      )}
    </Page>
  );
}

/**
 * F17 · Voice and music apart: on files only (YouTube's sound can't be reached). 18 · Below it, «Separar voz y
 * música» (AI, once per song) or a line saying the separated tracks are in use.
 */
function VoiceRow({ video }: { video: Video }) {
  // 46 · The same state as fullscreen's «Voz y música» (the player's store).
  const { mode, available, monoLike, setMode } = useVoiceSplit();
  return (
    <div className="sep-t px-4 py-3 sm:px-5">
      <p className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-washi-subtle">Voz y música</p>
      <VoiceSplitControl
        mode={mode}
        onChange={setMode}
        available={available}
        monoLike={monoLike}
        compact
      />
      {/* Global review 2 [5] · Mounted while the song has a file, not only while its engine is on the stage: a
          separation running survives «YouTube», a resync or a media error (it hides itself when idle). */}
      {hasSeparableFile(video) && (
        <Suspense fallback={null}>
          <SeparateVoiceButton video={video} available={available} />
        </Suspense>
      )}
    </div>
  );
}

/** 12 · Whether this device keeps a current copy of the entry's linked file. */
async function hasDeviceCopy(video: Video): Promise<boolean> {
  const blob = await loadLocalVideo(video.id);
  return blob != null && !isStaleCopy(video);
}

const SOURCES = [
  { value: 'file', label: 'Archivo', Icon: FileVideo },
  { value: 'youtube', label: 'YouTube', Icon: Youtube },
] as const;

/**
 * F1 · 12 · «Archivo | YouTube» for a YouTube entry with its own file: under the controls, with the video's
 * settings, so it never takes room from the video. The person's pick is remembered for this video on this device.
 */
function SourceRow({ video, copyLabel }: { video: Video; copyLabel: string | null }) {
  const stage = usePlayer((s) => s.stage);
  const choose = (next: 'youtube' | 'file') => {
    rememberStage(video.id, next);
    usePlayer.getState().setStage(next);
  };
  return (
    <div className="sep-t flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-5">
      <p id="source-row-title" className="text-[12px] font-bold uppercase tracking-[0.12em] text-washi-subtle">
        Vídeo
      </p>
      <div
        role="radiogroup"
        aria-labelledby="source-row-title"
        className="well skin-track inline-flex items-center gap-0.5 rounded-[12px] p-0.5"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          const next = stage === 'file' ? 'youtube' : 'file';
          choose(next);
          e.currentTarget.querySelector<HTMLButtonElement>(`[data-source="${next}"]`)?.focus();
        }}
      >
        {SOURCES.map(({ value, label, Icon }) => {
          const active = stage === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              data-source={value}
              onClick={() => !active && choose(value)}
              className={cn(
                'flex min-h-11 items-center gap-1.5 rounded-[10px] px-3.5 text-[13px] font-medium transition-colors duration-150',
                active ? 'bg-washi font-bold text-sumi-900' : 'text-washi-muted hover:text-washi',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>
      <span className="min-w-0 flex-1 truncate text-[12px] text-washi-subtle">
        {stage === 'file' ? (copyLabel ?? video.file_name ?? '') : 'Con el archivo: sin anuncios ni esperas'}
      </span>
    </div>
  );
}

function MediaStage({
  video,
  clips,
  notes,
  onClipSelect,
  hold = false,
  onCopyLabel,
}: {
  video: Video;
  clips: Clip[];
  notes: Note[];
  onClipSelect: (clip: Clip) => void;
  /** 12 · The stage isn't decided yet (looking for a device copy): no player mounts until it is. */
  hold?: boolean;
  /** [4] · Tells the page when the file on the stage is the group's lighter copy (its «Vídeo» row says so). */
  onCopyLabel?: (label: string | null) => void;
}) {
  // 5 · Only what the stage itself needs: buffering, speed and the controls' visibility live in small components,
  // so none of them repaints the stage (and the players inside it).
  const mirrored = usePlayer((s) => s.mirrored);
  const playing = usePlayer((s) => s.playing);
  const ready = usePlayer((s) => s.ready);
  const error = usePlayer((s) => s.error);
  const [reloadKey, setReloadKey] = useState(0);
  const stage = usePlayer((s) => s.stage);
  /** Uploaded videos play their file; a YouTube entry plays its linked file when «Archivo» is chosen (F1). */
  const playsFile = video.source === 'upload' || (stage === 'file' && hasLinkedFile(video));
  // A cloud file is also downloaded whole while it streams: the stage moves to it so loops stop asking a slow 4G.
  const file = useFileSource(video, reloadKey, playsFile && !hold, STAGE_SOURCE);
  // 18 · The group's AI-separated tracks for this file, for «Sin voz» / «Voz» (never with YouTube).
  useStageStems(video, playsFile && !hold && file.status === 'ready' ? file.url : null);
  // …and for its downloaded copy (the graph finds them by the element's src).
  useStageStems(video, playsFile && !hold && file.status === 'ready' ? (file.cachedUrl ?? null) : null);
  const link = useLinkLocalFile();
  const upload = useUploadToCloud();
  /** Only on this device (the upload failed or was too big): offer to send it to the group from here. */
  // Uploaded videos only: a YouTube entry's file reaches the cloud through the link panel (described and synced).
  // 13 · Too big for the cloud: the «Nube del grupo» row below offers a lighter copy instead.
  const localOnly =
    video.source === 'upload' &&
    !video.storage_path &&
    file.status === 'ready' &&
    file.local != null &&
    file.local.size <= cloudLimitBytes();

  async function sendToCloud() {
    if (file.status !== 'ready' || !file.local || upload.isPending) return;
    const copy = new File([file.local], video.file_name ?? 'video.mp4', { type: file.local.type || 'video/mp4' });
    try {
      await upload.mutateAsync({ video, file: copy });
      toast('Subido a la nube: ya lo ve todo el grupo', 'success');
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  }
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);

  // ── F9 · Zoom over the file: two fingers or the wheel zoom, a drag moves, a double tap shows it whole. ──
  // Never over YouTube's player (its terms): there the zoom row says how to get it.
  // Only «zoomed or not» here: the zoom itself is read by the layer, so a gesture never repaints the whole stage.
  const zoomed = usePlayer((s) => isZoomed(s.zoom));
  const canZoom = zoomAvailability(video, stage, ready).can && file.status === 'ready';
  const { ref: boxRef, el: boxEl, box, media } = useMediaBox<HTMLDivElement>();
  const [zoomLive, setZoomLive] = useState(false);
  const zoomPointers = useRef(new Map<number, Pt>());
  const zoomGesture = useRef<{ start: Zoom; from: Pt[]; moved: boolean } | null>(null);
  const swallowClickUntil = useRef(0);
  const zoomTap = useRef<{ last: { at: number; x: number; y: number } | null; timer?: ReturnType<typeof setTimeout> }>({ last: null });
  const zoomResetAt = useRef(0);
  // [4] · The group's lighter copy (not the original) on the stage: the «Vídeo» row names it, with its real size.
  const copyLabel =
    playsFile &&
    !hold &&
    file.status === 'ready' &&
    !file.local &&
    playsGroupCopy({ fromCloud: Boolean(video.storage_path), originalBytes: video.file_size, limitBytes: cloudLimitBytes() })
      ? groupCopyLabel(media)
      : null;
  useEffect(() => {
    onCopyLabel?.(copyLabel);
  }, [copyLabel, onCopyLabel]);
  useEffect(() => () => onCopyLabel?.(null), [onCopyLabel]);
  const geometry = useRef({ box, media, mirrored });
  geometry.current = { box, media, mirrored };
  useEffect(() => () => clearTimeout(zoomTap.current.timer), []);

  // REQ-02 · In the CSS-turned fullscreen the picture's own axes are not the screen's (layerPoint).
  const boxPoint = (e: { clientX: number; clientY: number }): Pt => {
    if (!boxEl) return { x: e.clientX, y: e.clientY };
    return layerPoint(e, boxEl.getBoundingClientRect(), inTurnedLayer(boxEl));
  };
  const restartZoomGesture = (moved: boolean) => {
    zoomGesture.current = { start: usePlayer.getState().zoom, from: [...zoomPointers.current.values()].slice(0, 2), moved };
  };
  function onZoomPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    pointerType.current = e.pointerType;
    if (!canZoom || (e.pointerType === 'mouse' && e.button !== 0)) return;
    zoomPointers.current.set(e.pointerId, boxPoint(e));
    restartZoomGesture(zoomPointers.current.size > 1 ? (zoomGesture.current?.moved ?? false) : false);
  }
  function onZoomPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const g = zoomGesture.current;
    if (!g || !zoomPointers.current.has(e.pointerId)) return;
    zoomPointers.current.set(e.pointerId, boxPoint(e));
    const to = [...zoomPointers.current.values()].slice(0, 2);
    if (to.length !== g.from.length) return;
    // One finger on the whole video is a tap (or the page scrolling), not a drag.
    if (to.length === 1 && !isZoomed(g.start)) return;
    if (!g.moved && to.length === 1 && Math.hypot(to[0]!.x - g.from[0]!.x, to[0]!.y - g.from[0]!.y) < 6) return;
    if (!g.moved) {
      g.moved = true;
      setZoomLive(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* already gone */
      }
    }
    usePlayer.getState().setZoom(gestureZoom(g.start, g.from, to, box, media, mirrored));
  }
  function onZoomPointerEnd(e: React.PointerEvent<HTMLButtonElement>) {
    if (!zoomPointers.current.delete(e.pointerId)) return;
    const moved = zoomGesture.current?.moved ?? false;
    if (moved) swallowClickUntil.current = performance.now() + 400;
    if (zoomPointers.current.size > 0) {
      restartZoomGesture(moved); // one finger lifted: carry on with the other from here
      return;
    }
    zoomGesture.current = null;
    setZoomLive(false);
  }
  /**
   * Keyboard on the video (focus on it): + zooms in; once zoomed, the arrows move the view, − zooms out and 0 shows
   * the whole video. Handled keys don't reach the studio's shortcuts (they skip prevented events).
   */
  function onZoomKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (!canZoom || e.metaKey || e.ctrlKey || e.altKey) return;
    const current = usePlayer.getState().zoom;
    if (!isZoomed(current) && e.key !== '+' && e.key !== '=') return;
    const next = keyZoom(current, e.key, box, media, mirrored);
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    usePlayer.getState().setZoom(next);
  }
  // The wheel needs a non-passive listener. On the whole video, scrolling down still scrolls the page.
  useEffect(() => {
    const el = boxEl;
    if (!el || !canZoom) return;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      const current = usePlayer.getState().zoom;
      if (!isZoomed(current) && e.deltaY >= 0) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const g = geometry.current;
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      setZoomLive(true);
      const at = layerPoint(e, rect, inTurnedLayer(el));
      usePlayer.getState().setZoom(wheelZoom(current, delta, at, g.box, g.media, g.mirrored));
      clearTimeout(settle);
      settle = setTimeout(() => setZoomLive(false), 200);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      clearTimeout(settle);
    };
  }, [canZoom, boxEl]);

  const missing = playsFile && file.status === 'missing';
  const loading = !ready && !error && !missing;
  const { stageRef, fullscreen, toggleFullscreen, orientation, cycleOrientation, rotated, showOrientation } = useFullscreen();
  const youtubeStage = !playsFile && Boolean(video.youtube_id);
  // REQ-02 · A video stored as horizontal or unknown is asked again (oEmbed through /shorts/ tells a short apart).
  const aspectProbe = useYouTubeMeta(youtubeStage && needsAspectProbe(video) ? video.youtube_id : null);
  const aspect = resolveAspect(video.aspect_ratio, aspectProbe.status === 'ok' ? aspectProbe.aspectRatio : null);
  const verticalYouTube = youtubeStage && isVerticalAspect(aspect);
  // 5 · The controls' visibility lives in its own small store: showing them never repaints this stage.
  useFsChromeDriver(fullscreen);
  const pointerType = useRef<string>('mouse');
  const tap = useRef<{
    at: number;
    timer?: ReturnType<typeof setTimeout>;
    streak: 'left' | 'right' | null;
    streakUntil: number;
  }>({ at: 0, streak: null, streakUntil: 0 });
  useEffect(() => () => clearTimeout(tap.current.timer), []);

  /** ±5 s with a YouTube-style badge; taps that keep coming on the same side add up (−5, −10, −15…). */
  const seekBy = useCallback((side: 'left' | 'right') => {
    usePlayer.getState().nudge(side === 'left' ? -5 : 5);
    fsChrome.flashSeek(side);
  }, []);

  /**
   * Desktop: a click plays/pauses and a double click toggles fullscreen. Touch in fullscreen (YouTube
   * mobile): a tap shows the controls at once, or hides them unless it turns into a double tap; a double
   * tap on a side jumps 5 s and every further tap on that side jumps again; in the middle it plays or
   * pauses. Outside fullscreen a tap plays/pauses.
   */
  function onStageClick(event: React.MouseEvent<HTMLButtonElement>) {
    // F9 · The click after dragging or pinching the zoomed picture is not a tap.
    if (performance.now() < swallowClickUntil.current) return;
    const detail = event.detail;
    const clientX = event.clientX;
    const rect = event.currentTarget.getBoundingClientRect();
    // REQ-02 · In the CSS-turned layer the stage's left–right runs down the screen.
    const along = axisFraction(event, rect, inTurnedLayer(event.currentTarget));
    // F9 · Zoomed in: a double tap (or double click) goes back to the whole video, so a single tap waits a moment.
    if (canZoom && isZoomed(usePlayer.getState().zoom) && detail !== 0) {
      const now = { at: performance.now(), x: clientX, y: event.clientY };
      const t = zoomTap.current;
      clearTimeout(t.timer);
      if (isDoubleTap(t.last, now)) {
        t.last = null;
        zoomResetAt.current = now.at;
        usePlayer.getState().setZoom(NO_ZOOM);
        return;
      }
      t.last = now;
      t.timer = setTimeout(() => stageTap(detail, along), 300);
      return;
    }
    stageTap(detail, along);
  }

  function stageTap(detail: number, x: number) {
    const player = usePlayer.getState();
    // detail 0: a keyboard press, whatever the last pointer was.
    if (!fullscreen || pointerType.current !== 'touch' || detail === 0) {
      player.togglePlay();
      if (fullscreen) fsChrome.wake();
      return;
    }
    const side = x < 0.35 ? 'left' : x > 0.65 ? 'right' : 'center';
    const now = performance.now();
    const t = tap.current;

    if (side !== 'center' && t.streak === side && now < t.streakUntil) {
      t.streakUntil = now + 700;
      seekBy(side);
      return;
    }
    if (now - t.at < 300) {
      clearTimeout(t.timer);
      t.at = 0;
      if (side === 'center') {
        player.togglePlay();
        fsChrome.wake();
      } else {
        t.streak = side;
        t.streakUntil = now + 700;
        seekBy(side);
      }
      return;
    }
    t.at = now;
    t.streak = null;
    if (!fsChrome.isVisible()) {
      fsChrome.wake();
      return;
    }
    t.timer = setTimeout(() => fsChrome.hide(), 260);
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
      // Lifts the pinned container over the top bar in the CSS fullscreen; menus inside it mind only the screen.
      data-fs={fullscreen || undefined}
      // REQ-02 · A fixed orientation the system could not hold: the whole layer turns 90° and takes the whole screen.
      style={fullscreen && rotated ? ROTATED_STAGE_STYLE : undefined}
      // Pointer maths inside the turned layer reads the screen's vertical axis (axisFraction).
      data-fs-turned={(fullscreen && rotated) || undefined}
      className={cn(
        fullscreen &&
          '[container-type:size] ' +
          // The idle pointer hides over the video, never over a dialog (or its backdrop) open on top of it.
          'fixed inset-0 z-[70] grid place-items-center overflow-hidden bg-black [&[data-idle]]:cursor-none [&[data-idle]_*:not([data-overlay],[data-overlay]_*,[role=dialog],[role=dialog]_*)]:!cursor-none [&[data-idle]_:is([data-overlay],[role=dialog])]:cursor-auto',
      )}
    >
      <div
        ref={boxRef}
        // REQ-02 · Fullscreen: a file fills the screen (object-contain inside); YouTube takes the video's own shape:
        // 16:9 as large as fits, or a vertical video as tall as the screen (sides cropped a little, see youtubeFsBox).
        // Outside fullscreen a vertical video keeps its own shape too, centred.
        style={youtubeStage ? (fullscreen ? youtubeFsBox(aspect) : (youtubeInlineBox(aspect) ?? undefined)) : undefined}
        className={cn(
          'relative overflow-hidden bg-black',
          fullscreen
            ? !youtubeStage && 'size-full'
            : cn(
                verticalYouTube ? 'mx-auto' : 'aspect-video w-full',
                'rounded-[12px] shadow-[0_0_0_1px_rgb(243_236_223/0.16),0_0_0_5px_var(--color-sumi-850),0_0_0_6px_var(--color-rule),0_20px_40px_-24px_rgb(0_0_0/0.95)]',
              ),
        )}
      >
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={{ scaleX: mirrored ? -1 : 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18, mass: 0.9 }}
        >
          {hold ? null : !playsFile && video.youtube_id ? (
            <YouTubeStage key={reloadKey} videoId={video.youtube_id} vertical={verticalYouTube} />
          ) : file.status === 'ready' ? (
            // F9 · Inside the mirror: the zoom follows the picture when it flips.
            <PlayerZoomLayer enabled={canZoom} box={box} media={media} live={zoomLive}>
              <FileStage
                src={file.url}
                localSrc={file.cachedUrl}
                offset={video.source === 'youtube' ? Number(video.file_offset_seconds ?? 0) : 0}
              />
            </PlayerZoomLayer>
          ) : null}
        </motion.div>

        {/* Click-catcher keeps YouTube's own UI from intercepting and toggles playback (and takes the zoom gestures). */}
        <button
          type="button"
          data-stage
          aria-label={
            canZoom && zoomed
              ? `${playing ? 'Pausar' : 'Reproducir'} · vídeo ampliado: flechas para moverlo, + y − para el zoom, 0 para verlo entero`
              : playing
                ? 'Pausar'
                : 'Reproducir'
          }
          onKeyDown={onZoomKey}
          onPointerDown={onZoomPointerDown}
          onPointerMove={onZoomPointerMove}
          onPointerUp={onZoomPointerEnd}
          onPointerCancel={onZoomPointerEnd}
          onClick={onStageClick}
          onDoubleClick={() => {
            // A double click on a zoomed video went back to the whole video (onStageClick), not to fullscreen.
            if (pointerType.current === 'mouse' && performance.now() - zoomResetAt.current > 500) void toggleFullscreen();
          }}
          disabled={!ready}
          className={cn(
            'absolute inset-0 z-10 cursor-pointer rounded-[12px] disabled:cursor-default',
            canZoom && (zoomed ? 'cursor-grab touch-none active:cursor-grabbing' : 'touch-pan-y'),
          )}
        />
        {/* 4 · Over the video only what is needed, and only briefly: the zoom amount fades out after a moment. */}
        <ZoomBadge visible={canZoom} className={fullscreen ? 'left-4 top-[max(16px,env(safe-area-inset-top))]' : 'bottom-3 left-3'} />

        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3.5',
            fullscreen && 'hidden',
          )}
        >
          {/* Source credit for YouTube videos (API policies); opens the original at the current second. */}
          {video.source === 'youtube' && video.youtube_id && (
            <a
              href={youTubeWatchUrl(video.youtube_id)}
              target="_blank"
              rel="noreferrer"
              aria-label="Ver en YouTube"
              onClick={(e) => {
                e.currentTarget.href = youTubeWatchUrl(video.youtube_id!, usePlayer.getState().time);
              }}
              // Solid ink under the text (readable over a white frame) and a 44 px hit area around the chip.
              className="pointer-events-auto relative flex items-center gap-1.5 rounded-[6px] bg-sumi-900/90 px-2 py-1 text-[12px] font-medium text-washi-muted transition-colors duration-200 before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[''] hover:text-washi"
            >
              <Youtube className="size-3.5" /> YouTube
            </a>
          )}
          {localOnly && !fullscreen && (
            <button
              type="button"
              onClick={() => void sendToCloud()}
              disabled={upload.isPending}
              className="pointer-events-auto relative flex items-center gap-1.5 rounded-[6px] bg-sumi-900/90 px-2 py-1 text-[12px] font-medium text-washi transition-colors before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[''] disabled:opacity-60"
            >
              {upload.isPending ? <Spinner className="size-3.5" label="Subiendo" /> : <CloudUpload className="size-3.5" />}
              {upload.isPending ? 'Subiendo…' : 'Solo en este dispositivo · Subir a la nube'}
            </button>
          )}
          <RateFlash />
        </div>

        {/*
          4 · No play/pause of ours over the video: a tap on the picture plays or pauses, and the buttons live in the
          bar below (and in fullscreen's bottom bar).
        */}
        <StageSpinner loading={loading} />

        <Countdown />

        {missing && (
          <div className="seigaiha absolute inset-0 z-30 grid place-items-center p-6 text-center">
            <div className="paper-raised max-w-sm rounded-[16px] p-6">
              <FileVideo className="mx-auto size-8 text-kin-300" />
              <p className="mt-3 font-display text-lg font-bold">Este archivo está en otro dispositivo</p>
              <p className="mt-1.5 text-sm text-washi-muted">
                No llegó a subirse a la nube. Elige tu copia de{' '}
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
              <Button
                className="mt-5"
                variant="ghost"
                onClick={() => {
                  usePlayer.setState({ error: null });
                  setReloadKey((k) => k + 1);
                }}
              >
                Reintentar
              </Button>
            </div>
          </div>
        )}

        {!fullscreen && (
          <button
            type="button"
            aria-label="Pantalla completa"
            title="Pantalla completa (F)"
            onClick={() => void toggleFullscreen()}
            className="absolute bottom-2.5 right-2.5 z-20 grid size-11 place-items-center rounded-[10px] bg-sumi-950/55 text-washi/85 transition-colors hover:bg-sumi-950/80 hover:text-washi"
          >
            <Maximize2 className="size-4.5" />
          </button>
        )}
      </div>
      {fullscreen && (
        <>
          <FsSeekFlash />
          <FsChromeLayer stageRef={stageRef}>
            <FsTopBar video={video} />
            <FullscreenBar
              clips={clips}
              onClipSelect={onClipSelect}
              onExit={() => void toggleFullscreen()}
              orientation={showOrientation ? orientation : null}
              onCycleOrientation={cycleOrientation}
            />
          </FsChromeLayer>
          <FsNoteBubble notes={notes} />
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
  // REQ-02 · Fixed orientation: automatic (the view follows the phone), upright or sideways.
  const [orientation, setOrientation] = useState<OrientationPref>('auto');
  const [lockHeld, setLockHeld] = useState(false);
  const deviceLandscape = useDeviceLandscape();
  const touch = useCoarsePointer();

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
        // No orientation lock any more: the view follows how the phone is held (the button fixes it).
        setMode('native');
        return;
      } catch {
        /* fall through to the CSS layer */
      }
    }
    setMode('css');
  }, [mode]);

  useEffect(() => {
    const onChange = () => {
      if (document.fullscreenElement) return;
      // Hand the rotation back to the phone, or it can stay stuck sideways after leaving fullscreen.
      try {
        screen.orientation?.unlock?.();
      } catch {
        /* not locked / not supported */
      }
      setMode((m) => (m === 'native' ? 'none' : m));
      setOrientation('auto');
      setLockHeld(false);
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
    // On document, so it runs after an open menu's own Escape (window, capture phase) and before the
    // studio shortcut on window: Escape leaves fullscreen and must not also clear the A–B range.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      setMode('none');
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
      // 47 · The browser announces no fullscreen exit here: the page under the layer may have been laid out for the
      // other orientation (the phone turned meanwhile), so it is fitted back to the screen and centred.
      refitViewport();
    };
  }, [mode]);
  // Leaving the CSS fullscreen also goes back to automatic (the next time starts clean).
  useEffect(() => {
    if (mode === 'none') {
      setOrientation('auto');
      setLockHeld(false);
    }
  }, [mode]);

  // The orientation lock (native only). If the system refuses, the CSS turn takes over without any message.
  useEffect(() => {
    if (mode !== 'native') return;
    const target = lockTarget(orientation);
    const api = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
    if (!target) {
      setLockHeld(false);
      try {
        api?.unlock?.();
      } catch {
        /* not locked / not supported */
      }
      return;
    }
    let current = true;
    if (!api?.lock) {
      setLockHeld(false);
      return;
    }
    api
      .lock(target)
      .then(() => current && setLockHeld(true))
      .catch(() => current && setLockHeld(false));
    return () => {
      current = false;
    };
  }, [mode, orientation]);

  const cycleOrientation = useCallback(() => setOrientation((o) => nextOrientationPref(o)), []);
  const rotated = mode !== 'none' && needsCssRotation({ pref: orientation, deviceLandscape, lockHeld });

  // The CSS fullscreen (iPhone) is a layer: «Atrás» (or the edge swipe) leaves it, not the song — like Escape.
  const leaveCss = useCallback(() => setMode('none'), []);
  useBackToClose(mode === 'css', leaveCss);

  // Leaving the song while in the native fullscreen: out of it, and the rotation always handed back (by the time this
  // runs the browser may already have dropped the removed stage from fullscreen, and `onChange` is gone).
  useEffect(
    () => () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      try {
        screen.orientation?.unlock?.();
      } catch {
        /* not locked / not supported */
      }
    },
    [],
  );

  return {
    stageRef,
    fullscreen: mode !== 'none',
    toggleFullscreen,
    orientation,
    cycleOrientation,
    rotated,
    showOrientation: mode !== 'none' && showOrientationButton({ cssMode: mode === 'css', touch }),
  };
}

/** The device is held sideways (the window is wider than tall). */
function useDeviceLandscape(): boolean {
  const [landscape, setLandscape] = useState(() => window.matchMedia('(orientation: landscape)').matches);
  useEffect(() => {
    const query = window.matchMedia('(orientation: landscape)');
    const onChange = () => setLandscape(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return landscape;
}

/** A touch screen (a phone or tablet that can turn): the orientation button has something to do there. */
function useCoarsePointer(): boolean {
  return useMemo(() => window.matchMedia('(pointer: coarse)').matches, []);
}

/** The fullscreen layer turned 90° over a screen held the other way: it takes the whole screen, sideways. */
const ROTATED_STAGE_STYLE: CSSProperties = {
  top: 0,
  left: 0,
  right: 'auto',
  bottom: 'auto',
  width: '100dvh',
  height: '100dvw',
  transformOrigin: 'top left',
  transform: 'translateX(100dvw) rotate(90deg)',
};

/**
 * 5 · The fullscreen controls layer. Only this wrapper follows the controls' visibility: its children are elements
 * made by the stage, so React keeps them as they are, and the stage itself never repaints. Always composited
 * (`will-change`), so showing it is an opacity change on a ready layer, not a fresh paint over a playing video.
 * Hit areas inside carry `fs-hit` and only take touches while the layer shows.
 */
function FsChromeLayer({ stageRef, children }: { stageRef: React.RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const shown = useFsChrome((s) => s.shown || s.menu);
  const scrubbing = usePlayer((s) => s.scrubbing);
  const visible = shown || scrubbing;
  useLayoutEffect(() => {
    // The pointer hides with the controls (desktop): an attribute, not a re-render of the stage.
    stageRef.current?.toggleAttribute('data-idle', !visible);
  }, [visible, stageRef]);
  useEffect(() => {
    const el = stageRef.current;
    return () => el?.removeAttribute('data-idle');
  }, [stageRef]);
  return (
    <div
      // Touching any control keeps the controls up; the layer itself lets taps through to the video.
      onPointerDownCapture={fsChrome.wake}
      className={cn(
        'pointer-events-none absolute inset-0 z-30 transition-opacity will-change-[opacity] motion-reduce:transition-none',
        visible ? 'opacity-100 duration-100 [&_.fs-hit]:pointer-events-auto' : 'opacity-0 duration-200',
      )}
    >
      {children}
    </div>
  );
}

/** Double-tap seeks in fullscreen: «−10 s» / «+5 s» for a moment, on the side tapped. */
function FsSeekFlash() {
  const flash = useFsChrome((s) => s.flash);
  return (
    <AnimatePresence>
      {flash && (
        <motion.span
          key={flash.key}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={cn(
            'tabular pointer-events-none absolute top-1/2 z-40 flex -translate-y-1/2 items-center gap-1.5 rounded-full bg-black/60 px-4 py-2.5 font-mono text-base font-semibold text-washi',
            flash.side === 'left' ? 'left-[10%]' : 'right-[10%]',
          )}
        >
          {flash.side === 'left' ? (
            <>
              <ChevronsLeft className="size-5" /> −{flash.seconds} s
            </>
          ) : (
            <>
              +{flash.seconds} s <ChevronsRight className="size-5" />
            </>
          )}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/** How long a new speed stays on the video before it fades (the bar below always shows it). */
const RATE_FLASH_MS = 1500;

/** 4 · The speed over the video only right after it changes (or when the song opens at another speed). */
function RateFlash() {
  const rate = usePlayer((s) => s.rate);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (rate === 1) {
      setShown(false);
      return;
    }
    setShown(true);
    const id = setTimeout(() => setShown(false), RATE_FLASH_MS);
    return () => clearTimeout(id);
  }, [rate]);
  return (
    <AnimatePresence>
      {shown && (
        <motion.span
          key="rate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 0.12 }}
          className="tabular ml-auto rounded-[8px] bg-sumi-950/85 px-2.5 py-1.5 font-mono text-sm font-semibold text-washi"
        >
          {formatSpeed(rate)}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/** Waiting this long before the spinner shows: quick seeks and loop jumps never flash it over the picture. */
const SPINNER_DELAY_S = 0.35;

/** Loading or buffering: its own component, so YouTube's bursts of buffering states never repaint the stage. */
function StageSpinner({ loading }: { loading: boolean }) {
  const buffering = usePlayer((s) => s.buffering);
  if (!loading && !buffering) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: loading ? 0 : SPINNER_DELAY_S, duration: 0.15 }}
      className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
    >
      <Spinner className="size-10 text-washi" label="Cargando vídeo" />
    </motion.div>
  );
}

/** Title and source credit across the top of the fullscreen video. */
function FsTopBar({ video }: { video: Video }) {
  return (
    <div className="absolute inset-x-0 top-0 flex items-start gap-3 bg-[linear-gradient(to_bottom,rgb(0_0_0/0.7),transparent)] pb-10 pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] pt-[max(12px,env(safe-area-inset-top))] sm:pl-[max(24px,env(safe-area-inset-left))] sm:pr-[max(24px,env(safe-area-inset-right))]">
      <p className="min-w-0 flex-1 truncate font-display text-[17px] font-bold text-washi sm:text-xl">{video.title}</p>
      {video.source === 'youtube' && video.youtube_id && (
        <a
          href={youTubeWatchUrl(video.youtube_id)}
          target="_blank"
          rel="noreferrer"
          aria-label="Ver en YouTube"
          onClick={(e) => {
            e.currentTarget.href = youTubeWatchUrl(video.youtube_id!, usePlayer.getState().time);
          }}
          className="fs-hit pointer-events-none relative flex shrink-0 items-center gap-1.5 rounded-[6px] bg-sumi-900/90 px-2 py-1 text-[12px] font-medium text-washi-muted before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[''] hover:text-washi"
        >
          <Youtube className="size-3.5" /> YouTube
        </a>
      )}
      {/* 46 · «Todo / Sin voz / Voz» without leaving fullscreen (only where the split works): a compact panel. */}
      <FsVoiceButton />
    </div>
  );
}

/** 4 · Play/pause in fullscreen's bottom bar (a plain icon: nothing of ours sits in the middle of the video). */
function FsPlayButton() {
  const playing = usePlayer((s) => s.playing);
  const counting = usePlayer((s) => s.countdownEndsAt != null);
  const active = playing || counting;
  return (
    <motion.button
      type="button"
      aria-label={active ? 'Pausar' : 'Reproducir'}
      onClick={() => usePlayer.getState().togglePlay()}
      whileTap={{ scale: 0.86 }}
      transition={jelly}
      className="grid size-11 shrink-0 place-items-center rounded-full text-washi transition-colors hover:bg-washi/15 active:bg-washi/20"
    >
      {active ? <Pause className="size-[22px] fill-current" /> : <Play className="size-[22px] fill-current" />}
    </motion.button>
  );
}

/** Thin YouTube-like progress line: scrub anywhere, A–B band in vermilion, saved clips as thin lines above. */
function FsProgress({ clips, onClipSelect }: { clips: Clip[]; onClipSelect: (clip: Clip) => void }) {
  const duration = usePlayer((s) => s.duration);
  const loop = usePlayer((s) => s.loop);
  const activeClipId = usePlayer((s) => s.activeClipId);
  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  /** Bar rect cached for the whole drag: no forced layout on every pointermove. */
  const rectRef = useRef<DOMRect | null>(null);
  const [hover, setHoverNow] = useState<number | null>(null);
  const hoverFrame = useRef(0);
  const hoverNext = useRef<number | null>(null);
  /** At most one re-render per frame for the time bubble, however fast the pointer moves. */
  const setHover = useCallback((value: number | null) => {
    hoverNext.current = value;
    if (hoverFrame.current) return;
    hoverFrame.current = requestAnimationFrame(() => {
      hoverFrame.current = 0;
      setHoverNow(hoverNext.current);
    });
  }, []);
  const layout = useMemo(() => assignLanes(clips, duration), [clips, duration]);

  // Leaving fullscreen mid-drag unmounts the bar without a pointerup: never leave the player scrubbing.
  useEffect(
    () => () => {
      cancelAnimationFrame(hoverFrame.current);
      if (dragging.current) usePlayer.getState().setScrubbing(false);
    },
    [],
  );

  // Fill, thumb and aria follow the clock through the DOM, so playback never re-renders the bar.
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    let width = bar.clientWidth;
    let lastTime = Number.NaN;
    let lastDuration = Number.NaN;
    let lastSecond = Number.NaN;
    const paint = (time: number, total: number, force = false) => {
      if (!force && time === lastTime && total === lastDuration) return;
      lastTime = time;
      lastDuration = total;
      const f = total > 0 ? Math.min(1, Math.max(0, time / total)) : 0;
      fillRef.current?.style.setProperty('transform', `translate3d(${(f - 1) * 100}%,0,0)`);
      thumbRef.current?.style.setProperty('transform', `translate3d(${f * width}px,0,0)`);
      const second = Math.floor(time);
      if (second !== lastSecond) {
        lastSecond = second;
        bar.setAttribute('aria-valuenow', String(second));
        bar.setAttribute('aria-valuetext', formatTime(second));
      }
    };
    const repaint = () => {
      const { time, duration: total } = usePlayer.getState();
      paint(time, total, true);
    };
    repaint();
    const resize = new ResizeObserver(() => {
      width = bar.clientWidth;
      repaint();
    });
    resize.observe(bar);
    // Under the recorder (`covered`) nothing is painted; uncovering repaints once.
    const unsubscribe = usePlayer.subscribe((s, prev) => {
      if (s.covered) return;
      if (prev.covered) repaint();
      else paint(s.time, s.duration);
    });
    return () => {
      unsubscribe();
      resize.disconnect();
    };
  }, []);

  const pct = (t: number) => (duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0);
  const fractionAt = (point: { clientX: number; clientY: number }) => {
    const rect = (dragging.current && rectRef.current) || barRef.current!.getBoundingClientRect();
    // REQ-02 · Inside the CSS-turned layer the bar runs down the screen.
    return axisFraction(point, rect, inTurnedLayer(barRef.current));
  };
  const scrubAt = (point: { clientX: number; clientY: number }) => usePlayer.getState().scrubTo(fractionAt(point) * duration);
  const release = () => {
    if (!dragging.current) return;
    dragging.current = false;
    rectRef.current = null;
    usePlayer.getState().setScrubbing(false);
  };

  const clipLines = useMemo(() => {
    if (duration <= 0) return null;
    const at = (t: number) => Math.min(100, Math.max(0, (t / duration) * 100));
    return clips.map((clip) => (
      <button
        key={clip.id}
        type="button"
        title={`${clip.name} · ${formatTime(clip.start_seconds)}–${formatTime(clip.end_seconds)}`}
        aria-label={`Reproducir clip ${clip.name}`}
        onClick={() => onClipSelect(clip)}
        className="group/clip absolute flex items-center"
        style={{
          left: `${at(clip.start_seconds)}%`,
          width: `${Math.max(0.6, at(clip.end_seconds) - at(clip.start_seconds))}%`,
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
    ));
  }, [clips, duration, layout, activeClipId, onClipSelect]);

  return (
    <div className="relative">
      {/* clip lines */}
      <div
        className="relative mb-1"
        style={{ height: Math.max(1, layout.count) * 7 }}
        role="group"
        aria-label="Clips guardados"
      >
        {clipLines}
      </div>

      {/* aria-valuenow / aria-valuetext are written once per second by the paint effect above. */}
      <div
        ref={barRef}
        role="slider"
        tabIndex={0}
        aria-label="Progreso"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        // Same keys as the main timeline: ←/→ 5 s (Shift: 1 s), Home/End to either end.
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopPropagation();
            usePlayer.getState().nudge((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 5));
          } else if ((e.key === 'Home' || e.key === 'End') && duration > 0) {
            e.preventDefault();
            e.stopPropagation();
            usePlayer.getState().seek(e.key === 'Home' ? 0 : duration);
          }
        }}
        onPointerDown={(e) => {
          if (!duration) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* synthetic pointer */
          }
          rectRef.current = e.currentTarget.getBoundingClientRect();
          dragging.current = true;
          usePlayer.getState().setScrubbing(true);
          scrubAt(e);
          setHover(fractionAt(e));
        }}
        onPointerMove={(e) => {
          // Fingers only get the time bubble while dragging; a mouse gets it on hover too.
          if (e.pointerType !== 'touch' || dragging.current) setHover(fractionAt(e));
          if (dragging.current) scrubAt(e);
        }}
        onPointerUp={(e) => {
          release();
          if (e.pointerType === 'touch') setHover(null);
        }}
        onPointerCancel={() => {
          release();
          setHover(null);
        }}
        onLostPointerCapture={release}
        onPointerLeave={() => setHover(null)}
        className="group/bar relative flex h-5 cursor-pointer touch-none items-center"
      >
        <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-washi/25 transition-[height] duration-150 group-hover/bar:h-[5px]">
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
          <div ref={fillRef} className="absolute inset-0 rounded-full bg-shu-500 will-change-transform" />
        </div>
        <span
          ref={thumbRef}
          className="pointer-events-none absolute left-0 size-3.5 -translate-x-1/2 scale-0 rounded-full bg-shu-500 shadow transition-[scale] duration-150 group-hover/bar:scale-100"
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
  clips,
  onClipSelect,
  onExit,
  orientation,
  onCycleOrientation,
}: {
  clips: Clip[];
  onClipSelect: (clip: Clip) => void;
  onExit: () => void;
  /** REQ-02 · The fixed-orientation state; null where the button would do nothing (a desktop with a mouse). */
  orientation: OrientationPref | null;
  onCycleOrientation: () => void;
}) {
  const mirrored = usePlayer((s) => s.mirrored);
  const rate = usePlayer((s) => s.rate);
  const loop = usePlayer((s) => s.loop);
  const loopAll = usePlayer((s) => s.loopAll);
  const gap = usePlayer((s) => s.gap);
  const gapAll = usePlayer((s) => s.gapAll);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [gapMenu, setGapMenu] = useState<'all' | 'clip' | null>(null);
  const menuOpen = speedOpen || gapMenu != null;
  // An open menu keeps the controls up (they never auto-hide underneath it).
  useEffect(() => fsChrome.setMenu(menuOpen), [menuOpen]);
  useEffect(() => () => fsChrome.setMenu(false), []);
  const allPress = useLongPress(
    () => setGapMenu('all'),
    () => usePlayer.getState().toggleLoopAll(),
  );
  const clipPress = useLongPress(
    () => setGapMenu('clip'),
    () => usePlayer.getState().toggleLoop(),
  );
  const p = usePlayer.getState();
  const btnBase = 'rounded-full text-washi transition-colors hover:bg-washi/15 active:bg-washi/20';
  const btn = `grid size-11 place-items-center ${btnBase}`;
  /** With a pause set, the seconds sit beside the icon (Transport's badge, same as the bar below). */
  const badged = 'flex h-11 w-auto min-w-11 items-center justify-center gap-1 px-2';

  const speedRef = useRef<HTMLDivElement>(null);
  const speedMenuRef = useRef<HTMLDivElement>(null);
  // Keyboard: focus into the menu, arrows between speeds, back to the button on closing.
  useMenuFocus(speedMenuRef, speedOpen);
  // The phone's back button closes the menu instead of leaving fullscreen and the song.
  useBackToClose(speedOpen, () => setSpeedOpen(false));
  useEffect(() => {
    if (!speedOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!speedRef.current?.contains(e.target as Node)) setSpeedOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setSpeedOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [speedOpen]);

  return (
    <div className="fs-hit pointer-events-none absolute inset-x-0 bottom-0">
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgb(0_0_0/0.75),transparent)]" />
      <div className="px-3 pb-[max(6px,env(safe-area-inset-bottom))] pt-10 sm:px-5">
        <FsPanArrows />
        <FsProgress clips={clips} onClipSelect={onClipSelect} />
        <div className="flex items-center gap-0.5 sm:gap-1">
          <FsPlayButton />
          <FsClock />

          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            <div ref={speedRef} className="relative">
              <button
                type="button"
                aria-label={`Velocidad: ${formatSpeed(rate)}`}
                aria-haspopup="menu"
                aria-expanded={speedOpen}
                onClick={() => setSpeedOpen((v) => !v)}
                className="tabular h-11 rounded-full px-3 font-mono text-[13px] font-semibold text-washi transition-colors hover:bg-washi/15"
              >
                {formatSpeed(rate)}
              </button>
              <AnimatePresence>
                {speedOpen && (
                  <motion.div
                    ref={speedMenuRef}
                    role="menu"
                    aria-label="Velocidad"
                    initial={{ opacity: 0, y: 6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, transition: { duration: 0.1 } }}
                    transition={jelly}
                    className="absolute bottom-12 right-0 grid w-40 grid-cols-2 gap-1 rounded-[12px] bg-sumi-950/95 p-1.5 shadow-xl ring-1 ring-washi/15"
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
                          'tabular flex h-11 w-full items-center justify-center rounded-[8px] font-mono text-[13px]',
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
                aria-label={`Repetir la canción entera${gapAll > 0 ? `, pausa de ${gapAll} s` : ''} (mantén pulsado para la pausa)`}
                aria-pressed={loopAll}
                {...allPress}
                className={cn(gapAll > 0 ? btnBase : btn, gapAll > 0 && badged, loopAll && 'text-ai-300')}
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
                aria-label={`Repetir tramo${gap > 0 ? `, pausa de ${gap} s` : ''} (mantén pulsado para la pausa)`}
                aria-pressed={loop.enabled && hasRange(loop)}
                {...clipPress}
                className={cn(
                  gap > 0 ? btnBase : btn,
                  gap > 0 && badged,
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
            {orientation && (
              <button
                type="button"
                aria-label={orientationButtonLabel(orientation)}
                title={`Orientación ${orientationLabel(orientation)}`}
                onClick={onCycleOrientation}
                className={cn(btn, orientation !== 'auto' && 'text-ai-300')}
              >
                {orientation === 'portrait' ? (
                  <Smartphone className="size-[18px]" />
                ) : orientation === 'landscape' ? (
                  <Smartphone className="size-[18px] rotate-90" />
                ) : (
                  <RotateCw className="size-[18px]" />
                )}
              </button>
            )}
            <button type="button" aria-label="Salir de pantalla completa" className={btn} onClick={onExit}>
              <Minimize2 className="size-[18px]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Only the clock reads the playhead, and only once per second. */
function FsClock() {
  const second = useUnlessCovered((s) => Math.floor(s.time));
  const duration = usePlayer((s) => s.duration);
  return (
    <span className="tabular ml-0.5 whitespace-nowrap font-mono text-[13px] text-washi">
      {formatTime(second)}
      {/* On a narrow upright screen the length gives way to the buttons (it's on the progress line anyway). */}
      <span className="text-washi-subtle max-[420px]:hidden"> / {formatTime(duration)}</span>
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

  // Wake exactly when the shown number changes (each whole second left), not on a fast poll.
  useEffect(() => {
    if (endsAt == null) return;
    let id: ReturnType<typeof setTimeout>;
    const step = () => {
      const t = performance.now();
      setNow(t);
      const left = endsAt - t;
      if (left > 0) id = setTimeout(step, (left % 1000 || 1000) + 5);
    };
    step();
    return () => clearTimeout(id);
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

/** Fullscreen: the note the song just reached, in the bottom-right corner above the controls. */
function FsNoteBubble({ notes }: { notes: Note[] }) {
  const shown = useNoteAlert(notes);
  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={shown.id}
          role="status"
          initial={{ opacity: 0, x: 24, scale: 0.94 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 16, transition: { duration: 0.2 } }}
          transition={jelly}
          className="pointer-events-none absolute bottom-[calc(max(6px,env(safe-area-inset-bottom))+104px)] right-4 z-40 max-w-[min(340px,70vw)] rounded-[12px] bg-washi px-4 py-2.5 text-[15px] font-medium leading-snug text-sumi-900 shadow-[0_14px_30px_-12px_rgb(0_0_0/0.9)] sm:right-6"
        >
          <span className="tabular mr-2 font-mono text-[12px] text-shu-500">{formatTime(shown.at_seconds)}</span>
          {shown.body}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
