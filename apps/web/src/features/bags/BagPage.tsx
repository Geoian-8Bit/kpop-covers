import type { BagDraw, BagKind } from '@coverscape/shared';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  Film,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Shuffle,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { guardNav, Page } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Spinner } from '@/components/ui/Spinner';
import {
  bagError,
  itemRef,
  itemTitle,
  useAddBagItem,
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
import { useVideos } from '@/data/videos';
import { useDesignVariant } from '@/features/lab/designLab';
import { MemberSeal } from '@/features/members/MembersUI';
import { newDraft, setRoundDraft } from '@/features/rpd/roundDraft';
import { cn } from '@/lib/cn';
import { jelly, snappy } from '@/lib/motion';
import { useCrew } from '@/providers/CrewProvider';
import { useToast } from '@/providers/ToastProvider';
import { BagDrawStage, SHAKE_MS, type DrawPhase } from './BagDrawStage';
import { BagSettingsDialog } from './BagSettingsDialog';
import {
  countLabel,
  historyDay,
  historyState,
  KIND_COPY,
  MODE_COPY,
  MULTI_DRAW_MAX,
  MULTI_DRAW_MIN,
} from './drawRules';
import { ClipPickList, MemberPickList, SongPickList, toggleIn } from './Pickers';
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

function BagView({ bag }: { bag: BagWithCount }) {
  const items = useBagItems(bag.id);
  const draws = useBagDraws(bag.id);
  const members = useMembers();
  const variant = useDesignVariant('bag-draw');
  const reduce = useReducedMotion();
  const toast = useToast();
  const navigate = useNavigate();
  const draw = useDrawFromBag();
  const setDrawRemoved = useSetDrawRemoved();
  const refill = useRefillBag();
  const deleteBag = useDeleteBag();
  const [phase, setPhase] = useState<DrawPhase>('idle');
  const [last, setLast] = useState<{
    draws: BagDraw[];
    shown: DrawShown[];
    items: (BagItemView | undefined)[];
  } | null>(null);
  const [many, setMany] = useState(3);
  const [settings, setSettings] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const drawing = useRef(false);

  const all = items.data ?? [];
  const inBag = all.filter((i) => i.removed_at == null);
  const out = all.filter((i) => i.removed_at != null);
  const copy = KIND_COPY[bag.kind];

  async function onDraw(count: number) {
    if (drawing.current) return;
    drawing.current = true;
    setPhase('shaking');
    setLast(null);
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

  function playRound() {
    if (!last) return;
    const clipIds = last.items.map((i) => i?.clip_id).filter((id): id is string => Boolean(id));
    if (!clipIds.length) return;
    setRoundDraft(newDraft(clipIds, {}, `Bolsa «${bag.name}»`));
    navigate('/rpd/jugar');
  }

  const removedNow = last ? last.draws.every((d) => d.removed) : bag.draw_mode === 'remove';
  const single = last?.draws.length === 1 ? last.items[0] : undefined;

  return (
    <Page className="px-2.5 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-4xl rounded-[10px] sm:rounded-[12px]">
        <header className="px-5 pb-5 pt-5 sm:px-9 sm:pt-7">
          <Link
            to="/bolsas"
            onClick={guardNav}
            className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-sm font-medium text-washi-muted hover:text-washi"
          >
            <ArrowLeft aria-hidden className="size-4" /> Bolsas
          </Link>
          <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="break-words font-display text-[28px] font-bold leading-tight sm:text-[34px]">
                {bag.name}
              </h1>
              <p className="mt-1 text-sm text-washi-subtle">
                {copy.label} · {MODE_COPY[bag.draw_mode].label}
                {bag.draw_mode === 'keep' && bag.no_repeat ? ' · sin repetir seguidas' : ''} ·{' '}
                {countLabel(bag.kind, inBag.length)} dentro
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Ajustes de la bolsa"
                onClick={() => setSettings(true)}
              >
                <Settings2 className="size-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Borrar la bolsa"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-5" />
              </Button>
            </div>
          </div>
        </header>

        {/* ── Draw ── */}
        <section aria-labelledby="draw-title" className="sep-t px-4 py-6 sm:px-9">
          <h2 id="draw-title" className="sr-only">
            Sacar
          </h2>
          <BagDrawStage
            variant={variant}
            phase={phase}
            results={last?.shown ?? []}
            empty={items.isSuccess && inBag.length === 0 && phase === 'idle'}
            emptyText={
              out.length ? undefined : `Aún no hay nada dentro. Añade ${copy.many} para empezar a sacar.`
            }
          />
          <p className="sr-only" aria-live="polite">
            {phase === 'reveal' && last ? `Ha salido: ${last.shown.map((s) => s.label).join(', ')}` : ''}
          </p>

          <AnimatePresence initial={false}>
            {phase === 'reveal' && last && (
              <motion.div
                key="after"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0, transition: { ...snappy, delay: reduce ? 0 : 0.7 } }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                className="mt-4 flex flex-col gap-3"
              >
                {/* What to do with it */}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {single?.video && (
                    <Link
                      to={`/v/${single.video.id}`}
                      onClick={guardNav}
                      className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-washi px-5 text-[15px] font-bold text-sumi-900 hover:bg-kin-200"
                    >
                      <Film aria-hidden className="size-4.5" /> Abrir en el estudio
                    </Link>
                  )}
                  {single?.clip && (
                    <Link
                      to={`/v/${single.clip.video_id}?clip=${single.clip.id}`}
                      onClick={guardNav}
                      className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-washi px-5 text-[15px] font-bold text-sumi-900 hover:bg-kin-200"
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
                  {last.draws.length > 1 && bag.kind === 'clips' && (
                    <Button onClick={playRound}>
                      <Shuffle aria-hidden className="size-4.5" /> Jugar la ronda ({last.draws.length})
                    </Button>
                  )}
                </div>
                <div
                  role="group"
                  aria-label="Qué hacer con lo que ha salido"
                  className="flex flex-wrap justify-center gap-2"
                >
                  <Button
                    variant={removedNow ? 'primary' : 'secondary'}
                    aria-pressed={removedNow}
                    loading={setDrawRemoved.isPending && !removedNow}
                    onClick={() => !removedNow && void setRemoved(true)}
                  >
                    <Minus aria-hidden className="size-4" /> Quitar de la bolsa
                  </Button>
                  <Button
                    variant={!removedNow ? 'primary' : 'secondary'}
                    aria-pressed={!removedNow}
                    loading={setDrawRemoved.isPending && removedNow}
                    onClick={() => removedNow && void setRemoved(false)}
                  >
                    <Undo2 aria-hidden className="size-4" /> Devolver
                  </Button>
                </div>
                <p className="text-center text-[13px] text-washi-subtle">
                  Esta bolsa {bag.draw_mode === 'remove' ? 'quita' : 'devuelve'} lo que sale; puedes cambiarlo
                  esta vez.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Button
              size="lg"
              className="min-w-[10rem]"
              onClick={() => void onDraw(1)}
              disabled={phase === 'shaking' || inBag.length === 0}
            >
              Sacar
            </Button>
            {bag.kind === 'clips' && (
              <div className="flex items-center gap-1 rounded-[12px] border border-line p-1">
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
                  variant="secondary"
                  onClick={() => void onDraw(many)}
                  disabled={phase === 'shaking' || inBag.length < 2}
                  aria-label={`Sacar ${many} y hacer una ronda de Random Play Dance`}
                >
                  Sacar <span className="tabular">{many}</span>
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
            )}
          </div>
          {bag.kind === 'clips' && (
            <p className="mt-2 text-center text-[13px] text-washi-subtle">
              «Sacar varios» crea una ronda de Random Play Dance con lo que salga.
            </p>
          )}
        </section>

        {/* ── In the bag ── */}
        <section aria-labelledby="in-title" className="sep-t px-5 py-7 sm:px-9">
          <div className="flex items-center gap-3">
            <SectionTitle
              id="in-title"
              glyph="袋"
              className="flex-1"
              aside={<span className="tabular text-sm font-medium text-washi-subtle">{inBag.length}</span>}
            >
              En la bolsa
            </SectionTitle>
            <Button size="sm" variant="secondary" className="h-11" onClick={() => setAdding(true)}>
              <Plus aria-hidden className="size-4" /> Añadir
            </Button>
          </div>
          {items.isPending ? (
            <div className="mt-4 space-y-2">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="skeleton h-14 rounded-[12px]" />
              ))}
            </div>
          ) : inBag.length === 0 ? (
            <p className="mt-4 text-sm text-washi-muted">
              {out.length ? 'Todo ha salido ya. Pulsa «Rellenar» para devolverlo a la bolsa.' : copy.empty}
            </p>
          ) : (
            <ItemList items={inBag} kind={bag.kind} />
          )}
        </section>

        {/* ── Out of the bag ── */}
        {out.length > 0 && (
          <section aria-labelledby="out-title" className="sep-t px-5 py-7 sm:px-9">
            <div className="flex items-center gap-3">
              <SectionTitle
                id="out-title"
                glyph="外"
                className="flex-1"
                aside={<span className="tabular text-sm font-medium text-washi-subtle">{out.length}</span>}
              >
                Fuera de la bolsa
              </SectionTitle>
              <Button
                size="sm"
                variant="secondary"
                className="h-11"
                loading={refill.isPending}
                onClick={() =>
                  refill.mutate(bag.id, {
                    onSuccess: () => {
                      toast('Bolsa rellenada', 'success');
                      setPhase('idle');
                      setLast(null);
                    },
                    onError: (err) => toast(bagError(err), 'error'),
                  })
                }
              >
                <RotateCcw aria-hidden className="size-4" /> Rellenar
              </Button>
            </div>
            <ItemList items={out} kind={bag.kind} out />
          </section>
        )}

        {/* ── History ── */}
        <section aria-labelledby="history-title" className="sep-t px-5 pb-9 pt-7 sm:px-9">
          <SectionTitle id="history-title" glyph="記">
            Historial
          </SectionTitle>
          <History draws={draws.data} kind={bag.kind} loading={draws.isPending} />
        </section>
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

function ItemThumb({ item }: { item: BagItemView }) {
  if (item.member) return <MemberSeal member={item.member} />;
  if (item.clip) {
    return (
      <span
        aria-hidden
        className={cn('size-9 shrink-0 rotate-[-3deg] rounded-[6px]', CLIP_SWATCH[item.clip.color].dot)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="relative aspect-video w-16 shrink-0 overflow-hidden rounded-[6px] bg-sumi-950"
    >
      {item.video?.thumbnail_url && (
        <img
          src={item.video.thumbnail_url}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  );
}

function ItemList({ items, kind, out = false }: { items: BagItemView[]; kind: BagKind; out?: boolean }) {
  const setOut = useSetItemOut();
  const remove = useRemoveBagItem();
  const toast = useToast();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmId) return;
    const t = setTimeout(() => setConfirmId(null), 2600);
    return () => clearTimeout(t);
  }, [confirmId]);

  return (
    <ul className="-mx-2 mt-3 space-y-1">
      <AnimatePresence initial={false}>
        {items.map((item) => {
          const { title, sub } = itemTitle(item);
          const confirming = confirmId === item.id;
          return (
            <motion.li
              key={item.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -24, transition: { duration: 0.15 } }}
              transition={jelly}
              className={cn(
                'flex items-center gap-3 rounded-[12px] px-2 py-1.5 hover:bg-washi/[0.03]',
                out && 'opacity-80',
              )}
            >
              <ItemThumb item={item} />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block truncate text-[15px] font-medium',
                    out ? 'text-washi-muted line-through decoration-washi-subtle/60' : 'text-washi',
                  )}
                >
                  {title}
                </span>
                <span className="block truncate text-[12px] text-washi-subtle">
                  {out
                    ? `${KIND_COPY[kind].removed === 'quitado' ? 'Quitado' : 'Quitada'} el ${historyDay(item.removed_at!)}`
                    : sub}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-11 px-3"
                onClick={() =>
                  setOut.mutate({ item, out: !out }, { onError: (err) => toast(bagError(err), 'error') })
                }
              >
                {out ? 'Devolver' : 'Sacar a mano'}
              </Button>
              {!out && (
                <motion.button
                  type="button"
                  layout
                  aria-label={
                    confirming ? `Confirmar quitar ${title} de la bolsa` : `Quitar ${title} de la bolsa`
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
                  {confirming && <span>Quitar</span>}
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
  if (loading) return <div className="skeleton mt-4 h-20 rounded-[12px]" />;
  if (!draws?.length) return <p className="mt-3 text-sm text-washi-muted">Todavía no ha salido nada.</p>;
  return (
    <ol className="mt-3 space-y-1.5">
      {draws.map((d) => {
        const who = d.member_id ? byId.get(d.member_id) : undefined;
        const state = historyState(kind, d.removed);
        return (
          <li key={d.id} className="flex items-baseline gap-2 text-[15px] leading-snug text-washi-muted">
            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rotate-45 bg-kin-400/70" />
            <span className="min-w-0">
              <span className="text-washi-subtle">{historyDay(d.drawn_at)}:</span> salió{' '}
              <em className="font-display font-bold not-italic text-washi">{d.label}</em>
              {state && <span className={d.removed ? 'text-shu-400' : ''}> {state}</span>}
              <span className="text-[12px] text-washi-subtle">
                {' '}
                · {new Date(d.drawn_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                {who ? ` · lo sacó ${who.name}` : ''}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** «Añadir» inside a bag: songs from the library, clips, or the group's people. */
function AddItemsDialog({
  open,
  onClose,
  bag,
  items,
}: {
  open: boolean;
  onClose: () => void;
  bag: BagWithCount;
  items: BagItemView[];
}) {
  const { activeCrew } = useCrew();
  const videos = useVideos(activeCrew?.id, { enabled: open && bag.kind === 'songs' });
  const clips = useAllClips(open && bag.kind === 'clips');
  const members = useMembers();
  const add = useAddBagItem();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);
  const taken = useMemo(() => new Set(items.map(itemRef)), [items]);

  async function save() {
    const ids = [...selected];
    if (!ids.length) return onClose();
    const results = await Promise.allSettled(
      ids.map((id) =>
        add.mutateAsync(
          bag.kind === 'songs'
            ? { bag_id: bag.id, video_id: id }
            : bag.kind === 'clips'
              ? { bag_id: bag.id, clip_id: id }
              : { bag_id: bag.id, member_id: id },
        ),
      ),
    );
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed.length) toast(bagError(failed[0]!.reason), 'error');
    else toast(`${countLabel(bag.kind, ids.length)} en la bolsa`, 'success');
    onClose();
  }

  const loading =
    (bag.kind === 'songs' && videos.isPending) ||
    (bag.kind === 'clips' && clips.isPending) ||
    (bag.kind === 'people' && members.isPending);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={add.isPending}
      title={`Añadir ${KIND_COPY[bag.kind].many}`}
      description={`A «${bag.name}».`}
    >
      {loading ? (
        <div className="grid place-items-center py-10">
          <Spinner className="size-7 text-kin-300" />
        </div>
      ) : bag.kind === 'songs' ? (
        <SongPickList
          items={videos.data ?? []}
          selected={selected}
          taken={taken}
          onToggle={(v) => setSelected((s) => toggleIn(s, v.id))}
          emptyText="La biblioteca está vacía."
        />
      ) : bag.kind === 'clips' ? (
        <ClipPickList
          items={clips.data ?? []}
          selected={selected}
          taken={taken}
          onToggle={(c) => setSelected((s) => toggleIn(s, c.id))}
          emptyText="Aún no hay clips. Guarda uno en el estudio."
        />
      ) : (
        <MemberPickList
          items={members.data ?? []}
          selected={selected}
          taken={taken}
          onToggle={(m) => setSelected((s) => toggleIn(s, m.id))}
          emptyText="Aún no hay nadie en el grupo. Añadid vuestros nombres en Ajustes."
        />
      )}
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
