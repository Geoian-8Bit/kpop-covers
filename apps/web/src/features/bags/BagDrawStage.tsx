import { AnimatePresence, motion, useReducedMotion, type Transition } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { jelly, snappy, soft } from '@/lib/motion';
import { TONE, type DrawShown } from './tones';

/**
 * F13 · «Sacar»: the short draw animation, «Fukubiki»: the garagara drum of a festival raffle spins and drops a ball
 * in the result's colour; the prize card follows. The draw itself is decided by the server; this only shows it.
 */

export type DrawPhase = 'idle' | 'shaking' | 'reveal';

export interface BagDrawStageProps {
  phase: DrawPhase;
  /** What came out (shown in `reveal`). Several at once: the first one leads, the rest are listed. */
  results: DrawShown[];
  /** Nothing left to draw: the scene rests and says so (with `emptyText`, or «Rellénala…»). */
  empty?: boolean;
  emptyText?: string;
  /** A short note in the scene's top corner (how many are inside, the bag's mode). */
  caption?: ReactNode;
  className?: string;
}

/** How long the scene shakes at least before revealing (the draw usually answers sooner). */
export const SHAKE_MS = 1100;

export function BagDrawStage({ phase, results, empty, emptyText, caption, className }: BagDrawStageProps) {
  const first = results[0] ?? null;
  return (
    <div className={cn('relative overflow-hidden rounded-[12px] bg-sumi-900', className)}>
      <div aria-hidden className="seigaiha absolute inset-0 opacity-50" />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-sumi-950 to-transparent"
      />
      {caption && (
        <div className="absolute left-3 top-2.5 z-10 max-w-[38%] text-[12px] leading-snug text-washi-subtle">
          {caption}
        </div>
      )}
      <div className="relative pt-2">
        <Fukubiki phase={phase} result={phase === 'reveal' ? first : null} />
        <ResultPanel phase={phase} results={results} empty={empty} emptyText={emptyText} />
      </div>
    </div>
  );
}

interface SceneProps {
  phase: DrawPhase;
  result: DrawShown | null;
}

// ───────────── Fukubiki (garagara) ─────────────

const OCTAGON = Array.from({ length: 8 }, (_, i) => {
  const a = (Math.PI / 8) * (2 * i + 1);
  return `${(62 * Math.cos(a)).toFixed(1)},${(62 * Math.sin(a)).toFixed(1)}`;
}).join(' ');
const OCTAGON_IN = Array.from({ length: 8 }, (_, i) => {
  const a = (Math.PI / 8) * (2 * i + 1);
  return `${(52 * Math.cos(a)).toFixed(1)},${(52 * Math.sin(a)).toFixed(1)}`;
}).join(' ');

/** The scene's own units (the SVG viewBox). The ball is an HTML layer placed in these units, in percent. */
const VIEW_W = 300;
const VIEW_H = 210;
const BALL_R = 9;
/** Where the ball leaves the drum, and where it rests, seated in the tray. */
const BALL_FROM = { x: 196, y: 142 };
const BALL_TO = { x: 226, y: 181 };
/** The tray's front lip: drawn over the ball so it sits inside. */
const TRAY_FRONT = 'M198 185 h56 l-7 11 h-42 z';
/** The ball's way out, as a percentage of its own size (transform only: no layout, no SVG repaint per frame). */
const BALL_DX = `${(((BALL_TO.x - BALL_FROM.x) / (BALL_R * 2)) * 100).toFixed(2)}%`;
const BALL_DY = `${(((BALL_TO.y - BALL_FROM.y) / (BALL_R * 2)) * 100).toFixed(2)}%`;
/** The drum turns to a stop first; then the ball drops. */
const BALL_DELAY = 0.25;

/**
 * Out of the drum and into the tray: across with `soft` (it slows as it rolls), down with `jelly` (its overshoot
 * is the bounce in the tray), a quick `snappy` pop as it appears. With reduced motion it just fades in, at rest.
 */
const BALL_TRANSITION: Transition = {
  opacity: { duration: 0.12, delay: BALL_DELAY },
  scale: { ...snappy, delay: BALL_DELAY },
  x: { ...soft, delay: BALL_DELAY },
  y: { ...jelly, delay: BALL_DELAY },
};

