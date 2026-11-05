import { prefetchAddVideo } from '@/lib/prefetch';

/** Hover/press warm-up for the add buttons. */
export const warmAdd = {
  onPointerEnter: prefetchAddVideo,
  onPointerDown: prefetchAddVideo,
  onFocus: prefetchAddVideo,
};
