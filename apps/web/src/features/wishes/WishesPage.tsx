import type { Member, Poll, Wish, WishInterest } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronRight, Library, ListChecks, Pencil, Plus, Trash2, Vote, X } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { guardNav, Page } from '@/components/AppShell';
import { Seal } from '@/components/Seal';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { useIdentity, useMembers } from '@/data/members';
import {
  useAddWishToLibrary,
  useDeleteWish,
  usePollOptions,
  usePolls,
  usePollVotes,
  useToggleInterest,
  useWishes,
  useWishInterest,
  wishError,
} from '@/data/wishes';
import { BagIcon } from '@/features/bags/BagIcon';
import { MemberSeal } from '@/features/members/MembersUI';
import { cn } from '@/lib/cn';
import { fadeUpCapped, jelly, snappy } from '@/lib/motion';
import { useCrew } from '@/providers/CrewProvider';
import { useToast } from '@/providers/ToastProvider';
import { ActionMenu } from './ActionMenu';
import { useNow, withMe } from './identity';
import { PollFormDialog, type PollPreset } from './PollFormDialog';
import { closingLabel, isPollClosed, pastVotesOf, scoreLabel, VOTE_TYPE_COPY, type PastVote } from './pollRules';
import { WishFormDialog } from './WishFormDialog';
import { DIFFICULTY_COPY, interestByWish, liveWishes, membersLabel, sortByInterest } from './wishRules';

type Tab = 'deseos' | 'votaciones';
const cardIn = fadeUpCapped(0.05, 8);
// The bags' own dialog (F13), loaded only when someone opens it.
const AddToBagDialog = lazy(() => import('@/features/bags/AddToBagDialog').then((m) => ({ default: m.AddToBagDialog })));

/** F12 + F11 · /deseos: «Próxima cover», with the wish list and the votes. */
export function WishesPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'votaciones' ? 'votaciones' : 'deseos';
  const [proposing, setProposing] = useState(false);
  const [pollPreset, setPollPreset] = useState<PollPreset | null>(null);
  const [pollOpen, setPollOpen] = useState(false);

  function openPoll(preset: PollPreset | null) {
    setPollPreset(preset);
    setPollOpen(true);
  }

  return (
    <Page className="px-2.5 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-4xl rounded-[10px] sm:rounded-[12px]">
        <header className="flex flex-wrap items-end justify-between gap-4 px-5 pb-5 pt-6 sm:px-9 sm:pt-8">
          <div className="min-w-0">
            <h1 className="font-display text-[28px] font-bold leading-tight sm:text-[34px]">Próxima cover</h1>
            <p className="mt-1 max-w-prose text-sm text-washi-subtle">
              Las canciones que nos gustaría hacer y las votaciones para elegir la siguiente.
            </p>
          </div>
          {tab === 'deseos' ? (
            <Button onClick={() => setProposing(true)}>
              <Plus aria-hidden className="size-4.5" /> Proponer canción
            </Button>
          ) : (
            <Button onClick={() => openPoll(null)}>
              <Vote aria-hidden className="size-4.5" /> Nueva votación
            </Button>
          )}
        </header>

        <Tabs
          value={tab}
          onChange={(next) => setParams(next === 'deseos' ? {} : { tab: next }, { replace: true })}
        />

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'deseos' ? (
            <WishList onPropose={() => setProposing(true)} onCreatePoll={(wishIds) => openPoll({ wishIds })} />
          ) : (
            <PollList onCreate={() => openPoll(null)} />
          )}
        </div>
      </div>
      <WishFormDialog open={proposing} onClose={() => setProposing(false)} />
      <PollFormDialog open={pollOpen} onClose={() => setPollOpen(false)} preset={pollPreset} />
    </Page>
  );
}

