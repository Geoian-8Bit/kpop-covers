import type { Member, Poll, PollOption, Wish, WishInterest } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronRight, Library, ListChecks, Pencil, Plus, Search, Trash2, Vote, X } from 'lucide-react';
import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { guardNav, Page } from '@/components/AppShell';
import { Seal } from '@/components/Seal';
import { useStickyBarPadding } from '@/components/stickyBarPadding';
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
import { DIFFICULTY_COPY, interestByWish, liveWishes, membersLabel, selectionHint, sortByInterest } from './wishRules';

type Tab = 'deseos' | 'votaciones';
const cardIn = fadeUpCapped(0.05, 8);
// The bags' own dialog (F13), loaded only when someone opens it.
const AddToBagDialog = lazy(() => import('@/features/bags/AddToBagDialog').then((m) => ({ default: m.AddToBagDialog })));

/**
 * F12 + F11 · /deseos: «Próxima cover». Phone first (37): «Proponer» (search YouTube) on top, the open votes
 * right under it, then the wish list by interest with «Me apunto» on every card; the votes' history in its tab.
 */
export function WishesPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'votaciones' ? 'votaciones' : 'deseos';
  const [proposing, setProposing] = useState(false);
  const [pollPreset, setPollPreset] = useState<PollPreset | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const polls = usePolls();
  const now = useNow();
  const openPolls = useMemo(() => (polls.data ?? []).filter((p) => !isPollClosed(p, now)), [polls.data, now]);

  function openPoll(preset: PollPreset | null) {
    setPollPreset(preset);
    setPollOpen(true);
  }

  return (
    <Page className="px-2.5 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-4xl rounded-[10px] sm:rounded-[12px]">
        <header className="px-4 pb-4 pt-5 sm:px-9 sm:pt-8">
          <h1 className="font-display text-[28px] font-bold leading-tight sm:text-[34px]">Próxima cover</h1>
          <ProposeBar onClick={() => setProposing(true)} />
        </header>

        <Tabs
          value={tab}
          openCount={openPolls.length}
          onChange={(next) => setParams(next === 'deseos' ? {} : { tab: next }, { replace: true })}
        />

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'deseos' ? (
            <WishList
              openPolls={openPolls}
              onPropose={() => setProposing(true)}
              onCreatePoll={(wishIds) => openPoll({ wishIds })}
              onAllPolls={() => setParams({ tab: 'votaciones' }, { replace: true })}
            />
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

/** «Proponer»: looks like the search field it opens (the dialog's YouTube picker), the page's first action. */
function ProposeBar({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      transition={jelly}
      aria-haspopup="dialog"
      className="well mt-4 flex h-13 w-full min-w-0 items-center gap-3 rounded-[12px] pl-4 pr-1.5 text-left transition-colors hover:border-kin-300/50"
    >
      <Search aria-hidden className="size-5 shrink-0 text-washi-subtle" />
      <span className="min-w-0 flex-1 truncate text-[15px] text-washi-subtle">Busca una canción o pega un enlace</span>
      <span className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[9px] bg-shu-700 px-3.5 text-[14px] font-bold text-washi">
        <Plus aria-hidden className="size-4" /> Proponer
      </span>
    </motion.button>
  );
}

function Tabs({ value, onChange, openCount }: { value: Tab; onChange: (tab: Tab) => void; openCount: number }) {
  const tabs: { id: Tab; label: string; glyph: string }[] = [
    { id: 'deseos', label: 'Lista de deseos', glyph: '願' },
    { id: 'votaciones', label: 'Votaciones', glyph: '票' },
  ];
  return (
    <div
      role="tablist"
      aria-label="Próxima cover"
      className="sep-t flex gap-1 overflow-x-auto px-2 pt-2 sm:px-7 sm:pt-3"
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
              'relative flex h-12 shrink-0 items-center gap-2 rounded-t-[10px] px-3.5 text-[15px] font-bold transition-colors',
              active ? 'text-washi' : 'text-washi-subtle hover:text-washi-muted',
            )}
          >
            <span aria-hidden className={cn('font-display text-[15px]', active ? 'text-shu-400' : 'text-washi-subtle')}>
              {t.glyph}
            </span>
            {t.label}
            {t.id === 'votaciones' && openCount > 0 && (
              <span className="tabular rounded-full bg-ai-600/60 px-1.5 text-[12px] text-ai-200">
                <span className="sr-only">, abiertas: </span>
                {openCount}
              </span>
            )}
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
        <h2 id="open-polls-title" className="flex items-center gap-2 font-display text-[17px] font-bold text-washi">
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
                        alt=""
                        loading="lazy"
                        className="aspect-video w-12 rounded-[5px] object-cover ring-2 ring-sumi-900"
                      />
                    ) : null;
                  })}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-washi">{poll.title}</span>
                  <span className="block truncate text-[12px] text-ai-200">
                    {closingLabel(poll, now)} · {candidates.length} candidatas
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

