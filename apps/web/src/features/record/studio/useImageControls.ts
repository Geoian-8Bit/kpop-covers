import { useEffect, useEffectEvent, useMemo, useRef } from 'react';
import { perfMark } from '@/lib/perfProbe';
import {
  canLock,
  canWhiteBalance,
  focusAt,
  lockFocusExposure,
  readTrackInfo,
  setExposureCompensation,
  setWhiteBalance,
} from '../camera';
import { IMAGE_DEFAULT, type ImageState } from '../imageState';
import { quickBarBox } from '../quickBarBox';
import { formatExposure, snapExposure } from '../quickExposureRules';
import { presetLabel } from '../whiteBalanceRules';
import { useCameraZoom } from '../zoomStore';
import type { Studio } from './useStudioSession';

/** P27 · What the «Imagen» stick shows under its name. */
export function imageSummary(s: ImageState): string {
  const parts: string[] = [];
  if (Math.abs(s.exposure) > 0.001) parts.push(`Luz ${formatExposure(s.exposure)}`);
  if (s.kelvin != null) parts.push(presetLabel(s.kelvin));
  if (s.locked) parts.push('Fijo');
  return parts.length ? parts.join(' · ') : 'Automática';
}

/** C1–C4 · Focus where the dancer taps, hold focus and light, the light («Luz») and the colour of the light. */
export function useImageControls(S: Studio) {
  const {
    fx,
    cam,
    view,
    phase,
    clap,
    image,
    setImage,
    imageOpen,
    setNotice,
    setFocusMark,
    setQuickLight,
    cameraBusy,
  } = S;
  /** P48 · Automatic colour stuck during a take: the camera is reopened once the recorder is idle. */
  const wbReopenLater = useRef(false);
  /** P48 · The camera is being reopened for the colour: what to apply again once it is back. */
  const colourReopen = useRef<{ exposure: number; torch: boolean } | null>(null);
  /** What this camera offers (read again when the camera or its mode changes). */
  const trackInfo = useMemo(
    () => (view.status === 'ready' ? readTrackInfo(cam.track()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- REQ-30 · kept: the camera or mode changing is the cue to re-read the live track (cam.track() isn't reactive)
    [view.status, view.deviceId, view.mode],
  );
  const hasImageControls = Boolean(
    trackInfo && (trackInfo.exposureCompensation || canWhiteBalance(trackInfo) || canLock(trackInfo)),
  );
  // Every (re)opened camera starts on automatic (another lens, new settings, back from another app): the controls
  // say so, and a hold that was on is reported as gone.
  const imageRef = useRef(image);
  imageRef.current = image;
  useEffect(() => {
    if (view.status !== 'starting') return;
    // A reopen for the colour has its own notice (and keeps the light).
    if (imageRef.current.locked && !colourReopen.current)
      setNotice('La cámara se ha reiniciado: el enfoque y la luz vuelven a automático.');
    setImage(IMAGE_DEFAULT);
    setFocusMark(null);
    setQuickLight(null);
    // A camera opened afresh is on automatic colour already.
    wbReopenLater.current = false;
  }, [view.status, setNotice, setImage, setFocusMark, setQuickLight]);
  // REQ-03 · The recorder has the camera's picture.
  useEffect(() => {
    if (view.status === 'ready') perfMark('camera-ready');
  }, [view.status]);
  // A tap's ring fades; a lock's ring stays.
  const { focusMark } = S;
  useEffect(() => {
    if (!focusMark || image.locked) return;
    const t = setTimeout(() => setFocusMark(null), 1400);
    return () => clearTimeout(t);
  }, [focusMark, image.locked, setFocusMark]);

  /** A point on screen → 0–1 on the recorded frame (letterboxing and the front camera's mirror undone). */
  function framePoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const host = cam.host.current;
    const src = cam.source.current;
    if (!host || !src?.videoWidth) return null;
    const r = host.getBoundingClientRect();
    const aspect = src.videoWidth / src.videoHeight;
    const w = Math.min(r.width, r.height * aspect);
    const h = w / aspect;
    let x = (clientX - r.left - (r.width - w) / 2) / w;
    let y = (clientY - r.top - (r.height - h) / 2) / h;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    // A digital zoom shows the centre of the frame, enlarged: the point is that much nearer the centre.
    const { crop } = useCameraZoom.getState();
    if (crop > 1.001) {
      x = 0.5 + (x - 0.5) / crop;
      y = 0.5 + (y - 0.5) / crop;
    }
    if (view.facing === 'user') x = 1 - x;
    return { x, y };
  }

  function focusHere(clientX: number, clientY: number, lock: boolean) {
    const info = trackInfo;
    const p = framePoint(clientX, clientY);
    if (!info || !p) return;
    fx.stopBench();
    const t = cam.track();
    setFocusMark({ x: clientX, y: clientY, key: performance.now() });
    // P49 · The quick light bar comes up beside the ring (when this camera has an exposure compensation).
    const root = cam.host.current?.parentElement;
    if (info.exposureCompensation && root && !imageOpen) setQuickLight(quickBarBox(root, clientX, clientY));
    void (async () => {
      if (info.pointsOfInterest) await focusAt(t, p.x, p.y, info);
      if (lock || image.locked) {
        const ok = await lockFocusExposure(t, lock, info);
        if (ok) setImage((s) => ({ ...s, locked: lock }));
      }
    })();
  }

  function changeExposure(value: number) {
    fx.stopBench();
    setImage((s) => ({ ...s, exposure: value }));
    void setExposureCompensation(cam.track(), value);
  }
  /** The latest «Color de la luz» asked for: an older answer never overwrites a newer choice. */
  const wbAsk = useRef(0);
  function changeWhiteBalance(kelvin: number | null) {
    if (!trackInfo) return;
    fx.stopBench();
    const ask = ++wbAsk.current;
    const t = cam.track();
    // A new choice replaces a return to automatic still owed from earlier in the take.
    wbReopenLater.current = false;
    setImage((s) => ({ ...s, kelvin }));
    void setWhiteBalance(t, kelvin, trackInfo).then((result) => {
      // Another camera (or the same one reopened) since: its own reset already says «Auto».
      if (result === 'applied' || result === 'superseded' || ask !== wbAsk.current || cam.track() !== t)
        return;
      setImage((s) => ({ ...s, kelvin: null }));
      if (result === 'auto') {
        // A failed preset left the camera on automatic (checked): say so, as it is.
        if (kelvin != null) setNotice('La cámara no ha aplicado ese color de la luz: sigue en automático.');
        return;
      }
      // P48 · `stuck`: the browser keeps a manual colour while this camera stays open. Reopening it is the sure
      // way back to automatic; never under a take (then once it is over).
      if (cameraBusy.current()) {
        wbReopenLater.current = true;
        setNotice('Este móvil no deja volver al color automático en plena toma: volverá al terminar.');
      } else reopenForColour();
    });
  }
  /**
   * P48 · Back to automatic colour by opening the camera afresh. The light («Luz») and the flash are applied again
   * once it is back; a hold (focus and light fixed) can't be, and the notice says so.
   */
  function reopenForColour() {
    const { exposure, locked } = imageRef.current;
    colourReopen.current = { exposure, torch: view.torch };
    setNotice(
      locked
        ? 'Vuelvo al color automático: la cámara se reinicia un momento y el enfoque fijo se suelta.'
        : 'Vuelvo al color automático: la cámara se reinicia un momento.',
    );
    cam.reopen();
  }
  // The camera is back after that reopen: the same light as before, on this camera's steps, and the flash on again.
  useEffect(() => {
    const keep = colourReopen.current;
    if (!keep || view.status === 'starting') return;
    colourReopen.current = null;
    if (view.status !== 'ready') return;
    // Opening afresh turns the flash off: on again, or said when this camera can't.
    const flashLost = keep.torch && !view.torchAvailable;
    if (keep.torch && view.torchAvailable && !view.torch)
      void cam.toggleTorch().then((ok) => {
        if (!ok) setNotice('La cámara se ha reiniciado: el flash se ha apagado.');
      });
    const ev = trackInfo?.exposureCompensation;
    const light = Math.abs(keep.exposure) >= 0.001;
    if (light && ev) {
      const value = snapExposure(keep.exposure, ev);
      setImage((s) => ({ ...s, exposure: value }));
      setExposureCompensation(cam.track(), value);
    }
    const lost = [
      light && !ev ? 'la luz vuelve a 0' : null,
      flashLost ? 'el flash se ha apagado' : null,
    ].filter(Boolean);
    if (lost.length) setNotice(`La cámara se ha reiniciado: ${lost.join(' y ')}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- REQ-30 · kept: restores the image only when the camera comes back; settings are read at that moment
  }, [view.status, trackInfo]);
  // P48 · Automatic colour is owed (it stuck during a take): the camera reopens as soon as the recorder is idle.
  // REQ-30 · Same trigger as before (the recorder, the clap or the camera changed); the rest is read at that moment.
  const reopenIfOwed = useEffectEvent(() => {
    if (cameraBusy.current()) return;
    wbReopenLater.current = false;
    reopenForColour();
  });
  useEffect(() => {
    if (!wbReopenLater.current || phase !== 'idle' || clap != null || view.status !== 'ready') return;
    reopenIfOwed();
  }, [phase, clap, view.status]);
  function changeLock(locked: boolean) {
    if (!trackInfo) return;
    fx.stopBench();
    void lockFocusExposure(cam.track(), locked, trackInfo).then((ok) => {
      if (ok) setImage((s) => ({ ...s, locked }));
      if (!locked) setFocusMark(null);
    });
  }

  return { trackInfo, hasImageControls, focusHere, changeExposure, changeWhiteBalance, changeLock };
}

export type ImageApi = ReturnType<typeof useImageControls>;
