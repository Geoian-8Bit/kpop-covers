import { Button } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { useMe, useMembers } from '@/data/members';
import { useNotes } from '@/data/notes';
import { deviceId, type TakeItem, useAssignTakes, useDeleteTake, useTakes } from '@/data/takes';
import { MemberSeal } from '@/features/members/MembersUI';
import { defaultReviewTake } from '@/features/review/reviewRules';
import { snappy } from '@/lib/motion';
import { PerfProbe } from '@/lib/perfProbe';
import { friendlyError } from '@/lib/supabase';
import { useToast } from '@/providers/ToastProvider';
import type { Clip, Member, Video } from '@coverscape/shared';
import { CloudOff, Eraser, TriangleAlert } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { CloudNotice } from './CloudNotice';
import { CleanupDialog, DeleteDialog } from './TakeDialogs';
import { Filters } from './TakeFilters';
import { TakeRow } from './TakeRow';
import { useTakeActions } from './useTakeActions';
import {
  canDeleteTake,
  cleanupCandidates,
  filterTakes,
  NO_FILTER,
  noteCountByTake,
  type TakeFilter,
  takeListing,
  uniqueTakes,
  unnamedHere,
  whereLabel,
} from './takeRules';

export type { TakeItem } from '@/data/takes';

/** REQ-23 · The share dialog and the 720p copy (`shareTake.ts`) load in their own chunk, when the panel opens. */
const ShareDialog = lazy(() => import('./ShareDialog').then((mod) => ({ default: mod.ShareDialog })));

interface TakesPanelProps {
  video: Video;
  clips: Clip[];
  /** Play a take. `url` is an object URL (this phone's copy) or a signed cloud URL: pass it to `releaseTakeUrl` on close. */
  onPlay: (take: TakeItem, url: string) => void;
}

