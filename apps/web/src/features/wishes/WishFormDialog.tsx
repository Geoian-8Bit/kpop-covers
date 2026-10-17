import { WISH_DIFFICULTIES, youTubeThumbnail, type Wish, type WishDifficulty } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ChevronDown, Search } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { YouTubePicker, type YouTubePick, type YouTubePickerHandle } from '@/components/YouTubePicker';
import { searchQueryOf } from '@/components/youTubePickerRules';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { currentMemberId, useMembers } from '@/data/members';
import { useVideos } from '@/data/videos';
import { useProposeWish, useUpdateWish, useWishes, wishError } from '@/data/wishes';
import { soft } from '@/lib/motion';
import { useCrew } from '@/providers/CrewProvider';
import { useToast } from '@/providers/ToastProvider';
import { DIFFICULTY_COPY, LINK_PROBLEM, liveWishes, parseMembersCount, SONG_BADGE, songStatus } from './wishRules';

type DifficultyChoice = WishDifficulty | 'none';

/**
 * F12 · «Proponer canción» — search YouTube or paste a link (35, the shared `YouTubePicker`): title, group and
 * thumbnail come by themselves — and «Editar» (same form without the picker). Optional: members of the original
 * group, difficulty, a comment. Proposing only writes the wish: the song reaches the library with «Añadir a la
 * biblioteca» and nothing else (36).
 */
