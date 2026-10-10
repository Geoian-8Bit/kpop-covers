import { formatSpeed, formatTime, type ClipColor } from '@coverscape/shared';
import { motion } from 'motion/react';
import { FlipHorizontal2 } from 'lucide-react';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Segmented } from '@/components/ui/Segmented';
import type { ClipWithVideo } from '@/data/clips';
import { cn } from '@/lib/cn';
import { fadeUp, jelly, stagger } from '@/lib/motion';

export type QuickStyle = 'ema' | 'hanko' | 'noren';

const STYLE_KEY = 'coverscape.quickStyle';
const STYLES: { value: QuickStyle; label: string }[] = [
  { value: 'ema', label: 'Ema' },
  { value: 'hanko', label: 'Hanko' },
  { value: 'noren', label: 'Noren' },
];

/** Clip colour as a CSS custom property, usable in SVG fills. */
const TINT: Record<ClipColor, string> = {
  wine: 'var(--color-enji-500)',
  plum: 'var(--color-murasaki)',
  orchid: 'var(--color-fuji)',
  rose: 'var(--color-sakura)',
  gold: 'var(--color-kin-400)',
  teal: 'var(--color-rokusho)',
};

function readStyle(): QuickStyle {
  try {
    const saved = localStorage.getItem(STYLE_KEY);
    if (saved === 'ema' || saved === 'hanko' || saved === 'noren') return saved;
  } catch {
    /* storage blocked: fall back to the default */
  }
  return 'ema';
}

/** Per-device choice of how quick-access clips are drawn. */
export function useQuickStyle() {
  const [style, setStyle] = useState<QuickStyle>(readStyle);
  const choose = (next: QuickStyle) => {
    setStyle(next);
    try {
      localStorage.setItem(STYLE_KEY, next);
    } catch {
      /* not persisted, still applied for this visit */
    }
  };
  return [style, choose] as const;
}

export function QuickStylePicker({ value, onChange }: { value: QuickStyle; onChange: (s: QuickStyle) => void }) {
  return (
    <Segmented
      label="Estilo del acceso rápido"
      layoutId="quick-style"
      size="sm"
      value={value}
      onChange={onChange}
      options={STYLES}
    />
  );
}

/** Two letters for the seal: initials of the first two words, or the first two letters. */
export function sealLetters(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const raw = words.length >= 2 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2);
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/** Shared SVG filters: wood grain, rough seal ink, washi fibres. Rendered once per list. */
function TextureDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
      <defs>
        <filter id="os-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018 0.55" numOctaves="3" seed="4" />
          <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.22  0 0 0 0 0.1  0 0 0 0.55 0" />
          <feComposite in2="SourceGraphic" operator="in" />
          <feBlend in2="SourceGraphic" mode="multiply" />
        </filter>
        <filter id="os-ink">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" />
          <feComponentTransfer>
            <feFuncA type="discrete" tableValues="0 1 1 1 1 1 0.85 1" />
          </feComponentTransfer>
        </filter>
        <filter id="os-paper" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="2" />
          <feColorMatrix values="0 0 0 0 0.6  0 0 0 0 0.55  0 0 0 0 0.45  0 0 0 0.2 0" />
          <feComposite in2="SourceGraphic" operator="in" />
          <feBlend in2="SourceGraphic" mode="multiply" />
        </filter>
      </defs>
    </svg>
  );
}

/** Time range on one line, speed (and mirror) as a small chip on the next. */
function ClipMeta({ clip, className, chip }: { clip: ClipWithVideo; className?: string; chip: string }) {
  return (
    <span className={cn('tabular flex flex-col items-center gap-1 whitespace-nowrap font-mono text-[10.5px]', className)}>
      <span>
        {formatTime(clip.start_seconds)}–{formatTime(clip.end_seconds)}
      </span>
      <span className={cn('flex items-center gap-1 rounded-[4px] px-1.5 py-px', chip)}>
        {formatSpeed(clip.speed)}
        {clip.mirrored && <FlipHorizontal2 className="size-3" aria-label="espejo" />}
      </span>
    </span>
  );
}

function clipLabel(clip: ClipWithVideo) {
  return `${clip.name}${clip.video?.title ? ` · ${clip.video.title}` : ''}${clip.is_pinned ? ' · fijado' : ''}`;
}

/* ───────────── 1 · Ema: wooden votive plaques hanging from a rail ───────────── */

