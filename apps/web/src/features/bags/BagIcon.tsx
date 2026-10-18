import { cn } from '@/lib/cn';

/**
 * The app's «bolsa» icon, drawn like the lucide icons (24-unit grid, stroke = text colour, 1.8 wide), legible from
 * 16 to 24 px. Point 40 · Fukubukuro (福袋), chosen in the design lab: the lucky bag of the New Year sales, tied at
 * the neck, with a round seal on its front.
 */
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
      <path d="M9.2 8C6.3 9.9 4.6 13.3 5 16.6c.3 2.6 2.9 4.4 7 4.4s6.7-1.8 7-4.4c.4-3.3-1.3-6.7-4.2-8.6" />
      <path d="M9 8h6" />
      <path d="M9.4 8 7.6 4.2 12 5.4l4.4-1.2L14.6 8" />
      <circle cx="12" cy="14.6" r="2.6" />
    </svg>
  );
}
