import type { BagDraw } from '@coverscape/shared';
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
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { guardNav, Page } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import {
  bagError,
  useAddBagSongToLibrary,
  useAllClips,
  useBagDraws,
  useBagItems,
  useDeleteBag,
  useDrawFromBag,
  useRefillBag,
  useSetDrawRemoved,
  type BagItemView,
  type BagWithCount,
} from '@/data/bags';
import { currentMemberId, useMembers } from '@/data/members';
import { MemberSeal } from '@/features/members/MembersUI';
import { newDraft, setRoundDraft } from '@/features/rpd/roundDraft';
import { snappy } from '@/lib/motion';
import { useCrew } from '@/providers/CrewProvider';
import { useToast } from '@/providers/ToastProvider';
import { AddItemsDialog } from './AddItemsDialog';
import { BagDrawStage, SHAKE_MS, type DrawPhase } from './BagDrawStage';
import { BagSettingsDialog } from './BagSettingsDialog';
import { KIND_COPY, MODE_COPY, MULTI_DRAW_MAX, MULTI_DRAW_MIN } from './drawRules';
import { roundClipIds, roundSkipText } from './songRules';
import { type DrawShown } from './tones';

import { BagLists } from './BagLists';
import { shownFor, wait } from './bagVisibility';

// REQ-27 · Split out of BagPage.tsx: one bag (the draw scene, its actions and its lists).

const actionLink =
  'inline-flex h-11 items-center gap-2 rounded-[10px] bg-washi px-5 text-[15px] font-bold text-sumi-900 hover:bg-kin-200';

/**
 * Point 31 · Top to bottom: a one-line header (back, name, settings and delete as small icons), the draw scene
 * with «Sacar» and «Añadir» side by side and «Sacar varios» under them, what to do with what came out, and then
 * the bag's lists in tabs. At 390×844 the scene and «Sacar» fit without scrolling.
 */
export function BagView({ bag }: { bag: BagWithCount }) {
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

  const all = useMemo(() => items.data ?? [], [items.data]);
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
  const preview = useMemo(
    () => (multi ? roundClipIds(drawnNow, clips.data ?? [], () => 0) : null),
    [multi, drawnNow, clips.data],
  );
  const playable = preview?.clipIds.length ?? 0;
  // A YouTube song only in the bag «aún no está en la biblioteca»: not the same as a library song without clips.
  const skipText = preview
    ? roundSkipText({ playable, skipped: preview.skipped, notInLibrary: preview.notInLibrary })
    : null;

  function playRound() {
    if (!last) return;
    const { clipIds, skipped, notInLibrary } = roundClipIds(drawnNow, clips.data ?? []);
    const note = roundSkipText({ playable: clipIds.length, skipped, notInLibrary });
    if (!clipIds.length) {
      toast(
        bag.kind === 'songs' ? (note ?? 'No se pudo preparar la ronda') : 'No se pudo preparar la ronda',
        'info',
      );
      return;
    }
    if (note) toast(note, 'info');
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
              aria-label="Sacar uno menos a la vez"
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
              aria-label="Sacar uno más a la vez"
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
                {multi && bag.kind === 'songs' && !clips.isPending && skipText && (
                  <p className="text-center text-[13px] text-washi-subtle">{skipText}</p>
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
