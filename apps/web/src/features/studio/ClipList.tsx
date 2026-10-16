import { formatSpeed, formatTime, type Clip } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { FlipHorizontal2, Pin, Plus, Repeat, Trash2, ZoomIn } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { CLIP_SWATCH, useDeleteClip, useUpdateClip } from '@/data/clips';
import { AddToBagButton } from '@/features/bags/AddToBagButton';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { usePlayer } from '@/player/store';
import { clipHasZoom, zoomLabel, zoomOfClip } from '@/player/zoom';
import { useToast } from '@/providers/ToastProvider';

interface ClipListProps {
  clips: Clip[];
  loading: boolean;
  onApply: (clip: Clip) => void;
  onNew: () => void;
}

export function ClipList({ clips, loading, onApply, onNew }: ClipListProps) {
  const activeClipId = usePlayer((s) => s.activeClipId);
  const ready = usePlayer((s) => s.ready);
  const update = useUpdateClip();
  const remove = useDeleteClip();
  const toast = useToast();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  /** When the delete button was armed: a fast double tap must not skip the confirmation. */
  const armedAt = useRef(0);

  useEffect(() => {
    if (!confirmId) return;
    const timer = setTimeout(() => setConfirmId(null), 2600);
    return () => clearTimeout(timer);
  }, [confirmId]);

  function togglePin(clip: Clip) {
    // The pin icon flips at once (optimistic), so only a failure needs a message.
    update.mutateAsync({ clip, patch: { is_pinned: !clip.is_pinned } }).catch((err) => toast(friendlyError(err), 'error'));
  }

  function onDelete(clip: Clip) {
    if (confirmId !== clip.id) {
      armedAt.current = performance.now();
      setConfirmId(clip.id);
      return;
    }
    if (performance.now() - armedAt.current < 400) return;
    setConfirmId(null);
    if (activeClipId === clip.id) usePlayer.getState().setActiveClip(null);
    remove.mutateAsync(clip).catch((err) => toast(friendlyError(err), 'error'));
  }

  return (
    <aside className="flex flex-col p-5 sm:p-6 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-48px)]">
      <div className="flex items-center gap-3">
        <SectionTitle
          className="flex-1"
          glyph="帖"
          aside={<span className="tabular text-sm font-medium text-washi-subtle">{clips.length}</span>}
        >
          Clips
        </SectionTitle>
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
                      className="absolute inset-0 rounded-[12px] border border-ai-400/60 bg-ai-700/45"
                    />
                  )}
                  <div className={cn('relative flex items-center gap-2 rounded-[12px] p-2', !active && 'hover:bg-washi/[0.04]')}>
                    <button
                      type="button"
                      onClick={() => onApply(clip)}
                      disabled={!ready}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] text-left transition-[opacity,scale] duration-150 active:scale-[0.98] disabled:opacity-60"
                      aria-current={active || undefined}
                    >
                      <span className={cn('grid size-10 shrink-0 rotate-[-3deg] place-items-center rounded-[5px] shadow-[inset_0_0_0_3px_rgb(0_0_0/0.08),inset_0_0_0_4px_rgb(243_236_223/0.4)]', CLIP_SWATCH[clip.color].dot)}>
                        {active ? <Repeat className="size-4 text-sumi-900" /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{clip.name}</span>
                        <span className="tabular mt-0.5 flex items-center gap-1.5 whitespace-nowrap font-mono text-xs text-washi-muted">
                          {formatTime(clip.start_seconds)}–{formatTime(clip.end_seconds)}
                          <span className="text-washi-subtle">·</span>
                          {formatSpeed(clip.speed)}
                          {clip.mirrored && <FlipHorizontal2 className="size-3 shrink-0 text-ai-300" aria-label="espejo" />}
                          {clipHasZoom(clip) && (
                            <ZoomIn className="size-3 shrink-0 text-kin-300" aria-label={`ampliado ${zoomLabel(zoomOfClip(clip))}`} />
                          )}
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

                    <AddToBagButton className="size-9" target={{ kind: 'clips', clipId: clip.id, label: clip.name }} />

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
