import { clampAdjust, formatLead, SYNC_ADJUST_LIMIT } from '@coverscape/shared';
import { Crosshair, RotateCcw } from 'lucide-react';
import { useReview } from '@/player/store';
import { signed } from './reviewControlParts';
import type { SaveStatus } from './reviewStageStore';
import { Chip, Group, Range, SaveNote } from './settingsParts';

/**
 * «Sincronía»: where the song starts in the take (a video from the gallery starts before the dance: «Marcar aquí»
 * takes the take's moment now) and the fine sync (±0,3 s, the phone's own delay). Both saved with the take.
 */
export function ReviewSyncSettings({
  adjust,
  onAdjust,
  onLead,
  status,
  onSliding,
}: {
  adjust: number;
  /** `settled` false while the slider moves; 'soon' for the ±0,01 taps. */
  onAdjust: (value: number, settled?: boolean | 'soon') => void;
  onLead: (seconds: number) => void;
  status: SaveStatus;
  onSliding?: (sliding: boolean) => void;
}) {
  const lead = useReview((s) => s.timing.lead);
  return (
    <Group title="Sincronía" aside={<SaveNote status={status} />}>
      <div role="group" aria-label="Inicio de la canción en la toma">
        <p className="flex items-baseline justify-between gap-2 text-[13px] text-washi-muted">
          <span>La canción empieza en</span>
          <span className="tabular font-mono text-[13px] text-washi">
            {formatLead(lead)} <span className="font-sans text-[12px] text-washi-subtle">de la toma</span>
          </span>
        </p>
        <div className="mt-1 flex items-center gap-1">
          <Chip
            label="Marcar aquí: la canción empieza en este momento de la toma"
            onClick={() => onLead(useReview.getState().time)}
            className="flex-1"
          >
            <Crosshair className="size-4 text-kin-300" /> Marcar aquí
          </Chip>
          <Chip
            label="La canción empieza 0,1 s antes"
            onClick={() => onLead(lead - 0.1)}
            disabled={lead <= 0}
          >
            −0,1
          </Chip>
          <Chip label="La canción empieza 0,1 s después" onClick={() => onLead(lead + 0.1)}>
            +0,1
          </Chip>
          <Chip
            label="La canción empieza al principio de la toma"
            onClick={() => onLead(0)}
            disabled={lead === 0}
          >
            <RotateCcw className="size-4" />
          </Chip>
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
