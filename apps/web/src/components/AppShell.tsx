import { AnimatePresence, motion } from 'motion/react';
import { Library, LogOut, MoreVertical, Plus } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useOutletContext } from 'react-router';
import { CLIP_SWATCH, useQuickClips } from '@/data/clips';
import { cn } from '@/lib/cn';
import { easeOutExpo, jelly } from '@/lib/motion';
import { useAuth } from '@/providers/AuthProvider';
import { useCrew } from '@/providers/CrewProvider';
import { InstallAppButton } from './InstallApp';
import { Logo } from './Logo';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';

// Only fetched the first time someone taps "Añadir vídeo".
const AddVideoDialog = lazy(() =>
  import('@/features/library/AddVideoDialog').then((m) => ({ default: m.AddVideoDialog })),
);

interface ShellContext {
  openAddVideo: () => void;
}

export function useShell(): ShellContext {
  return useOutletContext<ShellContext>();
}

/**
 * App frame: a lacquer side rail (brand, primary action, navigation, pinned clips, account) on desktop,
 * a compact top bar on phones, and the routed page beside it.
 */
export function AppShell() {
  const [adding, setAdding] = useState(false);
  // Stays mounted after the first open so closing still plays the dialog's exit animation.
  const [addLoaded, setAddLoaded] = useState(false);
  const context: ShellContext = {
    openAddVideo: () => {
      setAddLoaded(true);
      setAdding(true);
    },
  };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <SideRail onAdd={context.openAddVideo} />
      <div className="min-w-0">
        <MobileBar onAdd={context.openAddVideo} />
        <main>
          <Outlet context={context} />
        </main>
      </div>
      {addLoaded && (
        <Suspense fallback={null}>
          <AddVideoDialog open={adding} onClose={() => setAdding(false)} />
        </Suspense>
      )}
    </div>
  );
}

function SideRail({ onAdd }: { onAdd: () => void }) {
  const { activeCrew, profile } = useCrew();
  const { user, signOut } = useAuth();
  const quick = useQuickClips(activeCrew?.id);
  const pinned = (quick.data ?? []).filter((c) => c.is_pinned).slice(0, 10);
  const name = profile?.display_name ?? user?.email ?? 'Tú';

  return (
    <aside className="sticky top-0 z-30 hidden h-dvh flex-col border-r border-line-strong bg-sumi-950/95 shadow-[4px_0_0_-3px_rgb(228_200_143/0.16),16px_0_32px_-16px_rgb(0_0_0/0.8)] lg:flex">
      <Link to="/" aria-label="Biblioteca" className="mx-3 mt-5 rounded-[10px] px-3 py-1">
        <Logo />
      </Link>

      <div className="mt-6 px-4">
        <Button className="w-full" onClick={onAdd}>
          <Plus className="size-4.5" /> Añadir vídeo
        </Button>
      </div>

      <nav aria-label="Principal" className="mt-6 px-3">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            cn(
              'relative flex h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] font-bold transition-colors',
              isActive
                ? 'bg-washi/[0.07] text-washi'
                : 'text-washi-muted hover:bg-washi/[0.04] hover:text-washi',
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId="rail-active"
                  transition={jelly}
                  className="absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-shu-500"
                />
              )}
              <Library className="size-4.5" /> Biblioteca
            </>
          )}
        </NavLink>
      </nav>

      <div className="mt-7 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-6 pb-2">
          <span className="font-display text-[15px] font-bold text-washi">Clips fijados</span>
          <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-washi/20 to-transparent" />
          <span aria-hidden className="font-display text-[13px] font-bold text-shu-400">
            札
          </span>
        </div>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
          {pinned.map((clip) => (
            <li key={clip.id}>
              <Link
                to={`/v/${clip.video_id}?clip=${clip.id}`}
                className="group flex items-center gap-3 rounded-[10px] px-3 py-2 transition-colors hover:bg-washi/[0.05]"
              >
                <span
                  className={cn(
                    'size-3.5 shrink-0 rotate-[-4deg] rounded-[3px] transition-transform group-hover:rotate-0',
                    CLIP_SWATCH[clip.color].dot,
                  )}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-washi">{clip.name}</span>
                  <span className="block truncate text-xs text-washi-subtle">{clip.video?.title}</span>
                </span>
              </Link>
            </li>
          ))}
          {!quick.isPending && pinned.length === 0 && (
            <li className="px-3 py-1 text-[13px] leading-relaxed text-washi-subtle">
              Fija un clip con la chincheta y aparecerá aquí, a un toque.
            </li>
          )}
        </ul>
      </div>

      <div className="px-4 pb-3">
        <InstallAppButton compact />
        <Link
          to="/privacidad"
          className="mt-1 block px-3 py-1.5 text-xs text-washi-subtle transition-colors hover:text-washi-muted"
        >
          Privacidad y condiciones
        </Link>
      </div>

      {user && (
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <Avatar name={name} hue={profile?.avatar_hue} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-washi">{name}</p>
            <p className="truncate text-xs text-washi-subtle">{user?.email}</p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Cerrar sesión" onClick={() => void signOut()}>
            <LogOut className="size-4" />
          </Button>
        </div>
      )}
    </aside>
  );
}

