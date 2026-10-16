import { formatBytes, formatDuration, formatSpeed, formatTime, type Clip, type Member, type Video } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import {
  Cloud,
  CloudOff,
  CloudUpload,
  Download,
  Eraser,
  FlipHorizontal2,
  Play,
  Smartphone,
  Star,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { CLIP_SWATCH } from '@/data/clips';
import { useMe, useMembers } from '@/data/members';
import {
  deviceId,
  downloadTake,
  releaseTakeUrl,
  takeKeys,
  takeUrl,
  useAssignTakes,
  useDeleteTake,
  useSetBestTake,
  useShareTake,
  useSharedTakesBytes,
  useTakes,
  type TakeItem,
} from '@/data/takes';
import { MemberSeal } from '@/features/members/MembersUI';
import { loadKeptTake } from '@/features/record/takeStore';
import { cn } from '@/lib/cn';
import { jelly, snappy } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { useToast } from '@/providers/ToastProvider';
import { useQueryClient } from '@tanstack/react-query';
import { canReduceTakes, SHARE_PRIVACY_NOTICE } from './shareTake';
import {
  canDeleteTake,
  cleanupCandidates,
  filterTakes,
  isFiltered,
  maxShareSeconds,
  NO_FILTER,
  quotaState,
  shareBytes,
  shareVideoBitrate,
  sortTakes,
  takeDateLabel,
  takesCount,
  unnamedHere,
  whereLabel,
  wouldOverflow,
  type DateFilter,
  type TakeFilter,
} from './takeRules';

export type { TakeItem } from '@/data/takes';

interface TakesPanelProps {
  video: Video;
  clips: Clip[];
  /** Play a take. `url` is an object URL (this phone's copy) or a signed cloud URL: pass it to `releaseTakeUrl` on close. */
  onPlay: (take: TakeItem, url: string) => void;
}

const DATE_OPTIONS = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Esta semana' },
  { value: 'all', label: 'Todas' },
] as const satisfies readonly { value: DateFilter; label: string }[];

type Busy = { id: string; action: 'play' | 'download' } | null;

