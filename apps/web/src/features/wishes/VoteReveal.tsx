import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';
import { Seal } from '@/components/Seal';
import { cn } from '@/lib/cn';
import { easeOutExpo, inkReveal, jelly, soft } from '@/lib/motion';
import { thumbCors } from '@/lib/thumbCors';
import './voteReveal.css';
import { trailKeyframes } from './voteTrails';

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
const REVEAL_MS = 2600;

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
        className="break-words font-display text-[24px] font-extrabold leading-tight text-washi sm:text-[28px]"
      >
        {winner.title}
      </motion.p>
      {(winner.artist || winner.score) && (
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...soft, delay: reduce ? 0 : delay + 0.35 }}
          className="mt-1 break-words text-[14px] text-washi-muted"
        >
          {[winner.artist, winner.score].filter(Boolean).join(' · ')}
        </motion.p>
      )}
    </div>
  );
}

// ───────────── Hanabi ─────────────

// REQ-22 · The paper scraps are HTML spans (`voteReveal.css`) instead of SVG rects animated by motion: a CSS animation
// of transform and opacity runs on the compositor, where 100 rects × 5 values per frame repainted the whole SVG.
const PETAL_TONES = ['bg-shu-500', 'bg-kin-400', 'bg-sakura', 'bg-ai-300', 'bg-fuji', 'bg-washi'] as const;
const BURSTS = [
  { x: 92, y: 74, tone: 0, delay: 0.15 },
  { x: 262, y: 62, tone: 1, delay: 0.55 },
  { x: 180, y: 46, tone: 2, delay: 0.95 },
  { x: 58, y: 40, tone: 3, delay: 1.3 },
  { x: 304, y: 104, tone: 4, delay: 1.55 },
];
const SKY = 'absolute inset-x-0 top-0 h-[200px] w-full';
/** The trails' bodies, sampled from both ends' curves (voteTrails.ts); built once. */
const TRAIL_KEYFRAMES = trailKeyframes(BURSTS.map((burst) => burst.y));

/**
 * Its own layer for the seal and the thumbnail while their entrance spring runs (and only then: at rest they are
 * rasterised crisp again), so they don't repaint the page under them every frame.
 */
interface Petal {
  burst: { x: number; y: number };
  dx: number;
  dy: number;
  rotate: number;
}

/**
 * REQ-22 · `@keyframes vote-petal-<i>` for each scrap: the `vote-petal` curve of `voteReveal.css` with `--u` (one
 * viewBox unit, max(width, 360) / 360 px) and the scrap's own numbers already multiplied in. Keyframes that read
 * `var()` are resolved again on every style recalc, and a running CSS animation is recalculated on every main-thread
 * frame even while the compositor moves it: with 100 scraps that was most of each frame. Same geometry, plain numbers.
 */
function petalKeyframes(petals: readonly Petal[], u: number): string {
  const at = (x: number, y: number, r: number, s: number) =>
    `transform:translate(${x * u}px,${y * u}px) rotate(${r}deg) scale(${s})`;
  return petals
    .map(({ burst: { x: bx, y: by }, dx, dy, rotate: r }, i) =>
      [
        `@keyframes vote-petal-${i}{`,
        `0%{opacity:0;${at(bx, by, 0, 0.3)}}`,
        `30%{opacity:1;${at(bx + dx, by + dy, r, 1)}}`,
        `70%{opacity:0.9;${at(bx + dx * 1.06, by + dy + 30, r * 1.6, 0.95)}}`,
        `100%{opacity:0;${at(bx + dx * 1.1, by + dy + 70, r * 2.4, 0.8)}}}`,
      ].join(''),
    )
    .join('\n');
}

function layerOn(el: HTMLElement | null) {
  if (el) el.style.willChange = 'transform';
}
function layerOff(el: HTMLElement | null) {
  if (el) el.style.willChange = '';
}

