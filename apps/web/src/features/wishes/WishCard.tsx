import type { Member, Poll, Wish, WishInterest } from '@coverscape/shared';
import { motion } from 'motion/react';
import { Check, Library, Pencil, Plus, Trash2, Vote } from 'lucide-react';
import { lazy, memo, Suspense, useState } from 'react';
import { Link } from 'react-router';
import { guardNav } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MetaLine } from '@/components/ui/MetaLine';
import { useIdentity, useMembers } from '@/data/members';
import { useAddWishToLibrary, useDeleteWish, useToggleInterest, wishError } from '@/data/wishes';
import { BagIcon } from '@/features/bags/BagIcon';
import { MemberSeal } from '@/features/members/MembersUI';
import { cn } from '@/lib/cn';
import { fadeUpCapped, jelly, snappy } from '@/lib/motion';
import { thumbCors } from '@/lib/thumbCors';
import { useCrew } from '@/providers/CrewProvider';
import { useToast } from '@/providers/ToastProvider';
import { ActionMenu } from './ActionMenu';
import { withMe } from './identity';
import { scoreLabel, type PastVote } from './pollRules';
import { WishFormDialog } from './WishFormDialog';
import { DIFFICULTY_COPY, membersLabel } from './wishRules';

// REQ-27 · Split out of WishesPage.tsx: one wish of the list.

export const cardIn = fadeUpCapped(0.05, 8);
// A chip stays one line: a long poll name ends in «…» (whole in the chip's `title`).
const CHIP_TEXT = 'min-w-0 truncate';
// The bags' own dialog (F13), loaded only when someone opens it.
const AddToBagDialog = lazy(() =>
  import('@/features/bags/AddToBagDialog').then((m) => ({ default: m.AddToBagDialog })),
);

