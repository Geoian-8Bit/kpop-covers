import { formatTime, type Video } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { Mic, Music2, RefreshCw, SwitchCamera, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { cn } from '@/lib/cn';
import { scheduleCountIn, unlockAudio } from '@/lib/metronome';
import { jelly } from '@/lib/motion';
import { useBackToClose } from '@/lib/useBackToClose';
import { hasRange, usePlayer } from '@/player/store';

type Phase = 'starting' | 'ready' | 'countdown' | 'recording' | 'review' | 'error';
type From = 'song' | 'range';
type Facing = 'user' | 'environment';
type Take = { url: string; blob: Blob };

const COUNTDOWNS = [3, 5, 10] as const;
const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

/** Prefer MP4 (plays everywhere and saves to the camera roll); older Android Chrome falls back to WebM. */
function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

function fileName(video: Video, type: string) {
  const slug = video.title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .toLowerCase();
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`;
  return `one-shoot-${slug || 'ensayo'}-${stamp}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
}

function cameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Necesito permiso para usar la cámara (y el micrófono en vídeos de YouTube). Actívalo en los ajustes del navegador y vuelve a intentarlo.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No encuentro ninguna cámara en este dispositivo.';
  if (name === 'NotReadableError') return 'La cámara la está usando otra app. Ciérrala y vuelve a intentarlo.';
  return 'No se pudo abrir la cámara.';
}

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
};

/**
 * TikTok-style recording: camera preview, a count-in with metronome ticks, then the song starts from
 * the beginning (or the A–B section) and the camera records at the same moment, so nobody has to trim
 * dead seconds before the music. Files keep the song's original audio; YouTube can only be heard
 * through the microphone. The take saves to the phone through the system share sheet.
 */
