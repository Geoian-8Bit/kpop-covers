import { AnimatePresence, motion, useMotionValue, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
/** Smoothing per sensor reading (~60 a second): 0.18 settles in about a tenth of a second without shaking. */
const SMOOTH = 0.18;

/**
 * A camera's level (A1 «Nivel»): a horizon line that stays level with the real one as the phone tilts, and turns
 * old gold when the phone stands straight (±1°). Read from `deviceorientation`, relative to how the screen is
 * turned. Shows nothing without a sensor (desktop, or iOS before motion permission), nor with the phone lying flat.
 */
export function LevelIndicator({ className }: { className?: string }) {
  const rotate = useMotionValue(0);
  const reduce = useReducedMotion();
  const [seen, setSeen] = useState(false);
  const [show, setShow] = useState(false);
  const [level, setLevel] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
    let sx = 0;
    let sy = 0;
    let first = true;
    let isLevel = false;
    let isShown = false;

    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      const b = e.beta * D2R;
      const g = e.gamma * D2R;
      // «Up» in the phone's own axes (x to its right edge, y to its top), from the W3C Z-X'-Y'' angles: works the
      // same whether the phone lies on a table or stands on the floor.
      const ux = -Math.sin(g) * Math.cos(b);
      const uy = Math.sin(b);
      // Smooth the vector, not the angle: no jump when the angle wraps round.
      const k = first ? 1 : SMOOTH;
      sx += (ux - sx) * k;
      sy += (uy - sy) * k;
      if (first) {
        first = false;
        setSeen(true);
      }
      const screenAngle = screen.orientation?.angle ?? (typeof window.orientation === 'number' ? window.orientation : 0);
      let angle = Math.atan2(sx, sy) * R2D - screenAngle;
      angle = ((((angle + 180) % 360) + 360) % 360) - 180;
      rotate.set(angle);

      // Hidden when the phone lies flat (no horizon) or is far from upright for this screen.
      const shown = Math.hypot(sx, sy) > 0.4 && Math.abs(angle) < 40;
      if (shown !== isShown) {
        isShown = shown;
        setShow(shown);
      }
      // A little hysteresis, so it doesn't flicker on the edge of ±1°.
      const nowLevel = isLevel ? Math.abs(angle) <= 1.4 : Math.abs(angle) <= 1;
      if (nowLevel !== isLevel) {
        isLevel = nowLevel;
        setLevel(nowLevel);
      }
    };

    window.addEventListener('deviceorientation', onOrientation);
    return () => window.removeEventListener('deviceorientation', onOrientation);
  }, [rotate]);

  return (
    <AnimatePresence>
      {seen && show && (
        <motion.div
          aria-hidden
          className={cn('pointer-events-none absolute inset-0 grid place-items-center', className)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="relative h-0 w-[min(44%,240px)]">
            {/* Fixed marks: where the line sits when the phone is straight. */}
            <span className="absolute -left-7 -top-px h-0.5 w-4 rounded-full bg-washi/45" />
            <span className="absolute -right-7 -top-px h-0.5 w-4 rounded-full bg-washi/45" />
            <motion.div className="absolute inset-x-0 top-0 h-0" style={{ rotate }}>
              <Horizon className="bg-washi/85" />
              <motion.span
                className="absolute inset-0"
                initial={false}
                animate={{ opacity: level ? 1 : 0 }}
                transition={{ duration: 0.15 }}
              >
                <Horizon className="bg-kin-300" />
              </motion.span>
            </motion.div>
            <motion.span
              className="absolute left-1/2 top-0 grid size-3.5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-washi/80"
              initial={false}
              animate={reduce ? { scale: 1 } : { scale: level ? 1.3 : 1 }}
              transition={jelly}
            >
              <motion.span
                className="absolute -inset-[2px] rounded-full border-2 border-kin-300"
                initial={false}
                animate={{ opacity: level ? 1 : 0 }}
                transition={{ duration: 0.15 }}
              />
            </motion.span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The line, with a gap in the middle for the centre ring. */
function Horizon({ className }: { className: string }) {
  return (
    <>
      <span
        className={cn('absolute left-0 -top-px h-0.5 w-[42%] rounded-full shadow-[0_0_2px_rgb(0_0_0/0.6)]', className)}
      />
      <span
        className={cn('absolute right-0 -top-px h-0.5 w-[42%] rounded-full shadow-[0_0_2px_rgb(0_0_0/0.6)]', className)}
      />
    </>
  );
}
