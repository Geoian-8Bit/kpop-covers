import {
  CLAP_SENSITIVITIES,
  clapThreshold,
  formatTime,
  levelToMeter,
  type ClapReading,
  type ClapSensitivity,
} from '@coverscape/shared';
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { X } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { jelly, soft } from '@/lib/motion';
import { CLAP_LABEL } from '../settings/model';
import { ClapTaiko } from './ClapFigures';

/** What the arming screen shows, fed with the detector's readings (from the microphone). */
export interface ClapUi {
  level: MotionValue<number>;
  threshold: MotionValue<number>;
  count: 0 | 1 | 2;
  hitKey: number;
  ready: boolean;
  take(reading: ClapReading): void;
  clear(): void;
}

export function useClapUi(sensitivity: ClapSensitivity): ClapUi {
  const level = useMotionValue(0);
  const threshold = useMotionValue(levelToMeter(clapThreshold(0.01, sensitivity)));
  const [count, setCount] = useState<0 | 1 | 2>(0);
  const [hitKey, setHitKey] = useState(0);
  const [ready, setReady] = useState(false);
  const countRef = useRef<0 | 1 | 2>(0);
  const readyRef = useRef(false);

  const take = useCallback(
    (r: ClapReading) => {
      // Fast up, gentle down: the meter is readable from a few metres away.
      level.set(Math.max(levelToMeter(r.level), level.get() - 0.025));
      threshold.set(levelToMeter(r.threshold));
      if (r.ready !== readyRef.current) {
        readyRef.current = r.ready;
        setReady(r.ready);
      }
      if (r.hit) setHitKey((k) => k + 1);
      const next = r.state === 'fired' ? 2 : r.state === 'first' ? 1 : 0;
      if (next !== countRef.current) {
        countRef.current = next;
        setCount(next);
      }
    },
    [level, threshold],
  );

  const clear = useCallback(() => {
    countRef.current = 0;
    readyRef.current = false;
    setCount(0);
    setReady(false);
    level.set(0);
  }, [level]);

  return { level, threshold, count, hitKey, ready, take, clear };
}

export interface ClapArmViewProps {
  ui: ClapUi;
  /** Asking for the microphone, listening, or the signal was heard. */
  phase: 'asking' | 'listening' | 'fired';
  sensitivity: ClapSensitivity;
  onSensitivity: (next: ClapSensitivity) => void;
  onCancel: () => void;
  /** Seconds before it disarms on its own; null to hide. */
  secondsLeft: number | null;
}

function statusText(phase: ClapArmViewProps['phase'], ready: boolean, count: 0 | 1 | 2): string {
  if (phase === 'asking') return 'Pidiendo el micrófono…';
  if (phase === 'fired' || count === 2) return 'Empieza la cuenta atrás.';
  if (!ready) return 'Escuchando la sala…';
  if (count === 1) return '¡Una! Falta la otra palmada.';
  return 'Colócate y da dos palmadas seguidas.';
}

/**
 * F7 · The armed recorder: big «Esperando señal…» (readable from where the dancer stands), the taiko drum, the live
 * level with the mark a clap must reach, the sensitivity and a big «Cancelar».
 */