function Ema({ clip, index }: { clip: ClipWithVideo; index: number }) {
  return (
    <motion.div
      whileHover={{ rotate: [0, -3, 2, 0], transition: { duration: 0.7 } }}
      whileTap={{ scale: 0.94 }}
      transition={jelly}
      style={{ transformOrigin: '66px 0px' }}
      className="relative h-[184px] w-[132px]"
    >
      <div
        className="absolute inset-0 origin-top motion-safe:animate-sway"
        style={{ animationDelay: `${-index * 0.9}s` }}
      >
        <svg viewBox="0 0 132 184" className="absolute inset-0 size-full" aria-hidden>
          <path d="M66 2 L46 38 M66 2 L86 38" stroke={TINT[clip.color]} strokeWidth="2.2" fill="none" />
          <circle cx="66" cy="3" r="3.2" style={{ fill: `color-mix(in oklab, ${TINT[clip.color]} 55%, black)` }} />
          <path
            d="M66 22 L126 46 V176 Q126 182 120 182 H12 Q6 182 6 176 V46 Z"
            fill="var(--color-kiji-300)"
            filter="url(#os-grain)"
          />
          <path
            d="M66 22 L126 46 V176 Q126 182 120 182 H12 Q6 182 6 176 V46 Z"
            fill="none"
            stroke="var(--color-kiji-900)"
            strokeOpacity="0.5"
            strokeWidth="2"
          />
          <path d="M66 30 L119 51 V174 H13 V51 Z" fill="none" stroke="var(--color-kiji-900)" strokeOpacity="0.2" />
          <circle cx="46" cy="38" r="2.6" fill="var(--color-sumi-800)" />
          <circle cx="86" cy="38" r="2.6" fill="var(--color-sumi-800)" />
          {clip.is_pinned && (
            <g transform="translate(108 164) rotate(-8)" filter="url(#os-ink)">
              <rect x="-9" y="-9" width="18" height="18" rx="2" fill="var(--color-shu-500)" />
            </g>
          )}
        </svg>
        <div className="absolute inset-x-3 top-[58px] flex flex-col items-center text-center text-kiji-900">
          <span className="line-clamp-2 font-display text-[17px] font-extrabold leading-[1.15]">{clip.name}</span>
          <span className="mt-1 line-clamp-1 max-w-full text-[10.5px] font-medium opacity-70">{clip.video?.title}</span>
          <ClipMeta clip={clip} className="mt-2 text-kiji-900/80" chip="bg-sumi-800 text-washi" />
        </div>
      </div>
    </motion.div>
  );
}

/* ───────────── 3 · Hanko: vermilion seal impressions on washi ───────────── */

function Hanko({ clip }: { clip: ClipWithVideo }) {
  const letters = sealLetters(clip.name);
  return (
    <motion.div
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.9, rotate: -3 }}
      transition={jelly}
      className="relative flex h-[200px] w-[132px] flex-col items-center overflow-hidden rounded-[8px] bg-washi px-2.5 pb-3 pt-3.5 text-sumi-900 shadow-[0_14px_24px_-16px_rgb(0_0_0/0.95)]"
    >
      <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
        <rect width="100%" height="100%" fill="var(--color-washi)" filter="url(#os-paper)" />
      </svg>
      <svg viewBox="-46 -46 92 92" className="relative size-[78px] shrink-0" aria-hidden>
        <g transform={clip.is_pinned ? 'rotate(5)' : 'rotate(-7)'} filter="url(#os-ink)">
          {clip.is_pinned ? (
            <>
              <rect x="-38" y="-38" width="76" height="76" rx="7" fill="var(--color-shu-500)" />
              <rect x="-31" y="-31" width="62" height="62" rx="4" fill="none" stroke="var(--color-washi)" strokeWidth="1.5" />
            </>
          ) : (
            <>
              <circle r="40" fill="none" stroke="var(--color-shu-500)" strokeWidth="5" />
              <circle r="33" fill="none" stroke="var(--color-shu-500)" strokeWidth="1.5" />
            </>
          )}
          <text
            y="13"
            textAnchor="middle"
            fontFamily="var(--font-display)"
            fontSize="36"
            fontWeight="800"
            fill={clip.is_pinned ? 'var(--color-washi)' : 'var(--color-shu-500)'}
          >
            {letters}
          </text>
        </g>
      </svg>
      <span className="relative mt-2 line-clamp-2 shrink-0 text-center font-display text-[15px] font-extrabold leading-[1.2]">
        {clip.name}
      </span>
      <span className="relative mt-auto line-clamp-1 max-w-full pt-1 text-[10.5px] text-sumi-600">{clip.video?.title}</span>
      <ClipMeta clip={clip} className="relative mt-1 text-sumi-600" chip="bg-sumi-900 text-washi" />
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-1" style={{ background: TINT[clip.color] }} />
    </motion.div>
  );
}

/* ───────────── 6 · Noren: dyed split curtains on a rod ───────────── */

