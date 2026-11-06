import type { BagDraw } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/Button';
import {
  bagError,
  itemTitle,
  useRemoveBagItem,
  useSetItemOut,
  type BagItemView,
  type BagWithCount,
} from '@/data/bags';
import { CLIP_SWATCH } from '@/data/clips';
import { MemberSeal } from '@/features/members/MembersUI';
import { cn } from '@/lib/cn';
import { jelly, snappy } from '@/lib/motion';
import { thumbCors } from '@/lib/thumbCors';
import { useJoinedPoster } from '@/data/videos';
import { useCrew } from '@/providers/CrewProvider';
import { useToast } from '@/providers/ToastProvider';
import { historyDay, KIND_COPY } from './drawRules';

import { History } from './BagHistory';

// REQ-27 · Split out of BagPage.tsx: the bag's lists in tabs.

type ListTab = 'in' | 'out' | 'history';

/** «En la bolsa», «Fuera» and «Historial», as tabs: compact rows, one list at a time. */
export function BagLists({
  bag,
  inBag,
  out,
  loading,
  draws,
  drawsLoading,
  refilling,
  onRefill,
}: {
  bag: BagWithCount;
  inBag: BagItemView[];
  out: BagItemView[];
  loading: boolean;
  draws: BagDraw[] | undefined;
  drawsLoading: boolean;
  refilling: boolean;
  onRefill: () => void;
}) {
  const [tab, setTab] = useState<ListTab>('in');
  const id = useId();
  const copy = KIND_COPY[bag.kind];
  // «Fuera» disappears when everything is back in: don't leave the tab pointing at nothing.
  const shown: ListTab = tab === 'out' && out.length === 0 ? 'in' : tab;
  const tabs: { value: ListTab; label: string; count?: number }[] = [
    { value: 'in', label: 'En la bolsa', count: inBag.length },
    ...(out.length ? [{ value: 'out' as const, label: 'Fuera', count: out.length }] : []),
    { value: 'history', label: 'Historial' },
  ];

  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const to =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index + tabs.length - 1) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : null;
    if (to == null) return;
    event.preventDefault();
    const next = tabs[to]!;
    setTab(next.value);
    document.getElementById(`${id}-tab-${next.value}`)?.focus();
  }

  return (
    <section
      aria-label="Lo que hay en la bolsa y lo que ha salido"
      className="sep-t px-3 pb-6 pt-3 sm:px-9 sm:pb-8"
    >
      <div
        role="tablist"
        aria-label="Listas de la bolsa"
        className="flex gap-1 overflow-x-auto scrollbar-none"
      >
        {tabs.map((t, i) => {
          const active = t.value === shown;
          return (
            <button
              key={t.value}
              id={`${id}-tab-${t.value}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${id}-panel`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t.value)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                'relative isolate flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] px-3.5 text-[14px] font-bold transition-colors',
                active ? 'text-sumi-900' : 'text-washi-muted hover:text-washi',
              )}
            >
              {active && (
                <motion.span
                  aria-hidden
                  layoutId={`${id}-tab`}
                  transition={jelly}
                  className="absolute inset-0 -z-10 rounded-[10px] bg-washi"
                />
              )}
              {t.label}
              {t.count != null && (
                <span className={cn('tabular text-[12px]', active ? 'text-sumi-700' : 'text-washi-subtle')}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${shown}`}
        tabIndex={0}
        className="mt-2 rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-kin-300/60"
      >
        {shown === 'history' ? (
          <History draws={draws} kind={bag.kind} loading={drawsLoading} />
        ) : loading ? (
          <div className="space-y-2 pt-1">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="skeleton h-12 rounded-[10px]" />
            ))}
          </div>
        ) : shown === 'out' ? (
          <>
            <div className="flex items-center justify-between gap-3 px-1 py-1">
              <p className="text-[13px] text-washi-subtle">
                Lo que ya ha salido. «Rellenar» lo devuelve todo.
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="h-11 shrink-0"
                loading={refilling}
                onClick={onRefill}
              >
                <RotateCcw aria-hidden className="size-4" /> Rellenar
              </Button>
            </div>
            <ItemList items={out} out />
          </>
        ) : inBag.length === 0 ? (
          <p className="px-1 py-3 text-sm text-washi-muted">
            {out.length ? 'Todo ha salido ya. Pulsa «Rellenar» para devolverlo a la bolsa.' : copy.empty}
          </p>
        ) : (
          <ItemList items={inBag} />
        )}
      </div>
    </section>
  );
}

function ItemThumb({ item }: { item: BagItemView }) {
  // REQ-14 · An uploaded song's poster comes from the poster query, combined by id.
  const { activeCrew } = useCrew();
  const videoPoster = useJoinedPoster(item.video, activeCrew?.id);
  if (item.member) return <MemberSeal member={item.member} />;
  if (item.clip) {
    return (
      <span
        aria-hidden
        className={cn('size-8 shrink-0 rotate-[-3deg] rounded-[6px]', CLIP_SWATCH[item.clip.color].dot)}
      />
    );
  }
  const src = videoPoster ?? item.wish?.thumbnail_url ?? item.thumbnail_url;
  return (
    <span
      aria-hidden
      className="relative aspect-video w-14 shrink-0 overflow-hidden rounded-[6px] bg-sumi-950"
    >
      {src && (
        <img
          src={src}
          crossOrigin={thumbCors(src)}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  );
}

function ItemList({ items, out = false }: { items: BagItemView[]; out?: boolean }) {
  const setOut = useSetItemOut();
  const remove = useRemoveBagItem();
  const toast = useToast();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // The delete button that has the focus: its «Confirmar» never runs out while a keyboard or screen reader is on it.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmId || focusedId === confirmId) return;
    // Long enough to reach the second tap without hurry (A11Y-12): 10 s.
    const t = setTimeout(() => setConfirmId(null), 10_000);
    return () => clearTimeout(t);
  }, [confirmId, focusedId]);
  const confirmItem = confirmId ? items.find((i) => i.id === confirmId) : undefined;

  return (
    <>
      {/* A new name on the focused button isn't always read out: the second step is said here too. */}
      <p className="sr-only" aria-live="polite">
        {confirmItem ? `Toca otra vez para borrar «${itemTitle(confirmItem).title}» de la bolsa.` : ''}
      </p>
      <ul className="-mx-1 space-y-0.5">
        <AnimatePresence initial={false}>
          {items.map((item) => {
            const { title, sub } = itemTitle(item);
            const confirming = confirmId === item.id;
            return (
              <motion.li
                key={item.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -24, transition: { duration: 0.15 } }}
                transition={snappy}
                className={cn(
                  // «Fuera» rows aren't faded: the strike-through marks them and the text keeps its contrast.
                  'flex items-center gap-2.5 rounded-[10px] px-1.5 py-1 hover:bg-washi/[0.03]',
                )}
              >
                <ItemThumb item={item} />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block break-words text-[15px] font-medium leading-snug',
                      out ? 'text-washi-muted line-through decoration-washi-subtle/60' : 'text-washi',
                    )}
                  >
                    {title}
                  </span>
                  <span
                    className={cn(
                      'block break-words text-[12px]',
                      out ? 'text-washi-muted' : 'text-washi-subtle',
                    )}
                  >
                    {out ? `Salió el ${historyDay(item.removed_at!)}` : sub}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 px-2.5"
                  onClick={() =>
                    setOut.mutate({ item, out: !out }, { onError: (err) => toast(bagError(err), 'error') })
                  }
                >
                  {out ? 'Devolver' : 'Sacar a mano'}
                </Button>
                {!out && (
                  <motion.button
                    type="button"
                    aria-label={
                      confirming ? `Confirmar: borrar ${title} de la bolsa` : `Borrar ${title} de la bolsa`
                    }
                    onClick={() => {
                      if (!confirming) {
                        setConfirmId(item.id);
                        return;
                      }
                      setConfirmId(null);
                      remove.mutate(item, { onError: (err) => toast(bagError(err), 'error') });
                    }}
                    onFocus={() => setFocusedId(item.id)}
                    onBlur={() => setFocusedId((id) => (id === item.id ? null : id))}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape' && confirming) {
                        e.stopPropagation();
                        setConfirmId(null);
                      }
                    }}
                    whileTap={{ scale: 0.88 }}
                    transition={jelly}
                    className={cn(
                      'flex h-11 shrink-0 items-center justify-center gap-1 rounded-[10px] text-xs font-bold',
                      confirming
                        ? 'bg-enji-500 px-3 text-washi'
                        : 'w-11 text-washi-subtle hover:bg-washi/[0.06] hover:text-enji-300',
                    )}
                  >
                    <Trash2 aria-hidden className="size-4" />
                    {confirming && <span>Borrar</span>}
                  </motion.button>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </>
  );
}
