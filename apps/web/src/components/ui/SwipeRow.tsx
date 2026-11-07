import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from 'motion/react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { easeOutExpo, snappy } from '@/lib/motion';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useSize } from '@/lib/useSize';
import {
  actionsWidth,
  CLICK_AFTER_DRAG_MS,
  FINE_POINTER,
  fullSwipeArmed,
  HINT_KEY,
  HINT_PEEK,
  hintPending,
  maxDrag,
  settleSwipe,
  SWIPE_ACTION_WIDTH,
} from './swipeRowRules';

export interface SwipeAction {
  key: string;
  /** Short visible word under the icon («Borrar»). */
  label: string;
  /** Fuller name for screen readers; `label` when absent. */
  ariaLabel?: string;
  icon: ReactNode;
  /** `danger` (enji) for deleting, `accent` (ai), `neutral` (ink) for the rest. */
  tone?: 'danger' | 'accent' | 'neutral';
  /** Looks unavailable but still answers the tap (to say why). */
  dimmed?: boolean;
  /** A full swipe (past ~70% of the row) runs this one. At most one action should have it. */
  primary?: boolean;
  /** The row stays open after the tap (a two-step confirmation that re-labels the button). */
  keepOpen?: boolean;
  onSelect: () => void;
}

interface SwipeRowProps {
  /** 1–3 actions, left to right as revealed (the destructive one last, at the edge). */
  actions: SwipeAction[];
  children: ReactNode;
  /** Off: a plain wrapper (the row's own buttons do the work). Also off with a mouse, always. */
  disabled?: boolean;
  /** This row plays the one-time «peek» that shows the gesture exists (give it to the first row). */
  hint?: boolean;
  /** The clipping frame: give it the row's rounding (and margins). */
  className?: string;
  /** The sliding layer (the row's own surface and padding can live here). */
  contentClassName?: string;
}

// ───────────── Only one row open at a time ─────────────

