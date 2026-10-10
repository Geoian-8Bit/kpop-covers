import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  ariaLabel?: string;
}

interface SegmentedProps<T extends string | number> {
  options: readonly SegmentedOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Unique per instance so the paper tab animates within its own group. */
  layoutId: string;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Radio group: a washi-paper tab springs between options. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  layoutId,
  label,
  size = 'md',
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('well relative inline-flex items-center gap-0.5 rounded-[12px] p-1', className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <motion.button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.ariaLabel}
            onClick={() => onChange(option.value)}
            whileTap={{ scale: 0.88 }}
            transition={jelly}
            className={cn(
              'relative isolate shrink-0 rounded-[8px] font-medium transition-colors duration-200',
              size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-4 text-sm',
              active ? 'font-bold text-sumi-900' : 'text-washi-muted hover:text-washi',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={jelly}
                className="absolute inset-0 -z-10 rounded-[8px] bg-washi shadow-[inset_0_0_0_2px_var(--color-washi),inset_0_0_0_3px_rgb(27_25_22/0.2),0_4px_10px_-4px_rgb(0_0_0/0.8)]"
              />
            )}
            <span className="tabular relative">{option.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
