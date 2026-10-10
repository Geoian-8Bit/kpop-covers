import { loadYouTubeApi } from './youtubeIframe';

/** Route chunk for the studio; shared by `React.lazy` in App and the idle prefetch below. */
export const loadStudioPage = () => import('@/features/studio/StudioPage');

let warmed = false;

/**
 * Once the library is on screen, use idle time to fetch what opening a video needs
 * (studio chunk + YouTube IFrame API) so the first tap on a card feels instant.
 */
export function prefetchStudio(): () => void {
  if (warmed) return () => undefined;
  const run = () => {
    warmed = true;
    void loadStudioPage().catch(() => undefined);
    void loadYouTubeApi().catch(() => undefined);
  };
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(run, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(run, 1500);
  return () => clearTimeout(id);
}