function MobileBar({ onAdd }: { onAdd: () => void }) {
  const { profile } = useCrew();
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const name = profile?.display_name ?? user?.email ?? 'Tú';

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !menuRef.current?.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-line-strong bg-sumi-950/95 shadow-[0_4px_0_-3px_rgb(228_200_143/0.16),0_12px_24px_-12px_rgb(0_0_0/0.7)] lg:hidden">
      <div className="flex h-16 items-center justify-between gap-3 px-4">
        <Link to="/" aria-label="Biblioteca" className="rounded-[10px]">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <Button size="icon" aria-label="Añadir vídeo" onClick={onAdd}>
            <Plus className="size-5" />
          </Button>
          <div ref={menuRef} className="relative">
            <motion.button
              type="button"
              aria-label={user ? 'Cuenta' : 'Más opciones'}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              whileTap={{ scale: 0.9 }}
              transition={jelly}
              className="grid size-11 place-items-center rounded-full"
            >
              {user ? (
                <Avatar name={name} hue={profile?.avatar_hue} />
              ) : (
                <MoreVertical className="size-5 text-washi-muted" />
              )}
            </motion.button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  role="menu"
                  initial={{ opacity: 0, scale: 0.9, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.12 } }}
                  transition={jelly}
                  style={{ transformOrigin: 'top right' }}
                  className="paper-raised absolute right-0 top-[calc(100%+8px)] w-64 rounded-[14px] p-2"
                >
                  {user && (
                    <>
                      <div className="flex items-center gap-3 px-2.5 py-2.5">
                        <Avatar name={name} hue={profile?.avatar_hue} size="lg" />
                        <div className="min-w-0">
                          <p className="truncate font-bold text-washi">{name}</p>
                          <p className="truncate text-xs text-washi-subtle">{user.email}</p>
                        </div>
                      </div>
                      <div className="my-1 h-px bg-line" />
                    </>
                  )}
                  <InstallAppButton compact className="mb-1" />
                  {user && (
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => void signOut()}
                      className="flex h-11 w-full items-center gap-2.5 rounded-[10px] px-3 text-sm font-medium text-washi-muted transition-colors hover:bg-washi/[0.06] hover:text-washi"
                    >
                      <LogOut className="size-4" />
                      Cerrar sesión
                    </button>
                  )}
                  <p className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-washi-subtle">
                    One Shoot · estudio de ensayo
                    <Link
                      role="menuitem"
                      to="/privacidad"
                      onClick={() => setMenuOpen(false)}
                      className="hover:text-washi-muted"
                    >
                      Privacidad
                    </Link>
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}

/** Enter animation wrapper for routed pages. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: easeOutExpo }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
