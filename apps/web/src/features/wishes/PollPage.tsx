import type { Member, Poll, Wish } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ChevronRight, Dices, Film, Library, Lock, Pencil, RotateCcw, Trash2, Vote } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { guardNav, Page } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Spinner } from '@/components/ui/Spinner';
import { useIdentity, useMembers } from '@/data/members';
import {
  NEXT_COREO_BAG,
  useAddToNextCoreo,
  useAddWishToLibrary,
  useClosePoll,
  useDeletePoll,
  usePollOptions,
  usePolls,
  usePollVotes,
  useWishes,
  wishError,
} from '@/data/wishes';
import { BagIcon } from '@/features/bags/BagIcon';
import { useDesignVariant } from '@/features/lab/designLab';
import { MemberSeal } from '@/features/members/MembersUI';
import { cn } from '@/lib/cn';
import { fadeUpCapped, jelly, soft } from '@/lib/motion';
import { useCrew } from '@/providers/CrewProvider';
import { useToast } from '@/providers/ToastProvider';
import { ActionMenu } from './ActionMenu';
import { Ballot } from './Ballot';
import { useNow } from './identity';
import { PollFormDialog, type PollPreset } from './PollFormDialog';
import {
  ballotOf,
  closingLabel,
  drawAmongTied,
  isPollClosed,
  msUntilClose,
  needsClosing,
  outcomeOf,
  resultsVisible,
  scoreLabel,
  tally,
  voterCount,
  VOTE_TYPE_COPY,
  type OptionResult,
} from './pollRules';
import { TieDraw } from './TieDraw';
import { VoteReveal } from './VoteReveal';

const rowIn = fadeUpCapped(0.05, 8);

/** F11 · /deseos/votacion/:pollId: vote, results, closing, tie-break and the winner. */
export function PollPage() {
  const { pollId } = useParams();
  const polls = usePolls();
  const poll = polls.data?.find((p) => p.id === pollId);

  if (polls.isPending) {
    return (
      <Page className="grid min-h-[60dvh] place-items-center">
        <Spinner className="size-8 text-kin-300" />
      </Page>
    );
  }
  if (!poll) {
    return (
      <Page className="px-2.5 py-3 sm:px-5 sm:py-5">
        <div className="paper mx-auto max-w-3xl rounded-[12px] px-6 py-14 text-center">
          <p className="font-display text-xl font-bold">
            {polls.isError ? 'No pudimos cargar la votación' : 'Esta votación ya no existe'}
          </p>
          <Link
            to="/deseos?tab=votaciones"
            onClick={guardNav}
            className="mt-5 inline-flex min-h-11 items-center gap-2 font-bold text-kin-300 hover:underline"
          >
            <ArrowLeft aria-hidden className="size-4" /> Volver a las votaciones
          </Link>
        </div>
      </Page>
    );
  }
  return <PollView key={poll.id} poll={poll} polls={polls.data ?? []} />;
}

