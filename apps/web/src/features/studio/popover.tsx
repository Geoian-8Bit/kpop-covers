// REQ-27 · Moved out of Transport.tsx unchanged: the gap picker and its popover (move first, optimise later).
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { useBackToClose } from '@/lib/useBackToClose';
import { usePlayer } from '@/player/store';
import { Volume2, VolumeX } from 'lucide-react';
import { motion, useIsPresent } from 'motion/react';
import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { popoverShift, popoverSide, sheetScreen } from './popoverRules';
import { useMenuFocus } from './useMenuFocus';

const GAP_CHOICES = [0, 1, 2, 3, 5, 10] as const;

/**
 * Closes a popover on outside pointer or Escape. Escape is caught before anything else sees it, so
 * closing a menu never also reaches the studio shortcut that clears the A–B range (or leaves fullscreen).
 */
function useDismiss(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    // Escape is live from the first frame; the outside-pointer close waits a tick so the opening
    // tap itself doesn't close the menu.
    window.addEventListener('keydown', onKey, true);
    const id = setTimeout(() => window.addEventListener('pointerdown', onDown), 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [ref, onClose]);
}

/**
 * 7 · The lowest edge of what is pinned over the page above a popover: the top bar and the studio's pinned video
 * (`data-popover-ceiling`). Nothing inside fullscreen (`data-fs`): there only the screen's edge counts.
 */
function popoverCeiling(el: HTMLElement, anchorTop: number): number {
  if (el.closest('[data-fs]')) return 0;
  let ceiling = 0;
  for (const bar of document.querySelectorAll<HTMLElement>('[data-popover-ceiling], header')) {
    if (bar.contains(el)) continue;
    const { position } = getComputedStyle(bar);
    if (position !== 'sticky' && position !== 'fixed') continue;
    const r = bar.getBoundingClientRect();
    if (r.height > 0 && r.bottom > 0 && r.bottom <= anchorTop) ceiling = Math.max(ceiling, r.bottom);
  }
  return ceiling;
}

const SHEET_STYLE = {
  position: 'fixed',
  left: '12px',
  // Clear of the phone's quick-menu button (AppShell sets the room it needs).
  right: 'calc(12px + var(--fab-clearance, 0px))',
  top: 'auto',
  bottom: 'max(12px, env(safe-area-inset-bottom))',
  width: 'auto',
} as const;

/**
 * Keeps an anchored popover on screen: after layout (before paint) it measures where the CSS put it, opens it below
 * its button when the pinned video (or the top bar) would cover it, as a bottom sheet on a phone when it fits on
 * neither side (7), and slides it sideways with `translate` so it never spills past the viewport's edges (the loop's
 * pause panel used to lose its left side on phones). Re-measured on resize and rotation.
 */
function useStayOnScreen(ref: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      el.style.translate = '';
      for (const key of ['position', 'left', 'right', 'top', 'bottom', 'width'] as const) el.style[key] = '';
      const natural = el.getBoundingClientRect();
      const anchor = (el.offsetParent ?? el.parentElement)?.getBoundingClientRect();
      const viewport = document.documentElement.clientWidth || window.innerWidth;
      if (anchor) {
        const side = popoverSide({
          top: natural.top,
          height: natural.height,
          anchorTop: anchor.top,
          anchorBottom: anchor.bottom,
          ceiling: popoverCeiling(el, anchor.top),
          floor: window.innerHeight,
          // A phone on its side counts too (844×390): there the menu fits neither above nor below.
          narrow: sheetScreen({
            width: viewport,
            height: window.innerHeight,
            coarse: window.matchMedia('(pointer: coarse)').matches,
          }),
        });
        if (side === 'sheet') {
          Object.assign(el.style, SHEET_STYLE);
          return;
        }
        if (side === 'below') {
          el.style.top = `calc(100% + ${Math.max(0, Math.round(anchor.top - natural.bottom))}px)`;
          el.style.bottom = 'auto';
        }
      }
      const box = el.getBoundingClientRect();
      const shift = popoverShift(box.left, box.width, viewport);
      el.style.translate = shift ? `${shift}px 0` : '';
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [ref]);
}

export function Popover({
  children,
  onClose,
  className,
  label,
}: {
  children: ReactNode;
  onClose: () => void;
  className?: string;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose);
  useStayOnScreen(ref);
  // Keyboard: focus into the menu, arrows between its items, back to its button on closing.
  useMenuFocus(ref, useIsPresent());
  // The phone's back button closes the menu instead of leaving the song.
  useBackToClose(true, onClose);
  return (
    // The outer box is placed by the caller's classes and only ever shifted; the inner one animates.
    <div ref={ref} className={cn('z-40', className)}>
      <motion.div
        role="menu"
        aria-label={label}
        initial={{ opacity: 0, y: 6, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 4, transition: { duration: 0.1 } }}
        transition={jelly}
        className="rounded-[12px] bg-sumi-950/95 p-2 shadow-xl ring-1 ring-washi/15"
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Small menu to choose the pause between repetitions, with the metronome tick switch. */
export function GapPicker({
  title,
  value,
  onChange,
  onClose,
  className,
}: {
  title: string;
  value: number;
  onChange: (seconds: number) => void;
  onClose: () => void;
  className?: string;
}) {
  const countSound = usePlayer((s) => s.countSound);
  return (
    <Popover label={title} onClose={onClose} className={cn('w-56', className)}>
      <p className="px-2 pb-2 pt-1 text-xs font-bold text-washi-muted">{title}</p>
      <div className="grid grid-cols-3 gap-1">
        {GAP_CHOICES.map((s) => (
          <button
            key={s}
            type="button"
            role="menuitemradio"
            aria-checked={s === value}
            onClick={() => onChange(s)}
            className={cn(
              'tabular h-11 rounded-[8px] font-mono text-[14px] transition-colors',
              s === value ? 'bg-washi text-sumi-900' : 'text-washi hover:bg-washi/10',
            )}
          >
            {s === 0 ? 'No' : `${s} s`}
          </button>
        ))}
      </div>
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={countSound}
        onClick={() => usePlayer.getState().toggleCountSound()}
        className="mt-1 flex h-11 w-full items-center gap-2 rounded-[8px] px-2 text-[13px] text-washi hover:bg-washi/10"
      >
        {countSound ? (
          <Volume2 className="size-4 text-kin-300" />
        ) : (
          <VolumeX className="size-4 text-washi-subtle" />
        )}
        Tic de metrónomo {countSound ? 'activado' : 'silenciado'}
      </button>
    </Popover>
  );
}
