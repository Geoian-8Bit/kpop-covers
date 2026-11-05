import { useEffect, type RefObject } from 'react';

// REQ-27 · Split out of RpdPlayPage.tsx: the round's layer over the app.

/**
 * The round covers the whole app: everything outside it is made inert (keyboard and screen readers stay inside;
 * Tab can't reach the navigation hidden underneath) and restored on leaving. The toast host stays live: the round
 * still says «Guardado» or an error through it.
 */
export function useInertOutside(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const touched: HTMLElement[] = [];
    let node: HTMLElement | null = ref.current;
    while (node && node.parentElement && node !== document.body) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (
          sibling !== node &&
          sibling instanceof HTMLElement &&
          !sibling.inert &&
          !sibling.hasAttribute('data-toast-host')
        ) {
          sibling.inert = true;
          touched.push(sibling);
        }
      }
      node = node.parentElement;
    }
    return () => {
      for (const el of touched) el.inert = false;
    };
  }, [ref]);
}

/** The round's own layer: the app's seigaiha ground (not a black box), clear of the notch and the home bar. */
const LAYER =
  'fixed inset-0 z-[45] pb-[max(8px,env(safe-area-inset-bottom))] pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] pt-[max(8px,env(safe-area-inset-top))]';
export const ROOT = `${LAYER} seigaiha overflow-y-auto`;
/**
 * 54 · Full screen: black like the studio's, nothing scrolls, clear of the notch. Sideways the picture takes the
 * whole height (the bar on the bottom edge keeps its own home-bar inset).
 */
export const FS_ROOT = `${LAYER} overflow-hidden bg-black landscape:py-0`;
