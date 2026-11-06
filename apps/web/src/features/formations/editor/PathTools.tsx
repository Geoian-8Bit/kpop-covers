import type { FormationPath } from '@coverscape/shared';
import { motion } from 'motion/react';
import { Check, FlipHorizontal2, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { ChoiceGroup, Hint, tool, toolIdle } from '../EditorTools';
import { curveShape, PATH_HINTS, PATH_LABELS, PATH_POINTS_MAX, type CurveShape, type PathChoice } from '../pathRules';

/**
 * REQ-08 · «Recorridos»: how somebody gets from the formation before to this one. Three numbered steps (a formation
 * that isn't the first, a person, a shape) and each shape drawn small, so «make it bend» is something you can see.
 */

const CHOICES: PathChoice[] = ['straight', 'curve', 'points', 'free'];

/** A small drawing of each kind: leaves bottom left, arrives top right. */
const SHAPES: Record<PathChoice, ReactNode> = {
  straight: <path d="M6 18 L34 7" />,
  curve: <path d="M6 18 Q14 -2 34 7" />,
  points: (
    <>
      <path d="M6 18 Q11 6 18 12 T34 7" />
      <circle cx={18} cy={12} r={2.2} fill="currentColor" stroke="none" />
    </>
  ),
  free: <path d="M6 18 C9 9 12 21 16 13 S23 5 26 12 S31 15 34 7" />,
};

function ShapeIcon({ kind }: { kind: PathChoice }) {
  return (
    <svg viewBox="0 0 40 24" className="h-6 w-10" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
      {SHAPES[kind]}
      <circle cx={6} cy={18} r={2.6} fill="currentColor" stroke="none" />
      <circle cx={34} cy={7} r={2.6} fill="none" strokeWidth={1.8} />
    </svg>
  );
}

function Step({ n, done, active, children }: { n: number; done: boolean; active: boolean; children: ReactNode }) {
  return (
    <li className={cn('flex items-start gap-2 text-[13px] leading-snug', active ? 'text-washi' : done ? 'text-washi-subtle' : 'text-washi-muted')}>
      <span
        aria-hidden
        className={cn(
          'mt-px grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-extrabold',
          done ? 'bg-ai-600 text-ai-100' : active ? 'bg-kin-300 text-sumi-900' : 'border border-line-strong text-washi-subtle',
        )}
      >
        {done ? <Check className="size-3" strokeWidth={3} /> : n}
      </span>
      <span className="min-w-0 flex-1">
        <span className="sr-only">{done ? 'Hecho: ' : `Paso ${n}: `}</span>
        {children}
      </span>
    </li>
  );
}

/** A tip that has to be seen (what to drag on the stage). */
function Callout({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-[10px] border border-kin-300/40 bg-kin-300/[0.08] px-2.5 py-2 text-[13px] leading-snug text-kin-200" aria-live="polite">
      <span aria-hidden className="size-3 shrink-0 rounded-full border-2 border-sumi-950 bg-washi shadow-[0_0_0_1.5px_var(--color-washi)]" />
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  );
}

function KindPicker({ value, disabled, onChange }: { value: PathChoice; disabled: boolean; onChange: (c: PathChoice) => void }) {
  return (
    <div role="radiogroup" aria-label="Forma del recorrido" className="well grid grid-cols-4 gap-0.5 rounded-[12px] p-1">
      {CHOICES.map((c) => {
        const on = c === value;
        return (
          <motion.button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            aria-description={PATH_HINTS[c]}
            title={PATH_HINTS[c]}
            disabled={disabled}
            onClick={() => onChange(c)}
            whileTap={disabled ? undefined : { scale: 0.9 }}
            transition={jelly}
            className={cn(
              'relative isolate flex h-[60px] min-w-0 flex-col items-center justify-center gap-1 rounded-[8px] px-0.5 text-[12px] transition-colors disabled:opacity-40',
              on ? 'font-bold text-sumi-900' : 'font-medium text-washi-muted hover:text-washi',
            )}
          >
            {on && (
              <motion.span
                layoutId="path-kind"
                transition={jelly}
                className="absolute inset-0 -z-10 rounded-[8px] bg-washi shadow-[0_4px_10px_-4px_rgb(0_0_0/0.8)]"
              />
            )}
            <ShapeIcon kind={c} />
            <span className="block max-w-full truncate leading-none">{PATH_LABELS[c]}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

export function PathTools({
  pathIndex,
  memberName,
  path,
  canBend,
  drawMode,
  selectedHandle,
  disabled,
  onChoose,
  onShape,
  onFlip,
  onCancelDraw,
  onAddPoint,
  onRemovePoint,
}: {
  pathIndex: number;
  memberName: string | null;
  path: FormationPath | undefined;
  /** The move is long enough to show a handle in the middle of its straight line. */
  canBend: boolean;
  drawMode: boolean;
  selectedHandle: number | null;
  disabled: boolean;
  onChoose: (choice: PathChoice) => void;
  onShape: (shape: CurveShape) => void;
  onFlip: () => void;
  onCancelDraw: () => void;
  onAddPoint: () => void;
  onRemovePoint: () => void;
}) {
  if (pathIndex < 1 || !memberName) {
    return (
      <ol className="space-y-1.5" aria-label="Cómo cambiar un recorrido">
        <Step n={1} done={pathIndex >= 1} active={pathIndex < 1}>
          {pathIndex >= 1
            ? `Formación ${pathIndex + 1}`
            : 'Ve a una formación que no sea la primera (flechas de arriba o la línea de tiempo).'}
        </Step>
        <Step n={2} done={false} active={pathIndex >= 1}>
          Toca a una persona en el escenario.
        </Step>
        <Step n={3} done={false} active={false}>
          Elige cómo llega: recto, en curva, por puntos o a mano.
        </Step>
      </ol>
    );
  }
  const shape = curveShape(path);
  const value: PathChoice = drawMode ? 'free' : (path?.kind ?? 'straight');
  return (
    <div className="space-y-2.5">
      <p className="text-[13px] text-washi">
        Cómo llega <span className="font-bold">{memberName}</span> a la formación {pathIndex + 1}
      </p>
      <KindPicker value={value} disabled={disabled} onChange={onChoose} />
      {drawMode && (
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-[13px] text-kin-200" aria-live="polite">
            Dibuja con el dedo en el escenario el camino de {memberName}: se suaviza solo.
          </p>
          <button type="button" className={cn(tool, toolIdle)} onClick={onCancelDraw}>
            Cancelar
          </button>
        </div>
      )}
      {!drawMode && !path && canBend && <Callout>Arrastra el punto blanco del centro de la línea para doblarla, o elige «Curva».</Callout>}
      {!drawMode && path?.kind === 'curve' && (
        <div className="space-y-1.5">
          <Callout>
            {shape === 's'
              ? 'Arrastra los dos puntos blancos del escenario para ajustar la S.'
              : 'Arrastra el punto blanco del escenario para doblarla más o menos.'}
          </Callout>
          <div className="flex flex-wrap items-center gap-1.5">
            <ChoiceGroup
              label="Forma de la curva"
              layoutId="curve-shape"
              className="min-w-[11rem] flex-1"
              value={shape}
              disabled={disabled}
              onChange={onShape}
              options={[
                { value: 'arc', label: 'Arco' },
                { value: 's', label: 'En S' },
              ]}
            />
            <button type="button" className={cn(tool, toolIdle)} disabled={disabled} onClick={onFlip}>
              <FlipHorizontal2 className="size-4" aria-hidden /> Al otro lado
            </button>
          </div>
        </div>
      )}
      {!drawMode && path?.kind === 'free' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={cn(tool, toolIdle)} disabled={disabled} onClick={() => onChoose('free')}>
            <Pencil className="size-4" aria-hidden /> Dibujar otra vez
          </button>
          <button type="button" className={cn(tool, toolIdle)} disabled={disabled} onClick={onFlip}>
            <FlipHorizontal2 className="size-4" aria-hidden /> Al otro lado
          </button>
        </div>
      )}
      {!drawMode && path?.kind === 'points' && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className={cn(tool, toolIdle)} disabled={disabled || path.points.length >= PATH_POINTS_MAX} onClick={onAddPoint}>
              <Plus className="size-4" aria-hidden /> Añadir punto
            </button>
            <button type="button" className={cn(tool, toolIdle)} disabled={disabled} onClick={onRemovePoint}>
              <Trash2 className="size-4" aria-hidden /> {selectedHandle != null ? `Quitar punto ${selectedHandle + 1}` : 'Quitar el último'}
            </button>
            <button type="button" className={cn(tool, toolIdle)} disabled={disabled} onClick={onFlip}>
              <FlipHorizontal2 className="size-4" aria-hidden /> Al otro lado
            </button>
          </div>
          <Hint>La línea pasa suave por cada punto. Arrástralos; toca uno para elegirlo.</Hint>
        </div>
      )}
    </div>
  );
}
