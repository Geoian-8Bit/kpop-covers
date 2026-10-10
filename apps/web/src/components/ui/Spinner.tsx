import { cn } from '@/lib/cn';

/** Ensō (円相): an open brush circle that turns while something loads. */
export function Spinner({ className, label = 'Cargando' }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" role="status" aria-label={label} className={cn('size-5 animate-spin', className)}>
      <path
        d="M19.6 8.2A8.6 8.6 0 1 0 20.4 13"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d="M20.4 13a8.6 8.6 0 0 1-1 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}