function Tabs({ value, onChange }: { value: Tab; onChange: (tab: Tab) => void }) {
  const tabs: { id: Tab; label: string; glyph: string }[] = [
    { id: 'deseos', label: 'Lista de deseos', glyph: '願' },
    { id: 'votaciones', label: 'Votaciones', glyph: '票' },
  ];
  return (
    <div
      role="tablist"
      aria-label="Próxima cover"
      className="sep-t flex gap-1 px-3 pt-3 sm:px-7"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const next = value === 'deseos' ? 'votaciones' : 'deseos';
        onChange(next);
        requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus());
      }}
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <motion.button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`panel-${t.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            whileTap={{ scale: 0.94 }}
            transition={jelly}
            className={cn(
              'relative flex h-12 items-center gap-2 rounded-t-[10px] px-4 text-[15px] font-bold transition-colors',
              active ? 'text-washi' : 'text-washi-subtle hover:text-washi-muted',
            )}
          >
            <span aria-hidden className={cn('font-display text-[15px]', active ? 'text-shu-400' : 'text-washi-subtle')}>
              {t.glyph}
            </span>
            {t.label}
            {active && (
              <motion.span
                layoutId="wishes-tab"
                transition={jelly}
                className="absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-shu-500"
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

// ───────────────────────── Lista de deseos ─────────────────────────

function WishList({ onPropose, onCreatePoll }: { onPropose: () => void; onCreatePoll: (wishIds: string[]) => void }) {
  const wishes = useWishes();
  const interest = useWishInterest();
  const polls = usePolls();
  const options = usePollOptions();
  const now = useNow();
  // Past votes: only the closed polls' rows (the open ones aren't shown here).
  const closedIds = useMemo(
    () => (polls.data ?? []).filter((p) => isPollClosed(p, now)).map((p) => p.id),
    [polls.data, now],
  );
  const votes = usePollVotes(closedIds, { enabled: closedIds.length > 0 });
  const members = useMembers();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const byWish = useMemo(() => interestByWish(interest.data ?? []), [interest.data]);
  const list = useMemo(
    () => sortByInterest(liveWishes(wishes.data ?? []), (id) => byWish.get(id)?.length ?? 0),
    [wishes.data, byWish],
  );
  const memberById = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m])), [members.data]);
  /** Open votes each wish is in (a chip links to it). */
  const openPollOf = useMemo(() => {
    const open = new Map((polls.data ?? []).filter((p) => !isPollClosed(p, now)).map((p) => [p.id, p]));
    const map = new Map<string, Poll>();
    for (const o of options.data ?? []) {
      const poll = open.get(o.poll_id);
      if (poll && !map.has(o.wish_id)) map.set(o.wish_id, poll);
    }
    return map;
  }, [polls.data, options.data, now]);
  const pastOf = useMemo(() => {
    const map = new Map<string, PastVote[]>();
    for (const w of list) map.set(w.id, pastVotesOf(w.id, polls.data ?? [], options.data ?? [], votes.data ?? [], now));
    return map;
  }, [list, polls.data, options.data, votes.data, now]);
  /** Votes each wish has won (it stays in the list until someone adds it to the library). */
  const wonOf = useMemo(() => {
    const map = new Map<string, Poll>();
    for (const p of polls.data ?? []) if (p.winner_wish_id && !map.has(p.winner_wish_id)) map.set(p.winner_wish_id, p);
    return map;
  }, [polls.data]);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  if (wishes.isPending) {
    return (
      <div className="grid gap-3 px-5 py-7 sm:px-9">
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
        <Button variant="secondary" className="mt-4" loading={wishes.isFetching} onClick={() => void wishes.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <Seal glyph="願" size={68} stamp />
        <h2 className="mt-6 font-display text-[26px] font-bold leading-tight">La lista de deseos está vacía</h2>
        <p className="mt-3 max-w-[46ch] text-washi-muted">
          Pega el enlace de YouTube de una canción que os gustaría bailar. Luego cada persona dice «Me apunto» y la
          lista se ordena sola.
        </p>
        <Button size="lg" className="mt-7" onClick={onPropose}>
          <Plus aria-hidden className="size-5" /> Proponer la primera
        </Button>
      </div>
    );
  }

  return (
    <section aria-labelledby="wish-list-title" className="px-4 pb-7 pt-5 sm:px-9">
      <SectionTitle
        id="wish-list-title"
        glyph="願"
        className="mb-4"
        aside={<span className="tabular text-[13px] text-washi-subtle">{list.length}</span>}
      >
        Por interés
      </SectionTitle>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {selecting ? (
          <p className="text-[13px] text-washi-muted" aria-live="polite">
            Marca las candidatas ({picked.length} elegidas).
          </p>
        ) : (
          <Button variant="secondary" size="sm" className="min-h-11" onClick={() => setSelecting(true)} disabled={list.length < 2}>
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
            interested={byWish.get(wish.id) ?? []}
            interestRows={interest.data ?? []}
            memberById={memberById}
            openPoll={openPollOf.get(wish.id) ?? null}
            won={wonOf.get(wish.id) ?? null}
            past={pastOf.get(wish.id) ?? []}
            selecting={selecting}
            selected={picked.includes(wish.id)}
            onToggleSelect={() => toggle(wish.id)}
          />
        ))}
      </motion.ul>

      <AnimatePresence>
        {selecting && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={snappy}
            className="paper-raised sticky bottom-3 z-20 mt-5 flex flex-wrap items-center justify-between gap-2 rounded-[14px] px-3 py-2.5"
          >
            <span className="tabular px-1 text-sm text-washi-muted">
              {picked.length < 2 ? 'Elige al menos 2' : `${picked.length} candidatas`}
            </span>
            <span className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setSelecting(false);
                  setPicked([]);
                }}
              >
                <X aria-hidden className="size-4" /> Cancelar
              </Button>
              <Button
                disabled={picked.length < 2}
                onClick={() => {
                  onCreatePoll(list.map((w) => w.id).filter((id) => picked.includes(id)));
                  setSelecting(false);
                  setPicked([]);
                }}
              >
                <Vote aria-hidden className="size-4" /> Crear votación
              </Button>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function WishCard({
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
  onToggleSelect: () => void;
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
  const mine = meId ? interestRows.find((r) => r.wish_id === wish.id && r.member_id === meId) ?? null : null;
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
        result.existed ? `«${wish.title}» ya estaba en la biblioteca: sale de la lista` : `«${wish.title}» añadida a la biblioteca`,
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

  return (
    <motion.li variants={cardIn} custom={index} layout transition={snappy}>
      <article
        aria-label={wish.title}
        className={cn(
          'relative rounded-[12px] border bg-sumi-900/60 p-3 transition-colors sm:p-4',
          selected ? 'border-kin-400/70 bg-kin-400/[0.06]' : 'border-line',
        )}
      >
        <div className="flex gap-3">
          {selecting && (
            <motion.button
              type="button"
              role="checkbox"
              aria-checked={selected}
              aria-label={`Elegir «${wish.title}» para la votación`}
              onClick={onToggleSelect}
              whileTap={{ scale: 0.85 }}
              transition={jelly}
              className="-ml-1 grid size-11 shrink-0 place-items-center"
            >
              <span
                className={cn(
                  'grid size-6 place-items-center rounded-[6px] border transition-colors',
                  selected ? 'border-kin-300 bg-kin-300 text-sumi-900' : 'border-line-strong',
                )}
              >
                {selected && <Check aria-hidden className="size-4" strokeWidth={3} />}
              </span>
            </motion.button>
          )}
          <a
            href={`https://www.youtube.com/watch?v=${wish.youtube_id}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`Ver «${wish.title}» en YouTube (se abre aparte)`}
            className="relative aspect-video w-24 shrink-0 self-start overflow-hidden rounded-[8px] bg-sumi-950 sm:w-32"
          >
            {wish.thumbnail_url && (
              <img src={wish.thumbnail_url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
            )}
          </a>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 font-display text-[17px] font-bold leading-snug text-washi">{wish.title}</h3>
            {details.length > 0 && (
              <p className="mt-0.5 truncate text-[13px] text-washi-muted">{details.join(' · ')}</p>
            )}
            {wish.comment && <p className="mt-1 line-clamp-2 text-[13px] italic text-washi-subtle">«{wish.comment}»</p>}
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
                { label: 'Editar', icon: <Pencil aria-hidden className="size-4" />, onSelect: () => setEditing(true) },
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

        {(openPoll || won || past.length > 0 || proposer) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-washi-subtle">
            {openPoll && (
              <Link
                to={`/deseos/votacion/${openPoll.id}`}
                onClick={guardNav}
                className="inline-flex min-h-8 items-center gap-1 rounded-full bg-ai-700/60 px-2.5 font-bold text-ai-200 hover:bg-ai-600/60"
              >
                <Vote aria-hidden className="size-3.5" /> En votación: {openPoll.title}
              </Link>
            )}
            {won && (
              <Link
                to={`/deseos/votacion/${won.id}`}
                onClick={guardNav}
                className="inline-flex min-h-8 items-center gap-1 rounded-full bg-kin-400/15 px-2.5 font-bold text-kin-200 hover:bg-kin-400/25"
              >
                Ganó «{won.title}»
              </Link>
            )}
            {past.slice(0, 2).map((p) => (
              <Link
                key={p.pollId}
                to={`/deseos/votacion/${p.pollId}`}
                onClick={guardNav}
                className="inline-flex min-h-8 items-center gap-1 rounded-full border border-line px-2.5 hover:border-line-strong hover:text-washi-muted"
                title="Sus votos en una votación anterior"
              >
                <span className="tabular font-bold text-kin-300">{scoreLabel(p.type, p.score)}</span> en «{p.title}»
              </Link>
            ))}
            {proposer && <span>Propuesta por {proposer.name}</span>}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <motion.button
            type="button"
            aria-pressed={Boolean(mine)}
            onClick={onInterest}
            whileTap={{ scale: 0.9 }}
            transition={jelly}
            className={cn(
              'inline-flex h-11 items-center gap-2 rounded-[10px] border px-4 text-[14px] font-bold transition-colors',
              mine
                ? 'border-kin-300 bg-kin-300 text-sumi-900'
                : 'border-line-strong text-washi hover:border-washi/40 hover:bg-washi/[0.05]',
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
            <span className={cn('tabular rounded-full px-1.5 text-[12px]', mine ? 'bg-sumi-900/15' : 'bg-washi/10')}>
              {interested.length}
            </span>
          </motion.button>
          {shown.length > 0 && (
            <span className="flex min-w-0 items-center gap-1.5" aria-label={`Se apuntan: ${shown.map((m) => m.name).join(', ')}`}>
              <span className="flex -space-x-1.5">
                {shown.slice(0, 6).map((m) => (
                  <span key={m.id} title={m.name} className="rounded-[8px] ring-2 ring-sumi-900">
                    <MemberSeal member={m} size="sm" />
                  </span>
                ))}
              </span>
              {shown.length > 6 && <span className="tabular text-[12px] text-washi-subtle">+{shown.length - 6}</span>}
            </span>
          )}
        </div>
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
                Está en la votación «{openPoll.title}», que sigue abierta: si la borras, deja de ser candidata y sus
                votos ya no cuentan.
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
}

// ───────────────────────── Votaciones ─────────────────────────

function PollList({ onCreate }: { onCreate: () => void }) {
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
        <Button variant="secondary" className="mt-4" loading={polls.isFetching} onClick={() => void polls.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }
  const list = polls.data ?? [];
  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <Seal glyph="票" size={68} stamp />
        <h2 className="mt-6 font-display text-[26px] font-bold leading-tight">Aún no hay votaciones</h2>
        <p className="mt-3 max-w-[46ch] text-washi-muted">
          Elige candidatas de la lista de deseos, pon fecha de cierre y que vote el grupo.
        </p>
        <Button size="lg" className="mt-7" onClick={onCreate}>
          <Vote aria-hidden className="size-5" /> Crear la primera
        </Button>
      </div>
    );
  }
  const open = list.filter((p) => !isPollClosed(p, now));
  const closed = list.filter((p) => isPollClosed(p, now));

  return (
    <>
      {[
        { id: 'open', title: 'Abiertas', glyph: '票', items: open },
        { id: 'closed', title: 'Cerradas', glyph: '決', items: closed },
      ].map((group) =>
        group.items.length === 0 ? null : (
          <section key={group.id} aria-labelledby={`polls-${group.id}`} className="px-4 pb-6 pt-5 sm:px-9">
            <SectionTitle id={`polls-${group.id}`} glyph={group.glyph} className="mb-4">
              {group.title}
            </SectionTitle>
            <motion.ul initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2">
              {group.items.map((poll, i) => {
                const pollOptions = (options.data ?? []).filter((o) => o.poll_id === poll.id);
                const voters = new Set((votes.data ?? []).filter((v) => v.poll_id === poll.id).map((v) => v.member_id)).size;
                const winner = poll.winner_wish_id ? wishById.get(poll.winner_wish_id) : null;
                return (
                  <motion.li key={poll.id} variants={cardIn} custom={i} className="min-w-0">
                    <Link
                      to={`/deseos/votacion/${poll.id}`}
                      onClick={guardNav}
                      className="group flex min-h-[96px] items-center gap-3 rounded-[12px] border border-line bg-sumi-900/60 px-4 py-3 transition-colors hover:border-line-strong hover:bg-washi/[0.04]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[18px] font-bold text-washi">{poll.title}</span>
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
                              alt=""
                              loading="lazy"
                              className="aspect-video w-12 rounded-[5px] object-cover ring-2 ring-sumi-900"
                            />
                          ) : null;
                        })}
                      </span>
                      <ChevronRight aria-hidden className="size-5 shrink-0 text-washi-subtle transition-transform group-hover:translate-x-0.5" />
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