let openRow: string | null = null;
const listeners = new Set<() => void>();
function setOpenRow(id: string | null) {
  if (openRow === id) return;
  openRow = id;
  for (const listener of listeners) listener();
}
function subscribeOpen(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
/** The peek plays once per page load at most (the stored flag covers later visits). */
let hintPlayed = false;

const TONE: Record<NonNullable<SwipeAction['tone']>, string> = {
  danger: 'bg-enji-600 text-washi',
  accent: 'bg-ai-600 text-washi',
  neutral: 'bg-sumi-700 text-washi',
};

/**
 * A row that slides left under a finger to reveal 1–3 actions behind it, like a native list. Touch only: with a
 * mouse it is a plain wrapper. The row's own buttons must stay (keyboard and screen readers use those).
 */
export function SwipeRow({
  actions,
  children,
  disabled = false,
  hint = false,
  className,
  contentClassName,
}: SwipeRowProps) {
  const id = useId();
  const fine = useMediaQuery(FINE_POINTER);
  const enabled = !disabled && !fine && actions.length > 0;
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const rowWidth = useSize(rootRef).width;
  const width = actionsWidth(actions.length);
  const hasPrimary = actions.some((a) => a.primary);
  const open = useSyncExternalStore(
    subscribeOpen,
    () => openRow === id,
    () => false,
  );
  const x = useMotionValue(0);
  const dragging = useRef(false);
  const dragEndedAt = useRef(-Infinity);
  const [armed, setArmed] = useState(false);
  const reveal = useTransform(x, (v) => `inset(0 0 0 calc(100% - ${Math.max(0, -v)}px))`);

  useMotionValueEvent(x, 'change', (v) => {
    const next = hasPrimary && fullSwipeArmed(-v, rowWidth);
    if (next !== armed) setArmed(next);
  });

  const slideTo = (target: number) => {
    animate(x, target, reduce ? { duration: 0 } : snappy);
  };

  // Closed from outside (another row opened, a tap elsewhere, a scroll) or switched off: slide home.
  useEffect(() => {
    if ((!open || !enabled) && !dragging.current) animate(x, 0, reduce ? { duration: 0 } : snappy);
    if (!enabled && openRow === id) setOpenRow(null);
  }, [open, enabled, reduce, x, id]);

  useEffect(
    () => () => {
      if (openRow === id) setOpenRow(null);
    },
    [id],
  );

  // Open: a tap outside or any scroll closes it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenRow(null);
    };
    const onScroll = () => setOpenRow(null);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  // Discovery: the first time on this device, the hinted row peeks out and back.
  useEffect(() => {
    if (!hint || !enabled || reduce || hintPlayed) return;
    if (!hintPending(() => localStorage.getItem(HINT_KEY))) return;
    const timer = setTimeout(() => {
      if (hintPlayed) return; // another hinted row got there first
      hintPlayed = true;
      try {
        localStorage.setItem(HINT_KEY, '1');
      } catch {
        // Can't remember it: it simply may play again next visit.
      }
      if (dragging.current || openRow) return;
      void animate(x, -HINT_PEEK, { duration: 0.28, ease: easeOutExpo }).then(() => {
        if (!dragging.current && openRow !== id) animate(x, 0, snappy);
      });
    }, 900);
    return () => clearTimeout(timer);
  }, [hint, enabled, reduce, x, id]);

  function onDragStart() {
    dragging.current = true;
    setOpenRow(id);
  }

  function onDragEnd(event: PointerEvent, info: PanInfo) {
    dragging.current = false;
    dragEndedAt.current = event.timeStamp;
    const settle = settleSwipe({
      offset: x.get(),
      velocity: info.velocity.x,
      actionsWidth: width,
      rowWidth,
      hasPrimary,
    });
    if (settle === 'open') {
      slideTo(-width);
      setOpenRow(id);
      return;
    }
    slideTo(0);
    if (openRow === id) setOpenRow(null);
    if (settle === 'primary') actions.find((a) => a.primary)?.onSelect();
  }

  // After a drag, the lifted finger's click is not a tap; on an open row a tap only closes it. Keyboard clicks pass.
  function onClickCapture(e: MouseEvent) {
    if (!enabled || e.detail === 0) return;
    const afterDrag = e.timeStamp - dragEndedAt.current < CLICK_AFTER_DRAG_MS;
    if (!afterDrag && !open) return;
    e.preventDefault();
    e.stopPropagation();
    if (!afterDrag) setOpenRow(null);
  }

  function choose(action: SwipeAction) {
    if (!action.keepOpen) setOpenRow(null);
    action.onSelect();
  }

  return (
    <div ref={rootRef} className={cn('relative', enabled && 'overflow-hidden', className)}>
      {enabled && (
        <motion.div
          data-swipe-actions=""
          // Closed: out of the accessibility tree too (the row's own buttons stay for keyboard and readers).
          inert={!open}
          aria-hidden={!open}
          style={{ clipPath: reveal }}
          className="absolute inset-0 flex justify-end bg-sumi-800"
        >
          {actions.map((action) => {
            const grow = armed && action.primary;
            return (
              <button
                key={action.key}
                type="button"
                aria-label={action.ariaLabel ?? action.label}
                onClick={() => choose(action)}
                style={grow ? undefined : { width: SWIPE_ACTION_WIDTH }}
                className={cn(
                  'flex min-h-11 shrink-0 flex-col justify-center gap-1 px-1 text-[12px] font-bold leading-none transition-[filter] active:brightness-90',
                  grow ? 'flex-1 items-end pr-6' : 'items-center',
                  TONE[action.tone ?? 'neutral'],
                  action.dimmed && 'text-washi/45',
                )}
              >
                <span aria-hidden className="grid size-5 place-items-center [&>svg]:size-5">
                  {action.icon}
                </span>
                <span className="max-w-full truncate">{action.label}</span>
              </button>
            );
          })}
        </motion.div>
      )}
      <motion.div
        drag={enabled ? 'x' : false}
        dragDirectionLock
        dragConstraints={{ left: -maxDrag(width, rowWidth, hasPrimary), right: 0 }}
        dragElastic={{ left: 0.12, right: 0.04 }}
        dragMomentum={false}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClickCapture={onClickCapture}
        style={{ x, touchAction: enabled ? 'pan-y' : undefined }}
        className={cn('relative', contentClassName)}
      >
        {children}
      </motion.div>
    </div>
  );
}
