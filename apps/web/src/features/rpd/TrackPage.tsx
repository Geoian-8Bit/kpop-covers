import type { Track } from '@coverscape/shared';
import { formatTime } from '@coverscape/shared';
import { AnimatePresence, motion, Reorder, useDragControls } from 'motion/react';
import { ArrowLeft, GripVertical, Play, Plus, Shuffle, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { guardNav, Page } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { LiveMessage, MoveArrows } from '@/components/ui/MoveArrows';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { bagError, bagsOfKind, useAllClips, useBagItems, useBags } from '@/data/bags';
import { CLIP_SWATCH } from '@/data/clips';
import {
  optionsPatch,
  useAddTrackItems,
  useDeleteTrack,
  useRemoveTrackItem,
  useReorderTrack,
  useTrack,
  useTrackItems,
  useUpdateTrack,
  type TrackItemView,
} from '@/data/tracks';
import { BagIcon } from '@/features/bags/BagIcon';
import { countLabel } from '@/features/bags/drawRules';
import { ClipPickList, toggleIn } from '@/features/bags/Pickers';
import { cn } from '@/lib/cn';
import { jelly, snappy, soft } from '@/lib/motion';
import { useAnnouncer } from '@/lib/reorderA11y';
import { useToast } from '@/providers/ToastProvider';
import { newDraft, setRoundDraft } from './roundDraft';
import { RoundOptionsFields } from './RoundOptionsFields';
import {
  OPENED_IN_APP,
  optionsFromTrack,
  positionPatches,
  reorder,
  shuffle,
  spreadBy,
  type RoundOptions,
} from './roundRules';
import { SaveTrackDialog } from './SaveTrackDialog';

/** F14 · /rpd/pista/:trackId: a saved track — order (drag or buttons), add, remove, options, mix again, play. */
export function TrackPage() {
  const { trackId } = useParams();
  const track = useTrack(trackId);
  if (track.isPending) {
    return (
      <Page className="grid min-h-[60dvh] place-items-center">
        <Spinner className="size-8 text-kin-300" label="Cargando la pista" />
      </Page>
    );
  }
  if (!track.data) {
    return (
      <Page className="px-2.5 py-3 sm:px-5 sm:py-5">
        <div className="paper mx-auto max-w-xl rounded-[12px] px-6 py-12 text-center">
          <h1 className="font-display text-2xl font-bold">
            {track.isError ? 'No pudimos cargar la pista' : 'Esta pista ya no existe'}
          </h1>
          <Link
            to="/rpd"
            onClick={guardNav}
            className="mt-6 inline-flex min-h-11 items-center font-bold text-kin-300 hover:underline"
          >
            Volver a Random Play Dance
          </Link>
        </div>
      </Page>
    );
  }
  return <TrackEditor key={track.data.id} track={track.data} />;
}

function TrackEditor({ track }: { track: Track }) {
  const items = useTrackItems(track.id);
  const update = useUpdateTrack();
  const reorderMut = useReorderTrack();
  const removeItem = useRemoveTrackItem();
  const deleteTrack = useDeleteTrack();
  const toast = useToast();
  const navigate = useNavigate();
  const [order, setOrder] = useState<TrackItemView[]>([]);
  const [announcement, announce] = useAnnouncer();
  const dragging = useRef(false);
  const [mix, setMix] = useState<TrackItemView[] | null>(null);
  const [savingNew, setSavingNew] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(track.name);

  // Follow the server unless a drag is in progress.
  useEffect(() => {
    if (!dragging.current && items.data) setOrder(items.data);
  }, [items.data]);
  useEffect(() => setName(track.name), [track.name]);

  const options = optionsFromTrack(track, order.length || 1);
  const shown = mix ?? order;
  const playable = shown.filter((i) => i.clip?.video).length;

  function saveOptions(patch: Partial<RoundOptions>) {
    update.mutate(
      { id: track.id, patch: optionsPatch(patch) },
      { onError: (err) => toast(bagError(err), 'error') },
    );
  }

  function commit(next: TrackItemView[]) {
    const patches = positionPatches(next);
    if (!patches.length) return;
    reorderMut.mutate(
      { trackId: track.id, ordered: next, patches },
      { onError: (err) => toast(bagError(err), 'error') },
    );
  }

  function move(from: number, to: number) {
    const next = reorder(order, from, to);
    setOrder(next);
    commit(next);
  }

  function rename(event: FormEvent) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean || clean === track.name) return setName(track.name);
    update.mutate(
      { id: track.id, patch: { name: clean } },
      {
        onSuccess: () => toast('Nombre guardado', 'success'),
        onError: (err) => toast(bagError(err), 'error'),
      },
    );
  }

  function play() {
    const list = shown.map((i) => i.clip_id);
    setRoundDraft(
      newDraft(list, options, `Pista «${track.name}»${mix ? ' (mezcla nueva)' : ''}`, mix ? null : track.id),
    );
    navigate('/rpd/jugar', { state: OPENED_IN_APP }); // «Salir» steps back to this track
  }

  function remix() {
    setMix(spreadBy(shuffle(order), (i) => i.clip?.video_id ?? i.clip_id));
  }

  return (
    <Page className="px-2.5 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-4xl rounded-[10px] sm:rounded-[12px]">
        <header className="px-5 pb-5 pt-5 sm:px-9 sm:pt-7">
          <Link
            to="/rpd"
            onClick={guardNav}
            className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-sm font-medium text-washi-muted hover:text-washi"
          >
            <ArrowLeft aria-hidden className="size-4" /> Random Play Dance
          </Link>
          <form onSubmit={rename} className="mt-2 flex flex-wrap items-end gap-2">
            <Field
              label="Nombre de la pista"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onBlur={(e) => rename(e as unknown as FormEvent)}
              className="min-w-0 flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Borrar la pista"
              onClick={() => setConfirmDelete(true)}
              className="mb-0.5"
            >
              <Trash2 className="size-5" />
            </Button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="lg" onClick={play} disabled={!playable}>
              <Play aria-hidden className="size-5" /> Reproducir
            </Button>
            <Button size="lg" variant="secondary" onClick={remix} disabled={order.length < 2}>
              <Shuffle aria-hidden className="size-5" /> Volver a mezclar
            </Button>
          </div>
        </header>

        <section aria-labelledby="track-options" className="sep-t px-5 py-7 sm:px-9">
          <SectionTitle id="track-options" glyph="式" className="mb-4">
            Opciones
          </SectionTitle>
          <RoundOptionsFields idPrefix={`track-${track.id}`} value={options} onChange={saveOptions} />
        </section>

        <section aria-labelledby="track-clips" className="sep-t px-5 pb-9 pt-7 sm:px-9">
          <div className="flex items-center gap-3">
            <SectionTitle
              id="track-clips"
              glyph="帖"
              className="flex-1"
              aside={<span className="tabular text-sm font-medium text-washi-subtle">{order.length}</span>}
            >
              Clips
            </SectionTitle>
            <Button size="sm" variant="secondary" className="h-11" onClick={() => setAdding(true)}>
              <Plus aria-hidden className="size-4" /> Añadir
            </Button>
          </div>

          <AnimatePresence initial={false}>
            {mix && (
              <motion.div
                key="mix"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={soft}
                className="mt-4 rounded-[12px] border border-kin-400/50 bg-kin-400/10 p-3"
                role="region"
                aria-label="Mezcla nueva sin guardar"
              >
                <p className="text-sm font-bold text-washi">Orden nuevo, sin guardar</p>
                <p className="text-[13px] text-washi-muted">La pista sigue como estaba hasta que elijas.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="h-11"
                    onClick={() => {
                      const next = mix.map((i) => i);
                      setOrder(next);
                      commit(next);
                      setMix(null);
                      toast('Pista guardada con el orden nuevo', 'success');
                    }}
                  >
                    Guardar encima
                  </Button>
                  <Button size="sm" variant="secondary" className="h-11" onClick={() => setSavingNew(true)}>
                    Guardar como pista nueva
                  </Button>
                  <Button size="sm" variant="ghost" className="h-11" onClick={remix}>
                    <Shuffle aria-hidden className="size-4" /> Otra vez
                  </Button>
                  <Button size="sm" variant="ghost" className="h-11" onClick={() => setMix(null)}>
                    <X aria-hidden className="size-4" /> Descartar
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {items.isPending ? (
            <div className="mt-4 space-y-2">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="skeleton h-14 rounded-[12px]" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <p className="mt-4 text-sm text-washi-muted">
              La pista está vacía. Añade clips de la biblioteca o de una bolsa.
            </p>
          ) : mix ? (
            <ol className="mt-3 space-y-1">
              {mix.map((item, i) => (
                <li key={item.id} className="flex items-center gap-3 rounded-[12px] px-2 py-1.5">
                  <ItemBody item={item} index={i} />
                </li>
              ))}
            </ol>
          ) : (
            <Reorder.Group axis="y" values={order} onReorder={setOrder} className="mt-3 space-y-1" as="ol">
              {order.map((item, i) => (
                <TrackRow
                  key={item.id}
                  item={item}
                  index={i}
                  count={order.length}
                  onDragStart={() => (dragging.current = true)}
                  onDragEnd={() => {
                    dragging.current = false;
                    commit(order);
                  }}
                  onMove={move}
                  announce={announce}
                  onRemove={() =>
                    removeItem.mutate(item, { onError: (err) => toast(bagError(err), 'error') })
                  }
                />
              ))}
            </Reorder.Group>
          )}
          <LiveMessage message={announcement} />
          {order.length > 1 && !mix && (
            <p className="mt-2 text-[12px] text-washi-subtle">
              Arrastra por el asa o usa las flechas para cambiar el orden.
            </p>
          )}
        </section>
      </div>

      <AddClipsDialog open={adding} onClose={() => setAdding(false)} trackId={track.id} existing={order} />
      <SaveTrackDialog
        open={savingNew}
        onClose={() => setSavingNew(false)}
        clipIds={(mix ?? order).map((i) => i.clip_id)}
        options={options}
        suggestedName={`${track.name} (mezcla)`.slice(0, 80)}
        onSaved={(id) => {
          setMix(null);
          navigate(`/rpd/pista/${id}`);
        }}
      />
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        busy={deleteTrack.isPending}
        hideClose
        title="¿Borrar la pista?"
        description={
          <>
            Se borra <span className="font-medium text-washi">«{track.name}»</span> para todo el grupo. Los
            clips no se tocan.
          </>
        }
        size="sm"
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleteTrack.isPending}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={deleteTrack.isPending}
            onClick={() =>
              deleteTrack.mutate(track, {
                onSuccess: () => {
                  toast('Pista borrada', 'success');
                  navigate('/rpd', { replace: true });
                },
                onError: (err) => toast(bagError(err), 'error'),
              })
            }
          >
            Borrar
          </Button>
        </div>
      </Dialog>
    </Page>
  );
}

