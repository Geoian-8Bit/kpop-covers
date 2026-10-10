import { AnimatePresence, motion } from 'motion/react';
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  trailing?: ReactNode;
}

export function Field({ label, hint, error, trailing, className, id, ...input }: FieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = `${fieldId}-hint`;

  return (
    <div className={cn('block', className)}>
      <label htmlFor={fieldId} className="mb-1.5 block text-[13px] font-medium text-washi-muted">
        {label}
      </label>
      <div className="relative">
        <input
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? hintId : undefined}
          className={cn(
            'h-12 w-full rounded-[10px] border border-line bg-sumi-950/55 px-4 text-[15px] text-washi outline-none transition-[border-color,background-color,box-shadow] duration-200',
            'focus:border-kin-300/60 focus:bg-sumi-950/80 focus:shadow-[0_0_0_3px_rgb(228_200_143/0.14)]',
            error && 'border-enji-400/80',
            trailing && 'pr-12',
          )}
          {...input}
        />
        {trailing && <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>}
      </div>
      <AnimatePresence initial={false} mode="wait">
        {(error || hint) && (
          <motion.p
            key={error ? 'error' : 'hint'}
            id={hintId}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            className={cn('mt-1.5 text-[13px] leading-snug', error ? 'text-enji-300' : 'text-washi-subtle')}
            role={error ? 'alert' : undefined}
          >
            {error ?? hint}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