function Fukubiki({ phase, result }: SceneProps) {
  const reduce = useReducedMotion();
  const spinning = phase === 'shaking' && !reduce;
  const showBall = phase === 'reveal' && result != null;
  return (
    <div className="relative mx-auto aspect-[10/7] w-full max-w-[300px] sm:max-w-[340px]">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="absolute inset-0 block size-full" aria-hidden>
        <ellipse cx="150" cy="200" rx="84" ry="6" className="fill-sumi-950" opacity="0.7" />
        {/* Stand */}
        <polygon points="110,196 138,100 146,100 122,196" className="fill-kiji-700" />
        <polygon points="190,196 162,100 154,100 178,196" className="fill-kiji-700" />
        <rect x="92" y="190" width="116" height="10" rx="2" className="fill-kiji-400" />
        <text
          x="150"
          y="198.5"
          textAnchor="middle"
          className="fill-sumi-900 font-display"
          fontWeight={800}
          fontSize="9"
        >
          福引
        </text>
        {/* Tray: its back, behind the ball */}
        <path d="M200 183 h52 l-2 4 h-48 z" className="fill-kiji-700" />
        {/* Drum */}
        <motion.g
          style={{ transformBox: 'view-box', transformOrigin: '150px 100px' }}
          initial={false}
          animate={spinning ? { rotate: [0, 360] } : { rotate: phase === 'reveal' ? 202.5 : 22.5 }}
          transition={spinning ? { duration: 0.55, repeat: Infinity, ease: 'linear' } : soft}
        >
          <g transform="translate(150 100)">
            <polygon points={OCTAGON} className="fill-enji-500 stroke-kin-400" strokeWidth="2.5" />
            <polygon
              points={OCTAGON_IN}
              fill="none"
              className="stroke-kin-300"
              strokeOpacity="0.5"
              strokeWidth="1"
            />
            {Array.from({ length: 8 }, (_, i) => (
              <line
                key={i}
                x1="0"
                y1="0"
                x2={(52 * Math.cos((Math.PI / 4) * i)).toFixed(1)}
                y2={(52 * Math.sin((Math.PI / 4) * i)).toFixed(1)}
                className="stroke-enji-700"
                strokeWidth="1"
              />
            ))}
            <circle r="9" className="fill-kin-400" />
            <circle r="4" className="fill-kiji-900" />
            {/* Crank */}
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="-80"
              className="stroke-kiji-700"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <circle cy="-80" r="6" className="fill-kiji-400" />
          </g>
        </motion.g>
      </svg>

      {/* The ball: an HTML layer, so its way out is a compositor transform (no SVG repaint per frame). */}
      <AnimatePresence>
        {showBall && (
          <motion.div
            key="ball"
            aria-hidden
            className="absolute aspect-square will-change-transform"
            style={{
              left: `${(((BALL_FROM.x - BALL_R) / VIEW_W) * 100).toFixed(3)}%`,
              top: `${(((BALL_FROM.y - BALL_R) / VIEW_H) * 100).toFixed(3)}%`,
              width: `${(((BALL_R * 2) / VIEW_W) * 100).toFixed(3)}%`,
            }}
            initial={
              reduce ? { opacity: 0, x: BALL_DX, y: BALL_DY } : { opacity: 0, scale: 0.4, x: '0%', y: '0%' }
            }
            animate={{ opacity: 1, scale: 1, x: BALL_DX, y: BALL_DY }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={reduce ? { duration: 0.2 } : BALL_TRANSITION}
          >
            <span
              className={cn(
                'absolute inset-0 rounded-full shadow-[inset_-2px_-3px_0_rgb(0_0_0/0.22)] ring-1 ring-sumi-950',
                TONE[result.tone].bg,
              )}
            />
            <span className="absolute left-[18%] top-[18%] size-[30%] rounded-full bg-washi/75" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* The tray's front lip, over the ball. */}
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="pointer-events-none absolute inset-0 block size-full"
        aria-hidden
      >
        <path d={TRAY_FRONT} className="fill-kiji-300" />
        <path d="M198 185 h56" className="stroke-kiji-900" strokeWidth="1" />
      </svg>
    </div>
  );
}

// ───────────── Result ─────────────

function ResultPanel({
  phase,
  results,
  empty,
  emptyText,
}: {
  phase: DrawPhase;
  results: DrawShown[];
  empty?: boolean;
  emptyText?: string;
}) {
  const first = results[0];
  const rest = results.slice(1);
  const reveal = phase === 'reveal' && first;
  const reduce = useReducedMotion();
  return (
    <div className="relative min-h-[96px] px-3 pb-3 pt-1 sm:min-h-[112px] sm:px-6 sm:pb-4">
      <AnimatePresence mode="wait" initial={false}>
        {reveal ? (
          <motion.div
            key={`result-${first.label}-${results.length}`}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            className="flex flex-col items-center"
          >
            <motion.div
              variants={{
                hidden: reduce ? { opacity: 0 } : { y: 18, opacity: 0, scale: 0.9 },
                show: reduce
                  ? { opacity: 1, transition: { duration: 0.2, delay: 0.2 } }
                  : { y: 0, opacity: 1, scale: 1, transition: { ...jelly, delay: 0.85 } },
              }}
              className="flex w-full max-w-[420px] items-center gap-3 rounded-[12px] border border-kin-400/50 bg-sumi-850 px-4 py-3"
            >
              <span
                aria-hidden
                className={cn(
                  'grid size-10 shrink-0 place-items-center rounded-full font-display text-[16px] font-extrabold shadow-[inset_-3px_-4px_0_rgb(0_0_0/0.2)]',
                  TONE[first.tone].bg,
                  TONE[first.tone].ink,
                )}
              >
                {first.glyph}
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-kin-300">¡Premio!</p>
                <p className="truncate font-display text-[22px] font-bold leading-tight text-washi">
                  {first.label}
                </p>
                {first.sub && <p className="truncate text-[13px] text-washi-muted">{first.sub}</p>}
              </div>
            </motion.div>
            {rest.length > 0 && (
              <motion.ol
                variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { delay: 1 } } }}
                className="mt-2 flex max-w-full flex-wrap justify-center gap-1.5"
                aria-label="También salieron"
              >
                {rest.map((r, i) => (
                  <li
                    key={`${r.label}-${i}`}
                    className="flex max-w-[220px] items-center gap-1.5 rounded-full border border-line bg-sumi-850 py-1 pl-1 pr-2.5 text-[13px] text-washi"
                  >
                    <span aria-hidden className={cn('size-4 shrink-0 rounded-full', TONE[r.tone].bg)} />
                    <span className="truncate">{r.sub ? `${r.label} · ${r.sub}` : r.label}</span>
                  </li>
                ))}
              </motion.ol>
            )}
          </motion.div>
        ) : (
          <motion.p
            key={phase === 'shaking' ? 'shaking' : empty ? 'empty' : 'idle'}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={snappy}
            className="pt-5 text-center text-sm text-washi-muted"
          >
            {phase === 'shaking'
              ? 'Sorteando…'
              : empty
                ? (emptyText ?? 'La bolsa está vacía. Rellénala para seguir sacando.')
                : 'Pulsa «Sacar» cuando estéis listos.'}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