function ItemBody({ item, index }: { item: TrackItemView; index: number }) {
  const clip = item.clip;
  return (
    <>
      <span className="tabular hidden w-6 shrink-0 text-right font-mono text-[13px] text-washi-subtle sm:inline">
        {index + 1}
      </span>
      {clip ? (
        <span
          aria-hidden
          className={cn('size-7 shrink-0 rotate-[-3deg] rounded-[5px]', CLIP_SWATCH[clip.color].dot)}
        />
      ) : (
        <span
          aria-hidden
          className="size-7 shrink-0 rounded-[5px] border border-dashed border-washi-subtle/60"
        />
      )}
      <span className="min-w-0 flex-1">
        {clip ? (
          <>
            <span className="block truncate text-[15px] font-medium text-washi">
              {clip.video?.title ?? clip.name}
            </span>
            <span className="tabular block truncate text-[12px] text-washi-subtle">
              {clip.name} · {formatTime(clip.start_seconds)}–{formatTime(clip.end_seconds)}
            </span>
          </>
        ) : (
          <>
            <span className="block truncate text-[15px] font-medium text-washi-muted">No disponible</span>
            <span className="block truncate text-[12px] text-washi-subtle">
              El clip se borró: se salta al reproducir
            </span>
          </>
        )}
      </span>
    </>
  );
}