function Noren({ clip, index }: { clip: ClipWithVideo; index: number }) {
  const cloth: CSSProperties = { fill: `color-mix(in oklab, ${TINT[clip.color]} 58%, var(--color-sumi-950))` };
  const half = (side: -1 | 1) => ({
    rest: { x: 0, rotate: 0 },
    open: { x: side * 5, rotate: side * 2.5 },
  });
  return (
    <motion.div initial="rest" whileHover="open" whileTap={{ scale: 0.95 }} className="relative h-[184px] w-[150px]">
      <div
        className="absolute inset-0 origin-top motion-safe:animate-sway"
        style={{ animationDelay: `${-index * 1.1}s`, animationDuration: '4.4s' }}
      >
        <svg viewBox="0 0 150 184" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          <motion.g variants={half(-1)} transition={jelly} style={{ transformOrigin: '38px 8px' }}>
            <path d="M4 8 H74 V170 Q39 180 4 170 Z" style={cloth} filter="url(#os-paper)" />
            <path d="M4 163 q11 -8 23 0 q11 -8 23 0 q11 -8 24 0" stroke="var(--color-washi)" strokeOpacity="0.3" strokeWidth="1.5" fill="none" />
          </motion.g>
          <motion.g variants={half(1)} transition={jelly} style={{ transformOrigin: '112px 8px' }}>
            <path d="M76 8 H146 V170 Q111 180 76 170 Z" style={cloth} filter="url(#os-paper)" />
            <path d="M76 163 q11 -8 23 0 q11 -8 23 0 q11 -8 24 0" stroke="var(--color-washi)" strokeOpacity="0.3" strokeWidth="1.5" fill="none" />
          </motion.g>
          <rect x="0" y="2" width="150" height="8" rx="4" fill="var(--color-kiji-700)" />
          <g transform="translate(75 46)" filter="url(#os-ink)">
            {clip.is_pinned ? (
              <circle r="14" fill="var(--color-washi)" />
            ) : (
              <circle r="14" fill="none" stroke="var(--color-washi)" strokeWidth="2" />
            )}
          </g>
        </svg>
        <div className="absolute inset-x-3 top-[68px] flex flex-col items-center text-center text-washi">
          <span className="line-clamp-2 font-display text-[16px] font-extrabold leading-[1.15] [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]">
            {clip.name}
          </span>
          <span className="mt-1 line-clamp-1 max-w-full text-[10.5px] text-washi/70">{clip.video?.title}</span>
          <ClipMeta clip={clip} className="mt-1.5 text-washi/85" chip="bg-sumi-950/60 text-washi" />
        </div>
      </div>
    </motion.div>
  );
}

function Rail({ style, children }: { style: QuickStyle; children: ReactNode }) {
  if (style !== 'ema') return <>{children}</>;
  return (
    <div className="relative">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-2 rounded-full bg-kiji-700 shadow-[0_3px_6px_-2px_rgb(0_0_0/0.7)]"
      />
      {children}
    </div>
  );
}

/**
 * Quick access: pinned clips first, then recent ones. One tap opens the studio already looping the clip.
 * Drawn as ema plaques, hanko seals or noren curtains depending on the chosen style.
 */
export function PinnedClips({ clips, style }: { clips: ClipWithVideo[]; style: QuickStyle }) {
  if (clips.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-washi-muted">
        Aquí aparecerán los clips fijados y los más recientes. Marca un tramo en el estudio y pulsa{' '}
        <span className="font-mono text-washi">S</span>.
      </p>
    );
  }

  return (
    <Rail style={style}>
      <TextureDefs />
      <motion.ul
        key={style}
        variants={stagger(0.04)}
        initial="hidden"
        animate="show"
        className={cn(
          'scrollbar-none -mx-1 flex snap-x overflow-x-auto px-1 pb-2',
          style === 'ema' ? 'gap-4 pt-0.5' : style === 'noren' ? 'gap-2.5 pt-1' : 'gap-3 pt-1',
        )}
      >
        {clips.map((clip, i) => (
          <motion.li key={clip.id} variants={fadeUp} className="shrink-0 snap-start">
            <Link
              to={`/v/${clip.video_id}?clip=${clip.id}`}
              aria-label={clipLabel(clip)}
              title={clipLabel(clip)}
              className="block rounded-[10px]"
            >
              {style === 'ema' ? (
                <Ema clip={clip} index={i} />
              ) : style === 'hanko' ? (
                <Hanko clip={clip} />
              ) : (
                <Noren clip={clip} index={i} />
              )}
            </Link>
          </motion.li>
        ))}
      </motion.ul>
    </Rail>
  );
}