function WishList({
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
  const now = useNow();
  const toast = useToast();
  // Past votes: only the closed polls' rows (the open ones aren't shown here).
  const closedIds = useMemo(
    () => (polls.data ?? []).filter((p) => isPollClosed(p, now)).map((p) => p.id),
    [polls.data, now],
  );
  const votes = usePollVotes(closedIds, { enabled: closedIds.length > 0 });
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
    for (const w of list) map.set(w.id, pastVotesOf(w.id, polls.data ?? [], options.data ?? [], votes.data ?? [], now));
    return map;
  }, [list, polls.data, options.data, votes.data, now]);
  /** Votes each wish has won (it stays in the list until someone adds it to the library). */
  const wonOf = useMemo(() => {
    const map = new Map<string, Poll>();
    for (const p of polls.data ?? []) if (p.winner_wish_id && !map.has(p.winner_wish_id)) map.set(p.winner_wish_id, p);
    return map;
  }, [polls.data]);

  // Only what is still on the list counts: another phone may have deleted a marked wish or added it to the library.
  const pickedLive = useMemo(() => list.map((w) => w.id).filter((id) => picked.includes(id)), [list, picked]);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

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
        <Button variant="secondary" className="mt-4" loading={wishes.isFetching} onClick={() => void wishes.refetch()}>
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
          <p className="mt-2 max-w-[40ch] text-washi-muted">Propón la primera y que cada persona diga «Me apunto».</p>
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
          <h2 id="wish-list-title" className="min-w-0 flex-1 font-display text-[19px] font-bold leading-tight text-washi">
            {selecting ? 'Elige las candidatas' : 'Por interés'}{' '}
            {!selecting && <span className="tabular text-[14px] font-normal text-washi-subtle">· {list.length}</span>}
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

  const thumb = wish.thumbnail_url && (
    <img src={wish.thumbnail_url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
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
              onClick={onToggleSelect}
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
            <h3 className="line-clamp-2 break-words font-display text-[17px] font-bold leading-snug text-washi">
              {wish.title}
            </h3>
            {details.length > 0 && (
              <p className="mt-0.5 truncate text-[13px] text-washi-muted">{details.join(' · ')}</p>
            )}
            {wish.comment && !selecting && (
              <p className="mt-1 line-clamp-2 break-words text-[13px] italic text-washi-subtle">«{wish.comment}»</p>
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
                className={cn('tabular rounded-full px-1.5 text-[13px]', mine ? 'bg-sumi-900/15' : 'bg-washi/10 text-washi')}
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
                {shown.length > 5 && <span className="tabular text-[12px] text-washi-subtle">+{shown.length - 5}</span>}
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
                <span className="truncate">En votación: {openPoll.title}</span>
              </Link>
            )}
            {won && (
              <Link
                to={`/deseos/votacion/${won.id}`}
                onClick={guardNav}
                className="relative inline-flex min-h-8 max-w-full items-center before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] gap-1 rounded-full bg-kin-400/15 px-2.5 font-bold text-kin-200 hover:bg-kin-400/25"
              >
                <span className="truncate">Ganó «{won.title}»</span>
              </Link>
            )}
            {past.slice(0, 2).map((p) => (
              <Link
                key={p.pollId}
                to={`/deseos/votacion/${p.pollId}`}
                onClick={guardNav}
                className="relative inline-flex min-h-8 max-w-full items-center before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] gap-1 rounded-full border border-line px-2.5 hover:border-line-strong hover:text-washi-muted"
                title="Sus votos en una votación anterior"
              >
                <span className="truncate">
                  <span className="tabular font-bold text-kin-300">{scoreLabel(p.type, p.score)}</span> en «{p.title}»
                </span>
              </Link>
            ))}
            {proposer && <span className="truncate">Propuesta por {proposer.name}</span>}
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
        <Seal glyph="票" size={60} stamp />
        <h2 className="mt-5 font-display text-[24px] font-bold leading-tight">Aún no hay votaciones</h2>
        <p className="mt-2 max-w-[40ch] text-washi-muted">Elige dos o más canciones de la lista y que vote el grupo.</p>
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
