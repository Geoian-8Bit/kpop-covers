import { Ellipsis, LogOut, Settings, ShieldCheck } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { jelly } from '@/lib/motion';
import { useBackToClose } from '@/lib/useBackToClose';
import { useAuth } from '@/providers/AuthProvider';
import { useCrew } from '@/providers/CrewProvider';
import { WhoButton } from '@/features/members/MembersUI';
import { VersionCheck } from '@/features/nav/version/VersionCheck';
import { InstallAppButton } from '../InstallApp';
import { ButtonSkin } from '../ui/ButtonSkin';
import { Avatar } from '../ui/Avatar';
import { Logo } from '../Logo';
import { guardNav } from './guardNav';
import { warmAdd } from './warmAdd';

export function MobileBar({ onAdd }: { onAdd: () => void }) {
  const { profile } = useCrew();
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const name = profile?.display_name ?? user?.email ?? 'Tú';
  // The phone's back button closes the menu instead of leaving the page. Its links replace the menu's
  // history entry, so back from where they lead returns here in one press.
  useBackToClose(menuOpen, () => setMenuOpen(false));

  useEffect(() => {
    if (!menuOpen) return;
    // Opening moves focus to the first entry, so arrows and Tab start inside the menu.
    const frame = requestAnimationFrame(() =>
      menuRef.current?.querySelector<HTMLElement>('[role="menu"] [role="menuitem"]')?.focus(),
    );
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return;
        setMenuOpen(false);
        triggerRef.current?.focus(); // back where the menu was opened from
      } else if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-line-strong bg-sumi-950/95 shadow-[0_4px_0_-3px_rgb(228_200_143/0.16),0_12px_24px_-12px_rgb(0_0_0/0.7)] lg:hidden">
      <div className="flex h-16 items-center justify-between gap-3 px-4">
        <Link to="/" aria-label="One Shoot · Biblioteca" onClick={guardNav} className="rounded-[10px]">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            aria-label="Añadir vídeo"
            onClick={onAdd}
            {...warmAdd}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.88, rotate: 8 }}
            transition={jelly}
            // REQ-21 · Own layer: the spring scales it without re-rasterising the drop-shadow every frame.
            className="size-11 drop-shadow-[0_6px_10px_rgb(0_0_0/0.5)] will-change-transform"
          >
            <ButtonSkin kind="add" />
          </motion.button>
          <div ref={menuRef} className="relative">
            <motion.button
              ref={triggerRef}
              type="button"
              // P2 · The sections live in the quick menu (bottom right); this one holds the rest.
              aria-label="Más opciones"
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
                <Ellipsis className="size-5 text-washi-muted" />
              )}
            </motion.button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  role="menu"
                  aria-label="Más opciones"
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                    event.preventDefault();
                    const items = Array.from(
                      event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'),
                    );
                    const at = items.indexOf(document.activeElement as HTMLElement);
                    items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
                  }}
                  initial={{ opacity: 0, scale: 0.9, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.12 } }}
                  transition={jelly}
                  style={{ transformOrigin: 'top right' }}
                  className="paper-raised absolute right-0 top-[calc(100%+8px)] w-[min(18rem,calc(100vw-32px))] rounded-[14px] p-2"
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
                  {/* Who this phone is: here, with the rest of «you» settings (the quick menu keeps only sections). */}
                  <WhoButton inMenu onPick={() => setMenuOpen(false)} className="font-bold" />
                  <div className="my-1 h-px bg-line" />
                  <Link
                    role="menuitem"
                    to="/ajustes"
                    replace
                    onClick={(e) => {
                      guardNav(e);
                      setMenuOpen(false);
                    }}
                    className="flex h-11 w-full items-center gap-2.5 rounded-[10px] px-3 text-sm font-bold text-washi-muted transition-colors hover:bg-washi/[0.06] hover:text-washi"
                  >
                    <Settings className="size-4" />
                    Ajustes
                  </Link>
                  <InstallAppButton compact className="my-1" />
                  <Link
                    role="menuitem"
                    to="/privacidad"
                    replace
                    onClick={(e) => {
                      guardNav(e);
                      setMenuOpen(false);
                    }}
                    className="flex h-11 w-full items-center gap-2.5 rounded-[10px] px-3 text-sm font-medium text-washi-muted transition-colors hover:bg-washi/[0.06] hover:text-washi"
                  >
                    <ShieldCheck className="size-4" />
                    Privacidad y condiciones
                  </Link>
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
                  <div className="my-1 h-px bg-line" />
                  <VersionCheck inMenu className="pt-1.5" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
