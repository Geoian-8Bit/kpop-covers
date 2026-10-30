import { AnimatePresence, motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useCalendarUnseen } from '@/data/calendar';
import { openWho, useMe } from '@/data/members';
import { MemberSeal } from '@/features/members/MembersUI';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { useBackToClose } from '@/lib/useBackToClose';
import { MAIN_NAV, WHO_KANJI, WHO_TONE, type NavIcon, type NavTone } from './navItems';
import { activeSectionIndex, quickNavLabel, trapFocusIndex } from './navRules';

/**
 * P1 · The quick menu's plumbing: the destinations, opening and closing (Android back, Escape, a tap outside,
 * picking), focus kept inside while open and handed back to the button, and the button itself. `NavHanafuda` draws
 * the hand of cards on top.
 */

export interface NavEntry {
  id: string;
  label: string;
  short: string;
  kanji: string;
  Icon: NavIcon | null;
  /** null for «¿Quién eres?» (opens the picker). */
  to: string | null;
  active: boolean;
  tone: NavTone;
  /** REQ-05 · Unseen changes there (the calendar): a dot on its card and on the button. */
  dot?: boolean;
}

export interface QuickNavApi {
  open: boolean;
  toggle: () => void;
  close: (returnFocus?: boolean) => void;
  /** Goes to the entry (after `delay` ms, for a closing flourish) or opens «¿Quién eres?». */
  pick: (entry: NavEntry, delay?: number) => void;
  entries: NavEntry[];
  current: NavEntry | null;
  reduce: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** Stage size and the button's centre in it, measured while open. */
  stage: { w: number; h: number; ax: number; ay: number; buttonTop: number } | null;
  /** px kept clear at the top of the stage (the phone's top bar). */
  top: number;
}

const FOCUSABLE = 'a[href], button:not([disabled])';

function visibleFocusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest('[inert]') && el.getClientRects().length > 0,
  );
}

export function useQuickNav(): QuickNavApi {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const me = useMe();
  const calendarUnseen = useCalendarUnseen();
  const reduce = useReducedMotion() ?? false;
  const [stage, setStage] = useState<QuickNavApi['stage']>(null);
  const picking = useRef(false);
  /** A pick waiting for its closing flourish: cancelled if the menu closes first (back, Escape, a tap outside). */
  const pickTimer = useRef<number | undefined>(undefined);
  const cancelPick = () => {
    window.clearTimeout(pickTimer.current);
    pickTimer.current = undefined;
    picking.current = false;
  };

  const activeIndex = activeSectionIndex(pathname, MAIN_NAV);
  const entries = useMemo<NavEntry[]>(
    () => [
      ...MAIN_NAV.map((s, i) => ({
        id: s.to,
        label: s.label,
        short: s.short,
        kanji: s.kanji,
        Icon: s.Icon,
        to: s.to,
        active: i === activeIndex,
        tone: s.tone,
        dot: s.to === '/calendario' && calendarUnseen,
      })),
      {
        id: 'who',
        label: me ? `Eres ${me.name}` : '¿Quién eres?',
        short: me ? me.name : '¿Quién eres?',
        kanji: me ? me.name.trim().charAt(0).toUpperCase() : WHO_KANJI,
        Icon: null,
        to: null,
        active: false,
        tone: WHO_TONE,
      },
    ],
    [activeIndex, me, calendarUnseen],
  );
  const current = entries[activeIndex] ?? null;

  const focusTrigger = () => requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));

  const close = useCallback((returnFocus = true) => {
    // Without this a delayed pick would still navigate (with `replace`) after the menu closed, and back would then
    // skip the page it was opened on.
    cancelPick();
    setOpen(false);
    if (returnFocus) focusTrigger();
  }, []);

  const toggle = useCallback(() => {
    cancelPick();
    setOpen((v) => !v);
  }, []);

  const pick = useCallback(
    (entry: NavEntry, delay = 0) => {
      if (picking.current) return;
      if (entry.to == null) {
        close(true);
        // After focus is back on the button, so the dialog hands it back there too.
        requestAnimationFrame(() => requestAnimationFrame(openWho));
        return;
      }
      if (window.location.pathname === entry.to) {
        close(true);
        return;
      }
      picking.current = true;
      const go = () => {
        pickTimer.current = undefined;
        // Replaces the menu's own history entry: back from the new page returns where it was opened, in one press.
        navigate(entry.to!, { replace: true });
        setOpen(false);
        picking.current = false;
      };
      if (delay > 0) pickTimer.current = window.setTimeout(go, delay);
      else go();
    },
    [close, navigate],
  );

  useEffect(() => () => window.clearTimeout(pickTimer.current), []);

  // Android back / swipe-back closes it.
  useBackToClose(open, () => close(true));

  // Leaving the page closes it (also a navigation it didn't start).
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setOpen(false);
  }, [pathname]);

  // Measure the stage and the button while open (the cards lay out around the button).
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const root = rootRef.current?.getBoundingClientRect();
      const button = triggerRef.current?.getBoundingClientRect();
      if (!root || !button) return;
      setStage({
        w: root.width,
        h: root.height,
        ax: button.left - root.left + button.width / 2,
        ay: button.top - root.top + button.height / 2,
        buttonTop: button.top - root.top,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (rootRef.current) observer.observe(rootRef.current);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [open]);

  // Focus in, Escape out, Tab kept inside, a tap anywhere else closes.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const root = rootRef.current;
      if (!root) return;
      const first =
        root.querySelector<HTMLElement>('[data-nav-entry][aria-current="page"]') ??
        root.querySelector<HTMLElement>('[data-nav-entry]');
      first?.focus({ preventScroll: true });
    });
    const onKey = (event: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(true);
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = visibleFocusables(root);
      const at = nodes.indexOf(document.activeElement as HTMLElement);
      const next = trapFocusIndex(at, nodes.length, event.shiftKey);
      if (next < 0) return;
      event.preventDefault();
      nodes[next]?.focus({ preventScroll: true });
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, [open, close]);

  return {
    open,
    toggle,
    close,
    pick,
    entries,
    current,
    reduce,
    rootRef,
    triggerRef,
    stage: open ? stage : null,
    top: 76,
  };
}

