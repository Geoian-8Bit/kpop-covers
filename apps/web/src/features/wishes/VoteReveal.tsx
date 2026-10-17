import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef } from 'react';
import { Seal } from '@/components/Seal';
import { cn } from '@/lib/cn';
import { easeOutExpo, inkReveal, jelly, soft } from '@/lib/motion';

/**
 * F11 · the winner's reveal when a vote closes («Hanabi»): paper fireworks rise and burst over a night sky; the
 * falling paper leaves the title. The winner is decided elsewhere (the count, or the tie draw); this only shows it.
 * Reduced motion: the end state.
 */

export interface RevealWinner {
  title: string;
  artist?: string | null;
  thumbnail?: string | null;
  /** «5 votos», «12 puntos»… */
  score?: string | null;
}

/** How long the reveal takes before everything is on screen (for `onDone`). */
export const REVEAL_MS = 2600;

export function VoteReveal({
  winner,
  className,
  onDone,
}: {
  winner: RevealWinner;
  className?: string;
  onDone?: () => void;
}) {
  const reduce = Boolean(useReducedMotion());
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const id = setTimeout(() => done.current?.(), reduce ? 0 : REVEAL_MS);
    return () => clearTimeout(id);
  }, [reduce]);
  return (
    <div
      role="status"
      aria-label={`Ganadora: ${winner.title}${winner.artist ? `, de ${winner.artist}` : ''}`}
      className={cn('relative isolate overflow-hidden rounded-[12px]', className)}
    >
      <Hanabi winner={winner} reduce={reduce} />
    </div>
  );
}

interface SceneProps {
  winner: RevealWinner;
  reduce: boolean;
}

// The brush-stroke reveal of `inkReveal`, after the fireworks.
const INK_HIDDEN = inkReveal.hidden as { clipPath: string; opacity: number };
const INK_SHOWN = { clipPath: 'inset(0 0% 0 0)', opacity: 1 };

/** The winner's name block. */
function WinnerText({ winner, delay, reduce }: SceneProps & { delay: number }) {
  return (
    <div className="min-w-0">
      <motion.p
        initial={reduce ? false : INK_HIDDEN}
        animate={INK_SHOWN}
        transition={{ duration: 0.9, ease: easeOutExpo, delay: reduce ? 0 : delay }}
        className="line-clamp-3 font-display text-[24px] font-extrabold leading-tight text-washi sm:text-[28px]"
      >
        {winner.title}
      </motion.p>
      {(winner.artist || winner.score) && (
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...soft, delay: reduce ? 0 : delay + 0.35 }}
          className="mt-1 truncate text-[14px] text-washi-muted"
        >
          {[winner.artist, winner.score].filter(Boolean).join(' · ')}
        </motion.p>
      )}
    </div>
  );
}

// ───────────── Hanabi ─────────────

const PETAL_TONES = ['fill-shu-500', 'fill-kin-400', 'fill-sakura', 'fill-ai-300', 'fill-fuji', 'fill-washi'] as const;
const BURSTS = [
  { x: 92, y: 74, tone: 0, delay: 0.15 },
  { x: 262, y: 62, tone: 1, delay: 0.55 },
  { x: 180, y: 46, tone: 2, delay: 0.95 },
  { x: 58, y: 40, tone: 3, delay: 1.3 },
  { x: 304, y: 104, tone: 4, delay: 1.55 },
];

