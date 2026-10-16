import { cameraRequest } from '@coverscape/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyTrack,
  cameraError,
  listBackLenses,
  openCamera,
  readAbilities,
  settleCameraMode,
  type BackLenses,
  type Facing,
} from './camera';
import { createCompositor, type Compositor } from './compositor';
import { initialFacing, recordSettings, useRecordSettings } from './settings';

export interface CameraView {
  status: 'starting' | 'ready' | 'error';
  error: string;
  facing: Facing;
  deviceId: string | null;
  /** The lens's own zoom range (null: zoom is digital, on the recorded frame). */
  lensZoom: { min: number; max: number } | null;
  /** Zoom as the phone's camera app shows it: 0.5 is the ultra-wide, 1 the main lens. */
  zoom: number;
  torchAvailable: boolean;
  torch: boolean;
  lenses: BackLenses;
  /** Width / height of the picture: below 1 is vertical. */
  aspect: number;
  /** The picture is a crop of the frame (no lens zoom here): less sharp, the recorder says so (Q7). */
  digital: boolean;
  /** What the camera really gives (Q3/Q4); null until open. */
  mode: { width: number; height: number; fps: number } | null;
  /** The frame rate asked for, to tell when the camera stayed at 30. */
  wantFps: 30 | 60;
}

/** Zoom without a lens zoom: a crop of the recorded frame, kept to what still looks sharp. */
const DIGITAL_MAX = 4;
const INITIAL: CameraView = {
  status: 'starting',
  error: '',
  facing: 'user',
  deviceId: null,
  lensZoom: null,
  zoom: 1,
  torchAvailable: false,
  torch: false,
  lenses: { ids: [], ultra: null },
  aspect: 9 / 16,
  digital: false,
  mode: null,
  wantFps: 30,
};

export const formatZoom = (z: number) => `${(Math.round(z * 10) / 10).toString().replace('.', ',')}×`;

/**
 * The studio's camera: picture only (sound is the recorder's business), drawn through the compositor
 * so the preview is the recorded frame. Lens, zoom, flash and pinch behave like the phone's camera app.
 */
