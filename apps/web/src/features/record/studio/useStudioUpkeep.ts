import { QUALITY_LABEL, resolutionLabel } from '@coverscape/shared';
import { useEffect, useRef } from 'react';
import { usePlayer } from '@/player/store';
import { freeSpace } from '../takeStore';
import type { Studio } from './useStudioSession';

/**
 * What follows the camera and the phase between takes: which picture a take uses, when the settings may open, the
 * hidden canvas frozen while nothing records it, the song kept quiet in the review, the space left, the 30 fps notice.
 */
export function useStudioUpkeep(S: Studio, open: boolean) {
  const {
    cam,
    view,
    settings,
    phase,
    takeKind,
    lockedAspect,
    benchPath,
    recorder,
    setSettingsOpen,
    setNotice,
    setFree,
  } = S;
  /** A take goes through the canvas for a digital zoom, when forced in the settings, or when it can't be direct. */
  const usesCanvas = settings.mode === 'canvas' || view.digital || takeKind === 'canvas';
  /**
   * P19 · The canvas is on screen only when the recorded frame no longer matches the live picture: a canvas take
   * whose phone was turned mid-take (it keeps its first shape, with bars). Otherwise the live video is the preview.
   */
  const canvasOnScreen =
    takeKind === 'canvas' && lockedAspect != null && Math.abs(view.aspect - lockedAspect) > 0.02;
  /**
   * A direct take records this camera's own track: it can't switch camera or lens, crop digitally, or change
   * shape until it ends (the canvas take can, which is why it exists).
   */
  const canChangeCamera = (phase === 'idle' || phase === 'paused') && takeKind !== 'direct';

  // ───────────── A1 · recorder settings ─────────────
  /** Settings reopen the camera and change the format: only between takes. */
  const settingsAllowed = phase === 'idle' && !recorder.current;
  const summary = view.mode
    ? `${resolutionLabel(view.mode.width, view.mode.height)} · ${Math.round(view.mode.fps)} · ${QUALITY_LABEL[settings.quality]}`
    : QUALITY_LABEL[settings.quality];
  useEffect(() => {
    if (!settingsAllowed) setSettingsOpen(false);
  }, [settingsAllowed, setSettingsOpen]);
  const explainDirectLock = () =>
    setNotice(
      'Esta toma graba la imagen de la cámara tal cual: no puede cambiar de cámara a mitad. Termínala con «Listo», o elige «Siempre lienzo» en los ajustes del grabador.',
    );
  const { setDigitalAllowed } = cam;
  useEffect(() => setDigitalAllowed(takeKind !== 'direct'), [setDigitalAllowed, takeKind]);

  // Reviewing: nothing redraws the hidden camera frame, and the song stays quiet under the take's own sound.
  useEffect(() => {
    // P19: the canvas only draws when something records it (a canvas take from its count-in on, or the canvas
    // rehearsal). The preview never needs it: the live video shows the picture, digital zoom included.
    const draws = takeKind === 'canvas' || benchPath === 'canvas';
    cam.compositor.current?.freeze(phase === 'review' || !draws);
    if (!open || phase !== 'review') return;
    usePlayer.getState().pause();
    return usePlayer.subscribe((s) => {
      if (s.playing) s.pause();
    });
  }, [open, phase, cam.compositor, takeKind, benchPath]);

  // Back between takes: the space left changed (a take was written, saved or deleted).
  useEffect(() => {
    if (!open || phase !== 'idle') return;
    let live = true;
    void freeSpace().then((bytes) => {
      if (live) setFree(bytes);
    });
    return () => {
      live = false;
    };
  }, [open, phase, setFree]);

  // Q4: 60 fps was asked for but this camera stays at 30 at this size: say it once per camera.
  const told30 = useRef<string | null>(null);
  useEffect(() => {
    const m = view.mode;
    if (!open || view.status !== 'ready' || !m || view.wantFps !== 60 || m.fps >= 45) return;
    const key = `${view.deviceId}|${m.width}x${m.height}`;
    if (told30.current === key) return;
    told30.current = key;
    setNotice(
      `Esta cámara no da 60 fps en ${resolutionLabel(m.width, m.height)}: graba a ${Math.round(m.fps)}.`,
    );
  }, [open, view.status, view.mode, view.wantFps, view.deviceId, setNotice]);

  return { usesCanvas, canvasOnScreen, canChangeCamera, settingsAllowed, summary, explainDirectLock };
}
