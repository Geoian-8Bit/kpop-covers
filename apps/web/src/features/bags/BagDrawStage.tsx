import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/cn';
import { easeOutExpo, inkReveal, jelly, snappy, soft } from '@/lib/motion';
import { TONE, type DrawShown } from './tones';

/**
 * F13 · «Sacar»: the short draw animation, in one of three designs from the lab (`bag-draw`):
 *  - omikuji (recommended): the hexagonal omikuji box shakes and a stick slides out; the slip unfolds with the result.
 *  - fukubiki: the garagara drum of a festival raffle spins and drops a ball in the result's colour.
 *  - daruma: a daruma wobbles; its eye gets painted and the result appears written in ink.
 * The draw itself is decided elsewhere (the server, or the demo's same rules); this only shows it.
 */

export type DrawPhase = 'idle' | 'shaking' | 'reveal';
export type BagDrawVariant = 'omikuji' | 'fukubiki' | 'daruma';

export interface BagDrawStageProps {
  variant: string;
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

export function BagDrawStage({ variant, phase, results, empty, emptyText, className }: BagDrawStageProps) {
  const Scene = variant === 'fukubiki' ? Fukubiki : variant === 'daruma' ? Daruma : Omikuji;
  const first = results[0] ?? null;
  return (
    <div className={cn('relative overflow-hidden rounded-[12px] bg-sumi-900', className)}>
      <div aria-hidden className="seigaiha absolute inset-0 opacity-50" />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-sumi-950 to-transparent"
      />
      <div className="relative">
        <Scene phase={phase} result={phase === 'reveal' ? first : null} />
        <ResultPanel variant={variant} phase={phase} results={results} empty={empty} emptyText={emptyText} />
      </div>
    </div>
  );
}

interface SceneProps {
  phase: DrawPhase;
  result: DrawShown | null;
}

// ───────────── Omikuji ─────────────

function Omikuji({ phase, result }: SceneProps) {
  const reduce = useReducedMotion();
  const shaking = phase === 'shaking' && !reduce;
  return (
    <svg
      viewBox="0 0 300 210"
      className="mx-auto block h-[180px] w-full max-w-[360px] sm:h-[210px]"
      aria-hidden
    >
      {/* Ground shadow */}
      <ellipse cx="150" cy="200" rx="58" ry="6" className="fill-sumi-950" opacity="0.7" />
      <motion.g
        style={{ transformBox: 'view-box', transformOrigin: '150px 196px' }}
        animate={
          shaking
            ? { rotate: [0, -16, 13, -11, 9, -6, 4, 0], y: [0, -6, -2, -7, -1, -5, 0, 0] }
            : phase === 'reveal'
              ? { rotate: -14, y: -2 }
              : { rotate: 0, y: 0 }
        }
        transition={shaking ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } : jelly}
      >
        {/* The stick: hidden inside the box until the draw; slides out through the hole. */}
        <motion.g
          initial={false}
          animate={{ y: phase === 'reveal' ? -64 : 0 }}
          transition={phase === 'reveal' ? { ...jelly, delay: 0.18 } : snappy}
        >
          <rect x="146.5" y="78" width="7" height="96" rx="2" className="fill-kiji-300" />
          <rect
            x="146.5"
            y="78"
            width="7"
            height="16"
            rx="2"
            className={result ? TONE[result.tone].fill : 'fill-shu-500'}
          />
          <rect
            x="146.5"
            y="78"
            width="7"
            height="96"
            rx="2"
            fill="none"
            className="stroke-kiji-700"
            strokeWidth="0.8"
          />
        </motion.g>
        {/* Side faces, front face, lid with its hole. */}
        <polygon points="104,82 124,90 124,200 104,192" className="fill-kiji-700" />
        <polygon points="176,90 196,82 196,192 176,200" className="fill-kiji-400" />
        <rect x="124" y="90" width="52" height="110" className="fill-kiji-300" />
        <rect x="124" y="98" width="52" height="4" className="fill-kiji-700" opacity="0.55" />
        <rect x="124" y="188" width="52" height="4" className="fill-kiji-700" opacity="0.55" />
        <polygon points="104,82 124,72 176,72 196,82 176,90 124,90" className="fill-kiji-400" />
        <polygon
          points="104,82 124,72 176,72 196,82 176,90 124,90"
          fill="none"
          className="stroke-kiji-900"
          strokeWidth="1"
        />
        <ellipse cx="150" cy="81" rx="6.5" ry="3.4" className="fill-sumi-950" />
        {/* Paper label with 御神籤 written down it. */}
        <rect x="138" y="108" width="24" height="74" rx="1.5" className="fill-washi" />
        <rect
          x="140"
          y="110"
          width="20"
          height="70"
          rx="1"
          fill="none"
          className="stroke-shu-500"
          strokeWidth="0.8"
        />
        {[...'御神籤'].map((glyph, i) => (
          <text
            key={glyph}
            x="150"
            y={128 + i * 18}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-sumi-900 font-display"
            fontWeight={800}
            fontSize="15"
          >
            {glyph}
          </text>
        ))}
      </motion.g>
      {/* Little dust puffs while shaking. */}
      <AnimatePresence>
        {shaking &&
          [0, 1, 2].map((i) => (
            <motion.circle
              key={i}
              cx={120 + i * 30}
              cy={198}
              r={3}
              className="fill-washi-subtle"
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: [0, 0.5, 0], y: -10 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.22 }}
            />
          ))}
      </AnimatePresence>
    </svg>
  );
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