/**
 * The layer: over the whole screen on phones (hidden on desktop, where the side rail stays). While open it is the
 * dialog (it holds its close button, the trigger).
 */
export function QuickNavRoot({ api, children }: { api: QuickNavApi; children: ReactNode }) {
  return (
    <div
      ref={api.rootRef}
      role={api.open ? 'dialog' : undefined}
      aria-modal={api.open ? true : undefined}
      aria-label={api.open ? 'Secciones' : undefined}
      className={cn(
        // Clipped: a card reaching past the screen edge must never make the page scroll sideways.
        'pointer-events-none fixed inset-0 z-[42] overflow-hidden text-washi lg:hidden',
      )}
    >
      {children}
    </div>
  );
}

/** Ink wash over the page while open; a tap on it closes. */
export function QuickNavScrim({ api, className }: { api: QuickNavApi; className?: string }) {
  return (
    <AnimatePresence>
      {api.open && (
        <motion.div
          key="scrim"
          aria-hidden
          className={cn('pointer-events-auto absolute inset-0 bg-sumi-950/60', className)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.2 } }}
          exit={{ opacity: 0, transition: { duration: 0.18, delay: 0.06 } }}
          onClick={() => api.close(true)}
        />
      )}
    </AnimatePresence>
  );
}

/** Where the button sits: bottom right, inside the safe area, within reach of the right thumb. */
export const TRIGGER_POSITION =
  'right-[max(16px,calc(env(safe-area-inset-right)+12px))] bottom-[max(16px,calc(env(safe-area-inset-bottom)+12px))]';

/**
 * The round 56 px button. Its accessible name says where you are; a small tag says it too for a few seconds after
 * arriving at a section. Open, it turns into the close button. `face` draws its closed look.
 */
