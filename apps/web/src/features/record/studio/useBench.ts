import { resolutionClass, resolutionLabel } from '@coverscape/shared';
import { useEffect } from 'react';
import {
  benchDone,
  forgetPace,
  heavyMode,
  judgePace,
  paceLog,
  paceNotice,
  pacePendingNotice,
  runBench,
  settleBench,
} from '../pace';
import { IS_IOS } from '../recorder';
import type { Studio } from './useStudioSession';

/**
 * P19 · The silent rehearsal: once per phone, camera mode and format, a couple of seconds after the camera is
 * ready and only while nothing else happens (at most one try per opening). A phone that doesn't keep up twice in a
 * row steps down (60 → 30, or a smaller size) and says so; the camera reopens lighter on its own (the cap is part
 * of its mode). A first «too slow» is only said; the next opening's rehearsal (or a long take) confirms it or not.
 */
export function useBench(S: Studio, open: boolean) {
  const {
    fx,
    cam,
    view,
    settings,
    phase,
    clap,
    recorder,
    supported,
    session,
    bench,
    benchTried,
    benchNonce,
  } = S;
  const { setBenchPath, setBenchStats, setBenchNonce, setNotice, setQuickLight, notice } = S;
  const clapArmed = clap != null;
  // P49 · Anything that covers the preview (a panel, a dialog, the armed clap, the review) sends the quick light bar
  // away for good: it only comes back with a new tap, placed for that tap.
  const quickCovered =
    S.imageOpen ||
    S.infoOpen ||
    S.settingsOpen ||
    S.startListOpen ||
    S.confirm != null ||
    clapArmed ||
    phase === 'review';
  useEffect(() => {
    if (quickCovered) setQuickLight(null);
  }, [quickCovered, setQuickLight]);
  useEffect(() => {
    if (open) benchTried.current = new Set();
  }, [open, benchTried]);
  // The main lens found while a take was rolling opens once the recorder is idle again (not while armed).
  const { retryMainLens } = cam;
  useEffect(() => {
    if (open && phase === 'idle' && !clapArmed) retryMainLens();
  }, [open, phase, clapArmed, retryMainLens]);
  useEffect(() => {
    const m = view.mode;
    if (!open || phase !== 'idle' || view.status !== 'ready' || !m || !supported || clapArmed) return;
    if (recorder.current || typeof MediaRecorder === 'undefined') return;
    // Nothing lighter to step down to: no rehearsal (it would only cost battery).
    if (!heavyMode(m)) return;
    const installed =
      typeof matchMedia === 'function' &&
      matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
    const path: 'direct' | 'canvas' =
      !IS_IOS && settings.mode === 'auto' && !view.digital && installed ? 'direct' : 'canvas';
    const format = fx.plannedFormat();
    const key = `${m.width}x${m.height}@${Math.round(m.fps)}|${format.mimeType}|${path}|${view.deviceId}`;
    if (benchDone(m, format, path) || benchTried.current.has(key)) return;
    const id = session.current;
    let canvasStreamForBench: MediaStream | null = null;
    const wait = setTimeout(() => {
      const video = cam.source.current;
      const track = cam.track();
      const compositor = cam.compositor.current;
      if (!video || !track || track.readyState !== 'live' || !compositor) return;
      if (document.visibilityState !== 'visible') return;
      let canvas: { track: MediaStreamTrack; frames: () => number } | undefined;
      if (path === 'canvas') {
        try {
          canvasStreamForBench = compositor.stream();
          const t = canvasStreamForBench.getVideoTracks()[0];
          if (!t) return;
          canvas = { track: t, frames: () => compositor.counts().drawn };
        } catch {
          return;
        }
        setBenchPath('canvas');
      } else setBenchPath('direct');
      benchTried.current.add(key);
      const b = runBench({ video, track, format, mode: m, wantFps: view.wantFps, path, canvas });
      bench.current = b;
      void b.done.then((result) => {
        if (bench.current === b) bench.current = null;
        canvasStreamForBench?.getTracks().forEach((t) => t.stop());
        canvasStreamForBench = null;
        setBenchPath(null);
        if (!result || id !== session.current) return;
        setBenchStats(result);
        const label = resolutionLabel(m.width, m.height);
        const judged = judgePace(result.verdict, resolutionClass(m.width, m.height));
        settleBench(m, format, path, result.verdict, judged);
        paceLog('rehearsal judged', { verdict: result.verdict, judged });
        if (judged === 'learnt') setNotice(paceNotice(result.verdict, label) ?? '');
        else if (judged === 'pending') setNotice(pacePendingNotice(label));
        else if (result.verdict === 'warn') setNotice(paceNotice('warn', label) ?? '');
      });
    }, 1500);
    return () => {
      clearTimeout(wait);
      // The rehearsal's own promise lets go of its canvas stream and says it stopped.
      bench.current?.cancel();
      bench.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- REQ-30 · kept: re-runs only on what changes the rehearsal; the rest is read fresh and must not restart it mid-take
  }, [
    open,
    phase,
    view.status,
    view.mode,
    view.deviceId,
    view.digital,
    view.wantFps,
    settings.mode,
    settings.codec,
    settings.quality,
    supported,
    clapArmed,
    benchNonce,
  ]);

  /**
   * P19 review · Anything that touches the camera during a rehearsal (zoom, lens, flash, focus, light, the shutter)
   * would make its frames look slow: it is cancelled, without judging.
   */
  function stopBench() {
    const b = bench.current;
    if (!b) return;
    bench.current = null;
    b.cancel();
  }
  fx.stopBench = stopBench;

  /** «Volver a medir» (panel «i»): forget what was learnt here and rehearse again now. */
  function remeasure() {
    forgetPace();
    benchTried.current.clear();
    setBenchStats(null);
    setBenchNonce((n) => n + 1);
  }

  // Notices fade on their own.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(t);
  }, [notice, setNotice]);

  return { clapArmed, remeasure };
}