// ───────────── Daruma ─────────────

function Daruma({ phase }: SceneProps) {
  const reduce = useReducedMotion();
  const wobbling = phase === 'shaking' && !reduce;
  const painted = phase === 'reveal';
  return (
    <svg
      viewBox="0 0 300 210"
      className="mx-auto block h-[180px] w-full max-w-[360px] sm:h-[210px]"
      aria-hidden
    >
      <ellipse cx="150" cy="201" rx="54" ry="6" className="fill-sumi-950" opacity="0.7" />
      <motion.g
        style={{ transformBox: 'view-box', transformOrigin: '150px 198px' }}
        animate={
          wobbling
            ? { rotate: [0, -15, 12, -9, 6, -3, 0] }
            : painted
              ? { rotate: [0, 4, -2, 0] }
              : { rotate: 0 }
        }
        transition={wobbling ? { duration: 1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.6 }}
      >
        {/* Body */}
        <path
          d="M150 30 C 200 30 214 78 212 118 C 210 168 186 198 150 198 C 114 198 90 168 88 118 C 86 78 100 30 150 30 Z"
          className="fill-shu-500"
        />
        <path
          d="M104 150 C 120 176 180 176 196 150"
          fill="none"
          className="stroke-kin-400"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <text
          x="150"
          y="182"
          textAnchor="middle"
          className="fill-kin-300 font-display"
          fontWeight={800}
          fontSize="22"
        >
          福
        </text>
        {/* Face */}
        <ellipse cx="150" cy="96" rx="44" ry="38" className="fill-washi" />
        {/* Eyebrows (cranes) and beard (turtle) in ink */}
        <path
          d="M112 74 C 122 62 138 64 144 74"
          fill="none"
          className="stroke-sumi-950"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M156 74 C 162 64 178 62 188 74"
          fill="none"
          className="stroke-sumi-950"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M118 112 C 128 130 172 130 182 112"
          fill="none"
          className="stroke-sumi-950"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M120 116 q-9 7 -5 16 M180 116 q9 7 5 16"
          fill="none"
          className="stroke-sumi-950"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M144 104 q6 5 12 0"
          fill="none"
          className="stroke-shu-500"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        {/* Eyes: blank until the wish; the daruma's left eye (our right) gets painted. */}
        <circle cx="131" cy="90" r="11" className="fill-washi stroke-sumi-950" strokeWidth="2" />
        <circle cx="169" cy="90" r="11" className="fill-washi stroke-sumi-950" strokeWidth="2" />
        <motion.circle
          cx="169"
          cy="90"
          r="8"
          className="fill-sumi-950"
          style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}
          initial={false}
          animate={{ scale: painted ? 1 : 0, opacity: painted ? 1 : 0 }}
          transition={painted ? { ...jelly, delay: 0.35 } : { duration: 0.15 }}
        />
        <motion.path
          d="M160 86 C 164 80 176 82 177 90 C 178 99 165 101 161 95"
          fill="none"
          className="stroke-sumi-950"
          strokeWidth="3.5"
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: painted ? 1 : 0, opacity: painted ? 1 : 0 }}
          transition={painted ? { duration: 0.35, ease: easeOutExpo } : { duration: 0.1 }}
        />
      </motion.g>
    </svg>
  );
}

// ───────────── Result ─────────────

function ResultPanel({
  variant,
  phase,
  results,
  empty,
  emptyText,
}: {
  variant: string;
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
            {variant === 'omikuji' || (variant !== 'fukubiki' && variant !== 'daruma') ? (
              <motion.div
                variants={{
                  hidden: { scaleY: 0, opacity: 0 },
                  show: { scaleY: 1, opacity: 1, transition: { ...soft, delay: 0.45 } },
                }}
                style={{ originY: 0 }}
                className="relative w-full max-w-[420px] rounded-[4px] bg-washi px-5 py-3 text-center text-sumi-900 shadow-[0_12px_26px_-14px_rgb(0_0_0/0.9)]"
              >
                <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 rounded-t-[4px] bg-shu-500" />
                <span
                  aria-hidden
                  className="absolute left-3 top-1/2 grid size-8 -translate-y-1/2 rotate-[-6deg] place-items-center rounded-[4px] bg-shu-500 font-display text-[15px] font-extrabold text-washi"
                >
                  {first.glyph}
                </span>
                <p className="px-8 font-display text-[22px] font-bold leading-tight sm:text-[26px]">
                  {first.label}
                </p>
                {first.sub && <p className="mt-0.5 truncate px-8 text-[13px] text-sumi-700">{first.sub}</p>}
              </motion.div>
            ) : variant === 'fukubiki' ? (
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
            ) : (
              <motion.div
                variants={{ hidden: {}, show: { transition: { delayChildren: 0.55 } } }}
                className="w-full max-w-[420px] text-center"
              >
                <motion.p
                  variants={inkReveal}
                  className="font-display text-[26px] font-extrabold leading-tight text-washi sm:text-[30px]"
                >
                  {first.label}
                </motion.p>
                <motion.span
                  aria-hidden
                  variants={{
                    hidden: { scaleX: 0 },
                    show: { scaleX: 1, transition: { duration: 0.6, ease: easeOutExpo } },
                  }}
                  className="mx-auto mt-1 block h-[3px] w-24 origin-left rounded-full bg-shu-500"
                />
                {first.sub && <p className="mt-1 truncate text-[13px] text-washi-muted">{first.sub}</p>}
              </motion.div>
            )}
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
