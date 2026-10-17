import { useDesignVariant } from '@/features/lab/labState';
import { cn } from '@/lib/cn';

/**
 * The app's «bolsa» icon, drawn like the lucide icons (24-unit grid, stroke = text colour, 1.8 wide), legible from
 * 16 to 24 px. Point 29 · three new drawings on trial in the design lab (moment `bag-icon`), next to the current
 * one; every use of the icon follows the variant chosen on this device.
 */
export type BagIconVariant = 'actual' | 'kinchaku' | 'furoshiki' | 'fukubukuro';

export const BAG_ICON_VARIANTS: readonly BagIconVariant[] = ['actual', 'kinchaku', 'furoshiki', 'fukubukuro'];

function Paths({ variant }: { variant: BagIconVariant }) {
  switch (variant) {
    case 'kinchaku':
      // Kinchaku (巾着), redrawn simpler: a round pouch, a frilled top gathered at the neck, the cord's knot.
      return (
        <>
          <path d="M7 11c-2 2.4-2.6 5.6-1.1 7.6C7.2 20.3 9.4 21 12 21s4.8-.7 6.1-2.4c1.5-2 .9-5.2-1.1-7.6" />
          <path d="M7 11c3.2 1.2 6.8 1.2 10 0" />
          <path d="M7.4 10.6 6.2 5.8l2.9 1.4L12 4.6l2.9 2.6 2.9-1.4-1.2 4.8" />
          <path d="M12 12v3.4" />
          <circle cx="12" cy="16.6" r="1.1" fill="currentColor" stroke="none" />
        </>
      );
    case 'furoshiki':
      // Furoshiki (風呂敷): a bundle of cloth with its two knotted ears on top and a fold across.
      return (
        <>
          <path d="M5 13.2C5 11 6.6 9.5 8.8 9.5h6.4c2.2 0 3.8 1.5 3.8 3.7v3.3c0 2.5-2 4.5-4.5 4.5h-5C7 21 5 19 5 16.5z" />
          <path d="M10 9.5C8.6 8 7.9 6 8.7 4.3c1.5.5 2.8 1.8 3.3 3.4" />
          <path d="M14 9.5c1.4-1.5 2.1-3.5 1.3-5.2-1.5.5-2.8 1.8-3.3 3.4" />
          <path d="M8 14.2l4 2.6 4-2.6" />
        </>
      );
    case 'fukubukuro':
      // Fukubukuro (福袋): the lucky bag of the New Year sales, tied at the neck, with a round seal on its front.
      return (
        <>
          <path d="M9.2 8C6.3 9.9 4.6 13.3 5 16.6c.3 2.6 2.9 4.4 7 4.4s6.7-1.8 7-4.4c.4-3.3-1.3-6.7-4.2-8.6" />
          <path d="M9 8h6" />
          <path d="M9.4 8 7.6 4.2 12 5.4l4.4-1.2L14.6 8" />
          <circle cx="12" cy="14.6" r="2.6" />
        </>
      );
    default:
      // The first drawing (kept for comparison until one is chosen).
      return (
        <>
          <path d="M7 9.2C4.6 12.6 4.4 18.6 8.3 20.3c2.3.9 5.1.9 7.4 0 3.9-1.7 3.7-7.7 1.3-11.1" />
          <path d="M7 9.2c3.1-1.3 6.9-1.3 10 0" />
          <path d="M8.2 8.4C7 6.6 7.9 4.4 9.9 5.1c.8-1.6 3.4-1.6 4.2 0 2-.7 2.9 1.5 1.7 3.3" />
          <path d="M9.4 9.8c.2 1.4 1.4 2.1 2.6 1.6 1.2.5 2.4-.2 2.6-1.6" />
          <path d="M12 11.4v2.8" />
        </>
      );
  }
}

/** One drawing, whatever is chosen (the lab shows them side by side). */
export function BagGlyph({ variant, className }: { variant: BagIconVariant; className?: string }) {
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
      <Paths variant={variant} />
    </svg>
  );
}

/** The icon as chosen on this device. */
export function BagIcon({ className }: { className?: string }) {
  const chosen = useDesignVariant('bag-icon');
  const variant = (BAG_ICON_VARIANTS as readonly string[]).includes(chosen)
    ? (chosen as BagIconVariant)
    : 'actual';
  return <BagGlyph variant={variant} className={className} />;
}