export function useCamera(open: boolean, onLost: () => void) {
  const onLostRef = useRef(onLost);
  onLostRef.current = onLost;
  const source = useRef<HTMLVideoElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const compositor = useRef<Compositor | null>(null);
  const stream = useRef<MediaStream | null>(null);
  /** Bumped on every camera request and on close: a late answer is stopped, not kept. */
  const session = useRef(0);
  const [view, setView] = useState<CameraView>(INITIAL);
  const viewRef = useRef(view);
  viewRef.current = view;

  const track = () => stream.current?.getVideoTracks()[0];
  /** False during a direct take: zoom only through the lens. */
  const digitalAllowed = useRef(true);
  const setDigitalAllowed = useCallback((allowed: boolean) => {
    digitalAllowed.current = allowed;
  }, []);

  const stopStream = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  /** `zoomAfter`: the zoom (as the camera app counts it) to land on once this lens is open. */
  const start = useCallback(async (facing: Facing, deviceId: string | null = null, zoomAfter = 1) => {
    const id = ++session.current;
    // Phones hand out one camera at a time: let go of the old one first.
    stopStream();
    setView((v) => ({ ...v, status: 'starting', facing, torch: false }));
    try {
      const want = cameraRequest(recordSettings());
      const next = await openCamera(facing, deviceId, want);
      if (id !== session.current) {
        next.getTracks().forEach((t) => t.stop());
        return;
      }
      // Q3/Q4: the size first; 60 fps only when it doesn't cost resolution.
      const mode = await settleCameraMode(next.getVideoTracks()[0], want);
      if (id !== session.current) {
        next.getTracks().forEach((t) => t.stop());
        return;
      }
      compositor.current?.setFps(mode.fps);
      stream.current = next;
      const video = source.current;
      if (video) {
        video.srcObject = next;
        void video.play().catch(() => undefined);
      }
      const t = next.getVideoTracks()[0];
      const abilities = readAbilities(t);
      const actualId = t?.getSettings?.().deviceId || deviceId;
      const onUltra =
        facing === 'environment' && actualId != null && actualId === viewRef.current.lenses.ultra;
      // Land on the asked zoom with this lens's own numbers (state from the old lens is not used).
      const scale = onUltra ? 0.5 : 1;
      let zoom = scale * (abilities.zoom ? abilities.zoomNow : 1);
      let digital = false;
      compositor.current?.setZoom(1);
      if (Math.abs(zoomAfter - zoom) > 0.01) {
        if (abilities.zoom) {
          const z = Math.min(abilities.zoom.max, Math.max(abilities.zoom.min, zoomAfter / scale));
          if (await applyTrack(t, { zoom: z })) zoom = z * scale;
          if (id !== session.current) return;
        } else {
          const z = Math.min(onUltra ? 1.9 : DIGITAL_MAX, Math.max(1, zoomAfter / scale));
          compositor.current?.setZoom(z);
          zoom = z * scale;
          digital = z > 1.001;
        }
      }
      setView((v) => ({
        ...v,
        status: 'ready',
        error: '',
        facing,
        deviceId: actualId,
        lensZoom: abilities.zoom,
        zoom,
        torchAvailable: abilities.torch,
        torch: false,
        digital,
        mode,
        wantFps: want.fps,
      }));
      t?.addEventListener('ended', () => {
        // Another app took the camera, or the system stopped it: stop the take there, offer to try again.
        if (id === session.current && stream.current === next) {
          setView((v) => ({ ...v, status: 'error', error: 'La cámara se ha cortado.' }));
          onLostRef.current();
        }
      });
      if (facing === 'environment' && !viewRef.current.lenses.ids.length) {
        void listBackLenses().then((lenses) => {
          if (id !== session.current) return;
          setView((v) => ({
            ...v,
            lenses,
            zoom: v.deviceId != null && v.deviceId === lenses.ultra ? 0.5 : v.zoom,
          }));
        });
      }
    } catch (err) {
      if (id !== session.current) return;
      setView((v) => ({ ...v, status: 'error', error: cameraError(err) }));
    }
  }, []);

  // Open: the camera chosen in the settings (back by default, the phone's best, Q8). Close: let go of everything.
  useEffect(() => {
    if (!open) return;
    void start(initialFacing(recordSettings()));
    return () => {
      session.current++;
      stopStream();
      if (source.current) source.current.srcObject = null;
      setView(INITIAL);
    };
  }, [open, start]);

  // The canvas the camera is drawn on: preview and recorded picture in one.
  useEffect(() => {
    const video = source.current;
    const el = host.current;
    if (!open || !video || !el) return;
    const c = createCompositor(video);
    c.canvas.className = 'absolute inset-0 size-full object-contain';
    el.appendChild(c.canvas);
    compositor.current = c;
    const onResize = () => {
      if (video.videoWidth && video.videoHeight)
        setView((v) => ({ ...v, aspect: video.videoWidth / video.videoHeight }));
    };
    video.addEventListener('resize', onResize);
    video.addEventListener('loadedmetadata', onResize);
    return () => {
      video.removeEventListener('resize', onResize);
      video.removeEventListener('loadedmetadata', onResize);
      c.dispose();
      c.canvas.remove();
      compositor.current = null;
    };
  }, [open]);

  // Back from another app: phones stop the camera in the background, start it again.
  useEffect(() => {
    if (!open) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const t = track();
      const v = viewRef.current;
      if (!t || t.readyState === 'ended') void start(v.facing, v.deviceId, v.zoom);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [open, start]);

  const onUltra =
    view.facing === 'environment' && view.deviceId != null && view.deviceId === view.lenses.ultra;

  /** Continuous zoom (pinch): never changes lens, so it is safe mid-take. */
  const setZoom = useCallback((value: number) => {
    const v = viewRef.current;
    // A direct take records the camera as it comes: a digital crop would only change the preview.
    if (!v.lensZoom && !digitalAllowed.current) return;
    const ultra = v.facing === 'environment' && v.deviceId != null && v.deviceId === v.lenses.ultra;
    const scale = ultra ? 0.5 : 1;
    if (v.lensZoom) {
      const z = Math.min(v.lensZoom.max, Math.max(v.lensZoom.min, value / scale));
      void applyTrack(track(), { zoom: z });
      setView((s) => ({ ...s, zoom: z * scale, digital: false }));
    } else {
      // Digital: the ultra-wide crops up to just under 1×, where the main lens takes over.
      const z = Math.min(ultra ? 1.9 : DIGITAL_MAX, Math.max(1, value / scale));
      compositor.current?.setZoom(z);
      setView((s) => ({ ...s, zoom: z * scale, digital: z > 1.001 }));
    }
  }, []);

  /** Zoom chips: 0.5× may need the ultra-wide lens (a camera restart, so not mid-take). */
  const pickZoom = useCallback(
    (target: number, canSwitchLens: boolean) => {
      const v = viewRef.current;
      const lensReaches = v.lensZoom != null && v.lensZoom.min <= target + 0.01;
      if (target < 1 && !onUltra && !lensReaches) {
        if (canSwitchLens && v.lenses.ultra) void start('environment', v.lenses.ultra, target);
        return;
      }
      if (onUltra && target >= 1) {
        if (!canSwitchLens) return;
        void start('environment', null, target);
        return;
      }
      setZoom(target);
    },
    [onUltra, setZoom, start],
  );

  /** Zoom chips like the phone's camera app, from what this camera offers. */
  const chips: number[] = [];
  if (view.facing === 'environment' && (view.lenses.ultra || (view.lensZoom && view.lensZoom.min < 1))) {
    chips.push(
      view.lensZoom && view.lensZoom.min < 1 && !view.lenses.ultra
        ? Math.round(view.lensZoom.min * 10) / 10
        : 0.5,
    );
  }
  chips.push(1, 2);
  const max = (view.lensZoom?.max ?? DIGITAL_MAX) * (onUltra ? 0.5 : 1);
  if (view.lensZoom && max >= 5) chips.push(5);
  else if (view.lensZoom && max >= 3) chips.push(3);
  const activeChip = chips.reduce(
    (best, c) => (Math.abs(c - view.zoom) < Math.abs(best - view.zoom) ? c : best),
    chips[0]!,
  );

  /** Phones that only number their lenses: step through the back cameras to find the 0.5×. */
  const lensCycle = view.facing === 'environment' && !view.lenses.ultra && view.lenses.ids.length > 1;
  const nextLens = useCallback(() => {
    const v = viewRef.current;
    if (v.lenses.ids.length < 2) return;
    const at = v.deviceId ? v.lenses.ids.indexOf(v.deviceId) : -1;
    void start('environment', v.lenses.ids[(at + 1) % v.lenses.ids.length]!);
  }, [start]);

  const flip = useCallback(() => {
    const next: Facing = viewRef.current.facing === 'user' ? 'environment' : 'user';
    useRecordSettings.getState().set({ lastFacing: next });
    void start(next);
  }, [start]);

  // A new resolution, rate or quality in the settings reopens the camera with it (settings only open between takes).
  const quality = useRecordSettings((s) => s.quality);
  const resolution = useRecordSettings((s) => s.resolution);
  const fps = useRecordSettings((s) => s.fps);
  const modeKey = `${quality}|${resolution}|${fps}`;
  const lastModeKey = useRef(modeKey);
  useEffect(() => {
    if (lastModeKey.current === modeKey) return;
    lastModeKey.current = modeKey;
    const v = viewRef.current;
    if (open && v.status !== 'starting') void start(v.facing, v.deviceId, v.zoom);
  }, [modeKey, open, start]);

  const retry = useCallback(() => {
    void start(viewRef.current.facing, viewRef.current.deviceId);
  }, [start]);

  const toggleTorch = useCallback(() => {
    const next = !viewRef.current.torch;
    setView((s) => ({ ...s, torch: next }));
    void applyTrack(track(), { torch: next }).then((ok) => {
      if (!ok) setView((s) => ({ ...s, torch: !next }));
    });
  }, []);

  // Pinch on the preview zooms like the phone's camera app.
  const pinch = useRef({
    pointers: new Map<number, { x: number; y: number }>(),
    startDist: 1,
    startZoom: 1,
    raf: 0,
    next: 1,
  });
  const pinchHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      // Captured: a finger lifted over the controls still ends here, no stale pointer remains.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
      const p = pinch.current;
      p.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (p.pointers.size === 2) {
        const [a, b] = [...p.pointers.values()];
        p.startDist = Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1;
        p.startZoom = viewRef.current.zoom;
      }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = pinch.current;
      if (!p.pointers.has(e.pointerId)) return;
      p.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (p.pointers.size !== 2) return;
      const [a, b] = [...p.pointers.values()];
      p.next = p.startZoom * (Math.hypot(a!.x - b!.x, a!.y - b!.y) / p.startDist);
      p.raf ||= requestAnimationFrame(() => {
        p.raf = 0;
        setZoom(p.next);
      });
    },
    onPointerUp: (e: React.PointerEvent) => {
      pinch.current.pointers.delete(e.pointerId);
    },
    /** Fingers still on the preview. */
    pointerCount: () => pinch.current.pointers.size,
  };

  return {
    /** The live camera track (for the «i» panel and the camera controls). */
    track,
    setDigitalAllowed,
    source,
    host,
    compositor,
    view,
    onUltra,
    chips,
    activeChip,
    lensCycle,
    setZoom,
    pickZoom,
    nextLens,
    flip,
    retry,
    toggleTorch,
    pinchHandlers,
  };
}
