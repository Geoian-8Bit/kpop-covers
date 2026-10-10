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

const variants: Record<Variant, string> = {
  primary:
    'bg-enji-500 text-washi shadow-[0_10px_20px_-12px_rgb(110_29_43/0.95)] hover:bg-enji-400 active:bg-enji-600',
  washi: 'bg-washi text-sumi-900 shadow-[0_10px_20px_-14px_rgb(0_0_0/0.9)] hover:bg-kin-200',
  secondary: 'border border-line bg-sumi-800 text-washi hover:border-line-strong hover:bg-sumi-700',
  ghost: 'text-washi-muted hover:bg-washi/[0.06] hover:text-washi',
  danger: 'border border-enji-500/60 text-enji-300 hover:bg-enji-600/25',
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
        'relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-medium tracking-[0.01em] transition-[background-color,border-color,color,opacity] duration-200 disabled:opacity-40',
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
