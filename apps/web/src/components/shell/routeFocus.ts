import { useEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router';

/** Focus for a heading or <main> moved to by script: focusable without entering the Tab order, and no ring. */
export function focusLandmark(el: HTMLElement, scroll = false) {
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.setAttribute('data-route-focus', '');
  el.focus({ preventScroll: !scroll });
}

/**
 * After a route change (not the first load, not a change of the query alone such as ?clip=) focus moves to the new
 * page's h1 — or to <main> if none shows up — so a screen reader starts reading the new page and Tab goes on from
 * there. Lazy pages render their heading late: it waits for it, unless the person has moved focus meanwhile.
 */
export function useRouteFocus(mainRef: RefObject<HTMLElement | null>) {
  const { pathname } = useLocation();
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    const main = mainRef.current;
    if (!main) return;
    const from = document.activeElement;
    let done = false;
    /** Focus went somewhere else on its own (an autofocused button, a field the person tapped): leave it there. */
    const movedOn = () => {
      const active = document.activeElement;
      return active != null && active !== document.body && active !== from && active.isConnected;
    };
    /** A control the page wants first (data-autofocus), even when it shows up after the heading. */
    const preferred = () => main.querySelector<HTMLElement>('[data-autofocus]:not([disabled])');
    let onHeading: HTMLElement | null = null;
    const land = () => {
      const wanted = preferred();
      if (wanted && (!done || document.activeElement === onHeading)) {
        if (document.activeElement !== wanted) wanted.focus();
        done = true;
        return true;
      }
      if (done) return onHeading == null;
      if (movedOn()) return (done = true);
      const heading = main.querySelector<HTMLElement>('h1');
      if (!heading) return false;
      focusLandmark(heading);
      onHeading = heading;
      done = true;
      // Keep watching a little longer in case the page's first control (data-autofocus) arrives later.
      return false;
    };
    if (land()) return;
    const observer = new MutationObserver(() => {
      if (land()) observer.disconnect();
    });
    observer.observe(main, { childList: true, subtree: true });
    const timeout = setTimeout(() => {
      observer.disconnect();
      if (!done && !movedOn()) focusLandmark(main);
      done = true;
    }, 2500);
    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [pathname, mainRef]);
}