function TrackRow({
  item,
  index,
  count,
  onDragStart,
  onDragEnd,
  onMove,
  announce,
  onRemove,
}: {
  item: TrackItemView;
  index: number;
  count: number;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (from: number, to: number) => void;
  announce: (message: string) => void;
  onRemove: () => void;
}) {
  const controls = useDragControls();
  const label = item.clip ? `${item.clip.video?.title ?? ''} · ${item.clip.name}` : 'No disponible';
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      transition={snappy}
      whileDrag={{ scale: 1.02, boxShadow: '0 16px 28px -14px rgb(0 0 0 / 0.9)' }}
      className="relative flex items-center gap-2 rounded-[12px] bg-sumi-850 px-1.5 py-1.5 sm:gap-3"
      as="li"
    >
      {/* Pointer only: the keyboard (and screen readers) use ↑ ↓, so the handle is not a tab stop. */}
      <span
        aria-hidden
        onPointerDown={(e) => {
          e.preventDefault();
          controls.start(e);
        }}
        className="grid h-11 w-8 shrink-0 cursor-grab touch-none place-items-center rounded-[8px] text-washi-subtle hover:bg-washi/[0.06] hover:text-washi active:cursor-grabbing"
      >
        <GripVertical className="size-4.5" />
      </span>
      <ItemBody item={item} index={index} />
      <div className="flex shrink-0 items-center">
        <MoveArrows index={index} total={count} name={label} onMove={(delta) => onMove(index, index + delta)} announce={announce} />
        <motion.button
          type="button"
          aria-label={`Quitar ${label} de la pista`}
          onClick={onRemove}
          whileTap={{ scale: 0.85 }}
          transition={jelly}
          className="grid size-11 place-items-center rounded-[10px] text-washi-subtle hover:bg-washi/[0.06] hover:text-enji-300"
        >
          <Trash2 className="size-4" />
        </motion.button>
      </div>
    </Reorder.Item>
  );
}

