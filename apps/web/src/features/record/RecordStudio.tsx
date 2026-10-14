import { clamp, formatTime, type Video } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import {
  Aperture,
  Check,
  Download,
  Locate,
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
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { scheduleCountIn, unlockAudio } from '@/lib/metronome';
import { jelly, soft } from '@/lib/motion';
import { useBackToClose } from '@/lib/useBackToClose';
import { hasRange, usePlayer } from '@/player/store';
import { openMic } from './camera';
import { canRecordCanvas } from './compositor';
import {
  IS_IOS,
  canRecord,
  canShareFile,
  createTakeRecorder,
  downloadFile,
  shareFile,
  takeFileName,
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
  const [phase, setPhase] = useState<Phase>('idle');
  const [timer, setTimer] = useState<TimerSeconds>(readTimer);
  const [from, setFrom] = useState<From>('start');
  const [left, setLeft] = useState(0);
  const [span, setSpan] = useState<Span | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState<'close' | 'again' | 'discard' | null>(null);
  const [sound, setSound] = useState<SoundSource>('pending');
  const [notice, setNotice] = useState('');
  const [hereAt, setHereAt] = useState(0);
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

  const replaceTake = (next: Take | null) => {
    if (takeUrl.current) URL.revokeObjectURL(takeUrl.current);
    takeUrl.current = next?.url ?? null;
    setTake(next);
    setSaved(false);
  };

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
  };

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

    // The song's own sound when the source allows it; otherwise the microphone hears the speaker.
    const tap = p.engine?.captureAudio?.() ?? null;
    songTrack.current = tap;
    if (tap) setSound('song');
    else {
      setSound('pending');
      void openMic().then((track) => {
        if (id !== session.current) {
          track?.stop();
          return;
        }
        micTrack.current = track;
        setSound(track ? 'mic' : 'none');
      });
    }

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
      setPhase('idle');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reviewing: nothing redraws the hidden camera frame, and the song stays quiet under the take's own sound.
  useEffect(() => {
    cam.compositor.current?.freeze(phase === 'review');
    if (!open || phase !== 'review') return;
    usePlayer.getState().pause();
    return usePlayer.subscribe((s) => {
      if (s.playing) s.pause();
    });
  }, [open, phase, cam.compositor]);

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
      setSeconds(recorder.current.seconds());
      setPhase('paused');
    } else {
      setPhase('idle');
    }
  }, []);

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
    usePlayer.getState().pause();
    setSeconds(rec.seconds());
    setPhase('finishing');
    const blob = await rec.finish();
    releasePicture();
    if (id !== session.current) return;
    if (!blob.size) {
      setNotice('No se ha grabado nada. Prueba otra vez.');
      setPhase('idle');
      return;
    }
    const file = new File([blob], takeFileName(video, blob.type), { type: blob.type });
    replaceTake({ url: URL.createObjectURL(file), file });
    setPhase('review');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video]);

  /** The song is really playing: the camera starts (or goes on) right now. */
  const roll = () => {
    if (!recorder.current) {
      const compositor = cam.compositor.current;
      if (!compositor) return pausePart();
      try {
        compositor.lock(true);
        const picture = compositor.stream(30);
        canvasStream.current = picture;
        // The song's sound if it's still there, else the microphone; say so when there's neither.
        const audio = [songTrack.current, micTrack.current].find((t) => t?.readyState === 'live') ?? null;
        if (!audio && sound !== 'none') setNotice('No llega el sonido: esta toma se graba sin audio.');
        const tracks = [...picture.getVideoTracks(), ...(audio ? [audio] : [])];
        const rec = createTakeRecorder(tracks, compositor.canvas.width * compositor.canvas.height, () => {
          // The browser stopped recording by itself: keep what exists rather than filming nothing.
          if (recorder.current !== rec) return;
          setNotice('La grabación se ha cortado. Te dejo lo grabado hasta ahí.');
          void finish();
        });
        recorder.current = rec;
        rec.start();
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

  /** The camera has drawn at least one frame (the canvas starts at 2×2). */
  function frameReady() {
    return (cam.compositor.current?.canvas.width ?? 0) > 2;
  }

  function shutter() {
    const now = phaseRef.current;
    if (now === 'idle') {
      if (view.status !== 'ready' || !frameReady()) return;
      setNotice('');
      const s = songSpan();
      spanRef.current = s;
      setSpan(s);
      setSeconds(0);
      const p = usePlayer.getState();
      p.pause();
      p.seek(s.start);
      countIn('idle');
    } else if (now === 'countdown') {
      clearTimers();
      setPhase(countFrom.current);
    } else if (now === 'arming' || now === 'recording') {
      pausePart();
    } else if (now === 'paused') {
      if (view.status !== 'ready') return;
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
      setSeconds(recorder.current?.seconds() ?? 0);
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
  }, [phase, finish, pausePart]);

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

  function discardTake() {
    recorder.current?.cancel();
    recorder.current = null;
    releasePicture();
    usePlayer.getState().pause();
    again();
  }

  function confirmDiscard() {
    const action = confirm;
    setConfirm(null);
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
        if (result === 'shared') setSaved(true);
        else if (result === 'failed') {
          downloadFile(take.file);
          setSaved(true);
        }
      } else {
        downloadFile(take.file);
        setSaved(true);
      }
    } finally {
      sharing.current = false;
    }
  }

  async function share() {
    if (!take || sharing.current) return;
    sharing.current = true;
    try {
      if ((await shareFile(take.file, video.title)) === 'shared') setSaved(true);
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

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] select-none overflow-hidden bg-black text-washi"
      role="dialog"
      aria-modal="true"
      aria-label="Grabar baile"
    >
      {/* The raw camera: only the source of the frame below (kept in the page so it keeps decoding). */}
      <video
        ref={cam.source}
        autoPlay
        muted
        playsInline
        className="pointer-events-none absolute inset-0 size-full opacity-0"
      />
      {/* The recorded frame itself, mirrored on screen only for the front camera. Pinch zooms. */}
      <div
        ref={cam.host}
        {...cam.pinchHandlers}
        onPointerCancel={cam.pinchHandlers.onPointerUp}
        className={cn(
          'absolute inset-0 touch-none',
          view.facing === 'user' && '-scale-x-100',
          !showCamera && 'invisible',
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
        <span aria-hidden className="size-11 shrink-0" />
      </div>

      {/* Tools rail, like TikTok's: right side upright, left side when the phone is turned. */}
      {showCamera && camReady && (canTweak || phase === 'recording') && (
        <div className="absolute right-[max(10px,env(safe-area-inset-right))] top-[calc(max(14px,env(safe-area-inset-top))+64px)] z-10 flex flex-col gap-3 landscape:left-[max(10px,env(safe-area-inset-left))] landscape:right-auto">
          {canTweak && (
            <RailButton label="Girar" ariaLabel="Girar la cámara" onClick={cam.flip}>
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
              onClick={cam.nextLens}
            >
              <Aperture className="size-5" />
            </RailButton>
          )}
        </div>
      )}

      {/* What the take will sound like. */}
      {phase === 'idle' && camReady && sound !== 'pending' && (
        <p className="absolute inset-x-0 top-[calc(max(14px,env(safe-area-inset-top))+60px)] mx-auto flex w-max max-w-[calc(100vw-150px)] items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-[12px] leading-snug text-washi/90">
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
                ? 'YouTube no deja grabar su audio: se oye por el micro, sube el volumen'
                : 'Sin permiso para el micro: se grabará sin sonido'}
            {rate !== 1 && ` · velocidad ${String(rate).replace('.', ',')}×`}
          </span>
        </p>
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
                      onClick={() => cam.pickZoom(z, canTweak)}
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
              ? `${vertical ? 'Vertical' : 'Horizontal'} · empieza en ${formatTime(startsAt)}${timer ? ` · cuenta de ${timer} s` : ''}`
              : phase === 'paused'
                ? 'En pausa · toca para seguir o ✓ para terminar'
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
              {formatTime(seconds)} · {(take.file.size / 1_048_576).toFixed(1).replace('.', ',')} MB
              {saved ? ' · guardado' : ''}
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
                ¿Descartar la toma?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-washi-muted">
                {phase === 'review'
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
  tone = 'dark',
  onClick,
  children,
}: {
  label: string;
  ariaLabel?: string;
  pressed?: boolean;
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
      onClick={onClick}
      whileTap={{ scale: 0.86 }}
      transition={jelly}
      className="flex w-14 flex-col items-center gap-1"
    >
      <span
        className={cn(
          'grid size-11 place-items-center rounded-full',
          tone === 'light'
            ? 'bg-washi text-sumi-900 shadow-[0_8px_18px_-8px_rgb(0_0_0/0.9)]'
            : pressed
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
