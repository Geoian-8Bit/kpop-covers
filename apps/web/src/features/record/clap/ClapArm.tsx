import type { ClapSensitivity } from '@coverscape/shared';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { soft } from '@/lib/motion';
import { ClapArmView, useClapUi } from './ClapArmView';
import { techLogging } from '../pace';
import { noteClapReading } from './clapLog';
import { listenForClap, type ClapListener } from './clapListener';

/** With no signal in this long, the recorder disarms on its own. */
export const CLAP_ARM_LIMIT_MS = 3 * 60_000;
/** The «¡Señal!» stays this long before the count-in starts. */
const FIRE_HOLD_MS = 500;

type WakeLockSentinelLike = { release: () => Promise<void>; released?: boolean };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
};

/**
 * F7 · The recorder armed, over the camera: listens to the microphone (only while shown) for a double clap and then
 * calls `onFire`, which starts the take exactly as the shutter does. Escape and «Cancelar» disarm; with no signal in
 * `CLAP_ARM_LIMIT_MS` it disarms on its own. The screen is kept on while armed where the browser allows it.
 * The parent owns the AudioContext and the microphone track (it asked for them in the tap that armed).
 */
export function ClapArm({
  ctx,
  track,
  sensitivity,
  onSensitivity,
  onFire,
  onCancel,
  onTimeout,
}: {
  ctx: AudioContext | null;
  /** Null while the microphone is being asked for. */
  track: MediaStreamTrack | null;
  sensitivity: ClapSensitivity;
  onSensitivity: (next: ClapSensitivity) => void;
  onFire: () => void;
  onCancel: () => void;
  onTimeout: () => void;
}) {
  const ui = useClapUi(sensitivity);
  const { take } = ui;
  const [fired, setFired] = useState(false);
  const listener = useRef<ClapListener | null>(null);
  const sensitivityRef = useRef(sensitivity);
  sensitivityRef.current = sensitivity;
  const handlers = useRef({ onFire, onCancel, onTimeout });
  handlers.current = { onFire, onCancel, onTimeout };
  const [endsAt] = useState(() => Date.now() + CLAP_ARM_LIMIT_MS);
  const [secondsLeft, setSecondsLeft] = useState(CLAP_ARM_LIMIT_MS / 1000);

  // Listening: from the moment the microphone is there until the signal (or until this screen goes).
  useEffect(() => {
    if (!ctx || !track) return;
    const current: ClapListener = listenForClap(ctx, track, {
      sensitivity: sensitivityRef.current,
      onReading: (reading) => {
        take(reading);
        noteClapReading(reading, techLogging);
        if (reading.state === 'fired') {
          // The clap only starts the take: nothing is heard any more.
          current.stop();
          setFired(true);
        }
      },
    });
    listener.current = current;
    return () => {
      current.stop();
      listener.current = null;
    };
  }, [ctx, track, take]);

  useEffect(() => listener.current?.setSensitivity(sensitivity), [sensitivity]);

  useEffect(() => {
    if (!fired) return;
    const t = setTimeout(() => handlers.current.onFire(), FIRE_HOLD_MS);
    return () => clearTimeout(t);
  }, [fired]);

  // Time limit, with the time left on screen.
  useEffect(() => {
    if (fired) return;
    const limit = setTimeout(() => handlers.current.onTimeout(), Math.max(0, endsAt - Date.now()));
    const clock = setInterval(
      () => setSecondsLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))),
      1000,
    );
    return () => {
      clearTimeout(limit);
      clearInterval(clock);
    };
  }, [endsAt, fired]);

  // Escape cancels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      handlers.current.onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Keep the screen on while waiting (asked again when the page comes back: the browser drops it when hidden).
  useEffect(() => {
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock) return;
    let lock: WakeLockSentinelLike | null = null;
    let live = true;
    const request = () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      void nav.wakeLock
        ?.request('screen')
        .then((next) => {
          if (live) lock = next;
          else void next.release().catch(() => undefined);
        })
        .catch(() => undefined);
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', request);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Grabación armada: esperando el doble aplauso"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={soft}
      className="absolute inset-0 z-20 overflow-y-auto bg-sumi-950/85 backdrop-blur-sm"
    >
      <ClapArmView
        ui={ui}
        phase={!track ? 'asking' : fired ? 'fired' : 'listening'}
        sensitivity={sensitivity}
        onSensitivity={onSensitivity}
        onCancel={onCancel}
        secondsLeft={fired ? null : secondsLeft}
      />
    </motion.div>
  );
}
