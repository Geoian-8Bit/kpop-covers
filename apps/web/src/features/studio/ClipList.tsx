import { formatSpeed, formatTime, type Clip } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { FlipHorizontal2, Pin, Plus, Repeat, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { CLIP_SWATCH, useDeleteClip, useUpdateClip } from '@/data/clips';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { usePlayer } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';

interface ClipListProps {
  clips: Clip[];
  loading: boolean;
  onApply: (clip: Clip) => void;
  onNew: () => void;
}

export function ClipList({ clips, loading, onApply, onNew }: ClipListProps) {
  const activeClipId = usePlayer((s) => s.activeClipId);
  const update = useUpdateClip();
  const remove = useDeleteClip();
  const toast = useToast();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmId) return;
    const timer = setTimeout(() => setConfirmId(null), 2600);
    return () => clearTimeout(timer);
  }, [confirmId]);

  function togglePin(clip: Clip) {
    update.mutate(
      { clip, patch: { is_pinned: !clip.is_pinned } },
      {
        onSuccess: (c) => toast(c.is_pinned ? 'Fijado en acceso rápido' : 'Quitado de acceso rápido', 'success'),
        onError: (err) => toast(friendlyError(err), 'error'),
      },
    );
  }

  function onDelete(clip: Clip) {
    if (confirmId !== clip.id) {
      setConfirmId(clip.id);
      return;
    }
    setConfirmId(null);
    if (activeClipId === clip.id) usePlayer.getState().setActiveClip(null);
    remove.mutate(clip, { onError: (err) => toast(friendlyError(err), 'error') });
  }

  return (
    <aside className="paper flex flex-col rounded-[18px] p-4 sm:p-5 lg:sticky lg:top-[84px] lg:max-h-[calc(100dvh-100px)]">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
        <h2 className="flex items-baseline gap-2 font-display text-xl font-bold">
          Clips
          <span className="tabular font-sans text-sm font-medium text-washi-subtle">{clips.length}</span>
        </h2>
        <Button size="sm" variant="secondary" onClick={onNew}>
          <Plus className="size-4" /> Nuevo
        </Button>
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skeleton h-[60px] rounded-[12px]" />
          ))}
        </div>
      ) : clips.length === 0 ? (
        <div className="mt-6 px-2 pb-4 text-center">
          <p className="font-display text-lg font-bold">Aún no hay clips</p>
          <p className="mt-2 text-sm leading-relaxed text-washi-muted">
            Marca <Kbd>A</Kbd> y <Kbd>B</Kbd> en el tramo difícil y pulsa <Kbd>S</Kbd> para guardarlo con su velocidad y
            espejo.
          </p>
        </div>
      ) : (
        <ul className="-mx-1 mt-3 flex-1 space-y-1 overflow-y-auto px-1 pb-1">
          <AnimatePresence initial={false}>
            {clips.map((clip) => {
              const active = clip.id === activeClipId;
              const confirming = confirmId === clip.id;
              return (
                <motion.li
                  key={clip.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -30, transition: { duration: 0.16 } }}
                  transition={jelly}
                  className="relative"
                >
                  {active && (
                    <motion.span
                      layoutId="clip-active"
                      transition={jelly}
                      className="absolute inset-0 rounded-[12px] border border-ai-500/50 bg-ai-800/70"
                    />
                  )}
                  <div className={cn('relative flex items-center gap-2 rounded-[12px] p-2', !active && 'hover:bg-washi/[0.04]')}>
                    <button
                      type="button"
                      onClick={() => onApply(clip)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] text-left"
                      aria-current={active || undefined}
                    >
                      <span className={cn('grid size-10 shrink-0 place-items-center rounded-[6px]', CLIP_SWATCH[clip.color].dot)}>
                        {active ? <Repeat className="size-4 text-sumi-900" /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{clip.name}</span>
                        <span className="tabular mt-0.5 flex items-center gap-1.5 font-mono text-xs text-washi-muted">
                          {formatTime(clip.start_seconds)}–{formatTime(clip.end_seconds)}
                          <span className="text-washi-subtle">·</span>
                          {formatSpeed(clip.speed)}
                          {clip.mirrored && <FlipHorizontal2 className="size-3 text-ai-300" aria-label="espejo" />}
                        </span>
                      </span>
                    </button>

                    <motion.button
                      type="button"
                      aria-label={clip.is_pinned ? 'Quitar de acceso rápido' : 'Fijar en acceso rápido'}
                      aria-pressed={clip.is_pinned}
                      onClick={() => togglePin(clip)}
                      whileTap={{ scale: 0.7, rotate: -20 }}
                      transition={jelly}
                      className="grid size-9 shrink-0 place-items-center rounded-[8px] text-washi-subtle hover:bg-washi/[0.06] hover:text-washi"
                    >
                      <Pin className={cn('size-4', clip.is_pinned && 'fill-shu-500 text-shu-500')} />
                    </motion.button>

                    <motion.button
                      type="button"
                      layout
                      aria-label={confirming ? `Confirmar borrar ${clip.name}` : `Borrar ${clip.name}`}
                      onClick={() => onDelete(clip)}
                      whileTap={{ scale: 0.85 }}
                      transition={jelly}
                      className={cn(
                        'flex h-9 shrink-0 items-center justify-center gap-1 rounded-[8px] text-xs font-medium',
                        confirming ? 'bg-enji-500 px-3 text-washi' : 'w-9 text-washi-subtle hover:bg-washi/[0.06] hover:text-enji-300',
                      )}
                    >
                      <Trash2 className="size-4" />
                      {confirming && <span>Borrar</span>}
                    </motion.button>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </aside>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-grid h-6 min-w-6 place-items-center rounded-[5px] border border-line-strong bg-sumi-800 px-1.5 font-mono text-[11px] font-medium text-washi">
      {children}
    </kbd>
  );
}
