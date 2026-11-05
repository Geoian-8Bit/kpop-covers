import { MotionConfig } from 'motion/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryRetry, queryRetryDelay } from '@/lib/netRules';
import { PerfProbe } from '@/lib/perfProbe';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { AppShell } from '@/components/AppShell';
import { Backdrop } from '@/components/Backdrop';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LogoMark } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { LibraryPage } from '@/features/library/LibraryPage';
import '@/components/splash.css';
import { pageTitle } from '@/lib/pageTitle';
import { routeLoaders } from '@/lib/routeLoaders';
import { isSupabaseConfigured } from '@/lib/supabase';
import { AuthProvider } from '@/providers/AuthProvider';
import { CrewProvider, useCrew } from '@/providers/CrewProvider';
import { ToastProvider } from '@/providers/ToastProvider';

// Route-level splitting: the library is the landing page, the studio and legal pages load on demand.
// REQ-06 · The loaders live in one map (routeLoaders.ts) shared with main.tsx's cold-start preload and prefetch.ts.
const StudioPage = lazy(() => routeLoaders.studio().then((m) => ({ default: m.StudioPage })));
const PrivacyPage = lazy(() => routeLoaders.privacy().then((m) => ({ default: m.PrivacyPage })));
const SettingsPage = lazy(() => routeLoaders.settings().then((m) => ({ default: m.SettingsPage })));
// F13 bags and F14 Random Play Dance: their own chunks, loaded when visited.
const BagsPage = lazy(() => routeLoaders.bags().then((m) => ({ default: m.BagsPage })));
const BagPage = lazy(() => routeLoaders.bag().then((m) => ({ default: m.BagPage })));
const RpdPage = lazy(() => routeLoaders.rpd().then((m) => ({ default: m.RpdPage })));
const TrackPage = lazy(() => routeLoaders.track().then((m) => ({ default: m.TrackPage })));
const RpdPlayPage = lazy(() => routeLoaders.rpdPlay().then((m) => ({ default: m.RpdPlayPage })));
// F12 wish list and F11 votes («Próxima cover»).
const WishesPage = lazy(() => routeLoaders.wishes().then((m) => ({ default: m.WishesPage })));
const PollPage = lazy(() => routeLoaders.poll().then((m) => ({ default: m.PollPage })));
// F16 events (countdown and repertoire).
const EventsPage = lazy(() => routeLoaders.events().then((m) => ({ default: m.EventsPage })));
const EventPage = lazy(() => routeLoaders.event().then((m) => ({ default: m.EventPage })));
// Calendar of absences and rehearsals.
const CalendarPage = lazy(() => routeLoaders.calendar().then((m) => ({ default: m.CalendarPage })));

// REQ-06 · Exported so main.tsx can start the group request before React mounts.
export const queryClient = new QueryClient({
  defaultOptions: {
    // Back in the app after a while: pick up what the rest of the group changed (only stale data refetches).
    // REQ-18 · gcTime 60 min: a screen left for a while (the library during a rehearsal) keeps its cache.
    // Poor 4G: network / timeout / 5xx failures retry with backoff, answers that won't change (4xx, RLS) never do.
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 60 * 60_000,
      refetchOnWindowFocus: true,
      retry: queryRetry,
      retryDelay: (failureCount) => queryRetryDelay(failureCount),
    },
  },
});

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-label="Cargando">
      <div className="splash-seal">
        <LogoMark size={56} />
      </div>
    </div>
  );
}

/**
 * Catches what the shell's own boundary can't: the shell itself (rail, mobile bar, RequireCrew) and routes
 * outside it (/privacidad). Cleared on navigation like the inner one.
 */
function RootErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

/** «<página> · One Shoot» on every route (focus and the skip link live in AppShell). */
function DocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = pageTitle(pathname);
  }, [pathname]);
  return null;
}

function RequireCrew({ children }: { children: ReactNode }) {
  const { activeCrew, loading, error, retry } = useCrew();
  if (loading) return <Splash />;
  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="paper max-w-sm rounded-[16px] p-8">
          <h1 className="font-display text-2xl font-bold">No pudimos cargar el estudio</h1>
          <p className="mt-2 text-washi-muted">Revisa la conexión e inténtalo de nuevo.</p>
          <Button className="mt-6" onClick={retry}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }
  if (!activeCrew) return <Splash />;
  return children;
}

function MissingConfig() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="paper max-w-md rounded-[16px] p-8">
        <h1 className="font-display text-2xl font-bold">Falta configuración</h1>
        <p className="mt-2 text-washi-muted">
          Define <code className="font-mono text-kin-300">VITE_SUPABASE_URL</code> y{' '}
          <code className="font-mono text-kin-300">VITE_SUPABASE_PUBLISHABLE_KEY</code> en{' '}
          <code className="font-mono">apps/web/.env.local</code>.
        </p>
      </div>
    </div>
  );
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Backdrop />
      {!isSupabaseConfigured ? (
        <MissingConfig />
      ) : (
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <AuthProvider>
              <CrewProvider>
                <BrowserRouter>
                  <DocumentTitle />
                  <RootErrorBoundary>
                    <Routes>
                      {/* Open access: no login screen, everyone lands in the shared library. */}
                      <Route
                        element={
                          <RequireCrew>
                            <AppShell />
                          </RequireCrew>
                        }
                      >
                        <Route index element={<LibraryPage />} />
                        <Route
                          path="/v/:videoId"
                          element={
                            <Suspense fallback={<Splash />}>
                              <PerfProbe id="StudioPage">
                                <StudioPage />
                              </PerfProbe>
                            </Suspense>
                          }
                        />
                        {/* REQ-06 · The formation editor is the studio itself (same player and store) in another layout. */}
                        <Route
                          path="/v/:videoId/formaciones/:planId"
                          element={
                            <Suspense fallback={<Splash />}>
                              <PerfProbe id="StudioPage">
                                <StudioPage />
                              </PerfProbe>
                            </Suspense>
                          }
                        />
                        <Route
                          path="/ajustes"
                          element={
                            <Suspense fallback={<Splash />}>
                              <SettingsPage />
                            </Suspense>
                          }
                        />
                        {(
                          [
                            ['/bolsas', <BagsPage key="bags" />],
                            ['/bolsas/:bagId', <BagPage key="bag" />],
                            ['/rpd', <RpdPage key="rpd" />],
                            ['/rpd/pista/:trackId', <TrackPage key="track" />],
                            ['/rpd/jugar', <RpdPlayPage key="play" />],
                            [
                              '/deseos',
                              <PerfProbe key="wishes" id="WishesPage">
                                <WishesPage />
                              </PerfProbe>,
                            ],
                            ['/deseos/votacion/:pollId', <PollPage key="poll" />],
                            ['/eventos', <EventsPage key="events" />],
                            ['/eventos/:eventId', <EventPage key="event" />],
                            ['/calendario', <CalendarPage key="calendar" />],
                          ] as const
                        ).map(([path, page]) => (
                          <Route
                            key={path}
                            path={path}
                            element={<Suspense fallback={<Splash />}>{page}</Suspense>}
                          />
                        ))}
                      </Route>
                      <Route
                        path="/privacidad"
                        element={
                          <Suspense fallback={<Splash />}>
                            <PrivacyPage />
                          </Suspense>
                        }
                      />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </RootErrorBoundary>
                </BrowserRouter>
              </CrewProvider>
            </AuthProvider>
          </ToastProvider>
        </QueryClientProvider>
      )}
    </MotionConfig>
  );
}
