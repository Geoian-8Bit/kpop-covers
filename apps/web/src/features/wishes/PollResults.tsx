import type { Member, Poll, Wish } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { Dices, Film, Library, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { guardNav } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { NEXT_COREO_BAG, useAddToNextCoreo, useAddWishToLibrary, wishError } from '@/data/wishes';
import { BagIcon } from '@/features/bags/BagIcon';
import { MemberSeal } from '@/features/members/MembersUI';
import { cn } from '@/lib/cn';
import { fadeUpCapped, jelly, soft } from '@/lib/motion';
import { thumbCors } from '@/lib/thumbCors';
import { useCrew } from '@/providers/CrewProvider';
import { useToast } from '@/providers/ToastProvider';
import { drawAmongTied, scoreLabel, showsVoterNames, type OptionResult } from './pollRules';
import { TieDraw } from './TieDraw';
import { VoteReveal } from './VoteReveal';

// REQ-27 · Split out of PollPage.tsx: the results, the tie and the winner of a vote.

const rowIn = fadeUpCapped(0.05, 8);

export function Results({
  poll,
  results,
  wishById,
  memberById,
  highlight,
}: {
  poll: Poll;
  results: OptionResult[];
  wishById: Map<string, Wish>;
  memberById: Map<string, Member>;
  highlight: string | null;
}) {
  const max = Math.max(1, ...results.map((r) => r.score));
  // A tie settled by the draw: the winner leads among the equal scores.
  const ordered = results
    .slice()
    .sort((a, b) => b.score - a.score || Number(b.wishId === highlight) - Number(a.wishId === highlight));
  return (
    <motion.ol initial="hidden" animate="show" className="space-y-2.5">
      {ordered.map((r, i) => {
        const wish = wishById.get(r.wishId);
        const voters = r.voters
          .map((v) => ({ ...v, member: memberById.get(v.memberId) }))
          .filter((v): v is typeof v & { member: Member } => Boolean(v.member));
        const top = highlight === r.wishId;
        return (
          <motion.li
            key={r.optionId}
            variants={rowIn}
            custom={i}
            className={cn(
              'rounded-[12px] border px-3 py-2.5',
              top ? 'border-kin-300/70 bg-kin-400/[0.08]' : 'border-line',
            )}
          >
            <div className="flex items-center gap-3">
              <span className="tabular w-5 shrink-0 text-center font-display text-[15px] font-extrabold text-washi-subtle">
                {i + 1}
              </span>
              {wish?.thumbnail_url && (
                <img
                  src={wish.thumbnail_url}
                  crossOrigin={thumbCors(wish.thumbnail_url)}
                  alt=""
                  loading="lazy"
                  className="aspect-video w-14 shrink-0 rounded-[5px] object-cover"
                />
              )}
              <span className="min-w-0 flex-1 break-words text-[14px] font-bold leading-snug text-washi">
                {wish?.title ?? 'Ya no está en la lista'}
              </span>
              <span
                className={cn('tabular shrink-0 text-[14px] font-bold', top ? 'text-kin-300' : 'text-washi')}
              >
                {scoreLabel(poll.vote_type, r.score)}
              </span>
            </div>
            <div className="ml-8 mt-2 h-2 overflow-hidden rounded-full bg-sumi-950" aria-hidden>
              <motion.div
                className={cn('h-full rounded-full', top ? 'bg-kin-300' : 'bg-ai-400')}
                initial={{ width: 0 }}
                animate={{ width: `${(r.score / max) * 100}%` }}
                transition={soft}
              />
            </div>
            {/* 52 · Named votes; an older vote cast as anonymous keeps its names hidden. */}
            {showsVoterNames(poll) && voters.length > 0 && (
              <p className="ml-8 mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-washi-muted">
                {voters.map((v) => (
                  <span key={v.memberId} className="inline-flex items-center gap-1">
                    <MemberSeal member={v.member} size="sm" />
                    {v.member.name}
                    {v.position != null && <span className="text-washi-subtle">({v.position}.ª)</span>}
                  </span>
                ))}
              </p>
            )}
          </motion.li>
        );
      })}
    </motion.ol>
  );
}

/** Tie: «Sorteo entre empatadas» (here, at random, with the lantern) or «Segunda vuelta» (a new vote). */
export function TieBlock({
  poll,
  tied,
  wishById,
  canDraw,
  onDrawn,
  onSecondRound,
}: {
  poll: Poll;
  tied: string[];
  wishById: Map<string, Wish>;
  /** The draw is written with the close; once closed without a winner only a second round is left. */
  canDraw: boolean;
  onDrawn: (wishId: string) => Promise<void> | void;
  onSecondRound: () => void;
}) {
  const [drawn, setDrawn] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const names = tied.map((id) => wishById.get(id)?.title ?? '¿?');
  return (
    <div className="space-y-4">
      <p className="text-sm text-washi-muted">
        Empate entre <span className="font-bold text-washi">{names.map((n) => `«${n}»`).join(' y ')}</span> en
        «{poll.title}».
      </p>
      {drawn ? (
        <>
          <TieDraw
            candidates={tied.map((id) => ({
              id,
              title: wishById.get(id)?.title ?? '¿?',
              thumbnail: wishById.get(id)?.thumbnail_url,
            }))}
            winnerId={drawn}
            onDone={async () => {
              setSaving(true);
              await onDrawn(drawn);
              setSaving(false);
            }}
          />
          {saving && (
            <p className="flex items-center gap-2 text-[13px] text-washi-subtle">
              <Spinner className="size-4" /> Cerrando con la ganadora del sorteo…
            </p>
          )}
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canDraw && (
            <Button onClick={() => setDrawn(drawAmongTied(tied))}>
              <Dices aria-hidden className="size-4.5" /> Sorteo entre empatadas
            </Button>
          )}
          <Button variant="secondary" onClick={onSecondRound}>
            <RotateCcw aria-hidden className="size-4.5" /> Segunda vuelta
          </Button>
        </div>
      )}
    </div>
  );
}

