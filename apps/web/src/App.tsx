import { motion, MotionConfig } from 'motion/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import { AppShell } from '@/components/AppShell';
import { Backdrop } from '@/components/Backdrop';
import { LogoMark } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { AuthPage } from '@/features/auth/AuthPage';
import { LibraryPage } from '@/features/library/LibraryPage';
import { StudioPage } from '@/features/studio/StudioPage';
import { isSupabaseConfigured } from '@/lib/supabase';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { CrewProvider, useCrew } from '@/providers/CrewProvider';
import { ToastProvider } from '@/providers/ToastProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
  },
});

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-label="Cargando">
      <motion.div
        animate={{ scale: [1, 0.92, 1], rotate: [-4, -8, -4] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <LogoMark size={56} />
      </motion.div>
    </div>
  );
}

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/auth" replace />;
  return <Outlet />;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user) return <Navigate to="/" replace />;
  return children;
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
                  <Routes>
                    <Route
                      path="/auth"
                      element={
                        <GuestOnly>
                          <AuthPage />
                        </GuestOnly>
                      }
                    />
                    <Route element={<RequireAuth />}>
                      <Route
                        element={
                          <RequireCrew>
                            <AppShell />
                          </RequireCrew>
                        }
                      >
                        <Route index element={<LibraryPage />} />
                        <Route path="/v/:videoId" element={<StudioPage />} />
                      </Route>
                    </Route>
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </BrowserRouter>
              </CrewProvider>
            </AuthProvider>
          </ToastProvider>
        </QueryClientProvider>
      )}
    </MotionConfig>
  );
}
