import { formatTime, type Video } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { Aperture, Mic, MicOff, Music2, RefreshCw, SwitchCamera, X, Zap, ZapOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { createCameraFrame, type CameraFrame } from '@/lib/cameraFrame';
import { cn } from '@/lib/cn';
import { scheduleCountIn, unlockAudio } from '@/lib/metronome';
import { jelly, soft } from '@/lib/motion';
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

/** Camera abilities the standard TS types don't list yet (Chrome/Android expose them, Safari mostly not). */
type CameraCaps = MediaTrackCapabilities & { zoom?: { min: number; max: number; step?: number }; torch?: boolean };
/** Digital zoom range when the camera itself offers none (the recorded frame is cropped instead). */
const DIGITAL_ZOOM = { min: 1, max: 4 };

/**
 * The phone's back cameras, and which of them is the ultra-wide (0.5×) when its name says so (iPhone
 * and many Androids name it; others only number their lenses, so we offer to step through them).
 */
async function listBackCameras(): Promise<{ ids: string[]; ultra: string | null }> {
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    const back = devices.filter((d) => !/front|frontal|delantera|user|selfie/i.test(d.label));
    const ultra = back.find((d) => /ultra|0[.,]5|gran ?angular|grand ?angle|weitwinkel/i.test(d.label));
    return { ids: back.map((d) => d.deviceId).filter(Boolean), ultra: ultra?.deviceId ?? null };
  } catch {
    return { ids: [], ultra: null };
  }
}