/** F3 / F4 · The «Tomas» tab of a song: saved takes, best one first, filters, play, star, download, share, delete. */
export function TakesPanel({ video, clips, onPlay }: TakesPanelProps) {
  const takes = useTakes(video.id);
  const members = useMembers();
  const me = useMe();
  const setBest = useSetBestTake();
  const remove = useDeleteTake();
  const assign = useAssignTakes();
  const toast = useToast();
  const queryClient = useQueryClient();
  const device = useMemo(() => deviceId(), []);

  const [filter, setFilter] = useState<TakeFilter>(NO_FILTER);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirmDelete, setConfirmDelete] = useState<TakeItem | null>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<TakeItem | null>(null);
  /** The last object URL handed to `onPlay`: released when another take plays. */
  const lastUrl = useRef<string | null>(null);

  const all = useMemo(() => takes.data ?? [], [takes.data]);
  const visible = useMemo(() => sortTakes(filterTakes(all, filter)), [all, filter]);
  const ctx = useMemo(() => ({ deviceId: device, meId: me?.id ?? null }), [device, me?.id]);
  const unnamed = useMemo(() => unnamedHere(all, device), [all, device]);
  const cleanable = useMemo(() => cleanupCandidates(visible, ctx), [visible, ctx]);

  const memberById = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m])), [members.data]);
  const clipById = useMemo(() => new Map(clips.map((c) => [c.id, c])), [clips]);

  const offline = takes.fetchStatus === 'paused' || (takes.isError && !navigator.onLine);

  async function play(take: TakeItem) {
    if (busy) return;
    setBusy({ id: take.id, action: 'play' });
    try {
      const url = await takeUrl(take);
      if (lastUrl.current !== url) releaseTakeUrl(lastUrl.current);
      lastUrl.current = url;
      onPlay(take, url);
    } catch (err) {
      toast(friendlyError(err), 'error');
      // Its copy may have gone (storage cleared): show where it really is.
      void queryClient.invalidateQueries({ queryKey: takeKeys.forVideo(video.id) });
    } finally {
      setBusy(null);
    }
  }

  async function download(take: TakeItem) {
    if (busy) return;
    setBusy({ id: take.id, action: 'download' });
    try {
      const result = await downloadTake(take, video);
      if (result === 'saved') toast(take.where === 'here' ? 'Descargando la toma' : 'Descargando la copia de la nube', 'success');
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setBusy(null);
    }
  }

  function toggleBest(take: TakeItem) {
    setBest
      .mutateAsync({ take, isBest: !take.is_best })
      .catch((err) => toast(friendlyError(err), 'error'));
  }

  function assignMine() {
    if (!me || !unnamed.length) return;
    assign.mutate(
      { takes: unnamed, memberId: me.id, all },
      {
        onSuccess: (n) => toast(n === 1 ? `Toma asignada a ${me.name}` : `${n} tomas asignadas a ${me.name}`, 'success'),
        onError: (err) => toast(friendlyError(err), 'error'),
      },
    );
  }

  const memberOf = (take: TakeItem): Member | null => (take.member_id ? (memberById.get(take.member_id) ?? null) : null);
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

      <CloudMeter />

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
        <div role="alert" className="mt-4 flex flex-col items-center gap-3 rounded-[12px] border border-enji-400/50 p-5 text-center">
          {offline ? <CloudOff className="size-6 text-washi-subtle" /> : <TriangleAlert className="size-6 text-enji-300" />}
          <p className="text-[14px] leading-relaxed text-washi-muted">
            {offline ? 'Sin conexión. Las tomas se cargan cuando vuelva la red.' : 'No se pudieron cargar las tomas.'}
          </p>
          <Button size="md" variant="secondary" onClick={() => void takes.refetch()} loading={takes.isFetching}>
            Reintentar
          </Button>
        </div>
      ) : all.length === 0 ? (
        <div className="mt-6 px-2 pb-4 text-center">
          <p className="font-display text-lg font-bold">Aún no hay tomas</p>
          <p className="mt-2 text-sm leading-relaxed text-washi-muted">
            Graba una con «Grabar» y pulsa «Guardar». Se queda en este móvil; si quieres, la compartes con el grupo.
          </p>
        </div>
      ) : (
        <>
          <Filters all={all} filter={filter} onChange={setFilter} memberById={memberById} clipById={clipById} meId={me?.id ?? null} />

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
                    member={memberOf(take)}
                    memberName={memberName(take)}
                    clip={take.clip_id ? (clipById.get(take.clip_id) ?? null) : null}
                    hasClipId={Boolean(take.clip_id)}
                    where={whereLabel(take, { deviceId: device, ownerName: take.member_id ? memberName(take) : null })}
                    deleteVerdict={canDeleteTake(take, ctx)}
                    busy={busy?.id === take.id ? busy.action : null}
                    anyBusy={busy != null}
                    onPlay={() => void play(take)}
                    onDownload={() => void download(take)}
                    onStar={() => toggleBest(take)}
                    onShare={() => setShareTarget(take)}
                    onDelete={() => setConfirmDelete(take)}
                    onRefused={(reason) => toast(reason, 'info')}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}

          {cleanable.length > 0 && (
            <div className="mt-4 flex justify-center">
              <Button variant="ghost" onClick={() => setCleanupOpen(true)} className="h-auto min-h-11 whitespace-normal py-2">
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

      <ShareDialog take={shareTarget} onClose={() => setShareTarget(null)} />
    </section>
  );
}

// ───────────── Cloud space ─────────────