// REQ-22 · memo: the list hands it stable props (shared empties, a stable toggle), so a vote or a tap elsewhere re-renders only the cards it touches.
export const WishCard = memo(function WishCard({
  wish,
  index,
  interested,
  interestRows,
  memberById,
  openPoll,
  won,
  past,
  selecting,
  selected,
  onToggleSelect,
}: {
  wish: Wish;
  index: number;
  interested: string[];
  interestRows: WishInterest[];
  memberById: Map<string, Member>;
  openPoll: Poll | null;
  won: Poll | null;
  past: PastVote[];
  selecting: boolean;
  selected: boolean;
  onToggleSelect: (wishId: string) => void;
}) {
  const { activeCrew } = useCrew();
  const toggleInterest = useToggleInterest();
  const addToLibrary = useAddWishToLibrary(activeCrew?.id);
  const remove = useDeleteWish();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [bagLoaded, setBagLoaded] = useState(false);
  const proposer = wish.proposed_by_member_id ? memberById.get(wish.proposed_by_member_id) : null;
  const meId = useIdentity((s) => s.memberId);
  const mine = meId
    ? (interestRows.find((r) => r.wish_id === wish.id && r.member_id === meId) ?? null)
    : null;
  const shown = interested.map((id) => memberById.get(id)).filter((m): m is Member => Boolean(m));

  const members = useMembers();
  function onInterest() {
    // One change at a time: a second tap before the first answers would act on a row that doesn't exist yet.
    if (toggleInterest.isPending) return;
    withMe('Para apuntarte, di quién eres.', members.data, (memberId) => {
      const row = interestRows.find((r) => r.wish_id === wish.id && r.member_id === memberId) ?? null;
      toggleInterest.mutate(
        { wishId: wish.id, memberId, row },
        { onError: (err) => toast(wishError(err), 'error') },
      );
    });
  }

  async function onAddToLibrary() {
    try {
      const result = await addToLibrary.mutateAsync(wish);
      toast(
        result.existed
          ? `«${wish.title}» ya estaba en la biblioteca: sale de la lista`
          : `«${wish.title}» añadida a la biblioteca`,
        'success',
      );
    } catch (err) {
      toast(wishError(err), 'error');
    }
  }

  const details = [
    wish.artist,
    membersLabel(wish.members_count),
    wish.difficulty ? DIFFICULTY_COPY[wish.difficulty].label : null,
  ].filter(Boolean);

  const thumb = wish.thumbnail_url && (
    <img
      src={wish.thumbnail_url}
      crossOrigin={thumbCors(wish.thumbnail_url)}
      alt=""
      loading="lazy"
      className="absolute inset-0 size-full object-cover"
    />
  );
  const count = members.data ? shown.length : interested.length;

  return (
    <motion.li variants={cardIn} custom={index} layout transition={snappy}>
      <article
        aria-label={wish.title}
        className={cn(
          'relative min-w-0 rounded-[12px] border bg-sumi-900/60 p-3 transition-colors sm:p-4',
          selected ? 'border-kin-400/70 bg-kin-400/[0.06]' : 'border-line',
        )}
      >
        <div className="flex min-w-0 gap-3">
          {selecting && (
            // Stretched over the whole card: in this mode a tap anywhere on it marks or unmarks the song. No transform
            // on the button itself (a whileTap would shrink its stretched layer to the box mid-tap, and the tap would
            // land on the card instead); only the box inside pops when it changes.
            <button
              type="button"
              role="checkbox"
              aria-checked={selected}
              aria-label={`Elegir «${wish.title}» para la votación`}
              onClick={() => onToggleSelect(wish.id)}
              className="-ml-1 grid size-11 shrink-0 place-items-center before:absolute before:inset-0 before:rounded-[12px] before:content-['']"
            >
              <motion.span
                key={selected ? 'on' : 'off'}
                initial={{ scale: 0.7 }}
                animate={{ scale: 1 }}
                transition={jelly}
                className={cn(
                  'grid size-6 place-items-center rounded-[6px] border-2 transition-colors',
                  selected ? 'border-kin-300 bg-kin-300 text-sumi-900' : 'border-line-strong',
                )}
              >
                {selected && <Check aria-hidden className="size-4" strokeWidth={3} />}
              </motion.span>
            </button>
          )}
          {selecting ? (
            // Positioned, so it paints over the stretched checkbox: taps go through it.
            <span className="pointer-events-none relative aspect-video w-24 shrink-0 self-start overflow-hidden rounded-[8px] bg-sumi-950 sm:w-32">
              {thumb}
            </span>
          ) : (
            <a
              href={`https://www.youtube.com/watch?v=${wish.youtube_id}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`Ver «${wish.title}» en YouTube (se abre aparte)`}
              className="relative aspect-video w-24 shrink-0 self-start overflow-hidden rounded-[8px] bg-sumi-950 sm:w-32"
            >
              {thumb}
            </a>
          )}
          <div className="min-w-0 flex-1">
            <h3
              title={wish.title}
              className="line-clamp-2 break-words font-display text-[16px] sm:text-[17px] font-bold leading-snug text-washi"
            >
              {wish.title}
            </h3>
            {details.length > 0 && (
              <p className="mt-0.5 text-[13px] text-washi-muted">
                <MetaLine parts={details} />
              </p>
            )}
            {wish.comment && !selecting && (
              <p
                title={wish.comment}
                className="mt-0.5 line-clamp-2 break-words text-[13px] italic text-washi-subtle"
              >
                «{wish.comment}»
              </p>
            )}
            {selecting && (
              <p className="tabular mt-1 text-[13px] text-washi-subtle">
                {count === 1 ? '1 se apunta' : `${count} se apuntan`}
              </p>
            )}
          </div>
          {!selecting && (
            <ActionMenu
              label={`Más acciones de «${wish.title}»`}
              className="-mr-1.5 -mt-1.5 shrink-0 self-start"
              actions={[
                {
                  label: 'Añadir a la biblioteca',
                  icon: <Library aria-hidden className="size-4" />,
                  onSelect: () => void onAddToLibrary(),
                  disabled: addToLibrary.isPending,
                },
                {
                  label: 'Meter en una bolsa',
                  icon: <BagIcon className="size-4" />,
                  onSelect: () => {
                    setBagLoaded(true);
                    setBagOpen(true);
                  },
                },
                {
                  label: 'Editar',
                  icon: <Pencil aria-hidden className="size-4" />,
                  onSelect: () => setEditing(true),
                },
                {
                  label: 'Borrar',
                  icon: <Trash2 aria-hidden className="size-4" />,
                  onSelect: () => setConfirming(true),
                  tone: 'danger',
                },
              ]}
            />
          )}
        </div>

        {!selecting && (
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <motion.button
              type="button"
              aria-pressed={Boolean(mine)}
              onClick={onInterest}
              whileTap={{ scale: 0.9 }}
              transition={jelly}
              className={cn(
                'inline-flex h-11 shrink-0 items-center gap-2 rounded-[10px] border px-4 text-[15px] font-bold transition-colors',
                mine
                  ? 'border-kin-300 bg-kin-300 text-sumi-900'
                  : 'border-kin-300/60 bg-kin-300/[0.08] text-kin-200 hover:border-kin-300 hover:bg-kin-300/[0.14]',
              )}
            >
              <motion.span
                key={mine ? 'on' : 'off'}
                initial={{ scale: 0.4, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={jelly}
                aria-hidden
              >
                {mine ? <Check className="size-4" strokeWidth={3} /> : <Plus className="size-4" />}
              </motion.span>
              Me apunto
              <span
                className={cn(
                  'tabular rounded-full px-1.5 text-[13px]',
                  mine ? 'bg-sumi-900/15' : 'bg-washi/10 text-washi',
                )}
              >
                {count}
              </span>
            </motion.button>
            {shown.length > 0 && (
              <span
                className="flex min-w-0 items-center gap-1.5"
                aria-label={`Se apuntan: ${shown.map((m) => m.name).join(', ')}`}
              >
                <span className="flex -space-x-1.5">
                  {shown.slice(0, 5).map((m) => (
                    <span key={m.id} title={m.name} className="rounded-[8px] ring-2 ring-sumi-900">
                      <MemberSeal member={m} size="sm" />
                    </span>
                  ))}
                </span>
                {shown.length > 5 && (
                  <span className="tabular text-[12px] text-washi-subtle">+{shown.length - 5}</span>
                )}
              </span>
            )}
          </div>
        )}

        {/* The chips look 32 px tall; each one's touch area reaches 44 px (6 px over and under: rows sit 12 px apart). */}
        {!selecting && (openPoll || won || past.length > 0 || proposer) && (
          <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-3 text-[12px] text-washi-subtle">
            {openPoll && (
              <Link
                to={`/deseos/votacion/${openPoll.id}`}
                onClick={guardNav}
                className="relative inline-flex min-h-8 max-w-full items-center before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] gap-1 rounded-full bg-ai-700/60 px-2.5 font-bold text-ai-200 hover:bg-ai-600/60"
              >
                <Vote aria-hidden className="size-3.5 shrink-0" />
                <span title={openPoll.title} className={CHIP_TEXT}>
                  En votación: {openPoll.title}
                </span>
              </Link>
            )}
            {won && (
              <Link
                to={`/deseos/votacion/${won.id}`}
                onClick={guardNav}
                className="relative inline-flex min-h-8 max-w-full items-center before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] gap-1 rounded-full bg-kin-400/15 px-2.5 font-bold text-kin-200 hover:bg-kin-400/25"
              >
                <span title={won.title} className={CHIP_TEXT}>
                  Ganó «{won.title}»
                </span>
              </Link>
            )}
            {past.slice(0, 2).map((p, i) => (
              <Link
                key={p.pollId}
                to={`/deseos/votacion/${p.pollId}`}
                onClick={guardNav}
                // Phones show only the latest past vote: each chip is a row of its own there.
                className={cn(
                  "relative inline-flex min-h-8 max-w-full items-center before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] gap-1 rounded-full border border-line px-2.5 hover:border-line-strong hover:text-washi-muted",
                  i > 0 && 'max-sm:hidden',
                )}
                title="Sus votos en una votación anterior"
              >
                <span className={CHIP_TEXT}>
                  <span className="tabular font-bold text-kin-300">{scoreLabel(p.type, p.score)}</span> en «
                  {p.title}»
                </span>
              </Link>
            ))}
            {proposer && <span className="min-w-0 truncate">Propuesta por {proposer.name}</span>}
          </div>
        )}
      </article>

      {bagLoaded && (
        <Suspense fallback={null}>
          <AddToBagDialog
            open={bagOpen}
            onClose={() => setBagOpen(false)}
            target={{ kind: 'songs', wishId: wish.id, label: wish.title }}
          />
        </Suspense>
      )}
      <WishFormDialog open={editing} onClose={() => setEditing(false)} wish={wish} />
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        busy={remove.isPending}
        size="sm"
        hideClose
        title="¿Borrar la propuesta?"
        description={
          <>
            «{wish.title}» sale de la lista de deseos (y de sus bolsas).
            {openPoll && (
              <span role="alert" className="mt-2 block font-medium text-kin-200">
                Está en la votación «{openPoll.title}», que sigue abierta: si la borras, deja de ser candidata
                y sus votos ya no cuentan.
              </span>
            )}
          </>
        }
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setConfirming(false)} disabled={remove.isPending}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() =>
              remove.mutate(wish, {
                onSuccess: () => {
                  setConfirming(false);
                  toast('Propuesta borrada', 'success');
                },
                onError: (err) => toast(wishError(err), 'error'),
              })
            }
          >
            Borrar
          </Button>
        </div>
      </Dialog>
    </motion.li>
  );
});
