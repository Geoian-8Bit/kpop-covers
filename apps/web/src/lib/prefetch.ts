import { loadYouTubeApi } from './youtubeIframe';

/** Route chunk for the studio; shared by `React.lazy` in App and the idle prefetch below. */
export const loadStudioPage = () => import('@/features/studio/StudioPage');

/** "Añadir vídeo" dialog chunk; shared by `React.lazy` in AppShell and its warm-ups. */
export const loadAddVideoDialog = () => import('@/features/library/AddVideoDialog');

/** Runs `run` when the phone is idle (or after `fallbackMs` where idle callbacks don't exist). Returns a cancel. */
function whenIdle(run: () => void, fallbackMs = 1500): () => void {
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(run, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(run, fallbackMs);
  return () => clearTimeout(id);
}

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
  return addWarmed ? () => undefined : whenIdle(prefetchAddVideo, 3000);
}