export function RecordStudio({ open, onClose, video }: { open: boolean; onClose: () => void; video: Video }) {
  const [phase, setPhase] = useState<Phase>('starting');
  const [error, setError] = useState('');
  const [facing, setFacing] = useState<Facing>('user');
  const [from, setFrom] = useState<From>('song');
  const [countdown, setCountdown] = useState<(typeof COUNTDOWNS)[number]>(3);
  const [left, setLeft] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [songAudio, setSongAudio] = useState(false);
  const hasSection = usePlayer((s) => hasRange(s.loop));

  const preview = useRef<HTMLVideoElement>(null);
  const camera = useRef<MediaStream | null>(null);
  const songTrack = useRef<MediaStreamTrack | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cancelTicks = useRef<() => void>(() => undefined);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  const restore = useRef<{ loopEnabled: boolean; loopAll: boolean } | null>(null);
  const startedAt = useRef(0);
  const takeUrl = useRef<string | null>(null);
  /** Bumped on every camera request and on close: a late getUserMedia answer is stopped, not kept. */
  const session = useRef(0);
  /** Synchronous locks: double taps must not start two takes or open two share sheets. */
  const starting = useRef(false);
  const sharing = useRef(false);
  const recording = phase === 'recording';

  // Back / swipe-back closes the studio, except mid-take (it would throw the take away).
  useBackToClose(open, onClose, recording);

  // Leaving the page mid-take loses it: ask first.
  useEffect(() => {
    if (!recording) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [recording]);

  const replaceTake = (next: Take | null) => {
    if (takeUrl.current) URL.revokeObjectURL(takeUrl.current);
    takeUrl.current = next?.url ?? null;
    setTake(next);
  };

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    cancelTicks.current();
  };

  const releaseWakeLock = () => {
    void wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;
  };

  /** Put the player back the way the dancer had it (loop settings) and pause it. */
  const restorePlayer = useCallback(() => {
    const saved = restore.current;
    restore.current = null;
    usePlayer.getState().pause();
    if (saved) usePlayer.setState((s) => ({ loop: { ...s.loop, enabled: saved.loopEnabled }, loopAll: saved.loopAll }));
  }, []);

  const startCamera = useCallback(async (which: Facing) => {
    const id = ++session.current;
    camera.current?.getTracks().forEach((t) => t.stop());
    camera.current = null;
    setPhase('starting');
    try {
      // The song's own audio when the source allows it; otherwise the microphone hears the speaker.
      const tap = usePlayer.getState().engine?.captureAudio?.() ?? null;
      songTrack.current = tap;
      setSongAudio(Boolean(tap));
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: which }, width: { ideal: 1080 }, height: { ideal: 1920 }, frameRate: { ideal: 30 } },
        // Music through the speaker must not be "cancelled" as if it were an echo.
        audio: tap ? false : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (id !== session.current) {
        // Closed, or another camera asked for, while the permission prompt was up.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      camera.current = stream;
      if (preview.current) preview.current.srcObject = stream;
      setPhase('ready');
    } catch (err) {
      if (id !== session.current) return;
      setError(cameraError(err));
      setPhase('error');
    }
  }, []);

  // Open: ask for the camera. Close: release everything.
  useEffect(() => {
    if (!open) return;
    unlockAudio();
    replaceTake(null);
    setError('');
    void startCamera(facing);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      session.current++;
      starting.current = false;
      sharing.current = false;
      setPhase('starting');
      document.body.style.overflow = overflow;
      clearTimers();
      if (recorder.current?.state === 'recording') recorder.current.stop();
      recorder.current = null;
      camera.current?.getTracks().forEach((t) => t.stop());
      camera.current = null;
      releaseWakeLock();
      restorePlayer();
      replaceTake(null);
    };
    // Switching camera goes through switchCamera, not a full reopen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stop = useCallback(() => {
    clearTimers();
    if (recorder.current?.state === 'recording') recorder.current.stop();
    restorePlayer();
    releaseWakeLock();
  }, [restorePlayer]);

  function beginRecording() {
    const stream = camera.current;
    if (!stream) return;
    const audio = songTrack.current ?? stream.getAudioTracks()[0] ?? null;
    const tracks = [...stream.getVideoTracks(), ...(audio ? [audio] : [])];
    const mimeType = pickMimeType();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(new MediaStream(tracks), mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : undefined);
    } catch {
      setError('Este navegador no puede grabar vídeo.');
      setPhase('error');
      restorePlayer();
      return;
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'video/webm' });
      replaceTake({ url: URL.createObjectURL(blob), blob });
      setPhase('review');
    };
    recorder.current = rec;
    rec.start(1000);
    usePlayer.getState().play();
    startedAt.current = performance.now();
    setElapsed(0);
    setPhase('recording');
  }

  async function startCountdown() {
    if (phase !== 'ready' || starting.current) return;
    starting.current = true;
    const id = session.current;
    unlockAudio();
    const p = usePlayer.getState();
    // Record the song cleanly: no A–B wrap or whole-song repeat while the camera rolls.
    restore.current = { loopEnabled: p.loop.enabled, loopAll: p.loopAll };
    usePlayer.setState((s) => ({ loop: { ...s.loop, enabled: false }, loopAll: false }));
    p.pause();
    p.seek(from === 'range' && hasRange(p.loop) ? p.loop.start : 0);
    try {
      wakeLock.current = (await (navigator as WakeLockNavigator).wakeLock?.request('screen')) ?? null;
    } catch {
      /* the screen may dim on long takes; recording still works */
    }
    starting.current = false;
    if (id !== session.current) {
      // Closed while asking for the wake lock.
      releaseWakeLock();
      return;
    }
    setPhase('countdown');
    setLeft(countdown);
    cancelTicks.current = scheduleCountIn(countdown);
    for (let i = 1; i <= countdown; i++) {
      timers.current.push(setTimeout(() => setLeft(countdown - i), i * 1000));
    }
    timers.current.push(setTimeout(beginRecording, countdown * 1000));
  }

  // While recording: tick the clock and stop on its own at the end of the song or section.
  useEffect(() => {
    if (phase !== 'recording') return;
    const clock = setInterval(() => setElapsed((performance.now() - startedAt.current) / 1000), 250);
    const unsubscribe = usePlayer.subscribe((s) => {
      const sinceStart = performance.now() - startedAt.current;
      if (from === 'range' && hasRange(s.loop) && s.time >= s.loop.end - 0.03) stop();
      else if (s.duration > 0 && s.time >= s.duration - 0.15) stop();
      else if (!s.playing && sinceStart > 2500) stop();
    });
    return () => {
      clearInterval(clock);
      unsubscribe();
    };
  }, [phase, from, stop]);

  async function save() {
    if (!take || sharing.current) return;
    sharing.current = true;
    try {
      await shareTake(take);
    } finally {
      sharing.current = false;
    }
  }

  async function shareTake(take: Take) {
    const name = fileName(video, take.blob.type);
    const file = new File([take.blob], name, { type: take.blob.type });
    // Phones: the share sheet offers "Guardar vídeo" straight into the gallery.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: video.title });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = take.url;
    a.download = name;
    a.click();
  }

  function again() {
    replaceTake(null);
    if (preview.current && camera.current) preview.current.srcObject = camera.current;
    setPhase('ready');
  }

  function switchCamera() {
    const next = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    void startCamera(next);
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black text-washi" role="dialog" aria-modal="true" aria-label="Grabar baile">
      {/* Camera preview, mirrored like a mirror for the front camera (the file itself is not mirrored). */}
      <video
        ref={preview}
        autoPlay
        muted
        playsInline
        className={cn(
          'absolute inset-0 size-full object-cover',
          facing === 'user' && '-scale-x-100',
          phase === 'review' && 'invisible',
        )}
      />
      {phase === 'review' && take && (
        <video src={take.url} controls autoPlay playsInline loop className="absolute inset-0 size-full bg-black object-contain" />
      )}

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-[max(14px,env(safe-area-inset-top))]">
        <button
          type="button"
          aria-label="Cerrar"
          disabled={recording}
          onClick={onClose}
          className="grid size-11 place-items-center rounded-full bg-black/40 disabled:opacity-30"
        >
          <X className="size-6" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          {recording ? (
            <span className="tabular inline-flex items-center gap-2 rounded-full bg-shu-500 px-3 py-1 font-mono text-sm font-bold">
              <span className="size-2 animate-pulse rounded-full bg-washi" /> {formatTime(elapsed)}
            </span>
          ) : (
            <p className="truncate font-display text-[17px] font-bold">{video.title}</p>
          )}
        </div>
        <button
          type="button"
          aria-label="Cambiar de cámara"
          disabled={phase !== 'ready'}
          onClick={switchCamera}
          className="grid size-11 place-items-center rounded-full bg-black/40 disabled:opacity-30"
        >
          <SwitchCamera className="size-6" />
        </button>
      </div>

      {(phase === 'ready' || phase === 'starting') && (
        <p className="absolute inset-x-0 top-[calc(max(14px,env(safe-area-inset-top))+56px)] mx-auto flex w-max max-w-[90vw] items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-[12px] text-washi/90">
          {songAudio ? <Music2 className="size-3.5 text-kin-300" /> : <Mic className="size-3.5 text-kin-300" />}
          {songAudio
            ? 'Se graba con el audio original de la canción'
            : 'YouTube no deja grabar su audio: se graba con el micrófono, sube el volumen'}
        </p>
      )}

      {/* Count-in */}
      <AnimatePresence>
        {phase === 'countdown' && left > 0 && (
          <motion.span
            key={left}
            initial={{ scale: 1.6, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: -4 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={jelly}
            className="absolute left-1/2 top-1/2 grid size-36 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[18px] bg-shu-500 font-display text-8xl font-extrabold shadow-[0_20px_40px_-20px_rgb(0_0_0/0.9)]"
          >
            {left}
          </motion.span>
        )}
      </AnimatePresence>

      {phase === 'error' && (
        <div className="absolute inset-0 grid place-items-center p-8 text-center">
          <div className="max-w-sm">
            <p className="text-[15px] leading-relaxed">{error}</p>
            <Button className="mt-5" variant="secondary" onClick={() => void startCamera(facing)}>
              <RefreshCw className="size-4" /> Reintentar
            </Button>
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 bg-gradient-to-t from-black/80 to-transparent px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-10">
        {phase === 'ready' && (
          <>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {hasSection && (
                <Segmented
                  label="Desde dónde grabar"
                  layoutId="record-from"
                  size="sm"
                  value={from}
                  onChange={setFrom}
                  options={[
                    { value: 'song', label: 'Desde el principio' },
                    { value: 'range', label: 'Tramo A–B' },
                  ]}
                />
              )}
              <Segmented
                label="Cuenta atrás"
                layoutId="record-countdown"
                size="sm"
                value={countdown}
                onChange={setCountdown}
                options={COUNTDOWNS.map((s) => ({ value: s, label: `${s} s` }))}
              />
            </div>
            <motion.button
              type="button"
              aria-label="Empezar a grabar"
              onClick={() => void startCountdown()}
              whileTap={{ scale: 0.9 }}
              transition={jelly}
              className="relative size-20"
            >
              <svg viewBox="0 0 48 48" className="size-full overflow-visible" aria-hidden>
                <polygon points="24,2 43,13 43,35 24,46 5,35 5,13" fill="none" stroke="var(--color-kin-400)" strokeWidth="1.6" />
                <circle cx="24" cy="24" r="14" fill="var(--color-shu-500)" />
              </svg>
            </motion.button>
          </>
        )}
        {recording && (
          <motion.button
            type="button"
            aria-label="Parar la grabación"
            onClick={stop}
            whileTap={{ scale: 0.9 }}
            transition={jelly}
            className="relative size-20"
          >
            <svg viewBox="0 0 48 48" className="size-full overflow-visible" aria-hidden>
              <polygon points="24,2 43,13 43,35 24,46 5,35 5,13" fill="none" stroke="var(--color-kin-400)" strokeWidth="1.6" />
              <rect x="16" y="16" width="16" height="16" rx="2.5" fill="var(--color-shu-500)" />
            </svg>
          </motion.button>
        )}
        {phase === 'review' && (
          <div className="flex w-full max-w-sm flex-wrap items-center justify-center gap-2">
            <Button onClick={() => void save()}>Guardar en el móvil</Button>
            <Button variant="secondary" onClick={again}>
              Repetir
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
