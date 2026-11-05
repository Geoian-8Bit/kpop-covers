import { scheduleCountIn } from '@/lib/metronome';
import { jelly } from '@/lib/motion';
import { usePlayer } from '@/player/store';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

export function Countdown() {
  const endsAt = usePlayer((s) => s.countdownEndsAt);
  const [now, setNow] = useState(() => performance.now());

  // Metronome: one tick per second of the pause, accented tick when the loop starts again.
  useEffect(() => {
    if (endsAt == null || !usePlayer.getState().countSound) return;
    const cancel = scheduleCountIn(Math.round((endsAt - performance.now()) / 1000));
    // Only silence the ticks if the pause was interrupted; a natural end must keep the accented "go" tick.
    return () => {
      if (performance.now() < endsAt - 80) cancel();
    };
  }, [endsAt]);

  // Wake exactly when the shown number changes (each whole second left), not on a fast poll.
  useEffect(() => {
    if (endsAt == null) return;
    let id: ReturnType<typeof setTimeout>;
    const step = () => {
      const t = performance.now();
      setNow(t);
      const left = endsAt - t;
      if (left > 0) id = setTimeout(step, (left % 1000 || 1000) + 5);
    };
    step();
    return () => clearTimeout(id);
  }, [endsAt]);

  const remaining = endsAt == null ? null : Math.max(1, Math.ceil((endsAt - now) / 1000));

  return (
    <AnimatePresence>
      {remaining != null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-sumi-950/45"
        >
          <AnimatePresence mode="popLayout">
            <motion.span
              key={remaining}
              initial={{ scale: 1.6, opacity: 0, rotate: -10 }}
              animate={{ scale: 1, opacity: 1, rotate: -4 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={jelly}
              className="grid size-[clamp(96px,16vw,150px)] place-items-center rounded-[14px] bg-shu-500 font-display text-[clamp(56px,10vw,96px)] font-extrabold leading-none text-washi shadow-[0_20px_40px_-20px_rgb(0_0_0/0.9)]"
            >
              {remaining}
            </motion.span>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
