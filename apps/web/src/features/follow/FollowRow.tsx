import { type FollowPath, type Member, type Video } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { Crosshair, FileVideo, MapPin, MapPinOff, PenLine, Trash2, UserRoundSearch, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { useDeleteFollowPath, useFollowPaths, useUpdateFollowPath } from '@/data/follow';
import { MEMBER_SWATCH, useMembers } from '@/data/members';
import { zoomAvailability } from '@/features/studio/ZoomControls';
import { cn } from '@/lib/cn';
import { jelly, snappy } from '@/lib/motion';
import { rememberStage } from '@/lib/stagePref';
import { friendlyError } from '@/lib/supabase';
import { usePlayer } from '@/player/store';
import { NO_ZOOM } from '@/player/zoom';
import { useToast } from '@/providers/ToastProvider';
import { compressKeyframes, FOLLOW_LABEL_MAX, removeKeyframeNear } from './followPath';
import { followUi, jobPercent, useFollowUi, type FollowDraft, type PickMode } from './followUi';
import { useFollowActions } from './useFollowActions';

/** The followed path of this song as SaveClipDialog wants it («Guardar clip siguiendo a X»). */
export function useFollowedPath(videoId: string | undefined): { id: string; label: string } | null {
  const paths = useFollowPaths(videoId).data;
  const id = usePlayer((s) => s.followPathId);
  const path = paths?.find((p) => p.id === id);
  return useMemo(() => (path ? { id: path.id, label: path.label } : null), [path]);
}

/**
 * F10 · «Seguir a un bailarín», the row under the player: who to follow (the group's shared paths), a new one
 * (analysed on this device from the file, or placed by hand), corrections, and the analysis' progress.
 */
export function FollowRow({ video, onLink }: { video: Video; onLink: () => void }) {
  const stage = usePlayer((s) => s.stage);
  const ready = usePlayer((s) => s.ready);
  const followId = usePlayer((s) => s.followPathId);
  const { can, reason } = zoomAvailability(video, stage, ready);
  const actions = useFollowActions(video);
  const paths = actions.paths.data ?? [];
  const selected = paths.find((p) => p.id === followId) ?? null;
  const picking = useFollowUi((s) => s.picking);
  const job = useFollowUi((s) => s.job);
  const draft = useFollowUi((s) => s.draft);
  const busy = Boolean(job) || actions.saving;
  const remove = useDeleteFollowPath();
  const update = useUpdateFollowPath();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setConfirmDelete(false), [followId]);

  // Only re-renders when the playhead reaches or leaves a manual point (not on every frame).
  const nearPoint = usePlayer((s) =>
    selected?.source === 'manual' ? selected.keyframes.some((k) => Math.abs(k[0] - s.time) <= 0.25) : false,
  );

  function startPicking(mode: PickMode) {
    usePlayer.getState().pause();
    followUi.pick(mode);
  }

  function follow(path: FollowPath | null) {
    usePlayer.getState().setFollowPath(path?.id ?? null);
    if (!path) usePlayer.getState().setZoom(NO_ZOOM);
  }

  async function deleteSelected() {
    if (!selected) return;
    try {
      await remove.mutateAsync(selected);
      follow(null);
      toast(`Recorrido de «${selected.label}» borrado`, 'success');
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  }

  async function removePoint() {
    if (!selected || !nearPoint) return;
    if (selected.keyframes.length <= 1) {
      toast('Es el único punto: borra el recorrido si ya no lo quieres', 'info');
      return;
    }
    try {
      await update.mutateAsync({
        id: selected.id,
        patch: {
          keyframes: compressKeyframes(removeKeyframeNear(selected.keyframes, usePlayer.getState().time)),
        },
      });
      toast('Punto quitado', 'success');
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  }

  return (
    <div className="sep-t px-4 py-3 sm:px-5" role="group" aria-labelledby="follow-row-title">
      <p
        id="follow-row-title"
        className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-washi-subtle"
      >
        Seguir a un bailarín
      </p>

      {paths.length > 0 && (
        <div role="radiogroup" aria-label="¿A quién sigues?" className="mb-2 flex flex-wrap gap-1.5">
          {[null, ...paths].map((p) => {
            const on = (p?.id ?? null) === (selected?.id ?? null);
            return (
              <motion.button
                key={p?.id ?? 'none'}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={busy}
                onClick={() => follow(p)}
                whileTap={{ scale: 0.92 }}
                transition={jelly}
                className={cn(
                  'relative flex min-h-11 max-w-full items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-medium transition-colors disabled:opacity-40',
                  on
                    ? 'border-washi bg-washi text-sumi-900'
                    : 'border-line text-washi-muted hover:text-washi',
                )}
              >
                {p ? <MemberDot path={p} /> : null}
                <span className="truncate">{p ? p.label : 'Nadie'}</span>
                {p?.source === 'manual' && (
                  <span className={cn('text-[11px]', on ? 'text-sumi-700' : 'text-washi-subtle')}>
                    a mano
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="secondary"
          className="min-h-11"
          disabled={!can || busy || picking != null}
          onClick={() => startPicking({ kind: 'auto' })}
        >
          <UserRoundSearch className="size-4" /> Seguir a alguien
        </Button>
        <Button
          variant="ghost"
          className="min-h-11"
          disabled={busy || picking != null}
          onClick={() => startPicking({ kind: 'manual' })}
        >
          <PenLine className="size-4" /> Modo manual
        </Button>
        {selected?.source === 'auto' && can && (
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={busy || picking != null}
            onClick={() => startPicking({ kind: 'correct', pathId: selected.id })}
          >
            <Crosshair className="size-4" /> Corregir desde aquí
          </Button>
        )}
        {selected?.source === 'manual' && (
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={busy || picking != null}
            onClick={() => startPicking({ kind: 'point', pathId: selected.id })}
          >
            <MapPin className="size-4" /> {nearPoint ? 'Mover el punto' : 'Añadir punto aquí'}
          </Button>
        )}
        {selected?.source === 'manual' && nearPoint && (
          <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => void removePoint()}>
            <MapPinOff className="size-4" /> Quitar punto
          </Button>
        )}
        {selected &&
          (confirmDelete ? (
            <span className="flex items-center gap-1.5">
              <Button
                variant="danger"
                className="min-h-11"
                loading={remove.isPending}
                onClick={() => void deleteSelected()}
              >
                <Trash2 className="size-4" /> Borrar «{selected.label}»
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="No borrar"
                onClick={() => setConfirmDelete(false)}
              >
                <X className="size-4" />
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Borrar el recorrido de «${selected.label}»`}
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4.5" />
            </Button>
          ))}
      </div>

      <AnimatePresence initial={false}>
        {job && (
          <motion.div
            key="job"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={snappy}
            className="overflow-hidden"
          >
            <div className="mt-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="mb-1 truncate text-[13px] text-washi" aria-live="polite">
                  {job.phase === 'model'
                    ? 'Preparando el modelo…'
                    : job.phase === 'video'
                      ? 'Abriendo el vídeo…'
                      : job.phase === 'saving'
                        ? 'Guardando el recorrido…'
                        : `${job.pathId ? 'Recalculando' : 'Analizando'} a «${job.label}»: ${jobPercent(job)} %`}
                </p>
                <div
                  role="progressbar"
                  aria-label="Progreso del análisis"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={jobPercent(job)}
                  className="h-2 overflow-hidden rounded-full bg-sumi-700"
                >
                  <motion.div
                    className="h-full rounded-full bg-kin-300"
                    initial={false}
                    animate={{ width: `${jobPercent(job)}%` }}
                    transition={snappy}
                  />
                </div>
              </div>
              <Button
                variant="secondary"
                className="min-h-11"
                disabled={job.phase === 'saving'}
                onClick={() => job.abort.abort()}
              >
                Cancelar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="mt-1.5 text-[12px] leading-snug text-washi-subtle">
        {reason === 'link' ? (
          <span className="flex flex-wrap items-center gap-x-2">
            Con YouTube la app no puede ver la imagen: solo hay modo manual (coloca el recuadro en varios
            momentos). El zoom que sigue se ve con el archivo.
            <button
              type="button"
              onClick={onLink}
              className="inline-flex min-h-11 items-center gap-1 font-medium text-kin-300 hover:underline"
            >
              <FileVideo className="size-3.5" /> Añadir archivo
            </button>
          </span>
        ) : reason === 'switch' ? (
          <span className="flex flex-wrap items-center gap-x-2">
            Para analizar y para ver el zoom que sigue, usa el archivo vinculado.
            <button
              type="button"
              onClick={() => {
                usePlayer.getState().setStage('file');
                rememberStage(video.id, 'file');
              }}
              className="inline-flex min-h-11 items-center gap-1 font-medium text-kin-300 hover:underline"
            >
              <FileVideo className="size-3.5" /> Usar el archivo
            </button>
          </span>
        ) : selected ? (
          selected.source === 'manual' ? (
            `Siguiendo a «${selected.label}» con ${selected.keyframes.length} ${selected.keyframes.length === 1 ? 'punto' : 'puntos'}: el zoom va de uno a otro. Guarda un clip y se abrirá siguiéndole.`
          ) : (
            `Siguiendo a «${selected.label}». Si en un cruce salta a otra persona, pausa ahí y pulsa «Corregir desde aquí». Guarda un clip y se abrirá siguiéndole.`
          )
        ) : (
          'Pausa, pulsa «Seguir a alguien» y toca al bailarín: la app analiza el vídeo una vez en este dispositivo (no se sube) y comparte con el grupo solo el recorrido.'
        )}
      </p>

      <FollowNameDialog draft={draft} onDone={() => followUi.draft(null)} actions={actions} />
    </div>
  );
}

function MemberDot({ path }: { path: FollowPath }) {
  const members = useMembers().data;
  const member = path.member_id ? members?.find((m) => m.id === path.member_id) : undefined;
  if (!member) return null;
  return (
    <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', MEMBER_SWATCH[member.color].dot)} />
  );
}

/** After choosing the dancer: who it is (a member of the group, or any name) and «Seguir». */
function FollowNameDialog({
  draft,
  onDone,
  actions,
}: {
  draft: FollowDraft | null;
  onDone: () => void;
  actions: ReturnType<typeof useFollowActions>;
}) {
  const members = useMembers().data ?? [];
  const [memberId, setMemberId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!draft) return;
    setMemberId(null);
    setLabel('');
  }, [draft]);

  function chooseMember(m: Member) {
    setMemberId(m.id);
    setLabel(m.name.slice(0, FOLLOW_LABEL_MAX));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const name = label.trim();
    if (!draft || !name) return;
    const current = draft;
    onDone();
    if (current.mode === 'auto')
      void actions.startAuto({ at: current.at, pick: current.pick, label: name, memberId });
    else void actions.startManual({ at: current.at, box: current.box, label: name, memberId });
  }

  return (
    <Dialog
      open={draft != null}
      onClose={onDone}
      title="¿A quién sigues?"
      description={
        draft?.mode === 'auto'
          ? 'Se analiza el vídeo una vez en este dispositivo y puedes cancelar cuando quieras. El vídeo no se sube: solo se guarda el recorrido, para todo el grupo.'
          : 'El recorrido se guarda para todo el grupo. Después, ve a otros momentos y coloca el recuadro: el zoom irá de uno a otro.'
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {members.length > 0 && (
          <div role="radiogroup" aria-label="Miembro del grupo" className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <motion.button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={memberId === m.id}
                onClick={() => chooseMember(m)}
                whileTap={{ scale: 0.92 }}
                transition={jelly}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-[10px] border px-3 text-[14px] transition-colors',
                  memberId === m.id
                    ? 'border-washi bg-washi text-sumi-900'
                    : 'border-line text-washi-muted hover:text-washi',
                )}
              >
                <span aria-hidden className={cn('size-3 rounded-full', MEMBER_SWATCH[m.color].dot)} />
                {m.name}
              </motion.button>
            ))}
          </div>
        )}
        <Field
          data-autofocus="desktop"
          label={members.length ? 'Nombre (o elige a alguien del grupo)' : 'Nombre'}
          required
          maxLength={FOLLOW_LABEL_MAX}
          value={label}
          placeholder="p. ej. Minji, centro, la de rojo…"
          onChange={(e) => {
            setLabel(e.target.value);
            const match = members.find((m) => m.name === e.target.value.trim());
            setMemberId(match?.id ?? null);
          }}
        />
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!label.trim()}>
            {draft?.mode === 'auto' ? 'Seguir' : 'Guardar recorrido'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
