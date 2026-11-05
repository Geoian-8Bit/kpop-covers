import { lazy, useState, type ComponentType } from 'react';

/**
 * REQ-23 · A recorder panel that only appears after a tap, out of the recorder's chunk: the camera opens sooner. It is
 * fetched on the `pointerdown` of its button (and once the camera is ready, when nothing else runs), so by the time
 * it renders it is usually in memory and renders at once, exactly as a static import would. Rendered before that,
 * it suspends (callers wrap it in `<Suspense fallback={null}>`) and shows up when loaded.
 *
 * A failed load (no connection) never reaches an error boundary: that opening of the panel renders nothing, the
 * recorder goes on, and the next opening tries again. That is why the review strip and the confirm dialog stay static
 * imports: a failed load there would hide «Guardar» (the take could be lost).
 */
function lazyPanel<P extends object>(load: () => Promise<ComponentType<P>>) {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const fetchIt = () =>
    (pending ??= load().then(
      (c) => (loaded = c),
      (err: unknown) => {
        pending = null;
        throw err;
      },
    ));
  const Nothing: ComponentType<P> = () => null;
  function Panel(props: P) {
    // Chosen once per mount: switching from the lazy wrapper to the loaded component would remount the panel.
    const [Comp] = useState<ComponentType<P>>(
      () =>
        loaded ??
        lazy(() =>
          fetchIt().then(
            (c) => ({ default: c }),
            () => ({ default: Nothing }),
          ),
        ),
    );
    return <Comp {...props} />;
  }
  const preload = () => void fetchIt().catch(() => undefined);
  return [Panel, preload, fetchIt] as const;
}

/**
 * F7 · The armed clap view (and its detector) out of the recorder's chunk. Unlike the other panels it is never shown
 * before it has loaded: arming awaits `loadClapArm` (see useClapArm), so a failed load arms nothing and the next tap
 * tries again — the microphone is never left open without its view.
 */
export const [ClapArm, preloadClapArm, loadClapArm] = lazyPanel(() =>
  import('../clap/ClapArm').then((m) => m.ClapArm),
);
export const [InfoPanel, preloadInfoPanel] = lazyPanel(() => import('../InfoPanel').then((m) => m.InfoPanel));
export const [ImageControls, preloadImageControls] = lazyPanel(() =>
  import('../ImageControls').then((m) => m.ImageControls),
);
export const [QuickExposure, preloadQuickExposure] = lazyPanel(() =>
  import('../QuickExposure').then((m) => m.QuickExposure),
);
export const [StartList, preloadStartList] = lazyPanel(() => import('../StartList').then((m) => m.StartList));
/** A1 «Nivel» (off by default): fetched as the recorder opens when it is on, so it is in memory by the time the camera is. */
export const [LevelIndicator, preloadLevel] = lazyPanel(() =>
  import('../settings/LevelIndicator').then((m) => m.LevelIndicator),
);
export const [RecorderSettingsSheet, preloadSettings] = lazyPanel(() =>
  import('../settings/RecorderSettingsSheet').then((m) => m.RecorderSettingsSheet),
);

/** Everything a tap may open, fetched once the camera is ready (the recorder is idle then, nothing competes). */
export function preloadPanels(): void {
  preloadSettings();
  preloadImageControls();
  preloadQuickExposure();
  preloadInfoPanel();
  preloadStartList();
  preloadClapArm();
  preloadLevel();
}
