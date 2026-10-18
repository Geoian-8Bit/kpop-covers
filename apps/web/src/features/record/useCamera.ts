import { cameraRequest, capRequest } from '@coverscape/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyTrack,
  cameraError,
  listBackLenses,
  openCamera,
  readAbilities,
  settleCameraMode,
  type BackCamera,
  type Facing,
} from './camera';
import { createCompositor, type Compositor } from './compositor';
import { lensProbes, rememberedMainLens, rememberLens, rememberMainLens } from './lensMemory';
import { classifyLenses, fitChips, otherLensStep, probeFromCapabilities, torchHint, type Lens } from './lensRules';
import { paceCap, usePaceCap } from './pace';
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
  /** P23 · The rear cameras, named like the camera app's (0,5× · 1× · Tele). */
  lenses: Lens[];
  /** Width / height of the picture: below 1 is vertical. */
  aspect: number;
  /** The picture is a crop of the frame (no lens zoom here): less sharp, the recorder says so (Q7). */
  digital: boolean;
  /** P19 · The digital crop (1 = the whole frame): the preview shows it with CSS, the canvas records it. */
  crop: number;
  /** What the camera really gives (Q3/Q4); null until open. */
  mode: { width: number; height: number; fps: number } | null;
  /** The frame rate asked for (after this phone's cap), to tell when the camera stayed at 30. */
  wantFps: 30 | 60;
  /** P19 · The request was made lighter because this phone didn't keep up with it before. */
  paceCapped: boolean;
}

/** A zoom button like the camera app's: a zoom on this lens, or another lens. */
export interface ZoomChip {
  key: string;
  label: string;
  ariaLabel: string;
  /** Zoom to land on (camera-app numbers); null: the lens's own view (tele, unknown lenses). */
  zoom: number | null;
  /** Another camera to open (null: zoom on the current one). */
  lensId: string | null;
  /** Opening it means another camera: not possible during a direct take. */
  switches: boolean;
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
  lenses: [],
  aspect: 9 / 16,
  digital: false,
  crop: 1,
  mode: null,
  wantFps: 30,
  paceCapped: false,
};

export const formatZoom = (z: number) => `${(Math.round(z * 10) / 10).toString().replace('.', ',')}×`;

const roleOf = (v: Pick<CameraView, 'facing' | 'deviceId' | 'lenses'>) =>
  v.facing === 'environment' ? (v.lenses.find((l) => l.id === v.deviceId)?.role ?? 'main') : 'main';

/**
 * The studio's camera: picture only (sound is the recorder's business). The live <video> is the preview (P19:
 * composited by the browser, never held up by the page); the compositor's canvas records it when a take needs
 * redrawing. Lens, zoom, flash and pinch behave like the phone's camera app.
 */
