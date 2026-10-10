import { motion, type HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'washi';
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children?: ReactNode;
}

// Every filled button carries an inner hairline frame (::before), like the carved border of a hanko seal.
const FRAME = 'before:pointer-events-none before:absolute before:inset-[3px] before:rounded-[7px] before:border';

const variants: Record<Variant, string> = {
  primary: `${FRAME} skin-btn [--skin-fill:var(--color-shu-500)] hover:[--skin-fill:var(--color-shu-400)] bg-shu-500 bg-[linear-gradient(180deg,rgb(255_255_255/0.14),rgb(0_0_0/0.08))] text-washi before:border-washi/45 shadow-[0_10px_22px_-12px_rgb(120_28_12/0.95)] hover:bg-shu-400`,
  washi: `${FRAME} skin-btn skin-on-light [--skin-fill:var(--color-washi)] hover:[--skin-fill:var(--color-kin-200)] bg-washi text-sumi-900 before:border-sumi-900/25 shadow-[0_10px_20px_-14px_rgb(0_0_0/0.9)] hover:bg-kin-200`,
  secondary: `${FRAME} skin-btn [--skin-fill:var(--color-sumi-800)] hover:[--skin-fill:var(--color-sumi-700)] border border-line-strong bg-sumi-800 bg-[linear-gradient(180deg,rgb(255_246_230/0.08),rgb(0_0_0/0.1))] text-washi shadow-[0_2px_6px_-2px_rgb(0_0_0/0.6)] before:border-washi/10 hover:border-washi/40 hover:bg-sumi-700`,
  ghost: 'text-washi-muted hover:bg-washi/[0.08] hover:text-washi',
  danger: `${FRAME} skin-btn [--skin-fill:var(--color-sumi-850)] border border-shu-400/70 text-shu-400 before:border-shu-400/25 hover:bg-shu-500/15`,
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px]',
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-13 px-6 text-base',
  'icon-sm': 'size-9',
  icon: 'size-11',
  'icon-lg': 'size-14',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const inert = disabled || loading;
  return (
    <motion.button
      type={type}
      whileHover={inert ? undefined : { y: -1 }}
      whileTap={inert ? undefined : { scale: 0.94, y: 0 }}
      transition={jelly}
      disabled={inert}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-bold tracking-[0.02em] transition-[background-color,border-color,color,opacity] duration-200 disabled:opacity-40',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </motion.button>
  );
}
