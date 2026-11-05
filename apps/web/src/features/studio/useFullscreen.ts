import { useBackToClose } from '@/lib/useBackToClose';
import { useLandscape, unlockOrientation } from '@/lib/orientation';
import { refitViewport } from '@/lib/viewport';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  lockTarget,
  needsCssRotation,
  nextOrientationPref,
  type OrientationPref,
  showOrientationButton,
} from './fullscreenRules';

/**
 * Fullscreen for the whole stage (video + mirror + overlays). Uses the Fullscreen API where it exists;
 * iPhone Safari only allows it on a bare <video>, so there we fall back to a fixed full-viewport layer.
 * `F` (useShortcuts) toggles it through a window event.
 */
export function useFullscreen() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'none' | 'native' | 'css'>('none');
  // REQ-02 · Fixed orientation: automatic (the view follows the phone), upright or sideways.
  const [orientation, setOrientation] = useState<OrientationPref>('auto');
  const [lockHeld, setLockHeld] = useState(false);
  const deviceLandscape = useLandscape();
  const touch = useCoarsePointer();

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (mode === 'css') {
      setMode('none');
      return;
    }
    const el = stageRef.current;
    if (el && document.fullscreenEnabled && el.requestFullscreen) {
      try {
        await el.requestFullscreen({ navigationUI: 'hide' });
        // No orientation lock any more: the view follows how the phone is held (the button fixes it).
        setMode('native');
        return;
      } catch {
        /* fall through to the CSS layer */
      }
    }
    setMode('css');
  }, [mode]);

  useEffect(() => {
    const onChange = () => {
      if (document.fullscreenElement) return;
      // Hand the rotation back to the phone, or it can stay stuck sideways after leaving fullscreen.
      unlockOrientation();
      setMode((m) => (m === 'native' ? 'none' : m));
      setOrientation('auto');
      setLockHeld(false);
    };
    const onToggle = () => void toggleFullscreen();
    document.addEventListener('fullscreenchange', onChange);
    window.addEventListener('oneshoot:fullscreen', onToggle);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('oneshoot:fullscreen', onToggle);
    };
  }, [toggleFullscreen]);

  useEffect(() => {
    if (mode !== 'css') return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    // On document, so it runs after an open menu's own Escape (window, capture phase) and before the
    // studio shortcut on window: Escape leaves fullscreen and must not also clear the A–B range.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      setMode('none');
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
      // 47 · The browser announces no fullscreen exit here: the page under the layer may have been laid out for the
      // other orientation (the phone turned meanwhile), so it is fitted back to the screen and centred.
      refitViewport();
    };
  }, [mode]);
  // Leaving the CSS fullscreen also goes back to automatic (the next time starts clean).
  useEffect(() => {
    if (mode === 'none') {
      setOrientation('auto');
      setLockHeld(false);
    }
  }, [mode]);

  // The orientation lock (native only). If the system refuses, the CSS turn takes over without any message.
  useEffect(() => {
    if (mode !== 'native') return;
    const target = lockTarget(orientation);
    const api = screen.orientation as
      (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
    if (!target) {
      setLockHeld(false);
      try {
        api?.unlock?.();
      } catch {
        /* not locked / not supported */
      }
      return;
    }
    let current = true;
    if (!api?.lock) {
      setLockHeld(false);
      return;
    }
    api
      .lock(target)
      .then(() => current && setLockHeld(true))
      .catch(() => current && setLockHeld(false));
    return () => {
      current = false;
    };
  }, [mode, orientation]);

  const cycleOrientation = useCallback(() => setOrientation((o) => nextOrientationPref(o)), []);
  const rotated = mode !== 'none' && needsCssRotation({ pref: orientation, deviceLandscape, lockHeld });

  // The CSS fullscreen (iPhone) is a layer: «Atrás» (or the edge swipe) leaves it, not the song — like Escape.
  const leaveCss = useCallback(() => setMode('none'), []);
  useBackToClose(mode === 'css', leaveCss);

  // Leaving the song while in the native fullscreen: out of it, and the rotation always handed back (by the time this
  // runs the browser may already have dropped the removed stage from fullscreen, and `onChange` is gone).
  useEffect(
    () => () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      unlockOrientation();
    },
    [],
  );

  return {
    stageRef,
    fullscreen: mode !== 'none',
    toggleFullscreen,
    orientation,
    cycleOrientation,
    rotated,
    showOrientation: mode !== 'none' && showOrientationButton({ cssMode: mode === 'css', touch }),
  };
}

/** A touch screen (a phone or tablet that can turn): the orientation button has something to do there. */
function useCoarsePointer(): boolean {
  return useMemo(() => window.matchMedia('(pointer: coarse)').matches, []);
}

/** The fullscreen layer turned 90° over a screen held the other way: it takes the whole screen, sideways. */
export const ROTATED_STAGE_STYLE: CSSProperties = {
  top: 0,
  left: 0,
  right: 'auto',
  bottom: 'auto',
  width: '100dvh',
  height: '100dvw',
  transformOrigin: 'top left',
  transform: 'translateX(100dvw) rotate(90deg)',
};
