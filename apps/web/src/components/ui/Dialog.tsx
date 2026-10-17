import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { useBackToClose } from '@/lib/useBackToClose';
import { soft } from '@/lib/motion';
import { Button } from './Button';
import { initialFocusIndex } from './dialogFocus';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Work in flight (saving, uploading): Escape, the backdrop, back and the X can't close it. */
  busy?: boolean;
  /** Confirmations already offer Cancelar: no extra X in the corner. */
  hideClose?: boolean;
}

const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' } as const;
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function Dialog({ open, onClose, title, description, children, size = 'md', busy = false, hideClose = false }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismiss = () => {
    if (!busyRef.current) onCloseRef.current();
  };
  useBackToClose(open, onClose, busy);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const focusables = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const preferred = panel?.querySelector<HTMLElement>('[data-autofocus]');
      // data-autofocus="desktop": a field that would only pop the phone keyboard for nothing.
      if (preferred?.dataset.autofocus === 'desktop' && window.matchMedia('(pointer: coarse)').matches) {
        panel?.focus();
        return;
      }
      const nodes = focusables();
      // Never the corner X, never a destructive action: confirmations put «Cancelar» first, forms their field.
      const at = initialFocusIndex(
        nodes.map((node) => ({ autofocus: node.hasAttribute('data-autofocus'), close: node.hasAttribute('data-dialog-close') })),
      );
      (preferred ?? nodes[at] ?? panel)?.focus();
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (!busyRef.current) onCloseRef.current();
        return;
      }
      const panel = panelRef.current;
      if (event.key !== 'Tab' || !panel) return;
      const nodes = focusables();
      if (nodes.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      const active = document.activeElement;
      const outside = !panel.contains(active) || active === panel;
      if (event.shiftKey && (outside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (outside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-sumi-950/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.25 } }}
            exit={{ opacity: 0, transition: { duration: 0.16 } }}
            onClick={dismiss}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            // The frame never scrolls (its gold corner fittings stay pinned to the real corners);
            // only the body below the title does.
            className={cn(
              'paper-raised relative flex max-h-[calc(100dvh-24px)] w-full flex-col overflow-hidden rounded-[16px] outline-none',
              widths[size],
            )}
            initial={{ opacity: 0, y: 36, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: soft }}
            exit={{ opacity: 0, y: 14, scale: 0.98, transition: { duration: 0.15, ease: 'easeIn' } }}
          >
            <div className="shrink-0 px-6 pb-5 pt-6 sm:px-7 sm:pt-7">
              <div className="flex items-center gap-3">
                <span aria-hidden className="size-2.5 shrink-0 rotate-45 bg-shu-500" />
                {/* The title may wrap on narrow phones; it never pushes the close button out of the panel. */}
                <h2 id={titleId} className="min-w-0 font-display text-[26px] font-bold leading-tight text-washi">
                  {title}
                </h2>
                <span aria-hidden className="h-px min-w-6 flex-1 bg-gradient-to-r from-washi/25 to-washi/5" />
                {!hideClose && (
                  <Button data-dialog-close variant="ghost" size="icon-sm" aria-label="Cerrar" onClick={dismiss} disabled={busy} className="-mr-2 shrink-0">
                    <X className="size-5" />
                  </Button>
                )}
              </div>
              {description && <p className="mt-2 pl-[22px] text-sm leading-relaxed text-washi-muted">{description}</p>}
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain px-6 pb-6 pt-1 sm:px-7 sm:pb-7">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    // Native fullscreen only shows the fullscreen element's subtree.
    document.fullscreenElement ?? document.body,
  );
}