export function WishFormDialog({ open, onClose, wish }: { open: boolean; onClose: () => void; wish?: Wish | null }) {
  const editing = Boolean(wish);
  const { activeCrew } = useCrew();
  const wishes = useWishes();
  const library = useVideos(activeCrew?.id, { enabled: open && !editing });
  const members = useMembers();
  const propose = useProposeWish();
  const update = useUpdateWish();
  const toast = useToast();
  const navigate = useNavigate();
  const busy = propose.isPending || update.isPending;

  const [text, setText] = useState('');
  const [pick, setPick] = useState<YouTubePick | null>(null);
  const [searching, setSearching] = useState(false);
  const picker = useRef<YouTubePickerHandle>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [count, setCount] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyChoice>('none');
  const [comment, setComment] = useState('');
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Proposed: the list now holds it, but the closing dialog must not flash «ya propuesta». */
  const [done, setDone] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    if (!open) return;
    touched.current = false;
    setDone(false);
    setError(null);
    setText('');
    setPick(null);
    setTitle(wish?.title ?? '');
    setArtist(wish?.artist ?? '');
    setCount(wish?.members_count != null ? String(wish.members_count) : '');
    setDifficulty(wish?.difficulty ?? 'none');
    setComment(wish?.comment ?? '');
    setMore(Boolean(wish && (wish.members_count != null || wish.difficulty || wish.comment)));
  }, [open, wish]);

  const live = liveWishes(wishes.data ?? []);
  const libraryIds = (library.data ?? []).map((v) => v.youtube_id);
  const statusOf = (youtubeId: string) => songStatus(youtubeId, live, libraryIds);
  const status = pick ? (done || propose.isPending ? 'new' : statusOf(pick.youtubeId)) : null;
  const inLibrary = pick && status === 'in-library' ? library.data?.find((v) => v.youtube_id === pick.youtubeId) : undefined;

  /** A search hit or a pasted link (again with the title once its lookup answers): fills title and group. */
  function onPick(next: YouTubePick) {
    setPick(next);
    if (!touched.current) {
      setTitle(next.title);
      setArtist(next.channel);
    }
  }

  const wantsSearch = !editing && !pick && searchQueryOf(text) != null;
  const parsedCount = parseMembersCount(count);
  // Until the library and the list have loaded, every song would look «new»: no proposing a song already in them.
  const checking = !editing && (library.isPending || wishes.isPending);
  const canSubmit =
    !busy &&
    !checking &&
    title.trim().length > 0 &&
    parsedCount !== 'invalid' &&
    comment.length <= 300 &&
    (editing || (pick != null && status === 'new'));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (wantsSearch) {
      picker.current?.search();
      return;
    }
    if (!canSubmit) return;
    setError(null);
    const fields = {
      title: title.trim(),
      artist: artist.trim() || null,
      members_count: parsedCount,
      difficulty: difficulty === 'none' ? null : difficulty,
      comment: comment.trim() || null,
    };
    try {
      if (wish) {
        await update.mutateAsync({ id: wish.id, patch: fields });
        toast('Cambios guardados', 'success');
      } else {
        // Only the wish row: no library video until someone confirms «Añadir a la biblioteca».
        await propose.mutateAsync({
          ...fields,
          youtube_id: pick!.youtubeId,
          thumbnail_url: youTubeThumbnail(pick!.youtubeId),
          proposed_by_member_id: currentMemberId(members.data),
        });
        setDone(true);
        toast('Propuesta añadida a la lista de deseos', 'success');
      }
      onClose();
    } catch (err) {
      setError(wishError(err));
    }
  }

  const showFields = editing || pick != null;

  return (
    <Dialog open={open} onClose={onClose} busy={busy} title={editing ? 'Editar propuesta' : 'Proponer canción'}>
      <form onSubmit={onSubmit} noValidate={wantsSearch} className="space-y-5">
        {!editing && (
          <>
            <YouTubePicker
              ref={picker}
              autoFocus
              value={text}
              onValueChange={setText}
              onPick={onPick}
              onClear={() => setPick(null)}
              onSearchingChange={setSearching}
              placeholder="Ej. ILLIT Magnetic"
              badgeFor={(id) => {
                const s = statusOf(id);
                return s === 'new' ? null : { label: SONG_BADGE[s] };
              }}
            />
            {pick && status !== 'new' && (
              <div
                role="status"
                className="flex flex-wrap items-center gap-3 rounded-[12px] border border-kin-300/40 bg-kin-300/[0.07] px-3.5 py-3 text-[13px] text-kin-200"
              >
                <span className="min-w-0 flex-1">
                  {status === 'duplicate'
                    ? `${LINK_PROBLEM.duplicate} Apúntate desde la lista.`
                    : LINK_PROBLEM['in-library']}
                </span>
                {status === 'duplicate' ? (
                  <Button size="sm" variant="secondary" className="min-h-11" onClick={onClose}>
                    Ver la lista
                  </Button>
                ) : (
                  inLibrary && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="min-h-11"
                      onClick={() => {
                        onClose();
                        navigate(`/v/${inLibrary.id}`, { replace: true });
                      }}
                    >
                      Abrir
                    </Button>
                  )
                )}
              </div>
            )}
          </>
        )}

        <AnimatePresence initial={false}>
          {showFields && (
            <motion.div
              key="fields"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={soft}
              className="space-y-5"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Título"
                  required
                  maxLength={200}
                  value={title}
                  onChange={(e) => {
                    touched.current = true;
                    setTitle(e.target.value);
                  }}
                />
                <Field
                  label="Grupo"
                  maxLength={120}
                  placeholder="Ej. ILLIT"
                  value={artist}
                  onChange={(e) => {
                    touched.current = true;
                    setArtist(e.target.value);
                  }}
                />
              </div>

              <div className="rounded-[12px] border border-line">
                <button
                  type="button"
                  aria-expanded={more}
                  aria-controls="wish-more"
                  onClick={() => setMore((m) => !m)}
                  className="flex min-h-12 w-full items-center gap-2 rounded-[12px] px-3.5 text-left text-[14px] font-bold text-washi-muted hover:text-washi"
                >
                  <span className="min-w-0 flex-1">
                    Más detalles <span className="font-normal text-washi-subtle">(opcional)</span>
                  </span>
                  <motion.span aria-hidden animate={{ rotate: more ? 180 : 0 }} transition={soft}>
                    <ChevronDown className="size-4.5" />
                  </motion.span>
                </button>
                {more && (
                  <div id="wish-more" className="space-y-4 border-t border-line px-3.5 pb-4 pt-3">
                    <Field
                      label="Miembros del grupo original"
                      className="max-w-[14rem]"
                      inputMode="numeric"
                      placeholder="Ej. 5"
                      maxLength={2}
                      value={count}
                      onChange={(e) => setCount(e.target.value.replace(/[^\d]/g, ''))}
                      error={parsedCount === 'invalid' ? 'Entre 1 y 30.' : null}
                    />
                    <div>
                      <p aria-hidden className="mb-1.5 text-[13px] font-medium text-washi-muted">
                        Dificultad
                      </p>
                      <Segmented
                        label="Dificultad"
                        layoutId="wish-difficulty"
                        value={difficulty}
                        onChange={setDifficulty}
                        className="w-full [&>button]:min-h-11 [&>button]:flex-1"
                        options={[
                          { value: 'none', label: '—', ariaLabel: 'Sin indicar' },
                          ...WISH_DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_COPY[d].label })),
                        ]}
                      />
                    </div>
                    <div>
                      <label htmlFor="wish-comment" className="mb-1.5 block text-[13px] font-medium text-washi-muted">
                        Comentario
                      </label>
                      <textarea
                        id="wish-comment"
                        rows={2}
                        maxLength={300}
                        placeholder="Ej. ideal para el evento de diciembre"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="well w-full resize-none rounded-[10px] px-4 py-3 text-[15px] text-washi outline-none focus:border-kin-300/70"
                      />
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
          {wantsSearch ? (
            <Button type="submit" loading={searching}>
              <Search aria-hidden className="size-4" /> Buscar
            </Button>
          ) : (
            <Button type="submit" disabled={!canSubmit} loading={busy || (checking && pick != null)}>
              {editing ? 'Guardar' : checking && pick != null ? 'Comprobando…' : 'Proponer'}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
