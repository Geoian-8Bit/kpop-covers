import type { ComponentProps, ReactNode } from 'react';
import { useStore } from 'zustand';
import { cn } from '@/lib/cn';
import { useReview } from '@/player/store';
import { CompareStage } from './CompareStage';
import type { StageStore } from './reviewStageStore';

/**
 * F9 · The stage with the review's zooms, read here so a pinch or a wheel turn repaints only the stage. REQ-25 · The
 * overlay fit and the hinge's share come from the review's stage store too: fitting or dragging repaints the stage,
 * never the whole screen.
 */
export function ReviewCompareStage({
  stage,
  solo,
  ...props
}: Omit<ComponentProps<typeof CompareStage>, 'zoomTake' | 'zoomOriginal' | 'fit' | 'split' | 'alone'> & {
  stage: StageStore;
  /** «Solo toma». A video being placed in «Sincronía» shows alone too (read here: only the stage repaints). */
  solo: boolean;
}) {
  const syncEdit = useReview((s) => s.syncEdit);
  const zoomTake = useReview((s) => s.zoomTake);
  const zoomOriginal = useReview((s) => s.zoomOriginal);
  const fit = useStore(stage, (s) => s.fit);
  const split = useStore(stage, (s) => s.split);
  return (
    <CompareStage
      {...props}
      alone={syncEdit ?? (solo ? 'take' : null)}
      fit={fit}
      split={split}
      zoomTake={zoomTake}
      zoomOriginal={zoomOriginal}
    />
  );
}

/**
 * Where notes, their pop-ups and errors sit over the stage. REQ-25 · With YouTube side by side they keep to the
 * take's panel: its rect is read here from the stage store, so a hinge drag repaints only this layer.
 */
export function NoteArea({
  stage,
  overTake,
  coverOpen,
  children,
}: {
  stage: StageStore;
  /** YouTube side by side: keep to the take's panel. */
  overTake: boolean;
  coverOpen: boolean;
  children: ReactNode;
}) {
  const noteArea = useStore(stage, (s) => (overTake ? s.takeRect : null));
  return (
    <div
      // Over the panel when it is open: a note arriving or an error must show while adjusting.
      className={cn('pointer-events-none absolute [&>*]:pointer-events-auto', coverOpen ? 'z-40' : 'z-20')}
      style={
        noteArea
          ? { left: noteArea.left, top: noteArea.top, width: noteArea.width, height: noteArea.height }
          : { inset: 0 }
      }
    >
      {children}
    </div>
  );
}
