import { motion } from 'motion/react';
import { Plus, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';

// REQ-27 · Split out of WishesPage.tsx: «Proponer» and the page's tabs.

export type Tab = 'deseos' | 'votaciones';

/** «Proponer»: looks like the search field it opens (the dialog's YouTube picker), the page's first action. */
export function ProposeBar({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      transition={jelly}
      aria-haspopup="dialog"
      // Narrow phones: the hint wraps to two lines (the bar grows) rather than being cut.
      className="well mt-4 flex min-h-13 w-full min-w-0 items-center gap-3 rounded-[12px] py-1.5 pl-4 pr-1.5 text-left transition-colors hover:border-kin-300/50"
    >
      <Search aria-hidden className="size-5 shrink-0 text-washi-subtle" />
      <span className="min-w-0 flex-1 text-balance text-[15px] leading-snug text-washi-subtle">
        Busca una canción o pega un enlace
      </span>
      <span className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[9px] bg-shu-700 px-3.5 text-[14px] font-bold text-washi">
        <Plus aria-hidden className="size-4" /> Proponer
      </span>
    </motion.button>
  );
}

export function Tabs({
  value,
  onChange,
  openCount,
}: {
  value: Tab;
  onChange: (tab: Tab) => void;
  openCount: number;
}) {
  const tabs: { id: Tab; label: string; glyph: string }[] = [
    { id: 'deseos', label: 'Lista de deseos', glyph: '願' },
    { id: 'votaciones', label: 'Votaciones', glyph: '票' },
  ];
  return (
    <div
      role="tablist"
      aria-label="Próxima cover"
      className="sep-t flex gap-1 overflow-x-auto px-2 pt-2 sm:px-7 sm:pt-3"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const next = value === 'deseos' ? 'votaciones' : 'deseos';
        onChange(next);
        requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus());
      }}
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <motion.button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`panel-${t.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            whileTap={{ scale: 0.94 }}
            transition={jelly}
            className={cn(
              'relative flex h-12 shrink-0 items-center gap-2 rounded-t-[10px] px-3.5 text-[15px] font-bold transition-colors',
              active ? 'text-washi' : 'text-washi-subtle hover:text-washi-muted',
            )}
          >
            <span
              aria-hidden
              className={cn('font-display text-[15px]', active ? 'text-shu-400' : 'text-washi-subtle')}
            >
              {t.glyph}
            </span>
            {t.label}
            {t.id === 'votaciones' && openCount > 0 && (
              <span className="tabular rounded-full bg-ai-600/60 px-1.5 text-[12px] text-ai-200">
                <span className="sr-only">, abiertas: </span>
                {openCount}
              </span>
            )}
            {active && (
              <motion.span
                layoutId="wishes-tab"
                transition={jelly}
                className="absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-shu-500"
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
