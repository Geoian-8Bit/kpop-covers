import { useLayoutEffect, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router';
import { ErrorBoundary } from '../ErrorBoundary';
import { setShownPath } from './guardNav';
import type { ShellContext } from './shellContext';

/** The routed page, behind an error boundary that clears on the next navigation. Tracks `shownPath`. */
export function Routed({ context, children }: { context: ShellContext; children?: ReactNode }) {
  const { pathname, search } = useLocation();
  useLayoutEffect(() => {
    setShownPath(pathname + search);
  }, [pathname, search]);
  useLayoutEffect(
    () => () => {
      setShownPath(null);
    },
    [],
  );
  return (
    <ErrorBoundary resetKey={pathname}>
      <Outlet context={context} />
      {children}
    </ErrorBoundary>
  );
}
