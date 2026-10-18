import { motion } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { guardNav } from '@/components/AppShell';
import type { BagWithCount } from '@/data/bags';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { countLabel, KIND_COPY, MODE_COPY } from './drawRules';

/**
 * Point 30 · How the «Bolsas» page shows each group of bags. Point 40 · Furoshiki, chosen in the design lab: cloth
 * bundles hanging from a bamboo rail that sway slowly; indigo when what comes out goes back into the bag, vermilion
 * when it is taken out.
 *
 * Motion: the sway is a CSS animation of transform only (compositor), off with «reducir movimiento»; taps use the
 * `jelly` preset.
 */

export type BagCardData = Pick<BagWithCount, 'id' | 'name' | 'kind' | 'draw_mode' | 'no_repeat' | 'items'>;

export interface BagGroupProps {
  bags: BagCardData[];
  /** Where a bag opens. */
  hrefFor: (bag: BagCardData) => string;
}

function meta(bag: BagCardData): string {
  return `${countLabel(bag.kind, bag.items)} · ${MODE_COPY[bag.draw_mode].label}${
    bag.draw_mode === 'keep' && bag.no_repeat ? ' · sin repetir' : ''
  }`;
}

/** A link to the bag, with the bag's name and contents as its accessible name; a tap presses the bundle down. */
function Tile({ bag, href, className, children }: { bag: BagCardData; href: string; className?: string; children: ReactNode }) {
  return (
    <Link
      to={href}
      onClick={guardNav}
      aria-label={`${bag.name}: ${meta(bag)}`}
      className={cn(
        'group relative flex w-full rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-kin-300/70',
        className,
      )}
    >
      <motion.span whileTap={{ scale: 0.94, y: 3 }} transition={jelly} className="flex w-full flex-col items-center">
        {children}
      </motion.span>
    </Link>
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

// Keyframes for the hanging bundles: transform only, and nothing at all with reduced motion.
const SHELF_CSS = `
@keyframes bag-sway { 0%, 100% { transform: rotate(-2.4deg); } 50% { transform: rotate(2.4deg); } }
.bag-sway { transform-origin: 50% 0; animation: bag-sway var(--sway, 4.8s) ease-in-out infinite; animation-delay: var(--delay, 0s); }
@media (prefers-reduced-motion: reduce) { .bag-sway { animation: none; } }
`;

/**
 * The keyframes, once per document however many groups render: React 19 hoists a `<style>` with
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

// ───────────── Furoshiki: cloth bundles hanging from a bamboo rail ─────────────

/** The group of one kind: one bundle per bag, hanging from the rail. */
export function BagGroup({ bags, hrefFor }: BagGroupProps) {
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
            <Tile bag={bag} href={hrefFor(bag)} className="pb-1">
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