function CloudMeter() {
  const bytes = useSharedTakesBytes();
  if (bytes.isPending) return <div className="skeleton mt-4 h-[52px] rounded-[12px]" />;
  if (bytes.isError) {
    return <p className="mt-4 text-[13px] text-washi-subtle">No se pudo saber cuánto ocupa la nube del grupo.</p>;
  }
  const q = quotaState(bytes.data.total);
  const pct = Math.round(q.ratio * 100);
  return (
    <div className="well mt-4 rounded-[12px] px-3.5 py-3">
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="flex min-w-0 items-center gap-1.5 text-washi-muted">
          <Cloud className="size-4 shrink-0" />{' '}
          <span className="truncate">
            Nube del grupo <span className="text-washi-subtle">· tomas {formatBytes(bytes.data.takes)}</span>
          </span>
        </span>
        <span className="tabular shrink-0 whitespace-nowrap font-mono text-[12px] text-washi">
          {formatBytes(q.used)} <span className="text-washi-subtle">de 1 GB</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label="Espacio usado de la nube del grupo (vídeos y tomas compartidas)"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct} %`}
        className="mt-2 h-2 overflow-hidden rounded-full bg-sumi-800"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none',
            q.warn ? 'bg-shu-500' : 'bg-ai-400',
          )}
          style={{ width: `${Math.max(q.used > 0 ? 1 : 0, pct)}%` }}
        />
      </div>
      {q.warn && (
        <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-snug text-shu-400">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {q.full
            ? 'La nube del grupo está llena: no se pueden compartir más tomas.'
            : `La nube del grupo va por el ${pct} %. Borrar tomas no libera espacio: avisad a quien administra la app para vaciarla.`}
        </p>
      )}
    </div>
  );
}

// ───────────── Filters ─────────────

function Chip({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      transition={jelly}
      className={cn(
        'flex min-h-11 shrink-0 items-center gap-2 rounded-[10px] px-3 text-[13px] transition-colors duration-200',
        active ? 'bg-washi font-bold text-sumi-900' : 'well font-medium text-washi-muted hover:text-washi',
      )}
    >
      {children}
    </motion.button>
  );
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="radiogroup" aria-label={label} className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5">
      {children}
    </div>
  );
}

function Filters({
  all,
  filter,
  onChange,
  memberById,
  clipById,
  meId,
}: {
  all: TakeItem[];
  filter: TakeFilter;
  onChange: (f: TakeFilter) => void;
  memberById: Map<string, Member>;
  clipById: Map<string, Clip>;
  meId: string | null;
}) {
  // Only people and clips that have takes here; the chosen «yo» first.
  const memberIds = useMemo(() => {
    const ids = [...new Set(all.map((t) => t.member_id).filter((id): id is string => Boolean(id)))];
    return ids.sort((a, b) => Number(b === meId) - Number(a === meId));
  }, [all, meId]);
  const hasUnnamed = all.some((t) => !t.member_id);
  const clipIds = useMemo(() => [...new Set(all.map((t) => t.clip_id).filter((id): id is string => Boolean(id)))], [all]);
  const hasNoClip = all.some((t) => !t.clip_id);
  const set = (patch: Partial<TakeFilter>) => onChange({ ...filter, ...patch });

  return (
    <div className="mt-4 space-y-2">
      {memberIds.length + Number(hasUnnamed) > 1 && (
        <ChipRow label="Filtrar por persona">
          <Chip active={filter.member === 'all'} onClick={() => set({ member: 'all' })}>
            Todos
          </Chip>
          {memberIds.map((id) => {
            const m = memberById.get(id) ?? null;
            return (
              <Chip key={id} active={filter.member === id} onClick={() => set({ member: id })}>
                <MemberSeal member={m} size="sm" />
                {m?.name ?? 'Antiguo miembro'}
                {id === meId && <span className="sr-only"> (tú)</span>}
              </Chip>
            );
          })}
          {hasUnnamed && (
            <Chip active={filter.member === 'none'} onClick={() => set({ member: 'none' })}>
              <MemberSeal member={null} size="sm" />
              Sin nombre
            </Chip>
          )}
        </ChipRow>
      )}
      {clipIds.length + Number(hasNoClip) > 1 && (
        <ChipRow label="Filtrar por clip">
          <Chip active={filter.clip === 'all'} onClick={() => set({ clip: 'all' })}>
            Todos los tramos
          </Chip>
          {clipIds.map((id) => {
            const c = clipById.get(id);
            return (
              <Chip key={id} active={filter.clip === id} onClick={() => set({ clip: id })}>
                <span aria-hidden className={cn('size-3 rotate-[-3deg] rounded-[2px]', c ? CLIP_SWATCH[c.color].dot : 'bg-sumi-600')} />
                {c?.name ?? 'Clip borrado'}
              </Chip>
            );
          })}
          {hasNoClip && (
            <Chip active={filter.clip === 'none'} onClick={() => set({ clip: 'none' })}>
              Sin clip
            </Chip>
          )}
        </ChipRow>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          options={DATE_OPTIONS}
          value={filter.date}
          onChange={(date) => set({ date })}
          layoutId="takes-date"
          label="Filtrar por fecha"
        />
        {isFiltered(filter) && (
          <button
            type="button"
            onClick={() => onChange(NO_FILTER)}
            className="min-h-11 rounded-[8px] px-2.5 text-[13px] font-bold text-kin-300 hover:bg-washi/10"
          >
            Quitar filtros
          </button>
        )}
      </div>
    </div>
  );
}

// ───────────── One take ─────────────

interface TakeRowProps {
  take: TakeItem;
  member: Member | null;
  memberName: string;
  clip: Clip | null;
  hasClipId: boolean;
  where: string;
  deleteVerdict: ReturnType<typeof canDeleteTake>;
  busy: 'play' | 'download' | null;
  anyBusy: boolean;
  onPlay: () => void;
  onDownload: () => void;
  onStar: () => void;
  onShare: () => void;
  onDelete: () => void;
  onRefused: (reason: string) => void;
}

const ELSEWHERE_REASON = 'Esta toma está en otro móvil: solo se puede ver allí, o si la comparte con el grupo.';

function TakeRow({
  take,
  member,
  memberName,
  clip,
  hasClipId,
  where,
  deleteVerdict,
  busy,
  anyBusy,
  onPlay,
  onDownload,
  onStar,
  onShare,
  onDelete,
  onRefused,
}: TakeRowProps) {
  const playable = take.where !== 'elsewhere';
  const shareReason = take.shared_path
    ? 'Ya está compartida con el grupo.'
    : take.where !== 'here'
      ? 'Solo se puede compartir desde el móvil donde está.'
      : !canReduceTakes()
        ? 'Este navegador no puede preparar la copia para compartir.'
        : null;
  const WhereIcon = take.where === 'here' ? Smartphone : take.where === 'cloud' ? Cloud : CloudOff;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -30, transition: { duration: 0.16 } }}
      transition={jelly}
      className={cn('well rounded-[12px] p-2.5', take.is_best && 'border-kin-300/45')}
    >
      <div className={cn('flex items-center gap-3', !playable && 'opacity-60')}>
        <span className="relative shrink-0">
          <MemberSeal member={member} />
          {take.is_best && (
            <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-sumi-900">
              <Star className="size-3.5 fill-kin-300 text-kin-300" aria-hidden />
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-[15px] font-bold">{memberName}</span>
            <span className="shrink-0 text-[13px] text-washi-muted">{takeDateLabel(take.recorded_at)}</span>
          </p>
          <p className="tabular mt-0.5 flex flex-wrap items-center gap-x-1.5 font-mono text-xs text-washi-muted">
            <span>{formatDuration(Number(take.duration_seconds))}</span>
            <span className="text-washi-subtle">·</span>
            <span>{formatSpeed(Number(take.speed))}</span>
            <span className="text-washi-subtle">·</span>
            <span>desde {formatTime(Number(take.song_start_seconds))}</span>
            {take.mirrored && <FlipHorizontal2 className="size-3 text-ai-300" aria-label="espejo" />}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]">
            {hasClipId && (
              <span className="flex min-w-0 items-center gap-1.5 text-washi-muted">
                <span aria-hidden className={cn('size-2.5 shrink-0 rotate-[-3deg] rounded-[2px]', clip ? CLIP_SWATCH[clip.color].dot : 'bg-sumi-600')} />
                <span className="truncate">{clip?.name ?? 'Clip borrado'}</span>
              </span>
            )}
            <span className={cn('flex items-center gap-1', take.where === 'here' ? 'text-ai-300' : take.where === 'cloud' ? 'text-washi-muted' : 'text-washi-subtle')}>
              <WhereIcon className="size-3.5" aria-hidden />
              {where}
            </span>
          </p>
        </div>
        <Button
          variant="washi"
          size="icon"
          aria-label={playable ? 'Reproducir la toma' : 'No se puede reproducir: está en otro móvil'}
          loading={busy === 'play'}
          disabled={!playable || (anyBusy && busy !== 'play')}
          onClick={onPlay}
        >
          {busy !== 'play' && <Play className="size-5 translate-x-px fill-current" />}
        </Button>
      </div>

      <div className="mt-2 flex items-center justify-end gap-0.5 border-t border-line pt-1.5">
        <motion.button
          type="button"
          aria-pressed={take.is_best}
          aria-label={take.is_best ? 'Quitar de mejor toma' : 'Marcar como mejor toma'}
          title="Mejor toma: una por persona y tramo"
          onClick={onStar}
          whileTap={{ scale: 0.7, rotate: -18 }}
          transition={jelly}
          className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[8px] px-2 text-[13px] font-medium text-washi-muted hover:bg-washi/[0.06] hover:text-washi"
        >
          <Star className={cn('size-[18px]', take.is_best && 'fill-kin-300 text-kin-300')} />
          <span className="hidden sm:inline">{take.is_best ? 'La mejor' : 'Mejor'}</span>
        </motion.button>
        <RowAction
          icon={busy === 'download' ? <Spinner className="size-4" /> : <Download className="size-[18px]" />}
          label="Descargar"
          ariaLabel={take.where === 'cloud' ? 'Descargar la copia de la nube (720p)' : 'Descargar la toma'}
          refused={playable ? null : ELSEWHERE_REASON}
          disabled={anyBusy}
          onClick={onDownload}
          onRefused={onRefused}
        />
        <RowAction
          icon={take.shared_path ? <Cloud className="size-[18px] text-ai-300" /> : <CloudUpload className="size-[18px]" />}
          label={take.shared_path ? 'Compartida' : 'Compartir'}
          ariaLabel={take.shared_path ? 'Ya está compartida con el grupo' : 'Compartir con el grupo'}
          refused={shareReason}
          onClick={onShare}
          onRefused={onRefused}
        />
        <RowAction
          icon={<Trash2 className="size-[18px]" />}
          label="Borrar"
          ariaLabel="Borrar la toma"
          refused={deleteVerdict.ok ? null : deleteVerdict.reason}
          danger
          onClick={onDelete}
          onRefused={onRefused}
        />
      </div>
    </motion.li>
  );
}

/**
 * An action that, when it can't run, stays focusable and says why on tap (a tooltip never shows on a phone).
 */
function RowAction({
  icon,
  label,
  ariaLabel,
  refused,
  danger,
  disabled,
  onClick,
  onRefused,
}: {
  icon: ReactNode;
  label: string;
  ariaLabel: string;
  refused: string | null;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  onRefused: (reason: string) => void;
}) {
  return (
    <motion.button
      type="button"
      aria-label={refused ? `${ariaLabel}. ${refused}` : ariaLabel}
      aria-disabled={refused != null || undefined}
      disabled={disabled}
      title={refused ?? undefined}
      onClick={() => (refused ? onRefused(refused) : onClick())}
      whileTap={refused || disabled ? undefined : { scale: 0.85 }}
      transition={jelly}
      className={cn(
        'flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[8px] px-2 text-[13px] font-medium transition-colors disabled:opacity-40',
        refused
          ? 'text-washi-subtle/50'
          : danger
            ? 'text-washi-muted hover:bg-washi/[0.06] hover:text-enji-300'
            : 'text-washi-muted hover:bg-washi/[0.06] hover:text-washi',
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </motion.button>
  );
}

// ───────────── Delete ─────────────

function DeleteDialog({
  take,
  onClose,
  onConfirm,
  pending,
}: {
  take: TakeItem | null;
  onClose: () => void;
  onConfirm: (take: TakeItem) => void;
  pending: boolean;
}) {
  // Keep the text while the dialog fades out.
  const last = useRef(take);
  if (take) last.current = take;
  const shown = take ?? last.current;
  const parts = [
    shown?.where === 'here' ? 'Se borra de este móvil y deja de verse en el grupo.' : 'Deja de verse en el grupo.',
    shown?.shared_path ? 'La copia de la nube deja de verse (sigue ocupando espacio hasta que se vacíe la nube).' : null,
    shown?.is_best ? 'Es una mejor toma (tiene estrella).' : null,
  ].filter(Boolean);
  return (
    <Dialog open={take != null} onClose={onClose} title="¿Borrar esta toma?" description={parts.join(' ')} size="sm" hideClose busy={pending}>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button variant="danger" loading={pending} onClick={() => take && onConfirm(take)}>
          <Trash2 className="size-4" /> Borrar
        </Button>
      </div>
    </Dialog>
  );
}

function CleanupDialog({
  open,
  onClose,
  candidates,
  keptBack,
  remove,
}: {
  open: boolean;
  onClose: () => void;
  candidates: TakeItem[];
  keptBack: number;
  remove: (take: TakeItem) => Promise<unknown>;
}) {
  const toast = useToast();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /** The list when the dialog opened: deleting must not chase a list that changes underneath. */
  const [snapshot, setSnapshot] = useState<TakeItem[]>([]);
  const stop = useRef(false);

  useEffect(() => {
    if (open) {
      setSnapshot(candidates);
      setProgress(null);
      stop.current = false;
    }
    // Only when it opens.
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    const list = snapshot;
    setProgress({ done: 0, total: list.length });
    let done = 0;
    for (const take of list) {
      if (stop.current) break;
      try {
        // One by one: the database refuses bulk deletes.
        await remove(take);
        done++;
        setProgress({ done, total: list.length });
      } catch (err) {
        toast(`${friendlyError(err)} Se borraron ${done} de ${list.length}.`, 'error');
        setProgress(null);
        onClose();
        return;
      }
    }
    setProgress(null);
    if (done) toast(done === 1 ? 'Borrada 1 toma sin estrella' : `Borradas ${done} tomas sin estrella`, 'success');
    onClose();
  }

  const n = snapshot.length;
  const running = progress != null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={n === 1 ? '¿Borrar 1 toma sin estrella?' : `¿Borrar ${n} tomas sin estrella?`}
      description={
        <>
          Se borran de una en una las de la lista que no tienen estrella. Las que tienen estrella se quedan.
          {keptBack > 0 && ` ${takesCount(keptBack)} sin estrella no ${keptBack === 1 ? 'es tuya ni está' : 'son tuyas ni están'} en este móvil: se ${keptBack === 1 ? 'queda' : 'quedan'}.`}
        </>
      }
      size="sm"
      hideClose
      busy={running}
    >
      {running && (
        <div className="mb-4" role="status">
          <p className="tabular text-[13px] text-washi-muted">
            Borrando {Math.min(progress.done + 1, progress.total)} de {progress.total}…
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-sumi-800">
            <div
              className="h-full rounded-full bg-shu-500 transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        {running ? (
          <Button variant="ghost" onClick={() => (stop.current = true)}>
            Parar
          </Button>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        )}
        <Button variant="danger" loading={running} disabled={!n} onClick={() => void run()}>
          <Trash2 className="size-4" /> Borrar {n}
        </Button>
      </div>
    </Dialog>
  );
}

// ───────────── Share ─────────────

function ShareDialog({ take, onClose }: { take: TakeItem | null; onClose: () => void }) {
  const share = useShareTake();
  const bytes = useSharedTakesBytes();
  const toast = useToast();
  const last = useRef(take);
  if (take) last.current = take;
  const shown = take ?? last.current;
  /** The take's video, loaded when the dialog opens so the tap on «Compartir» starts playing it at once (iPhone). */
  const [source, setSource] = useState<Blob | null | 'missing'>(null);

  const { reset } = share;
  useEffect(() => {
    if (!take) return;
    reset();
    setSource(null);
    let alive = true;
    void loadKeptTake(take.id).then((blob) => alive && setSource(blob ?? 'missing'));
    return () => {
      alive = false;
    };
  }, [take, reset]);

  function start() {
    if (!shown || !(source instanceof Blob)) return;
    // Straight from the tap, with the video already loaded: iPhone only lets a video with sound play so.
    void share.start(shown, source).then((row) => {
      if (!row) return;
      toast('Toma compartida con el grupo', 'success');
      onClose();
    });
  }

  const seconds = Number(shown?.duration_seconds) || 0;
  const bitrate = shareVideoBitrate(seconds);
  const estimate = shareBytes(seconds, bitrate ?? undefined);
  const tooLong = bitrate == null;
  const noRoom = !tooLong && bytes.data != null && wouldOverflow(bytes.data.total, estimate || 16_000_000);
  const working = share.busy;

  return (
    <Dialog open={take != null} onClose={onClose} title="Compartir con el grupo" busy={working}>
      <div className="space-y-4">
        <p className="flex items-start gap-2.5 rounded-[10px] border border-shu-400/50 p-3 text-[14px] leading-relaxed text-washi">
          <TriangleAlert className="mt-0.5 size-4.5 shrink-0 text-shu-400" />
          {SHARE_PRIVACY_NOTICE}
        </p>
        <p className="text-[14px] leading-relaxed text-washi-muted">
          Se sube una copia reducida a 720p
          {estimate > 0 ? <> de unos <span className="tabular font-mono text-washi">{formatBytes(estimate)}</span></> : null}. La
          original sigue en este móvil. Prepararla tarda lo mismo que dura la toma: deja la app abierta.
        </p>

        {tooLong && (
          <p role="alert" className="text-[14px] text-enji-300">
            Esta toma dura demasiado para compartirla: el máximo son unos {Math.floor(maxShareSeconds() / 60)} minutos.
          </p>
        )}
        {noRoom && (
          <p role="alert" className="text-[14px] text-enji-300">
            No queda sitio en la nube del grupo (1 GB). Avisad a quien administra la app para vaciarla.
          </p>
        )}
        {source === 'missing' && (
          <p role="alert" className="text-[14px] text-enji-300">
            Esta toma ya no está en este móvil.
          </p>
        )}

        <AnimatePresence initial={false}>
          {working && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={snappy}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center justify-between text-[13px] text-washi-muted">
                <span>
                  {share.phase === 'reducing' ? 'Reduciendo a 720p…' : share.phase === 'uploading' ? 'Subiendo a la nube…' : 'Guardando…'}
                </span>
                {share.phase === 'reducing' && (
                  <span className="tabular font-mono text-washi">{Math.round(share.progress * 100)} %</span>
                )}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-sumi-800">
                {share.phase === 'reducing' ? (
                  <div
                    className="h-full rounded-full bg-ai-400 transition-[width] duration-300 motion-reduce:transition-none"
                    style={{ width: `${Math.round(share.progress * 100)}%` }}
                  />
                ) : (
                  <div className="skeleton h-full w-full rounded-full bg-ai-700" />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {share.phase === 'error' && share.error && (
          <p role="alert" className="text-[14px] text-enji-300">
            {share.error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          {share.phase === 'reducing' ? (
            <Button variant="ghost" onClick={share.cancel}>
              Cancelar
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose} disabled={working}>
              {share.phase === 'error' ? 'Cerrar' : 'Ahora no'}
            </Button>
          )}
          <Button
            loading={working || source === null}
            disabled={!(source instanceof Blob) || tooLong || noRoom || working}
            onClick={start}
          >
            <CloudUpload className="size-4" /> {share.phase === 'error' ? 'Reintentar' : 'Compartir'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
