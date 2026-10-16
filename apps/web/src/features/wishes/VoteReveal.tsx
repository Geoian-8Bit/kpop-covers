import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef } from 'react';
import { Seal } from '@/components/Seal';
import { cn } from '@/lib/cn';
import { easeOutExpo, inkReveal, jelly, soft } from '@/lib/motion';

/**
 * F11 · the winner's reveal when a vote closes, in one of three designs from the lab (`vote-reveal`):
 *  - hanabi (recommended): paper fireworks rise and burst over a night sky; the falling paper leaves the title.
 *  - noren: an indigo noren curtain sways and parts to uncover the winner behind it.
 *  - kakejiku: a hanging scroll unrolls from its rod with «決定» brushed down the side and the title in ink.
 * The winner is decided elsewhere (the count, or the tie draw); this only shows it. Reduced motion: the end state.
 */

export type VoteRevealVariant = 'hanabi' | 'noren' | 'kakejiku';

export interface RevealWinner {
  title: string;
  artist?: string | null;
  thumbnail?: string | null;
  /** «5 votos», «12 puntos»… */
  score?: string | null;
}

/** How long each design takes before everything is on screen (for `onDone`). */
export const REVEAL_MS: Record<VoteRevealVariant, number> = { hanabi: 2600, noren: 1900, kakejiku: 2300 };

export function VoteReveal({
  variant,
  winner,
  className,
  onDone,
}: {
  variant: string;
  winner: RevealWinner;
  className?: string;
  onDone?: () => void;
}) {
  const reduce = Boolean(useReducedMotion());
  const v: VoteRevealVariant = variant === 'noren' || variant === 'kakejiku' ? variant : 'hanabi';
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const id = setTimeout(() => done.current?.(), reduce ? 0 : REVEAL_MS[v]);
    return () => clearTimeout(id);
  }, [reduce, v]);
  const Scene = v === 'noren' ? Noren : v === 'kakejiku' ? Kakejiku : Hanabi;
  return (
    <div
      role="status"
      aria-label={`Ganadora: ${winner.title}${winner.artist ? `, de ${winner.artist}` : ''}`}
      className={cn('relative isolate overflow-hidden rounded-[12px]', className)}
    >
      <Scene winner={winner} reduce={reduce} />
    </div>
  );
}

interface SceneProps {
  winner: RevealWinner;
  reduce: boolean;
}

// The brush-stroke reveal of `inkReveal`, with each scene's own delay.
const INK_HIDDEN = inkReveal.hidden as { clipPath: string; opacity: number };
const INK_SHOWN = { clipPath: 'inset(0 0% 0 0)', opacity: 1 };

