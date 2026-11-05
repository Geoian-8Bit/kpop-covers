import type { Poll } from '@coverscape/shared';
import { ArrowLeft, ChevronRight, Lock, Pencil, Trash2, Vote } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { guardNav, Page } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Spinner } from '@/components/ui/Spinner';
import { useIdentity, useMembers } from '@/data/members';
import {
  useClosePoll,
  useDeletePoll,
  usePollOptions,
  usePollVotes,
  useWishes,
  wishError,
} from '@/data/wishes';
import { cn } from '@/lib/cn';
import { useToast } from '@/providers/ToastProvider';
import { ActionMenu } from './ActionMenu';
import { Ballot } from './Ballot';
import { useNow } from '@/lib/useNow';
import { PollFormDialog, type PollPreset } from './PollFormDialog';
import {
  ballotOf,
  isPollClosed,
  msUntilClose,
  needsClosing,
  outcomeOf,
  pollSummary,
  tally,
  voterCount,
} from './pollRules';
import { Results, TieBlock, WinnerBlock } from './PollResults';

// REQ-27 · Split out of PollPage.tsx: one vote (ballot, results, closing, tie-break and winner).

export function PollView({ poll, polls }: { poll: Poll; polls: Poll[] }) {
  const now = useNow(15_000);
  // Re-render right when an older vote closes by time (new ones close by hand only).
  const [, setTick] = useState(0);
  useEffect(() => {
    const ms = msUntilClose(poll);
    if (ms == null || ms > 2 ** 31 - 1) return;
    const id = setTimeout(() => setTick((t) => t + 1), ms + 50);
    return () => clearTimeout(id);
  }, [poll]);
  const closed = isPollClosed(poll, Date.now());
  const options = usePollOptions();
  const votes = usePollVotes([poll.id], { live: !closed });
  const wishes = useWishes();
  const members = useMembers();
  const meId = useIdentity((s) => s.memberId);
  const close = useClosePoll();
  const remove = useDeletePoll();
  const navigate = useNavigate();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tieOpen, setTieOpen] = useState(false);

  const pollOptions = useMemo(
    () =>
      (options.data ?? [])
        .filter((o) => o.poll_id === poll.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [options.data, poll.id],
  );
  // Like close_poll on the server: the ballot of someone removed from the group no longer counts.
  const pollVotes = useMemo(() => {
    const live = members.data ? new Set(members.data.map((m) => m.id)) : null;
    return (votes.data ?? []).filter((v) => v.poll_id === poll.id && (!live || live.has(v.member_id)));
  }, [votes.data, poll.id, members.data]);
  const wishById = useMemo(() => new Map((wishes.data ?? []).map((w) => [w.id, w])), [wishes.data]);
  // A candidate whose song was deleted from the list no longer counts (the server skips it too): not offered, not counted.
  const liveOptions = useMemo(
    () => pollOptions.filter((o) => wishById.has(o.wish_id)),
    [pollOptions, wishById],
  );
  const memberById = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m])), [members.data]);
  const results = useMemo(
    () => tally(poll.vote_type, liveOptions, pollVotes),
    [poll.vote_type, liveOptions, pollVotes],
  );
  const outcome = outcomeOf(results);
  const child = polls.find((p) => p.parent_poll_id === poll.id);
  const parent = poll.parent_poll_id ? polls.find((p) => p.id === poll.parent_poll_id) : undefined;
  const loaded = !options.isPending && !votes.isPending && !wishes.isPending;

  // The tie as the server counted it (closing never trusts this phone's cached votes).
  const [serverTie, setServerTie] = useState<string[] | null>(null);
  // An older vote's time has come and nobody wrote the close: this phone asks the server to close it (a tie waits
  // for a choice). A failure is retried on the next tick (15 s) or by hand, never left spinning.
  const [autoState, setAutoState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  useEffect(() => {
    if (autoState === 'error') setAutoState('idle');
  }, [now]);
  useEffect(() => {
    if (!loaded || autoState !== 'idle' || !needsClosing(poll, Date.now())) return;
    setAutoState('running');
    close
      .mutateAsync({ pollId: poll.id, resolve: 'auto' })
      .then((r) => {
        if (r.status === 'tie') setServerTie(r.tied);
        setAutoState('done');
      })
      .catch(() => setAutoState('error'));
  }, [loaded, poll, autoState, close]);

  const winner = poll.winner_wish_id ? wishById.get(poll.winner_wish_id) : undefined;
  const winnerResult = results.find((r) => r.wishId === poll.winner_wish_id);

  /** «Cerrar votación»: the server counts; a tie opens the tie-break with the server's tied ones. */
  async function closeByHand() {
    try {
      const r = await close.mutateAsync({ pollId: poll.id, resolve: 'auto' });
      setConfirmClose(false);
      if (r.status === 'tie') {
        setServerTie(r.tied);
        setTieOpen(true);
      }
    } catch (err) {
      toast(wishError(err), 'error');
    }
  }

  /** The tie draw's pick (one of the server's tied). If the votes moved meanwhile, count again. */
  async function closeWithPick(wishId: string) {
    try {
      await close.mutateAsync({ pollId: poll.id, resolve: 'pick', winner: wishId });
      setTieOpen(false);
      setServerTie(null);
    } catch (err) {
      toast(wishError(err), 'error');
      const r = await close.mutateAsync({ pollId: poll.id, resolve: 'auto' }).catch(() => null);
      setServerTie(r?.status === 'tie' ? r.tied : null);
      if (r?.status !== 'tie') setTieOpen(false);
    }
  }

  // Closed without a winner but level (e.g. a second round that failed to be created): a second round is still possible.
  const tied =
    serverTie ?? (poll.closed_at && !poll.winner_wish_id && outcome.kind === 'tie' ? outcome.wishIds : []);
  const tiedKey = tied.join(',');
  // Stable while it's the same tie: the form must not reset itself while someone fills it in.
  const secondRound = useMemo<PollPreset>(
    () => ({
      title: `Segunda vuelta · ${poll.title.replace(/^(Segunda vuelta · )+/, '')}`.slice(0, 80),
      wishIds: tiedKey ? tiedKey.split(',') : [],
      vote_type: poll.vote_type,
      parent: { id: poll.id, closed_at: poll.closed_at, title: poll.title },
    }),
    [poll.id, poll.title, poll.vote_type, poll.closed_at, tiedKey],
  );
  const [roundOpen, setRoundOpen] = useState(false);

  return (
    <Page className="px-2.5 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-3xl rounded-[10px] sm:rounded-[12px]">
        <header className="px-4 pb-4 pt-3 sm:px-9 sm:pt-6">
          <div className="flex items-center justify-between gap-2">
            <Link
              to="/deseos?tab=votaciones"
              onClick={guardNav}
              className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-sm font-medium text-washi-muted hover:text-washi"
            >
              <ArrowLeft aria-hidden className="size-4" /> Votaciones
            </Link>
            <ActionMenu
              label="Más acciones de la votación"
              actions={[
                ...(!closed
                  ? [
                      {
                        label: 'Editar',
                        icon: <Pencil aria-hidden className="size-4" />,
                        onSelect: () => setEditing(true),
                      },
                    ]
                  : []),
                {
                  label: 'Borrar votación',
                  icon: <Trash2 aria-hidden className="size-4" />,
                  onSelect: () => setConfirmDelete(true),
                  tone: 'danger' as const,
                },
              ]}
            />
          </div>
          <h1 className="mt-1 break-words font-display text-[26px] font-bold leading-tight sm:text-[32px]">
            {poll.title}
          </h1>
          {parent && (
            <Link
              to={`/deseos/votacion/${parent.id}`}
              onClick={guardNav}
              className="mt-1 inline-flex min-h-9 items-center gap-1 text-[13px] font-medium text-kin-300 hover:underline"
            >
              Segunda vuelta de «{parent.title}»
            </Link>
          )}
        </header>

        {!loaded ? (
          <div className="sep-t grid place-items-center py-12">
            <Spinner className="size-7 text-kin-300" />
          </div>
        ) : (
          <>
            {/* ── After closing ── */}
            {closed && (
              <div className="sep-t px-4 py-6 sm:px-9">
                {poll.closed_at && winner ? (
                  <WinnerBlock poll={poll} wish={winner} result={winnerResult} />
                ) : poll.closed_at && poll.winner_wish_id && !winner ? (
                  <p className="text-sm text-washi-muted">La ganadora ya no está en la lista de deseos.</p>
                ) : tied.length > 1 && !child ? (
                  <TieBlock
                    key={tiedKey}
                    poll={poll}
                    tied={tied}
                    wishById={wishById}
                    canDraw={!poll.closed_at}
                    onDrawn={(wishId) => closeWithPick(wishId)}
                    onSecondRound={() => setRoundOpen(true)}
                  />
                ) : child ? (
                  <Link
                    to={`/deseos/votacion/${child.id}`}
                    onClick={guardNav}
                    className="flex min-h-14 items-center gap-3 rounded-[12px] border border-kin-400/50 bg-kin-400/[0.07] px-4 py-3 font-bold text-washi hover:bg-kin-400/[0.12]"
                  >
                    <Vote aria-hidden className="size-5 text-kin-300" />
                    <span className="min-w-0 flex-1">Hubo empate: segunda vuelta «{child.title}»</span>
                    <ChevronRight aria-hidden className="size-5 text-washi-subtle" />
                  </Link>
                ) : poll.closed_at ? (
                  <p className="text-sm text-washi-muted">Se cerró sin ganadora: nadie había votado.</p>
                ) : autoState === 'error' ? (
                  <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-washi-muted">
                    No se pudo cerrar la votación. Se vuelve a intentar sola en unos segundos.
                    <Button size="sm" variant="secondary" onClick={() => setAutoState('idle')}>
                      Reintentar ahora
                    </Button>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-washi-muted">
                    <Spinner className="size-4" /> Cerrando la votación…
                  </p>
                )}
              </div>
            )}

            {/* ── While open: the ballot ── */}
            {!closed && (
              <div className="sep-t">
                <Ballot
                  poll={poll}
                  options={liveOptions}
                  wishById={wishById}
                  saved={ballotOf(pollVotes, meId)}
                />
              </div>
            )}

            {/* ── 37 · How this vote works: secondary, so after the ballot and in one compact line ── */}
            <p className="px-4 pb-4 text-[13px] leading-relaxed text-washi-subtle sm:px-9">
              {/* A paragraph can't carry a name: the reader hears this lead-in instead. */}
              <span className="sr-only">Cómo es esta votación: </span>
              {pollSummary(poll, now).map((part, i) => (
                <span
                  key={part}
                  className={cn(i === 0 && !closed && poll.closes_at && 'font-bold text-ai-200')}
                >
                  {i > 0 && <span aria-hidden> · </span>}
                  {part}
                </span>
              ))}
            </p>

            {/* ── Results ── */}
            <section aria-labelledby="results-title" className="sep-t px-4 py-6 sm:px-9">
              <SectionTitle
                id="results-title"
                glyph="票"
                className="mb-4"
                aside={
                  <span className="tabular text-[13px] text-washi-subtle">
                    {voterCount(pollVotes) === 1
                      ? '1 persona ha votado'
                      : `${voterCount(pollVotes)} personas han votado`}
                  </span>
                }
              >
                Resultados
              </SectionTitle>
              <Results
                poll={poll}
                results={results}
                wishById={wishById}
                memberById={memberById}
                highlight={poll.winner_wish_id}
              />
            </section>

            {!closed && (
              <div className="sep-t flex justify-end px-4 py-4 sm:px-9">
                <Button variant="secondary" onClick={() => setConfirmClose(true)}>
                  <Lock aria-hidden className="size-4" /> Cerrar votación
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Close by hand: winner (or nobody) */}
      <Dialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        busy={close.isPending}
        size="sm"
        hideClose
        title="¿Cerrar la votación?"
        description="Se cuentan los votos que haya en ese momento y se ve la ganadora. Ya no se podrá votar."
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setConfirmClose(false)} disabled={close.isPending}>
            Cancelar
          </Button>
          <Button loading={close.isPending} onClick={() => void closeByHand()}>
            Cerrar
          </Button>
        </div>
      </Dialog>

      {/* Close by hand with a tie: decide how before closing */}
      <Dialog
        open={tieOpen}
        onClose={() => setTieOpen(false)}
        busy={close.isPending}
        title="Hay empate"
        description="Antes de cerrar, decidid cómo desempatar."
      >
        {tieOpen && tied.length > 1 && (
          <TieBlock
            key={tiedKey}
            poll={poll}
            tied={tied}
            wishById={wishById}
            canDraw
            onDrawn={(wishId) => closeWithPick(wishId)}
            onSecondRound={() => {
              setTieOpen(false);
              setRoundOpen(true);
            }}
          />
        )}
      </Dialog>

      <PollFormDialog open={roundOpen} onClose={() => setRoundOpen(false)} preset={secondRound} />
      <PollFormDialog open={editing} onClose={() => setEditing(false)} poll={poll} />

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        busy={remove.isPending}
        size="sm"
        hideClose
        title="¿Borrar la votación?"
        description="Desaparece para todo el grupo, con sus votos. Las canciones siguen en la lista de deseos."
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={remove.isPending}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() =>
              remove.mutate(poll, {
                onSuccess: () => {
                  toast('Votación borrada', 'success');
                  navigate('/deseos?tab=votaciones', { replace: true });
                },
                onError: (err) => toast(wishError(err), 'error'),
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