/** F3 / F4 · The «Tomas» tab of a song: saved takes, best one first, filters, play, star, download, share, delete. */
export function TakesPanel({ video, clips, onPlay }: TakesPanelProps) {
  const takes = useTakes(video.id);
  const members = useMembers();
  const me = useMe();
  const remove = useDeleteTake();
  const assign = useAssignTakes();
  const toast = useToast();
  const device = useMemo(() => deviceId(), []);

  const [filter, setFilter] = useState<TakeFilter>(NO_FILTER);
  const [confirmDelete, setConfirmDelete] = useState<TakeItem | null>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<TakeItem | null>(null);

  const notes = useNotes(video.id);
  // 50 · Each take once, whatever the cache holds.
  const all = useMemo(() => uniqueTakes(takes.data ?? []), [takes.data]);
  const reviewTake = useMemo(() => defaultReviewTake(all, me?.id ?? null), [all, me?.id]);
  // The take «Repaso» opens leads the list, highlighted; it is not repeated below.
  const listing = useMemo(
    () => takeListing(filterTakes(all, filter), reviewTake?.id ?? null),
    [all, filter, reviewTake?.id],
  );
  const visible = useMemo(
    () => (listing.featured ? [listing.featured, ...listing.rest] : listing.rest),
    [listing],
  );
  const noteCounts = useMemo(() => noteCountByTake(notes.data ?? []), [notes.data]);
  const ctx = useMemo(() => ({ deviceId: device, meId: me?.id ?? null }), [device, me?.id]);
  const unnamed = useMemo(() => unnamedHere(all, device), [all, device]);
  const cleanable = useMemo(() => cleanupCandidates(visible, ctx), [visible, ctx]);

  const memberById = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m])), [members.data]);
  const clipById = useMemo(() => new Map(clips.map((c) => [c.id, c])), [clips]);

  const { busy, rowActions } = useTakeActions(video, onPlay, {
    share: setShareTarget,
    remove: setConfirmDelete,
  });

  const offline = takes.fetchStatus === 'paused' || (takes.isError && !navigator.onLine);

  function assignMine() {
    if (!me || !unnamed.length) return;
    assign.mutate(
      { takes: unnamed, memberId: me.id, all },
      {
        onSuccess: (n) =>
          toast(n === 1 ? `Toma asignada a ${me.name}` : `${n} tomas asignadas a ${me.name}`, 'success'),
        onError: (err) => toast(friendlyError(err), 'error'),
      },
    );
  }

  const memberOf = (take: TakeItem): Member | null =>
    take.member_id ? (memberById.get(take.member_id) ?? null) : null;
  const memberName = (take: TakeItem) =>
    take.member_id ? (memberById.get(take.member_id)?.name ?? 'Antiguo miembro') : 'Sin nombre';

  return (
    <section aria-labelledby="takes-title" className="flex flex-col p-5 sm:p-6">
      <SectionTitle
        id="takes-title"
        glyph="撮"
        aside={<span className="tabular text-sm font-medium text-washi-subtle">{all.length}</span>}
      >
        Tomas
      </SectionTitle>

      {/* 50 · The group's cloud only speaks up when it is filling. */}
      <CloudNotice />

      {me && unnamed.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={snappy}
          className="mt-3 flex flex-wrap items-center gap-3 rounded-[12px] border border-kin-300/30 p-3"
        >
          <MemberSeal member={me} size="sm" />
          <p className="min-w-[13rem] flex-1 text-[14px] leading-snug text-washi-muted">
            {unnamed.length === 1
              ? 'Hay 1 toma sin nombre grabada en este móvil.'
              : `Hay ${unnamed.length} tomas sin nombre grabadas en este móvil.`}
          </p>
          <Button
            size="md"
            variant="secondary"
            loading={assign.isPending}
            onClick={assignMine}
            className="h-auto min-h-11 w-full whitespace-normal py-2 text-[14px] sm:w-auto"
          >
            {unnamed.length === 1
              ? 'Asignarme la toma sin nombre de este móvil'
              : `Asignarme las ${unnamed.length} tomas sin nombre de este móvil`}
          </Button>
        </motion.div>
      )}

      {takes.isPending && !offline ? (
        <div className="mt-4 space-y-2" aria-busy="true" aria-label="Cargando tomas">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skeleton h-[118px] rounded-[12px]" />
          ))}
        </div>
      ) : (takes.isError || offline) && !takes.data ? (
        <div
          role="alert"
          className="mt-4 flex flex-col items-center gap-3 rounded-[12px] border border-enji-400/50 p-5 text-center"
        >
          {offline ? (
            <CloudOff className="size-6 text-washi-subtle" />
          ) : (
            <TriangleAlert className="size-6 text-enji-300" />
          )}
          <p className="text-[14px] leading-relaxed text-washi-muted">
            {offline
              ? 'Sin conexión. Las tomas se cargan cuando vuelva la red.'
              : 'No se pudieron cargar las tomas.'}
          </p>
          <Button
            size="md"
            variant="secondary"
            onClick={() => void takes.refetch()}
            loading={takes.isFetching}
          >
            Reintentar
          </Button>
        </div>
      ) : all.length === 0 ? (
        <div className="mt-6 px-2 pb-4 text-center">
          <p className="font-display text-lg font-bold">Aún no hay tomas</p>
          <p className="mt-2 text-sm leading-relaxed text-washi-muted">
            Graba una con «Grabar» y pulsa «Guardar». Se queda en este móvil; si quieres, la compartes con el
            grupo.
          </p>
        </div>
      ) : (
        <>
          <Filters
            all={all}
            filter={filter}
            onChange={setFilter}
            memberById={memberById}
            clipById={clipById}
            meId={me?.id ?? null}
          />

          {visible.length === 0 ? (
            <div className="mt-5 px-2 pb-2 text-center">
              <p className="font-display text-base font-bold">Ninguna toma con estos filtros</p>
              <Button variant="ghost" className="mt-2" onClick={() => setFilter(NO_FILTER)}>
                Quitar filtros
              </Button>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              <AnimatePresence initial={false}>
                {visible.map((take) => (
                  <TakeRow
                    key={take.id}
                    take={take}
                    featured={take.id === listing.featured?.id}
                    notes={noteCounts.get(take.id) ?? 0}
                    member={memberOf(take)}
                    memberName={memberName(take)}
                    clip={take.clip_id ? (clipById.get(take.clip_id) ?? null) : null}
                    hasClipId={Boolean(take.clip_id)}
                    where={whereLabel(take, {
                      deviceId: device,
                      ownerName: take.member_id ? memberName(take) : null,
                    })}
                    deleteVerdict={canDeleteTake(take, ctx)}
                    busy={busy?.id === take.id ? busy.action : null}
                    anyBusy={busy != null}
                    actions={rowActions}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}

          {cleanable.length > 0 && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="ghost"
                onClick={() => setCleanupOpen(true)}
                className="h-auto min-h-11 whitespace-normal py-2"
              >
                <Eraser className="size-4" /> Limpiar: borrar las que no tienen estrella ({cleanable.length})
              </Button>
            </div>
          )}
        </>
      )}

      <DeleteDialog
        take={confirmDelete}
        onClose={() => setConfirmDelete(null)}
        pending={remove.isPending}
        onConfirm={(take) =>
          remove.mutate(take, {
            onSuccess: () => {
              setConfirmDelete(null);
              toast('Toma borrada', 'success');
            },
            onError: (err) => toast(friendlyError(err), 'error'),
          })
        }
      />

      <CleanupDialog
        open={cleanupOpen}
        onClose={() => setCleanupOpen(false)}
        candidates={cleanable}
        keptBack={visible.filter((t) => !t.is_best).length - cleanable.length}
        remove={(take) => remove.mutateAsync(take)}
      />

      <PerfProbe id="ShareDialog">
        <Suspense fallback={null}>
          <ShareDialog take={shareTarget} onClose={() => setShareTarget(null)} />
        </Suspense>
      </PerfProbe>
    </section>
  );
}
