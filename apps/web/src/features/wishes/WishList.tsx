import type { Poll, PollOption, PollVote, Wish, WishInterest } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, ListChecks, Plus, Vote, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { guardNav } from '@/components/AppShell';
import { Seal } from '@/components/Seal';
import { useStickyBarPadding } from '@/components/stickyBarPadding';
import { Button } from '@/components/ui/Button';
import { MetaLine } from '@/components/ui/MetaLine';
import { useMembers } from '@/data/members';
import { usePollOptions, usePolls, usePollVotes, useWishes, useWishInterest } from '@/data/wishes';
import { snappy } from '@/lib/motion';
import { thumbCors } from '@/lib/thumbCors';
import { useToast } from '@/providers/ToastProvider';
import { useClosingNow } from './identity';
import { useNow } from '@/lib/useNow';
import { closingLabel, isPollClosed, pastVotesOf, type PastVote } from './pollRules';
import { interestByWish, liveWishes, selectionHint, sortByInterest } from './wishRules';

import { WishCard } from './WishCard';

// REQ-27 · Split out of WishesPage.tsx: the wish list (and the open votes on top of it).

// REQ-22 · Shared empties, so a memoised card never sees a new [] for nothing.
const NONE: string[] = [];
const NO_PAST: PastVote[] = [];
const NO_INTEREST: WishInterest[] = [];

// ───────────────────────── Lista de deseos ─────────────────────────

