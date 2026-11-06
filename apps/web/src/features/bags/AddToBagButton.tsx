import { motion } from 'motion/react';
import { lazy, Suspense, useState } from 'react';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import type { BagTarget } from './AddToBagDialog';
import { BagIcon } from './BagIcon';

// Only fetched when someone opens it: the library and the studio stay as light as before.
const AddToBagDialog = lazy(() => import('./AddToBagDialog').then((m) => ({ default: m.AddToBagDialog })));

/**
 * The small «Añadir a una bolsa» button for a library card or a clip row. The visible crest can be small; the
 * hit area is always at least 44 px. `open`/`onOpenChange` let a row open the same dialog from elsewhere (a
 * swipe action); without them the button keeps its own state.
 */
export function AddToBagButton({
  target,
  className,
  look = 'plain',
  open: openProp,
  onOpenChange,
}: {
  target: BagTarget;
  className?: string;
  look?: 'plain' | 'crest';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  const [loaded, setLoaded] = useState(false);
  // Opened from outside (a swipe action): mount the dialog and keep it, so its exit still plays.
  if (open && !loaded) setLoaded(true);
  return (
    <>
      <motion.button
        type="button"
        aria-label={`Añadir «${target.label}» a una bolsa`}
        title="Añadir a una bolsa"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setLoaded(true);
          setOpen(true);
        }}
        onPointerEnter={() => void import('./AddToBagDialog')}
        whileTap={{ scale: 0.85, rotate: -6 }}
        transition={jelly}
        className={cn(
          'relative grid shrink-0 place-items-center before:absolute before:-inset-1 before:content-[""]',
          look === 'crest'
            ? 'rounded-full bg-sumi-950/90 text-kin-300 shadow-[0_0_0_1.5px_var(--color-kin-400),0_6px_12px_rgb(0_0_0/0.6)] hover:text-washi'
            : 'rounded-[8px] text-washi-subtle hover:bg-washi/[0.06] hover:text-washi',
          className,
        )}
      >
        <BagIcon />
      </motion.button>
      {loaded && (
        <Suspense fallback={null}>
          <AddToBagDialog open={open} onClose={() => setOpen(false)} target={target} />
        </Suspense>
      )}
    </>
  );
}