/** The winner's name block, shared by the three scenes. */
function WinnerText({ winner, delay, reduce, tone = 'light' }: SceneProps & { delay: number; tone?: 'light' | 'ink' }) {
  return (
    <div className="min-w-0">
      <motion.p
        initial={reduce ? false : INK_HIDDEN}
        animate={INK_SHOWN}
        transition={{ duration: 0.9, ease: easeOutExpo, delay: reduce ? 0 : delay }}
        className={cn(
          'line-clamp-3 font-display text-[24px] font-extrabold leading-tight sm:text-[28px]',
          tone === 'ink' ? 'text-sumi-900' : 'text-washi',
        )}
      >
        {winner.title}
      </motion.p>
      {(winner.artist || winner.score) && (
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...soft, delay: reduce ? 0 : delay + 0.35 }}
          className={cn('mt-1 truncate text-[14px]', tone === 'ink' ? 'text-sumi-700' : 'text-washi-muted')}
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

// ───────────── Noren ─────────────

function Noren({ winner, reduce }: SceneProps) {
  const panel = (side: 'left' | 'right', glyph: string) => (
    <motion.div
      aria-hidden
      className={cn(
        'absolute top-3 bottom-8 z-20 flex w-1/2 flex-col items-center justify-center bg-ai-700 shadow-[inset_0_-6px_0_rgb(0_0_0/0.18)]',
        side === 'left' ? 'left-0 rounded-bl-[6px] border-r border-ai-900' : 'right-0 rounded-br-[6px] border-l border-ai-900',
      )}
      style={{ transformOrigin: side === 'left' ? 'top left' : 'top right' }}
      initial={reduce ? false : { x: 0, rotate: 0, skewY: 0 }}
      animate={
        reduce
          ? { x: side === 'left' ? '-104%' : '104%' }
          : {
              x: [0, 0, 0, side === 'left' ? '-104%' : '104%'],
              rotate: [0, side === 'left' ? 2 : -2, side === 'left' ? -1.5 : 1.5, side === 'left' ? -10 : 10],
              skewY: [0, side === 'left' ? 1.5 : -1.5, 0, 0],
            }
      }
      transition={reduce ? { duration: 0 } : { duration: 1.5, times: [0, 0.25, 0.45, 1], ease: easeOutExpo, delay: 0.15 }}
    >
      <span className="grid size-20 place-items-center rounded-full border-[3px] border-washi/90 font-display text-[44px] font-extrabold text-washi">
        {glyph}
      </span>
      {/* Hem pattern */}
      <span className="absolute inset-x-0 bottom-3 h-2 bg-[repeating-linear-gradient(90deg,var(--color-washi)_0_6px,transparent_6px_12px)] opacity-60" />
    </motion.div>
  );
  return (
    <div className="relative min-h-[300px] bg-kiji-900">
      {/* The rod */}
      <div aria-hidden className="absolute inset-x-2 top-1 z-30 h-3 rounded-full bg-kiji-400 shadow-[0_3px_6px_rgb(0_0_0/0.6)]" />
      {panel('left', '当')}
      {panel('right', '選')}
      {/* What the curtain hides */}
      <motion.div
        initial={reduce ? false : { scale: 0.94, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...jelly, delay: reduce ? 0 : 1.1 }}
        className="relative z-10 flex min-h-[300px] flex-col items-center justify-center gap-3 bg-gradient-to-b from-kiji-700 to-kiji-900 px-6 py-8 text-center"
      >
        {winner.thumbnail && (
          <img
            src={winner.thumbnail}
            alt=""
            className="aspect-video w-40 rounded-[8px] object-cover shadow-[0_12px_26px_-10px_rgb(0_0_0/0.95)] ring-2 ring-kin-300"
          />
        )}
        <WinnerText winner={winner} reduce={reduce} delay={reduce ? 0 : 1.15} />
        <motion.div
          className="absolute right-4 top-6"
          initial={reduce ? false : { scale: 1.8, rotate: -18, opacity: 0 }}
          animate={{ scale: 1, rotate: -8, opacity: 1 }}
          transition={{ ...jelly, delay: reduce ? 0 : 1.55 }}
        >
          <Seal glyph="決定" size={46} />
        </motion.div>
      </motion.div>
    </div>
  );
}

// ───────────── Kakejiku ─────────────

function Kakejiku({ winner, reduce }: SceneProps) {
  const unroll = { duration: 1.2, ease: easeOutExpo, delay: 0.2 };
  return (
    <div className="relative flex min-h-[320px] justify-center bg-sumi-850 px-4 pb-5 pt-3">
      <div aria-hidden className="seigaiha absolute inset-0 opacity-30" />
      <div className="relative w-full max-w-[300px]">
        {/* Hanging cord and top rod */}
        <svg aria-hidden viewBox="0 0 300 26" className="block h-[26px] w-full">
          <path d="M120 24 L150 4 L180 24" fill="none" className="stroke-kin-300" strokeWidth="1.6" />
          <circle cx="150" cy="4" r="2.5" className="fill-kin-400" />
        </svg>
        <div aria-hidden className="relative z-20 mx-[-10px] h-3.5 rounded-full bg-kiji-700 shadow-[0_3px_5px_rgb(0_0_0/0.6)]">
          <span className="absolute -left-1 top-1/2 size-4 -translate-y-1/2 rounded-full bg-kin-400" />
          <span className="absolute -right-1 top-1/2 size-4 -translate-y-1/2 rounded-full bg-kin-400" />
        </div>
        {/* Mounting (ai) and paper (washi), unrolled from the top */}
        <motion.div
          className="relative z-10 overflow-hidden bg-ai-800 px-3 pb-3 pt-2"
          initial={reduce ? false : { clipPath: 'inset(0 0 100% 0)' }}
          animate={{ clipPath: 'inset(0 0 0% 0)' }}
          transition={reduce ? { duration: 0 } : unroll}
        >
          <div className="relative flex min-h-[230px] gap-3 rounded-[2px] bg-washi px-4 py-4 shadow-[inset_0_0_0_1px_var(--color-kin-300)]">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...soft, delay: reduce ? 0 : 1.1 }}
              className="flex shrink-0 flex-col items-center font-display text-[34px] font-extrabold leading-[1.05] text-sumi-900"
              aria-hidden
            >
              <span>決</span>
              <span>定</span>
            </motion.div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
              {winner.thumbnail && (
                <motion.img
                  src={winner.thumbnail}
                  alt=""
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: reduce ? 0 : 1.3 }}
                  className="aspect-video w-full rounded-[3px] object-cover grayscale-[0.2] sepia-[0.25]"
                />
              )}
              <WinnerText winner={winner} reduce={reduce} delay={reduce ? 0 : 1.45} tone="ink" />
            </div>
            <motion.div
              className="absolute bottom-3 right-3"
              initial={reduce ? false : { scale: 1.8, rotate: -16, opacity: 0 }}
              animate={{ scale: 1, rotate: -5, opacity: 1 }}
              transition={{ ...jelly, delay: reduce ? 0 : 2 }}
            >
              <Seal glyph="当選" size={40} />
            </motion.div>
          </div>
        </motion.div>
        {/* The bottom roller, travelling down as it unrolls */}
        <motion.div
          aria-hidden
          className="relative z-20 mx-[-6px] h-4 rounded-full bg-kiji-700 shadow-[0_4px_6px_rgb(0_0_0/0.6)]"
          initial={reduce ? false : { y: -258 }}
          animate={{ y: 0 }}
          transition={reduce ? { duration: 0 } : unroll}
        >
          <span className="absolute -left-1.5 top-1/2 h-5 w-3 -translate-y-1/2 rounded-[3px] bg-kiji-400" />
          <span className="absolute -right-1.5 top-1/2 h-5 w-3 -translate-y-1/2 rounded-[3px] bg-kiji-400" />
        </motion.div>
      </div>
    </div>
  );
}
