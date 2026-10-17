import { ArrowDown, ArrowUp } from 'lucide-react';
import type { MouseEvent } from 'react';
import { cn } from '@/lib/cn';
import { moveTarget, positionMessage } from '@/lib/reorderA11y';
import { Button } from './Button';

/**
 * ↑ ↓ for a reorderable list (the keyboard way to do what the drag handle does). At an end the arrow stays
 * focusable (`aria-disabled`, a press does nothing) so focus never drops to the page; after a move focus is put
 * back on the pressed arrow (the row's DOM node may have been moved) and the new place is announced.
 */
export function MoveArrows({
  index,
  total,
  name,
  onMove,
  announce,
  className,
  iconClassName = 'size-4',
}: {
  index: number;
  total: number;
  /** The item's name, for the labels and the announcement. */
  name: string;
  onMove: (delta: -1 | 1) => void;
  announce: (message: string) => void;
  className?: string;
  iconClassName?: string;
}) {
  const press = (delta: -1 | 1) => (event: MouseEvent<HTMLButtonElement>) => {
    const to = moveTarget(index, delta, total);
    if (to == null) return;
    const self = event.currentTarget;
    onMove(delta);
    announce(positionMessage(name, to, total));
    requestAnimationFrame(() => {
      if (self.isConnected && document.activeElement !== self) self.focus();
    });
  };
  const arrow = 'aria-disabled:cursor-not-allowed aria-disabled:opacity-30 aria-disabled:hover:bg-transparent';
  return (
    <span className={cn('flex shrink-0 items-center', className)}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Subir «${name}»`}
        aria-disabled={index === 0 || undefined}
        onClick={press(-1)}
        className={arrow}
      >
        <ArrowUp aria-hidden className={iconClassName} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Bajar «${name}»`}
        aria-disabled={index === total - 1 || undefined}
        onClick={press(1)}
        className={arrow}
      >
        <ArrowDown aria-hidden className={iconClassName} />
      </Button>
    </span>
  );
}

/** The list's polite live region for `useAnnouncer` (one per list, outside the moving rows). */
export function LiveMessage({ message }: { message: string }) {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {message}
    </p>
  );
}
