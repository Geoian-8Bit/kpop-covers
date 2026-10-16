import { VOTE_TYPES, type Poll, type VoteType, type Wish } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Check } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { currentMemberId, useMembers } from '@/data/members';
import { useCreatePoll, useUpdatePoll, useWishInterest, useWishes, wishError } from '@/data/wishes';
import { cn } from '@/lib/cn';
import { jelly, soft } from '@/lib/motion';
import { useToast } from '@/providers/ToastProvider';
import { VOTE_TYPE_COPY } from './pollRules';
import { interestByWish, liveWishes, sortByInterest } from './wishRules';

/** Preset for a new vote: the wishes chosen in the list, or a second round between the tied ones. */
export interface PollPreset {
  title?: string;
  wishIds: string[];
  vote_type?: VoteType;
  results_live?: boolean;
  anonymous?: boolean;
  parent?: Pick<Poll, 'id' | 'closed_at' | 'title'> | null;
}

type Closing = 'manual' | 'time';
const KEEP_PROMISE = 'Ya hay votos: no se puede quitar el anonimato ni enseñar antes los resultados.';

/** `YYYY-MM-DDTHH:mm` in local time, for <input type="datetime-local">. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The next Sunday at 22:00 (the plan's example), or a week later if that's already past. */
function nextSundayEvening(from = new Date()): Date {
  const date = new Date(from);
  date.setDate(date.getDate() + ((7 - date.getDay()) % 7));
  date.setHours(22, 0, 0, 0);
  if (date.getTime() <= from.getTime()) date.setDate(date.getDate() + 7);
  return date;
}

/**
 * F11 · «Crear votación» (candidates from the wish list, title, closing date and time or by hand, type, results
 * live or at the end, named or anonymous) and «Editar» of an open one (the candidates and the type stay).
 */
