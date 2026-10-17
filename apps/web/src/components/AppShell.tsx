import { useIsMutating } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Ellipsis, LogOut, Plus, Settings, ShieldCheck } from 'lucide-react';
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
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { Link, NavLink, Outlet, useLocation, useOutletContext } from 'react-router';
import { CLIP_SWATCH, useQuickClips } from '@/data/clips';
import { cn } from '@/lib/cn';
import { easeOutExpo, jelly } from '@/lib/motion';
import { loadAddVideoDialog, prefetchAddVideo, prefetchAddVideoWhenIdle } from '@/lib/prefetch';
import { useBackToClose } from '@/lib/useBackToClose';
import { useAuth } from '@/providers/AuthProvider';
import { useCrew } from '@/providers/CrewProvider';
import { ErrorBoundary } from './ErrorBoundary';
import { InstallAppButton, InstallAppHelp } from './InstallApp';
import { ButtonSkin } from './ui/ButtonSkin';
import { Logo } from './Logo';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { WhoButton, WhoPromptHost } from '@/features/members/MembersUI';
import { MAIN_NAV } from '@/features/nav/navItems';
import { QuickNav, useQuickNavShown } from '@/features/nav/QuickNav';
import { noteSaving } from '@/features/nav/version/appUpdate';
import { VersionCheck } from '@/features/nav/version/VersionCheck';

/** Tells the update check how many saves are in flight, so a new version never reloads the app mid-save. */
function SavingReporter() {
  const saving = useIsMutating();
  useEffect(() => noteSaving(saving), [saving]);
  return null;
}

// Not in the entry chunk: warmed while idle and on hover/press of the add buttons, so the first open is instant.
const AddVideoDialog = lazy(() => loadAddVideoDialog().then((m) => ({ default: m.AddVideoDialog })));

/** Hover/press warm-up for the add buttons. */
const warmAdd = { onPointerEnter: prefetchAddVideo, onPointerDown: prefetchAddVideo, onFocus: prefetchAddVideo };

interface ShellContext {
  openAddVideo: () => void;
}

export function useShell(): ShellContext {
  return useOutletContext<ShellContext>();
}

/** Path + query of the page actually on screen; null while the shell isn't mounted. */
let shownPath: string | null = null;

/**
 * `onClick` for in-app links. The next route may still be loading inside a transition (the old page
 * stays on screen and the URL has already changed): a second tap then would push a duplicate history
 * entry, so it is swallowed — as is a tap on a link to the page already shown.
 */
export function guardNav(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const { pathname, search } = window.location;
  const current = pathname + search;
  const target = new URL(event.currentTarget.href);
  if ((shownPath != null && shownPath !== current) || target.pathname + target.search === current) {
    event.preventDefault();
  }
}

/** The routed page, behind an error boundary that clears on the next navigation. Tracks `shownPath`. */
function Routed({ context, children }: { context: ShellContext; children?: ReactNode }) {
  const { pathname, search } = useLocation();
  useLayoutEffect(() => {
    shownPath = pathname + search;
  }, [pathname, search]);
  useLayoutEffect(
    () => () => {
      shownPath = null;
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

/** Focus for a heading or <main> moved to by script: focusable without entering the Tab order, and no ring. */
function focusLandmark(el: HTMLElement, scroll = false) {
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.setAttribute('data-route-focus', '');
  el.focus({ preventScroll: !scroll });
}

/**
 * After a route change (not the first load, not a change of the query alone such as ?clip=) focus moves to the new
 * page's h1 — or to <main> if none shows up — so a screen reader starts reading the new page and Tab goes on from
 * there. Lazy pages render their heading late: it waits for it, unless the person has moved focus meanwhile.
 */
function useRouteFocus(mainRef: RefObject<HTMLElement | null>) {
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
  const quickNav = useQuickNavShown();

  return (
    <div
      className="min-h-dvh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]"
      // P1 · Room a fixed bar at the bottom right leaves for the quick-menu button (56 px + 16 px margin), only while
      // it shows. Pages use it on phones: `max-lg:pr-[var(--fab-clearance,0px)]`.
      style={quickNav ? ({ '--fab-clearance': 'calc(72px + env(safe-area-inset-right))' } as CSSProperties) : undefined}
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
      <SideRail onAdd={openAddVideo} />
      <div className="min-w-0">
        <MobileBar onAdd={openAddVideo} />
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
      {/* P1 · Phones: the sections and «¿Quién eres?» in the quick menu, bottom right (desktop keeps the rail). */}
      <QuickNav shown={quickNav} />
      <SavingReporter />
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
      <Link to="/" aria-label="One Shoot · Biblioteca" onClick={guardNav} className="mx-3 mt-5 rounded-[10px] px-3 py-1">
        <Logo />
      </Link>

      <div className="mt-6 px-4">
        <Button className="w-full" onClick={onAdd} {...warmAdd}>
          <Plus className="size-4.5" /> Añadir vídeo
        </Button>
      </div>

      <nav aria-label="Principal" className="mt-6 space-y-0.5 px-3">
        {MAIN_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={guardNav}
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
                <item.Icon className="size-4.5" /> {item.label}
              </>
            )}
          </NavLink>
        ))}
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
                onClick={guardNav}
                className="group flex items-center gap-3 rounded-[10px] px-3 py-2 transition-colors hover:bg-washi/[0.05] active:bg-washi/[0.08]"
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
          {!quick.data && (quick.isError || quick.fetchStatus === 'paused') ? (
            // A failed load is not "nothing pinned".
            <li className="px-3 py-1 text-[13px] leading-relaxed text-washi-subtle">
              {quick.fetchStatus === 'paused' || !navigator.onLine ? 'Sin conexión.' : 'No se pudieron cargar.'}{' '}
              <button
                type="button"
                onClick={() => void quick.refetch()}
                className="font-medium text-kin-300 hover:underline"
              >
                Reintentar
              </button>
            </li>
          ) : (
            !quick.isPending &&
            pinned.length === 0 && (
              <li className="px-3 py-1 text-[13px] leading-relaxed text-washi-subtle">
                Fija un clip con la chincheta y aparecerá aquí, a un toque.
              </li>
            )
          )}
        </ul>
      </div>

      <div className="px-4 pb-3">
        <InstallAppButton compact />
        <WhoButton className="mt-1" />
        <NavLink
          to="/ajustes"
          onClick={guardNav}
          className={({ isActive }) =>
            cn(
              'mt-1 flex h-11 items-center gap-2.5 rounded-[10px] px-3 text-sm font-medium transition-colors',
              isActive ? 'bg-washi/[0.07] text-washi' : 'text-washi-muted hover:bg-washi/[0.04] hover:text-washi',
            )
          }
        >
          <Settings className="size-4" /> Ajustes
        </NavLink>
        <Link
          to="/privacidad"
          onClick={guardNav}
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
            className="size-11 drop-shadow-[0_6px_10px_rgb(0_0_0/0.5)]"
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
