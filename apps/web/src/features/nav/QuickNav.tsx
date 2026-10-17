import { X } from 'lucide-react';
import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type LazyExoticComponent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useDesignVariant } from '@/features/lab/labState';
import { cn } from '@/lib/cn';
import { useBackToClose } from '@/lib/useBackToClose';
import { useNavDemoOnScreen } from './navDemoPresence';
import { MAIN_NAV } from './navItems';
import { activeSectionIndex, quickNavHidden, quickNavLabel } from './navRules';
import type { QuickNavProps } from './quickNavCore';

/**
 * P1 · The four quick-menu prototypes on trial (lab moment `nav`). Each is its own chunk, loaded only when it is the
 * one chosen on this device, so the entry chunk doesn't grow. When the product owner picks one, keep that import
 * and delete the other three files.
 */
const LOADERS: Record<string, () => Promise<{ default: ComponentType<QuickNavProps> }>> = {
  sensu: () => import('./prototypes/NavSensu'),
  hanafuda: () => import('./prototypes/NavHanafuda'),
  kamon: () => import('./prototypes/NavKamon'),
  origami: () => import('./prototypes/NavOrigami'),
};

type Prototypes = Record<string, LazyExoticComponent<ComponentType<QuickNavProps>>>;

/** `lazy()` remembers a failed import for good: a retry needs fresh instances. */
const freshPrototypes = (): Prototypes =>
  Object.fromEntries(Object.entries(LOADERS).map(([id, load]) => [id, lazy(load)]));

let prototypes = freshPrototypes();

function useFullscreenActive(): boolean {
  const [on, setOn] = useState(() => typeof document !== 'undefined' && Boolean(document.fullscreenElement));
  useEffect(() => {
    const sync = () => setOn(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  return on;
}

/** Tailwind's `lg` (64rem): from there the side rail is the navigation and the quick menu isn't mounted at all. */
const DESKTOP = '(min-width: 64rem)';

function subscribeDesktop(listener: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia(DESKTOP);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

function useDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(DESKTOP).matches),
    () => false,
  );
}

/** Whether the quick menu shows on this page (phones; the shell also leaves room for it at the bottom). */
export function useQuickNavShown(): boolean {
  const { pathname } = useLocation();
  const fullscreen = useFullscreenActive();
  return !quickNavHidden(pathname, fullscreen);
}

/** Reports a prototype that couldn't load (offline before the precache finished, a failed download). */
class Quiet extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onFail();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The phone's quick menu, bottom right: the prototype chosen in the design lab (Sensu until one is chosen).
 * If its chunk can't load, a plain list of the sections takes its place (the top bar no longer lists them), and the
 * prototype is tried again when the connection comes back. It fades out while a lab demo of the menu is on screen.
 */
export function QuickNav({ shown }: { shown: boolean }) {
  const variant = useDesignVariant('nav');
  const desktop = useDesktop();
  const demoOnScreen = useNavDemoOnScreen();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Another variant is another chunk: give it its chance.
  useEffect(() => setFailed(false), [variant]);

  useEffect(() => {
    if (!failed) return;
    const retry = () => {
      prototypes = freshPrototypes();
      setAttempt((n) => n + 1);
      setFailed(false);
    };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [failed]);

  if (!shown || desktop) return null;
  const Prototype = prototypes[variant] ?? prototypes.sensu!;
  return (
    <div
      // Hidden by visibility after the fade, so nothing in it can be tapped or focused meanwhile.
      className={cn('transition-[opacity,visibility] duration-200', demoOnScreen && 'invisible opacity-0')}
      aria-hidden={demoOnScreen || undefined}
    >
      {failed ? (
        <PlainQuickNav />
      ) : (
        <Quiet key={`${variant}:${attempt}`} onFail={() => setFailed(true)}>
          <Suspense fallback={null}>
            <Prototype key={variant} />
          </Suspense>
        </Quiet>
      )}
    </div>
  );
}

/**
 * Fallback when the chosen prototype can't load: the same corner button, opening a plain list of the sections. It
 * behaves like the prototypes (back, Escape, a tap outside and picking close it; picking replaces the menu's
 * history entry), with nothing but the entry chunk.
 */
function PlainQuickNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const index = activeSectionIndex(pathname, MAIN_NAV);
  const current = MAIN_NAV[index];

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  };
  useBackToClose(open, () => close(true));

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      rootRef.current?.querySelector<HTMLElement>('[aria-current="page"], a')?.focus({ preventScroll: true }),
    );
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, [open]);

  const go = (event: MouseEvent<HTMLAnchorElement>, to: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (to === pathname) {
      close(true);
      return;
    }
    navigate(to, { replace: true });
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      role={open ? 'dialog' : undefined}
      aria-modal={open ? true : undefined}
      aria-label={open ? 'Secciones' : undefined}
      className="pointer-events-none fixed inset-0 z-[42] text-washi"
    >
      {open && (
        <div aria-hidden className="pointer-events-auto absolute inset-0 bg-sumi-950/60" onClick={() => close(true)} />
      )}
      {open && (
        <nav
          aria-label="Secciones"
          className="paper-raised pointer-events-auto absolute bottom-[calc(max(16px,calc(env(safe-area-inset-bottom)+12px))+68px)] right-[max(16px,calc(env(safe-area-inset-right)+12px))] w-60 max-w-[calc(100vw-32px)] rounded-[14px] p-1.5"
        >
          <ul>
            {MAIN_NAV.map((section, i) => (
              <li key={section.to}>
                <a
                  href={section.to}
                  aria-current={i === index ? 'page' : undefined}
                  onClick={(event) => go(event, section.to)}
                  className={cn(
                    'flex min-h-12 items-center gap-3 rounded-[10px] px-3 text-[15px] font-bold',
                    i === index ? 'bg-shu-500/15 text-shu-300' : 'text-washi hover:bg-washi/5',
                  )}
                >
                  <section.Icon className="size-[18px] shrink-0" />
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Cerrar secciones' : quickNavLabel(current?.label)}
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto absolute bottom-[max(16px,calc(env(safe-area-inset-bottom)+12px))] right-[max(16px,calc(env(safe-area-inset-right)+12px))] grid size-14 place-items-center rounded-full border-2 border-kin-400 bg-sumi-950 text-kin-200 shadow-[0_10px_22px_-8px_rgb(0_0_0/0.95)] outline-offset-4"
      >
        {open ? (
          <X aria-hidden className="size-6 text-washi" />
        ) : (
          <span aria-hidden className="font-display text-[19px] font-extrabold leading-none">
            {current?.kanji ?? '門'}
          </span>
        )}
      </button>
    </div>
  );
}
