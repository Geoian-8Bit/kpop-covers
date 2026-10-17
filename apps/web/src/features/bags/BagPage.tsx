import type { BagDraw, BagKind } from '@coverscape/shared';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  Film,
  LibraryBig,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Shuffle,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { guardNav, Page } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import {
  bagError,
  itemTitle,
  useAddBagSongToLibrary,
  useAllClips,
  useBagDraws,
  useBagItems,
  useBags,
  useDeleteBag,
  useDrawFromBag,
  useRefillBag,
  useRemoveBagItem,
  useSetDrawRemoved,
  useSetItemOut,
  type BagItemView,
  type BagWithCount,
} from '@/data/bags';
import { CLIP_SWATCH } from '@/data/clips';
import { currentMemberId, useMembers } from '@/data/members';
import { MemberSeal } from '@/features/members/MembersUI';
import { newDraft, setRoundDraft } from '@/features/rpd/roundDraft';
import { cn } from '@/lib/cn';
import { jelly, snappy } from '@/lib/motion';
import { useCrew } from '@/providers/CrewProvider';
import { useToast } from '@/providers/ToastProvider';
import { AddItemsDialog } from './AddItemsDialog';
import { BagDrawStage, SHAKE_MS, type DrawPhase } from './BagDrawStage';
import { BagSettingsDialog } from './BagSettingsDialog';
import { historyDay, historyState, KIND_COPY, MODE_COPY, MULTI_DRAW_MAX, MULTI_DRAW_MIN } from './drawRules';
import { roundClipIds } from './songRules';
import { clipTone, memberTone, type DrawShown } from './tones';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** How an item shows when it comes out. */
export function shownFor(
  item: BagItemView | undefined,
  draw: Pick<BagDraw, 'label'>,
  kind: BagKind,
): DrawShown {
  if (item?.video)
    return { label: item.video.title, sub: item.video.artist ?? undefined, tone: 'kin', glyph: '曲' };
  if (item?.wish)
    return {
      label: item.wish.title,
      sub: item.wish.artist ?? 'De la lista de deseos',
      tone: 'kin',
      glyph: '願',
    };
  if (item?.clip)
    return {
      label: item.clip.name,
      sub: item.clip.video?.title,
      tone: clipTone(item.clip.color),
      glyph: '帖',
    };
  if (item?.member)
    return {
      label: item.member.name,
      sub: '¡Te toca!',
      tone: memberTone(item.member.color),
      glyph: item.member.name.trim().charAt(0).toUpperCase() || '人',
    };
  if (item?.youtube_id)
    return {
      label: item.title ?? draw.label,
      sub: item.artist ? `${item.artist} · de YouTube` : 'De YouTube',
      tone: 'kin',
      glyph: '曲',
    };
  return { label: draw.label, tone: 'kin', glyph: KIND_COPY[kind].glyph };
}

/** F13 · /bolsas/:bagId: draw, the items in and out of the bag, the history. */
export function BagPage() {
  const { bagId } = useParams();
  const bags = useBags();
  const bag = bags.data?.find((b) => b.id === bagId);

  if (bags.isPending) {
    return (
      <Page className="grid min-h-[60dvh] place-items-center">
        <Spinner className="size-8 text-kin-300" label="Cargando la bolsa" />
      </Page>
    );
  }
  if (!bag) {
    return (
      <Page className="px-2.5 py-3 sm:px-5 sm:py-5">
        <div className="paper mx-auto max-w-xl rounded-[12px] px-6 py-12 text-center">
          <h1 className="font-display text-2xl font-bold">
            {bags.isError ? 'No pudimos cargar la bolsa' : 'Esta bolsa ya no existe'}
          </h1>
          <p className="mt-2 text-washi-muted">
            {bags.isError ? 'Revisa la conexión.' : 'Puede que otro móvil la haya borrado.'}
          </p>
          <Link
            to="/bolsas"
            onClick={guardNav}
            className="mt-6 inline-flex min-h-11 items-center font-bold text-kin-300 hover:underline"
          >
            Volver a las bolsas
          </Link>
        </div>
      </Page>
    );
  }
  return <BagView key={bag.id} bag={bag} />;
}

const actionLink =
  'inline-flex h-11 items-center gap-2 rounded-[10px] bg-washi px-5 text-[15px] font-bold text-sumi-900 hover:bg-kin-200';

/**
 * Point 31 · Top to bottom: a one-line header (back, name, settings and delete as small icons), the draw scene
 * with «Sacar» and «Añadir» side by side and «Sacar varios» under them, what to do with what came out, and then
 * the bag's lists in tabs. At 390×844 the scene and «Sacar» fit without scrolling.
 */
