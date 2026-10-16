import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { jelly, snappy } from '@/lib/motion';

export interface TieCandidate {
  id: string;
  title: string;
  thumbnail?: string | null;
}

/** Waits between hops of the light: fast at first, slowing down onto the one drawn (~2.4 s). */
export function hopDelays(steps: number): number[] {
  return Array.from({ length: steps }, (_, i) => 70 + Math.round(330 * (i / Math.max(1, steps - 1)) ** 2));
}

/**
 * «Sorteo entre empatadas»: a lantern light hops among the tied ones, slows down and stops on the one drawn
 * (already decided by the caller, at random). `onDone` once it has landed.
 */
export function TieDraw({
  candidates,
  winnerId,
  onDone,
}: {
  candidates: TieCandidate[];
  winnerId: string;
  onDone: () => void;
}) {
  const reduce = useReducedMotion();
  const target = Math.max(0, candidates.findIndex((c) => c.id === winnerId));
  const [lit, setLit] = useState(reduce ? target : 0);
  const [landed, setLanded] = useState(Boolean(reduce));
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const n = candidates.length;
    if (reduce || n === 0) {
      setLit(target);
      setLanded(true);
      const id = setTimeout(() => done.current(), 300);
      return () => clearTimeout(id);
    }
    // At least two full laps, ending on the target.
    const steps = n * 3 + target;
    const delays = hopDelays(steps);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let at = 0;
    for (let i = 1; i <= steps; i++) {
      at += delays[i - 1]!;
      timers.push(setTimeout(() => setLit(i % n), at));
    }
    timers.push(setTimeout(() => setLanded(true), at + 120));
    timers.push(setTimeout(() => done.current(), at + 900));
    return () => timers.forEach(clearTimeout);
  }, [candidates.length, target, reduce]);

  const current = candidates[lit];
  return (
    <div className="rounded-[12px] bg-sumi-950/60 p-3">
      <p className="sr-only" aria-live="assertive">
        {landed && current ? `Ha salido ${current.title}` : 'Sorteando entre las empatadas…'}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {candidates.map((c, i) => {
          const on = i === lit;
          return (
            <motion.li
              key={c.id}
              animate={{ scale: on ? (landed ? 1.04 : 1.02) : landed ? 0.97 : 1, opacity: landed && !on ? 0.45 : 1 }}
              transition={landed ? jelly : snappy}
              className={cn(
                'relative flex min-w-0 items-center gap-3 rounded-[10px] border p-2 transition-colors duration-100',
                on ? 'border-kin-300 bg-kin-400/15 shadow-[0_0_24px_-6px_var(--color-kin-300)]' : 'border-line',
              )}
            >
              {c.thumbnail && <img src={c.thumbnail} alt="" className="aspect-video w-20 shrink-0 rounded-[6px] object-cover" />}
              <span className="min-w-0 flex-1 truncate font-bold text-washi">{c.title}</span>
              {on && landed && (
                <motion.span
                  initial={{ scale: 1.8, rotate: -18, opacity: 0 }}
                  animate={{ scale: 1, rotate: -6, opacity: 1 }}
                  transition={jelly}
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-[6px] bg-shu-500 font-display text-[15px] font-extrabold text-washi"
                >
                  籤
                </motion.span>
              )}
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
