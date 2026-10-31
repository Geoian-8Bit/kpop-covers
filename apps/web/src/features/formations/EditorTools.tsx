import type { FormationPath, FormationPropKind } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import {
  Armchair,
  Check,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  FlipHorizontal2,
  Layers,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Spline,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import type { FormationInput } from '@/data/formations';
import { cn } from '@/lib/cn';
import { jelly, snappy } from '@/lib/motion';
import { usePlayer } from '@/player/store';
import { formatMoment } from './formationRules';
import { curveShape, PATH_LABELS, PATH_POINTS_MAX, type CurveShape, type PathChoice } from './pathRules';
import { PROP_KINDS, PROP_LABEL_MAX, PROP_LABELS, PROP_ROTATE_STEP } from './propRules';
import { PropShape } from './StageView';

/**
 * REQ-06…13 · The editor's tools, grouped so the stage never leaves the screen: five tabs (a dock at the bottom of a
 * phone held upright, a row beside the stage when it lies on its side or on a big screen) and the panel of the open
 * one (a sheet above the dock, sized to the room under the stage, or inline in the side column).
 */

export type ToolTab = 'formation' | 'people' | 'paths' | 'props' | 'more';

export const TOOL_TABS: { id: ToolTab; label: string; icon: ReactNode }[] = [
  { id: 'formation', label: 'Formación', icon: <Layers className="size-5" aria-hidden /> },
  { id: 'people', label: 'Posiciones', icon: <UsersRound className="size-5" aria-hidden /> },
  { id: 'paths', label: 'Recorridos', icon: <Spline className="size-5" aria-hidden /> },
  { id: 'props', label: 'Atrezo', icon: <Armchair className="size-5" aria-hidden /> },
  { id: 'more', label: 'Más', icon: <Ellipsis className="size-5" aria-hidden /> },
];

export const toolTabLabel = (tab: ToolTab) => TOOL_TABS.find((t) => t.id === tab)!.label;

// ── Shared looks (44 px targets everywhere: fingers) ──
export const tool =
  'relative flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border px-3 text-[13px] font-bold transition-colors disabled:opacity-40';
export const toolIdle = 'border-line-strong bg-sumi-800 text-washi-muted hover:border-washi/40 hover:text-washi';
export const toolOn = 'border-ai-400/60 bg-ai-600/50 text-ai-200';
export const toolPrimary = 'border-shu-400/70 bg-shu-700 text-washi hover:bg-shu-600';

/** Side layout: the phone lies on its side, or a big screen. Else the dock + sheet of a phone held upright. */
const WIDE = '(orientation: landscape), (min-width: 64rem)';

function subscribeWide(listener: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

export function useWideLayout(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(WIDE).matches),
    () => false,
  );
}

/**
 * The room (px) between the bottom of the stage and the top of the dock: the sheet never grows over the stage. It
 * follows scrolling (the stage sticks to the top once scrolled to) and resizing.
 */
