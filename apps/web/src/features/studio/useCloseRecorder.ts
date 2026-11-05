import { useCallback, useRef } from 'react';

// REQ-27 · Moved out of StudioPage.tsx unchanged (move first, optimise later).
export function useCloseRecorder(setRecording: (on: boolean) => void) {
  const recordButton = useRef<HTMLButtonElement>(null);
  /**
   * Closing the recorder: back to «Grabar». While the recorder covered the studio, «Grabar» sat in a Dormant part
   * (content-visibility: hidden) and the browser dropped its focus to body. Tried for a few frames, until that part
   * shows again; never over a focus something else already took.
   */
  const closeRecorder = useCallback(() => {
    setRecording(false);
    let tries = 0;
    const refocus = () => {
      const el = recordButton.current;
      const active = document.activeElement;
      if (!el || (active && active !== document.body) || tries++ > 5) return;
      el.focus({ preventScroll: true });
      if (document.activeElement !== el) requestAnimationFrame(refocus);
    };
    requestAnimationFrame(refocus);
  }, [setRecording]);
  return { recordButton, closeRecorder };
}
