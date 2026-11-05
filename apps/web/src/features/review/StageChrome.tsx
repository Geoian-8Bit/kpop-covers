import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

/** A lacquered panel of the screen: ink inside, a gold hairline at the edge (its border: it never covers the picture). */
export const PANEL = 'rounded-[12px] border border-kin-400/45 bg-sumi-950';
export const PANEL_FOCUS =
  'outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-kin-300';

export function PanelLabel({ children, tone }: { children: ReactNode; tone?: 'take' }) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute left-2 top-2 z-[3] rounded-[7px] bg-sumi-950/80 px-2 py-0.5 text-[12px] font-bold',
        tone === 'take' ? 'text-shu-300' : 'text-kin-300',
      )}
    >
      {children}
    </span>
  );
}

/** «Superpuesto»: the original's screen frame — a gold edge and the two folds of a three-leaf byōbu. */
export function OverlayFrame() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[4px] shadow-[inset_0_0_0_2px_var(--color-kin-400)]"
    >
      <span className="absolute inset-y-0 left-1/3 w-px bg-kin-400/30" />
      <span className="absolute inset-y-0 left-2/3 w-px bg-kin-400/30" />
    </div>
  );
}
