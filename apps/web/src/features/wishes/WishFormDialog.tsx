import { WISH_DIFFICULTIES, youTubeThumbnail, type Wish, type WishDifficulty } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Link2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { currentMemberId, useMembers } from '@/data/members';
import { useVideos } from '@/data/videos';
import { useProposeWish, useUpdateWish, useWishes, wishError } from '@/data/wishes';
import { soft } from '@/lib/motion';
import { useYouTubeMeta } from '@/lib/youtubeMeta';
import { useCrew } from '@/providers/CrewProvider';
import { useToast } from '@/providers/ToastProvider';
import { checkWishLink, DIFFICULTY_COPY, LINK_PROBLEM, liveWishes, parseMembersCount } from './wishRules';

type DifficultyChoice = WishDifficulty | 'none';

/**
 * F12 · «Proponer canción» (paste a YouTube link: title, group and thumbnail come by themselves) and «Editar»
 * (same form without the link). Optional: members of the original group, difficulty, a comment.
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
  const busy = propose.isPending || update.isPending;

  const [link, setLink] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [count, setCount] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyChoice>('none');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const touched = useRef(false);

  useEffect(() => {
    if (!open) return;
    touched.current = false;
    setError(null);
    setLink('');
    setTitle(wish?.title ?? '');
    setArtist(wish?.artist ?? '');
    setCount(wish?.members_count != null ? String(wish.members_count) : '');
    setDifficulty(wish?.difficulty ?? 'none');
    setComment(wish?.comment ?? '');
  }, [open, wish]);

  const check = editing
    ? null
    : checkWishLink(
        link,
        liveWishes(wishes.data ?? []),
        (library.data ?? []).map((v) => v.youtube_id),
      );
  const youtubeId = check?.ok ? check.youtubeId : null;
  const meta = useYouTubeMeta(youtubeId);

  useEffect(() => {
    if (meta.status === 'ok' && !touched.current) {
      setTitle(meta.title ?? '');
      setArtist(meta.author ?? '');
    }
  }, [meta]);

  const linkProblem =
    !editing && check && !check.ok && check.reason !== 'empty'
      ? LINK_PROBLEM[check.reason]
      : meta.status === 'error'
        ? meta.message
        : null;
  const parsedCount = parseMembersCount(count);
  const canSubmit =
    !busy &&
    title.trim().length > 0 &&
    parsedCount !== 'invalid' &&
    comment.length <= 300 &&
    (editing || (Boolean(youtubeId) && meta.status !== 'error' && meta.status !== 'loading'));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
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
        await propose.mutateAsync({
          ...fields,
          youtube_id: youtubeId!,
          thumbnail_url: youTubeThumbnail(youtubeId!),
          proposed_by_member_id: currentMemberId(members.data),
        });
        toast('Propuesta añadida a la lista de deseos', 'success');
      }
      onClose();
    } catch (err) {
      setError(wishError(err));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      title={editing ? 'Editar propuesta' : 'Proponer canción'}
      description={
        editing ? undefined : 'Pega el enlace de YouTube: el título, el grupo y la miniatura se ponen solos.'
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {!editing && (
          <>
            <Field
              data-autofocus
              label="Enlace de YouTube"
              placeholder="https://youtu.be/…"
              inputMode="url"
              autoComplete="off"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              error={link.trim() ? linkProblem : null}
              trailing={youtubeId ? <Link2 aria-hidden className="mr-2.5 size-4.5 text-washi-subtle" /> : undefined}
            />
            <AnimatePresence>
              {youtubeId && meta.status !== 'error' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={soft}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-3 rounded-[12px] border border-line bg-sumi-950/50 p-2">
                    <img
                      src={youTubeThumbnail(youtubeId, 'mqdefault')}
                      alt=""
                      className="aspect-video w-28 shrink-0 rounded-[8px] object-cover"
                    />
                    <div className="min-w-0 flex-1" aria-live="polite">
                      {meta.status === 'loading' ? (
                        <div className="space-y-2">
                          <div className="skeleton h-3.5 w-4/5 rounded-full" />
                          <div className="skeleton h-3 w-1/2 rounded-full" />
                        </div>
                      ) : (
                        <>
                          <p className="line-clamp-2 text-sm font-medium">
                            {meta.status === 'ok' && meta.title ? meta.title : 'Vídeo de YouTube'}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-washi-muted">
                            {meta.status === 'ok' && meta.author ? meta.author : youtubeId}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

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

        <div className="space-y-4">
          <Field
            label="Miembros del grupo original"
            className="max-w-[14rem]"
            hint="Opcional"
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
              className="w-full [&>button]:min-h-10 [&>button]:flex-1"
              options={[
                { value: 'none', label: '—', ariaLabel: 'Sin indicar' },
                ...WISH_DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_COPY[d].label })),
              ]}
            />
          </div>
        </div>

        <div>
          <label htmlFor="wish-comment" className="mb-1.5 block text-[13px] font-medium text-washi-muted">
            Comentario <span className="text-washi-subtle">(opcional)</span>
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
            {editing ? 'Guardar' : 'Proponer'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
