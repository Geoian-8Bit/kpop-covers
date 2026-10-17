import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { guardNav } from '@/components/AppShell';
import type { BagWithCount } from '@/data/bags';
import { cn } from '@/lib/cn';
import { fadeUpCapped, jelly } from '@/lib/motion';
import { countLabel, KIND_COPY, MODE_COPY } from './drawRules';

/**
 * Point 30 · How the «Bolsas» page shows each group of bags. Four ways on trial in the design lab (moment
 * `bags-list`): the plain list it had, furoshiki bundles hanging from a bamboo rail, omikuji boxes on a shelf, and
 * paper lanterns with the bag's name. The page uses the one chosen on this device; the lab's demos render these
 * same components with sample bags (no links).
 *
 * Motion: the sway and the glow are CSS animations of transform / opacity only (compositor), off with «reducir
 * movimiento»; taps use the `jelly` preset.
 */
export type BagsListVariant = 'lista' | 'furoshiki' | 'omikuji' | 'chochin';
export const BAGS_LIST_VARIANTS: readonly BagsListVariant[] = ['lista', 'furoshiki', 'omikuji', 'chochin'];

export type BagCardData = Pick<BagWithCount, 'id' | 'name' | 'kind' | 'draw_mode' | 'no_repeat' | 'items'>;

export interface BagGroupProps {
  bags: BagCardData[];
  /** Where a bag opens. Without it (the lab's demos) a tap calls `onPick` instead. */
  hrefFor?: (bag: BagCardData) => string;
  onPick?: (bag: BagCardData) => void;
}

const cardIn = fadeUpCapped(0.05, 8);

function meta(bag: BagCardData): string {
  return `${countLabel(bag.kind, bag.items)} · ${MODE_COPY[bag.draw_mode].label}${
    bag.draw_mode === 'keep' && bag.no_repeat ? ' · sin repetir' : ''
  }`;
}

/** A link to the bag (or a button in the demos), with the bag's name and contents as its accessible name. */
function Tile({
  bag,
  hrefFor,
  onPick,
  className,
  children,
  press = { scale: 0.96 },
}: Omit<BagGroupProps, 'bags'> & {
  bag: BagCardData;
  className?: string;
  children: ReactNode;
  press?: { scale?: number; rotate?: number; y?: number };
}) {
  const label = `${bag.name}: ${meta(bag)}`;
  const inner = (
    <motion.span whileTap={press} transition={jelly} className="flex w-full flex-col items-center">
      {children}
    </motion.span>
  );
  const cls = cn(
    'group relative flex w-full rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-kin-300/70',
    className,
  );
  return hrefFor ? (
    <Link to={hrefFor(bag)} onClick={guardNav} aria-label={label} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" aria-label={label} onClick={() => onPick?.(bag)} className={cn(cls, 'text-left')}>
      {inner}
    </button>
  );
}

function Name({ bag, className }: { bag: BagCardData; className?: string }) {
  return (
    <>
      <span
        className={cn(
          'line-clamp-2 break-words px-1.5 text-center font-display text-[16px] font-bold leading-tight text-washi',
          className,
        )}
      >
        {bag.name}
      </span>
      <span className="mt-0.5 line-clamp-2 px-1.5 text-center text-[12px] leading-snug text-washi-subtle">
        {meta(bag)}
      </span>
    </>
  );
}

/** The group of one kind, drawn the chosen way. */
export function BagGroup({ variant, ...props }: BagGroupProps & { variant: BagsListVariant }) {
  switch (variant) {
    case 'furoshiki':
      return <FuroshikiRail {...props} />;
    case 'omikuji':
      return <OmikujiShelf {...props} />;
    case 'chochin':
      return <ChochinRow {...props} />;
    default:
      return <PlainList {...props} />;
  }
}