function BagView({ bag }: { bag: BagWithCount }) {
  const items = useBagItems(bag.id);
  const draws = useBagDraws(bag.id);
  const members = useMembers();
  const reduce = useReducedMotion();
  const toast = useToast();
  const navigate = useNavigate();
  const { activeCrew } = useCrew();
  const draw = useDrawFromBag();
  const setDrawRemoved = useSetDrawRemoved();
  const refill = useRefillBag();
  const deleteBag = useDeleteBag();
  const toLibrary = useAddBagSongToLibrary(activeCrew?.id);
  const [phase, setPhase] = useState<DrawPhase>('idle');
  const [last, setLast] = useState<{
    draws: BagDraw[];
    shown: DrawShown[];
    items: (BagItemView | undefined)[];
  } | null>(null);
  /** The library video a YouTube song that just came out was added to (point 28). */
  const [addedVideo, setAddedVideo] = useState<string | null>(null);
  const [many, setMany] = useState(3);
  const [settings, setSettings] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const drawing = useRef(false);

  const all = items.data ?? [];
  const inBag = all.filter((i) => i.removed_at == null);
  const out = all.filter((i) => i.removed_at != null);
  const copy = KIND_COPY[bag.kind];
  const multi = (last?.draws.length ?? 0) > 1;
  // A round from songs plays one clip of each (point 28: songs with no clips stay out).
  const clips = useAllClips(multi && (bag.kind === 'songs' || bag.kind === 'clips'));

  async function onDraw(count: number) {
    if (drawing.current) return;
    drawing.current = true;
    setPhase('shaking');
    setLast(null);
    setAddedVideo(null);
    const before = new Map(all.map((i) => [i.id, i]));
    const [result] = await Promise.allSettled([
      draw.mutateAsync({ bagId: bag.id, count, remove: null, memberId: currentMemberId(members.data) }),
      wait(reduce ? 250 : SHAKE_MS),
    ]);
    drawing.current = false;
    if (result.status === 'rejected') {
      setPhase('idle');
      toast(bagError(result.reason), 'error');
      return;
    }
    const drawn = result.value;
    if (!drawn.length) {
      setPhase('idle');
      toast('La bolsa está vacía. Rellénala para seguir sacando.', 'info');
      return;
    }
    const drawnItems = drawn.map((d) => (d.item_id ? before.get(d.item_id) : undefined));
    setLast({
      draws: drawn,
      items: drawnItems,
      shown: drawn.map((d, i) => shownFor(drawnItems[i], d, bag.kind)),
    });
    setPhase('reveal');
  }

  /** «Quitar de la bolsa» / «Devolver» for what just came out (all of it, after «Sacar varios»). */
  async function setRemoved(removed: boolean) {
    if (!last) return;
    try {
      await Promise.all(last.draws.map((d) => setDrawRemoved.mutateAsync({ draw: d, removed })));
      setLast({ ...last, draws: last.draws.map((d) => ({ ...d, removed })) });
    } catch (err) {
      toast(bagError(err), 'error');
    }
  }

  /** What came out, as it was then; else as the bag's list has it now (it may have loaded after the draw). */
  const drawnNow = useMemo(() => {
    if (!last) return [];
    const now = new Map(all.map((i) => [i.id, i]));
    return last.draws.map((d, k) => last.items[k] ?? (d.item_id ? now.get(d.item_id) : undefined));
  }, [last, all]);
  const playable = useMemo(
    () => (multi ? roundClipIds(drawnNow, clips.data ?? [], () => 0).clipIds.length : 0),
    [multi, drawnNow, clips.data],
  );

  function playRound() {
    if (!last) return;
    const { clipIds, skipped } = roundClipIds(drawnNow, clips.data ?? []);
    if (!clipIds.length) {
      toast(
        bag.kind === 'songs'
          ? 'Ninguna tiene clips todavía: guarda alguno en el estudio para jugarla.'
          : 'No se pudo preparar la ronda',
        'info',
      );
      return;
    }
    if (skipped)
      toast(
        `${skipped === 1 ? 'Una no tiene clips y se queda' : `${skipped} no tienen clips y se quedan`} fuera de la ronda`,
        'info',
      );
    setRoundDraft(newDraft(clipIds, {}, `Bolsa «${bag.name}»`));
    // Opened from inside the app (OPENED_IN_APP): «Salir» steps back to this bag.
    navigate('/rpd/jugar', { state: { openedFrom: 'app' } });
  }

  async function addToLibrary(item: BagItemView) {
    try {
      const { videoId, existed } = await toLibrary.mutateAsync(item);
      setAddedVideo(videoId);
      toast(existed ? 'Ya estaba en la biblioteca: enlazada' : 'Añadida a la biblioteca', 'success');
    } catch (err) {
      toast(bagError(err), 'error');
    }
  }

  const removedNow = last ? last.draws.every((d) => d.removed) : bag.draw_mode === 'remove';
  const single = last?.draws.length === 1 ? drawnNow[0] : undefined;
  const busy = phase === 'shaking';
  const canRefill = items.isSuccess && inBag.length === 0 && out.length > 0;

  function onRefill() {
    refill.mutate(bag.id, {
      onSuccess: () => {
        toast('Bolsa rellenada', 'success');
        setPhase('idle');
        setLast(null);
      },
      onError: (err) => toast(bagError(err), 'error'),
    });
  }

  // Phones: <main> already leaves room at the bottom for the floating menu button (AppShell, with the safe area).
  return (
    <Page className="px-2.5 pb-6 pt-2.5 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-4xl rounded-[10px] sm:rounded-[12px]">
        {/* ── One-line header ── */}
        <header className="flex items-center gap-0.5 px-1.5 py-1 sm:px-4 sm:py-2">
          <Link
            to="/bolsas"
            onClick={guardNav}
            aria-label="Volver a las bolsas"
            className="grid size-11 shrink-0 place-items-center rounded-[10px] text-washi-muted transition-colors hover:bg-washi/[0.06] hover:text-washi"
          >
            <ArrowLeft aria-hidden className="size-5" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate px-1 font-display text-[20px] font-bold leading-tight sm:text-[24px]">
            {bag.name}
          </h1>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Ajustes de la bolsa"
            onClick={() => setSettings(true)}
          >
            <Settings2 className="size-[18px]" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Borrar la bolsa"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-[18px]" />
          </Button>
        </header>

        {/* ── Draw ── */}
        <section aria-labelledby="draw-title" className="sep-t px-3 pb-4 pt-3 sm:px-9 sm:pb-6 sm:pt-5">
          <h2 id="draw-title" className="sr-only">
            Sacar
          </h2>
          <BagDrawStage
            phase={phase}
            results={last?.shown ?? []}
            empty={items.isSuccess && inBag.length === 0 && phase === 'idle'}
            emptyText={
              out.length ? undefined : `Aún no hay nada dentro. Añade ${copy.many} para empezar a sacar.`
            }
            caption={
              <>
                <span className="block font-bold text-washi-muted">
                  <span className="tabular">{inBag.length}</span> dentro
                </span>
                <span className="block">
                  {MODE_COPY[bag.draw_mode].label}
                  {bag.draw_mode === 'keep' && bag.no_repeat ? ' · sin repetir' : ''}
                </span>
              </>
            }
          />
          <p className="sr-only" aria-live="polite">
            {phase === 'shaking'
              ? 'Sacando…'
              : phase === 'reveal' && last
                ? `Ha salido: ${last.shown.map((s) => s.label).join(', ')}`
                : ''}
          </p>

          {/* Sacar + Añadir: always in the same place (what comes out shows above, its actions below). */}
          <div className="mt-3 flex items-stretch gap-2">
            {canRefill ? (
              <Button size="lg" className="flex-1" loading={refill.isPending} onClick={onRefill}>
                <RotateCcw aria-hidden className="size-5" /> Rellenar
              </Button>
            ) : (
              <Button
                size="lg"
                className="flex-1"
                onClick={() => void onDraw(1)}
                disabled={busy || inBag.length === 0}
              >
                Sacar
              </Button>
            )}
            <Button
              size="lg"
              variant="secondary"
              className="px-4"
              onClick={() => setAdding(true)}
              aria-label={`Añadir ${copy.many}`}
            >
              <Plus aria-hidden className="size-5" /> Añadir
            </Button>
          </div>

          {/* Sacar varios */}
          <div className="mt-2 flex items-center gap-1 rounded-[12px] border border-line p-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Uno menos"
              onClick={() => setMany((n) => Math.max(MULTI_DRAW_MIN, n - 1))}
              disabled={many <= MULTI_DRAW_MIN}
            >
              <Minus className="size-4" />
            </Button>
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => void onDraw(many)}
              disabled={busy || inBag.length < 2}
              aria-label={
                bag.kind === 'people'
                  ? `Sacar ${many} a la vez`
                  : `Sacar ${many} a la vez, para una ronda de Random Play Dance`
              }
            >
              Sacar <span className="tabular">{many}</span> a la vez
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Uno más"
              onClick={() => setMany((n) => Math.min(MULTI_DRAW_MAX, n + 1))}
              disabled={many >= MULTI_DRAW_MAX}
            >
              <Plus className="size-4" />
            </Button>
          </div>
          {bag.kind !== 'people' && (
            <p className="mt-1.5 text-center text-[12px] text-washi-subtle">
              {bag.kind === 'clips'
                ? 'Varios a la vez se juegan como una ronda de Random Play Dance.'
                : 'Varias a la vez se juegan como una ronda de Random Play Dance con sus clips.'}
            </p>
          )}

          {/* What to do with what came out */}
          <AnimatePresence initial={false}>
            {phase === 'reveal' && last && (
              <motion.div
                key="after"
                initial={{ opacity: 0, y: 10 }}
                // Right after the prize card (BagDrawStage shows it at 0.85 s, as the ball lands).
                animate={{ opacity: 1, y: 0, transition: { ...snappy, delay: reduce ? 0 : 0.95 } }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                className="mt-4 flex flex-col gap-3"
              >
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {single?.video && (
                    <Link to={`/v/${single.video.id}`} onClick={guardNav} className={actionLink}>
                      <Film aria-hidden className="size-4.5" /> Abrir en el estudio
                    </Link>
                  )}
                  {single?.youtube_id &&
                    (addedVideo ? (
                      <Link to={`/v/${addedVideo}`} onClick={guardNav} className={actionLink}>
                        <Film aria-hidden className="size-4.5" /> Abrir en el estudio
                      </Link>
                    ) : (
                      <Button
                        variant="washi"
                        loading={toLibrary.isPending}
                        onClick={() => void addToLibrary(single)}
                      >
                        <LibraryBig aria-hidden className="size-4.5" /> Añadir a la biblioteca
                      </Button>
                    ))}
                  {single?.wish && (
                    <Link
                      to={single.wish.added_video_id ? `/v/${single.wish.added_video_id}` : '/deseos'}
                      onClick={guardNav}
                      className={actionLink}
                    >
                      <Film aria-hidden className="size-4.5" />{' '}
                      {single.wish.added_video_id ? 'Abrir en el estudio' : 'Ver en la lista de deseos'}
                    </Link>
                  )}
                  {single?.clip && (
                    <Link
                      to={`/v/${single.clip.video_id}?clip=${single.clip.id}`}
                      onClick={guardNav}
                      className={actionLink}
                    >
                      <Play aria-hidden className="size-4.5" /> Reproducir en bucle
                    </Link>
                  )}
                  {single?.member && (
                    <span className="inline-flex items-center gap-3 rounded-[12px] border border-line px-3 py-2">
                      <MemberSeal member={single.member} size="lg" />
                      <span className="font-display text-[20px] font-bold text-washi">
                        {single.member.name}
                      </span>
                    </span>
                  )}
                  {multi && bag.kind !== 'people' && (
                    <Button
                      onClick={playRound}
                      loading={clips.isPending}
                      disabled={!clips.isPending && playable === 0}
                    >
                      <Shuffle aria-hidden className="size-4.5" /> Jugar la ronda
                      {playable > 0 && <span className="tabular">({playable})</span>}
                    </Button>
                  )}
                </div>
                {single?.youtube_id && !addedVideo && (
                  <p className="text-center text-[13px] text-washi-subtle">
                    Está solo en esta bolsa. Si os la quedáis, añadidla a la biblioteca para guardar sus
                    clips.
                  </p>
                )}
                {multi && bag.kind === 'songs' && !clips.isPending && playable < last.draws.length && (
                  <p className="text-center text-[13px] text-washi-subtle">
                    {playable === 0
                      ? 'Ninguna tiene clips todavía, así que no hay ronda.'
                      : 'Las que no tienen clips (las de YouTube, por ejemplo) se quedan fuera de la ronda.'}
                  </p>
                )}
                <div
                  role="group"
                  aria-label="Qué hacer con lo que ha salido"
                  className="flex flex-wrap justify-center gap-2"
                >
                  <Button
                    size="sm"
                    className="h-11"
                    variant={removedNow ? 'primary' : 'secondary'}
                    aria-pressed={removedNow}
                    loading={setDrawRemoved.isPending && !removedNow}
                    onClick={() => !removedNow && void setRemoved(true)}
                  >
                    <Minus aria-hidden className="size-4" /> Fuera de la bolsa
                  </Button>
                  <Button
                    size="sm"
                    className="h-11"
                    variant={!removedNow ? 'primary' : 'secondary'}
                    aria-pressed={!removedNow}
                    loading={setDrawRemoved.isPending && removedNow}
                    onClick={() => removedNow && void setRemoved(false)}
                  >
                    <Undo2 aria-hidden className="size-4" /> Devolver
                  </Button>
                </div>
                <p className="text-center text-[12px] text-washi-subtle">
                  Esta bolsa {bag.draw_mode === 'remove' ? 'quita' : 'devuelve'} lo que sale; puedes cambiarlo
                  esta vez.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* ── Lists ── */}
        <BagLists
          bag={bag}
          inBag={inBag}
          out={out}
          loading={items.isPending}
          draws={draws.data}
          drawsLoading={draws.isPending}
          refilling={refill.isPending}
          onRefill={onRefill}
        />
      </div>

      <BagSettingsDialog open={settings} onClose={() => setSettings(false)} bag={bag} />
      <AddItemsDialog open={adding} onClose={() => setAdding(false)} bag={bag} items={all} />
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        busy={deleteBag.isPending}
        hideClose
        title="¿Borrar la bolsa?"
        description={
          <>
            Se borra <span className="font-medium text-washi">«{bag.name}»</span> con su historial para todo
            el grupo. Las canciones, clips y personas no se tocan.
          </>
        }
        size="sm"
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={deleteBag.isPending} onClick={() => setConfirmDelete(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={deleteBag.isPending}
            onClick={() =>
              deleteBag.mutate(bag, {
                onSuccess: () => {
                  toast('Bolsa borrada', 'success');
                  navigate('/bolsas', { replace: true });
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

type ListTab = 'in' | 'out' | 'history';

/** «En la bolsa», «Fuera» and «Historial», as tabs: compact rows, one list at a time. */
function BagLists({
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
  if (item.member) return <MemberSeal member={item.member} />;
  if (item.clip) {
    return (
      <span
        aria-hidden
        className={cn('size-8 shrink-0 rotate-[-3deg] rounded-[6px]', CLIP_SWATCH[item.clip.color].dot)}
      />
    );
  }
  const src = item.video?.thumbnail_url ?? item.wish?.thumbnail_url ?? item.thumbnail_url;
  return (
    <span
      aria-hidden
      className="relative aspect-video w-14 shrink-0 overflow-hidden rounded-[6px] bg-sumi-950"
    >
      {src && <img src={src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />}
    </span>
  );
}

function ItemList({ items, out = false }: { items: BagItemView[]; out?: boolean }) {
  const setOut = useSetItemOut();
  const remove = useRemoveBagItem();
  const toast = useToast();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmId) return;
    const t = setTimeout(() => setConfirmId(null), 4000);
    return () => clearTimeout(t);
  }, [confirmId]);

  return (
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
                'flex items-center gap-2.5 rounded-[10px] px-1.5 py-1 hover:bg-washi/[0.03]',
                out && 'opacity-80',
              )}
            >
              <ItemThumb item={item} />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block truncate text-[15px] font-medium leading-snug',
                    out ? 'text-washi-muted line-through decoration-washi-subtle/60' : 'text-washi',
                  )}
                >
                  {title}
                </span>
                <span className="block truncate text-[12px] text-washi-subtle">
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
  );
}

function History({
  draws,
  kind,
  loading,
}: {
  draws: BagDraw[] | undefined;
  kind: BagKind;
  loading: boolean;
}) {
  const members = useMembers();
  const byId = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m])), [members.data]);
  if (loading) return <div className="skeleton mt-1 h-20 rounded-[10px]" />;
  if (!draws?.length) return <p className="px-1 py-3 text-sm text-washi-muted">Todavía no ha salido nada.</p>;
  return (
    <ol className="space-y-0.5">
      {draws.map((d) => {
        const who = d.member_id ? byId.get(d.member_id) : undefined;
        const state = historyState(kind, d.removed);
        return (
          <li key={d.id} className="flex items-start gap-2.5 rounded-[10px] px-1.5 py-1.5">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rotate-45 bg-kin-400/70" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-[15px] font-bold leading-snug text-washi">
                {d.label}
                {state && <span className="font-sans text-[13px] font-normal text-shu-300"> {state}</span>}
              </span>
              <span className="block truncate text-[12px] text-washi-subtle">
                {historyDay(d.drawn_at)} ·{' '}
                {new Date(d.drawn_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                {who ? ` · lo sacó ${who.name}` : ''}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
