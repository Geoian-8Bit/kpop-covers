import { LOW_SPACE_MINUTES, minutesLeft, minutesPhrase, type Video } from '@coverscape/shared';
import { AnimatePresence } from 'motion/react';
import { Suspense, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { setExposureCompensation } from './camera';
import { heavyMode, pacePending, paceRest } from './pace';
import { badVersion } from './recorder';
import { nextStartKind, startLabel } from './startRules';
import { BottomControls } from './studio/BottomControls';
import { CameraPreview } from './studio/CameraPreview';
import { CountIn } from './studio/CountIn';
import { FocusLayer } from './studio/FocusLayer';
import { ClapArm, preloadLevel, preloadPanels } from './studio/lazyPanels';
import { StudioConfirm } from './studio/StudioConfirm';
import { TakeReviewPane } from './studio/TakeReviewPane';
import { OverlaysLayer } from './studio/OverlaysLayer';
import { SoundChip, StudioTopBar } from './studio/StudioTopBar';
import { ToolsRail, startButtonShown } from './studio/ToolsRail';
import { useBench } from './studio/useBench';
import { useClapArm } from './studio/useClapArm';
import { useCloseGuard } from './studio/useCloseGuard';
import { imageSummary, useImageControls } from './studio/useImageControls';
import { useLeftover } from './studio/useLeftover';
import { useOrientationLock } from './studio/useOrientationLock';
import { usePreviewGestures } from './studio/usePreviewGestures';
import { useReviewActions } from './studio/useReviewActions';
import { useStartChoice } from './studio/useStartChoice';
import { useStudioSession } from './studio/useStudioSession';
import { useStudioUpkeep } from './studio/useStudioUpkeep';
import { useTakeMachine } from './studio/useTakeMachine';
import { useTakeRoll } from './studio/useTakeRoll';
import { useTakeSink } from './studio/useTakeSink';
import { useTakeSound } from './studio/useTakeSound';

/**
 * TikTok-style recording: the camera like the phone's own (vertical or horizontal as the phone is held,
 * 0.5×–5× zoom, flash, front/back), a count-in, then the song and the camera start together. The file
 * carries the song's own sound when the source allows it (uploaded files) and the microphone otherwise
 * (YouTube). The take goes to the phone through a download or the share sheet.
 *
 * REQ-27 · Split from a 2950-line component: the hooks in ./studio hold the logic (useStudioSession owns the
 * state), the components the picture. Hook order is the old effect order.
 */
export function RecordStudio({ open, onClose, video }: { open: boolean; onClose: () => void; video: Video }) {
  const S = useStudioSession(open, video);
  const start = useStartChoice(S, open, video);
  const { songPossible, songSoundLabel } = useTakeSound(S, open);
  const img = useImageControls(S);
  const previewHandlers = usePreviewGestures(S, img);
  useOrientationLock(S);
  useTakeSink(S, video);
  const up = useStudioUpkeep(S, open);
  const { remeasure } = useBench(S, open);
  const { finish, shutter } = useTakeMachine(S, start, open, video);
  useTakeRoll(S);
  const clapApi = useClapArm(S);
  const { requestClose } = useCloseGuard(S, open, onClose);
  const review = useReviewActions(S, video, onClose);
  const { recoverLeftover } = useLeftover(S, video);

  const { cam, view, settings, phase, confirm, imageOpen, infoOpen, settingsOpen, startListOpen } = S;
  const {
    setInfoOpen,
    setImageOpen,
    setSettingsOpen,
    setSettingsOnly,
    setStartListOpen,
    setNotice,
    setConfirm,
  } = S;
  const { trackInfo } = img;
  const { fromOptions, fromNow, clips, startChoice } = start;

  const camReady = view.status === 'ready';
  const canTweak = phase === 'idle' || phase === 'paused';
  const showCamera = phase !== 'review';
  const vertical = view.aspect < 1;
  // What the next take will use; asked again only when the camera or its shape changes.
  const nextFormat = useMemo(
    () => (camReady ? S.fx.plannedFormat() : null),
    [S.fx, camReady, view.aspect, view.deviceId, view.mode, settings.codec, settings.quality, badVersion],
  );
  const spaceMinutes =
    S.free != null && nextFormat
      ? minutesLeft(S.free, nextFormat.videoBitsPerSecond + nextFormat.audioBitsPerSecond)
      : null;
  const lowSpace = spaceMinutes != null && spaceMinutes < LOW_SPACE_MINUTES;

  // REQ-23 · The panels a tap opens, fetched once the camera is ready (they are out of the recorder's chunk).
  useEffect(() => {
    if (camReady) preloadPanels();
  }, [camReady]);
  // The level shows as soon as the camera does: when it is on, it is fetched alongside the camera opening.
  useEffect(() => {
    if (open && settings.level) preloadLevel();
  }, [open, settings.level]);

  if (!open) return null;

  const { timer } = S;
  return createPortal(
    <div
      className="fixed inset-0 z-[90] select-none overflow-hidden bg-black text-washi"
      role="dialog"
      aria-modal="true"
      aria-label="Grabar baile"
    >
      <CameraPreview
        source={cam.source}
        host={cam.host}
        aspect={view.aspect}
        facing={view.facing}
        showCamera={showCamera}
        canvasOnScreen={up.canvasOnScreen}
        handlers={previewHandlers}
      />

      <StudioTopBar
        phase={phase}
        span={S.span}
        title={video.title}
        mode={view.mode}
        wantFps={view.wantFps}
        camReady={camReady}
        settingsAllowed={up.settingsAllowed}
        summary={up.summary}
        readSeconds={() => S.recorder.current?.seconds() ?? S.secondsExact.current}
        onClose={requestClose}
        onQuality={() => {
          // P26: the chip opens only its own setting (quality, size and frame rate).
          setSettingsOnly('quality');
          setSettingsOpen(true);
        }}
      />

      {showCamera && camReady && (canTweak || phase === 'recording') && (
        <ToolsRail
          phase={phase}
          canTweak={canTweak}
          canChangeCamera={up.canChangeCamera}
          timer={timer}
          torchAvailable={view.torchAvailable}
          torch={view.torch}
          flashElsewhere={cam.flashElsewhere}
          noTorchHint={cam.noTorchHint}
          startShown={startButtonShown(fromOptions.length, clips.data)}
          startChoice={startChoice}
          startListOpen={startListOpen}
          hasImageControls={img.hasImageControls}
          settingsAllowed={up.settingsAllowed}
          imageOpen={imageOpen}
          settingsOpen={settingsOpen}
          infoShown={settings.info}
          infoOpen={infoOpen}
          onFlip={cam.flip}
          onExplainLock={up.explainDirectLock}
          onTimer={start.cycleTimer}
          onTorch={() => {
            S.fx.stopBench();
            cam.toggleTorch();
          }}
          onNoTorch={() => setNotice(cam.noTorchHint ?? 'Esta lente no tiene flash.')}
          onStartTap={() => {
            if (fromOptions.length > 1) S.setFrom(nextStartKind(fromNow, fromOptions));
            else setStartListOpen(true);
          }}
          onStartList={() => {
            setInfoOpen(false);
            setImageOpen(false);
            setStartListOpen(true);
          }}
          onImage={() => {
            setInfoOpen(false);
            setImageOpen((v) => !v);
          }}
          onSettings={() => {
            setInfoOpen(false);
            setImageOpen(false);
            setSettingsOnly(null);
            setSettingsOpen(true);
          }}
          onInfo={() => {
            setImageOpen(false);
            setInfoOpen((v) => !v);
          }}
        />
      )}

      <FocusLayer
        focusMark={S.focusMark}
        locked={S.image.locked}
        showCamera={showCamera}
        quickLight={
          S.quickLight &&
          trackInfo?.exposureCompensation &&
          showCamera &&
          camReady &&
          !imageOpen &&
          !confirm &&
          S.clap == null
            ? S.quickLight
            : null
        }
        quickRange={trackInfo?.exposureCompensation ?? null}
        exposure={S.image.exposure}
        onAdjustStart={S.fx.stopBench}
        onPreview={(v) => setExposureCompensation(cam.track(), v)}
        onCommit={img.changeExposure}
        onDismiss={() => S.setQuickLight(null)}
      />

      <OverlaysLayer
        covered={confirm != null}
        showCamera={showCamera}
        camReady={camReady}
        aspect={view.aspect}
        grid={settings.grid}
        level={settings.level}
        image={{
          open: imageOpen,
          info: trackInfo,
          state: S.image,
          onExposure: img.changeExposure,
          onExposurePreview: (v) => {
            S.fx.stopBench();
            setExposureCompensation(cam.track(), v);
          },
          onWhiteBalance: img.changeWhiteBalance,
          onLock: img.changeLock,
          onClose: () => setImageOpen(false),
        }}
        settings={{
          open: settingsOpen && up.settingsAllowed && !confirm,
          onClose: () => setSettingsOpen(false),
          maxSize:
            trackInfo?.maxWidth && trackInfo.maxHeight
              ? { width: trackInfo.maxWidth, height: trackInfo.maxHeight }
              : null,
          maxFps: trackInfo?.maxFrameRate ?? null,
          songPossible,
          summary: up.summary,
          only: S.settingsOnly,
          image: img.hasImageControls
            ? {
                summary: imageSummary(S.image),
                onOpen: () => {
                  setSettingsOpen(false);
                  setInfoOpen(false);
                  setImageOpen(true);
                },
              }
            : null,
        }}
        start={{
          open: startListOpen && phase === 'idle',
          current: startChoice,
          hereAt: fromOptions.includes('here') ? S.hereAt : null,
          range: S.loopRange,
          clips: clips.data ?? [],
          onPick: start.pickStart,
          onClose: () => setStartListOpen(false),
        }}
        info={{
          open: infoOpen,
          track: cam.track(),
          format: nextFormat,
          deviceId: view.deviceId,
          mode:
            (S.takeKind ?? (up.usesCanvas ? 'canvas' : 'direct')) === 'direct'
              ? 'Directa (la imagen de la cámara tal cual)'
              : 'Lienzo (cada fotograma se redibuja)',
          pace: view.paceCapped
            ? 'Más ligera: este móvil no fue fluido con lo pedido'
            : S.benchPath
              ? 'Midiendo…'
              : 'Como se pide',
          video: showCamera ? cam.source.current : null,
          bench: S.benchStats,
          rest: view.mode ? paceRest(view.mode) : null,
          onRemeasure:
            up.settingsAllowed &&
            !S.benchPath &&
            (view.paceCapped ||
              S.benchStats != null ||
              pacePending() ||
              (view.mode != null && heavyMode(view.mode)))
              ? remeasure
              : undefined,
          paceHint:
            view.mode && !heavyMode(view.mode) && !view.paceCapped
              ? 'La fluidez se mide sola al grabar a 60 fps o por encima de 1080p.'
              : undefined,
          last: S.lastStats,
          onClose: () => setInfoOpen(false),
        }}
      />

      {phase === 'idle' && camReady && S.sound !== 'pending' && (
        <SoundChip
          sound={S.sound}
          songPossible={songPossible}
          songSoundLabel={songSoundLabel}
          stereo={settings.micChannels === 'stereo'}
          rate={S.rate}
          onToggle={() => settings.set({ sound: settings.sound === 'song' ? 'mic' : 'song' })}
        />
      )}

      <CountIn
        phase={phase}
        left={S.left}
        starting={view.status === 'starting'}
        showCamera={showCamera}
        error={view.status === 'error' ? view.error : null}
        supported={S.supported}
        onRetry={cam.retry}
      />

      {showCamera && (
        <BottomControls
          phase={phase}
          span={S.span}
          camReady={camReady}
          canTweak={canTweak}
          supported={S.supported}
          notice={S.notice}
          leftover={S.leftover}
          leftoverCount={S.leftoverCount}
          videoId={video.id}
          lowSpace={lowSpace}
          spaceMinutes={spaceMinutes}
          benchRunning={S.benchPath != null}
          digital={view.digital}
          chips={cam.chips}
          activeChip={cam.activeChip}
          canChangeCamera={up.canChangeCamera}
          clapArmed={S.clap != null}
          hint={
            phase === 'idle' && camReady
              ? `${vertical ? 'Vertical' : 'Horizontal'} · ${startLabel(startChoice).line}${timer ? ` · cuenta de ${timer} s` : ''}${spaceMinutes != null && !lowSpace ? ` · espacio para ${minutesPhrase(spaceMinutes)}` : ''}`
              : phase === 'paused'
                ? 'En pausa · toca para seguir o «Listo» para terminar'
                : phase === 'countdown'
                  ? 'Toca para cancelar'
                  : ''
          }
          onRecover={() => void recoverLeftover()}
          onDropLeftover={() => setConfirm('leftover')}
          onChip={(c) => {
            S.fx.stopBench();
            if (!cam.pickChip(c, up.canChangeCamera)) up.explainDirectLock();
          }}
          onArm={clapApi.armClap}
          onDiscard={() => setConfirm('discard')}
          onShutter={shutter}
          onFinish={() => void finish()}
        />
      )}

      {phase === 'review' && S.take && (
        <TakeReviewPane
          take={S.take}
          seconds={S.seconds}
          saved={S.saved}
          kept={S.kept}
          keeping={S.keeping}
          canKeep={review.canKeep}
          fromClap={S.fromClap.current}
          keepMsg={S.keepMsg}
          notice={S.notice}
          onDetails={() => setInfoOpen(true)}
          onKeep={(save) => void review.keepInApp(save)}
          onSave={() => void review.save()}
          onShare={() => void review.share()}
          onAgain={() => (S.saved || S.kept ? review.again() : setConfirm('again'))}
          onArmAgain={clapApi.armAgain}
        />
      )}

      {/* F7 · Armed: waiting for the double clap, over the camera. */}
      <Suspense fallback={null}>
        <AnimatePresence>
          {S.clap && phase === 'idle' && (
            <ClapArm
              key="clap"
              ctx={S.clap.ctx}
              track={S.clap.track}
              sensitivity={settings.clapSensitivity}
              onSensitivity={(clapSensitivity) => settings.set({ clapSensitivity })}
              onFire={clapApi.clapFired}
              onCancel={clapApi.disarmClap}
              onTimeout={() => {
                clapApi.disarmClap();
                setNotice(
                  'No ha llegado la señal en 3 minutos: se ha desarmado. Pulsa «Armar» para esperar otra vez.',
                );
              }}
            />
          )}
        </AnimatePresence>
      </Suspense>

      <StudioConfirm
        confirm={confirm}
        reviewing={phase === 'review'}
        onCancel={() => setConfirm(null)}
        onDiscard={review.confirmDiscard}
      />
    </div>,
    document.body,
  );
}
