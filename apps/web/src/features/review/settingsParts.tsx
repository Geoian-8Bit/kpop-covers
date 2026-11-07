import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import type { SaveStatus } from './reviewStageStore';

/** The review's settings, dense: small group titles, inline rows, 44 px to the finger. */

const STATUS_TEXT: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Guardando…',
  saved: 'Guardado',
  error: 'No se pudo guardar',
};

export function SaveNote({ status }: { status: SaveStatus }) {
  return (
    <span
      role="status"
      className={cn('text-[12px]', status === 'error' ? 'text-enji-300' : 'text-washi-subtle')}
    >
      {STATUS_TEXT[status]}
    </span>
  );
}

/** A group of settings under a small title (with something at its end: a save status). */
export function Group({
  title,
  aside,
  hint,
  children,
}: {
  title: string;
  aside?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1 border-t border-line pt-2">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className="font-display text-[13px] font-bold tracking-[0.04em] text-kin-200">{title}</h3>
        {aside}
      </div>
      {children}
      {hint && <p className="text-[12px] leading-snug text-washi-subtle">{hint}</p>}
    </section>
  );
}

/** A small square (or short) button: 44 px to the finger, no hexagon skin. */
export function Chip({
  label,
  onClick,
  disabled,
  pressed,
  className,
  children,
}: {
  label?: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      whileTap={reduce || disabled ? undefined : { scale: 0.9 }}
      transition={jelly}
      className={cn(
        'flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-bold transition-colors disabled:opacity-40',
        pressed ? 'bg-washi text-sumi-900' : 'well text-washi hover:text-washi',
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

/** A slider on one row: its name, the track, its value. */
export function Range({
  label,
  hideLabel,
  value,
  min,
  max,
  step,
  onChange,
  valueText,
  onCommit,
  onSlide,
}: {
  label: string;
  /** The name only for screen readers (the row around says it). */
  hideLabel?: boolean;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  valueText: string;
  /** The finger (or the key) let go. */
  onCommit?: () => void;
  /** A finger is on the slider (true) or has let go (false). */
  onSlide?: (sliding: boolean) => void;
}) {
  const end = () => {
    onCommit?.();
    onSlide?.(false);
  };
  const input = (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={hideLabel ? label : undefined}
      aria-valuetext={valueText}
      onChange={(e) => onChange(Number(e.target.value))}
      // Let go however it ends: lifted, cancelled (the sheet took it as a scroll), lost, or left with the keys.
      onPointerDown={() => onSlide?.(true)}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onKeyUp={() => onCommit?.()}
      onBlur={end}
      className="h-11 min-w-0 flex-1 accent-kin-400"
    />
  );
  if (hideLabel) return input;
  return (
    <label className="flex min-h-11 items-center gap-2">
      <span className="w-[4.75rem] shrink-0 text-[13px] text-washi-muted">{label}</span>
      {input}
      <span className="tabular w-12 shrink-0 text-right font-mono text-[12px] text-washi">{valueText}</span>
    </label>
  );
}