export function useCamera(open: boolean, onLost: () => void, busy: () => boolean = () => false) {
  const onLostRef = useRef(onLost);
  onLostRef.current = onLost;
  /** A take is starting or under way: nothing reopens the camera by itself. */
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const source = useRef<HTMLVideoElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const compositor = useRef<Compositor | null>(null);
  const stream = useRef<MediaStream | null>(null);
  /** Bumped on every camera request and on close: a late answer is stopped, not kept. */
  const session = useRef(0);
  const [view, setView] = useState<CameraView>(INITIAL);
  const viewRef = useRef(view);
  viewRef.current = view;
  /** The rear cameras as listed (names readable once the camera is allowed). */
  const backCams = useRef<BackCamera[]>([]);
  /** The main lens, found while a take was under way: opened when the recorder is idle again. */
  const mainLater = useRef<{ session: number; deviceId: string } | null>(null);

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

  const classify = (cams: BackCamera[]) => {
    const probes = lensProbes(cams);
    const lenses = classifyLenses(cams.map((c) => ({ ...c, probe: probes[c.id] })));
    const main = lenses.find((l) => l.role === 'main' && l.sure);
    if (main) rememberMainLens(main.id);
    return lenses;
  };

  /**
   * `zoomAfter`: the zoom (as the camera app counts it) to land on once this lens is open. `soft`: a remembered
   * camera that may be gone (another phone's data, cleared ids): on failure, open by facing instead.
   */
  const start = useCallback(async (facing: Facing, deviceId: string | null = null, zoomAfter = 1, soft = false) => {
    const id = ++session.current;
    // Phones hand out one camera at a time: let go of the old one first.
    stopStream();
    setView((v) => ({ ...v, status: 'starting', facing, torch: false }));
    try {
      const asked = cameraRequest(recordSettings());
      // P19: lighter when this phone already showed it can't keep up with the asked mode.
      const want = capRequest(asked, paceCap());
      let next: MediaStream;
      try {
        next = await openCamera(facing, deviceId, want);
      } catch (err) {
        if (!soft || !deviceId || id !== session.current) throw err;
        next = await openCamera(facing, null, want);
      }
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
      // P23: what this camera is (flash, focus, size) is remembered: the lens buttons name it from now on.
      if (facing === 'environment' && actualId && t) {
        try {
          rememberLens(actualId, t.label, probeFromCapabilities((t.getCapabilities?.() ?? {}) as never));
        } catch {
          /* no capabilities here */
        }
      }
      const lenses = facing === 'environment' && backCams.current.length ? classify(backCams.current) : viewRef.current.lenses;
      const role = roleOf({ facing, deviceId: actualId, lenses });
      // Land on the asked zoom with this lens's own numbers (state from the old lens is not used).
      const scale = role === 'ultra' ? 0.5 : 1;
      let zoom = scale * (abilities.zoom ? abilities.zoomNow : 1);
      let digital = false;
      let crop = 1;
      compositor.current?.setZoom(1);
      if (Math.abs(zoomAfter - zoom) > 0.01) {
        if (abilities.zoom) {
          const z = Math.min(abilities.zoom.max, Math.max(abilities.zoom.min, zoomAfter / scale));
          if (await applyTrack(t, { zoom: z })) zoom = z * scale;
          if (id !== session.current) return;
        } else {
          const z = Math.min(role === 'ultra' ? 1.9 : DIGITAL_MAX, Math.max(1, zoomAfter / scale));
          compositor.current?.setZoom(z);
          zoom = z * scale;
          digital = z > 1.001;
          crop = z;
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
        crop,
        lenses,
        mode,
        wantFps: want.fps,
        paceCapped: want.capped,
      }));
      t?.addEventListener('ended', () => {
        // Another app took the camera, or the system stopped it: stop the take there, offer to try again.
        if (id === session.current && stream.current === next) {
          setView((v) => ({ ...v, status: 'error', error: 'La cámara se ha cortado.' }));
          onLostRef.current();
        }
      });
      if (facing === 'environment' && !backCams.current.length) {
        void listBackLenses().then((cams) => {
          if (id !== session.current) return;
          backCams.current = cams;
          const listed = classify(cams);
          const here = listed.find((l) => l.id === actualId);
          setView((v) => ({
            ...v,
            lenses: listed,
            zoom: here?.role === 'ultra' && v.deviceId === actualId ? 0.5 * (v.zoom / scale) : v.zoom,
          }));
          // P23: the main lens (1×) by default. Opened by facing, the browser may have picked another one.
          const main = listed.find((l) => l.role === 'main' && l.sure);
          // Never in the middle of a take (a count of 0 may already be rolling a direct take on this camera): then
          // once it is over (`retryMainLens`), if nothing else opened the camera meanwhile.
          if (deviceId == null && main && here && here.role !== 'main') {
            if (busyRef.current()) mainLater.current = { session: id, deviceId: main.id };
            else void start('environment', main.id);
          }
        });
      }
    } catch (err) {
      if (id !== session.current) return;
      setView((v) => ({ ...v, status: 'error', error: cameraError(err) }));
    }
  }, []);

  // Open: the camera used last (P25; the back one the first time), on its main lens when it is known. Close: let
  // go of everything.
  useEffect(() => {
    if (!open) return;
    const facing = initialFacing(recordSettings());
    const main = facing === 'environment' ? rememberedMainLens() : null;
    void start(facing, main, 1, true);
    return () => {
      session.current++;
      stopStream();
      if (source.current) source.current.srcObject = null;
      setView(INITIAL);
    };
  }, [open, start]);

  /** The recorder is idle again: open the main lens if it was found during the take (and nothing changed since). */
  const retryMainLens = useCallback(() => {
    const later = mainLater.current;
    if (!later || busyRef.current()) return;
    mainLater.current = null;
    // Another camera request since (a lens, a flip, a reopen) is the dancer's choice, or already the right one.
    if (later.session !== session.current || viewRef.current.facing !== 'environment') return;
    if (viewRef.current.deviceId === later.deviceId) return;
    void start('environment', later.deviceId);
  }, [start]);

  // The canvas a redrawn take is recorded from (hidden: the live video is the preview).
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

  const role = roleOf(view);
  const onUltra = role === 'ultra';

  /** Continuous zoom (pinch): never changes lens, so it is safe mid-take. */
  const setZoom = useCallback((value: number) => {
    const v = viewRef.current;
    // A direct take records the camera as it comes: a digital crop would only change the preview.
    if (!v.lensZoom && !digitalAllowed.current) return;
    const ultra = roleOf(v) === 'ultra';
    const scale = ultra ? 0.5 : 1;
    if (v.lensZoom) {
      const z = Math.min(v.lensZoom.max, Math.max(v.lensZoom.min, value / scale));
      void applyTrack(track(), { zoom: z });
      setView((s) => ({ ...s, zoom: z * scale, digital: false, crop: 1 }));
    } else {
      // Digital: the ultra-wide crops up to just under 1×, where the main lens takes over.
      const z = Math.min(ultra ? 1.9 : DIGITAL_MAX, Math.max(1, value / scale));
      compositor.current?.setZoom(z);
      setView((s) => ({ ...s, zoom: z * scale, digital: z > 1.001, crop: z }));
    }
  }, []);

  // ───────────── Zoom buttons like the camera app (P23) ─────────────
  const back = view.facing === 'environment';
  const ultraLens = back ? view.lenses.find((l) => l.role === 'ultra') : undefined;
  const mainLens = back ? view.lenses.find((l) => l.role === 'main') : undefined;
  const teleLens = back ? view.lenses.find((l) => l.role === 'tele') : undefined;
  const onMain = !back || role === 'main';
  /** 1× and 2× live on the main lens: from another lens they open it again. */
  const toMain = back && !onMain ? (mainLens?.id ?? null) : null;
  const chips: ZoomChip[] = [];
  if (ultraLens) {
    chips.push({ key: 'ultra', label: '0,5×', ariaLabel: 'Gran angular, 0,5×', zoom: 0.5, lensId: ultraLens.id, switches: !onUltra });
  } else if (back && onMain && view.lensZoom && view.lensZoom.min < 1) {
    const z = Math.round(view.lensZoom.min * 10) / 10;
    chips.push({ key: `z${z}`, label: formatZoom(z), ariaLabel: `Gran angular, ${formatZoom(z)}`, zoom: z, lensId: null, switches: false });
  }
  chips.push({
    key: 'z1',
    label: '1×',
    ariaLabel: back ? 'Principal, 1×' : 'Zoom 1×',
    zoom: 1,
    lensId: toMain,
    switches: back && !onMain,
  });
  chips.push({ key: 'z2', label: '2×', ariaLabel: 'Zoom 2×', zoom: 2, lensId: toMain, switches: back && !onMain });
  if (teleLens) {
    chips.push({ key: 'tele', label: 'Tele', ariaLabel: 'Teleobjetivo', zoom: null, lensId: teleLens.id, switches: role !== 'tele' });
  } else if (onMain && view.lensZoom) {
    const max = view.lensZoom.max;
    if (max >= 5) chips.push({ key: 'z5', label: '5×', ariaLabel: 'Zoom 5×', zoom: 5, lensId: null, switches: false });
    else if (max >= 3) chips.push({ key: 'z3', label: '3×', ariaLabel: 'Zoom 3×', zoom: 3, lensId: null, switches: false });
  }
  // The rear cameras nobody could identify share one button: a tap goes to the next one (P23 review: room).
  const others = back ? view.lenses.filter((x) => x.role === 'other') : [];
  if (others.length) {
    const step = otherLensStep(
      others.map((l) => l.id),
      view.deviceId,
    );
    const nameOf = (id: string | null) => others.find((l) => l.id === id)?.name ?? 'Otra lente';
    const short = (id: string | null) => nameOf(id).replace('Otra lente', 'Otra');
    chips.push({
      key: 'other',
      label: step.active ? short(step.active) : 'Otra',
      ariaLabel: step.active
        ? others.length > 1
          ? `${nameOf(step.active)} (sin identificar). Toca para pasar a ${nameOf(step.next)}`
          : `${nameOf(step.active)} (sin identificar)`
        : others.length > 1
          ? `Otras cámaras traseras sin identificar (${others.length})`
          : 'Otra cámara trasera (sin identificar)',
      zoom: null,
      lensId: step.next,
      switches: step.next != null && step.next !== view.deviceId,
    });
  }
  const activeChip = (() => {
    if (back && role === 'ultra' && ultraLens) return 'ultra';
    if (back && role === 'tele') return 'tele';
    if (back && role === 'other') return 'other';
    const zoomChips = chips.filter((c) => c.zoom != null && !c.switches && c.key !== 'ultra');
    return zoomChips.reduce(
      (best, c) => (Math.abs((c.zoom ?? 1) - view.zoom) < Math.abs((best.zoom ?? 1) - view.zoom) ? c : best),
      zoomChips[0] ?? chips[0]!,
    ).key;
  })();

  /** A zoom button: zoom on this lens, or open another one (a camera restart, so not during a direct take). */
  const pickChip = useCallback(
    (chip: ZoomChip, canSwitchLens: boolean): boolean => {
      if (chip.switches) {
        if (!canSwitchLens) return false;
        void start('environment', chip.lensId, chip.zoom ?? 1);
        return true;
      }
      if (chip.zoom != null) setZoom(chip.zoom);
      return true;
    },
    [setZoom, start],
  );

  const flip = useCallback(() => {
    const next: Facing = viewRef.current.facing === 'user' ? 'environment' : 'user';
    useRecordSettings.getState().set({ lastFacing: next });
    void start(next, next === 'environment' ? rememberedMainLens() : null, 1, true);
  }, [start]);

  // A new resolution, rate or quality in the settings (or a lighter mode learnt for this phone) reopens the camera
  // with it (settings only open between takes).
  const quality = useRecordSettings((s) => s.quality);
  const resolution = useRecordSettings((s) => s.resolution);
  const fps = useRecordSettings((s) => s.fps);
  const cap = usePaceCap((s) => s.cap);
  const modeKey = `${quality}|${resolution}|${fps}|${cap.fps30.join(',')}|${cap.maxResolution ?? ''}`;
  const lastModeKey = useRef(modeKey);
  useEffect(() => {
    if (lastModeKey.current === modeKey) return;
    lastModeKey.current = modeKey;
    const v = viewRef.current;
    if (!open) return;
    // The main lens found during the take and still waiting for it (nothing else opened the camera since): this
    // reopening goes to it, or the new session would drop it and the browser's pick would stay until 1× is tapped.
    const later = mainLater.current;
    if (later && later.session === session.current && v.facing === 'environment') {
      mainLater.current = null;
      if (later.deviceId !== v.deviceId) return void start('environment', later.deviceId);
    }
    // Even mid-reopen: the newer request wins (the session counter drops the older camera).
    void start(v.facing, v.deviceId, v.zoom);
  }, [modeKey, open, start]);

  const retry = useCallback(() => {
    void start(viewRef.current.facing, viewRef.current.deviceId);
  }, [start]);

  /**
   * P48 · The same camera, lens and zoom, opened afresh: the only sure way back to automatic colour on browsers that
   * keep a white-balance preset for as long as the camera stays open. Never during a take (the caller checks).
   */
  const reopen = useCallback(() => {
    const v = viewRef.current;
    void start(v.facing, v.deviceId, v.zoom);
  }, [start]);

  /** Resolves with whether the camera took it (false: the switch went back). */
  const toggleTorch = useCallback((): Promise<boolean> => {
    const next = !viewRef.current.torch;
    setView((s) => ({ ...s, torch: next }));
    return applyTrack(track(), { torch: next }).then((ok) => {
      if (!ok) setView((s) => ({ ...s, torch: !next }));
      return ok;
    });
  }, []);

  /** P23 · The flash lives on one rear camera only: on another, the control says which one has it. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const probes = useMemo(() => (back ? lensProbes(backCams.current) : {}), [back, view.deviceId, view.lenses]);
  const flashElsewhere = back && !view.torchAvailable && Object.values(probes).some((p) => p?.torch);
  const noTorchHint = flashElsewhere ? torchHint(view.lenses, probes, view.deviceId) : null;

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
    /** At most four buttons (they must fit beside the shutter on a turned phone). */
    chips: fitChips(chips, undefined, activeChip),
    activeChip,
    setZoom,
    pickChip,
    flip,
    retry,
    reopen,
    retryMainLens,
    toggleTorch,
    /** Shown (muted) on a lens without flash when another rear camera has it. */
    flashElsewhere,
    noTorchHint,
    pinchHandlers,
  };
}