const formatZoom = (z: number) => `${Number.isInteger(z) ? z : z.toFixed(1).replace(/\.0$/, '')}×`;

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
  /** No song audio and the microphone refused: the take records without sound rather than not at all. */
  const [silent, setSilent] = useState(false);
  /** The take under review went out through the share sheet or a download. */
  const [saved, setSaved] = useState(false);
  /** Asking before an unsaved take is thrown away, and what happens if the dancer says yes. */
  const [confirm, setConfirm] = useState<'close' | 'again' | null>(null);
  /** Camera controls, driven by what this phone's camera actually offers. */
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [backCams, setBackCams] = useState<string[]>([]);
  const [ultraId, setUltraId] = useState<string | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<CameraFrame | null>(null);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [torchCap, setTorchCap] = useState(false);
  const [torch, setTorch] = useState(false);
  const review = useRef<HTMLVideoElement>(null);
  const pinch = useRef({
    pointers: new Map<number, { x: number; y: number }>(),
    startDist: 1,
    startZoom: 1,
    frame: 0,
    next: 1,
  });
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
  /** Set by the first stop of a take: pausing the song re-notifies the watcher, which must not stop again. */
  const stopped = useRef(false);
  const recording = phase === 'recording';
  const unsaved = phase === 'review' && take != null && !saved;

  // Back / swipe-back closes the studio, except mid-take or with an unsaved take (it would throw it away).
  useBackToClose(open, onClose, recording || unsaved);

  // Back with an unsaved take: the history entry stays (busy above) and we ask first; back again cancels.
  useEffect(() => {
    if (!open || !unsaved) return;
    const onPop = () => setConfirm((c) => (c ? null : 'close'));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open, unsaved]);

  // Leaving the page mid-take, or before saving it, loses it: ask first.
  useEffect(() => {
    if (!recording && !unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [recording, unsaved]);

  const replaceTake = (next: Take | null) => {
    if (takeUrl.current) URL.revokeObjectURL(takeUrl.current);
    takeUrl.current = next?.url ?? null;
    setTake(next);
    setSaved(false);
    setConfirm(null);
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

  const startCamera = useCallback(async (which: Facing, device: string | null = null) => {
    // Never under a running take: restarting the camera (and its microphone) would cut it off.
    if (recorder.current) return;
    const id = ++session.current;
    camera.current?.getTracks().forEach((t) => t.stop());
    camera.current = null;
    setPhase('starting');
    try {
      // The song's own audio when the source allows it; otherwise the microphone hears the speaker.
      const tap = usePlayer.getState().engine?.captureAudio?.() ?? null;
      songTrack.current = tap;
      setSongAudio(Boolean(tap));
      // Always ask in landscape numbers: phones then pick a real camera mode and turn the picture to how
      // the phone is held. Asking 1080×1920 makes Safari (and some Chrome) hand back the sensor unrotated.
      const size = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
      const video = device ? { deviceId: { exact: device }, ...size } : { facingMode: { ideal: which }, ...size };
      // Music through the speaker must not be "cancelled" as if it were an echo.
      const audio = tap ? false : { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
      let stream: MediaStream;
      let mic = Boolean(audio);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio });
      } catch (err) {
        // Microphone refused (or missing): still record the picture, silently, rather than nothing.
        const name = err instanceof DOMException ? err.name : '';
        if (!audio || id !== session.current || (name !== 'NotAllowedError' && name !== 'NotFoundError')) throw err;
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        mic = false;
      }
      if (id !== session.current) {
        // Closed, or another camera asked for, while the permission prompt was up.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setSilent(!tap && !mic);
      camera.current = stream;
      if (preview.current) preview.current.srcObject = stream;
      // What this camera can do: zoom range (some phones reach 0.5× here) and the flash as a torch.
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as CameraCaps;
      const settings = (track?.getSettings?.() ?? {}) as MediaTrackSettings & { zoom?: number };
      setZoomRange(caps.zoom && caps.zoom.max > caps.zoom.min ? { min: caps.zoom.min, max: caps.zoom.max } : null);
      setZoom(settings.zoom ?? 1);
      setTorchCap(Boolean(caps.torch));
      setTorch(false);
      setDeviceId(device ?? (track?.getSettings?.().deviceId || null));
      frame.current?.setZoom(1);
      // Device labels are only readable once the camera is allowed.
      if (which === 'environment') {
        void listBackCameras().then(({ ids, ultra }) => {
          if (id !== session.current) return;
          setBackCams(ids);
          setUltraId(ultra);
        });
      }
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

  // The recorded frame: a canvas fed by the (hidden) camera video, shown as the preview.
  useEffect(() => {
    const source = preview.current;
    const host = stage.current;
    if (!open || !source || !host) return;
    const f = createCameraFrame(source);
    f.canvas.className = 'absolute inset-0 size-full object-contain';
    host.appendChild(f.canvas);
    frame.current = f;
    return () => {
      f.dispose();
      f.canvas.remove();
      frame.current = null;
    };
  }, [open]);

  // Reviewing a take: the camera keeps running for a retake, but nothing redraws the hidden frame.
  useEffect(() => {
    frame.current?.pause(phase === 'review');
  }, [phase]);

  const stop = useCallback(() => {
    // Once per take: the pause below re-notifies the watcher, which would otherwise call stop forever.
    if (stopped.current) return;
    stopped.current = true;
    clearTimers();
    if (recorder.current?.state === 'recording') recorder.current.stop();
    // The song stops here; the dancer's loop settings come back only when the studio closes, so nothing
    // (like the whole-song repeat) can start the music again behind the review.
    usePlayer.getState().pause();
    releaseWakeLock();
  }, []);

  // Reviewing a take: its own sound plays, the song stays quiet (only while the studio is open).
  useEffect(() => {
    if (!open || phase !== 'review') return;
    usePlayer.getState().pause();
    const unsubscribe = usePlayer.subscribe((s) => {
      if (s.playing) s.pause();
    });
    void review.current?.play().catch(() => undefined);
    return unsubscribe;
  }, [open, phase, take]);

  function beginRecording() {
    const stream = camera.current;
    if (!stream) return;
    const id = session.current;
    const audio = songTrack.current ?? stream.getAudioTracks()[0] ?? null;
    let picture = stream.getVideoTracks();
    try {
      frame.current?.lock(true);
      if (frame.current) picture = frame.current.captureStream(30).getVideoTracks();
    } catch {
      /* no canvas capture: record the camera as it comes */
    }
    const tracks = [...picture, ...(audio ? [audio] : [])];
    /** The canvas capture ends with the take; the camera's own track stays for the next one. */
    const dropPicture = () =>
      picture.forEach((t) => {
        if (t !== stream.getVideoTracks()[0]) t.stop();
      });
    const mimeType = pickMimeType();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(new MediaStream(tracks), mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : undefined);
    } catch {
      frame.current?.lock(false);
      dropPicture();
      releaseWakeLock();
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
      dropPicture();
      // A take that ends after the studio closed (or from an older session) is dropped, not reviewed.
      if (id !== session.current || recorder.current !== rec) return;
      recorder.current = null;
      frame.current?.lock(false);
      const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'video/webm' });
      replaceTake({ url: URL.createObjectURL(blob), blob });
      setPhase('review');
    };
    recorder.current = rec;
    stopped.current = false;
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
    // A retake keeps the settings saved before the first take.
    restore.current ??= { loopEnabled: p.loop.enabled, loopAll: p.loopAll };
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
      if (await shareTake(take)) setSaved(true);
    } finally {
      sharing.current = false;
    }
  }

  /** False when the dancer backed out of the share sheet: the take is still only here. */
  async function shareTake(take: Take): Promise<boolean> {
    const name = fileName(video, take.blob.type);
    const file = new File([take.blob], name, { type: take.blob.type });
    // Phones: the share sheet offers "Guardar vídeo" straight into the gallery.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: video.title });
        return true;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return false;
      }
    }
    const a = document.createElement('a');
    a.href = take.url;
    a.download = name;
    a.click();
    return true;
  }

  function again() {
    replaceTake(null);
    if (preview.current && camera.current) preview.current.srcObject = camera.current;
    setPhase('ready');
  }

  /** The X and "Repetir": an unsaved take is only thrown away once the dancer says so. */
  function requestClose() {
    if (unsaved) setConfirm('close');
    else onClose();
  }

  function requestAgain() {
    if (unsaved) setConfirm('again');
    else again();
  }

  function discard() {
    const action = confirm;
    setConfirm(null);
    if (action === 'close') onClose();
    else if (action === 'again') again();
  }

  function switchCamera() {
    const next = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    void startCamera(next);
  }

  const videoTrack = () => camera.current?.getVideoTracks()[0];
  /** Hardware zoom when the camera has it, otherwise a digital zoom on the recorded frame. */
  const range = zoomRange ?? DIGITAL_ZOOM;
  const onUltra = facing === 'environment' && ultraId != null && deviceId === ultraId;
  /** Chips that change lens (restart the camera) instead of zooming: off limits mid-take. */
  const switchesLens = (target: number) => onUltra || (target < 1 && !(zoomRange && zoomRange.min <= target));

  function applyZoom(value: number) {
    const z = Math.min(range.max, Math.max(range.min, value));
    setZoom(z);
    if (zoomRange) {
      void videoTrack()
        ?.applyConstraints({ advanced: [{ zoom: z } as MediaTrackConstraintSet] })
        .catch(() => undefined);
    } else {
      frame.current?.setZoom(z);
    }
  }

  /** Zoom chips: 0.5 (ultra-wide lens, or the camera's own range), then 1×, 2× and further. */
  function pickZoom(target: number) {
    // Mid-take only zoom: a lens change would restart the camera under the recorder.
    if (recorder.current && switchesLens(target)) return;
    if (target < 1 && !(zoomRange && zoomRange.min <= target)) {
      if (ultraId && !onUltra) void startCamera('environment', ultraId);
      return;
    }
    if (onUltra) {
      // Back to the main lens; it starts at 1×.
      void startCamera('environment').then(() => target !== 1 && applyZoom(target));
      return;
    }
    applyZoom(target);
  }

  /** Phones that only number their lenses: step through the back cameras to find the 0.5. */
  function nextLens() {
    if (backCams.length < 2 || recorder.current) return;
    const at = deviceId ? backCams.indexOf(deviceId) : -1;
    void startCamera('environment', backCams[(at + 1) % backCams.length]!);
  }

  function toggleTorch() {
    const next = !torch;
    setTorch(next);
    void videoTrack()
      ?.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      .catch(() => setTorch(!next));
  }

  // Pinch on the preview zooms like the phone's camera app.
  const onPinchDown = (e: React.PointerEvent) => {
    const p = pinch.current;
    p.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (p.pointers.size === 2) {
      const [a, b] = [...p.pointers.values()];
      p.startDist = Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1;
      p.startZoom = zoom;
    }
  };
  const onPinchMove = (e: React.PointerEvent) => {
    const p = pinch.current;
    if (!p.pointers.has(e.pointerId)) return;
    p.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (p.pointers.size !== 2 || onUltra) return;
    const [a, b] = [...p.pointers.values()];
    p.next = p.startZoom * (Math.hypot(a!.x - b!.x, a!.y - b!.y) / p.startDist);
    if (!p.frame) {
      p.frame = requestAnimationFrame(() => {
        p.frame = 0;
        applyZoom(p.next);
      });
    }
  };
  const onPinchUp = (e: React.PointerEvent) => {
    pinch.current.pointers.delete(e.pointerId);
  };

  const zoomChips: number[] = [];
  if (facing === 'environment' && (ultraId || (zoomRange && zoomRange.min < 1))) {
    zoomChips.push(zoomRange && zoomRange.min < 1 ? zoomRange.min : 0.5);
  }
  zoomChips.push(1, 2);
  if (range.max >= 5) zoomChips.push(5);
  else if (range.max >= 3) zoomChips.push(3);
  const activeChip = onUltra
    ? zoomChips[0]
    : zoomChips.reduce((best, c) => (Math.abs(c - zoom) < Math.abs(best - zoom) ? c : best), 1);
  const lensCycle = facing === 'environment' && !ultraId && backCams.length > 1;
  const lensIndex = deviceId ? backCams.indexOf(deviceId) + 1 : 1;
  const cameraControls = phase === 'ready' || phase === 'recording';

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black text-washi" role="dialog" aria-modal="true" aria-label="Grabar baile">
      {/*
        Camera preview, mirrored like a mirror for the front camera (the file itself is not mirrored).
        object-contain: the preview shows exactly the frame that gets recorded, no hidden crop. Pinch zooms.
      */}
      {/* The raw camera: only the source of the frame below (kept in the page so it keeps decoding). */}
      <video ref={preview} autoPlay muted playsInline className="pointer-events-none absolute inset-0 size-full object-contain opacity-0" />
      <div
        ref={stage}
        onPointerDown={onPinchDown}
        onPointerMove={onPinchMove}
        onPointerUp={onPinchUp}
        onPointerCancel={onPinchUp}
        className={cn(
          'absolute inset-0 touch-none',
          facing === 'user' && '-scale-x-100',
          phase === 'review' && 'invisible',
        )}
      />
      {phase === 'review' && take && (
        <video ref={review} src={take.url} controls autoPlay playsInline loop className="absolute inset-0 size-full bg-black object-contain" />
      )}

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-[max(14px,env(safe-area-inset-top))]">
        <button
          type="button"
          aria-label="Cerrar"
          disabled={recording}
          onClick={requestClose}
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
        {/* Keeps the title centred; the flip-camera button lives next to the shutter. */}
        <span aria-hidden className="size-11" />
      </div>

      {(phase === 'ready' || phase === 'starting') && (
        <p className="absolute inset-x-0 top-[calc(max(14px,env(safe-area-inset-top))+56px)] mx-auto flex w-max max-w-[90vw] items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-[12px] text-washi/90">
          {songAudio ? (
            <Music2 className="size-3.5 text-kin-300" />
          ) : silent ? (
            <MicOff className="size-3.5 text-kin-300" />
          ) : (
            <Mic className="size-3.5 text-kin-300" />
          )}
          {songAudio
            ? 'Se graba con el audio original de la canción'
            : silent
              ? 'Sin permiso para el micrófono: se graba sin sonido'
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
        {cameraControls && (
          <div role="group" aria-label="Zoom" className="flex items-center gap-1 rounded-full bg-black/45 p-1">
            {lensCycle && !recording && (
              <button
                type="button"
                aria-label="Cambiar de lente"
                onClick={nextLens}
                className="tabular flex h-9 items-center gap-1 rounded-full px-2.5 font-mono text-[12px] font-bold text-washi/90"
              >
                <Aperture className="size-4" /> {lensIndex}/{backCams.length}
              </button>
            )}
            {zoomChips.filter((z) => !recording || z === activeChip || !switchesLens(z)).map((z) => (
              <button
                key={z}
                type="button"
                aria-pressed={z === activeChip}
                onClick={() => pickZoom(z)}
                className={cn(
                  'tabular grid h-9 min-w-9 place-items-center rounded-full px-2 font-mono text-[12px] font-bold transition-colors',
                  z === activeChip ? 'bg-washi text-sumi-900' : 'text-washi/90',
                )}
              >
                {z === activeChip && !onUltra && Math.abs(zoom - z) > 0.05
                  ? formatZoom(Math.round(zoom * 10) / 10)
                  : formatZoom(z)}
              </button>
            ))}
          </div>
        )}
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
            {/* Like the phone's camera: flash on the left, shutter in the middle, flip camera on the right. */}
            <div className="grid w-full max-w-xs grid-cols-[1fr_auto_1fr] items-center">
              <div className="justify-self-start">
                {torchCap && (
                  <button
                    type="button"
                    aria-label={torch ? 'Apagar la linterna' : 'Encender la linterna'}
                    aria-pressed={torch}
                    onClick={toggleTorch}
                    className={cn('grid size-12 place-items-center rounded-full', torch ? 'bg-kin-300 text-sumi-900' : 'bg-black/45')}
                  >
                    {torch ? <Zap className="size-5" /> : <ZapOff className="size-5" />}
                  </button>
                )}
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
              <button
                type="button"
                aria-label={facing === 'user' ? 'Usar la cámara trasera' : 'Usar la cámara frontal'}
                onClick={switchCamera}
                className="grid size-12 place-items-center justify-self-end rounded-full bg-black/45"
              >
                <SwitchCamera className="size-5" />
              </button>
            </div>
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
            <Button variant="secondary" onClick={requestAgain}>
              Repetir
            </Button>
          </div>
        )}
      </div>

      {/* Inside the studio (above it), not a page Dialog: the studio covers every layer below it. */}
      <AnimatePresence>
        {confirm && (
          <motion.div
            className="absolute inset-0 grid place-items-center bg-sumi-950/80 p-6"
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
              <h2 id="record-discard-title" className="font-display text-[22px] font-bold leading-tight text-washi">
                ¿Descartar la toma?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-washi-muted">
                Aún no la has guardado en el móvil. Si la descartas, se pierde.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" autoFocus onClick={() => setConfirm(null)}>
                  Cancelar
                </Button>
                <Button variant="danger" onClick={discard}>
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