/** The winner: the reveal («Hanabi»), «Añadir a la biblioteca» and the bag «Próxima coreo». */
export function WinnerBlock({
  poll,
  wish,
  result,
}: {
  poll: Poll;
  wish: Wish;
  result: OptionResult | undefined;
}) {
  const { activeCrew } = useCrew();
  const addToLibrary = useAddWishToLibrary(activeCrew?.id);
  const toBag = useAddToNextCoreo();
  const toast = useToast();
  const [replay, setReplay] = useState(0);
  const [shown, setShown] = useState(false);

  return (
    <div>
      <VoteReveal
        key={replay}
        winner={{
          title: wish.title,
          artist: wish.artist,
          thumbnail: wish.thumbnail_url,
          score: result ? scoreLabel(poll.vote_type, result.score) : null,
        }}
        onDone={() => setShown(true)}
      />
      <AnimatePresence>
        {shown && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={jelly}
            className="mt-4 flex flex-wrap items-center justify-center gap-2"
          >
            {wish.added_video_id ? (
              <Link
                to={`/v/${wish.added_video_id}`}
                onClick={guardNav}
                className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-washi px-5 text-[15px] font-bold text-sumi-900 hover:bg-kin-200"
              >
                <Film aria-hidden className="size-4.5" /> Abrir en el estudio
              </Link>
            ) : (
              <Button
                loading={addToLibrary.isPending}
                onClick={() =>
                  addToLibrary.mutate(wish, {
                    onSuccess: (r) =>
                      toast(
                        r.existed ? 'Ya estaba en la biblioteca' : `«${wish.title}» añadida a la biblioteca`,
                        'success',
                      ),
                    onError: (err) => toast(wishError(err), 'error'),
                  })
                }
              >
                <Library aria-hidden className="size-4.5" /> Añadir a la biblioteca
              </Button>
            )}
            <Button
              variant="secondary"
              loading={toBag.isPending}
              onClick={() =>
                toBag.mutate(wish, {
                  onSuccess: (r) =>
                    toast(
                      r.already
                        ? `Ya estaba en «${NEXT_COREO_BAG}»`
                        : `Metida en la bolsa «${NEXT_COREO_BAG}»`,
                      'success',
                    ),
                  onError: (err) => toast(wishError(err), 'error'),
                })
              }
            >
              <BagIcon /> Meter en «{NEXT_COREO_BAG}»
            </Button>
            <Button variant="ghost" onClick={() => setReplay((n) => n + 1)}>
              <RotateCcw aria-hidden className="size-4" /> Ver otra vez
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
