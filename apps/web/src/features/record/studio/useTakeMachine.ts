import {
  CAMERA_RATE_MIN_SAMPLES,
  HEAT_WARN_MINUTES,
  resolutionClass,
  resolutionLabel,
  restRateFps,
  tooManyDrops,
  type Video,
} from '@coverscape/shared';
import { useCallback, useEffect } from 'react';
import { scheduleCountIn, unlockAudio } from '@/lib/metronome';
import { hasRange, usePlayer } from '@/player/store';
import { canvasSize, watchPresentedFrames } from '../compositor';
import { judgePace, paceLog, pacePendingNotice, paceRest } from '../pace';
import { countedPace, type PaceCounts } from '../paceSkip';
import { markFormatBad, takeFileName } from '../recorder';
import { recordSettings } from '../settings';
import { primeSyncAudio } from '../syncAudio';
import { releaseTake } from '../takeStore';
import { judgeTake, takeFrames } from './takeVerdict';
import type { StartApi } from './useStartChoice';
import type { Studio } from './useStudioSession';
import { ARM_TIMEOUT_MS, type Span } from './types';

/**
 * The take itself: idle → (countdown) → arming → recording ⇄ paused → finishing → review, with the shutter that
 * drives it, the clock while rolling and the pauses the phone forces (camera lost, app hidden, song stopped).
 */
