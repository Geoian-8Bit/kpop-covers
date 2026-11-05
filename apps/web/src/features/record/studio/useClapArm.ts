import { useEffect, useEffectEvent } from 'react';
import { unlockAudio } from '@/lib/metronome';
import { openMic } from '../camera';
import { createListeningContext } from '../clap/listeningContext';
import { loadClapArm } from './lazyPanels';
import { primeSyncAudio } from '../syncAudio';
import type { Studio } from './useStudioSession';

/** F7 · Armed for a double clap: the take starts from wherever the dancer stands. */
export function useClapArm(S: Studio) {
  const { fx, view, phase, phaseRef, clap, setClap, clapRes, supported, session, setNotice, cam } = S;

  /** Arms: the microphone is asked for now if the take doesn't already use it (songs from a file don't). */
  function armClap() {
    if (phaseRef.current !== 'idle' || clapRes.current || !supported || view.status !== 'ready') return;
    fx.stopBench();
    setNotice('');
    S.setSettingsOpen(false);
    S.setImageOpen(false);
    S.setInfoOpen(false);
    unlockAudio();
    primeSyncAudio(S.songTrack.current, S.micTrack.current);
    // Made inside the tap: Safari only lets audio start in one.
    const ctx = createListeningContext();
    if (!ctx) {
      setNotice('Este navegador no puede escuchar el micrófono: graba con el botón.');
      return;
    }
    const res: { ctx: AudioContext | null; track: MediaStreamTrack | null } = { ctx, track: null };
    clapRes.current = res;
    const id = session.current;
    // REQ-23 · Armed only once the armed view is here (usually preloaded with the camera: then it is the same frame).
    // A failed load arms nothing — no microphone, no view — and the next tap tries again.
    void loadClapArm().then(
      () => {
        if (clapRes.current !== res) return; // disarmed meanwhile (that closed the context)
        if (id !== session.current || phaseRef.current !== 'idle') disarmClap();
        else armed(res, id);
      },
      () => {
        if (clapRes.current === res) disarmClap();
      },
    );
  }

  /** Second half of arming, once the view can show: the armed state and the microphone. */
  function armed(res: { ctx: AudioContext | null; track: MediaStreamTrack | null }, id: number) {
    const ctx = res.ctx;
    if (!ctx) return;
    setClap({ ctx, track: null });
    const live = S.micTrack.current?.readyState === 'live' ? S.micTrack.current : null;
    // The take's own microphone is copied (stopping the copy leaves the take's alone).
    void (live ? Promise.resolve(live.clone()) : openMic('mono')).then((track) => {
      if (id !== session.current || clapRes.current !== res) {
        track?.stop();
        return;
      }
      if (!track) {
        disarmClap();
        setNotice(
          'Para oír el aplauso hace falta el micrófono, y no hay permiso o no está disponible. Permítelo en el navegador o graba con el botón.',
        );
        return;
      }
      res.track = track;
      setClap({ ctx, track });
    });
  }

  /** Stops listening and frees the microphone copy and the analysis. */
  function disarmClap() {
    const res = clapRes.current;
    clapRes.current = null;
    res?.track?.stop();
    if (res?.ctx && res.ctx.state !== 'closed') void res.ctx.close().catch(() => undefined);
    setClap(null);
  }

  /** The double clap: the take starts exactly as with the shutter (same count-in, span and saved sync). */
  function clapFired() {
    disarmClap();
    if (phaseRef.current !== 'idle') return;
    if (view.status !== 'ready' || !cam.source.current?.videoWidth) {
      setNotice('La cámara no está lista: no se ha podido empezar. Vuelve a armar.');
      return;
    }
    S.clapFiring.current = true;
    fx.shutter();
    S.clapFiring.current = false;
  }

  /** From the review: back to waiting for a clap (asking first when the take would be lost). */
  function armAgain() {
    if (S.keepingRef.current) return;
    if (!(S.saved || S.kept)) {
      S.setConfirm('rearm');
      return;
    }
    fx.again();
    phaseRef.current = 'idle';
    armClap();
  }

  // Armed only while nothing else runs: a take started another way (a key on the shutter behind the overlay, the
  // recovery of a leftover) disarms, so the microphone and its analysis are never left open.
  // REQ-30 · Keyed on «armed or not», as before; `disarmClap` only touches refs and a setter, so the effect event
  // (always the latest one) does exactly what the captured one did.
  const isArmed = clap != null;
  const disarm = useEffectEvent(disarmClap);
  useEffect(() => {
    if (isArmed && phase !== 'idle') disarm();
  }, [phase, isArmed]);

  // Back while armed disarms (the studio stays open).
  useEffect(() => {
    if (!isArmed) return;
    const onPop = () => disarm();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isArmed]);

  fx.armClap = armClap;
  fx.disarmClap = disarmClap;
  return { armClap, disarmClap, clapFired, armAgain };
}
