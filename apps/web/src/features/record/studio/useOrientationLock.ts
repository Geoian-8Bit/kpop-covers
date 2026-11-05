import type { Studio } from './useStudioSession';

/**
 * Q5 · A direct take records the camera's own frames: turning the phone mid-take would change their size
 * under the recorder. The screen's rotation is locked for the take (possible in the installed app / full
 * screen); where it can't be, the take goes through the canvas, which copes with a turned phone.
 */
export function useOrientationLock(S: Studio) {
  const { fx, orientation, phaseRef, setTakeKind } = S;
  function lockForDirect() {
    const state = {
      pending: false,
      locked: false,
      tried: true,
      ready: Promise.resolve() as Promise<unknown>,
    };
    orientation.current = state;
    if (!fx.directPossible()) {
      setTakeKind('canvas');
      return;
    }
    const o = screen.orientation as ScreenOrientation & { lock?: (type: string) => Promise<void> };
    if (!o?.lock) {
      setTakeKind('canvas');
      return;
    }
    state.pending = true;
    // Still the take this lock was asked for: a cancel or a pause while it was pending leaves `orientation`
    // as it was (nothing was locked yet), so the phase says whether the take is still on.
    const wanted = () => orientation.current === state && ['arming', 'recording'].includes(phaseRef.current);
    state.ready = o.lock(o.type).then(
      () => {
        state.pending = false;
        // Cancelled, paused or closed meanwhile: give the rotation back at once.
        if (!wanted()) {
          try {
            screen.orientation?.unlock?.();
          } catch {
            /* not locked */
          }
          return;
        }
        state.locked = true;
      },
      () => {
        state.pending = false;
        // Prepare the canvas now (it starts drawing) so the take can roll through it.
        if (wanted()) setTakeKind('canvas');
      },
    );
  }
  function unlockOrientation() {
    const state = orientation.current;
    if (!state.locked) return;
    state.locked = false;
    try {
      screen.orientation?.unlock?.();
    } catch {
      /* not locked any more */
    }
  }
  fx.lockForDirect = lockForDirect;
  fx.unlockOrientation = unlockOrientation;
}
