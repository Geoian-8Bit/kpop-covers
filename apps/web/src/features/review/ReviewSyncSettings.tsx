import {
  clampAdjust,
  type Clip,
  formatCents,
  formatLead,
  formatTime,
  parseCents,
  SYNC_ADJUST_LIMIT,
} from '@coverscape/shared';
import { Crosshair, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { CLIP_SWATCH } from '@/data/clips';
import { cn } from '@/lib/cn';
import { useReview } from '@/player/store';
import { signed } from './reviewControlParts';
import type { SaveStatus } from './reviewStageStore';
import { Chip, Group, Range, SaveNote } from './settingsParts';

const LABEL = 'w-[5.5rem] shrink-0 text-[13px] text-washi-muted';

/** The song second's taps: a second either way, or a tenth. */
const SONG_STEPS = [
  { step: -1, text: '−1', label: 'Punto de la canción 1 s antes' },
  { step: -0.1, text: '−0,1', label: 'Punto de la canción 0,1 s antes' },
  { step: 0.1, text: '+0,1', label: 'Punto de la canción 0,1 s después' },
  { step: 1, text: '+1', label: 'Punto de la canción 1 s después' },
] as const;

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
      aria-label="Segundo de la canción (minutos:segundos,centésimas)"
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
      className="well tabular h-11 min-w-0 flex-1 rounded-[10px] px-3 text-right font-mono text-[15px] text-washi outline-none focus-visible:ring-2 focus-visible:ring-kin-300"
    />
  );
}

/**
 * «Sincronía»: the sync point — the take's second and the song's second where the same thing happens (a video from
 * the gallery starts before the dance; a take may cover only part of the song) — and the fine sync (±0,3 s, the
 * phone's own delay). All saved with the take.
 */
export function ReviewSyncSettings({
  adjust,
  onAdjust,
  onLead,
  onSongStart,
  songClips,
  status,
  onSliding,
}: {
  adjust: number;
  /** `settled` false while the slider moves; 'soon' for the ±0,01 taps. */
  onAdjust: (value: number, settled?: boolean | 'soon') => void;
  onLead: (seconds: number) => void;
  onSongStart: (seconds: number) => void;
  songClips: Clip[];
  status: SaveStatus;
  onSliding?: (sliding: boolean) => void;
}) {
  const lead = useReview((s) => s.timing.lead);
  const songStart = useReview((s) => s.timing.songStart);
  return (
    <Group title="Sincronía" aside={<SaveNote status={status} />}>
      <div
        role="group"
        aria-label="Punto de sincronía"
        className="space-y-1 rounded-r-[10px] border-l-2 border-kin-300/60 bg-washi/[0.03] py-1.5 pl-2.5 pr-1.5"
      >
        <p className="text-[12px] leading-snug text-washi-subtle">
          <strong className="font-bold text-washi-muted">Punto de sincronía.</strong> Pon el segundo de la
          toma y el de la canción en el que pasa lo mismo.
        </p>
        <div role="group" aria-label="Punto de sincronía en la toma">
          <p className="flex min-h-7 items-center gap-2">
            <span className={LABEL}>En la toma</span>
            <span className="tabular flex-1 text-right font-mono text-[15px] text-washi">
              {formatLead(lead)}
            </span>
          </p>
          <div className="flex items-center gap-1">
            <Chip
              label="Marcar aquí: el punto está en este momento de la toma"
              onClick={() => onLead(useReview.getState().time)}
              className="flex-1"
            >
              <Crosshair className="size-4 text-kin-300" /> Marcar aquí
            </Chip>
            <Chip
              label="Punto de la toma 0,1 s antes"
              onClick={() => onLead(lead - 0.1)}
              disabled={lead <= 0}
            >
              −0,1
            </Chip>
            <Chip label="Punto de la toma 0,1 s después" onClick={() => onLead(lead + 0.1)}>
              +0,1
            </Chip>
            <Chip label="Punto de la toma al principio" onClick={() => onLead(0)} disabled={lead === 0}>
              <RotateCcw className="size-4" />
            </Chip>
          </div>
        </div>
        <div role="group" aria-label="Punto de sincronía en la canción" className="pt-0.5">
          <div className="flex items-center gap-2">
            <span className={LABEL}>En la canción</span>
            <SongSecondField value={songStart} onCommit={onSongStart} />
          </div>
          <div className="mt-1 grid grid-cols-4 gap-1">
            {SONG_STEPS.map(({ step, text, label }) => (
              <Chip
                key={text}
                label={label}
                onClick={() => onSongStart(songStart + step)}
                disabled={step < 0 && songStart <= 0}
              >
                {text}
              </Chip>
            ))}
          </div>
          {songClips.length > 0 && (
            <div className="mt-1 flex items-center gap-1 overflow-x-auto overscroll-x-contain scrollbar-none">
              <span className="shrink-0 pr-0.5 text-[12px] text-washi-subtle">Empezar en</span>
              {songClips.map((clip) => {
                const on = Math.abs(clip.start_seconds - songStart) < 0.01;
                return (
                  <Chip
                    key={clip.id}
                    pressed={on}
                    label={`Punto de la canción al empezar «${clip.name}» (${formatTime(clip.start_seconds)})`}
                    onClick={() => onSongStart(clip.start_seconds)}
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
                );
              })}
            </div>
          )}
        </div>
      </div>
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