// Keyframes for the hanging things: transform / opacity only, and nothing at all with reduced motion.
const SHELF_CSS = `
@keyframes bag-sway { 0%, 100% { transform: rotate(-2.4deg); } 50% { transform: rotate(2.4deg); } }
@keyframes bag-glow { 0%, 100% { opacity: 0.45; } 50% { opacity: 0.85; } }
.bag-sway { transform-origin: 50% 0; animation: bag-sway var(--sway, 4.8s) ease-in-out infinite; animation-delay: var(--delay, 0s); }
.bag-glow { animation: bag-glow var(--sway, 3.6s) ease-in-out infinite; animation-delay: var(--delay, 0s); }
@media (prefers-reduced-motion: reduce) { .bag-sway, .bag-glow { animation: none; } }
`;

/**
 * The keyframes, once per document however many groups (or lab demos) render: React 19 hoists a `<style>` with
 * `href` + `precedence` into <head> and keeps a single copy per href.
 */
function ShelfStyles() {
  return (
    <style href="bag-shelf-keyframes" precedence="default">
      {SHELF_CSS}
    </style>
  );
}

/** Each item its own rhythm, so a row never swings in step. */
function rhythm(index: number, base: number): CSSProperties {
  return { '--sway': `${base + (index % 3) * 0.7}s`, '--delay': `${-(index * 1.3) % 4}s` } as CSSProperties;
}

// ───────────── Lista (the first design) ─────────────

function PlainList({ bags, hrefFor, onPick }: BagGroupProps) {
  return (
    <motion.ul initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2">
      {bags.map((bag, i) => {
        const body = (
          <>
            <span
              aria-hidden
              className={cn(
                'grid size-12 shrink-0 rotate-[-4deg] place-items-center rounded-[8px] font-display text-[22px] font-extrabold shadow-[inset_0_0_0_2px_rgb(243_236_223/0.35)] transition-transform group-hover:rotate-0',
                bag.draw_mode === 'remove' ? 'bg-shu-500 text-washi' : 'bg-ai-600 text-washi',
              )}
            >
              {KIND_COPY[bag.kind].glyph}
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate font-display text-[18px] font-bold text-washi">{bag.name}</span>
              <span className="mt-0.5 block truncate text-[13px] text-washi-muted">{meta(bag)}</span>
            </span>
            <ChevronRight
              aria-hidden
              className="size-5 shrink-0 text-washi-subtle transition-transform group-hover:translate-x-0.5"
            />
          </>
        );
        const cls =
          'group flex min-h-[88px] w-full items-center gap-4 rounded-[12px] border border-line bg-sumi-900/60 px-4 py-3 transition-colors hover:border-line-strong hover:bg-washi/[0.04] active:scale-[0.99]';
        return (
          <motion.li key={bag.id} variants={cardIn} custom={i}>
            {hrefFor ? (
              <Link to={hrefFor(bag)} onClick={guardNav} className={cls}>
                {body}
              </Link>
            ) : (
              <button type="button" onClick={() => onPick?.(bag)} className={cls}>
                {body}
              </button>
            )}
          </motion.li>
        );
      })}
    </motion.ul>
  );
}

// ───────────── Furoshiki: cloth bundles hanging from a bamboo rail ─────────────

function FuroshikiRail({ bags, hrefFor, onPick }: BagGroupProps) {
  return (
    <>
      <ShelfStyles />
      <ul className="grid grid-cols-2 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
        {bags.map((bag, i) => (
          <li key={bag.id} className="relative pt-1">
            {/* The rail: one piece per cell, so a row reads as one bamboo pole. */}
            <span
              aria-hidden
              className="absolute inset-x-0 top-1 h-[6px] border-y border-kiji-700 bg-kiji-400"
            />
            <span
              aria-hidden
              className="absolute left-1/2 top-[3px] h-[10px] w-[3px] -translate-x-1/2 rounded-full bg-kiji-700"
            />
            <Tile bag={bag} hrefFor={hrefFor} onPick={onPick} press={{ scale: 0.94, y: 3 }} className="pb-1">
              <span aria-hidden className="bag-sway block" style={rhythm(i, 4.6)}>
                <FuroshikiBundle bag={bag} />
              </span>
              <Name bag={bag} className="mt-1" />
            </Tile>
          </li>
        ))}
      </ul>
    </>
  );
}

