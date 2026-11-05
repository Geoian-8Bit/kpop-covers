import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useStageStems } from '@/data/stems';
import { useLinkLocalFile, useUploadToCloud } from '@/data/videos';
import { cloudLimitBytes } from '@/lib/backend/mode';
import { cn } from '@/lib/cn';
import { MARK_PLAYER_READY, perfMark, PerfProbe } from '@/lib/perfProbe';
import { friendlyError } from '@/lib/supabase';
import { useYouTubeMeta } from '@/lib/youtubeMeta';
import { FileStage } from '@/player/FileStage';
import { usePlayer } from '@/player/store';
import { YouTubeStage } from '@/player/YouTubeStage';
import { isDoubleTap, isZoomed, NO_ZOOM } from '@/player/zoom';
import { useMediaBox } from '@/player/ZoomLayer';
import { useToast } from '@/providers/ToastProvider';
import {
  type Clip,
  hasLinkedFile,
  isVerticalAspect,
  type Note,
  type Video,
  youTubeWatchUrl,
} from '@coverscape/shared';
import { AlertTriangle, CloudUpload, FileVideo, Maximize2, Youtube } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFileSource } from './fileSource';
import { useStagePinch } from './useStagePinch';
import { Countdown } from './fullscreen/Countdown';
import { FsNoteBubble } from './fullscreen/FsNoteBubble';
import { FullscreenBar } from './fullscreen/FullscreenBar';
import { FsChromeLayer, FsSeekFlash, FsTopBar, RateFlash, StageSpinner } from './fullscreen/stageOverlays';
import { fsChrome, useFsChromeDriver } from './fullscreenChrome';
import {
  axisFraction,
  inTurnedLayer,
  needsAspectProbe,
  resolveAspect,
  youtubeFsBox,
  youtubeInlineBox,
} from './fullscreenRules';
import { groupCopyLabel, playsGroupCopy } from './stageRules';
import { STAGE_SOURCE } from './studioParts';
import { ROTATED_STAGE_STYLE, useFullscreen } from './useFullscreen';
import { PlayerZoomLayer, zoomAvailability, ZoomBadge } from './ZoomControls';

export function MediaStage({
  video,
  clips,
  notes,
  onClipSelect,
  hold = false,
  onCopyLabel,
  placeholder = false,
}: {
  video: Video;
  clips: Clip[];
  notes: Note[];
  onClipSelect: (clip: Clip) => void;
  /** 12 · The stage isn't decided yet (looking for a device copy): no player mounts until it is. */
  hold?: boolean;
  /** [4] · Tells the page when the file on the stage is the group's lighter copy (its «Vídeo» row says so). */
  onCopyLabel?: (label: string | null) => void;
  /**
   * REQ-16 · `video` is still the library's row (P3): the file plays from it, but nothing that writes is offered
   * («Subir a la nube», «Vincular archivo») and «not here» isn't concluded until the real row says so.
   */
  placeholder?: boolean;
}) {
  // 5 · Only what the stage itself needs: buffering, speed and the controls' visibility live in small components,
  // so none of them repaints the stage (and the players inside it).
  const mirrored = usePlayer((s) => s.mirrored);
  const playing = usePlayer((s) => s.playing);
  const ready = usePlayer((s) => s.ready);
  // REQ-03 · The engine is ready to play (YouTube onReady, or the file's metadata): once per video opened.
  useEffect(() => {
    if (ready) perfMark(MARK_PLAYER_READY);
  }, [ready, video.id]);
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
    !placeholder &&
    video.source === 'upload' &&
    !video.storage_path &&
    file.status === 'ready' &&
    file.local != null &&
    file.local.size <= cloudLimitBytes();

  async function sendToCloud() {
    if (file.status !== 'ready' || !file.local || upload.isPending) return;
    const copy = new File([file.local], video.file_name ?? 'video.mp4', {
      type: file.local.type || 'video/mp4',
    });
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
  const zoomTap = useRef<{
    last: { at: number; x: number; y: number } | null;
    timer?: ReturnType<typeof setTimeout>;
  }>({ last: null });
  const zoomResetAt = useRef(0);
  // [4] · The group's lighter copy (not the original) on the stage: the «Vídeo» row names it, with its real size.
  const copyLabel =
    playsFile &&
    !hold &&
    file.status === 'ready' &&
    !file.local &&
    playsGroupCopy({
      fromCloud: Boolean(video.storage_path),
      originalBytes: video.file_size,
      limitBytes: cloudLimitBytes(),
    })
      ? groupCopyLabel(media)
      : null;
  useEffect(() => {
    onCopyLabel?.(copyLabel);
  }, [copyLabel, onCopyLabel]);
  useEffect(() => () => onCopyLabel?.(null), [onCopyLabel]);
  useEffect(() => () => clearTimeout(zoomTap.current.timer), []);

  const {
    zoomLive,
    pointerType,
    swallowClickUntil,
    onZoomPointerDown,
    onZoomPointerMove,
    onZoomPointerEnd,
    onZoomKey,
  } = useStagePinch({ boxEl, canZoom, box, media, mirrored });

  const missing = !placeholder && playsFile && file.status === 'missing';
  const loading = !ready && !error && !missing;
  const { stageRef, fullscreen, toggleFullscreen, orientation, cycleOrientation, rotated, showOrientation } =
    useFullscreen();
  const youtubeStage = !playsFile && Boolean(video.youtube_id);
  // REQ-02 · A video stored as horizontal or unknown is asked again (oEmbed through /shorts/ tells a short apart).
  const aspectProbe = useYouTubeMeta(youtubeStage && needsAspectProbe(video) ? video.youtube_id : null);
  const aspect = resolveAspect(
    video.aspect_ratio,
    aspectProbe.status === 'ok' ? aspectProbe.aspectRatio : null,
  );
  const verticalYouTube = youtubeStage && isVerticalAspect(aspect);
  // 5 · The controls' visibility lives in its own small store: showing them never repaints this stage.
  useFsChromeDriver(fullscreen);
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
        style={
          youtubeStage
            ? fullscreen
              ? youtubeFsBox(aspect)
              : (youtubeInlineBox(aspect) ?? undefined)
            : undefined
        }
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
            <PerfProbe id="PlayerZoomLayer">
              <PlayerZoomLayer enabled={canZoom} box={box} media={media} live={zoomLive}>
                <FileStage
                  src={file.url}
                  localSrc={file.cachedUrl}
                  offset={video.source === 'youtube' ? Number(video.file_offset_seconds ?? 0) : 0}
                />
              </PlayerZoomLayer>
            </PerfProbe>
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
            if (pointerType.current === 'mouse' && performance.now() - zoomResetAt.current > 500)
              void toggleFullscreen();
          }}
          disabled={!ready}
          className={cn(
            'absolute inset-0 z-10 cursor-pointer rounded-[12px] disabled:cursor-default',
            canZoom && (zoomed ? 'cursor-grab touch-none active:cursor-grabbing' : 'touch-pan-y'),
          )}
        />
        {/* 4 · Over the video only what is needed, and only briefly: the zoom amount fades out after a moment. */}
        <ZoomBadge
          visible={canZoom}
          className={fullscreen ? 'left-4 top-[max(16px,env(safe-area-inset-top))]' : 'bottom-3 left-3'}
        />

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
              {upload.isPending ? (
                <Spinner className="size-3.5" label="Subiendo" />
              ) : (
                <CloudUpload className="size-3.5" />
              )}
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
