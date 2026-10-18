import { AnimatePresence, motion } from 'motion/react';
import { AudioLines, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { VoiceSplitControl } from '@/features/voice/VoiceSplitControl';
import { cn } from '@/lib/cn';
import { jelly, snappy } from '@/lib/motion';
import { useBackToClose } from '@/lib/useBackToClose';
import { fsChrome } from './fullscreenChrome';
import { fsVoiceButton } from './fsVoiceRules';
import { useVoiceSplit } from './useVoiceSplit';

/** What Tab reaches: the roving radios' unchosen modes (`tabindex=-1`) are left out, as the browser does. */
const TABBABLE = 'button:not([disabled]), [href], [tabindex]';
const tabbable = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter((el) => el.tabIndex >= 0);

/**
 * 46 · «Todo / Sin voz / Voz» without leaving fullscreen: one button in the top bar (it hides with the rest of the
 * controls), shown only where the split works, as under the player. It opens a low panel under the bar — the three
 * modes and «Cerrar» in one row, no wave — so the video playing behind (the phone is on its side, 844×390 or
 * 667×375) stays in sight and the progress line is never covered. The state is the player's (store.ts), so both
 * views always agree. Mounted only while fullscreen is on.
 *
 * «Atrás» closes only the panel in the CSS fullscreen (iPhone). In Android's native fullscreen the browser takes that
 * gesture to leave fullscreen first (a page can't keep it): the panel goes with fullscreen, and its history entry too.
 *
 * The wrapper is not positioned: the panel sits against the top bar, whatever the button's place in it.
 */
export function FsVoiceButton() {
  const [open, setOpen] = useState(false);
  const { mode, available, monoLike, setMode } = useVoiceSplit(open);
  const view = fsVoiceButton(mode, available);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const shownOpen = open && view.shown;

  // The split went away (file error, engine reload) with the panel open: closed for good, so it never comes back
  // on its own when the file returns.
  useEffect(() => {
    if (!view.shown) setOpen(false);
  }, [view.shown]);

  // An open panel keeps the controls up (they don't hide under it).
  useEffect(() => {
    fsChrome.setMenu(shownOpen);
    return () => fsChrome.setMenu(false);
  }, [shownOpen]);

  const close = (focusBack = true) => {
    setOpen(false);
    if (focusBack && panelRef.current?.contains(document.activeElement)) buttonRef.current?.focus();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useBackToClose(shownOpen, () => closeRef.current());
  useEffect(() => {
    if (!shownOpen) return;
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      // The chosen mode first (a radio group: Tab lands on it), else the first thing that takes focus.
      const target = panel?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ?? (panel && tabbable(panel)[0]);
      target?.focus({ preventScroll: true });
    });
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      closeRef.current(false);
      // The tap only closes the panel: its click doesn't go on to the stage (pause/play) or a control.
      const swallow = (click: MouseEvent) => {
        click.preventDefault();
        click.stopPropagation();
        stop();
      };
      const stop = () => {
        clearTimeout(timer);
        window.removeEventListener('click', swallow, true);
      };
      const timer = setTimeout(stop, 700);
      window.addEventListener('click', swallow, true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Before fullscreen's own Escape: it closes the panel only.
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      // Modal while open (the studio's shortcuts are off): Tab stays in the panel.
      const panel = panelRef.current;
      if (e.key !== 'Tab' || !panel) return;
      const nodes = tabbable(panel);
      if (!nodes.length) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      const outside = !panel.contains(document.activeElement);
      if (e.shiftKey && (outside || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (outside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [shownOpen]);

  if (!view.shown) return null;
  return (
    <div className="fs-hit pointer-events-none shrink-0">
      <motion.button
        ref={buttonRef}
        type="button"
        aria-label={view.label}
        aria-haspopup="dialog"
        aria-expanded={shownOpen}
        onClick={() => (open ? close() : setOpen(true))}
        whileTap={{ scale: 0.88 }}
        transition={jelly}
        className={cn(
          '-my-1.5 flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-2.5 transition-colors hover:bg-washi/15 active:bg-washi/20',
          view.tag || shownOpen ? 'text-kin-300' : 'text-washi',
        )}
      >
        <AudioLines aria-hidden className="size-5 shrink-0" />
        {view.tag && (
          <span aria-hidden className="whitespace-nowrap text-[13px] font-bold">
            {view.tag}
          </span>
        )}
      </motion.button>
      <AnimatePresence>
        {shownOpen && (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Voz y música"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            transition={snappy}
            className={cn(
              // Just under the button: one row, ~60 px (~76 with the mono line), far above the progress line.
              'absolute right-[max(12px,env(safe-area-inset-right))] top-[calc(max(12px,env(safe-area-inset-top))+48px)] z-10',
              'flex w-[min(400px,calc(100%-24px))] origin-top-right items-start gap-1 rounded-[14px]',
              'bg-sumi-950/90 p-1.5 text-washi shadow-xl ring-1 ring-washi/15',
            )}
          >
            <VoiceSplitControl
              mode={mode}
              onChange={setMode}
              available={available}
              monoLike={monoLike}
              bare
              className="flex-1"
            />
            <button
              type="button"
              aria-label="Cerrar"
              onClick={() => close()}
              className="grid size-11 shrink-0 place-items-center rounded-[10px] text-washi-muted transition-colors hover:bg-washi/10 hover:text-washi"
            >
              <X aria-hidden className="size-4.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