function Hanabi({ winner, reduce }: SceneProps) {
  const seal = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLImageElement>(null);
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
  // REQ-22 · The scraps' keyframes follow the sky's width as `--u` did: the observer's first call comes after layout
  // and before the first paint, and again on every resize. Until then the scraps rest at opacity 0 with no animation.
  const sky = useRef<HTMLDivElement>(null);
  const petalStyle = useRef<HTMLStyleElement>(null);
  useLayoutEffect(() => {
    const box = sky.current;
    const style = petalStyle.current;
    if (!box || !style) return;
    let width = -1;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      style.textContent = petalKeyframes(petals, Math.max(width, 360) / 360);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [petals, reduce]);
  return (
    <div className="relative min-h-[300px] bg-gradient-to-b from-ai-900 via-sumi-950 to-sumi-950">
      <svg viewBox="0 0 360 200" className={SKY} aria-hidden preserveAspectRatio="xMidYMid slice">
        {/* Stars */}
        {[...Array(18)].map((_, i) => (
          <circle
            key={i}
            cx={(i * 71) % 360}
            cy={(i * 37) % 120}
            r={i % 4 === 0 ? 1.1 : 0.6}
            className="fill-washi-subtle"
            opacity={0.5}
          />
        ))}
      </svg>
      {/* REQ-22 · Everything that moves over the sky is HTML in the viewBox's own units (`voteReveal.css`), in the old
          SVG order: the rising trails, then the scraps, then the bursts' bright cores on top. */}
      {!reduce && (
        <div ref={sky} aria-hidden className={cn(SKY, 'vote-petals')}>
          <style>{TRAIL_KEYFRAMES}</style>
          <style ref={petalStyle} />
          <div className="vote-petals-box">
            {BURSTS.map((burst, b) => (
              <span
                key={`trail-${b}`}
                className="vote-trail"
                style={
                  {
                    '--bx': burst.x,
                    '--by': burst.y,
                    animationDelay: `${burst.delay - 0.45 < 0 ? 0 : burst.delay - 0.45}s`,
                  } as CSSProperties
                }
              >
                <span
                  className="vote-trail-body bg-kin-300"
                  style={{ animationName: `vote-trail-body-${b}` }}
                />
                <span className="vote-trail-cap vote-trail-y1 bg-kin-300" />
                <span className="vote-trail-cap vote-trail-y2 bg-kin-300" />
              </span>
            ))}
            {petals.map((p, i) => (
              <span
                key={p.key}
                className={cn('vote-petal', p.tone)}
                style={{ animationName: `vote-petal-${i}`, animationDelay: `${p.burst.delay}s` }}
              />
            ))}
            {BURSTS.map((burst, b) => (
              <span
                key={`core-${b}`}
                className="vote-core bg-kin-200"
                style={
                  { '--bx': burst.x, '--by': burst.y, animationDelay: `${burst.delay}s` } as CSSProperties
                }
              />
            ))}
          </div>
        </div>
      )}
      <div className="relative flex min-h-[300px] flex-col items-center justify-end gap-3 px-5 pb-6 pt-24 text-center">
        <motion.div
          ref={seal}
          initial={reduce ? false : { scale: 1.8, rotate: -16, opacity: 0 }}
          animate={{ scale: 1, rotate: -6, opacity: 1 }}
          transition={{ ...jelly, delay: reduce ? 0 : 1.9 }}
          onAnimationStart={() => layerOn(seal.current)}
          onAnimationComplete={() => layerOff(seal.current)}
        >
          <Seal glyph="当選" size={52} />
        </motion.div>
        {winner.thumbnail && (
          <motion.img
            ref={thumb}
            src={winner.thumbnail}
            crossOrigin={thumbCors(winner.thumbnail)}
            alt=""
            initial={reduce ? false : { opacity: 0, y: -40, rotate: -4 }}
            animate={{ opacity: 1, y: 0, rotate: -1.5 }}
            transition={{ ...soft, delay: reduce ? 0 : 1.75 }}
            onAnimationStart={() => layerOn(thumb.current)}
            onAnimationComplete={() => layerOff(thumb.current)}
            className="aspect-video w-36 rounded-[8px] object-cover shadow-[0_10px_24px_-10px_rgb(0_0_0/0.9)] ring-2 ring-washi/80"
          />
        )}
        <WinnerText winner={winner} reduce={reduce} delay={reduce ? 0 : 2} />
      </div>
    </div>
  );
}