function FuroshikiBundle({ bag }: { bag: BagCardData }) {
  const remove = bag.draw_mode === 'remove';
  return (
    <svg viewBox="0 0 100 100" className="block h-[104px] w-[104px]">
      {/* Cord down from the rail */}
      <path d="M50 0 V16" className="stroke-kiji-700" strokeWidth="2.5" />
      {/* Knot ears */}
      <path
        d="M44 30 C36 24 33 14 38 8 C45 10 50 18 50 26 Z"
        className={remove ? 'fill-shu-600' : 'fill-ai-500'}
      />
      <path
        d="M56 30 C64 24 67 14 62 8 C55 10 50 18 50 26 Z"
        className={remove ? 'fill-shu-600' : 'fill-ai-500'}
      />
      {/* Body */}
      <path
        d="M14 52 C14 38 24 29 38 29 H62 C76 29 86 38 86 52 V70 C86 84 76 94 62 94 H38 C24 94 14 84 14 70 Z"
        className={remove ? 'fill-shu-700' : 'fill-ai-600'}
      />
      {/* Folds and a seigaiha hint */}
      <path
        d="M22 50 L50 66 L78 50"
        fill="none"
        className="stroke-washi"
        strokeOpacity="0.28"
        strokeWidth="1.5"
      />
      <path
        d="M26 82 a8 8 0 0 1 16 0 a8 8 0 0 1 16 0 a8 8 0 0 1 16 0"
        fill="none"
        className="stroke-washi"
        strokeOpacity="0.16"
        strokeWidth="1.5"
      />
      {/* The knot */}
      <ellipse cx="50" cy="29" rx="7" ry="5.5" className={remove ? 'fill-shu-500' : 'fill-ai-400'} />
      <text
        x="50"
        y="76"
        textAnchor="middle"
        className="fill-washi font-display"
        fontWeight={800}
        fontSize="20"
      >
        {KIND_COPY[bag.kind].glyph}
      </text>
    </svg>
  );
}

// ───────────── Omikuji: hexagonal fortune boxes on a wooden shelf ─────────────

function OmikujiShelf({ bags, hrefFor, onPick }: BagGroupProps) {
  return (
    <ul className="grid grid-cols-2 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
      {bags.map((bag) => (
        <li key={bag.id} className="relative">
          <Tile bag={bag} hrefFor={hrefFor} onPick={onPick} press={{ rotate: -6, scale: 0.97 }}>
            <OmikujiBox bag={bag} />
            {/* The shelf: one plank per cell, so a row reads as one board. */}
            <span aria-hidden className="block h-[8px] w-full border-t-2 border-kiji-300 bg-kiji-700" />
            <span aria-hidden className="mb-2 block h-[4px] w-full bg-sumi-950/60" />
            <Name bag={bag} />
          </Tile>
        </li>
      ))}
    </ul>
  );
}

function OmikujiBox({ bag }: { bag: BagCardData }) {
  const remove = bag.draw_mode === 'remove';
  return (
    <svg viewBox="0 0 100 112" aria-hidden className="block h-[108px] w-[96px]">
      {/* The stick that comes out */}
      <path d="M54 4 L60 30" className="stroke-kin-200" strokeWidth="4" strokeLinecap="round" />
      <path d="M53 4 l2.4 9" className="stroke-shu-500" strokeWidth="4" strokeLinecap="round" />
      {/* Top face */}
      <polygon points="28,30 72,30 84,40 72,50 28,50 16,40" className="fill-kiji-300" />
      <ellipse cx="50" cy="40" rx="6" ry="3" className="fill-kiji-900" />
      {/* Front faces */}
      <polygon points="16,40 28,50 28,108 16,98" className="fill-kiji-700" />
      <polygon points="28,50 72,50 72,108 28,108" className="fill-kiji-400" />
      <polygon points="72,50 84,40 84,98 72,108" className="fill-kiji-700" />
      {/* Paper label with the kind, and a vermilion band on bags that take out what comes out */}
      <rect x="38" y="58" width="24" height="42" rx="1.5" className="fill-washi" />
      {remove && <rect x="38" y="58" width="24" height="7" className="fill-shu-500" />}
      <text
        x="50"
        y="89"
        textAnchor="middle"
        className="fill-sumi-900 font-display"
        fontWeight={800}
        fontSize="17"
      >
        {KIND_COPY[bag.kind].glyph}
      </text>
    </svg>
  );
}

