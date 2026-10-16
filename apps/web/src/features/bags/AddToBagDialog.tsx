import { AnimatePresence, motion } from 'motion/react';
import { Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { bagError, bagsOfKind, itemRef, useAddBagItem, useBags, useBagsItems } from '@/data/bags';
import { cn } from '@/lib/cn';
import { jelly, soft } from '@/lib/motion';
import { useToast } from '@/providers/ToastProvider';
import { BagIcon } from './BagIcon';
import { BagForm, defaultMode } from './BagSettingsDialog';
import { countLabel, MODE_COPY } from './drawRules';

/** A song of the library, a wish of the list (F12: bags of songs take both) or a clip. */
export type BagTarget =
  | { kind: 'songs'; videoId: string; label: string }
  | { kind: 'songs'; wishId: string; label: string }
  | { kind: 'clips'; clipId: string; label: string };

/**
 * «Añadir a una bolsa» from the library (a song) or the studio's clip list (a clip): the bags of that kind, marking
 * the ones it is already in, and a short form to make a new one on the spot.
 */
export function AddToBagDialog({
  open,
  onClose,
  target,
}: {
  open: boolean;
  onClose: () => void;
  target: BagTarget;
}) {
  const bags = useBags();
  const mine = bagsOfKind(bags.data, target.kind);
  const items = useBagsItems(
    mine.map((b) => b.id),
    open,
  );
  const add = useAddBagItem();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [busyBag, setBusyBag] = useState<string | null>(null);
  const ref = 'videoId' in target ? target.videoId : 'wishId' in target ? target.wishId : target.clipId;

  async function addTo(bagId: string, bagName: string) {
    if (busyBag) return;
    setBusyBag(bagId);
    try {
      await add.mutateAsync(
        'videoId' in target
          ? { bag_id: bagId, video_id: target.videoId }
          : 'wishId' in target
            ? { bag_id: bagId, wish_id: target.wishId }
            : { bag_id: bagId, clip_id: target.clipId },
      );
      toast(`Añadido a «${bagName}»`, 'success');
    } catch (err) {
      toast(bagError(err), 'error');
    } finally {
      setBusyBag(null);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        setCreating(false);
        onClose();
      }}
      title="Añadir a una bolsa"
      description={
        <>
          <span className="font-medium text-washi">«{target.label}»</span> · bolsas de{' '}
          {target.kind === 'songs' ? 'canciones' : 'clips'}
        </>
      }
      size="sm"
    >
      {/* Keys typed here never reach the studio's shortcuts (it listens on the window). */}
      <div onKeyDown={(e) => e.stopPropagation()}>
        {bags.isPending ? (
          <div className="grid place-items-center py-8">
            <Spinner className="size-7 text-kin-300" />
          </div>
        ) : bags.isError ? (
          <div className="py-6 text-center">
            <p className="text-sm text-washi-muted">No se pudieron cargar las bolsas.</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void bags.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : (
          <>
            {mine.length > 0 && (
              <ul className="space-y-1.5">
                {mine.map((bag, i) => {
                  const query = items[i];
                  const inside = query?.data?.some((item) => itemRef(item) === ref) ?? false;
                  return (
                    <li key={bag.id}>
                      <motion.button
                        type="button"
                        disabled={inside || busyBag != null || query?.isPending}
                        onClick={() => void addTo(bag.id, bag.name)}
                        whileTap={inside ? undefined : { scale: 0.97 }}
                        transition={jelly}
                        className={cn(
                          'flex min-h-14 w-full items-center gap-3 rounded-[12px] border px-3 py-2 text-left transition-colors',
                          inside
                            ? 'border-ai-400/50 bg-ai-800/40'
                            : 'border-line hover:border-line-strong hover:bg-washi/[0.04]',
                        )}
                      >
                        <span
                          aria-hidden
                          className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-sumi-950 text-kin-300"
                        >
                          <BagIcon />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold text-washi">{bag.name}</span>
                          <span className="block truncate text-[12px] text-washi-subtle">
                            {countLabel(bag.kind, bag.items)} · {MODE_COPY[bag.draw_mode].label}
                          </span>
                        </span>
                        {busyBag === bag.id ? (
                          <Spinner className="size-4.5 text-kin-300" />
                        ) : inside ? (
                          <span className="flex shrink-0 items-center gap-1 text-[13px] font-bold text-ai-300">
                            <Check aria-hidden className="size-4" /> Ya está
                          </span>
                        ) : (
                          <span className="flex shrink-0 items-center gap-1 text-[13px] font-bold text-kin-300">
                            <Plus aria-hidden className="size-4" /> Añadir
                          </span>
                        )}
                      </motion.button>
                    </li>
                  );
                })}
              </ul>
            )}
            {mine.length === 0 && !creating && (
              <p className="pb-2 text-sm leading-relaxed text-washi-muted">
                Aún no hay bolsas de {target.kind === 'songs' ? 'canciones' : 'clips'}. Crea una y queda
                dentro.
              </p>
            )}
            <AnimatePresence initial={false} mode="wait">
              {creating || mine.length === 0 ? (
                <motion.div
                  key="form"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={soft}
                  className={cn(mine.length > 0 && 'sep-t mt-4 pt-5')}
                >
                  <BagForm
                    kinds={[target.kind]}
                    submitLabel="Crear y añadir"
                    onCancel={() => (mine.length ? setCreating(false) : onClose())}
                    onDone={(bag) => {
                      setCreating(false);
                      void addTo(bag.id, bag.name);
                    }}
                    key={`${target.kind}-${defaultMode(target.kind)}`}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="actions"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mt-4 flex flex-wrap items-center justify-between gap-2"
                >
                  <Button variant="secondary" onClick={() => setCreating(true)}>
                    <Plus aria-hidden className="size-4" /> Nueva bolsa
                  </Button>
                  <Link
                    to="/bolsas"
                    onClick={onClose}
                    className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-kin-300 hover:underline"
                  >
                    Ver bolsas
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </Dialog>
  );
}
