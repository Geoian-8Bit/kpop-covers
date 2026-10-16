import { cn } from '@/lib/cn';

/** Kinchaku (巾着): the drawstring pouch the app uses for «bolsa», drawn like the lucide icons (stroke = text colour). */
export function BagIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn('size-4.5 shrink-0', className)}
    >
      <path d="M7 9.2C4.6 12.6 4.4 18.6 8.3 20.3c2.3.9 5.1.9 7.4 0 3.9-1.7 3.7-7.7 1.3-11.1" />
      <path d="M7 9.2c3.1-1.3 6.9-1.3 10 0" />
      <path d="M8.2 8.4C7 6.6 7.9 4.4 9.9 5.1c.8-1.6 3.4-1.6 4.2 0 2-.7 2.9 1.5 1.7 3.3" />
      <path d="M9.4 9.8c.2 1.4 1.4 2.1 2.6 1.6 1.2.5 2.4-.2 2.6-1.6" />
      <path d="M12 11.4v2.8" />
    </svg>
  );
}