export function useTakeMachine(S: Studio, start: StartApi, open: boolean, video: Video) {
  const {
    fx,
    cam,
    view,
    viewNow,
    phase,
    setPhase,
    phaseRef,
    timer,
    hereAt,
    session,
    recorder,
    meter,
    takePace,
  } = S;
  const { setNotice, setSeconds, setLeft, setSpan, setTakeKind, setLastStats } = S;
  const { fromNow } = start;

  const clearTimers = () => {
    S.timers.current.forEach(clearTimeout);
    S.timers.current = [];
    S.cancelTicks.current();
    S.cancelTicks.current = () => undefined;
    cancelAnimationFrame(S.armFrame.current);
    S.armFrame.current = 0;
    endCountWatch(false);
  };

  /**
   * P19 review · The countdown is over (`keep`: the take goes on to roll) or cancelled: stop measuring it, and keep
   * its rate and delay when it really ran on the same camera.
   */
  function endCountWatch(keep: boolean) {
    const c = S.countWatch.current;
    if (!c) return;
    S.countWatch.current = null;
    c.watch.stop();
    if (!keep || cam.track() !== c.track) return;
    const fps = restRateFps(c.watch.count(), (performance.now() - c.at) / 1000);
    const lagMs = c.watch.lag.size() >= CAMERA_RATE_MIN_SAMPLES ? c.watch.lag.median() : null;
    S.countRest.current = { fps, lagMs };
  }

  /** What the rolling take has counted so far (pace skips). */
  function paceCounts(): PaceCounts {
    const mt = meter.current;
    return {
      drawn: mt?.drawn.value() ?? 0,
      delivered: mt?.delivered?.value() ?? 0,
      seconds: recorder.current?.seconds() ?? 0,
    };
  }

  const pausePart = useCallback(() => {
    fx.clearTimers();
    usePlayer.getState().pause();
    if (recorder.current) {
      recorder.current.pause();
      meter.current?.drawn.hold();
      meter.current?.delivered?.hold();
      takePace.current?.watch.sampleLag(false);
      setSeconds(recorder.current.seconds());
      setPhase('paused');
    } else {
      fx.dropUnusedSink();
      setPhase('idle');
    }
  }, [fx, recorder, meter, takePace, setSeconds, setPhase]);

  // A direct take only goes on with the same camera and picture shape: a turned phone pauses it.
  const { takeKind } = S;
  useEffect(() => {
    const src = cam.source.current;
    if (takeKind !== 'direct' || !src) return;
    const onResize = () => {
      const d = S.direct.current;
      if (!d || (src.videoWidth === d.width && src.videoHeight === d.height)) return;
      if (['countdown', 'arming', 'recording'].includes(phaseRef.current)) {
        pausePart();
        setNotice('Has girado el móvil: ponlo como al empezar para seguir, o termina la toma con «Listo».');
      }
    };
    src.addEventListener('resize', onResize);
    return () => src.removeEventListener('resize', onResize);
  }, [takeKind, cam.source, pausePart, phaseRef, setNotice, S.direct]);

  // An armed clap counts too: a camera reopening then would answer a clap with «La cámara no está lista».
  S.cameraBusy.current = () =>
    phaseRef.current !== 'idle' || recorder.current != null || S.clapRes.current != null;

  S.cameraLost.current = () => {
    if (!['countdown', 'arming', 'recording'].includes(phaseRef.current)) return;
    pausePart();
    setNotice('La cámara se ha cortado: la grabación está en pausa.');
  };

  const finish = useCallback(async () => {
    const rec = recorder.current;
    if (!rec || phaseRef.current === 'finishing') return;
    const id = session.current;
    fx.clearTimers();
    recorder.current = null;
    const written = S.sink.current;
    S.sink.current = null;
    S.sinkReady.current = null;
    usePlayer.getState().pause();
    setSeconds(rec.seconds());
    const m = meter.current;
    meter.current = null;
    m?.drawn.hold();
    m?.delivered?.hold();
    const drawnFrames = m?.drawn.value() ?? 0;
    const deliveredFrames = m?.delivered?.value() ?? 0;
    const canvas = Boolean(m?.delivered);
    const { expected, dropped, realFps } = takeFrames({
      drawn: drawnFrames,
      delivered: deliveredFrames,
      canvas,
      seconds: rec.seconds(),
    });
    // P19 review · The pace, without the first 2 s of the take and of each resume: frames, and how late the preview
    // showed them. Callbacks the page missed and the median rate are only logged (they don't judge a direct take).
    const tp = takePace.current;
    const lagMs = tp?.watch.lag.median() ?? null;
    const total: PaceCounts = { drawn: drawnFrames, delivered: deliveredFrames, seconds: rec.seconds() };
    const kept = tp ? countedPace(total, tp.skips.skipped(total)) : null;
    const counted = kept
      ? {
          frames: kept.drawn,
          delivered: kept.delivered,
          missed: tp?.watch.missed() ?? 0,
          seconds: kept.seconds,
        }
      : null;
    const captureFps = tp?.watch.cameraFps() ?? null;
    const countdown = S.countRest.current;
    setPhase('finishing');
    const blob = await rec.finish();
    fx.releasePicture();
    if (id !== session.current) {
      // The recorder closed meanwhile: the take stays on disk, offered next time (not locked by this window).
      if (written) releaseTake(written.id);
      return;
    }
    if (!blob.size) {
      void written?.discard();
      // Nothing came out of a recorder that ran: this phone's encoder can't do that format, use the next one.
      const failed = S.takeFormat.current?.mimeType;
      if (failed && rec.pieces() === 0 && rec.seconds() > 2) {
        markFormatBad(failed);
        setNotice('Este formato no funciona en este móvil. Vuelve a grabar: se usará otro.');
      } else setNotice('No se ha grabado nada. Prueba otra vez.');
      setPhase('idle');
      return;
    }
    const file = new File([blob], takeFileName(video, blob.type), { type: blob.type });
    setLastStats({
      bytes: blob.size,
      seconds: rec.seconds(),
      mimeType: blob.type || rec.mimeType(),
      requestedBps: S.takeFormat.current?.videoBitsPerSecond ?? 0,
      dropped,
      expected,
      realFps,
      lagMs,
      restFps: countdown?.fps ?? null,
      missed: canvas ? null : (counted?.missed ?? null),
      sync: S.takeSync.current,
    });
    // Confirmed by a second measurement, the next takes step down by themselves (60 → 30, or a smaller size) and the
    // review says so (takeVerdict.ts). (Read from a ref: this callback is memoised.)
    const mode = viewNow.current.mode;
    const rest = mode ? paceRest(mode) : null;
    const verdict = judgeTake({
      canvas,
      mode,
      wantFps: viewNow.current.wantFps,
      counted,
      lagMs,
      rest,
      countdown,
    });
    const judged =
      mode && verdict !== 'unknown' ? judgePace(verdict, resolutionClass(mode.width, mode.height)) : 'none';
    paceLog('take', {
      kind: canvas ? 'canvas' : 'direct',
      mode: mode ? `${mode.width}x${mode.height}@${Math.round(mode.fps)}` : null,
      seconds: rec.seconds(),
      counted,
      fps: counted && counted.seconds > 0 ? counted.frames / counted.seconds : null,
      cameraFps: captureFps,
      lagMs,
      rest,
      countdown,
      verdict,
      judged,
    });
    if (judged === 'learnt' && mode) {
      setNotice(
        `Esta toma no ha ido fluida: este móvil no puede con este modo. Las próximas se graban ${verdict === 'fps30' ? 'a 30 fps' : 'en 1080p'}.`,
      );
    } else if (judged === 'pending' && mode) {
      setNotice(pacePendingNotice(resolutionLabel(mode.width, mode.height)));
    } else if (tooManyDrops(dropped, expected)) {
      const now = recordSettings();
      setNotice(
        now.fps === 60 || now.quality === 'max'
          ? 'Se han perdido fotogramas: prueba 30 fps o calidad Alta en los ajustes del grabador.'
          : 'Se han perdido fotogramas: cierra otras apps y vuelve a probar.',
      );
    }
    fx.replaceTake({ url: URL.createObjectURL(file), file }, written?.where === 'disk' ? written.id : null);
    S.reviewTiming.current = S.takeTiming.current;
    if (S.reviewTake.current && written?.failed()) S.reviewTake.current.noSpace = true;
    setPhase('review');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- REQ-30 · kept: once per finished recording; the take in progress is read as it was then
  }, [video]);

  /** Start the song and wait until it really moves (YouTube may still be loading) before rolling. */
  const go = () => {
    endCountWatch(true);
    const engine = usePlayer.getState().engine;
    if (!engine) {
      setNotice('El reproductor no está listo.');
      setPhase(S.countFrom.current);
      return;
    }
    const id = session.current;
    setPhase('arming');
    phaseRef.current = 'arming';
    // A new take needs its place on the phone first (a few ms): the song waits for it.
    // A direct take also waits for the screen's rotation lock, asked for now, once the phone is in place.
    const orientation = S.orientation;
    if (!recorder.current && !orientation.current.tried) fx.lockForDirect();
    if (!recorder.current && (!S.sink.current || orientation.current.pending)) {
      if (!S.sinkReady.current) fx.prepareSink();
      void Promise.all([S.sinkReady.current!, orientation.current.ready]).then(
        () => {
          if (id === session.current && phaseRef.current === 'arming') go();
        },
        () => undefined,
      );
      return;
    }
    usePlayer.getState().play();
    const began = performance.now();
    let prev = engine.getCurrentTime();
    let moving = 0;
    const check = () => {
      S.armFrame.current = 0;
      if (id !== session.current || phaseRef.current !== 'arming') return;
      const t = engine.getCurrentTime();
      // Two frames in a row moving forward: playing, not just landing on a seek.
      moving = t > prev + 0.001 ? moving + 1 : 0;
      prev = t;
      // …and a camera frame already drawn, or the take would lock to an empty 2×2 canvas.
      if (moving >= 2 && frameReady()) return fx.roll();
      if (performance.now() - began > ARM_TIMEOUT_MS) {
        usePlayer.getState().pause();
        setNotice('La canción no arranca. Dale al play una vez en el reproductor y vuelve a intentarlo.');
        if (S.countFrom.current === 'idle') fx.dropUnusedSink();
        setPhase(S.countFrom.current);
        return;
      }
      S.armFrame.current = requestAnimationFrame(check);
    };
    S.armFrame.current = requestAnimationFrame(check);
  };

  const countIn = (back: 'idle' | 'paused') => {
    S.countFrom.current = back;
    unlockAudio();
    primeSyncAudio(S.songTrack.current, S.micTrack.current);
    // P19 review · A new take's countdown measures the camera as it is right now (same light, nothing encoding).
    if (back === 'idle') {
      S.countRest.current = null;
      endCountWatch(false);
      const src = cam.source.current;
      if (timer > 0 && src)
        S.countWatch.current = {
          watch: watchPresentedFrames(src),
          at: performance.now(),
          track: cam.track(),
        };
    }
    if (timer === 0) return go();
    setPhase('countdown');
    setLeft(timer);
    S.cancelTicks.current = scheduleCountIn(timer);
    for (let i = 1; i < timer; i++) S.timers.current.push(setTimeout(() => setLeft(timer - i), i * 1000));
    S.timers.current.push(setTimeout(go, timer * 1000));
  };

  /** Where this take starts and ends in the song. */
  function songSpan(): Span {
    const p = usePlayer.getState();
    const end = p.duration > 0 ? p.duration : Number.POSITIVE_INFINITY;
    if (fromNow === 'range' && hasRange(p.loop)) return { start: p.loop.start, end: p.loop.end };
    if (fromNow === 'here') return { start: hereAt, end };
    return { start: 0, end };
  }

  /**
   * The canvas holds a frame of this take: drawn after the shutter (not one left from an older take or rehearsal,
   * maybe of another shape) and of the picture's size now, or the take would lock to a stale frame.
   */
  function frameReady() {
    if (recorder.current) return true;
    if (fx.directPossible() && S.orientation.current.locked) return true;
    const c = cam.compositor.current;
    const src = cam.source.current;
    if (!c || !src?.videoWidth) return false;
    const want = canvasSize(src.videoWidth, src.videoHeight);
    return (
      c.counts().drawn > S.drawnAtShutter.current &&
      c.canvas.width === want.width &&
      c.canvas.height === want.height
    );
  }

  function shutter() {
    const now = phaseRef.current;
    if (now === 'idle') {
      if (view.status !== 'ready' || !cam.source.current?.videoWidth) return;
      fx.stopBench();
      S.drawnAtShutter.current = cam.compositor.current?.counts().drawn ?? 0;
      setNotice('');
      // A take that can't be direct (iPhone, canvas forced, digital zoom) starts drawing the canvas now, during
      // the count-in; the rotation lock for a direct take is asked for when the count-in ends (go).
      S.orientation.current = { pending: false, locked: false, tried: false, ready: Promise.resolve() };
      if (!fx.directPossible()) setTakeKind('canvas');
      const s = songSpan();
      const p = usePlayer.getState();
      S.spanRef.current = s;
      // F3/F5: what the take is synced to (saved with it; recovered takes keep it too).
      S.takeTiming.current = {
        songStart: s.start,
        songEnd: Number.isFinite(s.end) ? s.end : null,
        speed: p.rate,
        mirrored: p.mirrored,
        clipId: fromNow === 'range' ? p.activeClipId : null,
      };
      S.heatWarned.current = false;
      S.fromClap.current = S.clapFiring.current;
      S.clapFiring.current = false;
      setSpan(s);
      setSeconds(0);
      p.pause();
      p.seek(s.start);
      fx.prepareSink();
      countIn('idle');
    } else if (now === 'countdown') {
      fx.clearTimers();
      if (S.countFrom.current === 'idle') fx.dropUnusedSink();
      setPhase(S.countFrom.current);
    } else if (now === 'arming' || now === 'recording') {
      pausePart();
    } else if (now === 'paused') {
      if (view.status !== 'ready') return;
      const d = S.direct.current;
      if (d) {
        if (cam.track() !== d.track) {
          setNotice('La cámara se ha reiniciado: esta toma no puede seguir. Termínala con «Listo».');
          return;
        }
        const src = cam.source.current;
        if (src && (src.videoWidth !== d.width || src.videoHeight !== d.height)) {
          setNotice('Pon el móvil como al empezar la toma para seguir grabando, o termínala con «Listo».');
          return;
        }
      }
      countIn('paused');
    }
  }

  // While rolling: the clock ticks, the take ends with the song (or the A–B section), and a song that
  // stops on its own (YouTube ad, connection) pauses the take instead of filming nothing.
  useEffect(() => {
    if (phase !== 'recording') return;
    let quietSince = 0;
    const near = (time: number) => {
      const s = S.spanRef.current;
      return s != null && time >= s.end - 0.12;
    };
    const unsubscribe = usePlayer.subscribe((s) => {
      if (near(s.time)) void finish();
    });
    const clock = setInterval(() => {
      const recorded = recorder.current?.seconds() ?? 0;
      // P19: only the ref; the clock in the top bar reads it on its own, the recorder doesn't re-render.
      S.secondsExact.current = recorded;
      // P19 review · The pace is counted 2 s after the take's start and after each resume (they stutter a little).
      const tp = takePace.current;
      if (tp && meter.current && tp.skips.tick(paceCounts())) tp.watch.sampleLag(true);
      // R3: long takes at the heaviest settings heat the phone; say so once per take.
      const now = recordSettings();
      const heavy = now.quality === 'max' || (view.mode?.width ?? 0) * (view.mode?.height ?? 0) > 2560 * 1440;
      if (heavy && !S.heatWarned.current && recorded > HEAT_WARN_MINUTES * 60) {
        S.heatWarned.current = true;
        setNotice(
          `Llevas más de ${HEAT_WARN_MINUTES} min en calidad Máxima: el móvil se calienta. Para tomas largas, mejor Alta.`,
        );
      }
      const s = usePlayer.getState();
      if (s.playing) {
        quietSince = 0;
        return;
      }
      quietSince ||= performance.now();
      if (performance.now() - quietSince < 1200) return;
      if (near(s.time + 0.5)) void finish();
      else {
        pausePart();
        setNotice('La canción se ha parado: la grabación está en pausa.');
      }
    }, 200);
    return () => {
      unsubscribe();
      clearInterval(clock);
    };
  }, [
    phase,
    finish,
    pausePart,
    view.mode,
    recorder,
    meter,
    takePace,
    setNotice,
    S.spanRef,
    S.secondsExact,
    S.heatWarned,
  ]);

  // Leaving the app mid-take pauses it (phones stop the camera in the background).
  useEffect(() => {
    if (!open) return;
    const onHide = () => {
      if (
        document.visibilityState === 'hidden' &&
        ['countdown', 'arming', 'recording'].includes(phaseRef.current)
      )
        pausePart();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [open, pausePart, phaseRef]);

  fx.clearTimers = clearTimers;
  fx.paceCounts = paceCounts;
  fx.pausePart = pausePart;
  fx.finish = finish;
  fx.shutter = shutter;
  return { finish, shutter };
}
