import {
  clampAdjust,
  type Clip,
  formatCents,
  formatSpeed,
  formatTime,
  parseCents,
  SONG_LEAD_LIMIT,
  songTimeAt,
  SYNC_ADJUST_LIMIT,
  VIDEO_SPEED_MAX,
  VIDEO_SPEED_MIN,
} from '@coverscape/shared';
import { Crosshair, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { CLIP_SWATCH } from '@/data/clips';
import { cn } from '@/lib/cn';
import { useReview } from '@/player/store';
import { signed } from './reviewControlParts';
import type { SaveStatus } from './reviewStageStore';
import { Chip, Group, Range, SaveNote } from './settingsParts';
import { songLength, type SyncPointControls } from './useSyncPoint';

/** The start's taps: a second either way, or a tenth. */
const STEPS = [
  { step: -1, text: '−1', label: '1 s antes' },
  { step: -0.1, text: '−0,1', label: '0,1 s antes' },
  { step: 0.1, text: '+0,1', label: '0,1 s después' },
  { step: 1, text: '+1', label: '1 s después' },
] as const;

/** The usual speeds, one tap each (a take danced to the song at 0,75×). */
const SPEEDS = [0.5, 0.75, 1, 1.25] as const;

const BIG = 'tabular font-mono text-[22px] font-bold leading-none text-washi';

/** The song's second, typed (m:ss,cc or seconds; a phone shows its number pad) and applied on Enter or leaving. */
function SongSecondField({ value, onCommit }: { value: number; onCommit: (seconds: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft == null) return;
    const parsed = parseCents(draft);
    setDraft(null);
    if (parsed != null) onCommit(parsed);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      enterKeyHint="done"
      autoComplete="off"
      aria-label="Segundo de la canción donde empieza (minutos:segundos,centésimas)"
      value={draft ?? formatCents(value)}
      onFocus={(e) => {
        setDraft(formatCents(value));
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
      className={cn(
        BIG,
        'well h-11 w-[8.5rem] min-w-0 rounded-[10px] px-2 text-right outline-none focus-visible:ring-2 focus-visible:ring-kin-300',
      )}
    />
  );
}

/** The chosen video's start: big readout, the line over its length (its position is the start) and the taps. */
function StartEditor({
  edit,
  sync,
  songClips,
  onSliding,
}: {
  edit: 'take' | 'original';
  sync: SyncPointControls;
  songClips: Clip[];
  onSliding?: (sliding: boolean) => void;
}) {
  const take = edit === 'take';
  const start = useReview((s) => (take ? s.timing.lead : s.timing.songStart));
  // The take's length, or the song's as the original shows it (a guess until the original knows it).
  const length = useReview((s) =>
    take
      ? Math.min(SONG_LEAD_LIMIT, Math.max(s.duration, s.timing.lead))
      : (songLength(s) ?? Math.max(240, s.timing.songStart + 60)),
  );
  const set = take ? sync.onLead : sync.onSongStart;
  const who = take ? 'la toma' : 'la canción';
  const markHere = () => {
    const r = useReview.getState();
    set(take ? r.time : songTimeAt(r.timing, r.time));
  };
  return (
    <div role="group" aria-label={`Inicio de ${who}`} className="space-y-1">
      <div className="flex min-h-11 items-center gap-2">
        <span className="shrink-0 text-[13px] text-washi-muted">Empieza en</span>
        {take ? (
          <span className={cn(BIG, 'flex-1 text-right')}>{formatCents(start)}</span>
        ) : (
          <span className="flex flex-1 justify-end">
            <SongSecondField value={start} onCommit={set} />
          </span>
        )}
        <Chip label={`Marcar aquí: ${who} empieza en este momento`} onClick={markHere}>
          <Crosshair className="size-4 text-kin-300" /> Aquí
        </Chip>
      </div>
      {/* The line over the whole video: where its thumb is, the video starts. */}
      <div className="flex">
        <Range
          label={`Inicio de ${who}`}
          hideLabel
          value={Math.min(start, length)}
          min={0}
          max={length}
          step={0.01}
          onChange={set}
          onSlide={onSliding}
          valueText={formatCents(start)}
        />
      </div>
      <div className="grid grid-cols-4 gap-1">
        {STEPS.map(({ step, text, label }) => (
          <Chip
            key={text}
            label={`Inicio de ${who} ${label}`}
            onClick={() => set(start + step)}
            disabled={step < 0 && start <= 0}
          >
            {text}
          </Chip>
        ))}
      </div>
      {!take && songClips.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto overscroll-x-contain scrollbar-none">
          <span className="shrink-0 pr-0.5 text-[12px] text-washi-subtle">Empezar en</span>
          {songClips.map((clip) => (
            <Chip
              key={clip.id}
              pressed={Math.abs(clip.start_seconds - start) < 0.01}
              label={`La canción empieza al empezar «${clip.name}» (${formatTime(clip.start_seconds)})`}
              onClick={() => set(clip.start_seconds)}
              className="font-medium"
            >
              <span
                aria-hidden
                className={cn('size-2 rotate-[-3deg] rounded-[2px]', CLIP_SWATCH[clip.color].dot)}
              />
              <span className="max-w-[9rem] truncate">{clip.name}</span>
              <span className="tabular font-mono text-[11px] opacity-70">
                {formatTime(clip.start_seconds)}
              </span>
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

/** The chosen video's own speed: − the usual ones + (the take's or the song's). */
function SpeedEditor({ edit, sync }: { edit: 'take' | 'original'; sync: SyncPointControls }) {
  const take = edit === 'take';
  const speed = useReview((s) => (take ? s.timing.takeSpeed : s.timing.speed));
  const set = (v: number) => sync.onSpeed(edit, Math.round(v * 100) / 100);
  const who = take ? 'de la toma' : 'de la canción';
  return (
    <div role="group" aria-label={`Velocidad ${who}`} className="space-y-1">
      <p className="flex items-baseline justify-between gap-2 text-[13px] text-washi-muted">
        <span>Velocidad {who}</span>
        <span className="tabular font-mono text-[15px] font-bold text-washi">{formatSpeed(speed)}</span>
      </p>
      <div className="grid grid-cols-6 gap-1">
        <Chip
          label={`Velocidad ${who} 0,05 menos`}
          onClick={() => set(speed - 0.05)}
          disabled={speed <= VIDEO_SPEED_MIN}
          className="px-1"
        >
          −
        </Chip>
        {SPEEDS.map((v) => (
          <Chip
            key={v}
            label={`Velocidad ${who} ${formatSpeed(v)}`}
            pressed={Math.abs(speed - v) < 0.001}
            onClick={() => set(v)}
            className="px-1"
          >
            {String(v).replace('.', ',')}
          </Chip>
        ))}
        <Chip
          label={`Velocidad ${who} 0,05 más`}
          onClick={() => set(speed + 0.05)}
          disabled={speed >= VIDEO_SPEED_MAX}
          className="px-1"
        >
          +
        </Chip>
      </div>
    </div>
  );
}

/**
 * «Sincronía»: where each video starts and at what speed — the take's start (a video from the gallery starts before
 * the dance) and its own speed, the song's start (a take of only part of the song) and its speed (a take danced to
 * the song at 0,75×) — chosen one video at a time, alone and big on the stage; then the fine sync (±0,3 s, the
 * phone's own delay). All saved with the take. Closing the settings goes back to both.
 */
export function ReviewSyncSettings({
  adjust,
  onAdjust,
  sync,
  songClips,
  status,
  onSliding,
}: {
  adjust: number;
  /** `settled` false while the slider moves; 'soon' for the ±0,01 taps. */
  onAdjust: (value: number, settled?: boolean | 'soon') => void;
  sync: SyncPointControls;
  songClips: Clip[];
  status: SaveStatus;
  onSliding?: (sliding: boolean) => void;
}) {
  const edit = useReview((s) => s.syncEdit);
  // Leaving the settings: both videos again.
  useEffect(() => () => useReview.getState().setSyncEdit(null), []);
  return (
    <Group title="Sincronía" aside={<SaveNote status={status} />}>
      <Segmented<'both' | 'take' | 'original'>
        label="Qué vídeo ajustar"
        layoutId="review-sync-edit"
        value={edit ?? 'both'}
        onChange={(v) => sync.onEdit(v === 'both' ? null : v)}
        options={[
          { value: 'both', label: 'Los dos' },
          { value: 'take', label: 'Toma' },
          { value: 'original', label: 'Canción' },
        ]}
        className="flex w-full [&>button]:flex-1"
      />
      {!edit && (
        <p className="text-[12px] leading-snug text-washi-subtle">
          Elige un vídeo, mueve la línea hasta donde empieza y pon su velocidad.
        </p>
      )}
      {edit && (
        <div
          key={edit}
          className="space-y-2 rounded-r-[10px] border-l-2 border-kin-300/60 bg-washi/[0.03] py-1.5 pl-2.5 pr-1.5"
        >
          <StartEditor edit={edit} sync={sync} songClips={songClips} onSliding={onSliding} />
          <SpeedEditor edit={edit} sync={sync} />
        </div>
      )}
      <div role="group" aria-label="Ajuste fino del original" className="pt-1">
        <p className="flex items-baseline justify-between gap-2 text-[13px] text-washi-muted">
          <span>Ajuste fino</span>
          <span className="tabular font-mono text-[13px] text-washi">{signed(adjust)}</span>
        </p>
        <div className="flex items-center gap-1">
          <Chip
            label="Retrasar el original 0,01 s"
            onClick={() => onAdjust(clampAdjust(adjust - 0.01), 'soon')}
          >
            −
          </Chip>
          <Range
            label="Ajuste fino"
            hideLabel
            value={adjust}
            min={-SYNC_ADJUST_LIMIT}
            max={SYNC_ADJUST_LIMIT}
            step={0.01}
            onChange={(v) => onAdjust(clampAdjust(v), false)}
            onCommit={() => onAdjust(adjust, true)}
            onSlide={onSliding}
            valueText={signed(adjust)}
          />
          <Chip
            label="Adelantar el original 0,01 s"
            onClick={() => onAdjust(clampAdjust(adjust + 0.01), 'soon')}
          >
            +
          </Chip>
          <Chip label="Poner a 0" onClick={() => onAdjust(0)} disabled={adjust === 0}>
            <RotateCcw className="size-4" />
          </Chip>
        </div>
      </div>
    </Group>
  );
}
