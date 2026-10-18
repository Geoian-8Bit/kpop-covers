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
import { navigateFromLayer } from '@/lib/backLayers';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { useToast } from '@/providers/ToastProvider';
import { VOTE_TYPE_COPY } from './pollRules';
import { interestByWish, liveWishes, sortByInterest } from './wishRules';

/** Preset for a new vote: the wishes chosen in the list, or a second round between the tied ones. */
export interface PollPreset {
  title?: string;
  wishIds: string[];
  vote_type?: VoteType;
  parent?: Pick<Poll, 'id' | 'closed_at' | 'title'> | null;
}

/**
 * F11 · «Crear votación» (candidates from the wish list, title, type) and «Editar» of an open one (only the title:
 * the candidates and the type stay). 52 · No more options: results are always live, votes always named and the
 * close always by hand (`insertPoll` writes those fixed values).
 */
export function PollFormDialog({
  open,
  onClose,
  preset,
  poll,
}: {
  open: boolean;
  onClose: () => void;
  preset?: PollPreset | null;
  poll?: Poll | null;
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

  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [type, setType] = useState<VoteType>('single');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (poll) {
      setTitle(poll.title);
      setPicked([]);
      setType(poll.vote_type);
      return;
    }
    setTitle(preset?.title ?? 'Próxima cover');
    setPicked(preset?.wishIds ?? []);
    setType(preset?.vote_type ?? 'single');
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

  const canSubmit = !busy && title.trim().length > 0 && title.trim().length <= 80 && (editing || picked.length >= 2);

  function toggle(id: string) {
    setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      if (poll) {
        await update.mutateAsync({ id: poll.id, patch: { title: title.trim() } });
        toast('Votación actualizada', 'success');
        onClose();
        return;
      }
      const created = await create.mutateAsync({
        row: {
          title: title.trim(),
          vote_type: type,
          created_by_member_id: currentMemberId(members.data),
          parent_poll_id: preset?.parent?.id ?? null,
        },
        // In the order of the list, so every phone shows the candidates the same way.
        wishIds: candidates.map((w) => w.id).filter((id) => picked.includes(id)),
        parent: preset?.parent ?? null,
      });
      toast(preset?.parent ? 'Segunda vuelta creada' : 'Votación creada', 'success');
      onClose();
      // From the dialog: the poll's page takes the dialog's history entry («Atrás» goes straight back to the list).
      navigateFromLayer(navigate, `/deseos/votacion/${created.id}`);
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

        {/* Editing only changes the title (and an older vote may still be anonymous or close by itself). */}
        {!editing && (
          <p className="text-[12px] leading-snug text-washi-subtle">
            Resultados en directo y votos con nombre. Se cierra a mano, desde la votación. Un voto por persona según
            «¿Quién eres?»: va por confianza, sin contraseñas.
          </p>
        )}

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
