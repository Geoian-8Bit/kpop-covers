import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { soft } from '@/lib/motion';
import { Button } from './Button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
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

export function Dialog({ open, onClose, title, description, children, size = 'md' }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const focusables = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const preferred = panel?.querySelector<HTMLElement>('[data-autofocus]');
      const nodes = focusables();
      // nodes[0] is the close button; prefer the first real field/control after it.
      (preferred ?? nodes[1] ?? nodes[0] ?? panel)?.focus();
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
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
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={cn(
              'paper-raised relative max-h-[calc(100dvh-24px)] w-full overflow-y-auto rounded-[16px] p-6 outline-none sm:p-7',
              widths[size],
            )}
            initial={{ opacity: 0, y: 36, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: soft }}
            exit={{ opacity: 0, y: 14, scale: 0.98, transition: { duration: 0.15, ease: 'easeIn' } }}
          >
            <div className="mb-6">
              <div className="flex items-center gap-3">
                <span aria-hidden className="size-2.5 shrink-0 rotate-45 bg-shu-500" />
                <h2 id={titleId} className="shrink-0 font-display text-[26px] font-bold leading-tight text-washi">
                  {title}
                </h2>
                <span aria-hidden className="h-px min-w-6 flex-1 bg-gradient-to-r from-washi/25 to-washi/5" />
                <Button variant="ghost" size="icon-sm" aria-label="Cerrar" onClick={onClose} className="-mr-2">
                  <X className="size-5" />
                </Button>
              </div>
              {description && <p className="mt-2 pl-[22px] text-sm leading-relaxed text-washi-muted">{description}</p>}
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
