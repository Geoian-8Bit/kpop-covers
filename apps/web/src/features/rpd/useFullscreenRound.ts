import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { unlockOrientation } from '@/lib/orientation';
import { refitViewport } from '@/lib/viewport';
import { fullscreenStep, type FullscreenMode } from './fullscreenRules';

// REQ-27 · Split out of RpdPlayPage.tsx: the round's full screen (the browser's, or its CSS stand-in).

/**
 * The whole page goes full screen, not the round's layer: dialogs («¿Salir de la ronda?», «Guardar como pista») and
 * the toasts are mounted in `body`, and only what is inside the full-screen element gets painted. The round is
 * already `fixed inset-0` over the app, so it still fills the screen. Leaving the round's page leaves full screen too
 * (a new mix of the same round doesn't: the hook lives in the page, not in the runner it remounts).
 * 54 · Like the studio, where the browser can't (iPhone Safari) the same «video only» layout goes on without it.
 * The browser's full screen turns the phone sideways (it is watched that way, as the studio's), and hands the
 * rotation back on leaving; leaving either kind re-fits the page under it (47, lib/viewport.ts).
 */
export type Fullscreen = { on: boolean; mode: FullscreenMode; toggle: () => void };

export function useFullscreenRound(): Fullscreen {
  const [mode, setMode] = useState<FullscreenMode>('none');
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const ours = useRef(false);
  useEffect(() => {
    const sync = () => {
      const now = document.fullscreenElement != null;
      if (!now) {
        if (ours.current) {
          unlockOrientation();
          refitViewport();
        }
        ours.current = false;
      }
      setMode((m) => (now ? 'native' : m === 'native' ? 'none' : m));
    };
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      if (ours.current && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      if (ours.current) unlockOrientation();
      // Leaving the round in either kind of full screen: the page under it was laid out for that screen.
      if (ours.current || modeRef.current === 'css') refitViewport();
    };
  }, []);
  // The CSS stand-in closes without the browser announcing anything: re-fit by hand, as the studio does.
  const prevMode = useRef(mode);
  useEffect(() => {
    if (prevMode.current === 'css' && mode === 'none') refitViewport();
    prevMode.current = mode;
  }, [mode]);
  const toggle = useCallback(() => {
    const native =
      typeof document.documentElement.requestFullscreen === 'function' && document.fullscreenEnabled;
    const step = fullscreenStep(document.fullscreenElement ? 'native' : modeRef.current, native);
    if (step === 'exit-native') void document.exitFullscreen().catch(() => undefined);
    else if (step === 'leave-css') setMode('none');
    else if (step === 'enter-css') setMode('css');
    else {
      ours.current = true;
      document.documentElement
        .requestFullscreen({ navigationUI: 'hide' })
        .then(lockLandscape)
        .catch(() => {
          // Refused (not from a tap, or blocked): the CSS layout still gives the video the screen.
          ours.current = false;
          setMode('css');
        });
    }
  }, []);
  return useMemo(() => ({ on: mode !== 'none', mode, toggle }), [mode, toggle]);
}

/** Sideways while in the browser's full screen (Android); where it can't be locked, nothing happens. */
function lockLandscape() {
  try {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    void orientation.lock?.('landscape').catch(() => undefined);
  } catch {
    /* not supported */
  }
}
