import type { Poll, PollOption, Wish } from '@coverscape/shared';
import { AnimatePresence, motion, Reorder, useDragControls } from 'motion/react';
import { Check, GripVertical, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { LiveMessage, MoveArrows } from '@/components/ui/MoveArrows';
import { openWho, useMe, useMembers } from '@/data/members';
import { useCastVote, wishError } from '@/data/wishes';
import { MemberSeal } from '@/features/members/MembersUI';
import { cn } from '@/lib/cn';
import { jelly, snappy } from '@/lib/motion';
import { useAnnouncer } from '@/lib/reorderA11y';
import { useToast } from '@/providers/ToastProvider';
import { withMe } from './identity';
import { ballotProblem, moveInRanking, VOTE_TYPE_COPY } from './pollRules';

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * F11 · the ballot: one vote (radio), several (checkboxes) or a ranking (drag, or the ↑ ↓ buttons). It is sent
 * whole with «Votar» and can be changed or withdrawn until the vote closes.
 */
export function Ballot({
  poll,
  options,
  wishById,
  saved,
}: {
  poll: Poll;
  options: PollOption[];
  wishById: Map<string, Wish>;
  /** This person's ballot as stored (option ids, in rank order). */
  saved: string[];
}) {
  const me = useMe();
  const members = useMembers();
  const cast = useCastVote();
  const toast = useToast();
  const optionIds = useMemo(() => options.map((o) => o.id), [options]);
  // A saved choice whose song was deleted from the list meanwhile no longer counts: it's left out here too.
  const initial = useMemo(() => {
    const kept = saved.filter((id) => optionIds.includes(id));
    return poll.vote_type === 'ranking' ? [...kept, ...optionIds.filter((id) => !kept.includes(id))] : kept;
  }, [poll.vote_type, saved, optionIds]);
  const [draft, setDraft] = useState<string[]>(initial);
  const [dirty, setDirty] = useState(false);
  // Someone else's phone (or this one) saved: follow it unless there are unsaved changes here.
  useEffect(() => {
    if (!dirty) setDraft(initial);
  }, [initial, dirty]);
  useEffect(() => setDirty(false), [me?.id]);

  const change = (next: string[]) => {
    setDraft(next);
    setDirty(!sameList(next, initial));
  };
  const problem = ballotProblem(poll.vote_type, draft, optionIds);
  const hasVote = saved.some((id) => optionIds.includes(id));
  const canSend = !cast.isPending && !problem && draft.length > 0 && (dirty || (poll.vote_type === 'ranking' && !hasVote));

  function send(ballot: string[]) {
    withMe('Para votar, di quién eres.', members.data, (memberId) => {
      cast.mutate(
        { pollId: poll.id, memberId, optionIds: ballot },
        {
          onSuccess: () => {
            setDirty(false);
            toast(ballot.length ? (hasVote ? 'Voto cambiado' : 'Voto guardado') : 'Voto retirado', 'success');
          },
          onError: (err) => toast(wishError(err), 'error'),
        },
      );
    });
  }

  const optionLabel = (id: string) => {
    const option = options.find((o) => o.id === id);
    return option ? wishById.get(option.wish_id) : undefined;
  };

  return (
    <section aria-labelledby="ballot-title" className="px-4 py-6 sm:px-9">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="ballot-title" className="font-display text-[19px] font-bold text-washi">
          Tu voto
        </h2>
        <button
          type="button"
          onClick={openWho}
          className="inline-flex min-h-11 items-center gap-2 rounded-[10px] px-2.5 text-[13px] text-washi-muted hover:bg-washi/[0.06] hover:text-washi"
        >
          <MemberSeal member={me} size="sm" />
          {me ? (
            <>
              Votas como <span className="font-bold text-washi">{me.name}</span> · Cambiar
            </>
          ) : (
            '¿Quién eres?'
          )}
        </button>
      </div>

      {!me ? (
        <div className="flex flex-col items-stretch gap-3 sm:items-start">
          <Button size="lg" onClick={() => withMe('Para votar, di quién eres.', members.data, () => undefined)}>
            <UserRound aria-hidden className="size-4" /> Elegir mi nombre para votar
          </Button>
        </div>
      ) : (
        <>
          <p className="mb-3 text-[13px] text-washi-subtle">{VOTE_TYPE_COPY[poll.vote_type].how}</p>
          {poll.vote_type === 'ranking' ? (
            <RankingList order={draft} onChange={change} labelOf={optionLabel} />
          ) : (
            <ul
              role={poll.vote_type === 'single' ? 'radiogroup' : 'group'}
              aria-label="Candidatas"
              className="space-y-2"
            >
              {options.map((option) => {
                const wish = wishById.get(option.wish_id);
                const checked = draft.includes(option.id);
                return (
                  <li key={option.id}>
                    <motion.button
                      type="button"
                      role={poll.vote_type === 'single' ? 'radio' : 'checkbox'}
                      aria-checked={checked}
                      onClick={() =>
                        change(
                          poll.vote_type === 'single'
                            ? checked
                              ? []
                              : [option.id]
                            : checked
                              ? draft.filter((x) => x !== option.id)
                              : [...draft, option.id],
                        )
                      }
                      whileTap={{ scale: 0.98 }}
                      transition={jelly}
                      className={cn(
                        'flex min-h-16 w-full items-center gap-3 rounded-[12px] border px-3 py-2 text-left transition-colors',
                        checked ? 'border-kin-300 bg-kin-400/[0.1]' : 'border-line hover:border-line-strong hover:bg-washi/[0.04]',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'grid size-6 shrink-0 place-items-center border-2 transition-colors',
                          poll.vote_type === 'single' ? 'rounded-full' : 'rounded-[6px]',
                          checked ? 'border-kin-300 bg-kin-300 text-sumi-900' : 'border-line-strong',
                        )}
                      >
                        <AnimatePresence>
                          {checked && (
                            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={jelly}>
                              <Check className="size-3.5" strokeWidth={3.5} />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </span>
                      <WishLine wish={wish} />
                    </motion.button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Stays in reach while scrolling a long list of candidates (inside the ballot only). On phones its right
              edge leaves room for the floating menu button (`--fab-clearance`, set by the shell while it shows). */}
          <div className="paper-raised sticky bottom-[calc(env(safe-area-inset-bottom)+12px)] z-10 -mx-1.5 mt-4 flex flex-wrap items-center gap-2 rounded-[14px] p-1.5 max-lg:mr-[var(--fab-clearance,0px)]">
            <Button
              size="lg"
              className="min-w-0 flex-1 sm:flex-none"
              onClick={() => send(draft)}
              disabled={!canSend}
              loading={cast.isPending}
            >
              {hasVote ? 'Cambiar voto' : 'Votar'}
            </Button>
            {hasVote && (
              <Button variant="ghost" onClick={() => send([])} disabled={cast.isPending}>
                Retirar mi voto
              </Button>
            )}
            {dirty && hasVote && (
              <Button variant="ghost" onClick={() => change(initial)} disabled={cast.isPending}>
                Deshacer cambios
              </Button>
            )}
          </div>
          <p className="mt-2 min-h-5 text-[13px] text-washi-subtle" aria-live="polite">
            {dirty ? 'Tienes cambios sin guardar.' : hasVote ? 'Voto guardado. Puedes cambiarlo hasta el cierre.' : ''}
          </p>
        </>
      )}
    </section>
  );
}

function WishLine({ wish, compact = false }: { wish: Wish | undefined; compact?: boolean }) {
  // compact (ranking rows): no thumbnail on phones, the title needs the room next to the grip and arrows.
  const thumb = cn('aspect-video w-20 shrink-0 rounded-[6px]', compact && 'hidden sm:block');
  return (
    <>
      {wish?.thumbnail_url ? (
        <img src={wish.thumbnail_url} alt="" loading="lazy" className={cn(thumb, 'object-cover')} />
      ) : (
        <span aria-hidden className={cn(thumb, 'bg-sumi-950')} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold text-washi">{wish?.title ?? 'Ya no está en la lista'}</span>
        {wish?.artist && <span className="block truncate text-[12px] text-washi-subtle">{wish.artist}</span>}
      </span>
    </>
  );
}

/** Ranking: drag by the handle, or move with ↑ ↓ (keyboard and one-handed use). */
function RankingList({
  order,
  onChange,
  labelOf,
}: {
  order: string[];
  onChange: (next: string[]) => void;
  labelOf: (optionId: string) => Wish | undefined;
}) {
  const [message, announce] = useAnnouncer();
  return (
    <>
      <Reorder.Group axis="y" values={order} onReorder={onChange} className="space-y-2" aria-label="Tu orden de preferencia">
        {order.map((id, index) => (
          <RankingItem
            key={id}
            id={id}
            index={index}
            total={order.length}
            wish={labelOf(id)}
            onMove={(delta) => onChange(moveInRanking(order, index, delta))}
            announce={announce}
          />
        ))}
      </Reorder.Group>
      <LiveMessage message={message} />
    </>
  );
}

function RankingItem({
  id,
  index,
  total,
  wish,
  onMove,
  announce,
}: {
  id: string;
  index: number;
  total: number;
  wish: Wish | undefined;
  onMove: (delta: -1 | 1) => void;
  announce: (message: string) => void;
}) {
  const controls = useDragControls();
  const title = wish?.title ?? 'Candidata';
  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      transition={snappy}
      whileDrag={{ scale: 1.03, boxShadow: '0 16px 30px -12px rgb(0 0 0 / 0.9)' }}
      className="flex min-h-16 items-center gap-2 rounded-[12px] border border-line bg-sumi-850 py-2 pl-1 pr-1.5"
    >
      {/* Pointer only: the keyboard (and screen readers) use ↑ ↓, so the handle is not a tab stop. */}
      <span
        aria-hidden
        onPointerDown={(e) => controls.start(e)}
        className="grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-[8px] text-washi-subtle hover:text-washi active:cursor-grabbing"
      >
        <GripVertical className="size-5" />
      </span>
      <span
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-[7px] font-display text-[15px] font-extrabold',
          index === 0 ? 'bg-kin-400 text-sumi-900' : 'bg-sumi-700 text-washi',
        )}
      >
        <span className="sr-only">Puesto </span>
        {index + 1}
      </span>
      <WishLine wish={wish} compact />
      <MoveArrows
        index={index}
        total={total}
        name={title}
        onMove={onMove}
        announce={announce}
        className="flex-col sm:flex-row"
        iconClassName="size-4.5"
      />
    </Reorder.Item>
  );
}
