import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
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
  className?: string;
}

/** How long the scene shakes at least before revealing (the draw usually answers sooner). */
export const SHAKE_MS = 1100;

export function BagDrawStage({ phase, results, empty, emptyText, className }: BagDrawStageProps) {
  const first = results[0] ?? null;
  return (
    <div className={cn('relative overflow-hidden rounded-[12px] bg-sumi-900', className)}>
      <div aria-hidden className="seigaiha absolute inset-0 opacity-50" />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-sumi-950 to-transparent"
      />
      <div className="relative">
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

function Fukubiki({ phase, result }: SceneProps) {
  const reduce = useReducedMotion();
  const spinning = phase === 'shaking' && !reduce;
  return (
    <svg
      viewBox="0 0 300 210"
      className="mx-auto block h-[180px] w-full max-w-[360px] sm:h-[210px]"
      aria-hidden
    >
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
      {/* Tray where the ball lands */}
      <path d="M200 186 h52 l-6 10 h-40 z" className="fill-kiji-300" />
      <path d="M200 186 h52" className="stroke-kiji-900" strokeWidth="1" />
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
      {/* The ball: out of the drum, down into the tray. */}
      <AnimatePresence>
        {phase === 'reveal' && result && (
          <motion.g
            key="ball"
            initial={{ x: 196, y: 142, opacity: 0 }}
            animate={{ x: [196, 214, 226], y: [142, 182, 178], opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.75, ease: [0.3, 0, 0.6, 1], times: [0, 0.7, 1], delay: 0.25 }}
          >
            <circle r="9" className={cn(TONE[result.tone].fill, 'stroke-sumi-950')} strokeWidth="1.2" />
            <circle cx="-3" cy="-3" r="2.6" className="fill-washi" opacity="0.75" />
          </motion.g>
        )}
      </AnimatePresence>
    </svg>
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
  return (
    <div className="relative min-h-[112px] px-4 pb-4 pt-2 sm:px-6">
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
                hidden: { y: 18, opacity: 0, scale: 0.9 },
                show: { y: 0, opacity: 1, scale: 1, transition: { ...jelly, delay: 0.85 } },
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
            className="pt-6 text-center text-sm text-washi-muted"
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
