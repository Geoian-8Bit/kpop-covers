import type { Video } from '@coverscape/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { unlockAudio } from '@/lib/metronome';
import { hasRange, usePlayer } from '@/player/store';
import type { Bench, BenchResult } from '../pace';
import type { FrameMeter, FrameWatch } from '../compositor';
import type { SkipWindows } from '../paceSkip';
import type { SyncedAudio } from '../syncAudio';
import type { TakeStats } from '../InfoPanel';
import { IMAGE_DEFAULT, type ImageState } from '../imageState';
import type { Box as QuickBarBox } from '../quickExposureRules';
import {
  freeSpace,
  listLeftovers,
  type Leftover,
  type TakeSink,
  type TakeSyncMeta,
  type TakeTimingMeta,
} from '../takeStore';
import { canRecord, type RecordFormat, type TakeRecorder } from '../recorder';
import { canRecordCanvas } from '../compositor';
import { useRecordSettings } from '../settings';
import { useCamera } from '../useCamera';
import { restSyncAudio } from '../syncAudio';
import {
  readTimer,
  type Confirm,
  type From,
  type Phase,
  type SoundSource,
  type Span,
  type StudioFx,
  type Take,
  type TimerSeconds,
  type WakeLockNavigator,
  type WakeLockSentinelLike,
} from './types';

/**
 * REQ-27 · The recorder's state and refs, in one place (moved as they were from RecordStudio), and the opening: the
 * song set up for recording (no loops), the leftovers looked up, the screen kept awake. Every other studio hook reads
 * and writes through what this returns.
 */
export function useStudioSession(open: boolean, video: Video) {
  /** REQ-27 · Functions one studio hook calls in another, registered by each hook on every render (see StudioFx). */
  const fx = useRef({} as StudioFx).current;
  /** The camera went away mid-take (another app, a call): set once pausePart exists, in useTakeMachine. */
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
  const [confirm, setConfirm] = useState<Confirm | null>(null);
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
  const reviewTake = useRef<{
    id: string;
    saved: boolean;
    noSpace: boolean;
    kept: boolean;
    videoId: string;
  } | null>(null);
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
  const countWatch = useRef<{ watch: FrameWatch; at: number; track: MediaStreamTrack | undefined } | null>(
    null,
  );
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
  /**
   * Q5 · A direct take records the camera's own frames: turning the phone mid-take would change their size
   * under the recorder (useOrientationLock).
   */
  const orientation = useRef<{ pending: boolean; locked: boolean; tried: boolean; ready: Promise<unknown> }>({
    pending: false,
    locked: false,
    tried: false,
    ready: Promise.resolve(),
  });
  // ───────────── C1–C4 · image controls (state; useImageControls) ─────────────
  const [imageOpen, setImageOpen] = useState(false);
  const [image, setImage] = useState<ImageState>(IMAGE_DEFAULT);
  const [focusMark, setFocusMark] = useState<{ x: number; y: number; key: number } | null>(null);
  /** P49 · Where the quick light bar is (after a tap to focus); null when hidden. */
  const [quickLight, setQuickLight] = useState<QuickBarBox | null>(null);
  // ───────────── A1 · recorder settings ─────────────
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** P26 · The settings opened from the chip show only «Calidad». */
  const [settingsOnly, setSettingsOnly] = useState<'quality' | null>(null);

  const unsaved = phase === 'paused' || (phase === 'review' && take != null && !saved && !kept);
  const rolling =
    phase === 'countdown' || phase === 'arming' || phase === 'recording' || phase === 'finishing';
  const supported = canRecord() && canRecordCanvas();

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
    fx.replaceTake(null);
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
      fx.clearTimers();
      fx.disarmClap();
      recorder.current?.cancel();
      recorder.current = null;
      fx.dropUnusedSink();
      fx.releasePicture();
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
      fx.replaceTake(null);
      setConfirm(null);
      setInfoOpen(false);
      setImageOpen(false);
      setLastStats(null);
      setPhase('idle');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- REQ-30 · kept: the studio's open/close lifecycle; its cleanup must run on closing only
  }, [open]);

  return {
    fx,
    cameraLost,
    cameraBusy,
    cam,
    view,
    viewNow,
    settings,
    phase,
    setPhase,
    phaseRef,
    timer,
    setTimer,
    from,
    setFrom,
    left,
    setLeft,
    span,
    setSpan,
    secondsExact,
    seconds,
    setSeconds,
    take,
    setTake,
    saved,
    setSaved,
    kept,
    setKept,
    confirm,
    setConfirm,
    sound,
    setSound,
    notice,
    setNotice,
    keepMsg,
    setKeepMsg,
    keeping,
    setKeeping,
    keepingRef,
    hereAt,
    infoOpen,
    setInfoOpen,
    startListOpen,
    setStartListOpen,
    heatWarned,
    lastStats,
    setLastStats,
    takeFormat,
    sink,
    sinkReady,
    takeTiming,
    reviewTiming,
    reviewTake,
    takeKind,
    setTakeKind,
    lockedAspect,
    setLockedAspect,
    benchPath,
    setBenchPath,
    bench,
    benchStats,
    setBenchStats,
    benchTried,
    benchNonce,
    setBenchNonce,
    takePace,
    countRest,
    countWatch,
    drawnAtShutter,
    direct,
    stopPresented,
    meter,
    leftover,
    setLeftover,
    leftoverCount,
    setLeftoverCount,
    free,
    setFree,
    loopRange,
    rate,
    session,
    recorder,
    canvasStream,
    songTrack,
    micTrack,
    unwatchSound,
    syncedSound,
    takeSync,
    soundLost,
    timers,
    cancelTicks,
    armFrame,
    countFrom,
    spanRef,
    takeUrl,
    sharing,
    clap,
    setClap,
    clapRes,
    clapFiring,
    fromClap,
    orientation,
    imageOpen,
    setImageOpen,
    image,
    setImage,
    focusMark,
    setFocusMark,
    quickLight,
    setQuickLight,
    settingsOpen,
    setSettingsOpen,
    settingsOnly,
    setSettingsOnly,
    unsaved,
    rolling,
    supported,
  };
}

export type Studio = ReturnType<typeof useStudioSession>;