/** The open votes on top of the wish list (37): one tap to vote. */
function OpenPolls({
  polls,
  options,
  wishById,
  onAll,
}: {
  polls: Poll[];
  options: PollOption[];
  wishById: Map<string, Wish>;
  onAll: () => void;
}) {
  const now = useNow();
  const shown = polls.slice(0, 3);
  return (
    <section aria-labelledby="open-polls-title" className="px-4 pt-5 sm:px-9">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2
          id="open-polls-title"
          className="flex items-center gap-2 font-display text-[17px] font-bold text-washi"
        >
          <span aria-hidden className="size-2 rounded-full bg-ai-300" />
          {polls.length === 1 ? 'Votación abierta' : 'Votaciones abiertas'}
        </h2>
        {polls.length > shown.length && (
          <button
            type="button"
            onClick={onAll}
            className="inline-flex min-h-11 items-center rounded-[10px] px-2 text-[13px] font-bold text-kin-300 hover:bg-washi/[0.06]"
          >
            Ver las {polls.length}
          </button>
        )}
      </div>
      <ul className="space-y-2">
        {shown.map((poll) => {
          const candidates = options.filter((o) => o.poll_id === poll.id);
          return (
            <li key={poll.id} className="min-w-0">
              <Link
                to={`/deseos/votacion/${poll.id}`}
                onClick={guardNav}
                className="group flex min-h-16 min-w-0 items-center gap-3 rounded-[12px] border border-ai-400/45 bg-ai-700/25 px-3 py-2.5 transition-colors hover:border-ai-300/70 hover:bg-ai-700/40"
              >
                <span aria-hidden className="hidden -space-x-4 min-[400px]:flex">
                  {candidates.slice(0, 2).map((o) => {
                    const w = wishById.get(o.wish_id);
                    return w?.thumbnail_url ? (
                      <img
                        key={o.id}
                        src={w.thumbnail_url}
                        crossOrigin={thumbCors(w.thumbnail_url)}
                        alt=""
                        loading="lazy"
                        className="aspect-video w-12 rounded-[5px] object-cover ring-2 ring-sumi-900"
                      />
                    ) : null;
                  })}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 break-words text-[15px] font-bold leading-snug text-washi">
                    {poll.title}
                  </span>
                  <span className="block text-[12px] text-ai-200">
                    <MetaLine parts={[closingLabel(poll, now), `${candidates.length} candidatas`]} />
                  </span>
                </span>
                <span className="inline-flex h-10 shrink-0 items-center gap-1 rounded-[9px] bg-washi px-3 text-[14px] font-bold text-sumi-900">
                  Votar <ChevronRight aria-hidden className="size-4" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function WishList({
  openPolls,
  onPropose,
  onCreatePoll,
  onAllPolls,
}: {
  openPolls: Poll[];
  onPropose: () => void;
  onCreatePoll: (wishIds: string[]) => void;
  onAllPolls: () => void;
}) {
  const wishes = useWishes();
  const interest = useWishInterest();
  const polls = usePolls();
  const options = usePollOptions();
  // REQ-22 · Moves only when a vote really closes by time (the cards below are memoised).
  const now = useClosingNow(polls.data);
  const toast = useToast();
  // Past votes: only the closed polls' rows (the open ones aren't shown here).
  const closedIds = useMemo(
    () => (polls.data ?? []).filter((p) => isPollClosed(p, now)).map((p) => p.id),
    [polls.data, now],
  );
  // REQ-19 · The same download the vote list uses (every poll's ballots, once); the closed ones are picked by select.
  const allPollIds = useMemo(() => (polls.data ?? []).map((p) => p.id), [polls.data]);
  const pickClosed = useCallback(
    (all: PollVote[]) => {
      const closed = new Set(closedIds);
      return all.filter((v) => closed.has(v.poll_id));
    },
    [closedIds],
  );
  const votes = usePollVotes(allPollIds, { enabled: closedIds.length > 0, select: pickClosed });
  const members = useMembers();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  // The «Elegir para votar» bar pinned at the bottom: focus scrolled to the edge is never left under it.
  const selectBarRef = useRef<HTMLDivElement>(null);
  useStickyBarPadding(selectBarRef, selecting);

  const byWish = useMemo(() => interestByWish(interest.data ?? []), [interest.data]);
  const list = useMemo(
    () => sortByInterest(liveWishes(wishes.data ?? []), (id) => byWish.get(id)?.length ?? 0),
    [wishes.data, byWish],
  );
  const wishById = useMemo(() => new Map((wishes.data ?? []).map((w) => [w.id, w])), [wishes.data]);
  const memberById = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m])), [members.data]);
  /** Open votes each wish is in (a chip links to it). */
  const openPollOf = useMemo(() => {
    const open = new Map(openPolls.map((p) => [p.id, p]));
    const map = new Map<string, Poll>();
    for (const o of options.data ?? []) {
      const poll = open.get(o.poll_id);
      if (poll && !map.has(o.wish_id)) map.set(o.wish_id, poll);
    }
    return map;
  }, [openPolls, options.data]);
  const pastOf = useMemo(() => {
    const map = new Map<string, PastVote[]>();
    for (const w of list)
      map.set(w.id, pastVotesOf(w.id, polls.data ?? [], options.data ?? [], votes.data ?? [], now));
    return map;
  }, [list, polls.data, options.data, votes.data, now]);
  /** Votes each wish has won (it stays in the list until someone adds it to the library). */
  const wonOf = useMemo(() => {
    const map = new Map<string, Poll>();
    for (const p of polls.data ?? [])
      if (p.winner_wish_id && !map.has(p.winner_wish_id)) map.set(p.winner_wish_id, p);
    return map;
  }, [polls.data]);

  // Only what is still on the list counts: another phone may have deleted a marked wish or added it to the library.
  const pickedLive = useMemo(() => list.map((w) => w.id).filter((id) => picked.includes(id)), [list, picked]);

  const toggle = useCallback((id: string) => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }, []);
  const interestRows = interest.data ?? NO_INTEREST;

  function stopSelecting() {
    setSelecting(false);
    setPicked([]);
  }

  const openBlock =
    openPolls.length > 0 && !selecting ? (
      <OpenPolls polls={openPolls} options={options.data ?? []} wishById={wishById} onAll={onAllPolls} />
    ) : null;

  if (wishes.isPending) {
    return (
      <div className="grid gap-3 px-4 py-6 sm:px-9">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="skeleton h-[132px] rounded-[12px]" />
        ))}
      </div>
    );
  }
  if (wishes.isError && !wishes.data) {
    return (
      <div role="alert" className="px-5 py-12 text-center sm:px-9">
        <p className="font-display text-xl font-bold">No pudimos cargar la lista de deseos</p>
        <Button
          variant="secondary"
          className="mt-4"
          loading={wishes.isFetching}
          onClick={() => void wishes.refetch()}
        >
          Reintentar
        </Button>
      </div>
    );
  }
  if (list.length === 0) {
    return (
      <>
        {openBlock}
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <Seal glyph="願" size={60} stamp />
          <h2 className="mt-5 font-display text-[24px] font-bold leading-tight">Aún no hay propuestas</h2>
          <p className="mt-2 max-w-[40ch] text-washi-muted">
            Propón la primera y que cada persona diga «Me apunto».
          </p>
          <Button size="lg" className="mt-6" onClick={onPropose}>
            <Plus aria-hidden className="size-5" /> Proponer canción
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      {openBlock}
      <section aria-labelledby="wish-list-title" className="px-4 pb-7 pt-5 sm:px-9">
        <div className="mb-3 flex min-h-11 items-center gap-2">
          <h2
            id="wish-list-title"
            className="min-w-0 flex-1 font-display text-[19px] font-bold leading-tight text-washi"
          >
            {selecting ? 'Elige las candidatas' : 'Por interés'}{' '}
            {!selecting && (
              <span className="tabular text-[14px] font-normal text-washi-subtle">· {list.length}</span>
            )}
          </h2>
          {!selecting && (
            <Button
              variant="secondary"
              size="sm"
              className="min-h-11"
              onClick={() => {
                if (list.length < 2) toast('Hacen falta dos propuestas para votar.', 'info');
                else setSelecting(true);
              }}
            >
              <ListChecks aria-hidden className="size-4" /> Elegir para votar
            </Button>
          )}
        </div>
        <motion.ul initial="hidden" animate="show" className="space-y-3">
          {list.map((wish, i) => (
            <WishCard
              key={wish.id}
              wish={wish}
              index={i}
              interested={byWish.get(wish.id) ?? NONE}
              interestRows={interestRows}
              memberById={memberById}
              openPoll={openPollOf.get(wish.id) ?? null}
              won={wonOf.get(wish.id) ?? null}
              past={pastOf.get(wish.id) ?? NO_PAST}
              selecting={selecting}
              selected={picked.includes(wish.id)}
              onToggleSelect={toggle}
            />
          ))}
        </motion.ul>

        <AnimatePresence>
          {selecting && (
            <motion.div
              ref={selectBarRef}
              role="region"
              aria-label="Elegir para votar"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={snappy}
              // Phones: the right edge leaves room for the floating menu button (`--fab-clearance`, set by the shell).
              // That leaves 250 px inside at 390 px wide and 220 px at 360: «Cancelar» is a 44 px icon there (its
              // name stays for screen readers) and «Crear votación» takes the rest, wrapping onto two lines before it
              // would ever run under the floating button.
              className="paper-raised sticky bottom-[calc(env(safe-area-inset-bottom)+12px)] z-20 mt-5 min-w-0 rounded-[14px] p-2 max-lg:mr-[var(--fab-clearance,0px)]"
            >
              <p className="tabular px-1.5 pb-2 text-[14px] font-bold text-washi" aria-live="polite">
                {selectionHint(pickedLive.length)}
              </p>
              <div className="flex min-w-0 gap-2">
                <Button variant="ghost" className="max-sm:w-11 max-sm:px-0 sm:px-4" onClick={stopSelecting}>
                  <X aria-hidden className="size-4.5 shrink-0" />
                  <span className="max-sm:sr-only">Cancelar</span>
                </Button>
                <Button
                  className="min-w-0 flex-1 px-3 sm:flex-none sm:px-5"
                  disabled={pickedLive.length < 2}
                  // The choice stays until the vote exists: cancelling «Crear votación» comes back to it as it was
                  // (creating it opens the new vote's page).
                  onClick={() => onCreatePoll(pickedLive)}
                >
                  <Vote aria-hidden className="size-4 shrink-0" />
                  <span className="min-w-0 whitespace-normal text-center leading-[1.15]">Crear votación</span>
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </>
  );
}
