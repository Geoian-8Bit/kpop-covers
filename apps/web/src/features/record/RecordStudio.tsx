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
  takeVerdict,
  directTakeVerdict,
  CAMERA_RATE_MIN_SAMPLES,
  restRateFps,
  type PaceVerdict,
  resolutionClass,
  QUALITY_LABEL,
  resolutionLabel,
  type Clip,
  type Video,
} from '@coverscape/shared';
import { useClips } from '@/data/clips';
import {
  benchDone,
  forgetPace,
  heavyMode,
  judgePace,
  pacePending,
  paceLog,
  paceNotice,
  pacePendingNotice,
  paceRest,
  runBench,
  settleBench,
  type Bench,
  type BenchResult,
} from './pace';
import { StartButton, StartList } from './StartPicker';
import { clipSection, currentChoice, nextStartKind, startKinds, startLabel, type StartChoice } from './startRules';
import { recordSettings, useRecordSettings } from './settings';
import { GridOverlay } from './settings/GridOverlay';
import { LevelIndicator } from './settings/LevelIndicator';
import { RecorderSettingsSheet } from './settings/RecorderSettingsSheet';
import { currentMemberId, useMembers } from '@/data/members';
import { useSaveTake } from '@/data/takes';
import { friendlyError } from '@/lib/supabase';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  Download,
  Info,
  Library,
  Lock,
  Settings2,
  SunMedium,
  Mic,
  MicOff,
  Music2,
  RefreshCw,
  Share,
  SwitchCamera,
  Timer,
  Trash2,
  X,
  Zap,
  ZapOff,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import {
  canRecordCanvas,
  canvasSize,
  createFrameMeter,
  watchPresentedFrames,
  type FrameMeter,
  type FrameWatch,
} from './compositor';
import { countedPace, createSkipWindows, type PaceCounts, type SkipWindows } from './paceSkip';
import { primeSyncAudio, restSyncAudio, syncTakeAudio, type SyncedAudio } from './syncAudio';
import { InfoPanel, type TakeStats } from './InfoPanel';
import { IMAGE_DEFAULT, ImageControls, type ImageState } from './ImageControls';
import { QuickExposure, quickBarBox } from './QuickExposure';
import { formatExposure, snapExposure, type Box as QuickBarBox } from './quickExposureRules';
import { presetLabel } from './whiteBalanceRules';
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
  type TakeSyncMeta,
  type TakeTimingMeta,
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
import { ClapArm } from './clap/ClapArm';
import { createListeningContext } from './clap/clapListener';

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

type WakeLockSentinelLike = { release: () => Promise<void>; released?: boolean };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
};

const HEX = '24,2 43,13 43,35 24,46 5,35 5,13';

/**
 * TikTok-style recording: the camera like the phone's own (vertical or horizontal as the phone is held,
 * 0.5×–5× zoom, flash, front/back), a count-in, then the song and the camera start together. The file
 * carries the song's own sound when the source allows it (uploaded files) and the microphone otherwise
 * (YouTube). The take goes to the phone through a download or the share sheet.
 */
/** A finished take's own length and size, read from the file (a recovered take has no counter; the camera may have changed). */
function probeVideo(url: string): Promise<{ duration: number; width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const el = document.createElement('video');
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
      resolve({ duration, width: el.videoWidth || null, height: el.videoHeight || null });
      el.removeAttribute('src');
      el.load();
    };
    const timer = setTimeout(finish, 4000);
    el.preload = 'metadata';
    el.muted = true;
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) return finish();
      // Recorded WebMs don't say their length: seeking far makes the browser find the end.
      el.ondurationchange = () => {
        if (Number.isFinite(el.duration) && el.duration > 0) finish();
      };
      el.currentTime = 1e101;
    };
    el.onerror = finish;
    el.src = url;
  });
}

