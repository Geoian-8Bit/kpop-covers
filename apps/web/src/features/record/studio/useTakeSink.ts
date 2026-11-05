import type { Video } from '@coverscape/shared';
import { IS_IOS, chooseFormat, type RecordFormat } from '../recorder';
import { createTakeSink } from '../takeStore';
import type { Studio } from './useStudioSession';

/**
 * R1 · Where the take is written (prepared before the song starts, dropped when no recorder got it), the format it
 * is recorded with, and the picture it records: the camera's own track (Q5) or the redrawn canvas.
 */
export function useTakeSink(S: Studio, video: Video) {
  const { fx, cam, view, settings, session, recorder, sink, sinkReady, takeTiming, setNotice, setTakeKind } =
    S;

  /** Starts preparing where the next take is written; the song waits for it. */
  const prepareSink = () => {
    if (sinkReady.current) return;
    const id = session.current;
    const promise = createTakeSink(
      {
        videoId: video.id,
        title: video.title,
        mimeType: plannedFormat().mimeType,
        timing: takeTiming.current ?? undefined,
      },
      () => {
        if (id !== session.current || !recorder.current) return;
        setNotice('El móvil se ha quedado sin espacio: la toma termina con lo grabado hasta aquí.');
        void fx.finish();
      },
    );
    sinkReady.current = promise;
    void promise.then((s) => {
      if (id === session.current && sinkReady.current === promise) sink.current = s;
      else void s.discard();
    });
  };

  /** Drops a sink that never got a recorder (cancelled countdown, song that wouldn't start). */
  const dropUnusedSink = () => {
    if (recorder.current) return;
    const pending = sinkReady.current;
    sinkReady.current = null;
    sink.current = null;
    void pending?.then((s) => s.discard());
    fx.unlockOrientation();
    setTakeKind(null);
  };

  /** Ends the canvas capture and lets the frame follow the phone again. */
  const releasePicture = () => {
    S.unwatchSound.current();
    S.unwatchSound.current = () => undefined;
    S.syncedSound.current?.dispose();
    S.syncedSound.current = null;
    S.canvasStream.current?.getTracks().forEach((t) => t.stop());
    S.canvasStream.current = null;
    cam.compositor.current?.lock(false);
    // A direct take recorded the camera's own track: it stays open for the preview.
    S.stopPresented.current();
    S.stopPresented.current = () => undefined;
    S.takePace.current = null;
    S.direct.current = null;
    fx.unlockOrientation();
    setTakeKind(null);
    S.setLockedAspect(null);
  };

  /** Q5: the camera's picture can be recorded as it comes (no digital crop, canvas not forced in settings). */
  function directPossible(): boolean {
    const t = cam.track();
    return (
      // iPhones save a camera's own track lying on its side: they always go through the canvas.
      !IS_IOS &&
      settings.mode === 'auto' &&
      !view.digital &&
      t?.readyState === 'live' &&
      (cam.source.current?.videoWidth ?? 0) > 0
    );
  }

  /** The camera's real rate, rounded to what the recording asks for (30 or 60). */
  function captureFps(): 30 | 60 {
    return (view.mode?.fps ?? 30) >= 45 ? 60 : 30;
  }

  /** Format for the picture as it is now (canvas size, the camera's rate, the chosen quality). */
  function plannedFormat(): RecordFormat {
    // The picture's real size: the camera's mode (the canvas has the same size, once it has drawn a frame).
    const canvas = cam.compositor.current?.canvas;
    const src = cam.source.current;
    const width = src?.videoWidth || view.mode?.width || (canvas && canvas.width > 2 ? canvas.width : 1920);
    const height =
      src?.videoHeight || view.mode?.height || (canvas && canvas.height > 2 ? canvas.height : 1080);
    return chooseFormat({
      width,
      height,
      fps: captureFps(),
      quality: settings.quality,
      codec: settings.codec,
    });
  }

  fx.prepareSink = prepareSink;
  fx.dropUnusedSink = dropUnusedSink;
  fx.releasePicture = releasePicture;
  fx.directPossible = directPossible;
  fx.captureFps = captureFps;
  fx.plannedFormat = plannedFormat;
}