// ───────────── Chōchin: paper lanterns with the bag's name ─────────────

/** The bamboo ribs of the lantern: [y, left edge] (the paper is round, so they shorten away from the middle). */
const LANTERN_RIBS: readonly (readonly [number, number])[] = [
  [38, 17],
  [54, 9],
  [70, 7],
  [86, 9],
  [102, 17],
];

function ChochinRow({ bags, hrefFor, onPick }: BagGroupProps) {
  return (
    <>
      <ShelfStyles />
      <ul className="grid grid-cols-2 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
        {bags.map((bag, i) => {
          const red = bag.draw_mode === 'remove';
          return (
            <li key={bag.id} className="relative pt-1">
              {/* The festival cord across the row */}
              <span aria-hidden className="absolute inset-x-0 top-2 h-px bg-washi-subtle/50" />
              <Tile bag={bag} hrefFor={hrefFor} onPick={onPick} press={{ scale: 0.95 }}>
                <span aria-hidden className="bag-sway relative block" style={rhythm(i, 5.2)}>
                  {/* Glow behind the paper: a radial gradient (no blur filter to paint on slow phones). */}
                  <span
                    className={cn(
                      'bag-glow absolute left-1/2 top-[44%] size-[160px] -translate-x-1/2 -translate-y-1/2 bg-radial from-25% to-transparent to-70%',
                      red ? 'from-shu-500/45' : 'from-kin-300/35',
                    )}
                    style={rhythm(i, 3.4)}
                  />
                  <svg viewBox="0 0 100 140" className="relative block h-[150px] w-[108px]">
                    <path d="M50 0 V12" className="stroke-washi-subtle" strokeWidth="1.5" />
                    <rect x="34" y="12" width="32" height="10" rx="2" className="fill-sumi-950" />
                    <rect x="34" y="12" width="32" height="2.5" className="fill-kin-400" />
                    <path
                      d="M36 22 C10 30 6 54 6 70 C6 88 12 110 36 118 H64 C88 110 94 88 94 70 C94 54 90 30 64 22 Z"
                      className={red ? 'fill-shu-600' : 'fill-washi'}
                    />
                    {LANTERN_RIBS.map(([y, x]) => (
                      <path
                        key={y}
                        d={`M${x} ${y} H${100 - x}`}
                        className={red ? 'stroke-enji-700' : 'stroke-sumi-900'}
                        strokeOpacity={red ? 0.45 : 0.14}
                        strokeWidth="1.2"
                      />
                    ))}
                    <rect x="34" y="118" width="32" height="9" rx="2" className="fill-sumi-950" />
                    <path d="M50 127 V139" className="stroke-shu-500" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  {/* The name, written on the paper */}
                  <span className="absolute inset-x-[16px] top-[38px] grid h-[74px] place-items-center">
                    <span
                      className={cn(
                        'line-clamp-3 break-words text-center font-display text-[14px] font-extrabold leading-tight',
                        red ? 'text-washi' : 'text-sumi-900',
                      )}
                    >
                      {bag.name}
                    </span>
                  </span>
                </span>
                <span className="mt-1 line-clamp-2 px-1.5 text-center text-[12px] leading-snug text-washi-subtle">
                  {KIND_COPY[bag.kind].label} · {meta(bag)}
                </span>
              </Tile>
            </li>
          );
        })}
      </ul>
    </>
  );
}
