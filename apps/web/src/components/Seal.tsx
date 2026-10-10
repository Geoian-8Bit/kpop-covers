import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';

interface SealProps {
  /** One or two CJK characters carved into the seal. */
  glyph: string;
  size?: number;
  tone?: 'shu' | 'enji';
  /** Animate like a stamp being pressed onto paper. */
  stamp?: boolean;
  className?: string;
  title?: string;
}

const fills = { shu: '#d0452d', enji: '#b23a48' } as const;

/** Hanko (判子) seal: vermilion ink square with a carved glyph and a slightly uneven ink edge. */
export function Seal({ glyph, size = 40, tone = 'shu', stamp = false, className, title }: SealProps) {
  const two = glyph.length > 1;
  return (
    <motion.svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn('shrink-0', className)}
      initial={stamp ? { scale: 1.7, rotate: -14, opacity: 0 } : false}
      animate={{ scale: 1, rotate: -4, opacity: 1 }}
      transition={jelly}
    >
      <g filter="url(#ink-rough)">
        <rect x="1.5" y="1.5" width="37" height="37" rx="4" fill={fills[tone]} />
        <rect x="4.5" y="4.5" width="31" height="31" rx="2" fill="none" stroke="#efe6d4" strokeOpacity="0.85" strokeWidth="1.2" />
        <text
          x="20"
          y={two ? 19 : 21}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="'Shippori Mincho B1', serif"
          fontWeight="800"
          fontSize={two ? 13 : 22}
          fill="#efe6d4"
          style={two ? { writingMode: 'vertical-rl' } : undefined}
        >
          {glyph}
        </text>
      </g>
    </motion.svg>
  );
}