export function QuickNavTrigger({
  api,
  face,
  className,
}: {
  api: QuickNavApi;
  face: ReactNode;
  className?: string;
}) {
  const { current, open, reduce } = api;
  const dot = api.entries.some((e) => e.dot);
  const [tag, setTag] = useState(true);
  useEffect(() => {
    setTag(true);
    const timer = window.setTimeout(() => setTag(false), 2800);
    return () => window.clearTimeout(timer);
  }, [current?.id]);

  return (
    <motion.button
      ref={api.triggerRef}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={open ? 'Cerrar secciones' : quickNavLabel(current?.label) + (dot ? '. Hay cambios en el calendario' : '')}
      onClick={api.toggle}
      whileTap={{ scale: 0.88 }}
      transition={jelly}
      className={cn(
        'pointer-events-auto absolute z-20 grid size-14 place-items-center rounded-full outline-offset-4',
        TRIGGER_POSITION,
        className,
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {open ? (
          <motion.span
            key="close"
            aria-hidden
            className="absolute inset-0 grid place-items-center rounded-full border-2 border-kin-400 bg-sumi-950 text-washi shadow-[0_8px_18px_-8px_rgb(0_0_0/0.9)]"
            initial={reduce ? { opacity: 0 } : { opacity: 0, rotate: -90, scale: 0.7 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, rotate: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, rotate: 90, scale: 0.7 }}
            transition={jelly}
          >
            <X className="size-6" />
          </motion.span>
        ) : (
          <motion.span
            key="face"
            aria-hidden
            className="absolute inset-0 grid place-items-center"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
            transition={jelly}
          >
            {face}
            {dot && (
              <span
                aria-hidden
                data-unseen-dot
                className="absolute right-0.5 top-0.5 size-3 rounded-full bg-shu-400 ring-2 ring-sumi-950"
              />
            )}
          </motion.span>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {tag && !open && current && (
          <motion.span
            key={current.id}
            aria-hidden
            // Above the button, not beside it: pages put their sticky action bars (/rpd «Empezar», /deseos) to the
            // left of the button, and the tag would cover their text.
            className="pointer-events-none absolute bottom-[calc(100%+8px)] right-0 whitespace-nowrap rounded-full border border-kin-400/40 bg-sumi-950/90 px-2.5 py-1 text-[12px] font-bold leading-[18px] text-washi shadow-[0_6px_14px_-6px_rgb(0_0_0/0.9)]"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={jelly}
          >
            {current.short}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/** The current section's kanji (or the app's mon when you are elsewhere), for the button's face. */
export function CurrentGlyph({ api, className }: { api: QuickNavApi; className?: string }) {
  return (
    <span className={cn('font-display font-extrabold leading-none', className)}>{api.current?.kanji ?? '門'}</span>
  );
}

type EntryLinkProps = Omit<HTMLMotionProps<'a'>, 'href' | 'onClick' | 'ref'> & {
  ref?: (node: HTMLElement | null) => void;
  api: QuickNavApi;
  entry: NavEntry;
  /** ms before navigating (for a closing flourish). */
  delay?: number;
  onPicked?: () => void;
};

/**
 * One destination: a real link for a section (aria-current on yours), a button for «¿Quién eres?». Picking goes
 * through the shared `pick`, so closing, history and focus behave the same however it is picked.
 */
export function EntryLink({ api, entry, delay, onPicked, children, ref, ...rest }: EntryLinkProps) {
  const onClick = (event: MouseEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onPicked?.();
    api.pick(entry, delay);
  };
  const shared = {
    'data-nav-entry': '',
    'aria-current': entry.active ? ('page' as const) : undefined,
    ...rest,
  };
  if (entry.to == null) {
    return (
      <motion.button ref={ref} type="button" {...(shared as HTMLMotionProps<'button'>)} onClick={onClick}>
        {children}
      </motion.button>
    );
  }
  return (
    <motion.a ref={ref} href={entry.to} {...shared} onClick={onClick}>
      {children}
    </motion.a>
  );
}

/** Icon of an entry: its section icon, or the member's seal for «¿Quién eres?». */
export function EntryIcon({ entry, className }: { entry: NavEntry; className?: string }) {
  const me = useMe();
  if (entry.Icon) return <entry.Icon className={cn('size-[18px] shrink-0', className)} />;
  return <MemberSeal member={me} size="sm" />;
}
