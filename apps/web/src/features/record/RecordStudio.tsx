import {
  clamp,
  formatTime,
  LOW_SPACE_MINUTES,
  minutesLeft,
  minutesPhrase,
  SAVED_GRACE_MS,
  droppedFrames,
  HEAT_WARN_MINUTES,
  tooManyDrops,
  QUALITY_LABEL,
  resolutionLabel,
  type Video,
} from '@coverscape/shared';
import { recordSettings, useRecordSettings } from './settings';
import { GridOverlay } from './settings/GridOverlay';
import { LevelIndicator } from './settings/LevelIndicator';
import { RecorderSettingsSheet } from './settings/RecorderSettingsSheet';
import { useDesignVariant } from '@/features/lab/designLab';
import { AnimatePresence, motion } from 'motion/react';
import {
  Aperture,
  Check,
  Download,
  Info,
  Locate,
  Lock,
  Settings2,
  SunMedium,
  Mic,
  MicOff,
  Music2,
  RefreshCw,
  Repeat,
  Share,
  SkipBack,
  SwitchCamera,
  Timer,
  Trash2,
  X,
  Zap,
  ZapOff,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { scheduleCountIn, unlockAudio } from '@/lib/metronome';
import { jelly, soft } from '@/lib/motion';
import { useBackToClose } from '@/lib/useBackToClose';
import { hasRange, usePlayer } from '@/player/store';
import {
  canLock,
  canWhiteBalance,
  focusAt,
  lockFocusExposure,
  openMic,
  readTrackInfo,
  setExposureCompensation,
  setWhiteBalance,
} from './camera';
import { canRecordCanvas, createFrameMeter, watchPresentedFrames, type FrameMeter } from './compositor';
import { InfoPanel, type TakeStats } from './InfoPanel';
import { IMAGE_DEFAULT, ImageControls, type ImageState } from './ImageControls';
import {
  createTakeSink,
  forgetTake,
  freeSpace,
  holdTake,
  listLeftovers,
  loadLeftover,
  markTakeSaved,
  releaseTake,
  type Leftover,
  type TakeSink,
} from './takeStore';
import {
  IS_IOS,
  canRecord,
  canShareFile,
  chooseFormat,
  createTakeRecorder,
  downloadFile,
  badVersion,
  markFormatBad,
  shareFile,
  takeFileName,
  type RecordFormat,
  type TakeRecorder,
} from './recorder';
import { formatZoom, useCamera } from './useCamera';

/**
 * idle → (countdown) → arming (waiting for the song to really start) → recording ⇄ paused → finishing → review.
 * Pausing stops song and camera together; going on continues both from there, so a take can be shot in parts.
 */
type Phase = 'idle' | 'countdown' | 'arming' | 'recording' | 'paused' | 'finishing' | 'review';
type From = 'start' | 'here' | 'range';
type Span = { start: number; end: number };
type Take = { url: string; file: File };
type SoundSource = 'pending' | 'song' | 'mic' | 'none';

const TIMERS = [0, 3, 5, 10] as const;
type TimerSeconds = (typeof TIMERS)[number];
const TIMER_KEY = 'coverscape.recordTimer';
/** Seconds the song may take to start (a YouTube video still loading) before we give up on that try. */
const ARM_TIMEOUT_MS = 8000;

function readTimer(): TimerSeconds {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    const n = raw == null ? Number.NaN : Number(raw);
    return (TIMERS as readonly number[]).includes(n) ? (n as TimerSeconds) : 3;
  } catch {
    return 3;
  }
}

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
};

const HEX = '24,2 43,13 43,35 24,46 5,35 5,13';

/**
 * TikTok-style recording: the camera like the phone's own (vertical or horizontal as the phone is held,
 * 0.5×–5× zoom, flash, front/back), a count-in, then the song and the camera start together. The file
 * carries the song's own sound when the source allows it (uploaded files) and the microphone otherwise
 * (YouTube). The take goes to the phone through a download or the share sheet.
 */
