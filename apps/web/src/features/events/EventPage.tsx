import type { CrewEvent } from '@coverscape/shared';
import { motion, Reorder, useDragControls } from 'motion/react';
import { ArrowLeft, GripVertical, Music, Pencil, Plus, Shuffle, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { guardNav, Page } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { LiveMessage, MoveArrows } from '@/components/ui/MoveArrows';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Spinner } from '@/components/ui/Spinner';
import { bagError } from '@/data/bags';
import {
  eventError,
  useAddEventSongs,
  useCreateCandidatesBag,
  useCreateChorusTrack,
  useDeleteEvent,
  useEvent,
  useEventSongs,
  useRemoveEventSong,
  useReorderEventSongs,
  type EventSongView,
} from '@/data/events';
import { useVideos } from '@/data/videos';
import { BagIcon } from '@/features/bags/BagIcon';
import { SongPickList } from '@/features/bags/Pickers';
import { positionPatches, reorder } from '@/features/rpd/roundRules';
import { cn } from '@/lib/cn';
import { jelly, snappy } from '@/lib/motion';
import { useAnnouncer } from '@/lib/reorderA11y';
import { useCrew } from '@/providers/CrewProvider';
import { useToast } from '@/providers/ToastProvider';
import { EventCountdown } from './EventCountdown';
import { EventFormDialog } from './EventFormDialog';
import { isShown, REPERTOIRE_MAX } from './eventRules';
import { useNow } from './useNow';

/** F16 · /eventos/:eventId: the event (edit, delete), its countdown, its repertoire and the connections. */
export function EventPage() {
  const { eventId } = useParams();
  const event = useEvent(eventId);
  if (event.isPending) {
    return (
      <Page className="grid min-h-[60dvh] place-items-center">
        <Spinner className="size-8 text-kin-300" label="Cargando el evento" />
      </Page>
    );
  }
  if (!event.data) {
    return (
      <Page className="px-2.5 py-3 sm:px-5 sm:py-5">
        <div className="paper mx-auto max-w-xl rounded-[12px] px-6 py-12 text-center">
          <h1 className="font-display text-2xl font-bold">
            {event.isError ? 'No pudimos cargar el evento' : 'Este evento ya no existe'}
          </h1>
          <Link to="/eventos" onClick={guardNav} className="mt-6 inline-flex min-h-11 items-center font-bold text-kin-300 hover:underline">
            Volver a Eventos
          </Link>
        </div>
      </Page>
    );
  }
  return <EventDetail key={event.data.id} event={event.data} />;
}

