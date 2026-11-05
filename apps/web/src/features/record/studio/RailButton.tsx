import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';

export function RailButton({
  label,
  ariaLabel,
  pressed,
  expanded,
  muted,
  tone = 'dark',
  onClick,
  onPointerDown,
  children,
}: {
  label: string;
  ariaLabel?: string;
  pressed?: boolean;
  /** For a button that opens a panel. */
  expanded?: boolean;
  /** Shown but not available right now (its tap explains why). */
  muted?: boolean;
  /** The take's main action (finish): a washi disc instead of a smoked one. */
  tone?: 'dark' | 'light';
  onClick: () => void;
  /** REQ-23 · Fetches what the tap will open (a lazy panel) as the finger lands. */
  onPointerDown?: () => void;
  children: ReactNode;
}) {
  return (
    <motion.button
      type="button"
      aria-label={ariaLabel ?? label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-disabled={muted || undefined}
      onClick={onClick}
      onPointerDown={onPointerDown}
      style={muted ? { opacity: 0.45 } : undefined}
      whileTap={{ scale: 0.86 }}
      transition={jelly}
      className="flex w-14 flex-col items-center gap-1"
    >
      <span
        className={cn(
          'grid size-11 place-items-center rounded-full',
          tone === 'light'
            ? 'bg-washi text-sumi-900 shadow-[0_8px_18px_-8px_rgb(0_0_0/0.9)]'
            : pressed || expanded
              ? 'bg-kin-300 text-sumi-900'
              : 'bg-black/45',
        )}
      >
        {children}
      </span>
      <span className="tabular text-[11px] font-bold leading-none text-washi [text-shadow:0_1px_4px_rgb(0_0_0/0.8)]">
        {label}
      </span>
    </motion.button>
  );
}