export function RecordStudio({ open, onClose, video }: { open: boolean; onClose: () => void; video: Video }) {
  /** The camera went away mid-take (another app, a call): set once pausePart exists, below. */
  const cameraLost = useRef<() => void>(() => undefined);
  const cam = useCamera(open, () => cameraLost.current());
  const { view } = cam;
  const settings = useRecordSettings();
  const [phase, setPhase] = useState<Phase>('idle');
  const [timer, setTimer] = useState<TimerSeconds>(readTimer);
  const [from, setFrom] = useState<From>('start');
  const [left, setLeft] = useState(0);
  const [span, setSpan] = useState<Span | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState<'close' | 'again' | 'discard' | 'leftover' | null>(null);
  const [sound, setSound] = useState<SoundSource>('pending');
  const [notice, setNotice] = useState('');
  const [hereAt, setHereAt] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  /** R3: the heat notice was shown for this take. */
  const heatWarned = useRef(false);
  const [lastStats, setLastStats] = useState<TakeStats | null>(null);
  /** The format the current take is being recorded with (for the «i» panel's "pedida"). */
  const takeFormat = useRef<RecordFormat | null>(null);
  /** Where the current take is being written (R1); ready before the song starts. */
  const sink = useRef<TakeSink | null>(null);
  const sinkReady = useRef<Promise<TakeSink> | null>(null);
  /** The disk copy behind the take under review, and whether it was saved somewhere. */
  const reviewTake = useRef<{ id: string; saved: boolean; noSpace: boolean } | null>(null);
  /** How the current take gets its picture (Q5): the camera's own track or the redrawn canvas. */
  const [takeKind, setTakeKind] = useState<'direct' | 'canvas' | null>(null);
  /** The camera track and picture size a direct take started with: it can only go on with the same ones. */
  const direct = useRef<{ track: MediaStreamTrack; width: number; height: number } | null>(null);
  const stopPresented = useRef<() => void>(() => undefined);
  /** Frames that reached the take while it rolled (R4). */
  const meter = useRef<{ drawn: FrameMeter; delivered: FrameMeter | null } | null>(null);
  /** A take of this song left on the phone by an app that closed mid-take (R1). */
  const [leftover, setLeftover] = useState<Leftover | null>(null);
  const [leftoverCount, setLeftoverCount] = useState(0);
  /** Free space on the phone for the app (R2), null while unknown. */
  const [free, setFree] = useState<number | null>(null);
  const loopRange = usePlayer((s) => (hasRange(s.loop) ? { start: s.loop.start, end: s.loop.end } : null));
  const rate = usePlayer((s) => s.rate);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  /** Bumped on close: anything still in flight from the old session is dropped. */
  const session = useRef(0);
  const recorder = useRef<TakeRecorder | null>(null);
  const canvasStream = useRef<MediaStream | null>(null);
  const songTrack = useRef<MediaStreamTrack | null>(null);
  const micTrack = useRef<MediaStreamTrack | null>(null);
  /** Stops listening for the take's sound going away. */
  const unwatchSound = useRef<() => void>(() => undefined);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cancelTicks = useRef<() => void>(() => undefined);
  const armFrame = useRef(0);
  /** Where a cancelled countdown goes back to. */
  const countFrom = useRef<'idle' | 'paused'>('idle');
  const spanRef = useRef<Span | null>(null);
  const takeUrl = useRef<string | null>(null);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  const restore = useRef<{ loopEnabled: boolean; loopAll: boolean } | null>(null);
  const sharing = useRef(false);

  const unsaved = phase === 'paused' || (phase === 'review' && take != null && !saved);
  const rolling =
    phase === 'countdown' || phase === 'arming' || phase === 'recording' || phase === 'finishing';
  const supported = canRecord() && canRecordCanvas();

  const replaceTake = (next: Take | null, diskId: string | null = null) => {
    if (takeUrl.current) URL.revokeObjectURL(takeUrl.current);
    takeUrl.current = next?.url ?? null;
    // The take we leave: a saved one keeps its copy a while (a download may still be reading it), then goes;
    // an unsaved one the dancer moved on from (they confirmed) is deleted now.
    const old = reviewTake.current;
    if (old && old.id !== diskId) {
      // Not saved: the dancer confirmed discarding it. Saved on a full phone: stays on offer (the download may
      // have failed). Saved: kept a while for the download, then deleted.
      if (!old.saved) void forgetTake(old.id);
      else if (old.noSpace) releaseTake(old.id);
      else {
        releaseTake(old.id);
        const id = old.id;
        setTimeout(() => void forgetTake(id), SAVED_GRACE_MS);
      }
    }
    if (diskId) holdTake(diskId);
    reviewTake.current = diskId ? { id: diskId, saved: false, noSpace: false } : null;
    setTake(next);
    setSaved(false);
  };

  /** Starts preparing where the next take is written; the song waits for it. */
  const prepareSink = () => {
    if (sinkReady.current) return;
    const id = session.current;
    const promise = createTakeSink(
      { videoId: video.id, title: video.title, mimeType: plannedFormat().mimeType },
      () => {
        if (id !== session.current || !recorder.current) return;
        setNotice('El móvil se ha quedado sin espacio: la toma termina con lo grabado hasta aquí.');
        void finishRef.current();
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
    unlockOrientation();
    setTakeKind(null);
  };

  /**
   * Q5 · A direct take records the camera's own frames: turning the phone mid-take would change their size
   * under the recorder. The screen's rotation is locked for the take (possible in the installed app / full
   * screen); where it can't be, the take goes through the canvas, which copes with a turned phone.
   */
  const orientation = useRef<{ pending: boolean; locked: boolean; tried: boolean; ready: Promise<unknown> }>({
    pending: false,
    locked: false,
    tried: false,
    ready: Promise.resolve(),
  });
  function lockForDirect() {
    const state = { pending: false, locked: false, tried: true, ready: Promise.resolve() as Promise<unknown> };
    orientation.current = state;
    if (!directPossible()) {
      setTakeKind('canvas');
      return;
    }
    const o = screen.orientation as ScreenOrientation & { lock?: (type: string) => Promise<void> };
    if (!o?.lock) {
      setTakeKind('canvas');
      return;
    }
    state.pending = true;
    state.ready = o.lock(o.type).then(
      () => {
        state.pending = false;
        // Cancelled or closed meanwhile: give the rotation back at once.
        if (orientation.current !== state) {
          try {
            screen.orientation?.unlock?.();
          } catch {
            /* not locked */
          }
          return;
        }
        state.locked = true;
      },
      () => {
        state.pending = false;
        // Prepare the canvas now (it starts drawing) so the take can roll through it.
        if (orientation.current === state) setTakeKind('canvas');
      },
    );
  }
  function unlockOrientation() {
    const state = orientation.current;
    if (!state.locked) return;
    state.locked = false;
    try {
      screen.orientation?.unlock?.();
    } catch {
      /* not locked any more */
    }
  }

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    cancelTicks.current();
    cancelTicks.current = () => undefined;
    cancelAnimationFrame(armFrame.current);
    armFrame.current = 0;
  };

  /** Ends the canvas capture and lets the frame follow the phone again. */
  const releasePicture = () => {
    unwatchSound.current();
    unwatchSound.current = () => undefined;
    canvasStream.current?.getTracks().forEach((t) => t.stop());
    canvasStream.current = null;
    cam.compositor.current?.lock(false);
    // A direct take recorded the camera's own track: it stays open for the preview.
    stopPresented.current();
    stopPresented.current = () => undefined;
    direct.current = null;
    unlockOrientation();
    setTakeKind(null);
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

  // Open: the song is set up for recording (no loops), the sound source chosen, the screen kept awake.
  useEffect(() => {
    if (!open) return;
    const id = session.current;
    unlockAudio();
    const p = usePlayer.getState();
    restore.current = { loopEnabled: p.loop.enabled, loopAll: p.loopAll };
    usePlayer.setState((s) => ({ loop: { ...s.loop, enabled: false }, loopAll: false }));
    p.pause();
    setHereAt(p.time);
    setFrom('start');
    setPhase('idle');
    setNotice('');
    replaceTake(null);
    setLeftover(null);
    // Takes the app didn't get to save last time (R1): this song's first, else the newest of any song. Space is
    // measured after the clean-up, which may have freed some.
    void listLeftovers().then((list) => {
      if (id !== session.current) return;
      setLeftover(list.find((l) => l.meta.videoId === video.id) ?? list[0] ?? null);
      setLeftoverCount(list.length);
      void freeSpace().then((bytes) => {
        if (id === session.current) setFree(bytes);
      });
    });

    void (navigator as WakeLockNavigator).wakeLock
      ?.request('screen')
      .then((lock) => {
        if (id === session.current) wakeLock.current = lock;
        else void lock.release().catch(() => undefined);
      })
      .catch(() => undefined);

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      session.current++;
      document.body.style.overflow = overflow;
      clearTimers();
      recorder.current?.cancel();
      recorder.current = null;
      dropUnusedSink();
      releasePicture();
      micTrack.current?.stop();
      micTrack.current = null;
      void wakeLock.current?.release().catch(() => undefined);
      wakeLock.current = null;
      const saved = restore.current;
      restore.current = null;
      usePlayer.getState().pause();
      if (saved)
        usePlayer.setState((s) => ({
          loop: { ...s.loop, enabled: saved.loopEnabled },
          loopAll: saved.loopAll,
        }));
      replaceTake(null);
      setConfirm(null);
      setInfoOpen(false);
      setImageOpen(false);
      setLastStats(null);
      setPhase('idle');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * The take's sound (S3): the song's own sound when the source allows it (files) and the settings ask for it,
   * otherwise the microphone, raw and in stereo when possible (S2). Chosen again when the setting changes
   * between takes; a take in progress keeps the sound it started with.
   */
  const songPossible = usePlayer((s) => Boolean(s.engine?.captureAudio));
  useEffect(() => {
    if (!open || recorder.current) return;
    const id = session.current;
    let live = true;
    const tap =
      settings.sound === 'song' ? (usePlayer.getState().engine?.captureAudio?.() ?? null) : null;
    songTrack.current = tap;
    micTrack.current?.stop();
    micTrack.current = null;
    if (tap) setSound('song');
    else {
      setSound('pending');
      void openMic(settings.micChannels).then((track) => {
        if (!live || id !== session.current) {
          track?.stop();
          return;
        }
        micTrack.current = track;
        setSound(track ? 'mic' : 'none');
      });
    }
    return () => {
      live = false;
    };
  }, [open, settings.sound, settings.micChannels, songPossible]);

  // ───────────── C1–C4 · image controls ─────────────
  const [imageOpen, setImageOpen] = useState(false);
  const [image, setImage] = useState<ImageState>(IMAGE_DEFAULT);
  const [focusMark, setFocusMark] = useState<{ x: number; y: number; key: number } | null>(null);
  /** What this camera offers (read again when the camera or its mode changes). */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const trackInfo = useMemo(() => (view.status === 'ready' ? readTrackInfo(cam.track()) : null), [view.status, view.deviceId, view.mode]);
  const hasImageControls = Boolean(
    trackInfo && (trackInfo.exposureCompensation || canWhiteBalance(trackInfo) || canLock(trackInfo)),
  );
  // Every (re)opened camera starts on automatic (another lens, new settings, back from another app): the controls
  // say so, and a hold that was on is reported as gone.
  const imageRef = useRef(image);
  imageRef.current = image;
  useEffect(() => {
    if (view.status !== 'starting') return;
    if (imageRef.current.locked) setNotice('La cámara se ha reiniciado: el enfoque y la luz vuelven a automático.');
    setImage(IMAGE_DEFAULT);
    setFocusMark(null);
  }, [view.status]);
  // A tap's ring fades; a lock's ring stays.
  useEffect(() => {
    if (!focusMark || image.locked) return;
    const t = setTimeout(() => setFocusMark(null), 1400);
    return () => clearTimeout(t);
  }, [focusMark, image.locked]);

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
    const y = (clientY - r.top - (r.height - h) / 2) / h;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    if (view.facing === 'user') x = 1 - x;
    return { x, y };
  }

  function focusHere(clientX: number, clientY: number, lock: boolean) {
    const info = trackInfo;
    const p = framePoint(clientX, clientY);
    if (!info || !p) return;
    const t = cam.track();
    setFocusMark({ x: clientX, y: clientY, key: performance.now() });
    void (async () => {
      if (info.pointsOfInterest) await focusAt(t, p.x, p.y, info);
      if (lock || image.locked) {
        const ok = await lockFocusExposure(t, lock, info);
        if (ok) setImage((s) => ({ ...s, locked: lock }));
      }
    })();
  }

  const press = useRef<{
    id: number;
    x: number;
    y: number;
    at: number;
    multi: boolean;
    moved: boolean;
    held: boolean;
    timer?: ReturnType<typeof setTimeout>;
  } | null>(null);
  const tapEnabled = view.status === 'ready' && (phase === 'idle' || phase === 'paused' || phase === 'recording');
  /** Pinch zooms (as before); a tap focuses there (C1); a long press holds focus and light (C2). */
  const previewHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      cam.pinchHandlers.onPointerDown(e);
      const p = press.current;
      if (p) {
        p.multi = true;
        clearTimeout(p.timer);
        return;
      }
      if (!tapEnabled) return;
      const next: NonNullable<typeof press.current> = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        at: performance.now(),
        multi: false,
        moved: false,
        held: false,
      };
      press.current = next;
      if (trackInfo && canLock(trackInfo)) {
        next.timer = setTimeout(() => {
          if (press.current !== next || next.multi || next.moved) return;
          next.held = true;
          focusHere(next.x, next.y, true);
        }, 650);
      }
    },
    onPointerMove: (e: React.PointerEvent) => {
      cam.pinchHandlers.onPointerMove(e);
      const p = press.current;
      if (p && p.id === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) {
        p.moved = true;
        clearTimeout(p.timer);
      }
    },
    onPointerUp: (e: React.PointerEvent) => {
      cam.pinchHandlers.onPointerUp(e);
      const p = press.current;
      if (!p) return;
      if (p.id === e.pointerId) {
        clearTimeout(p.timer);
        if (!p.multi && !p.moved && !p.held && performance.now() - p.at < 500) focusHere(e.clientX, e.clientY, false);
      }
      if (cam.pinchHandlers.pointerCount() === 0) press.current = null;
    },
    onPointerCancel: (e: React.PointerEvent) => {
      cam.pinchHandlers.onPointerUp(e);
      clearTimeout(press.current?.timer);
      if (cam.pinchHandlers.pointerCount() === 0) press.current = null;
    },
  };

  function changeExposure(value: number) {
    setImage((s) => ({ ...s, exposure: value }));
    void setExposureCompensation(cam.track(), value);
  }
  function changeWhiteBalance(kelvin: number | null) {
    if (!trackInfo) return;
    const before = image.kelvin;
    setImage((s) => ({ ...s, kelvin }));
    void setWhiteBalance(cam.track(), kelvin, trackInfo).then((ok) => {
      if (!ok) setImage((s) => ({ ...s, kelvin: before }));
    });
  }
  function changeLock(locked: boolean) {
    if (!trackInfo) return;
    void lockFocusExposure(cam.track(), locked, trackInfo).then((ok) => {
      if (ok) setImage((s) => ({ ...s, locked }));
      if (!locked) setFocusMark(null);
    });
  }

  /** The canvas is the picture only for a digital zoom, when forced in the settings, or during a canvas take. */
  const usesCanvas = settings.mode === 'canvas' || view.digital || takeKind === 'canvas';
  /**
   * A direct take records this camera's own track: it can't switch camera or lens, crop digitally, or change
   * shape until it ends (the canvas take can, which is why it exists).
   */
  const canChangeCamera = (phase === 'idle' || phase === 'paused') && takeKind !== 'direct';

  // ───────────── A1 · recorder settings ─────────────
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsVariant = useDesignVariant('record-settings');
  /** Settings reopen the camera and change the format: only between takes. */
  const settingsAllowed = phase === 'idle' && !recorder.current;
  const summary = view.mode
    ? `${resolutionLabel(view.mode.width, view.mode.height)} · ${Math.round(view.mode.fps)} · ${QUALITY_LABEL[settings.quality]}`
    : QUALITY_LABEL[settings.quality];
  useEffect(() => {
    if (!settingsAllowed) setSettingsOpen(false);
  }, [settingsAllowed]);
  const explainDirectLock = () =>
    setNotice(
      'Esta toma graba la imagen de la cámara tal cual: no puede cambiar de cámara a mitad. Termínala con «Listo», o elige «Siempre lienzo» en los ajustes del grabador.',
    );
  const { setDigitalAllowed } = cam;
  useEffect(() => setDigitalAllowed(takeKind !== 'direct'), [setDigitalAllowed, takeKind]);

  // Reviewing: nothing redraws the hidden camera frame, and the song stays quiet under the take's own sound.
  useEffect(() => {
    // Q5: the canvas only draws when it is the picture (digital zoom, canvas forced, or a canvas take).
    cam.compositor.current?.freeze(phase === 'review' || !usesCanvas);
    if (!open || phase !== 'review') return;
    usePlayer.getState().pause();
    return usePlayer.subscribe((s) => {
      if (s.playing) s.pause();
    });
  }, [open, phase, cam.compositor, usesCanvas]);

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
  }, [open, phase]);

  // Q4: 60 fps was asked for but this camera stays at 30 at this size: say it once per camera.
  const told30 = useRef<string | null>(null);
  useEffect(() => {
    const m = view.mode;
    if (!open || view.status !== 'ready' || !m || view.wantFps !== 60 || m.fps >= 45) return;
    const key = `${view.deviceId}|${m.width}x${m.height}`;
    if (told30.current === key) return;
    told30.current = key;
    setNotice(`Esta cámara no da 60 fps en ${resolutionLabel(m.width, m.height)}: graba a ${Math.round(m.fps)}.`);
  }, [open, view.status, view.mode, view.wantFps, view.deviceId]);

  // Notices fade on their own.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const pausePart = useCallback(() => {
    clearTimers();
    usePlayer.getState().pause();
    if (recorder.current) {
      recorder.current.pause();
      meter.current?.drawn.hold();
      meter.current?.delivered?.hold();
      setSeconds(recorder.current.seconds());
      setPhase('paused');
    } else {
      dropUnusedSink();
      setPhase('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A direct take only goes on with the same camera and picture shape: a turned phone pauses it.
  useEffect(() => {
    const src = cam.source.current;
    if (takeKind !== 'direct' || !src) return;
    const onResize = () => {
      const d = direct.current;
      if (!d || (src.videoWidth === d.width && src.videoHeight === d.height)) return;
      if (['countdown', 'arming', 'recording'].includes(phaseRef.current)) {
        pausePart();
        setNotice('Has girado el móvil: ponlo como al empezar para seguir, o termina la toma con «Listo».');
      }
    };
    src.addEventListener('resize', onResize);
    return () => src.removeEventListener('resize', onResize);
  }, [takeKind, cam.source, pausePart]);

  cameraLost.current = () => {
    if (!['countdown', 'arming', 'recording'].includes(phaseRef.current)) return;
    pausePart();
    setNotice('La cámara se ha cortado: la grabación está en pausa.');
  };

  const finish = useCallback(async () => {
    const rec = recorder.current;
    if (!rec || phaseRef.current === 'finishing') return;
    const id = session.current;
    clearTimers();
    recorder.current = null;
    const written = sink.current;
    sink.current = null;
    sinkReady.current = null;
    usePlayer.getState().pause();
    setSeconds(rec.seconds());
    // R4. Canvas take: frames the camera delivered vs frames drawn into the take (the page couldn't keep up).
    // Direct take: the recorder gets every camera frame; what's worth knowing is the real rate (less light →
    // fewer frames per second on many phones), not "losses".
    const m = meter.current;
    meter.current = null;
    m?.drawn.hold();
    m?.delivered?.hold();
    const drawnFrames = m?.drawn.value() ?? 0;
    const deliveredFrames = m?.delivered?.value() ?? 0;
    const expected = m?.delivered ? deliveredFrames : 0;
    const dropped = m?.delivered && deliveredFrames > 0 ? droppedFrames({ expected, delivered: drawnFrames }) : null;
    const realFps = rec.seconds() > 0 && drawnFrames > 0 ? drawnFrames / rec.seconds() : null;
    setPhase('finishing');
    const blob = await rec.finish();
    releasePicture();
    if (id !== session.current) {
      // The recorder closed meanwhile: the take stays on disk, offered next time (not locked by this window).
      if (written) releaseTake(written.id);
      return;
    }
    if (!blob.size) {
      void written?.discard();
      // Nothing came out of a recorder that ran: this phone's encoder can't do that format, use the next one.
      const failed = takeFormat.current?.mimeType;
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
      requestedBps: takeFormat.current?.videoBitsPerSecond ?? 0,
      dropped,
      expected,
      realFps,
    });
    if (tooManyDrops(dropped, expected)) {
      const now = recordSettings();
      setNotice(
        now.fps === 60 || now.quality === 'max'
          ? 'Se han perdido fotogramas: prueba 30 fps o calidad Alta en los ajustes del grabador.'
          : 'Se han perdido fotogramas: cierra otras apps y vuelve a probar.',
      );
    }
    replaceTake({ url: URL.createObjectURL(file), file }, written?.where === 'disk' ? written.id : null);
    if (reviewTake.current && written?.failed()) reviewTake.current.noSpace = true;
    setPhase('review');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video]);
  const finishRef = useRef(finish);
  finishRef.current = finish;

  /** The song is really playing: the camera starts (or goes on) right now. */
  const roll = () => {
    if (!recorder.current) {
      const compositor = cam.compositor.current;
      if (!compositor) return pausePart();
      try {
        // Q5: the camera's own picture when nothing needs redrawing (no digital zoom, canvas not forced);
        // otherwise the canvas, which can also follow a flipped camera or a turned phone mid-take.
        let videoTracks: MediaStreamTrack[];
        const camTrack = cam.track();
        const src = cam.source.current;
        // Direct only with the rotation locked: a turned phone would change the frame size under the recorder.
        if (directPossible() && orientation.current.locked && camTrack && src) {
          videoTracks = [camTrack];
          direct.current = { track: camTrack, width: src.videoWidth, height: src.videoHeight };
          const presented = watchPresentedFrames(src);
          stopPresented.current = presented.stop;
          meter.current = { drawn: createFrameMeter(presented.count), delivered: null };
          setTakeKind('direct');
        } else {
          compositor.lock(true);
          const picture = compositor.stream();
          canvasStream.current = picture;
          videoTracks = picture.getVideoTracks();
          meter.current = {
            drawn: createFrameMeter(() => compositor.counts().drawn),
            delivered: createFrameMeter(() => compositor.counts().delivered),
          };
          setTakeKind('canvas');
        }
        // The song's sound if it's still there, else the microphone; say so when there's neither.
        const audio = [songTrack.current, micTrack.current].find((t) => t?.readyState === 'live') ?? null;
        if (!audio && sound !== 'none') setNotice('No llega el sonido: esta toma se graba sin audio.');
        const tracks = [...videoTracks, ...(audio ? [audio] : [])];
        const target = sink.current;
        if (!target) throw new Error('no sink');
        // A format the browser claims but whose encoder refuses to start: remember it and try the next one.
        let rec: TakeRecorder | null = null;
        for (let attempt = 0; attempt < 6 && !rec; attempt++) {
          const format = plannedFormat();
          takeFormat.current = format;
          try {
            const next: TakeRecorder = createTakeRecorder(tracks, format, target, () => {
              // The browser stopped recording by itself: keep what exists rather than filming nothing.
              if (recorder.current !== next) return;
              setNotice('La grabación se ha cortado. Te dejo lo grabado hasta ahí.');
              void finish();
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
            pausePart();
            setNotice('Se ha perdido el sonido: la grabación está en pausa.');
          };
          audio.addEventListener('ended', onEnded);
          unwatchSound.current = () => audio.removeEventListener('ended', onEnded);
        }
      } catch {
        recorder.current = null;
        releasePicture();
        usePlayer.getState().pause();
        setNotice('Este navegador no puede grabar vídeo. Prueba en Chrome o Safari actualizados.');
        setPhase('idle');
        return;
      }
    } else if (!recorder.current.resume()) {
      setNotice('La grabación se ha cortado. Te dejo lo grabado hasta ahí.');
      void finish();
      return;
    }
    meter.current?.drawn.run();
    meter.current?.delivered?.run();
    setPhase('recording');
  };

  /** Start the song and wait until it really moves (YouTube may still be loading) before rolling. */
  const go = () => {
    const engine = usePlayer.getState().engine;
    if (!engine) {
      setNotice('El reproductor no está listo.');
      setPhase(countFrom.current);
      return;
    }
    const id = session.current;
    setPhase('arming');
    phaseRef.current = 'arming';
    // A new take needs its place on the phone first (a few ms): the song waits for it.
    // A direct take also waits for the screen's rotation lock, asked for now, once the phone is in place.
    if (!recorder.current && !orientation.current.tried) lockForDirect();
    if (!recorder.current && (!sink.current || orientation.current.pending)) {
      if (!sinkReady.current) prepareSink();
      void Promise.all([sinkReady.current!, orientation.current.ready]).then(
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
      armFrame.current = 0;
      if (id !== session.current || phaseRef.current !== 'arming') return;
      const t = engine.getCurrentTime();
      // Two frames in a row moving forward: playing, not just landing on a seek.
      moving = t > prev + 0.001 ? moving + 1 : 0;
      prev = t;
      // …and a camera frame already drawn, or the take would lock to an empty 2×2 canvas.
      if (moving >= 2 && frameReady()) return roll();
      if (performance.now() - began > ARM_TIMEOUT_MS) {
        usePlayer.getState().pause();
        setNotice('La canción no arranca. Dale al play una vez en el reproductor y vuelve a intentarlo.');
        if (countFrom.current === 'idle') dropUnusedSink();
        setPhase(countFrom.current);
        return;
      }
      armFrame.current = requestAnimationFrame(check);
    };
    armFrame.current = requestAnimationFrame(check);
  };

  const countIn = (back: 'idle' | 'paused') => {
    countFrom.current = back;
    unlockAudio();
    if (timer === 0) return go();
    setPhase('countdown');
    setLeft(timer);
    cancelTicks.current = scheduleCountIn(timer);
    for (let i = 1; i < timer; i++) timers.current.push(setTimeout(() => setLeft(timer - i), i * 1000));
    timers.current.push(setTimeout(go, timer * 1000));
  };

  /** Where this take starts and ends in the song. */
  function songSpan(): Span {
    const p = usePlayer.getState();
    const end = p.duration > 0 ? p.duration : Number.POSITIVE_INFINITY;
    if (fromNow === 'range' && hasRange(p.loop)) return { start: p.loop.start, end: p.loop.end };
    if (fromNow === 'here') return { start: hereAt, end };
    return { start: 0, end };
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
    const height = src?.videoHeight || view.mode?.height || (canvas && canvas.height > 2 ? canvas.height : 1080);
    return chooseFormat({
      width,
      height,
      fps: captureFps(),
      quality: settings.quality,
      codec: settings.codec,
    });
  }

  /** The camera has drawn at least one frame (the canvas starts at 2×2). */
  function frameReady() {
    if (directPossible() && orientation.current.locked) return true;
    return (cam.compositor.current?.canvas.width ?? 0) > 2;
  }

  function shutter() {
    const now = phaseRef.current;
    if (now === 'idle') {
      if (view.status !== 'ready' || !cam.source.current?.videoWidth) return;
      setNotice('');
      // A take that can't be direct (iPhone, canvas forced, digital zoom) starts drawing the canvas now, during
      // the count-in; the rotation lock for a direct take is asked for when the count-in ends (go).
      orientation.current = { pending: false, locked: false, tried: false, ready: Promise.resolve() };
      if (!directPossible()) setTakeKind('canvas');
      const s = songSpan();
      spanRef.current = s;
      heatWarned.current = false;
      setSpan(s);
      setSeconds(0);
      const p = usePlayer.getState();
      p.pause();
      p.seek(s.start);
      prepareSink();
      countIn('idle');
    } else if (now === 'countdown') {
      clearTimers();
      if (countFrom.current === 'idle') dropUnusedSink();
      setPhase(countFrom.current);
    } else if (now === 'arming' || now === 'recording') {
      pausePart();
    } else if (now === 'paused') {
      if (view.status !== 'ready') return;
      const d = direct.current;
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
      const s = spanRef.current;
      return s != null && time >= s.end - 0.12;
    };
    const unsubscribe = usePlayer.subscribe((s) => {
      if (near(s.time)) void finish();
    });
    const clock = setInterval(() => {
      const recorded = recorder.current?.seconds() ?? 0;
      setSeconds(recorded);
      // R3: long takes at the heaviest settings heat the phone; say so once per take.
      const now = recordSettings();
      const heavy = now.quality === 'max' || (view.mode?.width ?? 0) * (view.mode?.height ?? 0) > 2560 * 1440;
      if (heavy && !heatWarned.current && recorded > HEAT_WARN_MINUTES * 60) {
        heatWarned.current = true;
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
  }, [phase, finish, pausePart, view.mode]);

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
  }, [open, pausePart]);

  // Leaving the page mid-take, or before saving it, loses it: ask first.
  useEffect(() => {
    if (!rolling && !unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [rolling, unsaved]);

  function requestClose() {
    const now = phaseRef.current;
    if (now === 'finishing') return;
    if (now === 'countdown' || now === 'arming' || now === 'recording') pausePart();
    if (recorder.current || (now === 'review' && take && !saved)) setConfirm('close');
    else onClose();
  }

  // Back / swipe-back: closes the studio, or asks first when a take would be lost.
  useBackToClose(open, onClose, rolling || unsaved);
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;
  useEffect(() => {
    if (!open || !(rolling || unsaved)) return;
    const onPop = () => {
      if (confirmRef.current) setConfirm(null);
      else requestCloseRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open, rolling, unsaved]);

  function again() {
    replaceTake(null);
    setSeconds(0);
    setSpan(null);
    setPhase('idle');
  }

  /**
   * The take was handed to the phone (download or share). Its working copy stops being offered back, unless the
   * take ended because the phone was full: then the download may well have failed too, so it stays on offer.
   */
  function takeKept() {
    setSaved(true);
    const disk = reviewTake.current;
    if (!disk || disk.saved) return;
    disk.saved = true;
    const size = take?.file.size ?? 0;
    // The download is a second copy: on a phone without room for it, it may well fail. Then the app's copy
    // stays (offered again next time) instead of being cleaned up.
    void freeSpace().then((bytes) => {
      if (disk.noSpace || (bytes != null && bytes < size * 1.1)) {
        disk.noSpace = true;
        setNotice('El móvil va justo de espacio: comprueba que la toma está en Descargas. La app guarda su copia hasta que la descartes.');
      } else void markTakeSaved(disk.id);
    });
  }

  function discardTake() {
    recorder.current?.cancel();
    recorder.current = null;
    sink.current = null;
    sinkReady.current = null;
    releasePicture();
    usePlayer.getState().pause();
    again();
  }

  function confirmDiscard() {
    const action = confirm;
    setConfirm(null);
    if (action === 'leftover') {
      dropLeftover();
      return;
    }
    discardTake();
    if (action === 'close') onClose();
  }

  async function save() {
    if (!take || sharing.current) return;
    sharing.current = true;
    try {
      if (IS_IOS && canShareFile(take.file)) {
        // iPhone: the share sheet's "Guardar vídeo" is the way into Photos.
        const result = await shareFile(take.file, video.title);
        if (result === 'shared') takeKept();
        else if (result === 'failed') {
          downloadFile(take.file);
          takeKept();
        }
      } else {
        downloadFile(take.file);
        takeKept();
      }
    } finally {
      sharing.current = false;
    }
  }

  async function share() {
    if (!take || sharing.current) return;
    sharing.current = true;
    try {
      if ((await shareFile(take.file, video.title)) === 'shared') takeKept();
    } finally {
      sharing.current = false;
    }
  }

  function cycleTimer() {
    const next = TIMERS[(TIMERS.indexOf(timer) + 1) % TIMERS.length]!;
    setTimer(next);
    try {
      localStorage.setItem(TIMER_KEY, String(next));
    } catch {
      /* remembered for this visit only */
    }
  }

  const duration = usePlayer((s) => s.duration);
  const fromOptions: From[] = ['start'];
  if (hereAt > 1 && (duration <= 0 || hereAt < duration - 3)) fromOptions.push('here');
  if (loopRange) fromOptions.push('range');
  const fromNow = fromOptions.includes(from) ? from : 'start';
  const startsAt = fromNow === 'range' && loopRange ? loopRange.start : fromNow === 'here' ? hereAt : 0;

  const camReady = view.status === 'ready';
  const canTweak = phase === 'idle' || phase === 'paused';
  const showCamera = phase !== 'review';
  const vertical = view.aspect < 1;
  // What the next take will use; asked again only when the camera or its shape changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nextFormat = useMemo(
    () => (camReady ? plannedFormat() : null),
    [camReady, view.aspect, view.deviceId, view.mode, settings.codec, settings.quality, badVersion],
  );
  const spaceMinutes =
    free != null && nextFormat
      ? minutesLeft(free, nextFormat.videoBitsPerSecond + nextFormat.audioBitsPerSecond)
      : null;
  const lowSpace = spaceMinutes != null && spaceMinutes < LOW_SPACE_MINUTES;

  async function recoverLeftover() {
    const found = leftover;
    if (!found) return;
    const id = session.current;
    const blob = await loadLeftover(found.meta);
    if (id !== session.current) return;
    setLeftover(null);
    setLeftoverCount((n) => Math.max(0, n - 1));
    if (!blob) {
      setNotice('Esa toma ya no está en el móvil.');
      return;
    }
    const type = blob.type || 'video/webm';
    const file = new File([blob], takeFileName({ ...video, title: found.meta.title || video.title }, type, found.meta.startedAt), {
      type,
    });
    setSeconds(-1);
    setLastStats(null);
    replaceTake({ url: URL.createObjectURL(file), file }, found.meta.id);
    if (reviewTake.current && found.meta.noSpace) reviewTake.current.noSpace = true;
    setPhase('review');
  }

  function dropLeftover() {
    const found = leftover;
    setLeftover(null);
    setLeftoverCount((n) => Math.max(0, n - 1));
    if (found) void forgetTake(found.meta.id).then(() => freeSpace().then(setFree));
  }

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] select-none overflow-hidden bg-black text-washi"
      role="dialog"
      aria-modal="true"
      aria-label="Grabar baile"
    >
      {/* The live camera, exactly what a direct take records (Q5); mirrored on screen only for the front camera. */}
      <video
        ref={cam.source}
        autoPlay
        muted
        playsInline
        className={cn(
          'pointer-events-none absolute inset-0 size-full object-contain',
          view.facing === 'user' && '-scale-x-100',
          !showCamera && 'invisible',
        )}
      />
      {/* The redrawn frame, on top when it is the picture (digital zoom or a canvas take). Pinch zooms. */}
      <div
        ref={cam.host}
        {...previewHandlers}
        onPointerCancel={previewHandlers.onPointerCancel}
        className={cn(
          'absolute inset-0 touch-none',
          view.facing === 'user' && '-scale-x-100',
          !showCamera && 'invisible',
          !usesCanvas && '[&>canvas]:opacity-0',
        )}
      />

      {/* Song progress, edge to edge, like TikTok's. */}
      {span &&
        (phase === 'arming' || phase === 'recording' || phase === 'paused' || phase === 'finishing') && (
          <SongBar span={span} />
        )}

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent pb-10 pl-[max(14px,env(safe-area-inset-left))] pr-[max(14px,env(safe-area-inset-right))] pt-[max(14px,env(safe-area-inset-top))]">
        <button
          type="button"
          aria-label="Cerrar"
          disabled={phase === 'finishing'}
          onClick={requestClose}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-black/40 disabled:opacity-30"
        >
          <X className="size-6" />
        </button>
        <div className="flex min-w-0 flex-1 justify-center">
          {phase === 'recording' || phase === 'paused' || phase === 'finishing' ? (
            <span
              className={cn(
                'tabular inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-sm font-bold',
                phase === 'recording' ? 'bg-shu-500' : 'bg-black/55',
              )}
            >
              <span
                className={cn(
                  'size-2 rounded-full',
                  phase === 'recording' ? 'animate-pulse bg-washi' : 'bg-shu-400',
                )}
              />
              {formatTime(seconds)}
            </span>
          ) : (
            <span className="inline-flex min-w-0 items-center gap-2 rounded-full bg-black/40 px-3 py-1.5">
              <Music2 className="size-4 shrink-0 text-kin-300" />
              <span className="truncate text-[14px] font-bold">{video.title}</span>
            </span>
          )}
        </div>
        {/* What the take will be: size · rate · quality (A1: a tap opens the settings). */}
        <span className="flex h-11 min-w-11 shrink-0 items-center justify-end">
          {view.mode && camReady && phase !== 'review' && (
            <button
              type="button"
              disabled={!settingsAllowed}
              onClick={() => setSettingsOpen(true)}
              aria-label={`Ajustes del grabador: ${summary}`}
              className={cn(
                'tabular min-h-9 rounded-full bg-black/45 px-2.5 py-1 font-mono text-[11px] font-bold enabled:active:scale-95',
                view.wantFps === 60 && view.mode.fps < 45 ? 'text-kin-300' : 'text-washi/90',
              )}
            >
              {summary}
            </button>
          )}
        </span>
      </div>

      {/* Tools rail, like TikTok's: right side upright, left side when the phone is turned. */}
      {showCamera && camReady && (canTweak || phase === 'recording') && (
        <div className="absolute right-[max(10px,env(safe-area-inset-right))] top-[calc(max(14px,env(safe-area-inset-top))+64px)] z-10 flex flex-col gap-3 landscape:bottom-[max(10px,env(safe-area-inset-bottom))] landscape:left-[max(10px,env(safe-area-inset-left))] landscape:right-auto landscape:flex-wrap landscape:content-start landscape:gap-x-2 landscape:gap-y-2">
          {/* Turned phones are ~360 px tall: the rail wraps into a second column instead of running off. */}
          {canTweak && (
            <RailButton label="Girar" ariaLabel="Girar la cámara" muted={!canChangeCamera} onClick={canChangeCamera ? cam.flip : explainDirectLock}>
              <SwitchCamera className="size-5" />
            </RailButton>
          )}
          {canTweak && (
            <RailButton
              label={timer ? `${timer} s` : 'Sin'}
              ariaLabel={`Cuenta atrás: ${timer ? `${timer} segundos` : 'sin cuenta'}`}
              onClick={cycleTimer}
            >
              <Timer className="size-5" />
            </RailButton>
          )}
          {view.torchAvailable && (
            <RailButton
              label="Flash"
              ariaLabel={view.torch ? 'Apagar la linterna' : 'Encender la linterna'}
              pressed={view.torch}
              onClick={cam.toggleTorch}
            >
              {view.torch ? <Zap className="size-5" /> : <ZapOff className="size-5" />}
            </RailButton>
          )}
          {phase === 'idle' && fromOptions.length > 1 && (
            <RailButton
              label={fromNow === 'range' ? 'A–B' : fromNow === 'here' ? formatTime(hereAt) : 'Inicio'}
              ariaLabel={`Empezar desde: ${fromNow === 'range' ? 'el tramo A–B' : fromNow === 'here' ? `el minuto ${formatTime(hereAt)}` : 'el principio'}`}
              onClick={() => setFrom(fromOptions[(fromOptions.indexOf(fromNow) + 1) % fromOptions.length]!)}
            >
              {fromNow === 'range' ? (
                <Repeat className="size-5" />
              ) : fromNow === 'here' ? (
                <Locate className="size-5" />
              ) : (
                <SkipBack className="size-5" />
              )}
            </RailButton>
          )}
          {canTweak && cam.lensCycle && (
            <RailButton
              label={`Lente ${(view.deviceId ? view.lenses.ids.indexOf(view.deviceId) : 0) + 1}/${view.lenses.ids.length}`}
              ariaLabel="Cambiar de lente"
              muted={!canChangeCamera}
              onClick={canChangeCamera ? cam.nextLens : explainDirectLock}
            >
              <Aperture className="size-5" />
            </RailButton>
          )}
          {hasImageControls && (
            <RailButton
              label="Imagen"
              ariaLabel="Luz, color y enfoque"
              expanded={imageOpen}
              onClick={() => {
                setInfoOpen(false);
                setImageOpen((v) => !v);
              }}
            >
              <SunMedium className="size-5" />
            </RailButton>
          )}
          {settingsAllowed && (
            <RailButton
              label="Ajustes"
              ariaLabel="Ajustes del grabador"
              expanded={settingsOpen}
              onClick={() => {
                setInfoOpen(false);
                setImageOpen(false);
                setSettingsOpen(true);
              }}
            >
              <Settings2 className="size-5" />
            </RailButton>
          )}
          {canTweak && settings.info && (
            <RailButton
              label="Info"
              ariaLabel="Información técnica de la cámara"
              expanded={infoOpen}
              onClick={() => {
                setImageOpen(false);
                setInfoOpen((v) => !v);
              }}
            >
              <Info className="size-5" />
            </RailButton>
          )}
        </div>
      )}

      {/* C1/C2: where the camera focuses and measures the light; it stays while focus and light are held. */}
      <AnimatePresence>
        {focusMark && showCamera && (
          <motion.div
            key={focusMark.key}
            aria-hidden
            initial={{ opacity: 0, scale: 1.45 }}
            animate={{ opacity: image.locked ? 0.85 : 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            transition={jelly}
            className="pointer-events-none absolute z-20 size-[76px] -translate-x-1/2 -translate-y-1/2 rounded-[8px] border-2 border-kin-300 shadow-[0_0_0_1px_rgb(0_0_0/0.35)]"
            style={{ left: focusMark.x, top: focusMark.y }}
          >
            {image.locked && (
              <span className="absolute -top-8 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-kin-300 px-2 py-0.5 text-[11px] font-bold text-sumi-900">
                <Lock className="size-3" /> Enfoque y luz fijos
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {imageOpen && trackInfo && !confirm && showCamera && (
          <ImageControls
            info={trackInfo}
            state={image}
            onExposure={changeExposure}
            onWhiteBalance={changeWhiteBalance}
            onLock={changeLock}
            onClose={() => setImageOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* A1: grid of thirds and level, over the live picture only. */}
      {showCamera && camReady && settings.grid && (
        <GridOverlay aspect={view.aspect} className="pointer-events-none absolute inset-0 z-[5]" />
      )}
      {showCamera && camReady && settings.level && <LevelIndicator className="pointer-events-none absolute inset-0 z-[5]" />}

      <RecorderSettingsSheet
        variant={settingsVariant}
        open={settingsOpen && settingsAllowed && !confirm}
        onClose={() => setSettingsOpen(false)}
        maxSize={
          trackInfo?.maxWidth && trackInfo.maxHeight ? { width: trackInfo.maxWidth, height: trackInfo.maxHeight } : null
        }
        maxFps={trackInfo?.maxFrameRate ?? null}
        songPossible={songPossible}
        summary={summary}
      />

      <AnimatePresence>
        {infoOpen && !confirm && (
          <InfoPanel
            track={cam.track()}
            format={nextFormat}
            mode={
              (takeKind ?? (usesCanvas ? 'canvas' : 'direct')) === 'direct'
                ? 'Directa (la imagen de la cámara tal cual)'
                : 'Lienzo (cada fotograma se redibuja)'
            }
            last={lastStats}
            onClose={() => setInfoOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* What the take will sound like. */}
      {phase === 'idle' && camReady && sound !== 'pending' && (
        <button
          type="button"
          // S3: with a file the dancer chooses: the clean song or the room's sound (steps, voices).
          disabled={!songPossible}
          onClick={() => settings.set({ sound: settings.sound === 'song' ? 'mic' : 'song' })}
          aria-label={
            songPossible
              ? `Sonido de la toma: ${sound === 'song' ? 'canción limpia' : 'micrófono'}. Toca para cambiar`
              : undefined
          }
          className="absolute inset-x-0 top-[calc(max(14px,env(safe-area-inset-top))+60px)] mx-auto flex min-h-9 w-max max-w-[calc(100vw-150px)] items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-left text-[12px] leading-snug text-washi/90 enabled:active:scale-95"
        >
          {sound === 'song' ? (
            <Music2 className="size-3.5 shrink-0 text-kin-300" />
          ) : sound === 'mic' ? (
            <Mic className="size-3.5 shrink-0 text-kin-300" />
          ) : (
            <MicOff className="size-3.5 shrink-0 text-kin-300" />
          )}
          <span>
            {sound === 'song'
              ? 'Con el audio original de la canción'
              : sound === 'mic'
                ? songPossible
                  ? `Con el micro${settings.micChannels === 'stereo' ? ' (estéreo)' : ''}: se oye la sala`
                  : 'YouTube no deja grabar su audio: se oye por el micro, sube el volumen'
                : 'Sin permiso para el micro: se grabará sin sonido'}
            {rate !== 1 && ` · velocidad ${String(rate).replace('.', ',')}×`}
            {songPossible && <span className="ml-1.5 font-bold text-kin-300">Cambiar</span>}
          </span>
        </button>
      )}

      {/* Count-in */}
      <AnimatePresence>
        {phase === 'countdown' && left > 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <motion.span
              key={left}
              initial={{ scale: 1.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={jelly}
              className="font-display text-[9rem] font-extrabold leading-none text-washi [text-shadow:0_8px_36px_rgb(0_0_0/0.75)]"
            >
              {left}
            </motion.span>
          </div>
        )}
      </AnimatePresence>

      {(phase === 'arming' || phase === 'finishing' || (view.status === 'starting' && showCamera)) && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-[13px]">
            <Spinner className="size-4" />
            {phase === 'arming'
              ? 'Arrancando la canción…'
              : phase === 'finishing'
                ? 'Preparando el vídeo…'
                : 'Abriendo la cámara…'}
          </span>
        </div>
      )}

      {showCamera && (view.status === 'error' || !supported) && (
        <div className="absolute inset-0 grid place-items-center p-8 text-center">
          <div className="max-w-sm">
            <p className="text-[15px] leading-relaxed">
              {supported
                ? view.error
                : 'Este navegador no puede grabar vídeo. Prueba en Chrome o Safari actualizados.'}
            </p>
            {supported && (
              <Button className="mt-5" variant="secondary" onClick={cam.retry}>
                <RefreshCw className="size-4" /> Reintentar
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Bottom controls (a right-hand column when the phone is turned) */}
      {showCamera && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-4 bg-gradient-to-t from-black/80 to-transparent px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-12 landscape:inset-x-auto landscape:right-0 landscape:top-0 landscape:flex-row landscape:bg-gradient-to-l landscape:pb-0 landscape:pl-12 landscape:pr-[max(16px,env(safe-area-inset-right))] landscape:pt-0">
          <AnimatePresence>
            {notice && (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={soft}
                role="status"
                className="max-w-sm rounded-[10px] bg-sumi-900/90 px-3 py-2 text-center text-[13px] leading-snug text-washi landscape:absolute landscape:bottom-[max(16px,env(safe-area-inset-bottom))] landscape:right-[max(16px,env(safe-area-inset-right))] landscape:w-72"
              >
                {notice}
              </motion.p>
            )}
          </AnimatePresence>

          {phase === 'idle' && leftover && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={soft}
              role="status"
              aria-label="Toma sin guardar"
              className="w-full max-w-sm rounded-[14px] border border-kin-400/45 bg-sumi-900/95 p-3 text-[13px] leading-snug landscape:absolute landscape:bottom-[max(16px,env(safe-area-inset-bottom))] landscape:right-[max(16px,env(safe-area-inset-right))] landscape:z-20 landscape:w-80"
            >
              <p className="font-bold text-washi">
                {leftover.meta.videoId === video.id
                  ? 'Hay una toma sin guardar de esta canción'
                  : `Hay una toma sin guardar de «${leftover.meta.title || 'otra canción'}»`}
              </p>
              <p className="mt-0.5 text-washi-muted">
                Del {new Date(leftover.meta.startedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}{' '}
                · {(leftover.size / 1_048_576).toFixed(1).replace('.', ',')} MB. No llegó a guardarse en el móvil.
                {leftoverCount > 1 && ` Hay ${leftoverCount} en total.`}
              </p>
              <div className="mt-2.5 flex gap-3">
                <Button onClick={() => void recoverLeftover()}>Recuperar</Button>
                <Button variant="ghost" onClick={() => setConfirm('leftover')}>
                  Descartar
                </Button>
              </div>
            </motion.div>
          )}

          {phase === 'idle' && camReady && lowSpace && (
            <p
              role="status"
              className="max-w-sm rounded-[10px] border border-shu-400/70 bg-enji-700/95 px-3 py-2 text-center text-[13px] font-bold leading-snug text-washi"
            >
              Queda poco espacio en el móvil: {minutesPhrase(spaceMinutes ?? 0)} de grabación en esta calidad.
              Libera espacio antes de una toma larga.
            </p>
          )}

          {/* Q7: a crop of the frame is less sharp than the lens's own zoom; say so while it's on. */}
          <AnimatePresence>
            {camReady && view.digital && (
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={soft}
                role="status"
                className="pointer-events-none rounded-full bg-sumi-900/90 px-3 py-1 text-[12px] font-bold text-washi"
              >
                Zoom digital: menos nitidez
              </motion.p>
            )}
          </AnimatePresence>

          {camReady && (canTweak || phase === 'recording') && (
            <div
              role="group"
              aria-label="Zoom"
              className="flex items-center gap-1 rounded-full bg-black/45 p-1 landscape:flex-col"
            >
              {cam.chips
                .filter((z) => canTweak || z === cam.activeChip || !(z < 1 || cam.onUltra))
                .map((z) => {
                  const active = z === cam.activeChip;
                  return (
                    <button
                      key={z}
                      type="button"
                      aria-pressed={active}
                      aria-label={`Zoom ${formatZoom(z)}`}
                      onClick={() => cam.pickZoom(z, canChangeCamera)}
                      className={cn(
                        'tabular grid size-10 place-items-center rounded-full font-mono text-[12px] font-bold transition-colors',
                        active ? 'bg-washi text-sumi-900' : 'text-washi/90',
                      )}
                    >
                      {active && Math.abs(view.zoom - z) > 0.05 ? formatZoom(view.zoom) : formatZoom(z)}
                    </button>
                  );
                })}
            </div>
          )}

          <div className="flex items-center justify-center gap-10 landscape:flex-col-reverse landscape:gap-6">
            <div className="grid size-14 place-items-center">
              {phase === 'paused' && (
                <RailButton
                  label="Borrar"
                  ariaLabel="Descartar la toma"
                  onClick={() => setConfirm('discard')}
                >
                  <Trash2 className="size-5" />
                </RailButton>
              )}
            </div>
            <Shutter
              phase={phase}
              span={span}
              disabled={!supported || (!camReady && (phase === 'idle' || phase === 'paused'))}
              onPress={shutter}
            />
            <div className="grid size-14 place-items-center">
              {(phase === 'paused' || phase === 'recording') && (
                <RailButton
                  label="Listo"
                  ariaLabel="Terminar la toma"
                  tone="light"
                  onClick={() => void finish()}
                >
                  <Check className="size-6" strokeWidth={2.6} />
                </RailButton>
              )}
            </div>
          </div>

          <p className="tabular min-h-4 text-center text-[12px] text-washi/75 landscape:hidden">
            {phase === 'idle' && camReady
              ? `${vertical ? 'Vertical' : 'Horizontal'} · empieza en ${formatTime(startsAt)}${timer ? ` · cuenta de ${timer} s` : ''}${spaceMinutes != null && !lowSpace ? ` · espacio para ${minutesPhrase(spaceMinutes)}` : ''}`
              : phase === 'paused'
                ? 'En pausa · toca para seguir o «Listo» para terminar'
                : phase === 'countdown'
                  ? 'Toca para cancelar'
                  : ''}
          </p>
        </div>
      )}

      {/* Review: the take on its own (its own sound, song quiet), actions in their own strip so nothing covers its controls. */}
      {phase === 'review' && take && (
        <div className="absolute inset-0 flex flex-col bg-black landscape:flex-row">
          <video
            src={take.url}
            controls
            autoPlay
            playsInline
            loop
            className="min-h-0 w-full flex-1 bg-black object-contain pt-[calc(max(14px,env(safe-area-inset-top))+48px)] landscape:h-full landscape:min-w-0 landscape:pt-0"
          />
          <div className="flex flex-col items-center gap-3 px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-4 landscape:w-64 landscape:shrink-0 landscape:justify-center landscape:pb-4 landscape:pr-[max(16px,env(safe-area-inset-right))]">
            <p className="tabular text-[12px] text-washi/75">
              {seconds >= 0 ? `${formatTime(seconds)} · ` : 'Recuperada · '}
              {(take.file.size / 1_048_576).toFixed(1).replace('.', ',')} MB
              {saved ? ' · guardado' : ''}
              {' · '}
              <button
                type="button"
                onClick={() => setInfoOpen(true)}
                className="inline-flex min-h-11 items-center font-bold text-kin-300 underline-offset-2 hover:underline"
              >
                Detalles
              </button>
            </p>
            <div className="flex w-full max-w-md flex-wrap items-center justify-center gap-2 landscape:flex-col landscape:items-stretch">
              <Button onClick={() => void save()}>
                {saved ? <Check className="size-4" /> : <Download className="size-4" />}
                {IS_IOS ? 'Guardar en Fotos' : 'Guardar en el móvil'}
              </Button>
              {!IS_IOS && canShareFile(take.file) && (
                <Button variant="secondary" onClick={() => void share()}>
                  <Share className="size-4" /> Compartir
                </Button>
              )}
              <Button variant="secondary" onClick={() => (saved ? again() : setConfirm('again'))}>
                <RefreshCw className="size-4" /> Repetir
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Inside the studio (above it), not a page Dialog: the studio covers every layer below it. */}
      <AnimatePresence>
        {confirm && (
          <motion.div
            className="absolute inset-0 z-30 grid place-items-center bg-sumi-950/80 p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirm(null)}
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="record-discard-title"
              className="paper-raised w-full max-w-sm rounded-[16px] p-6"
              initial={{ y: 24, scale: 0.97 }}
              animate={{ y: 0, scale: 1, transition: soft }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                id="record-discard-title"
                className="font-display text-[22px] font-bold leading-tight text-washi"
              >
                {confirm === 'leftover' ? '¿Descartar la toma sin guardar?' : '¿Descartar la toma?'}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-washi-muted">
                {confirm === 'leftover'
                  ? 'Se borra de este móvil y no se puede recuperar.'
                  : phase === 'review'
                    ? 'Aún no la has guardado en el móvil. Si la descartas, se pierde.'
                    : 'Lo grabado hasta ahora se pierde.'}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" autoFocus onClick={() => setConfirm(null)}>
                  Cancelar
                </Button>
                <Button variant="danger" onClick={confirmDiscard}>
                  Descartar
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

function RailButton({
  label,
  ariaLabel,
  pressed,
  expanded,
  muted,
  tone = 'dark',
  onClick,
  children,
}: {
  label: string;
  ariaLabel?: string;
  pressed?: boolean;
  /** For a button that opens a panel. */
  expanded?: boolean;
  /** Shown but not available right now (its tap explains why). */
  muted?: boolean;
  /** The take's main action (finish): a washi disc instead of a smoked one. */
  tone?: 'dark' | 'light';
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <motion.button
      type="button"
      aria-label={ariaLabel ?? label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-disabled={muted || undefined}
      onClick={onClick}
      style={muted ? { opacity: 0.45 } : undefined}
      whileTap={{ scale: 0.86 }}
      transition={jelly}
      className="flex w-14 flex-col items-center gap-1"
    >
      <span
        className={cn(
          'grid size-11 place-items-center rounded-full',
          tone === 'light'
            ? 'bg-washi text-sumi-900 shadow-[0_8px_18px_-8px_rgb(0_0_0/0.9)]'
            : pressed || expanded
              ? 'bg-kin-300 text-sumi-900'
              : 'bg-black/45',
        )}
      >
        {children}
      </span>
      <span className="tabular text-[11px] font-bold leading-none text-washi [text-shadow:0_1px_4px_rgb(0_0_0/0.8)]">
        {label}
      </span>
    </motion.button>
  );
}

function useSongProgress(span: Span | null): number {
  return usePlayer((s) =>
    span && Number.isFinite(span.end) && span.end > span.start
      ? clamp((s.time - span.start) / (span.end - span.start), 0, 1)
      : 0,
  );
}

function SongBar({ span }: { span: Span }) {
  const progress = useSongProgress(span);
  return (
    <div className="absolute inset-x-0 top-0 z-20 h-[3px] bg-washi/20">
      <div className="h-full origin-left bg-shu-400" style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}

/** Shutter in the app's crest: a hexagon frame that fills with the song while rolling. */
function Shutter({
  phase,
  span,
  disabled,
  onPress,
}: {
  phase: Phase;
  span: Span | null;
  disabled: boolean;
  onPress: () => void;
}) {
  const progress = useSongProgress(span);
  const rolling = phase === 'recording' || phase === 'arming';
  const label =
    phase === 'recording' || phase === 'arming'
      ? 'Pausar la grabación'
      : phase === 'paused'
        ? 'Seguir grabando'
        : phase === 'countdown'
          ? 'Cancelar la cuenta atrás'
          : 'Empezar a grabar';
  return (
    <motion.button
      type="button"
      aria-label={label}
      disabled={disabled || phase === 'finishing'}
      onClick={onPress}
      whileTap={{ scale: 0.9 }}
      transition={jelly}
      className="relative size-20 shrink-0 disabled:opacity-40"
    >
      <svg viewBox="0 0 48 48" className="size-full overflow-visible" aria-hidden>
        <polygon
          points={HEX}
          fill="rgb(0 0 0 / 0.25)"
          stroke="var(--color-kin-400)"
          strokeOpacity={0.7}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {span && phase !== 'idle' && (
          <polygon
            points={HEX}
            pathLength={1}
            fill="none"
            stroke="var(--color-shu-400)"
            strokeWidth="2.6"
            strokeLinejoin="round"
            strokeDasharray="1 1"
            strokeDashoffset={1 - progress}
          />
        )}
        <motion.rect
          initial={false}
          animate={
            rolling
              ? { x: 16, y: 16, width: 16, height: 16, rx: 3 }
              : { x: 10, y: 10, width: 28, height: 28, rx: 14 }
          }
          transition={jelly}
          fill="var(--color-shu-500)"
        />
      </svg>
    </motion.button>
  );
}
