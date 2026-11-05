import { whenIdle } from './idle';
import { routeLoaders } from './routeLoaders';
import { afterStartupSettled } from './startupSettled';
import { loadYouTubeApi } from './youtubeIframe';

/** REQ-06 · Route chunk for the studio: the one loader lives in routeLoaders.ts (App's lazy, main.tsx, this prefetch). */
export const loadStudioPage = routeLoaders.studio;

/** "Añadir vídeo" dialog chunk; shared by `React.lazy` in AppShell and its warm-ups. */
export const loadAddVideoDialog = () => import('@/features/library/AddVideoDialog');

let warmed = false;

/**
 * Once the library is on screen, use idle time to fetch what opening a video needs
 * (studio chunk + YouTube IFrame API) so the first tap on a card feels instant.
 */
export function prefetchStudio(): () => void {
  if (warmed) return () => undefined;
  return whenIdle(() => {
    warmed = true;
    void loadStudioPage().catch(() => undefined);
    void loadYouTubeApi().catch(() => undefined);
  });
}

let addWarmed = false;

/** Fetches the add-video dialog ahead of the first tap. Cheap to call often; a failed fetch may retry. */
export function prefetchAddVideo(): void {
  if (addWarmed) return;
  addWarmed = true;
  void loadAddVideoDialog().catch(() => {
    addWarmed = false;
  });
}

/** Warms the add-video dialog while idle, so even a first tap without hover opens it at once. */
export function prefetchAddVideoWhenIdle(): () => void {
  if (addWarmed) return () => undefined;
  // REQ-10 · After the first screen has settled: in a cold start it no longer shares the bandwidth with the posters.
  let cancelIdle: () => void = () => undefined;
  const cancelWait = afterStartupSettled(() => {
    cancelIdle = whenIdle(prefetchAddVideo, { fallbackMs: 3000 });
  });
  return () => {
    cancelWait();
    cancelIdle();
  };
}
