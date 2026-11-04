import { Page } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { ButtonSkin } from '@/components/ui/ButtonSkin';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { useClips } from '@/data/clips';
import { askWho, useMe } from '@/data/members';
import { useNotes } from '@/data/notes';
import type { TakeItem } from '@/data/takes';
import { useUpdateVideo, useVideo } from '@/data/videos';
import { songNotes } from '@/features/review/reviewRules';
import { PerfProbe } from '@/lib/perfProbe';
import { markOpened } from '@/lib/recent';
import { forgetStage, readStage } from '@/lib/stagePref';
import { hasRange, usePlayer } from '@/player/store';
import { useLoopController } from '@/player/useLoopController';
import { useToast } from '@/providers/ToastProvider';
import { type Clip, hasLinkedFile, type Note, round3, youTubeWatchUrl } from '@coverscape/shared';
import { AlertTriangle, ExternalLink, FileVideo, Keyboard, Video as VideoIcon, WifiOff } from 'lucide-react';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { ClipList } from './ClipList';
import { CloudCopyStatus } from './CloudCopyStatus';
import { LinkFilePanel } from './LinkFilePanel';
import { MediaStage } from './MediaStage';
import { NoteDialog, type NoteTarget } from './NoteDialog';
import { SaveClipDialog } from './SaveClipDialog';
import { ShortcutsDialog } from './ShortcutsDialog';
import { SourceRow } from './SourceRow';
import { initialStage, needsLocalCheck } from './stageRules';
import { Dormant } from './studioAsleep';
import {
  FormationEditor,
  FormationsPanel,
  hasDeviceCopy,
  NO_NOTES,
  RecordStudio,
  releaseTakeUrl,
  ReviewScreen,
  type SideTab,
  TakesPanel,
  warmRecordStudio,
} from './studioParts';
import { Timeline } from './Timeline';
import { PlayerBar } from './Transport';
import { useCloseRecorder } from './useCloseRecorder';
import { useShortcuts } from './useShortcuts';
import { VoiceRow } from './VoiceRow';
import { zoomAvailability, ZoomRow } from './ZoomControls';

const NO_CLIPS: Clip[] = [];

export function StudioPage() {
  const { videoId, planId } = useParams();
  const video = useVideo(videoId);
  const clips = useClips(videoId);
  // REQ-21 · A stable empty list while the clips load: a fresh [] every render would defeat the memoised children.
  const clipList = clips.data ?? NO_CLIPS;
  const toast = useToast();
  const { mutate: patchVideo } = useUpdateVideo();
  const [saving, setSaving] = useState(false);
  const [help, setHelp] = useState(false);
  const notes = useNotes(videoId);
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null);
  const [recording, setRecording] = useState(false);
  const { recordButton, closeRecorder } = useCloseRecorder(setRecording);
  const [linking, setLinking] = useState(false);
  const openLinking = useCallback(() => setLinking(true), []);
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
    askWho('Así tus notas llevan tu nombre. Se recuerda en este dispositivo.', () =>
      setNoteTarget({ note: null, at }),
    );
  }, []);
  const openNote = useCallback((note: Note) => setNoteTarget({ note, at: note.at_seconds }), []);
  useShortcuts({
    onSave: openSave,
    onHelp: openHelp,
    onNote: addNote,
    enabled: !planId && !saving && !help && !noteTarget && !recording && !playingTake,
  });

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
        <h1 className="mt-3 font-display text-3xl font-bold">
          {offline ? 'Sin conexión' : 'No pudimos cargar el vídeo'}
        </h1>
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
          <div
            className="grid min-h-[70dvh] place-items-center"
            role="status"
            aria-label="Abriendo el editor de formaciones"
          >
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
              clips={clipList}
              notes={songNoteList}
              onClipSelect={tapClipLine}
              hold={stageHeld}
              onCopyLabel={setCopyLabel}
              placeholder={video.isPlaceholderData}
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
              // REQ-21 · Own layer: scaling it never re-rasterises the drop-shadow.
              className="size-11 shrink-0 drop-shadow-[0_6px_10px_rgb(0_0_0/0.5)] transition-transform will-change-transform hover:scale-105 active:scale-95"
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
                <span className="max-sm:sr-only">
                  {hasLinkedFile(current) ? 'Archivo' : 'Añadir archivo'}
                </span>
              </Button>
            )}
            <Button
              ref={recordButton}
              size="sm"
              aria-label="Grabar baile con la canción"
              onClick={() =>
                askWho('Así tus tomas llevan tu nombre. Se recuerda en este dispositivo.', () =>
                  setRecording(true),
                )
              }
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
                clips={clipList}
                notes={songNoteList}
                onClipSelect={tapClipLine}
                hold={stageHeld}
                onCopyLabel={setCopyLabel}
                placeholder={video.isPlaceholderData}
              />
            </div>
            <Dormant>
              <PerfProbe id="Timeline">
                <Timeline
                  seed={current.id}
                  clips={clipList}
                  onClipSelect={tapClipLine}
                  notes={songNoteList}
                  onNoteOpen={openNote}
                />
              </PerfProbe>
              <PerfProbe id="Transport">
                <PlayerBar onSaveClip={openSave} onAddNote={addNote} />
              </PerfProbe>
              {hasLinkedFile(current) && <SourceRow video={current} copyLabel={copyLabel} />}
              {/* 13 · Only on this device: send a lighter copy to the group (shows only when there's something to say). */}
              <CloudCopyStatus video={current} variant="studio" announce={!linking} />
              {/* 44 · On a phone only the save/clear line of a clip's zoom shows; zooming itself is the fingers' (ZoomControls). */}
              <PerfProbe id="ZoomControls">
                <ZoomRow video={current} clips={clipList} onLink={openLinking} />
              </PerfProbe>
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
                  <div
                    className="grid place-items-center py-10"
                    role="status"
                    aria-label="Cargando formaciones"
                  >
                    <Spinner className="size-6 text-washi-muted" />
                  </div>
                }
              >
                <FormationsPanel video={current} />
              </Suspense>
            ) : sideTab === 'clips' ? (
              <PerfProbe id="ClipList">
                <ClipList
                  clips={clipList}
                  loading={clips.isPending}
                  onApply={applyClip}
                  onNew={openSave}
                />
              </PerfProbe>
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
                  clips={clipList}
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
            <div
              className="fixed inset-0 z-[90] grid place-items-center bg-sumi-950"
              role="status"
              aria-label="Abriendo la cámara"
            >
              <Spinner className="size-9 text-washi-muted" />
            </div>
          }
        >
          <PerfProbe id="RecordStudio">
            <RecordStudio open onClose={closeRecorder} video={current} />
          </PerfProbe>
        </Suspense>
      )}
      {current.source === 'youtube' && (
        <LinkFilePanel
          // REQ-16 · A linked entry's placeholder row never feeds the panel's writes (P3): it opens with the real
          // row. An entry without a file opened from its row before, and still does.
          open={linking && (fresh || !hasLinkedFile(current))}
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
            <div
              className="fixed inset-0 z-[45] grid place-items-center bg-sumi-950"
              role="status"
              aria-label="Abriendo el repaso"
            >
              <Spinner className="size-9 text-washi-muted" />
            </div>
          }
        >
          <PerfProbe id="ReviewScreen">
            <ReviewScreen
              key={playingTake.take.id}
              video={current}
              take={playingTake.take}
              url={playingTake.url}
              clips={clipList}
              onClose={() => {
                releaseTakeUrl(playingTake.url);
                setPlayingTake(null);
              }}
            />
          </PerfProbe>
        </Suspense>
      )}
    </Page>
  );
}