/** «Añadir clips»: from the library (every clip) or from a bag of clips. */
function AddClipsDialog({
  open,
  onClose,
  trackId,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  trackId: string;
  existing: TrackItemView[];
}) {
  const [from, setFrom] = useState<'library' | 'bag'>('library');
  const clips = useAllClips(open);
  const bags = useBags();
  const clipBags = bagsOfKind(bags.data, 'clips');
  const [bagId, setBagId] = useState<string | null>(null);
  const bag = clipBags.find((b) => b.id === bagId) ?? clipBags[0];
  const bagItems = useBagItems(open && from === 'bag' ? bag?.id : undefined);
  const add = useAddTrackItems();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);
  const inTrack = useMemo(() => new Set(existing.map((i) => i.clip_id)), [existing]);
  const bagClipIds = useMemo(
    () => new Set((bagItems.data ?? []).map((i) => i.clip_id).filter(Boolean) as string[]),
    [bagItems.data],
  );
  const list =
    from === 'library' ? (clips.data ?? []) : (clips.data ?? []).filter((c) => bagClipIds.has(c.id));

  async function save() {
    // Keep the order the clips were ticked in? A set keeps insertion order: yes.
    const ids = [...selected];
    if (!ids.length) return onClose();
    const start = existing.reduce((m, i) => Math.max(m, i.position + 1), 0);
    try {
      await add.mutateAsync({ trackId, clipIds: ids, from: Math.min(start, 999 - ids.length) });
      toast(`${countLabel('clips', ids.length)} añadidos`, 'success');
      onClose();
    } catch (err) {
      toast(bagError(err), 'error');
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={add.isPending}
      title="Añadir clips"
      description="Se añaden al final de la pista. Los que ya están se marcan."
    >
      <Segmented
        label="De dónde"
        layoutId="track-add-from"
        value={from}
        onChange={setFrom}
        options={[
          { value: 'library', label: 'De la biblioteca' },
          { value: 'bag', label: 'De una bolsa' },
        ]}
      />
      {from === 'bag' && clipBags.length > 0 && (
        <div role="radiogroup" aria-label="Bolsa" className="mt-3 flex flex-wrap gap-2">
          {clipBags.map((b) => (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={b.id === bag?.id}
              onClick={() => setBagId(b.id)}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-bold transition-colors',
                b.id === bag?.id
                  ? 'border-ai-400 bg-ai-800/50 text-washi'
                  : 'border-line text-washi-muted hover:text-washi',
              )}
            >
              <BagIcon className="size-4" /> {b.name}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3">
        {clips.isPending || (from === 'bag' && bagItems.isPending && bag) ? (
          <div className="grid place-items-center py-8">
            <Spinner className="size-7 text-kin-300" />
          </div>
        ) : from === 'bag' && !clipBags.length ? (
          <p className="py-6 text-center text-sm text-washi-muted">No hay bolsas de clips.</p>
        ) : (
          <ClipPickList
            items={list}
            selected={selected}
            taken={inTrack}
            takenLabel="Ya está en la pista"
            onToggle={(c) => setSelected((s) => toggleIn(s, c.id))}
            emptyText={from === 'bag' ? 'Esta bolsa no tiene clips.' : 'Aún no hay clips.'}
          />
        )}
      </div>
      <div className="sticky bottom-0 -mx-1 mt-4 flex items-center justify-end gap-2 bg-sumi-800 px-1 pt-3">
        <span className="mr-auto text-[13px] text-washi-subtle">
          {selected.size ? `${selected.size} elegidos` : ''}
        </span>
        <Button variant="ghost" onClick={onClose} disabled={add.isPending}>
          Cancelar
        </Button>
        <Button onClick={() => void save()} loading={add.isPending} disabled={!selected.size}>
          Añadir
        </Button>
      </div>
    </Dialog>
  );
}
