import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { CLIP_SWATCH } from '@/data/clips';
import type { TakeItem } from '@/data/takes';
import { MemberSeal } from '@/features/members/MembersUI';
import { TakeReactions } from '@/features/reactions/TakeReactions';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { type Clip, formatDuration, formatSpeed, formatTime, type Member } from '@coverscape/shared';
import {
  Cloud,
  CloudOff,
  CloudUpload,
  Columns2,
  Download,
  FlipHorizontal2,
  MessageSquare,
  Play,
  Smartphone,
  Star,
  Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { memo, type ReactNode } from 'react';
import { canReduceTakes } from './shareSupport';
import type { TakeRowActions } from './useTakeActions';
import { canDeleteTake, notesCount, takeDateLabel } from './takeRules';

// ───────────── One take ─────────────

interface TakeRowProps {
  take: TakeItem;
  /** The one «Repaso» opens: first, highlighted, with its «Repasar» button. */
  featured: boolean;
  /** Notes on this take (F6). */
  notes: number;
  member: Member | null;
  memberName: string;
  clip: Clip | null;
  hasClipId: boolean;
  where: string;
  deleteVerdict: ReturnType<typeof canDeleteTake>;
  busy: 'play' | 'download' | null;
  anyBusy: boolean;
  /** Stable for the panel's life (`useTakeActions`): called with this row's take. */
  actions: TakeRowActions;
}

const ELSEWHERE_REASON =
  'Esta toma está en otro móvil: solo se puede ver allí, o si la comparte con el grupo.';

/**
 * REQ-27 · One row of «Tomas», memoised: a change in another row (busy, a star…) doesn't repaint this one. The
 * actions are stable and the rest of the props are plain values or objects kept by the panel's maps.
 */
export const TakeRow = memo(TakeRowView, sameRow);

function sameRow(a: TakeRowProps, b: TakeRowProps): boolean {
  for (const key of Object.keys(a) as (keyof TakeRowProps)[]) {
    if (key === 'deleteVerdict') continue;
    if (!Object.is(a[key], b[key])) return false;
  }
  // A fresh verdict object every render: compare what it says.
  const va = a.deleteVerdict;
  const vb = b.deleteVerdict;
  return va.ok ? vb.ok : !vb.ok && va.reason === vb.reason;
}

function TakeRowView({
  take,
  featured,
  notes,
  member,
  memberName,
  clip,
  hasClipId,
  where,
  deleteVerdict,
  busy,
  anyBusy,
  actions,
}: TakeRowProps) {
  const onPlay = () => actions.play(take);
  const onDownload = () => actions.download(take);
  const onStar = () => actions.toggleBest(take);
  const onShare = () => actions.share(take);
  const onDelete = () => actions.remove(take);
  const onRefused = actions.refused;
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
      className={cn(
        'rounded-[12px] p-2.5',
        featured
          ? 'border border-kin-300/50 bg-sumi-850 shadow-[inset_0_1px_0_rgb(255_246_230/0.07)]'
          : 'well',
        !featured && take.is_best && 'border-kin-300/45',
      )}
    >
      {featured && (
        <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-shu-300">
          <Columns2 className="size-3.5" aria-hidden />
          Para repasar · {take.is_best ? 'la mejor' : 'la última'}
        </p>
      )}
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
            {/* The start as planned, to the second (the saved one may be a few hundredths earlier: where it really rolled). */}
            <span>desde {formatTime(Math.round(Number(take.song_start_seconds)))}</span>
            {take.mirrored && <FlipHorizontal2 className="size-3 text-ai-300" aria-label="espejo" />}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]">
            {hasClipId && (
              <span className="flex min-w-0 items-center gap-1.5 text-washi-muted">
                <span
                  aria-hidden
                  className={cn(
                    'size-2.5 shrink-0 rotate-[-3deg] rounded-[2px]',
                    clip ? CLIP_SWATCH[clip.color].dot : 'bg-sumi-600',
                  )}
                />
                <span className="truncate">{clip?.name ?? 'Clip borrado'}</span>
              </span>
            )}
            <span
              className={cn(
                'flex items-center gap-1',
                take.where === 'here'
                  ? 'text-ai-300'
                  : take.where === 'cloud'
                    ? 'text-washi-muted'
                    : 'text-washi-subtle',
              )}
            >
              <WhereIcon className="size-3.5" aria-hidden />
              {where}
            </span>
            {notes > 0 && (
              <span className="flex items-center gap-1 text-kin-300">
                <MessageSquare className="size-3.5" aria-hidden />
                {notesCount(notes)}
              </span>
            )}
          </p>
        </div>
        {!featured && (
          <Button
            variant="washi"
            size="icon"
            aria-label={playable ? 'Repasar la toma con el original' : 'No se puede ver: está en otro móvil'}
            loading={busy === 'play'}
            disabled={!playable || (anyBusy && busy !== 'play')}
            onClick={onPlay}
          >
            {busy !== 'play' && <Play className="size-5 translate-x-px fill-current" />}
          </Button>
        )}
      </div>

      {featured && (
        <Button
          className="mt-2.5 w-full"
          loading={busy === 'play'}
          disabled={!playable || (anyBusy && busy !== 'play')}
          onClick={onPlay}
          aria-label={
            playable
              ? `Repasar con el original: toma de ${memberName} (${takeDateLabel(take.recorded_at)})`
              : 'Repasar con el original: no se puede, está en otro móvil'
          }
        >
          {busy !== 'play' && <Columns2 className="size-4" />} Repasar con el original
        </Button>
      )}

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
          icon={
            take.shared_path ? (
              <Cloud className="size-[18px] text-ai-300" />
            ) : (
              <CloudUpload className="size-[18px]" />
            )
          }
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
      {/* F15 · Quick reactions, only on takes shared with the group. */}
      {take.shared_path && <TakeReactions take={take} />}
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
