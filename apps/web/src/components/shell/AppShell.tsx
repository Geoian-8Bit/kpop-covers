import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { cn } from '@/lib/cn';
import { useDesktop } from '@/lib/useDesktop';
import { loadAddVideoDialog, prefetchAddVideoWhenIdle } from '@/lib/prefetch';
import { InstallAppHelp } from '../InstallApp';
import { useFabScrollPadding } from '../stickyBarPadding';
import { WhoPromptHost } from '@/features/members/MembersUI';
import { PushHost } from '@/features/calendar/PushHost';
import { QuickNav, useQuickNavShown } from '@/features/nav/QuickNav';
import { MobileBar } from './MobileBar';
import { Routed } from './Routed';
import { SavingReporter } from './SavingReporter';
import { SideRail } from './SideRail';
import { focusLandmark, useRouteFocus } from './routeFocus';
import type { ShellContext } from './shellContext';

// Not in the entry chunk: warmed while idle and on hover/press of the add buttons, so the first open is instant.
const AddVideoDialog = lazy(() => loadAddVideoDialog().then((m) => ({ default: m.AddVideoDialog })));

/**
 * App frame: a lacquer side rail (brand, primary action, navigation, pinned clips, account) on desktop,
 * a compact top bar on phones, and the routed page beside it.
 */
export function AppShell() {
  const [adding, setAdding] = useState(false);
  // Stays mounted after the first open so closing still plays the dialog's exit animation.
  const [addLoaded, setAddLoaded] = useState(false);
  const openAddVideo = useCallback(() => {
    setAddLoaded(true);
    setAdding(true);
  }, []);
  const closeAddVideo = useCallback(() => setAdding(false), []);
  const context = useMemo<ShellContext>(() => ({ openAddVideo }), [openAddVideo]);

  useEffect(() => prefetchAddVideoWhenIdle(), []);
  const mainRef = useRef<HTMLElement>(null);
  useRouteFocus(mainRef);
  // REQ-09 · Only the bar for the current width is mounted (the other one used to render hidden by CSS).
  const desktop = useDesktop();
  // REQ-09 · The bars swap in React, after the browser's own `resize` event. Anything that measured the layout on that
  // event (the studio's popovers) saw the old bar's layout and kept a stale shift; tell it once the new one is in.
  const wasDesktop = useRef(desktop);
  useLayoutEffect(() => {
    if (wasDesktop.current === desktop) return;
    wasDesktop.current = desktop;
    window.dispatchEvent(new Event('resize'));
  }, [desktop]);
  const quickNav = useQuickNavShown();
  // Focus scrolled to the bottom edge is never left under the button (WCAG 2.4.11; see `html` in index.css).
  useFabScrollPadding(quickNav);

  return (
    <div
      className="min-h-dvh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]"
      // P1 · Room a fixed bar at the bottom right leaves for the quick-menu button (56 px + 16 px margin), only while
      // it shows. Pages use it on phones: `max-lg:pr-[var(--fab-clearance,0px)]`.
      style={
        quickNav
          ? ({ '--fab-clearance': 'calc(72px + env(safe-area-inset-right))' } as CSSProperties)
          : undefined
      }
    >
      {/* First stop for the keyboard: past the rail and the top bar, straight to the page. */}
      <a
        href="#contenido"
        onClick={(event) => {
          event.preventDefault();
          if (mainRef.current) focusLandmark(mainRef.current, true);
        }}
        className="sr-only rounded-[10px] bg-washi px-4 py-2.5 text-sm font-bold text-sumi-900 shadow-[0_10px_20px_-10px_rgb(0_0_0/0.9)] focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60]"
      >
        Saltar al contenido
      </a>
      {desktop && <SideRail onAdd={openAddVideo} />}
      <div className="min-w-0">
        {!desktop && <MobileBar onAdd={openAddVideo} />}
        {/* P1 · Room at the bottom on phones, so the quick-menu button never sits over the end of a page. */}
        <main
          id="contenido"
          ref={mainRef}
          tabIndex={-1}
          data-route-focus
          className={cn(quickNav && 'pb-[calc(84px+env(safe-area-inset-bottom))] lg:pb-0')}
        >
          <Routed context={context}>
            {/* Portalled, so it can sit inside the boundary: a chunk that fails to load can't blank the app. */}
            {addLoaded && (
              <Suspense fallback={null}>
                <AddVideoDialog open={adding} onClose={closeAddVideo} />
              </Suspense>
            )}
          </Routed>
        </main>
      </div>
      {/* One help dialog for every install button, outside the phone menu so closing the menu can't take it down. */}
      <InstallAppHelp />
      <WhoPromptHost />
      {/* REQ-05 · Badge reset, a tapped notice's day and the one-time suggestion. */}
      <PushHost />
      {/* P1 · Phones: the sections and «¿Quién eres?» in the quick menu, bottom right (desktop keeps the rail). */}
      <QuickNav shown={quickNav} />
      <SavingReporter />
    </div>
  );
}
