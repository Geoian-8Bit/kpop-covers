import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { usePlayer } from '@/player/store';

/**
 * Performance with the recorder open: the recorder covers the whole studio (opaque, fixed), but the studio stays
 * mounted under it — its stage plays the song the recorder dances to, and coming back must find everything as it was.
 * While it is covered (`covered` in player/store.ts, set by the recorder) what follows the clock in the studio (the
 * time readout, the timeline's playhead and note dots, the zoom layer) stops following it, and everything but the
 * stage skips rendering altogether. The player's state is untouched; uncovering repaints once from the clock.
 */
export function useStudioAsleep(): boolean {
  return usePlayer((s) => s.covered);
}

type PlayerSnapshot = ReturnType<typeof usePlayer.getState>;
const HOLD: unique symbol = Symbol('hold');

/**
 * A store selector that follows the clock only while the studio shows: covered, it keeps its last value (no
 * re-render at all); uncovered, it reads the store again.
 */
export function useUnlessCovered<T>(select: (s: PlayerSnapshot) => T): T {
  const value = usePlayer((s) => (s.covered ? HOLD : select(s)));
  const held = useRef<{ value: T } | null>(null);
  if (value !== HOLD) held.current = { value };
  return held.current ? held.current.value : select(usePlayer.getState());
}

/**
 * Holds part of the page still while the studio is covered: its contents skip style, layout and paint
 * (`content-visibility: hidden`, which also keeps them out of the focus order), while it keeps the height it had, so the page's scroll
 * position is the same on the way back.
 */
export function Dormant({ children, className }: { children: ReactNode; className?: string }) {
  const asleep = useStudioAsleep();
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  // Measured before the first paint asleep, while the contents still render.
  useLayoutEffect(() => {
    setHeight(asleep ? (ref.current?.offsetHeight ?? null) : null);
  }, [asleep]);
  // Skipped contents can't take the focus either (no `inert`: it would still be set when the recorder lets go).
  const style: CSSProperties | undefined = asleep && height != null ? { contentVisibility: 'hidden', height } : undefined;
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