export function RecordStudio({ open, onClose, video }: { open: boolean; onClose: () => void; video: Video }) {
  /** The camera went away mid-take (another app, a call): set once pausePart exists, below. */
  const cameraLost = useRef<() => void>(() => undefined);
  /** A take is starting or under way, or a clap is armed (set below): the camera never reopens by itself meanwhile. */
  const cameraBusy = useRef<() => boolean>(() => false);
  const cam = useCamera(
    open,
    () => cameraLost.current(),
    () => cameraBusy.current(),
  );
  const { view } = cam;
  const viewNow = useRef(view);
  viewNow.current = view;
  const settings = useRecordSettings();
  const [phase, setPhase] = useState<Phase>('idle');
  const [timer, setTimer] = useState<TimerSeconds>(readTimer);
  const [from, setFrom] = useState<From>('start');
  const [left, setLeft] = useState(0);
  const [span, setSpan] = useState<Span | null>(null);
  /**
   * P4 · The take's exact length lives in a ref (it is saved with the take). P19 · While rolling, only the small
   * clock in the top bar re-renders (once a second): the recorder itself doesn't, nothing repaints over the camera.
   */
  const secondsExact = useRef(0);
  const [seconds, setShownSeconds] = useState(0);
  const setSeconds = useCallback((value: number) => {
    secondsExact.current = value;
    setShownSeconds(value > 0 ? Math.floor(value) : value);
  }, []);
  const [take, setTake] = useState<Take | null>(null);
  const [saved, setSaved] = useState(false);
  /** F3: kept in the app's «Tomas» (the take's home on this phone). */
  const [kept, setKept] = useState(false);
  const saveTake = useSaveTake();
  const members = useMembers();
  const [confirm, setConfirm] = useState<'close' | 'again' | 'discard' | 'leftover' | 'rearm' | null>(null);
  const [sound, setSound] = useState<SoundSource>('pending');
  const [notice, setNotice] = useState('');
  /** F3 · What «Guardar» did, shown in the review (an error stays until the next try). */
  const [keepMsg, setKeepMsg] = useState<{ text: string; error: boolean } | null>(null);
  /** «Guardar» in flight (reading the file, then the row): no «Repetir» or closing meanwhile. */
  const [keeping, setKeeping] = useState(false);
  const keepingRef = useRef(false);
  keepingRef.current = keeping;
  const [hereAt, setHereAt] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  /** P22 · The list of places to start (held start button). */
  const [startListOpen, setStartListOpen] = useState(false);
  /** R3: the heat notice was shown for this take. */
  const heatWarned = useRef(false);
  const [lastStats, setLastStats] = useState<TakeStats | null>(null);
  /** The format the current take is being recorded with (for the «i» panel's "pedida"). */
  const takeFormat = useRef<RecordFormat | null>(null);
  /** Where the current take is being written (R1); ready before the song starts. */
  const sink = useRef<TakeSink | null>(null);
  const sinkReady = useRef<Promise<TakeSink> | null>(null);
  /** Sync of the take being recorded, and of the one under review (F3/F5). */
  const takeTiming = useRef<TakeTimingMeta | null>(null);
  const reviewTiming = useRef<TakeTimingMeta | null>(null);
  /** The disk copy behind the take under review, and whether it was saved somewhere. */
  const reviewTake = useRef<{ id: string; saved: boolean; noSpace: boolean; kept: boolean; videoId: string } | null>(null);
  /** How the current take gets its picture (Q5): the camera's own track or the redrawn canvas. */
  const [takeKind, setTakeKind] = useState<'direct' | 'canvas' | null>(null);
  /** Width / height of a canvas take's frame, fixed when it started rolling (P19: when to show the canvas). */
  const [lockedAspect, setLockedAspect] = useState<number | null>(null);
  /** P19 · The silent rehearsal running now (its path draws the canvas when it is the canvas one). */
  const [benchPath, setBenchPath] = useState<'direct' | 'canvas' | null>(null);
  const bench = useRef<Bench | null>(null);
  /** The last rehearsal's numbers (panel «i»). */
  const [benchStats, setBenchStats] = useState<BenchResult | null>(null);
  /** Rehearsals tried in this opening (a cancelled one waits for the next opening, not for the next render). */
  const benchTried = useRef(new Set<string>());
  /** «Volver a medir»: runs the rehearsal again now. */
  const [benchNonce, setBenchNonce] = useState(0);
  /**
   * P19 review · How the take's preview keeps up: frames and camera → screen delay, not counted in the first 2 s of
   * the take nor in the 2 s after each resume (`skips`; nothing is sampled meanwhile).
   */
  const takePace = useRef<{ watch: FrameWatch; skips: SkipWindows } | null>(null);
  /**
   * P19 review · The camera in this take's countdown (same session and light, camera open, nothing encoding): its
   * mean rate and delay, what a direct take is compared with. `countWatch` measures while it counts.
   */
  const countRest = useRef<{ fps: number | null; lagMs: number | null } | null>(null);
  const countWatch = useRef<{ watch: FrameWatch; at: number; track: MediaStreamTrack | undefined } | null>(null);
  /** Frames the canvas had drawn when the shutter was pressed (a frame from before is not «ready»). */
  const drawnAtShutter = useRef(0);
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
  // Select the (stable) loop object: a selector that builds a new object on every call loops forever (zustand 5).
  const playerLoop = usePlayer((s) => s.loop);
  const loopRange = hasRange(playerLoop) ? { start: playerLoop.start, end: playerLoop.end } : null;
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
  /** 43 · The take's sound as recorded: delayed to land where the dancer heard it (syncAudio.ts). */
  const syncedSound = useRef<SyncedAudio | null>(null);
  /** 43 · What was applied to the take being recorded (shown in «i» once it ends). */
  const takeSync = useRef<TakeSyncMeta | null>(null);
  /** 43 · What to do when the take's sound is lost (pause with the notice), for the checks on resuming. */
  const soundLost = useRef<() => void>(() => undefined);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cancelTicks = useRef<() => void>(() => undefined);
  const armFrame = useRef(0);
  /** Where a cancelled countdown goes back to. */
  const countFrom = useRef<'idle' | 'paused'>('idle');
  const spanRef = useRef<Span | null>(null);
  const takeUrl = useRef<string | null>(null);
  const wakeLock = useRef<WakeLockSentinelLike | null>(null);
  const restore = useRef<{ loopEnabled: boolean; loopAll: boolean } | null>(null);
  const sharing = useRef(false);
  /**
   * F7 · Armed for a double clap: the analysis context and the microphone track (null while it is asked for).
   * `clapRes` holds what must be freed on disarming; `fromClap` marks the take started by a clap («Armar otra vez»).
   */
  const [clap, setClap] = useState<{ ctx: AudioContext | null; track: MediaStreamTrack | null } | null>(null);
  const clapRes = useRef<{ ctx: AudioContext | null; track: MediaStreamTrack | null } | null>(null);
  const clapFiring = useRef(false);
  const fromClap = useRef(false);

  const unsaved = phase === 'paused' || (phase === 'review' && take != null && !saved && !kept);
  const rolling =
    phase === 'countdown' || phase === 'arming' || phase === 'recording' || phase === 'finishing';
  const supported = canRecord() && canRecordCanvas();

  const replaceTake = (next: Take | null, diskId: string | null = null, reviewVideoId: string | null = null) => {
    if (takeUrl.current) URL.revokeObjectURL(takeUrl.current);
    takeUrl.current = next?.url ?? null;
    // The take we leave: a saved one keeps its copy a while (a download may still be reading it), then goes;
    // an unsaved one the dancer moved on from (they confirmed) is deleted now.
    const old = reviewTake.current;
    if (old && old.id !== diskId) {
      // Not saved: the dancer confirmed discarding it. Saved on a full phone: stays on offer (the download may
      // have failed). Saved: kept a while for the download, then deleted.
      if (old.kept) releaseTake(old.id); // it lives in «Tomas» now
      else if (!old.saved) void forgetTake(old.id);
      else if (old.noSpace) releaseTake(old.id);
      else {
        releaseTake(old.id);
        const id = old.id;
        setTimeout(() => void forgetTake(id), SAVED_GRACE_MS);
      }
    }
    if (diskId) holdTake(diskId);
    reviewTake.current = diskId ? { id: diskId, saved: false, noSpace: false, kept: false, videoId: reviewVideoId ?? video.id } : null;
    setKept(false);
    setKeepMsg(null);
    setTake(next);
    setSaved(false);
  };

  /** Starts preparing where the next take is written; the song waits for it. */
  const prepareSink = () => {
    if (sinkReady.current) return;
    const id = session.current;
    const promise = createTakeSink(
      { videoId: video.id, title: video.title, mimeType: plannedFormat().mimeType, timing: takeTiming.current ?? undefined },
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
    // Still the take this lock was asked for: a cancel or a pause while it was pending leaves `orientation`
    // as it was (nothing was locked yet), so the phase says whether the take is still on.
    const wanted = () => orientation.current === state && ['arming', 'recording'].includes(phaseRef.current);
    state.ready = o.lock(o.type).then(
      () => {
        state.pending = false;
        // Cancelled, paused or closed meanwhile: give the rotation back at once.
        if (!wanted()) {
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
        if (wanted()) setTakeKind('canvas');
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
    endCountWatch(false);
  };

  /**
   * P19 review · The countdown is over (`keep`: the take goes on to roll) or cancelled: stop measuring it, and keep
   * its rate and delay when it really ran on the same camera.
   */
  function endCountWatch(keep: boolean) {
    const c = countWatch.current;
    if (!c) return;
    countWatch.current = null;
    c.watch.stop();
    if (!keep || cam.track() !== c.track) return;
    const fps = restRateFps(c.watch.count(), (performance.now() - c.at) / 1000);
    const lagMs = c.watch.lag.size() >= CAMERA_RATE_MIN_SAMPLES ? c.watch.lag.median() : null;
    countRest.current = { fps, lagMs };
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

  /** Ends the canvas capture and lets the frame follow the phone again. */
  const releasePicture = () => {
    unwatchSound.current();
    unwatchSound.current = () => undefined;
    syncedSound.current?.dispose();
    syncedSound.current = null;
    canvasStream.current?.getTracks().forEach((t) => t.stop());
    canvasStream.current = null;
    cam.compositor.current?.lock(false);
    // A direct take recorded the camera's own track: it stays open for the preview.
    stopPresented.current();
    stopPresented.current = () => undefined;
    takePace.current = null;
    direct.current = null;
    unlockOrientation();
    setTakeKind(null);
    setLockedAspect(null);
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
    // The studio under the recorder stops painting from the clock until it closes (player/store.ts `covered`).
    p.setCovered(true);
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

    // Asked again whenever the page comes back: the browser drops the lock while hidden, and a dancer far from
    // the phone would otherwise see the screen sleep (and the take pause) mid-take.
    let asking = false;
    const keepAwake = () => {
      const lock = wakeLock.current;
      if (asking || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      const nav = navigator as WakeLockNavigator;
      if (!nav.wakeLock) return;
      asking = true;
      void nav.wakeLock
        .request('screen')
        .then((next) => {
          if (id === session.current) wakeLock.current = next;
          else void next.release().catch(() => undefined);
        })
        .catch(() => undefined)
        .finally(() => {
          asking = false;
        });
    };
    keepAwake();
    document.addEventListener('visibilitychange', keepAwake);

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      session.current++;
      document.removeEventListener('visibilitychange', keepAwake);
      document.body.style.overflow = overflow;
      clearTimers();
      disarmClap();
      recorder.current?.cancel();
      recorder.current = null;
      dropUnusedSink();
      releasePicture();
      restSyncAudio();
      micTrack.current?.stop();
      micTrack.current = null;
      void wakeLock.current?.release().catch(() => undefined);
      wakeLock.current = null;
      const saved = restore.current;
      restore.current = null;
      usePlayer.getState().setCovered(false);
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
  // F17: the take records what is heard, voice mode included.
  const voiceMode = usePlayer((s) => s.voiceMode);
  const songSoundLabel =
    voiceMode === 'sin-voz' ? 'la canción sin voz' : voiceMode === 'voz' ? 'la voz de la canción al frente' : 'el audio original de la canción';
  useEffect(() => {
    if (!open || recorder.current) return;
    const id = session.current;
    let live = true;
    const tap =
      settings.sound === 'song' ? (usePlayer.getState().engine?.captureAudio?.() ?? null) : null;
    songTrack.current = tap;
    micTrack.current?.stop();
    micTrack.current = null;
    // 43 · The context that will delay this sound, woken early (Chrome allows it after any tap): one that just
    // started may not know its latency yet. Only when this sound needs it (see primeSyncAudio).
    if (tap) primeSyncAudio(tap);
    if (tap) setSound('song');
    else {
      setSound('pending');
      void openMic(settings.micChannels).then((track) => {
        if (!live || id !== session.current) {
          track?.stop();
          return;
        }
        micTrack.current = track;
        primeSyncAudio(track);
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
  /** P48 · Automatic colour stuck during a take: the camera is reopened once the recorder is idle. */
  const wbReopenLater = useRef(false);
  /** P48 · The camera is being reopened for the colour: what to apply again once it is back. */
  const colourReopen = useRef<{ exposure: number; torch: boolean } | null>(null);
  /** P49 · Where the quick light bar is (after a tap to focus); null when hidden. */
  const [quickLight, setQuickLight] = useState<QuickBarBox | null>(null);
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
    // A reopen for the colour has its own notice (and keeps the light).
    if (imageRef.current.locked && !colourReopen.current)
      setNotice('La cámara se ha reiniciado: el enfoque y la luz vuelven a automático.');
    setImage(IMAGE_DEFAULT);
    setFocusMark(null);
    setQuickLight(null);
    // A camera opened afresh is on automatic colour already.
    wbReopenLater.current = false;
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
    let y = (clientY - r.top - (r.height - h) / 2) / h;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    // A digital zoom shows the centre of the frame, enlarged: the point is that much nearer the centre.
    if (view.crop > 1.001) {
      x = 0.5 + (x - 0.5) / view.crop;
      y = 0.5 + (y - 0.5) / view.crop;
    }
    if (view.facing === 'user') x = 1 - x;
    return { x, y };
  }

  function focusHere(clientX: number, clientY: number, lock: boolean) {
    const info = trackInfo;
    const p = framePoint(clientX, clientY);
    if (!info || !p) return;
    stopBench();
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
        // A second finger: a pinch is coming (zoom), which a rehearsal must not measure.
        stopBench();
        // The quick light bar would sit under the fingers: it goes until the next tap.
        if (!p.multi) setQuickLight(null);
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
    stopBench();
    setImage((s) => ({ ...s, exposure: value }));
    void setExposureCompensation(cam.track(), value);
  }
  /** The latest «Color de la luz» asked for: an older answer never overwrites a newer choice. */
  const wbAsk = useRef(0);
  function changeWhiteBalance(kelvin: number | null) {
    if (!trackInfo) return;
    stopBench();
    const ask = ++wbAsk.current;
    const t = cam.track();
    // A new choice replaces a return to automatic still owed from earlier in the take.
    wbReopenLater.current = false;
    setImage((s) => ({ ...s, kelvin }));
    void setWhiteBalance(t, kelvin, trackInfo).then((result) => {
      // Another camera (or the same one reopened) since: its own reset already says «Auto».
      if (result === 'applied' || result === 'superseded' || ask !== wbAsk.current || cam.track() !== t) return;
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
    const lost = [light && !ev ? 'la luz vuelve a 0' : null, flashLost ? 'el flash se ha apagado' : null].filter(Boolean);
    if (lost.length) setNotice(`La cámara se ha reiniciado: ${lost.join(' y ')}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.status, trackInfo]);
  // P48 · Automatic colour is owed (it stuck during a take): the camera reopens as soon as the recorder is idle.
  useEffect(() => {
    if (!wbReopenLater.current || phase !== 'idle' || clap != null || view.status !== 'ready') return;
    if (cameraBusy.current()) return;
    wbReopenLater.current = false;
    reopenForColour();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, clap, view.status]);
  function changeLock(locked: boolean) {
    if (!trackInfo) return;
    stopBench();
    void lockFocusExposure(cam.track(), locked, trackInfo).then((ok) => {
      if (ok) setImage((s) => ({ ...s, locked }));
      if (!locked) setFocusMark(null);
    });
  }

  /** A take goes through the canvas for a digital zoom, when forced in the settings, or when it can't be direct. */
  const usesCanvas = settings.mode === 'canvas' || view.digital || takeKind === 'canvas';
  /**
   * P19 · The canvas is on screen only when the recorded frame no longer matches the live picture: a canvas take
   * whose phone was turned mid-take (it keeps its first shape, with bars). Otherwise the live video is the preview.
   */
  const canvasOnScreen = takeKind === 'canvas' && lockedAspect != null && Math.abs(view.aspect - lockedAspect) > 0.02;
  /**
   * A direct take records this camera's own track: it can't switch camera or lens, crop digitally, or change
   * shape until it ends (the canvas take can, which is why it exists).
   */
  const canChangeCamera = (phase === 'idle' || phase === 'paused') && takeKind !== 'direct';

  // ───────────── A1 · recorder settings ─────────────
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** P26 · The settings opened from the chip show only «Calidad». */
  const [settingsOnly, setSettingsOnly] = useState<'quality' | null>(null);
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

  // P19 · The silent rehearsal: once per phone, camera mode and format, a couple of seconds after the camera is
  // ready and only while nothing else happens (at most one try per opening). A phone that doesn't keep up twice in a
  // row steps down (60 → 30, or a smaller size) and says so; the camera reopens lighter on its own (the cap is part
  // of its mode). A first «too slow» is only said; the next opening's rehearsal (or a long take) confirms it or not.
  const clapArmed = clap != null;
  // P49 · Anything that covers the preview (a panel, a dialog, the armed clap, the review) sends the quick light bar
  // away for good: it only comes back with a new tap, placed for that tap.
  const quickCovered = imageOpen || infoOpen || settingsOpen || startListOpen || confirm != null || clapArmed || phase === 'review';
  useEffect(() => {
    if (quickCovered) setQuickLight(null);
  }, [quickCovered]);
  useEffect(() => {
    if (open) benchTried.current = new Set();
  }, [open]);
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
      typeof matchMedia === 'function' && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
    const path: 'direct' | 'canvas' = !IS_IOS && settings.mode === 'auto' && !view.digital && installed ? 'direct' : 'canvas';
    const format = plannedFormat();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phase, view.status, view.mode, view.deviceId, view.digital, view.wantFps, settings.mode, settings.codec, settings.quality, supported, clapArmed, benchNonce]);

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
  }, [notice]);

  const pausePart = useCallback(() => {
    clearTimers();
    usePlayer.getState().pause();
    if (recorder.current) {
      recorder.current.pause();
      meter.current?.drawn.hold();
      meter.current?.delivered?.hold();
      takePace.current?.watch.sampleLag(false);
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

  // An armed clap counts too: a camera reopening then would answer a clap with «La cámara no está lista».
  cameraBusy.current = () => phaseRef.current !== 'idle' || recorder.current != null || clapRes.current != null;

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
    // P19 review · The pace, without the first 2 s of the take and of each resume: frames, and how late the preview
    // showed them. Callbacks the page missed and the median rate are only logged (they don't judge a direct take).
    const tp = takePace.current;
    const lagMs = tp?.watch.lag.median() ?? null;
    const total: PaceCounts = { drawn: drawnFrames, delivered: deliveredFrames, seconds: rec.seconds() };
    const kept = tp ? countedPace(total, tp.skips.skipped(total)) : null;
    const counted = kept
      ? { frames: kept.drawn, delivered: kept.delivered, missed: tp?.watch.missed() ?? 0, seconds: kept.seconds }
      : null;
    const captureFps = tp?.watch.cameraFps() ?? null;
    const countdown = countRest.current;
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
      lagMs,
      restFps: countdown?.fps ?? null,
      missed: m?.delivered ? null : (counted?.missed ?? null),
      sync: takeSync.current,
    });
    // P19 · A take whose preview couldn't keep up (frames lost, or a delay that grew): this phone doesn't keep up
    // with the mode. Confirmed by a second measurement, the next takes step down by themselves (60 → 30, or a
    // smaller size) and the review says so. A canvas take is judged against the frames the camera delivered; a
    // direct take (the file gets every camera frame) by its delay against the countdown's, and by its mean rate
    // against the countdown's only when the delay grows too: never by callbacks the page missed, by the median rate,
    // nor by the rate at rest of an earlier rehearsal (a darker room slows the camera down by itself). (Read from a
    // ref: this callback is memoised.)
    const mode = viewNow.current.mode;
    const rest = mode ? paceRest(mode) : null;
    let verdict: PaceVerdict = 'unknown';
    if (mode && counted && counted.seconds > 0) {
      const resolution = resolutionClass(mode.width, mode.height);
      verdict = m?.delivered
        ? takeVerdict({
            wantFps: viewNow.current.wantFps,
            cameraFps: counted.delivered / counted.seconds,
            frames: counted.frames,
            seconds: counted.seconds,
            resolution,
            lagMs,
            restLagMs: rest?.lagMs ?? null,
          })
        : directTakeVerdict({
            wantFps: viewNow.current.wantFps,
            modeFps: mode.fps,
            presented: counted.frames,
            seconds: counted.seconds,
            restFps: countdown?.fps ?? null,
            resolution,
            lagMs,
            restLagMs: countdown?.lagMs ?? rest?.lagMs ?? null,
          });
    }
    const judged = mode && verdict !== 'unknown' ? judgePace(verdict, resolutionClass(mode.width, mode.height)) : 'none';
    paceLog('take', {
      kind: m?.delivered ? 'canvas' : 'direct',
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
    replaceTake({ url: URL.createObjectURL(file), file }, written?.where === 'disk' ? written.id : null);
    reviewTiming.current = takeTiming.current;
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
          takePace.current = { watch: presented, skips: createSkipWindows() };
          meter.current = { drawn: createFrameMeter(presented.count), delivered: null };
          setTakeKind('direct');
        } else {
          // The preview is still the live video: its delay says how the take's picture keeps up.
          if (src) {
            const presented = watchPresentedFrames(src);
            stopPresented.current = presented.stop;
            takePace.current = { watch: presented, skips: createSkipWindows() };
          }
          compositor.lock(true);
          setLockedAspect(compositor.canvas.height > 0 ? compositor.canvas.width / compositor.canvas.height : null);
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
        const target = sink.current;
        if (!target) throw new Error('no sink');
        // 43 · The recorded sound is delayed to where the dancer heard it (speaker + camera latency); the preview
        // and what plays are untouched. `audio` stays the one watched for going away.
        const how = { sound: audio === songTrack.current ? 'song' : 'mic', path: direct.current ? 'direct' : 'canvas' } as const;
        const synced = audio
          ? syncTakeAudio(audio, {
              ...how,
              fps: captureFps(),
              drawLagMs: direct.current ? null : compositor.drawLagMs(),
              trimMs: settings.syncTrimMs,
            })
          : null;
        syncedSound.current = synced;
        takeSync.current = synced
          ? { ...synced.plan, ...how, applied: synced.applied, songAtRoll: usePlayer.getState().engine?.getCurrentTime() ?? null }
          : null;
        if (takeSync.current) target.setSync(takeSync.current);
        const tracks = [...videoTracks, ...(synced ? [synced.track] : [])];
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
          soundLost.current = onEnded;
          // 43 · …or the context that delays it interrupted (iOS: a call, Siri) or the delayed copy ended, and it
          // didn't come back within a moment.
          const unwatchSync = synced?.watch(onEnded) ?? (() => undefined);
          unwatchSound.current = () => {
            audio.removeEventListener('ended', onEnded);
            unwatchSync();
          };
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
    } else {
      // 43 · Its sound may have stopped while paused (iOS: a call): woken again, or the take pauses with the notice.
      syncedSound.current?.ensure(() => soundLost.current());
    }
    meter.current?.drawn.run();
    meter.current?.delivered?.run();
    // P19 review · The take's start and each resume stutter a little (the song starting): their first 2 s are not
    // counted nor sampled; the clock starts sampling once they're over.
    const tp = takePace.current;
    if (tp) {
      tp.watch.sampleLag(false);
      tp.skips.start(paceCounts());
    }
    setPhase('recording');
  };

  /** Start the song and wait until it really moves (YouTube may still be loading) before rolling. */
  const go = () => {
    endCountWatch(true);
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
    primeSyncAudio(songTrack.current, micTrack.current);
    // P19 review · A new take's countdown measures the camera as it is right now (same light, nothing encoding).
    if (back === 'idle') {
      countRest.current = null;
      endCountWatch(false);
      const src = cam.source.current;
      if (timer > 0 && src) countWatch.current = { watch: watchPresentedFrames(src), at: performance.now(), track: cam.track() };
    }
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

  /**
   * The canvas holds a frame of this take: drawn after the shutter (not one left from an older take or rehearsal,
   * maybe of another shape) and of the picture's size now, or the take would lock to a stale frame.
   */
  function frameReady() {
    if (recorder.current) return true;
    if (directPossible() && orientation.current.locked) return true;
    const c = cam.compositor.current;
    const src = cam.source.current;
    if (!c || !src?.videoWidth) return false;
    const want = canvasSize(src.videoWidth, src.videoHeight);
    return c.counts().drawn > drawnAtShutter.current && c.canvas.width === want.width && c.canvas.height === want.height;
  }

  function shutter() {
    const now = phaseRef.current;
    if (now === 'idle') {
      if (view.status !== 'ready' || !cam.source.current?.videoWidth) return;
      stopBench();
      drawnAtShutter.current = cam.compositor.current?.counts().drawn ?? 0;
      setNotice('');
      // A take that can't be direct (iPhone, canvas forced, digital zoom) starts drawing the canvas now, during
      // the count-in; the rotation lock for a direct take is asked for when the count-in ends (go).
      orientation.current = { pending: false, locked: false, tried: false, ready: Promise.resolve() };
      if (!directPossible()) setTakeKind('canvas');
      const s = songSpan();
      const p = usePlayer.getState();
      spanRef.current = s;
      // F3/F5: what the take is synced to (saved with it; recovered takes keep it too).
      takeTiming.current = {
        songStart: s.start,
        songEnd: Number.isFinite(s.end) ? s.end : null,
        speed: p.rate,
        mirrored: p.mirrored,
        clipId: fromNow === 'range' ? p.activeClipId : null,
      };
      heatWarned.current = false;
      fromClap.current = clapFiring.current;
      clapFiring.current = false;
      setSpan(s);
      setSeconds(0);
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
      // P19: only the ref; the clock in the top bar reads it on its own, the recorder doesn't re-render.
      secondsExact.current = recorded;
      // P19 review · The pace is counted 2 s after the take's start and after each resume (they stutter a little).
      const tp = takePace.current;
      if (tp && meter.current && tp.skips.tick(paceCounts())) tp.watch.sampleLag(true);
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

  // ───────────── F7 · Armed for a double clap ─────────────
  /** Arms: the microphone is asked for now if the take doesn't already use it (songs from a file don't). */
  function armClap() {
    if (phaseRef.current !== 'idle' || clapRes.current || !supported || view.status !== 'ready') return;
    stopBench();
    setNotice('');
    setSettingsOpen(false);
    setImageOpen(false);
    setInfoOpen(false);
    unlockAudio();
    primeSyncAudio(songTrack.current, micTrack.current);
    // Made inside the tap: Safari only lets audio start in one.
    const ctx = createListeningContext();
    if (!ctx) {
      setNotice('Este navegador no puede escuchar el micrófono: graba con el botón.');
      return;
    }
    const res: { ctx: AudioContext | null; track: MediaStreamTrack | null } = { ctx, track: null };
    clapRes.current = res;
    setClap({ ctx, track: null });
    const id = session.current;
    const live = micTrack.current?.readyState === 'live' ? micTrack.current : null;
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
    clapFiring.current = true;
    shutter();
    clapFiring.current = false;
  }

  /** From the review: back to waiting for a clap (asking first when the take would be lost). */
  function armAgain() {
    if (keepingRef.current) return;
    if (!(saved || kept)) {
      setConfirm('rearm');
      return;
    }
    again();
    phaseRef.current = 'idle';
    armClap();
  }

  // Armed only while nothing else runs: a take started another way (a key on the shutter behind the overlay, the
  // recovery of a leftover) disarms, so the microphone and its analysis are never left open.
  useEffect(() => {
    if (clap && phase !== 'idle') disarmClap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, clap != null]);

  // Back while armed disarms (the studio stays open).
  useEffect(() => {
    if (!clap) return;
    const onPop = () => disarmClap();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clap != null]);

  function requestClose() {
    const now = phaseRef.current;
    if (now === 'finishing' || keepingRef.current) return;
    if (now === 'countdown' || now === 'arming' || now === 'recording') pausePart();
    if (recorder.current || (now === 'review' && take && !saved && !kept)) setConfirm('close');
    else onClose();
  }

  // Back / swipe-back: closes the studio, or asks first when a take would be lost. With a panel open (settings,
  // image, info, start list) it closes that panel only.
  const panelOpen = settingsOpen || imageOpen || infoOpen || startListOpen;
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;
  useBackToClose(open, onClose, rolling || unsaved || clap != null || panelOpen);
  useEffect(() => {
    if (!panelOpen) return;
    const onPop = () => {
      setSettingsOpen(false);
      setImageOpen(false);
      setInfoOpen(false);
      setStartListOpen(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [panelOpen]);
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;
  useEffect(() => {
    if (!open || !(rolling || unsaved)) return;
    const onPop = () => {
      if (confirmRef.current) setConfirm(null);
      else if (!panelOpenRef.current) requestCloseRef.current();
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
  /**
   * F3 «Guardar»: the take joins this song's «Tomas» (on this phone; the group sees its row, and can see the video
   * once shared). Only for takes written to the phone's storage and of this song.
   */
  const canKeep = reviewTake.current != null && reviewTake.current.videoId === video.id;
  async function keepInApp() {
    const disk = reviewTake.current;
    if (!take || !disk || disk.kept || keepingRef.current) return;
    keepingRef.current = true;
    setKeeping(true);
    const timing = reviewTiming.current;
    setKeepMsg(null);
    // No «¿Quién eres?» here (it would open under the recorder): unnamed takes can be claimed later in «Tomas».
    const probe = await probeVideo(take.url);
    void saveTake
      .mutateAsync({
        id: disk.id,
        video: { id: video.id },
        file: take.file,
        memberId: currentMemberId(members.data),
        songStart: timing?.songStart ?? 0,
        songEnd: timing?.songEnd ?? null,
        clipId: timing?.clipId ?? null,
        speed: timing?.speed ?? 1,
        mirrored: timing?.mirrored ?? false,
        durationSeconds: secondsExact.current > 0 ? secondsExact.current : probe.duration,
        width: probe.width ?? view.mode?.width ?? null,
        height: probe.height ?? view.mode?.height ?? null,
        mimeType: take.file.type || null,
        fileName: take.file.name,
      })
      .then(() => {
        if (reviewTake.current !== disk) return;
        disk.kept = true;
        setKept(true);
        setKeepMsg({ text: 'Guardada en «Tomas» de esta canción.', error: false });
      })
      .catch((err: unknown) => {
        if (reviewTake.current === disk) setKeepMsg({ text: friendlyError(err), error: true });
      })
      .finally(() => setKeeping(false));
  }

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

  /**
   * P20 · «Descartar» drops the take and leaves the camera ready for the next one, also when it was asked from
   * «Cerrar» (or the phone's «Atrás»): leaving the recorder is its own button, «Descartar y salir».
   */
  function confirmDiscard(exit = false) {
    const action = confirm;
    setConfirm(null);
    if (action === 'leftover') {
      dropLeftover();
      return;
    }
    discardTake();
    if (exit) onClose();
    if (action === 'rearm') {
      phaseRef.current = 'idle';
      armClap();
    }
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
  const fromOptions: From[] = startKinds({ hereAt, duration, hasRange: loopRange != null });
  const fromNow = fromOptions.includes(from) ? from : 'start';
  // P22 · The start as shown (a section that is a clip carries the clip's name), and the song's clips to pick from.
  const clips = useClips(video.id);
  const activeClipId = usePlayer((s) => s.activeClipId);
  const activeClip = clips.data?.find((c) => c.id === activeClipId) ?? null;
  const startChoice = currentChoice({ kind: fromNow, hereAt, range: loopRange, clip: activeClip });
  useEffect(() => {
    if (phase !== 'idle') setStartListOpen(false);
  }, [phase]);

  /**
   * P22 · A start picked from the list. A clip becomes the A–B section (without looping: the take ends at B), and
   * only that: the take keeps the studio's speed, mirror and zoom (a clip saved at 0,75× would otherwise
   * record at 0,75×, mirrored, and move the studio's zoom under the recorder). The studio gets its own A–B and clip
   * back on closing.
   */
  const startRestore = useRef<{ start: number | null; end: number | null; activeClipId: string | null } | null>(null);
  function pickStart(choice: StartChoice) {
    setStartListOpen(false);
    if (choice.kind === 'clip') {
      const clip = clips.data?.find((c: Clip) => c.id === choice.clipId);
      const p = usePlayer.getState();
      const section = clip ? clipSection(clip, p.duration) : null;
      if (!clip || !section) {
        setNotice('Este clip queda fuera de este vídeo.');
        return;
      }
      startRestore.current ??= { start: p.loop.start, end: p.loop.end, activeClipId: p.activeClipId };
      p.pause();
      usePlayer.setState({ loop: { ...section, enabled: false }, activeClipId: clip.id });
      setFrom('range');
      return;
    }
    setFrom(choice.kind);
  }
  // Declared after the opening effect: its clean-up runs after that one's, which gives the loop's on/off back.
  useEffect(() => {
    if (!open) return;
    startRestore.current = null;
    return () => {
      const before = startRestore.current;
      startRestore.current = null;
      if (before)
        usePlayer.setState((s) => ({
          loop: { ...s.loop, start: before.start, end: before.end },
          activeClipId: before.activeClipId,
        }));
    };
  }, [open]);

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
    fromClap.current = false;
    replaceTake({ url: URL.createObjectURL(file), file }, found.meta.id, found.meta.videoId);
    reviewTiming.current = found.meta.timing ?? null;
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
      {/*
        P19 · The preview is always the live camera <video>: the browser composites it on its own, so nothing the page
        does (a busy main thread, the canvas being drawn) can hold it up. A digital zoom is shown by cropping it with
        CSS inside a box of the frame's shape, exactly the centre crop the canvas records. Mirrored on screen only
        for the front camera. Never hidden while a take may draw from it: some browsers stop presenting a hidden
        video, and the canvas take (drawn from its frames) would freeze; when the canvas is the preview, it covers it.
      */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 grid place-items-center [container-type:size]',
          !showCamera && 'invisible',
        )}
      >
        <div
          className="relative overflow-hidden"
          style={{ aspectRatio: view.aspect, width: `min(100cqw, calc(100cqh * ${view.aspect}))` }}
        >
          <video
            ref={cam.source}
            autoPlay
            muted
            playsInline
            className="absolute inset-0 size-full object-contain"
            style={
              view.crop > 1.001 || view.facing === 'user'
                ? { transform: `scale(${view.facing === 'user' ? -view.crop : view.crop}, ${view.crop})` }
                : undefined
            }
          />
        </div>
      </div>
      {/*
        The redrawn frame a canvas take records. Shown only when the phone was turned mid-take (the take keeps its
        first shape, with bars): then the preview has to be the recorded frame. Pinch zooms, tap focuses.
      */}
      <div
        ref={cam.host}
        {...previewHandlers}
        onPointerCancel={previewHandlers.onPointerCancel}
        className={cn(
          'absolute inset-0 touch-none',
          view.facing === 'user' && '-scale-x-100',
          !showCamera && 'invisible',
          // The recorded frame on top of the live video, which stays playing underneath (covered, not hidden).
          canvasOnScreen ? 'bg-black' : '[&>canvas]:invisible',
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
              <TakeClock read={() => recorder.current?.seconds() ?? secondsExact.current} running={phase === 'recording'} />
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
              onClick={() => {
                // P26: the chip opens only its own setting (quality, size and frame rate).
                setSettingsOnly('quality');
                setSettingsOpen(true);
              }}
              aria-label={`Calidad: ${summary}. Toca para cambiarla`}
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
          {(view.torchAvailable || cam.flashElsewhere) && (
            // P23 · The flash lives on one rear camera: on another lens it shows muted and its tap says which one.
            <RailButton
              label="Flash"
              ariaLabel={
                view.torchAvailable
                  ? view.torch
                    ? 'Apagar el flash'
                    : 'Encender el flash'
                  : `Flash no disponible: ${cam.noTorchHint ?? 'esta lente no tiene flash.'}`
              }
              pressed={view.torchAvailable && view.torch}
              muted={!view.torchAvailable}
              onClick={
                view.torchAvailable
                  ? () => {
                      stopBench();
                      cam.toggleTorch();
                    }
                  : () => setNotice(cam.noTorchHint ?? 'Esta lente no tiene flash.')
              }
            >
              {view.torch ? <Zap className="size-5" /> : <ZapOff className="size-5" />}
            </RailButton>
          )}
          {phase === 'idle' && (fromOptions.length > 1 || (clips.data?.length ?? 0) > 0) && (
            <StartButton
              choice={startChoice}
              listOpen={startListOpen}
              onTap={() => {
                if (fromOptions.length > 1) setFrom(nextStartKind(fromNow, fromOptions));
                else setStartListOpen(true);
              }}
              onOpenList={() => {
                setInfoOpen(false);
                setImageOpen(false);
                setStartListOpen(true);
              }}
            />
          )}
          {/* P27: «Imagen» lives in the settings fan; during a take (no settings then) it stays here. */}
          {hasImageControls && !settingsAllowed && (
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
                setSettingsOnly(null);
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

      {/* P49 · Quick light beside the focus ring: the panel's «Luz», same value, same way to the camera. */}
      <AnimatePresence>
        {quickLight && trackInfo?.exposureCompensation && showCamera && camReady && !imageOpen && !confirm && clap == null && (
          <QuickExposure
            key="quick-light"
            box={quickLight}
            range={trackInfo.exposureCompensation}
            value={image.exposure}
            onAdjustStart={stopBench}
            onPreview={(v) => setExposureCompensation(cam.track(), v)}
            onCommit={changeExposure}
            onDismiss={() => setQuickLight(null)}
          />
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
        open={settingsOpen && settingsAllowed && !confirm}
        onClose={() => setSettingsOpen(false)}
        maxSize={
          trackInfo?.maxWidth && trackInfo.maxHeight ? { width: trackInfo.maxWidth, height: trackInfo.maxHeight } : null
        }
        maxFps={trackInfo?.maxFrameRate ?? null}
        songPossible={songPossible}
        summary={summary}
        only={settingsOnly}
        image={
          hasImageControls
            ? {
                summary: imageSummary(image),
                onOpen: () => {
                  setSettingsOpen(false);
                  setInfoOpen(false);
                  setImageOpen(true);
                },
              }
            : null
        }
      />

      <AnimatePresence>
        {startListOpen && phase === 'idle' && !confirm && (
          <StartList
            current={startChoice}
            hereAt={fromOptions.includes('here') ? hereAt : null}
            range={loopRange}
            clips={clips.data ?? []}
            onPick={pickStart}
            onClose={() => setStartListOpen(false)}
          />
        )}
      </AnimatePresence>

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
            pace={
              view.paceCapped
                ? 'Más ligera: este móvil no fue fluido con lo pedido'
                : benchPath
                  ? 'Midiendo…'
                  : 'Como se pide'
            }
            video={showCamera ? cam.source.current : null}
            bench={benchStats}
            rest={view.mode ? paceRest(view.mode) : null}
            // Only where measuring again changes something: a lighter mode learnt, a first «too slow» waiting, or a
            // mode that is measured (60 fps, above 1080p). Otherwise the panel says when it will be measured.
            onRemeasure={
              settingsAllowed &&
              !benchPath &&
              (view.paceCapped || benchStats != null || pacePending() || (view.mode != null && heavyMode(view.mode)))
                ? remeasure
                : undefined
            }
            paceHint={
              view.mode && !heavyMode(view.mode) && !view.paceCapped
                ? 'La fluidez se mide sola al grabar a 60 fps o por encima de 1080p.'
                : undefined
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
              ? `Sonido de la toma: ${sound === 'song' ? songSoundLabel : 'micrófono'}. Toca para cambiar`
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
              ? `Con ${songSoundLabel}`
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

          {/* P19 review · The rehearsal costs a couple of seconds of encoding on a slow phone: say what it is. */}
          <AnimatePresence>
            {camReady && phase === 'idle' && benchPath && !notice && (
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={soft}
                role="status"
                className="pointer-events-none rounded-full bg-sumi-900/90 px-3 py-1 text-[12px] font-bold text-washi landscape:hidden"
              >
                Comprobando que el móvil va fluido…
              </motion.p>
            )}
          </AnimatePresence>

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
            // P23 · Lenses and zoom like the phone's camera app: 0,5× is the ultra-wide, 1× the main lens, «Tele» the
            // telephoto; a rear camera the browser doesn't identify is «Otra». Switching lens reopens the camera, so
            // while rolling only the zooms of the lens in use are offered.
            <div
              role="group"
              aria-label="Lentes y zoom"
              // Solid ink behind the 12 px numbers: readable over a white wall too (WCAG 1.4.3).
              className="flex items-center gap-1 rounded-full bg-sumi-900/90 p-1 landscape:flex-col"
            >
              {cam.chips
                .filter((c) => canTweak || c.key === cam.activeChip || !c.switches)
                .map((c) => {
                  const active = c.key === cam.activeChip;
                  const shown = active && c.zoom != null && Math.abs(view.zoom - c.zoom) > 0.05 ? formatZoom(view.zoom) : c.label;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      aria-pressed={active}
                      // The zoom really in use, when a pinch moved it off the button's own number.
                      aria-label={shown !== c.label ? `${c.ariaLabel}; ahora ${shown}` : c.ariaLabel}
                      aria-disabled={(c.switches && !canChangeCamera) || undefined}
                      onClick={() => {
                        stopBench();
                        if (!cam.pickChip(c, canChangeCamera)) explainDirectLock();
                      }}
                      className={cn(
                        'tabular grid h-11 min-w-11 place-items-center rounded-full px-1.5 font-mono text-[12px] font-bold transition-colors',
                        active ? 'bg-washi text-sumi-900' : 'text-washi',
                      )}
                    >
                      {shown}
                    </button>
                  );
                })}
            </div>
          )}

          <div className="flex items-center justify-center gap-10 landscape:flex-col-reverse landscape:gap-6">
            <div className="grid size-14 place-items-center">
              {/* F7: arm, and the take starts with a double clap from wherever the dancer stands. */}
              {phase === 'idle' && camReady && supported && (
                <RailButton
                  label="Armar"
                  ariaLabel="Armar: empezar a grabar con un doble aplauso"
                  pressed={clap != null}
                  onClick={armClap}
                >
                  <span aria-hidden className="font-display text-[19px] font-extrabold leading-none">
                    拍
                  </span>
                </RailButton>
              )}
              {phase === 'paused' && (
                <RailButton
                  // Same verb as its dialog («¿Descartar la toma?»).
                  label="Descartar"
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
              ? `${vertical ? 'Vertical' : 'Horizontal'} · ${startLabel(startChoice).line}${timer ? ` · cuenta de ${timer} s` : ''}${spaceMinutes != null && !lowSpace ? ` · espacio para ${minutesPhrase(spaceMinutes)}` : ''}`
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
              {canKeep && (
                <Button onClick={() => void keepInApp()} loading={keeping} disabled={kept}>
                  {kept ? <Check className="size-4" /> : <Library className="size-4" />}
                  {kept ? 'En «Tomas»' : 'Guardar en «Tomas»'}
                </Button>
              )}
              <Button variant={canKeep ? 'secondary' : 'primary'} onClick={() => void save()}>
                {saved ? <Check className="size-4" /> : <Download className="size-4" />}
                {IS_IOS ? 'Guardar en Fotos' : 'Descargar'}
              </Button>
              {!IS_IOS && canShareFile(take.file) && (
                <Button variant="secondary" onClick={() => void share()}>
                  <Share className="size-4" /> Compartir
                </Button>
              )}
              <Button variant="secondary" disabled={keeping} onClick={() => (saved || kept ? again() : setConfirm('again'))}>
                <RefreshCw className="size-4" /> Repetir
              </Button>
              {fromClap.current && (
                <Button variant="secondary" disabled={keeping} onClick={armAgain}>
                  <span aria-hidden className="font-display text-[15px] font-extrabold leading-none">
                    拍
                  </span>
                  Armar otra vez
                </Button>
              )}
            </div>
            <div aria-live="polite" className="w-full max-w-md empty:hidden">
              {(keepMsg ?? (notice ? { text: notice, error: false } : null)) && (
                <motion.p
                  key={keepMsg?.text ?? notice}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={soft}
                  role={keepMsg?.error ? 'alert' : 'status'}
                  className={cn(
                    'rounded-[10px] px-3 py-2 text-center text-[13px] leading-snug',
                    keepMsg?.error ? 'bg-enji-700/70 text-enji-200' : 'bg-sumi-900/90 text-washi',
                  )}
                >
                  {keepMsg?.text ?? notice}
                </motion.p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* F7 · Armed: waiting for the double clap, over the camera. */}
      <AnimatePresence>
        {clap && phase === 'idle' && (
          <ClapArm
            key="clap"
            ctx={clap.ctx}
            track={clap.track}
            sensitivity={settings.clapSensitivity}
            onSensitivity={(clapSensitivity) => settings.set({ clapSensitivity })}
            onFire={clapFired}
            onCancel={disarmClap}
            onTimeout={() => {
              disarmClap();
              setNotice('No ha llegado la señal en 3 minutos: se ha desarmado. Pulsa «Armar» para esperar otra vez.');
            }}
          />
        )}
      </AnimatePresence>

      {/* Inside the studio (above it), not a page Dialog: the studio covers every layer below it. */}
      <AnimatePresence>
        {confirm && (
          <motion.div
            className="absolute inset-0 z-30 grid grid-rows-[minmax(0,1fr)] place-items-center bg-sumi-950/80 p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirm(null)}
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="record-discard-title"
              aria-describedby="record-discard-text"
              // Big system text on a turned phone: the card scrolls instead of pushing its buttons off screen.
              className="paper-raised max-h-full w-full max-w-sm overflow-y-auto overscroll-contain rounded-[16px] p-6"
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
              <p id="record-discard-text" className="mt-2 text-sm leading-relaxed text-washi-muted">
                {confirm === 'leftover'
                  ? 'Se borra de este móvil y no se puede recuperar.'
                  : phase === 'review'
                    ? 'Aún no la has guardado en el móvil. Si la descartas, se pierde.'
                    : 'Lo grabado hasta ahora se pierde.'}
                {confirm !== 'leftover' && confirm !== 'rearm' && confirm !== 'close' && ' Después, la cámara queda lista para otra toma.'}
              </p>
              {/* Asked from «Cerrar» (or «Atrás»): the main action is what was asked, leaving; staying is the other one. */}
              {confirm === 'close' ? (
                <div className="mt-5 flex flex-col gap-2">
                  <Button variant="danger" onClick={() => confirmDiscard(true)}>
                    Descartar y salir
                  </Button>
                  <Button variant="secondary" onClick={() => confirmDiscard()}>
                    Descartar y seguir grabando
                  </Button>
                  <Button variant="ghost" autoFocus onClick={() => setConfirm(null)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <Button variant="ghost" autoFocus onClick={() => setConfirm(null)}>
                    Cancelar
                  </Button>
                  <Button variant="danger" onClick={() => confirmDiscard()}>
                    Descartar
                  </Button>
                </div>
              )}
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

function songProgress(span: Span | null, time: number): number {
  return span && Number.isFinite(span.end) && span.end > span.start
    ? clamp((time - span.start) / (span.end - span.start), 0, 1)
    : 0;
}

/**
 * P4 · The song's progress painted straight on the DOM (like the studio's FsProgress): playback never re-renders
 * the bar or the shutter. `paint` gets each new value; the render sets the value of that moment.
 */
function useSongProgressPaint(span: Span | null, paint: (progress: number) => void): void {
  const paintRef = useRef(paint);
  paintRef.current = paint;
  const start = span?.start;
  const end = span?.end;
  useLayoutEffect(() => {
    const range = start != null && end != null ? { start, end } : null;
    let last = Number.NaN;
    const run = (time: number) => {
      // P19: the clock ticks every frame; a step of 1/500 of the song is plenty for a 3 px bar and a ring, and
      // spares a paint over the camera on most frames.
      const p = Math.round(songProgress(range, time) * 500) / 500;
      if (p === last) return;
      last = p;
      paintRef.current(p);
    };
    run(usePlayer.getState().time);
    return usePlayer.subscribe((s) => run(s.time));
  }, [start, end]);
}

/** P27 · What the «Imagen» stick shows under its name. */
function imageSummary(s: ImageState): string {
  const parts: string[] = [];
  if (Math.abs(s.exposure) > 0.001) parts.push(`Luz ${formatExposure(s.exposure)}`);
  if (s.kelvin != null) parts.push(presetLabel(s.kelvin));
  if (s.locked) parts.push('Fijo');
  return parts.length ? parts.join(' · ') : 'Automática';
}

/** P19 · The take's clock on its own: a whole second changes once a second, and only this text re-renders. */
function TakeClock({ read, running }: { read: () => number; running: boolean }) {
  const readRef = useRef(read);
  readRef.current = read;
  const [shown, setShown] = useState(() => Math.max(0, Math.floor(read())));
  useEffect(() => {
    setShown(Math.max(0, Math.floor(readRef.current())));
    if (!running) return;
    const id = setInterval(() => setShown(Math.max(0, Math.floor(readRef.current()))), 250);
    return () => clearInterval(id);
  }, [running]);
  return <>{formatTime(shown)}</>;
}

function SongBar({ span }: { span: Span }) {
  const fill = useRef<HTMLDivElement>(null);
  useSongProgressPaint(span, (p) => fill.current?.style.setProperty('transform', `scaleX(${p})`));
  return (
    <div className="absolute inset-x-0 top-0 z-20 h-[3px] bg-washi/20">
      <div
        ref={fill}
        className="h-full origin-left bg-shu-400 will-change-transform"
        style={{ transform: `scaleX(${songProgress(span, usePlayer.getState().time)})` }}
      />
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
  const ring = useRef<SVGPolygonElement>(null);
  useSongProgressPaint(span, (p) => ring.current?.setAttribute('stroke-dashoffset', String(1 - p)));
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
      data-record-shutter
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
            ref={ring}
            points={HEX}
            pathLength={1}
            fill="none"
            stroke="var(--color-shu-400)"
            strokeWidth="2.6"
            strokeLinejoin="round"
            strokeDasharray="1 1"
            strokeDashoffset={1 - songProgress(span, usePlayer.getState().time)}
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
