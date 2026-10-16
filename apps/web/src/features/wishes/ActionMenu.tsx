import { AnimatePresence, motion } from 'motion/react';
import { MoreHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';

export interface MenuAction {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  tone?: 'danger';
  disabled?: boolean;
}

/** «Más acciones» (⋯): a small paper menu; Escape, a tap outside or picking an action closes it. */
export function ActionMenu({ label, actions, className }: { label: string; actions: MenuAction[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') {
          setOpen(false);
          buttonRef.current?.focus();
        }
        return;
      }
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus());
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <motion.button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        whileTap={{ scale: 0.88 }}
        transition={jelly}
        className="grid size-11 place-items-center rounded-[10px] text-washi-muted transition-colors hover:bg-washi/[0.07] hover:text-washi"
      >
        <MoreHorizontal aria-hidden className="size-5" />
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="menu"
            aria-label={label}
            initial={{ opacity: 0, scale: 0.9, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.12 } }}
            transition={jelly}
            style={{ transformOrigin: 'top right' }}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
              e.preventDefault();
              const items = Array.from(
                ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
              );
              const at = items.indexOf(document.activeElement as HTMLElement);
              const next = items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
              next?.focus();
            }}
            className="paper-raised absolute right-0 top-[calc(100%+6px)] z-30 w-64 rounded-[14px] p-1.5"
          >
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                onClick={() => {
                  setOpen(false);
                  action.onSelect();
                }}
                className={cn(
                  'flex h-11 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-sm font-medium transition-colors hover:bg-washi/[0.06] focus-visible:bg-washi/[0.06] disabled:opacity-40',
                  action.tone === 'danger' ? 'text-shu-400' : 'text-washi-muted hover:text-washi',
                )}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