export function ClapArmView({ ui, phase, sensitivity, onSensitivity, onCancel, secondsLeft }: ClapArmViewProps) {
  const reduce = useReducedMotion() ?? false;
  const fired = phase === 'fired' || ui.count === 2;
  const status = statusText(phase, ui.ready, ui.count);
  const meterRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  useMotionValueEvent(ui.level, 'change', (v) =>
    meterRef.current?.setAttribute('aria-valuenow', String(Math.round(v * 100))),
  );
  const fill = useTransform(ui.level, (v) => v);
  const mark = useTransform(ui.threshold, (v) => `${(v * 100).toFixed(1)}%`);

  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center gap-4 px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-[max(18px,env(safe-area-inset-top))] text-washi landscape:flex-row landscape:gap-8 landscape:pl-[max(16px,env(safe-area-inset-left))] landscape:pr-[max(16px,env(safe-area-inset-right))]">
      <div className="relative size-[min(62vw,34vh,300px)] shrink-0 landscape:size-[min(38vw,62vh,280px)]">
        <ClapTaiko
          level={ui.level}
          threshold={ui.threshold}
          count={fired ? 2 : ui.count}
          hitKey={ui.hitKey}
          reduce={reduce}
        />
      </div>

      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center landscape:gap-2">
        <h2
          className={cn(
            'font-display font-extrabold leading-none [text-shadow:0_4px_24px_rgb(0_0_0/0.6)]',
            'text-[clamp(30px,9vw,52px)] landscape:whitespace-nowrap landscape:text-[clamp(24px,4.2vw,34px)]',
            fired && 'text-kin-300',
          )}
        >
          {fired ? '¡Señal!' : 'Esperando señal…'}
        </h2>
        <p
          role="status"
          aria-live="polite"
          className="min-h-5 text-[15px] font-bold leading-snug text-washi-muted"
        >
          {status}
        </p>

        {/* The two claps, as two marks. */}
        <div aria-hidden className="flex items-center gap-3">
          {[1, 2].map((n) => (
            <motion.span
              key={n}
              initial={false}
              animate={{ scale: ui.count >= n || fired ? 1 : 0.8 }}
              transition={reduce ? { duration: 0 } : jelly}
              className={cn(
                'size-4 rounded-full border-2',
                fired
                  ? 'border-shu-400 bg-shu-500'
                  : ui.count >= n
                    ? 'border-kin-300 bg-kin-300'
                    : 'border-washi/35',
              )}
            />
          ))}
        </div>

        {/* Live level with the trigger mark. */}
        <div className="w-full">
          <div className="mb-1 flex items-baseline justify-between text-[12px] font-bold text-washi-subtle">
            <span id={labelId}>Nivel de sonido</span>
            <span>marca roja: nivel de una palmada</span>
          </div>
          <div
            ref={meterRef}
            role="meter"
            aria-labelledby={labelId}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={0}
            className="relative h-3 w-full overflow-hidden rounded-full bg-washi/15"
          >
            <motion.div
              style={{ scaleX: fill }}
              className={cn('absolute inset-0 origin-left rounded-full', fired ? 'bg-shu-400' : 'bg-kin-300')}
            />
            <motion.div
              style={{ left: mark }}
              className="absolute inset-y-0 w-[3px] -translate-x-1/2 bg-shu-500"
            />
          </div>
        </div>

        <div
          role="radiogroup"
          aria-label="Sensibilidad del aplauso"
          className="flex w-full items-center gap-2"
        >
          <span aria-hidden className="shrink-0 text-[12px] font-bold text-washi-subtle">
            Sensibilidad
          </span>
          <div className="well grid flex-1 grid-cols-3 gap-1 rounded-[12px] p-1">
            {CLAP_SENSITIVITIES.map((s) => {
              const active = s === sensitivity;
              return (
                <motion.button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onSensitivity(s)}
                  whileTap={{ scale: 0.92 }}
                  transition={jelly}
                  className={cn(
                    'relative isolate min-h-11 rounded-[9px] text-[14px] font-bold',
                    active ? 'text-sumi-900' : 'text-washi-muted hover:text-washi',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="clap-sens"
                      transition={jelly}
                      className="absolute inset-0 -z-10 rounded-[9px] bg-washi"
                    />
                  )}
                  {CLAP_LABEL[s]}
                </motion.button>
              );
            })}
          </div>
        </div>

        <Button
          autoFocus
          variant="secondary"
          size="lg"
          onClick={onCancel}
          className="mt-1 min-h-14 w-full max-w-xs text-[17px] landscape:mt-0 landscape:min-h-12"
        >
          <X className="size-5" /> Cancelar
        </Button>
        <motion.p
          initial={false}
          animate={{ opacity: secondsLeft != null ? 1 : 0 }}
          transition={soft}
          className="tabular min-h-4 text-[12px] text-washi-subtle"
        >
          {secondsLeft != null && `Se desarma solo en ${formatTime(secondsLeft)}`}
        </motion.p>
      </div>
    </div>
  );
}