function Hanabi({ winner, reduce }: SceneProps) {
  // Each burst: paper scraps flung out in a ring, then drifting down as they fade (fixed per mount).
  const petals = useMemo(
    () =>
      BURSTS.flatMap((burst, b) =>
        Array.from({ length: 20 }, (_, i) => {
          const angle = (Math.PI * 2 * i) / 20 + b * 0.4;
          const radius = 58 + ((i * 37 + b * 11) % 30);
          return {
            key: `${b}-${i}`,
            burst,
            dx: Math.cos(angle) * radius,
            dy: Math.sin(angle) * radius,
            rotate: ((i * 53) % 180) - 90,
            tone: PETAL_TONES[(burst.tone + (i % 3 === 0 ? 1 : 0)) % PETAL_TONES.length]!,
          };
        }),
      ),
    [],
  );
  return (
    <div className="relative min-h-[300px] bg-gradient-to-b from-ai-900 via-sumi-950 to-sumi-950">
      <svg viewBox="0 0 360 200" className="absolute inset-x-0 top-0 h-[200px] w-full" aria-hidden preserveAspectRatio="xMidYMid slice">
        {/* Stars */}
        {[...Array(18)].map((_, i) => (
          <circle key={i} cx={(i * 71) % 360} cy={(i * 37) % 120} r={i % 4 === 0 ? 1.1 : 0.6} className="fill-washi-subtle" opacity={0.5} />
        ))}
        {!reduce &&
          BURSTS.map((burst, b) => (
            <motion.line
              key={`trail-${b}`}
              x1={burst.x}
              x2={burst.x}
              y1={200}
              y2={200}
              className="stroke-kin-300"
              strokeWidth={1.4}
              strokeLinecap="round"
              initial={{ y2: 200, y1: 200, opacity: 0 }}
              animate={{ y2: [200, burst.y], y1: [200, burst.y + 26, burst.y], opacity: [0, 1, 0] }}
              transition={{ duration: 0.5, delay: burst.delay - 0.45 < 0 ? 0 : burst.delay - 0.45, ease: 'easeOut' }}
            />
          ))}
        {petals.map((p) =>
          reduce ? null : (
            <motion.rect
              key={p.key}
              x={-5}
              y={-2.2}
              width={10}
              height={4.4}
              rx={0.8}
              className={p.tone}
              initial={{ x: p.burst.x, y: p.burst.y, opacity: 0, rotate: 0, scale: 0.3 }}
              animate={{
                x: [p.burst.x, p.burst.x + p.dx, p.burst.x + p.dx * 1.06, p.burst.x + p.dx * 1.1],
                y: [p.burst.y, p.burst.y + p.dy, p.burst.y + p.dy + 30, p.burst.y + p.dy + 70],
                opacity: [0, 1, 0.9, 0],
                rotate: [0, p.rotate, p.rotate * 1.6, p.rotate * 2.4],
                scale: [0.3, 1, 0.95, 0.8],
              }}
              transition={{ duration: 2, delay: p.burst.delay, ease: easeOutExpo, times: [0, 0.3, 0.7, 1] }}
            />
          ),
        )}
        {/* The bursts' bright cores */}
        {!reduce &&
          BURSTS.map((burst, b) => (
            <motion.circle
              key={`core-${b}`}
              cx={burst.x}
              cy={burst.y}
              r={14}
              className="fill-kin-200"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.4, 0], opacity: [0, 0.9, 0] }}
              transition={{ duration: 0.45, delay: burst.delay }}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            />
          ))}
      </svg>
      <div className="relative flex min-h-[300px] flex-col items-center justify-end gap-3 px-5 pb-6 pt-24 text-center">
        <motion.div
          initial={reduce ? false : { scale: 1.8, rotate: -16, opacity: 0 }}
          animate={{ scale: 1, rotate: -6, opacity: 1 }}
          transition={{ ...jelly, delay: reduce ? 0 : 1.9 }}
        >
          <Seal glyph="当選" size={52} />
        </motion.div>
        {winner.thumbnail && (
          <motion.img
            src={winner.thumbnail}
            alt=""
            initial={reduce ? false : { opacity: 0, y: -40, rotate: -4 }}
            animate={{ opacity: 1, y: 0, rotate: -1.5 }}
            transition={{ ...soft, delay: reduce ? 0 : 1.75 }}
            className="aspect-video w-36 rounded-[8px] object-cover shadow-[0_10px_24px_-10px_rgb(0_0_0/0.9)] ring-2 ring-washi/80"
          />
        )}
        <WinnerText winner={winner} reduce={reduce} delay={reduce ? 0 : 2} />
      </div>
    </div>
  );
}
