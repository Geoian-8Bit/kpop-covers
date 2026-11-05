import { cn } from '@/lib/cn';

/** REQ-05 · Someone else changed the calendar since this device last looked. */
export function UnseenDot({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('inline-block size-2.5 shrink-0 rounded-full bg-shu-400 ring-2 ring-sumi-950', className)}
    />
  );
}
