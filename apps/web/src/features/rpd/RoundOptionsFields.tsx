import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ElasticToggle } from '@/components/ui/ElasticToggle';
import { Segmented } from '@/components/ui/Segmented';
import { MAX_ROUND, PAUSE_MAX, type RoundOptions } from './roundRules';

const PAUSES = Array.from({ length: PAUSE_MAX + 1 }, (_, i) => i);

interface CountStepperProps {
  value: number;
  /** How many the source offers. */
  available: number;
  onChange: (count: number) => void;
  /** The visible label's id. */
  labelledBy: string;
}

/** «Uno menos» · N · «Uno más», within 1…what the source offers (and the round's top). */
export function CountStepper({ value, available, onChange, labelledBy }: CountStepperProps) {
  const max = Math.max(1, Math.min(MAX_ROUND, available));
  const shown = Math.min(value, max);
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="well inline-flex items-center gap-1 rounded-[12px] p-1"
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label="Uno menos"
        disabled={shown <= 1}
        onClick={() => onChange(Math.max(1, shown - 1))}
      >
        <Minus className="size-4" />
      </Button>
      <output
        aria-live="polite"
        className="tabular min-w-[3ch] text-center font-display text-[22px] font-bold text-washi"
      >
        {shown}
      </output>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Uno más"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}

interface RoundOptionsFieldsProps {
  value: RoundOptions;
  /** Only what changed (two quick taps never undo each other). */
  onChange: (patch: Partial<RoundOptions>) => void;
  /** «Número de clips» (a new round); a saved track plays all of its clips. */
  count?: { max: number } | null;
  idPrefix: string;
}

/** Número de clips · pausa (0–5 s) · cuenta atrás · espejo y velocidad de cada clip · título antes o después. */
export function RoundOptionsFields({ value, onChange, count, idPrefix }: RoundOptionsFieldsProps) {
  const set = onChange;
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {count && (
        <div>
          <p id={`${idPrefix}-count`} className="mb-1.5 text-[13px] font-medium text-washi-muted">
            Número de clips
          </p>
          <CountStepper
            value={value.count}
            available={count.max}
            onChange={(n) => set({ count: n })}
            labelledBy={`${idPrefix}-count`}
          />
          <p className="mt-1 text-[12px] text-washi-subtle">Hay {count.max} disponibles.</p>
        </div>
      )}
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-washi-muted">Pausa entre clips</p>
        <Segmented
          size="sm"
          label="Pausa entre clips"
          layoutId={`${idPrefix}-pause`}
          value={Math.round(value.pauseSeconds)}
          onChange={(s) => set({ pauseSeconds: s })}
          options={PAUSES.map((s) => ({
            value: s,
            label: `${s} s`,
            ariaLabel: s === 1 ? '1 segundo' : `${s} segundos`,
          }))}
        />
      </div>
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-washi-muted">Título</p>
        <Segmented
          size="sm"
          label="Cuándo se ve el título"
          layoutId={`${idPrefix}-title`}
          value={value.titleMode}
          onChange={(m) => set({ titleMode: m })}
          options={[
            { value: 'before', label: 'Antes de sonar' },
            { value: 'after', label: 'Después (adivinar)' },
          ]}
        />
      </div>
      <div className="flex flex-col gap-1 sm:col-span-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
        <ElasticToggle
          label="Cuenta atrás antes de cada clip"
          checked={value.countdown}
          onChange={(on) => set({ countdown: on })}
        />
        <ElasticToggle
          label="Espejo y velocidad de cada clip"
          checked={value.useClipSettings}
          onChange={(on) => set({ useClipSettings: on })}
        />
      </div>
    </div>
  );
}
