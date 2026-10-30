import { motion } from 'motion/react';
import { Drum, Magnet, MapPin } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { jelly } from '@/lib/motion';
import { usePlayer } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';
import { addTap, beatsBetween, BPM_MAX, BPM_MIN, bpmFromTaps, MIN_TAPS, validBpm } from './beatRules';
import { formatMoment } from './formationRules';
import type { Wave } from './useWaveform';

/** REQ-09 · Beats (counts of eight numbered) and the file's wave, drawn under the editor's timeline. */
export function RhythmUnderlay({ span, bpm, firstBeat, wave }: { span: number; bpm: number | null; firstBeat: number | null; wave: Wave | null }) {
  const beats = useMemo(
    () => (validBpm(bpm) && span > 0 ? beatsBetween(bpm, firstBeat ?? 0, 0, span, 4000) : []),
    [bpm, firstBeat, span],
  );
  // Crowded (a long song on a phone): only the «1» of each eight keeps its tick.
  const dense = beats.length > 240;
  const wavePath = useMemo(() => {
    if (!wave || wave.peaks.length === 0 || span <= 0) return null;
    const n = wave.peaks.length;
    const step = wave.seconds / n;
    let d = '';
    wave.peaks.forEach((v, i) => {
      const t = wave.offset * -1 + i * step;
      if (t < 0 || t > span) return;
      const x = (t / span) * 1000;
      const h = Math.max(0.6, v * 46);
      d += `M${x.toFixed(2)} ${50 - h / 2}v${h.toFixed(2)}`;
    });
    return d;
  }, [wave, span]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {wavePath && (
        <svg data-wave viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
          <path d={wavePath} stroke="var(--color-washi-subtle)" strokeOpacity={0.45} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {beats.map((b) =>
        dense && b.count !== 1 ? null : (
          <div
            key={b.t}
            className="absolute top-0"
            style={{ left: `${(b.t / span) * 100}%` }}
          >
            <div className={b.count === 1 ? 'h-[68px] w-px bg-kin-300/45' : 'h-2.5 w-px bg-washi/25'} />
            {b.count === 1 && (
              <span className="tabular absolute left-0.5 top-0.5 font-mono text-[9px] font-bold text-kin-200/80">{b.eight + 1}</span>
            )}
          </div>
        ),
      )}
    </div>
  );
}

/** REQ-09 · BPM and first beat by hand, «Marcar al ritmo» and «Ajustar formaciones al tiempo». */
export function RhythmPanel({
  bpm,
  firstBeat,
  hasFile,
  wave,
  onSave,
  onSnap,
}: {
  bpm: number | null;
  firstBeat: number | null;
  hasFile: boolean;
  wave: Wave | null;
  onSave: (patch: { bpm: number | null; first_beat: number | null }) => Promise<boolean>;
  onSnap: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState(bpm != null ? String(bpm) : '');
  const [taps, setTaps] = useState<number[]>([]);
  const tapped = useRef(0);
  useEffect(() => setText(bpm != null ? String(bpm) : ''), [bpm]);

  async function saveBpm(value: string) {
    const trimmed = value.trim().replace(',', '.');
    if (!trimmed) {
      if (bpm != null) await onSave({ bpm: null, first_beat: null });
      return;
    }
    const n = Math.round(Number(trimmed) * 10) / 10;
    if (!validBpm(n)) {
      toast(`El ritmo va de ${BPM_MIN} a ${BPM_MAX} BPM.`, 'info');
      setText(bpm != null ? String(bpm) : '');
      return;
    }
    if (n !== bpm) await onSave({ bpm: n, first_beat: firstBeat ?? 0 });
  }

  function tap() {
    const now = performance.now() / 1000;
    const next = addTap(taps, now);
    setTaps(next);
    tapped.current = usePlayer.getState().time;
    // The first tap of a count marks the «1» on the video's clock (while it plays).
    const computed = bpmFromTaps(next);
    if (computed != null && next.length >= MIN_TAPS) setText(String(computed));
  }

  async function applyTaps() {
    const computed = bpmFromTaps(taps);
    if (computed == null) {
      toast(`Toca al menos ${MIN_TAPS} veces al compás.`, 'info');
      return;
    }
    // The beat nearest the last tap becomes a «1» if none was set.
    const ok = await onSave({ bpm: computed, first_beat: firstBeat ?? Math.max(0, Math.round(tapped.current * 100) / 100) });
    if (ok) {
      toast(`Ritmo: ${computed} BPM`, 'success');
      setTaps([]);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-washi-muted">BPM</span>
          <input
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={(e) => void saveBpm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            placeholder="—"
            className="well tabular h-11 w-20 rounded-[10px] px-3 font-mono text-[15px] text-washi outline-none focus:border-kin-300/70"
          />
        </label>
        <motion.button
          type="button"
          onClick={tap}
          whileTap={{ scale: 0.9 }}
          transition={jelly}
          aria-label={`Marcar al ritmo: toca al compás (${taps.length} toques)`}
          className="flex h-11 items-center gap-2 rounded-[10px] border border-line-strong bg-sumi-800 px-3 text-[13px] font-bold text-washi"
        >
          <Drum className="size-4" /> Marcar al ritmo
          {taps.length > 0 && <span className="tabular rounded-[5px] bg-kin-300 px-1.5 font-mono text-[11px] text-sumi-900">{taps.length}</span>}
        </motion.button>
        {taps.length >= MIN_TAPS && (
          <Button size="sm" onClick={() => void applyTaps()}>
            Usar {bpmFromTaps(taps) ?? '—'} BPM
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={!validBpm(bpm)}
          onClick={() => void onSave({ bpm, first_beat: Math.round(usePlayer.getState().time * 100) / 100 })}
        >
          <MapPin className="size-4" /> El «1» aquí
        </Button>
        <Button size="sm" variant="secondary" disabled={!validBpm(bpm)} onClick={onSnap}>
          <Magnet className="size-4" /> Ajustar formaciones al tiempo
        </Button>
      </div>
      <p className="text-[12px] text-washi-subtle">
        {validBpm(bpm) ? `Primer tiempo en ${formatMoment(firstBeat ?? 0)}. ` : 'Pon el BPM a mano o tócalo al compás. '}
        {hasFile ? (wave ? 'La onda del audio va bajo la línea de tiempo.' : 'La onda sale cuando el archivo está en este dispositivo.') : 'Con YouTube no hay onda del audio.'}
      </p>
    </div>
  );
}
