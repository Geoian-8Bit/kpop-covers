import { AnimatePresence, motion } from 'motion/react';
import { LogOut } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Outlet } from 'react-router';
import { easeOutExpo, jelly } from '@/lib/motion';
import { useAuth } from '@/providers/AuthProvider';
import { useCrew } from '@/providers/CrewProvider';
import { Logo } from './Logo';
import { Avatar } from './ui/Avatar';

export function AppShell() {
  const { profile } = useCrew();
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const name = profile?.display_name ?? user?.email ?? 'Tú';

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !menuRef.current?.contains(event.target as Node)) {
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
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-line-strong bg-sumi-950/95 shadow-[0_4px_0_-3px_rgb(228_200_143/0.18),0_12px_24px_-12px_rgb(0_0_0/0.7)] backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" aria-label="Biblioteca" className="rounded-[10px]">
            <Logo />
          </Link>

          <div className="flex items-center gap-2">
            <div ref={menuRef} className="relative">
              <motion.button
                type="button"
                aria-label="Cuenta"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                whileTap={{ scale: 0.9 }}
                transition={jelly}
                className="grid size-11 place-items-center rounded-full"
              >
                <Avatar name={name} hue={profile?.avatar_hue} />
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
                    <div className="flex items-center gap-3 px-2.5 py-2.5">
                      <Avatar name={name} hue={profile?.avatar_hue} size="lg" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-washi">{name}</p>
                        <p className="truncate text-xs text-washi-subtle">{user?.email}</p>
                      </div>
                    </div>
                    <div className="my-1 h-px bg-line" />
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => void signOut()}
                      className="flex h-11 w-full items-center gap-2.5 rounded-[10px] px-3 text-sm font-medium text-washi-muted transition-colors hover:bg-washi/[0.06] hover:text-washi"
                    >
                      <LogOut className="size-4" />
                      Cerrar sesión
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  );
}

/** Enter animation wrapper for routed pages. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: easeOutExpo }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
