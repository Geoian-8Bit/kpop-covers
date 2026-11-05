import { AnimatePresence, motion } from 'motion/react';
import { Lock } from 'lucide-react';
import { memo, Suspense } from 'react';
import { jelly } from '@/lib/motion';
import type { ExposureRange } from '../quickExposureRules';
import type { Box as QuickBarBox } from '../quickExposureRules';
import { QuickExposure } from './lazyPanels';

/** C1/C2 · Where the camera focuses and measures the light; P49 · the quick light bar beside it. */
export const FocusLayer = memo(function FocusLayer({
  focusMark,
  locked,
  showCamera,
  quickLight,
  quickRange,
  exposure,
  onAdjustStart,
  onPreview,
  onCommit,
  onDismiss,
}: {
  focusMark: { x: number; y: number; key: number } | null;
  locked: boolean;
  showCamera: boolean;
  /** Where the quick light bar goes, when it is shown. */
  quickLight: QuickBarBox | null;
  quickRange: ExposureRange | null;
  exposure: number;
  onAdjustStart: () => void;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
  onDismiss: () => void;
}) {
  return (
    <>
      {/* C1/C2: where the camera focuses and measures the light; it stays while focus and light are held. */}
      <AnimatePresence>
        {focusMark && showCamera && (
          <motion.div
            key={focusMark.key}
            aria-hidden
            initial={{ opacity: 0, scale: 1.45 }}
            animate={{ opacity: locked ? 0.85 : 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            transition={jelly}
            className="pointer-events-none absolute z-20 size-[76px] -translate-x-1/2 -translate-y-1/2 rounded-[8px] border-2 border-kin-300 shadow-[0_0_0_1px_rgb(0_0_0/0.35)]"
            style={{ left: focusMark.x, top: focusMark.y }}
          >
            {locked && (
              <span className="absolute -top-8 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-kin-300 px-2 py-0.5 text-[11px] font-bold text-sumi-900">
                <Lock className="size-3" /> Enfoque y luz fijos
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* P49 · Quick light beside the focus ring: the panel's «Luz», same value, same way to the camera. */}
      <Suspense fallback={null}>
        <AnimatePresence>
          {quickLight && quickRange && (
            <QuickExposure
              key="quick-light"
              box={quickLight}
              range={quickRange}
              value={exposure}
              onAdjustStart={onAdjustStart}
              onPreview={onPreview}
              onCommit={onCommit}
              onDismiss={onDismiss}
            />
          )}
        </AnimatePresence>
      </Suspense>
    </>
  );
});