export function PollFormDialog({
  open,
  onClose,
  preset,
  poll,
  hasVotes = false,
}: {
  open: boolean;
  onClose: () => void;
  preset?: PollPreset | null;
  poll?: Poll | null;
  /** Editing a poll that already has votes: what was promised to the voters (anonymous, results at the end) stays. */
  hasVotes?: boolean;
}) {
  const editing = Boolean(poll);
  const wishes = useWishes();
  const interest = useWishInterest();
  const members = useMembers();
  const create = useCreatePoll();
  const update = useUpdatePoll();
  const navigate = useNavigate();
  const toast = useToast();
  const busy = create.isPending || update.isPending;
  // With votes cast, an anonymous poll can't become named, nor «al cerrar» become live.
  const lockNames = Boolean(poll?.anonymous && hasVotes);
  const lockResults = Boolean(poll && !poll.results_live && hasVotes);

  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [closing, setClosing] = useState<Closing>('time');
  const [closesAt, setClosesAt] = useState('');
  const [type, setType] = useState<VoteType>('single');
  const [live, setLive] = useState(true);
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (poll) {
      setTitle(poll.title);
      setPicked([]);
      setClosing(poll.closes_at ? 'time' : 'manual');
      setClosesAt(toLocalInput(poll.closes_at ? new Date(poll.closes_at) : nextSundayEvening()));
      setType(poll.vote_type);
      setLive(poll.results_live);
      setAnonymous(poll.anonymous);
      return;
    }
    setTitle(preset?.title ?? 'Próxima cover');
    setPicked(preset?.wishIds ?? []);
    setClosing(preset?.parent ? 'manual' : 'time');
    setClosesAt(toLocalInput(nextSundayEvening()));
    setType(preset?.vote_type ?? 'single');
    setLive(preset?.results_live ?? true);
    setAnonymous(preset?.anonymous ?? false);
    // Only when it opens: a parent re-rendering (with an equal preset) must not wipe what is being typed.
  }, [open]);

  // Candidates: the live list by interest (a second round only shows the tied ones).
  const candidates = useMemo(() => {
    const counts = interestByWish(interest.data ?? []);
    const list = sortByInterest(liveWishes(wishes.data ?? []), (id) => counts.get(id)?.length ?? 0);
    if (preset?.parent) {
      return (wishes.data ?? []).filter((w) => preset.wishIds.includes(w.id));
    }
    // Wishes passed in but already in the library (e.g. after a first round) still count as candidates.
    const extra = (wishes.data ?? []).filter((w) => w.added_video_id && preset?.wishIds.includes(w.id));
    return [...extra, ...list];
  }, [wishes.data, interest.data, preset]);

  const closesMs = closing === 'time' && closesAt ? new Date(closesAt).getTime() : null;
  const timeProblem =
    closing === 'time' && (!closesAt || !Number.isFinite(closesMs) || (closesMs ?? 0) <= Date.now() + 60_000)
      ? 'Elige una fecha y hora futuras.'
      : null;
  const canSubmit =
    !busy && title.trim().length > 0 && title.trim().length <= 80 && !timeProblem && (editing || picked.length >= 2);

  function toggle(id: string) {
    setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    const closes_at = closing === 'time' && closesMs ? new Date(closesMs).toISOString() : null;
    try {
      if (poll) {
        await update.mutateAsync({
          id: poll.id,
          patch: { title: title.trim(), closes_at, results_live: live, anonymous },
        });
        toast('Votación actualizada', 'success');
        onClose();
        return;
      }
      const created = await create.mutateAsync({
        row: {
          title: title.trim(),
          vote_type: type,
          results_live: live,
          anonymous,
          closes_at,
          created_by_member_id: currentMemberId(members.data),
          parent_poll_id: preset?.parent?.id ?? null,
        },
        // In the order of the list, so every phone shows the candidates the same way.
        wishIds: candidates.map((w) => w.id).filter((id) => picked.includes(id)),
        parent: preset?.parent ?? null,
      });
      toast(preset?.parent ? 'Segunda vuelta creada' : 'Votación creada', 'success');
      onClose();
      navigate(`/deseos/votacion/${created.id}`);
    } catch (err) {
      setError(wishError(err));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      title={editing ? 'Editar votación' : preset?.parent ? 'Segunda vuelta' : 'Crear votación'}
      description={
        preset?.parent ? (
          <>Solo con las empatadas de «{preset.parent.title}».</>
        ) : editing ? (
          'Las candidatas y el tipo de voto no cambian.'
        ) : (
          'Elige las candidatas de la lista de deseos y cómo se vota.'
        )
      }
    >
      <form onSubmit={onSubmit} className="space-y-6">
        <Field
          label="Título"
          required
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          data-autofocus="desktop"
        />

        {!editing && (
          <fieldset className="min-w-0">
            <legend className="mb-2 flex w-full items-baseline justify-between gap-2 text-[13px] font-medium text-washi-muted">
              <span>Candidatas</span>
              <span className={cn('tabular', picked.length < 2 && 'text-kin-300')}>
                {picked.length < 2 ? 'Elige al menos 2' : `${picked.length} elegidas`}
              </span>
            </legend>
            {candidates.length === 0 ? (
              <p className="rounded-[12px] border border-line px-4 py-5 text-sm text-washi-muted">
                La lista de deseos está vacía. Propón canciones primero.
              </p>
            ) : (
              <ul className="max-h-[min(40dvh,320px)] space-y-1.5 overflow-y-auto overscroll-contain pr-1">
                {candidates.map((wish) => (
                  <CandidateRow
                    key={wish.id}
                    wish={wish}
                    checked={picked.includes(wish.id)}
                    onToggle={() => toggle(wish.id)}
                    locked={Boolean(preset?.parent)}
                  />
                ))}
              </ul>
            )}
          </fieldset>
        )}

        {!editing && (
          <div>
            <p aria-hidden className="mb-1.5 text-[13px] font-medium text-washi-muted">
              Tipo de voto
            </p>
            <Segmented
              label="Tipo de voto"
              layoutId="poll-type"
              value={type}
              onChange={setType}
              className="w-full [&>button]:min-h-10 [&>button]:flex-1"
              options={VOTE_TYPES.map((t) => ({ value: t, label: VOTE_TYPE_COPY[t].label }))}
            />
            <p className="mt-1.5 text-[13px] text-washi-subtle">{VOTE_TYPE_COPY[type].how}</p>
          </div>
        )}

        <div>
          <p aria-hidden className="mb-1.5 text-[13px] font-medium text-washi-muted">
            Cierre
          </p>
          <Segmented
            label="Cierre"
            layoutId="poll-closing"
            value={closing}
            onChange={setClosing}
            className="w-full [&>button]:min-h-10 [&>button]:flex-1"
            options={[
              { value: 'time', label: 'Fecha y hora' },
              { value: 'manual', label: 'A mano' },
            ]}
          />
          <AnimatePresence initial={false}>
            {closing === 'time' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={soft}
                className="overflow-hidden"
              >
                <Field
                  className="pt-3"
                  label="Se cierra el"
                  type="datetime-local"
                  value={closesAt}
                  min={toLocalInput(new Date())}
                  onChange={(e) => setClosesAt(e.target.value)}
                  error={timeProblem}
                  hint="También se puede cerrar antes, a mano."
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p aria-hidden className="mb-1.5 text-[13px] font-medium text-washi-muted">
              Resultados
            </p>
            <Segmented
              label="Resultados"
              layoutId="poll-results"
              value={live ? 'live' : 'end'}
              onChange={(v) => setLive(v === 'live')}
              onDisabled={() => setError(KEEP_PROMISE)}
              className="w-full [&>button]:min-h-10 [&>button]:flex-1"
              options={[
                { value: 'live', label: 'En directo', disabled: lockResults },
                { value: 'end', label: 'Al cerrar' },
              ]}
            />
          </div>
          <div>
            <p aria-hidden className="mb-1.5 text-[13px] font-medium text-washi-muted">
              Votos
            </p>
            <Segmented
              label="Votos"
              layoutId="poll-anonymous"
              value={anonymous ? 'anon' : 'named'}
              onChange={(v) => setAnonymous(v === 'anon')}
              onDisabled={() => setError(KEEP_PROMISE)}
              className="w-full [&>button]:min-h-10 [&>button]:flex-1"
              options={[
                { value: 'named', label: 'Con nombre', disabled: lockNames },
                { value: 'anon', label: 'Anónimos' },
              ]}
            />
          </div>
        </div>
        <p className="-mt-3 text-[12px] leading-snug text-washi-subtle">
          {lockNames || lockResults
            ? 'Ya hay votos: lo que se prometió al votar (anónimos, resultados al cerrar) no se puede cambiar.'
            : 'Un voto por persona según «¿Quién eres?»: va por confianza, sin contraseñas.'}
        </p>

        <AnimatePresence>
          {error && (
            <motion.p
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-sm text-enji-300"
            >
              <AlertTriangle aria-hidden className="size-4" /> {error}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!canSubmit} loading={busy}>
            {editing ? 'Guardar' : 'Crear votación'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CandidateRow({
  wish,
  checked,
  onToggle,
  locked,
}: {
  wish: Wish;
  checked: boolean;
  onToggle: () => void;
  locked: boolean;
}) {
  return (
    <li>
      <motion.button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-disabled={locked || undefined}
        onClick={() => !locked && onToggle()}
        whileTap={locked ? undefined : { scale: 0.98 }}
        transition={jelly}
        className={cn(
          'flex min-h-14 w-full items-center gap-3 rounded-[12px] border px-2.5 py-2 text-left transition-colors',
          checked ? 'border-kin-400/60 bg-kin-400/[0.08]' : 'border-line hover:border-line-strong hover:bg-washi/[0.04]',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-[6px] border transition-colors',
            checked ? 'border-kin-300 bg-kin-300 text-sumi-900' : 'border-line-strong',
          )}
        >
          {checked && <Check className="size-4" strokeWidth={3} />}
        </span>
        {wish.thumbnail_url && (
          <img src={wish.thumbnail_url} alt="" loading="lazy" className="aspect-video w-16 shrink-0 rounded-[6px] object-cover" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold text-washi">{wish.title}</span>
          {wish.artist && <span className="block truncate text-[12px] text-washi-subtle">{wish.artist}</span>}
        </span>
      </motion.button>
    </li>
  );
}