function EventDetail({ event }: { event: CrewEvent }) {
  const songs = useEventSongs(event.id);
  const reorderMut = useReorderEventSongs();
  const removeSong = useRemoveEventSong();
  const deleteEvent = useDeleteEvent();
  const makeBag = useCreateCandidatesBag();
  const makeTrack = useCreateChorusTrack();
  const toast = useToast();
  const navigate = useNavigate();
  const now = useNow();
  // From the cache at once when it's there: no flash of «Aún no hay canciones».
  const [order, setOrder] = useState<EventSongView[]>(() => songs.data ?? []);
  const [announcement, announce] = useAnnouncer();
  const dragging = useRef(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Follow the server unless a drag is in progress.
  useEffect(() => {
    if (!dragging.current && songs.data) setOrder(songs.data);
  }, [songs.data]);

  function commit(next: EventSongView[]) {
    const patches = positionPatches(next);
    if (!patches.length) return;
    reorderMut.mutate({ eventId: event.id, ordered: next, patches }, { onError: (err) => toast(eventError(err), 'error') });
  }

  function move(from: number, to: number) {
    const next = reorder(order, from, to);
    setOrder(next);
    commit(next);
  }

  function createBag() {
    makeBag.mutate(
      { event, songs: order },
      {
        onSuccess: (bag) => {
          toast(`Bolsa «${bag.name}» creada`, 'success');
          navigate(`/bolsas/${bag.id}`);
        },
        onError: (err) => toast(bagError(err), 'error'),
      },
    );
  }

  function createTrack() {
    makeTrack.mutate(
      { event, songs: order },
      {
        onSuccess: (track) => {
          toast(`Pista «${track.name}» creada`, 'success');
          navigate(`/rpd/pista/${track.id}`);
        },
        onError: (err) => toast(bagError(err), 'error'),
      },
    );
  }

  const shown = isShown(event.starts_at, now);

  return (
    <Page className="px-2.5 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-4xl rounded-[10px] sm:rounded-[12px]">
        <header className="px-5 pb-6 pt-5 sm:px-9 sm:pt-7">
          <Link
            to="/eventos"
            onClick={guardNav}
            className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-sm font-medium text-washi-muted hover:text-washi"
          >
            <ArrowLeft aria-hidden className="size-4" /> Eventos
          </Link>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <h1 className="min-w-0 font-display text-[28px] font-bold leading-tight sm:text-[34px]">{event.name}</h1>
            <div className="flex shrink-0 gap-1">
              <Button variant="secondary" size="md" onClick={() => setEditing(true)}>
                <Pencil aria-hidden className="size-4" /> Editar
              </Button>
              <Button variant="ghost" size="icon" aria-label="Borrar el evento" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4.5" />
              </Button>
            </div>
          </div>
          <div className={cn('mt-4 rounded-[12px] border border-line bg-sumi-900/60 px-3 py-3 sm:px-5', !shown && 'opacity-75')}>
            <EventCountdown
              name={shown ? 'Cuenta atrás' : 'Ya no sale en la portada'}
              startsAt={event.starts_at}
              place={event.place}
              now={now}
            />
          </div>
        </header>

        <section aria-labelledby="repertoire-title" className="sep-t px-5 py-7 sm:px-9">
          <SectionTitle
            id="repertoire-title"
            glyph="演目"
            aside={<span className="tabular text-sm font-medium text-washi-subtle">{order.length}</span>}
          >
            Repertorio
          </SectionTitle>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-washi-subtle">Las canciones que vais a bailar, en orden.</p>
            <Button variant="secondary" onClick={() => setAdding(true)} disabled={order.length >= REPERTOIRE_MAX}>
              <Plus aria-hidden className="size-4" /> Añadir canciones
            </Button>
          </div>
          {songs.isPending ? (
            <div className="mt-3 space-y-1.5">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="skeleton h-14 rounded-[12px]" />
              ))}
            </div>
          ) : songs.isError && !songs.data ? (
            <div role="alert" className="mt-4 text-center">
              <p className="text-sm text-washi-muted">No se pudo cargar el repertorio.</p>
              <Button variant="secondary" className="mt-2" loading={songs.isFetching} onClick={() => void songs.refetch()}>
                Reintentar
              </Button>
            </div>
          ) : order.length === 0 ? (
            <div className="mt-5 rounded-[12px] border border-dashed border-line-strong px-4 py-8 text-center">
              <p className="font-display text-lg font-bold">Aún no hay canciones</p>
              <p className="mt-1 text-sm text-washi-muted">Añade las de la biblioteca que vais a bailar.</p>
            </div>
          ) : (
            <>
              <Reorder.Group axis="y" values={order} onReorder={setOrder} className="mt-3 space-y-1" as="ol">
                {order.map((song, i) => (
                  <SongRow
                    key={song.id}
                    song={song}
                    index={i}
                    count={order.length}
                    onDragStart={() => (dragging.current = true)}
                    onDragEnd={() => {
                      dragging.current = false;
                      commit(order);
                    }}
                    onMove={move}
                    announce={announce}
                    onRemove={() => removeSong.mutate(song, { onError: (err) => toast(eventError(err), 'error') })}
                  />
                ))}
              </Reorder.Group>
              <LiveMessage message={announcement} />
              {order.length > 1 && (
                <p className="mt-2 text-[12px] text-washi-subtle">Arrastra por el asa o usa las flechas para cambiar el orden.</p>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="links-title" className="sep-t px-5 pb-9 pt-7 sm:px-9">
          <SectionTitle id="links-title" glyph="札">
            Para ensayar
          </SectionTitle>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ConnectionCard
              icon={<BagIcon className="size-5" />}
              title="Crear bolsa de candidatas"
              text="Una bolsa de canciones con el repertorio, para sortear cuál se ensaya."
              loading={makeBag.isPending}
              disabled={!order.length || makeTrack.isPending}
              onClick={createBag}
            />
            <ConnectionCard
              icon={<Shuffle className="size-5" />}
              title="Crear pista con los estribillos"
              text="Una pista de Random Play Dance con los estribillos del repertorio (o todos sus clips)."
              loading={makeTrack.isPending}
              disabled={!order.length || makeBag.isPending}
              onClick={createTrack}
            />
          </div>
          {!order.length && <p className="mt-2 text-[12px] text-washi-subtle">Añade canciones al repertorio para usarlas.</p>}
        </section>
      </div>

      <EventFormDialog open={editing} onClose={() => setEditing(false)} event={event} />
      <AddSongsDialog open={adding} onClose={() => setAdding(false)} eventId={event.id} current={order} />
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="¿Borrar este evento?"
        description="Deja de verse para todo el grupo, con su repertorio. Las canciones siguen en la biblioteca."
        size="sm"
        hideClose
        busy={deleteEvent.isPending}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleteEvent.isPending}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={deleteEvent.isPending}
            onClick={() =>
              deleteEvent.mutate(event, {
                onSuccess: () => {
                  toast('Evento borrado', 'success');
                  navigate('/eventos', { replace: true });
                },
                onError: (err) => toast(eventError(err), 'error'),
              })
            }
          >
            <Trash2 aria-hidden className="size-4" /> Borrar
          </Button>
        </div>
      </Dialog>
    </Page>
  );
}

function ConnectionCard({
  icon,
  title,
  text,
  loading,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={jelly}
      className="flex min-h-[88px] items-start gap-3 rounded-[12px] border border-line bg-sumi-900/60 p-3.5 text-left transition-colors hover:border-line-strong hover:bg-washi/[0.04] disabled:opacity-50"
    >
      <span className="grid size-10 shrink-0 rotate-[-4deg] place-items-center rounded-[8px] bg-ai-600 text-washi">
        {loading ? <Spinner decorative className="size-4" /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block font-bold text-washi">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-washi-muted">{text}</span>
      </span>
    </motion.button>
  );
}

function SongRow({
  song,
  index,
  count,
  onDragStart,
  onDragEnd,
  onMove,
  announce,
  onRemove,
}: {
  song: EventSongView;
  index: number;
  count: number;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (from: number, to: number) => void;
  announce: (message: string) => void;
  onRemove: () => void;
}) {
  const controls = useDragControls();
  const title = song.video?.title ?? 'No disponible';
  return (
    <Reorder.Item
      value={song}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      transition={snappy}
      whileDrag={{ scale: 1.02, boxShadow: '0 16px 28px -14px rgb(0 0 0 / 0.9)' }}
      className="relative flex items-center gap-1.5 rounded-[12px] bg-sumi-850 px-1.5 py-1.5 sm:gap-3"
      as="li"
    >
      {/* Pointer only: the keyboard (and screen readers) use ↑ ↓, so the handle is not a tab stop. */}
      <span
        aria-hidden
        onPointerDown={(e) => {
          e.preventDefault();
          controls.start(e);
        }}
        className="grid h-11 w-7 shrink-0 cursor-grab touch-none place-items-center rounded-[8px] text-washi-subtle hover:bg-washi/[0.06] hover:text-washi active:cursor-grabbing"
      >
        <GripVertical className="size-4.5" />
      </span>
      <span aria-hidden className="tabular w-5 shrink-0 text-center font-mono text-[12px] text-washi-subtle">
        {index + 1}
      </span>
      {/* Direct access: the song opens in the studio. */}
      <Link
        to={`/v/${song.video_id}`}
        onClick={guardNav}
        className="group flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-[8px] pr-1 hover:bg-washi/[0.04]"
      >
        <Thumb url={song.video?.thumbnail_url ?? null} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-bold text-washi group-hover:underline">{title}</span>
          <span className="block truncate text-[12px] text-washi-muted">{song.video?.artist || 'Artista sin especificar'}</span>
        </span>
      </Link>
      <div className="flex shrink-0 items-center">
        <MoveArrows index={index} total={count} name={title} onMove={(delta) => onMove(index, index + delta)} announce={announce} />
        <motion.button
          type="button"
          aria-label={`Quitar ${title} del repertorio`}
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

function Thumb({ url }: { url: string | null }) {
  return url ? (
    <img src={url} alt="" loading="lazy" className="hidden aspect-video w-14 shrink-0 rounded-[6px] object-cover sm:block" />
  ) : (
    <span aria-hidden className="hidden aspect-video w-14 shrink-0 place-items-center rounded-[6px] bg-sumi-800 text-washi-subtle sm:grid">
      <Music className="size-4" />
    </span>
  );
}

function AddSongsDialog({
  open,
  onClose,
  eventId,
  current,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  current: EventSongView[];
}) {
  const { activeCrew } = useCrew();
  const videos = useVideos(activeCrew?.id, { enabled: open });
  const add = useAddEventSongs();
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const taken = useMemo(() => new Set(current.map((s) => s.video_id)), [current]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  useEffect(() => {
    if (open) setSelected([]);
  }, [open]);

  function save() {
    if (!selected.length) return;
    add.mutate(
      { eventId, videoIds: selected, current },
      {
        onSuccess: (rows) => {
          toast(rows.length === 1 ? 'Canción añadida al repertorio' : `${rows.length} canciones añadidas`, 'success');
          onClose();
        },
        onError: (err) => toast(eventError(err), 'error'),
      },
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title="Añadir al repertorio" busy={add.isPending}>
      {videos.isPending ? (
        <div className="grid place-items-center py-8">
          <Spinner className="size-6 text-washi-muted" label="Cargando la biblioteca" />
        </div>
      ) : (
        <SongPickList
          items={videos.data ?? []}
          selected={selectedSet}
          taken={taken}
          onToggle={(v) => setSelected((list) => (list.includes(v.id) ? list.filter((id) => id !== v.id) : [...list, v.id]))}
          emptyText="La biblioteca está vacía: añade primero un vídeo."
          className="max-h-[50dvh] overflow-y-auto pr-1"
        />
      )}
      <div className="mt-4 flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={onClose} disabled={add.isPending}>
          Cancelar
        </Button>
        <Button onClick={save} loading={add.isPending} disabled={!selected.length}>
          <Plus aria-hidden className="size-4" /> {selected.length > 1 ? `Añadir ${selected.length}` : 'Añadir'}
        </Button>
      </div>
    </Dialog>
  );
}