export function useSheetRoom(stageRef: RefObject<HTMLElement | null>, dockRef: RefObject<HTMLElement | null>, active: boolean): number {
  const [room, setRoom] = useState(320);
  useLayoutEffect(() => {
    if (!active) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const s = stageRef.current?.getBoundingClientRect();
      const d = dockRef.current?.getBoundingClientRect();
      if (!s || !d) return;
      setRoom(Math.max(140, Math.floor(d.top - Math.max(0, s.bottom) - 6)));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (stageRef.current) observer?.observe(stageRef.current);
    if (dockRef.current) observer?.observe(dockRef.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, [stageRef, dockRef, active]);
  return room;
}

/** The five tabs. Upright phone: a dock fixed at the bottom (tapping the open tab closes its sheet). */
export function ToolDock({
  tab,
  wide,
  onTab,
  dockRef,
  badges,
}: {
  tab: ToolTab | null;
  wide: boolean;
  onTab: (tab: ToolTab) => void;
  dockRef: RefObject<HTMLDivElement | null>;
  /** A small dot on a tab (clashes on «Recorridos»). */
  badges?: Partial<Record<ToolTab, boolean>>;
}) {
  return (
    <div
      ref={dockRef}
      className={cn(
        wide
          ? 'well rounded-[12px] p-1'
          : 'fixed inset-x-0 bottom-0 z-30 border-t border-line-strong bg-sumi-950/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_24px_-12px_rgb(0_0_0/0.8)] backdrop-blur-sm',
      )}
    >
      <div role="tablist" aria-label="Herramientas del editor" className={cn('mx-auto grid grid-cols-5 gap-0.5', !wide && 'max-w-[560px]')}>
        {TOOL_TABS.map((t) => {
          const on = tab === t.id;
          return (
            <motion.button
              key={t.id}
              type="button"
              role="tab"
              id={`tool-tab-${t.id}`}
              aria-selected={on}
              aria-controls="tool-panel"
              onClick={() => onTab(t.id)}
              whileTap={{ scale: 0.9 }}
              transition={jelly}
              className={cn(
                'relative isolate flex flex-col items-center justify-center gap-0.5 rounded-[10px] font-bold transition-colors',
                wide ? 'h-12 text-[11px]' : 'h-14 text-[11px]',
                on ? 'text-sumi-900' : 'text-washi-muted hover:text-washi',
              )}
            >
              {on && (
                <motion.span
                  layoutId={wide ? 'tool-tab-wide' : 'tool-tab-dock'}
                  transition={jelly}
                  className="absolute inset-0.5 -z-10 rounded-[9px] bg-washi shadow-[0_4px_10px_-4px_rgb(0_0_0/0.8)]"
                />
              )}
              {t.icon}
              <span className="leading-none">{t.label}</span>
              {badges?.[t.id] && <span aria-hidden className="absolute right-[22%] top-1.5 size-2 rounded-full bg-shu-400 ring-2 ring-sumi-950" />}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/** The panel's head: which formation the tools act on, a step to the one before / after, play, and (sheet) close. */
export function PanelHead({
  tab,
  list,
  currentIndex,
  onPrev,
  onNext,
  canPrev,
  canNext,
  onClose,
}: {
  tab: ToolTab;
  list: FormationInput[];
  /** The formation at the playhead (−1: between two). */
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  onClose?: () => void;
}) {
  const playing = usePlayer((s) => s.playing);
  const ready = usePlayer((s) => s.ready);
  const second = usePlayer((s) => Math.floor(s.time * 10) / 10);
  const where =
    currentIndex >= 0
      ? `Formación ${currentIndex + 1} de ${list.length}`
      : list.length
        ? 'Entre formaciones'
        : 'Sin formaciones';
  return (
    <div className="flex items-center gap-1 px-1.5 py-1.5">
      <IconButton label="Formación anterior" disabled={!canPrev} onClick={onPrev}>
        <ChevronLeft className="size-5" />
      </IconButton>
      <div className="min-w-0 flex-1 text-center leading-tight">
        <p className="truncate text-[13px] font-bold text-washi">{where}</p>
        <p className="tabular truncate font-mono text-[11px] text-washi-subtle">
          {toolTabLabel(tab)} · {formatMoment(second)}
        </p>
      </div>
      <IconButton label="Formación siguiente" disabled={!canNext} onClick={onNext}>
        <ChevronRight className="size-5" />
      </IconButton>
      <IconButton label={playing ? 'Pausa' : 'Reproducir'} disabled={!ready} onClick={() => usePlayer.getState().togglePlay()}>
        {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
      </IconButton>
      {onClose && (
        <IconButton label="Cerrar herramientas" onClick={onClose}>
          <X className="size-5" />
        </IconButton>
      )}
    </div>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.86 }}
      transition={jelly}
      className="grid size-11 shrink-0 place-items-center rounded-[10px] text-washi-muted hover:bg-washi/[0.06] hover:text-washi disabled:opacity-35"
    >
      {children}
    </motion.button>
  );
}

/** A square tool with an icon only (its name in `aria-label` and the tooltip). */
export function IconTool({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.88 }}
      transition={jelly}
      className={cn(tool, toolIdle, 'w-11 px-0')}
    >
      {children}
    </motion.button>
  );
}

/** A radio group with 44 px options (the shared Segmented is 32 px tall: too small for this many choices on a phone). */
export function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  layoutId,
  disabled,
  className,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  layoutId: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} aria-disabled={disabled || undefined} className={cn('well grid auto-cols-fr grid-flow-col gap-0.5 rounded-[12px] p-1', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <motion.button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            whileTap={disabled ? undefined : { scale: 0.9 }}
            transition={jelly}
            className={cn(
              'relative isolate h-10 min-w-0 rounded-[8px] px-1.5 text-[13px] font-medium transition-colors disabled:opacity-40',
              on ? 'font-bold text-sumi-900' : 'text-washi-muted hover:text-washi',
            )}
          >
            {on && (
              <motion.span
                layoutId={layoutId}
                transition={jelly}
                className="absolute inset-0 -z-10 rounded-[8px] bg-washi shadow-[0_4px_10px_-4px_rgb(0_0_0/0.8)]"
              />
            )}
            <span className="relative block truncate">{o.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

/** A quiet line of help under a tool. */
export function Hint({ children, live }: { children: ReactNode; live?: boolean }) {
  return (
    <p className="text-[12px] leading-snug text-washi-subtle" aria-live={live ? 'polite' : undefined}>
      {children}
    </p>
  );
}

// ───────────── REQ-08 · Recorridos ─────────────

export function PathTools({
  pathIndex,
  memberName,
  path,
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
  const choices: PathChoice[] = ['straight', 'curve', 'points', 'free'];
  if (pathIndex < 1) {
    return <Hint>Ve a una formación que no sea la primera (flechas de arriba o la línea de tiempo) para ver cómo llega cada persona.</Hint>;
  }
  if (!memberName) return <Hint>Toca a una persona en el escenario para elegir cómo llega a la formación {pathIndex + 1}.</Hint>;
  const shape = curveShape(path);
  return (
    <div className="space-y-2.5">
      <p className="text-[13px] text-washi">
        Recorrido de <span className="font-bold">{memberName}</span> hasta la formación {pathIndex + 1}
      </p>
      <ChoiceGroup
        label="Tipo de recorrido"
        layoutId="path-kind"
        value={drawMode ? 'free' : (path?.kind ?? 'straight')}
        disabled={disabled}
        onChange={onChoose}
        options={choices.map((c) => ({ value: c, label: PATH_LABELS[c] }))}
      />
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
      {!drawMode && path?.kind === 'curve' && (
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
            <FlipHorizontal2 className="size-4" aria-hidden /> Invertir
          </button>
          <Hint>{shape === 's' ? 'Arrastra los dos puntos blancos para ajustar la S.' : 'Arrastra el punto blanco para abrir o cerrar la curva.'}</Hint>
        </div>
      )}
      {!drawMode && path?.kind === 'free' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={cn(tool, toolIdle)} disabled={disabled} onClick={() => onChoose('free')}>
            <Pencil className="size-4" aria-hidden /> Dibujar otra vez
          </button>
          <button type="button" className={cn(tool, toolIdle)} disabled={disabled} onClick={onFlip}>
            <FlipHorizontal2 className="size-4" aria-hidden /> Invertir
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
              <FlipHorizontal2 className="size-4" aria-hidden /> Invertir
            </button>
          </div>
          <Hint>La línea pasa suave por cada punto. Arrástralos; toca uno para elegirlo.</Hint>
        </div>
      )}
    </div>
  );
}

// ───────────── REQ-10 · Atrezo ─────────────

export function PropTools({
  list,
  selectedProp,
  disabled,
  onAdd,
  onTurn,
  onRemove,
  onRelabel,
  onClose,
}: {
  list: FormationInput[];
  selectedProp: string | null;
  disabled: boolean;
  onAdd: (kind: FormationPropKind) => void;
  onTurn: (delta: number) => void;
  onRemove: () => void;
  onRelabel: (text: string) => void;
  onClose: () => void;
}) {
  const prop = useMemo(() => {
    if (!selectedProp) return null;
    for (const f of list) {
      const p = (f.props ?? []).find((x) => x.id === selectedProp);
      if (p) return p;
    }
    return null;
  }, [list, selectedProp]);
  return (
    <div className="space-y-2.5">
      <AnimatePresence initial={false} mode="popLayout">
        {prop ? (
          <motion.div
            key="selected"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={snappy}
            className="space-y-2 rounded-[12px] border border-kin-300/40 bg-kin-300/[0.06] p-2"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-auto pl-1 text-[13px] font-bold text-washi">{PROP_LABELS[prop.kind]}</span>
              <IconTool label={`Girar ${PROP_ROTATE_STEP}° a la izquierda`} disabled={disabled} onClick={() => onTurn(-PROP_ROTATE_STEP)}>
                <RotateCcw className="size-4" />
              </IconTool>
              <IconTool label={`Girar ${PROP_ROTATE_STEP}° a la derecha`} disabled={disabled} onClick={() => onTurn(PROP_ROTATE_STEP)}>
                <RotateCw className="size-4" />
              </IconTool>
              <IconTool label="Quitar desde aquí" disabled={disabled} onClick={onRemove}>
                <Trash2 className="size-4" />
              </IconTool>
              <button type="button" className={cn(tool, toolIdle)} onClick={onClose}>
                <Check className="size-4" aria-hidden /> Listo
              </button>
            </div>
            {prop.kind === 'mark' && (
              <label className="flex items-center gap-2 text-[13px] text-washi-muted">
                Texto
                <input
                  key={`${prop.id}-${prop.label ?? ''}`}
                  type="text"
                  defaultValue={prop.label ?? ''}
                  maxLength={PROP_LABEL_MAX}
                  placeholder="Salida, foco, centro…"
                  disabled={disabled}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== (prop.label ?? '')) onRelabel(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  className="well h-11 min-w-0 flex-1 rounded-[10px] px-3 text-[14px] text-washi outline-none focus:border-kin-300/70"
                />
              </label>
            )}
          </motion.div>
        ) : (
          <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Hint>Añade un objeto: se queda en el escenario desde esta formación. Tócalo para girarlo o quitarlo.</Hint>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="grid grid-cols-2 gap-1.5 min-[420px]:grid-cols-4">
        {PROP_KINDS.map((kind) => (
          <motion.button
            key={kind}
            type="button"
            disabled={disabled}
            onClick={() => onAdd(kind)}
            whileTap={disabled ? undefined : { scale: 0.9 }}
            transition={jelly}
            className={cn(tool, toolIdle, 'justify-start')}
            aria-label={`Añadir ${PROP_LABELS[kind].toLowerCase()}`}
          >
            <svg viewBox="-0.9 -0.9 1.8 1.8" className="size-5 shrink-0" aria-hidden>
              <g transform={kind === 'bench' || kind === 'step' ? 'scale(0.9)' : 'scale(1.3)'}>
                <PropShape kind={kind} />
              </g>
            </svg>
            {PROP_LABELS[kind]}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

/** Reveals the stage when a sheet opens on an upright phone: scrolls it up to where it sticks if the sheet would be cramped. */
export function useRevealStage(stageRef: RefObject<HTMLElement | null>, dockRef: RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const s = stageRef.current?.getBoundingClientRect();
      const d = dockRef.current?.getBoundingClientRect();
      if (!s || !d) return;
      const want = 300;
      const room = d.top - s.bottom;
      const stickTop = Number.parseFloat(getComputedStyle(stageRef.current!).top) || 0;
      if (room >= want || s.top <= stickTop + 1) return;
      window.scrollBy({ top: Math.min(s.top - stickTop, want - room), behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [stageRef, dockRef, open]);
}