function PollView({ poll, polls }: { poll: Poll; polls: Poll[] }) {
  const now = useNow(15_000);
  // Re-render right when it closes by time.
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
  const liveOptions = useMemo(() => pollOptions.filter((o) => wishById.has(o.wish_id)), [pollOptions, wishById]);
  const memberById = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m])), [members.data]);
  const results = useMemo(() => tally(poll.vote_type, liveOptions, pollVotes), [poll.vote_type, liveOptions, pollVotes]);
  const outcome = outcomeOf(results);
  const child = polls.find((p) => p.parent_poll_id === poll.id);
  const parent = poll.parent_poll_id ? polls.find((p) => p.id === poll.parent_poll_id) : undefined;
  const loaded = !options.isPending && !votes.isPending && !wishes.isPending;

  // The tie as the server counted it (closing never trusts this phone's cached votes).
  const [serverTie, setServerTie] = useState<string[] | null>(null);
  // Its time has come and nobody wrote the close: this phone asks the server to close it (a tie waits for a
  // choice). A failure is retried on the next tick (15 s) or by hand, never left spinning.
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

  const visible = resultsVisible(poll, Date.now());
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
  const tied = serverTie ?? (poll.closed_at && !poll.winner_wish_id && outcome.kind === 'tie' ? outcome.wishIds : []);
  const tiedKey = tied.join(',');
  // Stable while it's the same tie: the form must not reset itself while someone fills it in.
  const secondRound = useMemo<PollPreset>(
    () => ({
      title: `Segunda vuelta · ${poll.title.replace(/^(Segunda vuelta · )+/, '')}`.slice(0, 80),
      wishIds: tiedKey ? tiedKey.split(',') : [],
      vote_type: poll.vote_type,
      results_live: poll.results_live,
      anonymous: poll.anonymous,
      parent: { id: poll.id, closed_at: poll.closed_at, title: poll.title },
    }),
    [poll.id, poll.title, poll.vote_type, poll.results_live, poll.anonymous, poll.closed_at, tiedKey],
  );
  const [roundOpen, setRoundOpen] = useState(false);

  return (
    <Page className="px-2.5 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-3xl rounded-[10px] sm:rounded-[12px]">
        <header className="px-4 pb-5 pt-4 sm:px-9 sm:pt-6">
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
                  ? [{ label: 'Editar', icon: <Pencil aria-hidden className="size-4" />, onSelect: () => setEditing(true) }]
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
          <h1 className="mt-2 font-display text-[26px] font-bold leading-tight sm:text-[32px]">{poll.title}</h1>
          {parent && (
            <Link
              to={`/deseos/votacion/${parent.id}`}
              onClick={guardNav}
              className="mt-1 inline-flex min-h-9 items-center gap-1 text-[13px] font-medium text-kin-300 hover:underline"
            >
              Segunda vuelta de «{parent.title}»
            </Link>
          )}
          <ul className="mt-3 flex flex-wrap gap-1.5 text-[12px]" aria-label="Cómo es esta votación">
            {[
              VOTE_TYPE_COPY[poll.vote_type].label,
              poll.results_live ? 'Resultados en directo' : 'Resultados al cerrar',
              poll.anonymous ? 'Anónima' : 'Con nombre',
            ].map((chip) => (
              <li key={chip} className="rounded-full border border-line px-2.5 py-1 text-washi-muted">
                {chip}
              </li>
            ))}
            <li
              className={cn(
                'rounded-full px-2.5 py-1 font-bold',
                closed ? 'bg-sumi-700 text-washi-muted' : 'bg-ai-700/70 text-ai-200',
              )}
            >
              {closed && !poll.closed_at ? 'Plazo terminado' : closingLabel(poll, now)}
            </li>
          </ul>
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
                <Ballot poll={poll} options={liveOptions} wishById={wishById} saved={ballotOf(pollVotes, meId)} />
              </div>
            )}

            {/* ── Results ── */}
            <section aria-labelledby="results-title" className="sep-t px-4 py-6 sm:px-9">
              <SectionTitle
                id="results-title"
                glyph="票"
                className="mb-4"
                aside={
                  <span className="tabular text-[13px] text-washi-subtle">
                    {voterCount(pollVotes) === 1 ? '1 persona ha votado' : `${voterCount(pollVotes)} personas han votado`}
                  </span>
                }
              >
                Resultados
              </SectionTitle>
              {visible ? (
                <Results
                  poll={poll}
                  results={results}
                  wishById={wishById}
                  memberById={memberById}
                  highlight={poll.winner_wish_id}
                />
              ) : (
                <p className="flex items-center gap-2 rounded-[12px] border border-line px-4 py-4 text-sm text-washi-muted">
                  <Lock aria-hidden className="size-4 shrink-0 text-washi-subtle" />
                  Los resultados se verán al cerrar la votación.
                </p>
              )}
            </section>

            {!closed && (
              <div className="sep-t flex flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-9">
                <p className="text-[13px] text-washi-subtle">
                  {poll.closes_at ? 'Se cierra sola a su hora, o antes a mano.' : 'Se cierra a mano.'}
                </p>
                <Button
                  variant="secondary"
                  onClick={() => setConfirmClose(true)}
                >
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
      <PollFormDialog open={editing} onClose={() => setEditing(false)} poll={poll} hasVotes={pollVotes.length > 0} />

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

function Results({
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
                <img src={wish.thumbnail_url} alt="" loading="lazy" className="aspect-video w-14 shrink-0 rounded-[5px] object-cover" />
              )}
              <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-washi">
                {wish?.title ?? 'Ya no está en la lista'}
              </span>
              <span className={cn('tabular shrink-0 text-[14px] font-bold', top ? 'text-kin-300' : 'text-washi')}>
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
            {!poll.anonymous && voters.length > 0 && (
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
function TieBlock({
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
      {resultsVisible(poll) ? (
        <p className="text-sm text-washi-muted">
          Empate entre <span className="font-bold text-washi">{names.map((n) => `«${n}»`).join(' y ')}</span> en «
          {poll.title}».
        </p>
      ) : (
        // Results «al cerrar»: the tied ones stay secret until it is decided how to break the tie.
        <p className="text-sm text-washi-muted">Hay empate. Decidid cómo desempatar: los resultados se verán al cerrar.</p>
      )}
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

/** The winner: the reveal (lab design), «Añadir a la biblioteca» and the bag «Próxima coreo». */
function WinnerBlock({ poll, wish, result }: { poll: Poll; wish: Wish; result: OptionResult | undefined }) {
  const variant = useDesignVariant('vote-reveal');
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
        variant={variant}
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
                      toast(r.existed ? 'Ya estaba en la biblioteca' : `«${wish.title}» añadida a la biblioteca`, 'success'),
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
                    toast(r.already ? `Ya estaba en «${NEXT_COREO_BAG}»` : `Metida en la bolsa «${NEXT_COREO_BAG}»`, 'success'),
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

