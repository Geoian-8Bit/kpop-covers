import { usePlayer } from '@/player/store';
import { createFrameMeter, watchPresentedFrames } from '../compositor';
import { createSkipWindows } from '../paceSkip';
import { createTakeRecorder, markFormatBad, type TakeRecorder } from '../recorder';
import { syncTakeAudio } from '../syncAudio';
import type { Studio } from './useStudioSession';

/** The song is really playing: the camera starts (or goes on) right now. */
export function useTakeRoll(S: Studio) {
  const { fx, cam, settings, sound, recorder, phaseRef, setNotice, setPhase, setTakeKind } = S;
  const roll = () => {
    if (!recorder.current) {
      const compositor = cam.compositor.current;
      if (!compositor) return fx.pausePart();
      try {
        // Q5: the camera's own picture when nothing needs redrawing (no digital zoom, canvas not forced);
        // otherwise the canvas, which can also follow a flipped camera or a turned phone mid-take.
        let videoTracks: MediaStreamTrack[];
        const camTrack = cam.track();
        const src = cam.source.current;
        // Direct only with the rotation locked: a turned phone would change the frame size under the recorder.
        if (fx.directPossible() && S.orientation.current.locked && camTrack && src) {
          videoTracks = [camTrack];
          S.direct.current = { track: camTrack, width: src.videoWidth, height: src.videoHeight };
          const presented = watchPresentedFrames(src);
          S.stopPresented.current = presented.stop;
          S.takePace.current = { watch: presented, skips: createSkipWindows() };
          S.meter.current = { drawn: createFrameMeter(presented.count), delivered: null };
          setTakeKind('direct');
        } else {
          // The preview is still the live video: its delay says how the take's picture keeps up.
          if (src) {
            const presented = watchPresentedFrames(src);
            S.stopPresented.current = presented.stop;
            S.takePace.current = { watch: presented, skips: createSkipWindows() };
          }
          compositor.lock(true);
          S.setLockedAspect(
            compositor.canvas.height > 0 ? compositor.canvas.width / compositor.canvas.height : null,
          );
          const picture = compositor.stream();
          S.canvasStream.current = picture;
          videoTracks = picture.getVideoTracks();
          S.meter.current = {
            drawn: createFrameMeter(() => compositor.counts().drawn),
            delivered: createFrameMeter(() => compositor.counts().delivered),
          };
          setTakeKind('canvas');
        }
        // The song's sound if it's still there, else the microphone; say so when there's neither.
        const audio = [S.songTrack.current, S.micTrack.current].find((t) => t?.readyState === 'live') ?? null;
        if (!audio && sound !== 'none') setNotice('No llega el sonido: esta toma se graba sin audio.');
        const target = S.sink.current;
        if (!target) throw new Error('no sink');
        // 43 · The recorded sound is delayed to where the dancer heard it (speaker + camera latency); the preview
        // and what plays are untouched. `audio` stays the one watched for going away.
        const how = {
          sound: audio === S.songTrack.current ? 'song' : 'mic',
          path: S.direct.current ? 'direct' : 'canvas',
        } as const;
        const synced = audio
          ? syncTakeAudio(audio, {
              ...how,
              fps: fx.captureFps(),
              drawLagMs: S.direct.current ? null : compositor.drawLagMs(),
              trimMs: settings.syncTrimMs,
            })
          : null;
        S.syncedSound.current = synced;
        S.takeSync.current = synced
          ? {
              ...synced.plan,
              ...how,
              applied: synced.applied,
              songAtRoll: usePlayer.getState().engine?.getCurrentTime() ?? null,
            }
          : null;
        if (S.takeSync.current) target.setSync(S.takeSync.current);
        const tracks = [...videoTracks, ...(synced ? [synced.track] : [])];
        // A format the browser claims but whose encoder refuses to start: remember it and try the next one.
        let rec: TakeRecorder | null = null;
        for (let attempt = 0; attempt < 6 && !rec; attempt++) {
          const format = fx.plannedFormat();
          S.takeFormat.current = format;
          try {
            const next: TakeRecorder = createTakeRecorder(tracks, format, target, () => {
              // The browser stopped recording by itself: keep what exists rather than filming nothing.
              if (recorder.current !== next) return;
              setNotice('La grabación se ha cortado. Te dejo lo grabado hasta ahí.');
              void fx.finish();
            });
            next.start();
            rec = next;
          } catch (err) {
            // Only a refused format is remembered; any other error is not the format's fault.
            const refused = err instanceof DOMException && err.name === 'NotSupportedError';
            if (!format.mimeType || !refused) throw err;
            markFormatBad(format.mimeType);
          }
        }
        if (!rec) throw new Error('no format');
        recorder.current = rec;
        target.setMimeType(rec.mimeType());
        if (audio) {
          // Sound lost mid-take (headphones out, Bluetooth gone): pause rather than go on silent.
          const onEnded = () => {
            if (phaseRef.current !== 'recording') return;
            fx.pausePart();
            setNotice('Se ha perdido el sonido: la grabación está en pausa.');
          };
          audio.addEventListener('ended', onEnded);
          S.soundLost.current = onEnded;
          // 43 · …or the context that delays it interrupted (iOS: a call, Siri) or the delayed copy ended, and it
          // didn't come back within a moment.
          const unwatchSync = synced?.watch(onEnded) ?? (() => undefined);
          S.unwatchSound.current = () => {
            audio.removeEventListener('ended', onEnded);
            unwatchSync();
          };
        }
      } catch {
        recorder.current = null;
        fx.releasePicture();
        usePlayer.getState().pause();
        setNotice('Este navegador no puede grabar vídeo. Prueba en Chrome o Safari actualizados.');
        setPhase('idle');
        return;
      }
    } else if (!recorder.current.resume()) {
      setNotice('La grabación se ha cortado. Te dejo lo grabado hasta ahí.');
      void fx.finish();
      return;
    } else {
      // 43 · Its sound may have stopped while paused (iOS: a call): woken again, or the take pauses with the notice.
      S.syncedSound.current?.ensure(() => S.soundLost.current());
    }
    S.meter.current?.drawn.run();
    S.meter.current?.delivered?.run();
    // P19 review · The take's start and each resume stutter a little (the song starting): their first 2 s are not
    // counted nor sampled; the clock starts sampling once they're over.
    const tp = S.takePace.current;
    if (tp) {
      tp.watch.sampleLag(false);
      tp.skips.start(fx.paceCounts());
    }
    setPhase('recording');
  };
  fx.roll = roll;
}
