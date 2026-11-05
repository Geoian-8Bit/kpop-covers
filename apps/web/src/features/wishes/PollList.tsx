import { motion } from 'motion/react';
import { ChevronRight, Vote } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { guardNav } from '@/components/AppShell';
import { Seal } from '@/components/Seal';
import { Button } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { usePollOptions, usePolls, usePollVotes, useWishes } from '@/data/wishes';
import { thumbCors } from '@/lib/thumbCors';
import { useNow } from '@/lib/useNow';
import { closingLabel, isPollClosed, VOTE_TYPE_COPY } from './pollRules';
import { cardIn } from './WishCard';

// REQ-27 · Split out of WishesPage.tsx: the «Votaciones» tab.

// ───────────────────────── Votaciones ─────────────────────────

export function PollList({ onCreate }: { onCreate: () => void }) {
  const polls = usePolls();
  const options = usePollOptions();
  // Once, for the «N personas han votado» of each card (no polling here).
  const pollIds = useMemo(() => (polls.data ?? []).map((p) => p.id), [polls.data]);
  const votes = usePollVotes(pollIds, { enabled: pollIds.length > 0 });
  const wishes = useWishes();
  const now = useNow();
  const wishById = useMemo(() => new Map((wishes.data ?? []).map((w) => [w.id, w])), [wishes.data]);

  if (polls.isPending) {
    return (
      <div className="grid gap-3 px-5 py-7 sm:px-9">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="skeleton h-[96px] rounded-[12px]" />
        ))}
      </div>
    );
  }
  if (polls.isError && !polls.data) {
    return (
      <div role="alert" className="px-5 py-12 text-center sm:px-9">
        <p className="font-display text-xl font-bold">No pudimos cargar las votaciones</p>
        <Button
          variant="secondary"
          className="mt-4"
          loading={polls.isFetching}
          onClick={() => void polls.refetch()}
        >
          Reintentar
        </Button>
      </div>
    );
  }
  const list = polls.data ?? [];
  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <Seal glyph="票" size={60} stamp />
        <h2 className="mt-5 font-display text-[24px] font-bold leading-tight">Aún no hay votaciones</h2>
        <p className="mt-2 max-w-[40ch] text-washi-muted">
          Elige dos o más canciones de la lista y que vote el grupo.
        </p>
        <Button size="lg" className="mt-6" onClick={onCreate}>
          <Vote aria-hidden className="size-5" /> Crear la primera
        </Button>
      </div>
    );
  }
  const open = list.filter((p) => !isPollClosed(p, now));
  const closed = list.filter((p) => isPollClosed(p, now));

  return (
    <>
      <div className="flex justify-end px-4 pt-4 sm:px-9">
        <Button onClick={onCreate}>
          <Vote aria-hidden className="size-4.5" /> Nueva votación
        </Button>
      </div>
      {[
        { id: 'open', title: 'Abiertas', glyph: '票', items: open },
        { id: 'closed', title: 'Cerradas', glyph: '決', items: closed },
      ].map((group) =>
        group.items.length === 0 ? null : (
          <section key={group.id} aria-labelledby={`polls-${group.id}`} className="px-4 pb-6 pt-3 sm:px-9">
            <SectionTitle id={`polls-${group.id}`} glyph={group.glyph} className="mb-4">
              {group.title}
            </SectionTitle>
            <motion.ul initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2">
              {group.items.map((poll, i) => {
                const pollOptions = (options.data ?? []).filter((o) => o.poll_id === poll.id);
                const voters = new Set(
                  (votes.data ?? []).filter((v) => v.poll_id === poll.id).map((v) => v.member_id),
                ).size;
                const winner = poll.winner_wish_id ? wishById.get(poll.winner_wish_id) : null;
                return (
                  <motion.li key={poll.id} variants={cardIn} custom={i} className="min-w-0">
                    <Link
                      to={`/deseos/votacion/${poll.id}`}
                      onClick={guardNav}
                      className="group flex min-h-[96px] items-center gap-3 rounded-[12px] border border-line bg-sumi-900/60 px-4 py-3 transition-colors hover:border-line-strong hover:bg-washi/[0.04]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[18px] font-bold text-washi">
                          {poll.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[13px] text-washi-muted">
                          {VOTE_TYPE_COPY[poll.vote_type].label} · {pollOptions.length} candidatas ·{' '}
                          {voters === 1 ? '1 persona ha votado' : `${voters} personas han votado`}
                        </span>
                        <span className="mt-1 block truncate text-[12px] font-bold text-kin-300">
                          {winner ? `Ganadora: ${winner.title}` : closingLabel(poll, now)}
                        </span>
                      </span>
                      <span aria-hidden className="hidden -space-x-4 min-[420px]:flex">
                        {pollOptions.slice(0, 3).map((o) => {
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
                      <ChevronRight
                        aria-hidden
                        className="size-5 shrink-0 text-washi-subtle transition-transform group-hover:translate-x-0.5"
                      />
                    </Link>
                  </motion.li>
                );
              })}
            </motion.ul>
          </section>
        ),
      )}
    </>
  );
}
