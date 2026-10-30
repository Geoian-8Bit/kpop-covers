import type { FormationPath, FormationPositions, FormationProp, FormationPropKind, MemberColor, StagePoint } from '@coverscape/shared';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { FormationInput, FormationMember } from '@/data/formations';
import { cn } from '@/lib/cn';
import { usePlayer } from '@/player/store';
import { clashingAt, type Clash } from './clashRules';
import {
  activeIndex,
  describePoint,
  formationAt,
  memberTrack,
  mirrorPoint,
  moveWindow,
  nextIndex,
  nudgePoint,
  positionsAt,
  propsAt,
  snapPoint,
  withDefaults,
  type Stage,
} from './formationRules';
import { movePathPoint, pathPolyline } from './pathRules';
import { PROP_LABELS, PROP_SIZE } from './propRules';

/** Member colours as the index.css tokens (SVG fills can't take the Tailwind bg classes). */
const FILL: Record<MemberColor, { fill: string; ink: string }> = {
  shu: { fill: 'var(--color-shu-500)', ink: 'var(--color-washi)' },
  ai: { fill: 'var(--color-ai-500)', ink: 'var(--color-washi)' },
  kin: { fill: 'var(--color-kin-400)', ink: 'var(--color-sumi-900)' },
  enji: { fill: 'var(--color-enji-500)', ink: 'var(--color-washi)' },
  murasaki: { fill: 'var(--color-murasaki)', ink: 'var(--color-washi)' },
  fuji: { fill: 'var(--color-fuji)', ink: 'var(--color-sumi-900)' },
  sakura: { fill: 'var(--color-sakura)', ink: 'var(--color-sumi-900)' },
  rokusho: { fill: 'var(--color-rokusho)', ink: 'var(--color-washi)' },
  kiji: { fill: 'var(--color-kiji-400)', ink: 'var(--color-sumi-900)' },
  washi: { fill: 'var(--color-washi)', ink: 'var(--color-sumi-900)' },
};
const ARCHIVED = { fill: 'var(--color-sumi-600)', ink: 'var(--color-washi-subtle)' };
const CLASH = 'var(--color-shu-400)';

export function personColors(person: FormationMember | undefined) {
  return !person || person.archived ? ARCHIVED : FILL[person.color];
}

export const initialOf = (name: string | undefined) => (name ?? '?').trim().charAt(0).toUpperCase() || '?';

const PAD = 0.7;
const AUDIENCE = 0.9;
const DOT = 0.3;
/** 0.5 m around the dot: about 44 px on a phone-wide 8 m stage. */
const HIT = 0.5;
const HANDLE = 0.2;

interface Drag {
  /** The point that was pressed. */
  id: string;
  pointerId: number;
  ids: string[];
  /** Where each dragged point started (stage metres) and where the pointer grabbed. */
  from: FormationPositions;
  grab: StagePoint;
  delta: StagePoint;
  moved: boolean;
  shift: boolean;
}

interface PropDrag {
  id: string;
  pointerId: number;
  from: StagePoint;
  grab: StagePoint;
  delta: StagePoint;
  moved: boolean;
}

interface HandleDrag {
  index: number;
  pointerId: number;
  point: StagePoint;
  moved: boolean;
}

interface Box {
  pointerId: number;
  a: StagePoint;
  b: StagePoint;
}

export interface StageViewProps {
  stage: Stage;
  memberIds: string[];
  people: Map<string, FormationMember>;
  list: FormationInput[];
  snap: boolean;
  /** «Mi recorrido»: this person stands out, the rest fade, their path is drawn. */
  focusMember: string | null;
  /** F-2 · The next formation, faint, with a line to it. */
  ghost: boolean;
  selection: string[];
  /** Touch «Seleccionar» mode: a drag on the floor draws a selection box. */
  selectMode: boolean;
  onDragStart: () => void;
  /** A drop (or arrow keys): the new place of each moved person, in stage metres. */
  onMove: (moved: FormationPositions) => void;
  onSelect: (ids: string[], additive: boolean) => void;
  /** REQ-08 · Clashes of the plan: their stretch and the two people turn red. */
  clashes: Clash[];
  /** REQ-08 · «Recorridos»: draw how everybody arrives at the formation `pathIndex` (−1: none). */
  showPaths: boolean;
  pathIndex: number;
  /** The person whose path is being edited (its points get handles). */
  pathMember: string | null;
  selectedHandle: number | null;
  onSelectHandle: (index: number | null) => void;
  onMovePathPoint: (index: number, to: StagePoint) => void;
  /** «A mano»: a drag on the stage draws the route instead of moving or selecting. */
  drawing: boolean;
  onStroke: (points: StagePoint[]) => void;
  /** REQ-10 · Props. */
  selectedProp: string | null;
  onSelectProp: (id: string | null) => void;
  onMoveProp: (id: string, to: StagePoint) => void;
  /** A save conflict: nothing on the stage can be moved, drawn or selected until «Recargar». */
  locked?: boolean;
}

/**
 * REQ-06 · The stage from above: grid, centre line, «Público» at the bottom and a point per participant. The points
 * (and the props, REQ-10) are painted straight onto the SVG on every frame of the player's clock (no React render per
 * frame). REQ-08 adds the routes into a formation, their handles, the hand-drawn line and the clashes in red.
 */
export function StageView({
  stage,
  memberIds,
  people,
  list,
  snap,
  focusMember,
  ghost,
  selection,
  selectMode,
  onDragStart,
  onMove,
  onSelect,
  clashes,
  showPaths,
  pathIndex,
  pathMember,
  selectedHandle,
  onSelectHandle,
  onMovePathPoint,
  drawing,
  onStroke,
  selectedProp,
  onSelectProp,
  onMoveProp,
  locked = false,
}: StageViewProps) {
  const mirrored = usePlayer((s) => s.mirrored);
  const svgRef = useRef<SVGSVGElement>(null);
  const dotRefs = useRef(new Map<string, SVGGElement>());
  const ringRefs = useRef(new Map<string, SVGCircleElement>());
  const propRefs = useRef(new Map<string, SVGGElement>());
  const drag = useRef<Drag | null>(null);
  const propDrag = useRef<PropDrag | null>(null);
  const [handleDrag, setHandleDrag] = useState<HandleDrag | null>(null);
  const [stroke, setStroke] = useState<{ pointerId: number; points: StagePoint[] } | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const { width: W, depth: D } = stage;

  // Latest inputs for the painter (it runs from the player's subscription).
  const live = useRef({ list, memberIds, stage, mirrored, snap, clashes });
  live.current = { list, memberIds, stage, mirrored, snap, clashes };

  /** Where everybody is drawn right now (stage metres): the moment's positions, plus a drag in progress. */
  const currentPositions = useCallback((): FormationPositions => {
    const { list: l, memberIds: ids, stage: s, snap: sn } = live.current;
    const at = positionsAt(l, usePlayer.getState().time, ids, s);
    const d = drag.current;
    if (d && d.moved) {
      for (const id of d.ids) {
        const from = d.from[id];
        if (!from) continue;
        at[id] = snapPoint({ x: from.x + d.delta.x, y: from.y + d.delta.y }, s, sn);
      }
    }
    return at;
  }, []);

  const currentProps = useCallback(() => {
    const { list: l, stage: s, snap: sn } = live.current;
    const frames = propsAt(l, usePlayer.getState().time);
    const d = propDrag.current;
    if (d && d.moved) {
      const p = snapPoint({ x: d.from.x + d.delta.x, y: d.from.y + d.delta.y }, s, sn);
      for (const f of frames) if (f.id === d.id) Object.assign(f, p, { opacity: 1 });
    }
    return frames;
  }, []);

  const paint = useCallback(() => {
    const { stage: s, mirrored: m, clashes: cl } = live.current;
    const at = currentPositions();
    const hot = clashingAt(cl, usePlayer.getState().time);
    for (const [id, el] of dotRefs.current) {
      const p = at[id];
      if (!p) continue;
      const shown = mirrorPoint(p, s, m);
      el.setAttribute('transform', `translate(${shown.x.toFixed(3)} ${shown.y.toFixed(3)})`);
      ringRefs.current.get(id)?.setAttribute('visibility', hot.has(id) ? 'visible' : 'hidden');
    }
    const frames = new Map(currentProps().map((f) => [f.id, f]));
    for (const [id, el] of propRefs.current) {
      const f = frames.get(id);
      if (!f || f.opacity <= 0.01) {
        el.setAttribute('opacity', '0');
        el.setAttribute('pointer-events', 'none');
        continue;
      }
      const shown = mirrorPoint(f, s, m);
      el.setAttribute('transform', `translate(${shown.x.toFixed(3)} ${shown.y.toFixed(3)})`);
      el.setAttribute('opacity', f.opacity.toFixed(2));
      el.setAttribute('pointer-events', f.opacity >= 0.5 ? 'auto' : 'none');
      // A mirrored stage turns the other way.
      el.querySelector('[data-rot]')?.setAttribute('transform', `rotate(${(m ? -f.rot : f.rot).toFixed(1)})`);
    }
  }, [currentPositions, currentProps]);

  useLayoutEffect(() => {
    paint();
  }, [paint, list, memberIds, stage, mirrored, clashes]);

  useEffect(
    () =>
      usePlayer.subscribe((s, prev) => {
        if (s.time !== prev.time || s.mirrored !== prev.mirrored) paint();
      }),
    [paint],
  );

  // ── Pointer → stage metres (undoing the mirror) ──
  function toStage(clientX: number, clientY: number): StagePoint {
    const svg = svgRef.current!;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: mirrored ? W - pt.x : pt.x, y: pt.y };
  }

  function startStroke(e: ReactPointerEvent<Element>) {
    e.preventDefault();
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    setStroke({ pointerId: e.pointerId, points: [toStage(e.clientX, e.clientY)] });
  }

  function onDotDown(id: string, e: ReactPointerEvent<SVGGElement>) {
    if (locked || e.button > 0) return;
    if (drawing) {
      startStroke(e);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    const at = currentPositions();
    // Dragging one of the selected points moves the whole selection.
    const ids = selection.includes(id) && selection.length > 1 ? selection : [id];
    const from: FormationPositions = {};
    for (const i of ids) if (at[i]) from[i] = at[i];
    drag.current = { id, pointerId: e.pointerId, ids, from, grab: toStage(e.clientX, e.clientY), delta: { x: 0, y: 0 }, moved: false, shift: e.shiftKey };
  }

  function onPropDown(id: string, e: ReactPointerEvent<SVGGElement>) {
    if (locked || e.button > 0) return;
    if (drawing) {
      startStroke(e);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const frame = currentProps().find((f) => f.id === id);
    if (!frame) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    propDrag.current = { id, pointerId: e.pointerId, from: { x: frame.x, y: frame.y }, grab: toStage(e.clientX, e.clientY), delta: { x: 0, y: 0 }, moved: false };
  }

  function onHandleDown(index: number, point: StagePoint, e: ReactPointerEvent<SVGCircleElement>) {
    if (locked || e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    setHandleDrag({ index, pointerId: e.pointerId, point, moved: false });
  }

  function onFloorDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (locked || e.button > 0 || drag.current || propDrag.current) return;
    if (drawing) {
      startStroke(e);
      return;
    }
    // A mouse always draws a box; a finger only in «Seleccionar» mode (else the page scrolls).
    if (e.pointerType !== 'mouse' && !selectMode) return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    const p = toStage(e.clientX, e.clientY);
    setBox({ pointerId: e.pointerId, a: p, b: p });
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (stroke && stroke.pointerId === e.pointerId) {
      const p = toStage(e.clientX, e.clientY);
      const last = stroke.points[stroke.points.length - 1]!;
      if (Math.hypot(p.x - last.x, p.y - last.y) >= 0.05) setStroke({ ...stroke, points: [...stroke.points, p] });
      return;
    }
    if (handleDrag && handleDrag.pointerId === e.pointerId) {
      setHandleDrag({ ...handleDrag, point: toStage(e.clientX, e.clientY), moved: true });
      return;
    }
    const pd = propDrag.current;
    if (pd && pd.pointerId === e.pointerId) {
      const p = toStage(e.clientX, e.clientY);
      pd.delta = { x: p.x - pd.grab.x, y: p.y - pd.grab.y };
      if (!pd.moved && Math.hypot(pd.delta.x, pd.delta.y) > 0.12) {
        pd.moved = true;
        setDragging(true);
        onDragStart();
      }
      if (pd.moved) paint();
      return;
    }
    const d = drag.current;
    if (d && d.pointerId === e.pointerId) {
      const p = toStage(e.clientX, e.clientY);
      d.delta = { x: p.x - d.grab.x, y: p.y - d.grab.y };
      if (!d.moved && Math.hypot(d.delta.x, d.delta.y) > 0.12) {
        d.moved = true;
        setDragging(true);
        onDragStart();
      }
      if (d.moved) paint();
      return;
    }
    if (box && box.pointerId === e.pointerId) setBox({ ...box, b: toStage(e.clientX, e.clientY) });
  }

  function onPointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    if (stroke && stroke.pointerId === e.pointerId) {
      setStroke(null);
      onStroke(stroke.points);
      return;
    }
    if (handleDrag && handleDrag.pointerId === e.pointerId) {
      setHandleDrag(null);
      onSelectHandle(handleDrag.index);
      if (handleDrag.moved) onMovePathPoint(handleDrag.index, handleDrag.point);
      return;
    }
    const pd = propDrag.current;
    if (pd && pd.pointerId === e.pointerId) {
      propDrag.current = null;
      setDragging(false);
      if (pd.moved) onMoveProp(pd.id, snapPoint({ x: pd.from.x + pd.delta.x, y: pd.from.y + pd.delta.y }, stage, snap));
      onSelectProp(pd.id);
      return;
    }
    const d = drag.current;
    if (d && d.pointerId === e.pointerId) {
      drag.current = null;
      setDragging(false);
      if (d.moved) {
        const moved: FormationPositions = {};
        for (const id of d.ids) {
          const from = d.from[id];
          if (from) moved[id] = snapPoint({ x: from.x + d.delta.x, y: from.y + d.delta.y }, stage, snap);
        }
        onMove(moved);
      } else {
        onSelect([d.id], d.shift);
      }
      return;
    }
    if (box && box.pointerId === e.pointerId) {
      const minX = Math.min(box.a.x, box.b.x);
      const maxX = Math.max(box.a.x, box.b.x);
      const minY = Math.min(box.a.y, box.b.y);
      const maxY = Math.max(box.a.y, box.b.y);
      setBox(null);
      const at = currentPositions();
      const ids = memberIds.filter((id) => {
        const p = at[id];
        return p && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
      });
      // A plain click on the floor clears the selection.
      onSelect(ids, e.shiftKey);
    }
  }

  function onPointerCancel(e: ReactPointerEvent<SVGSVGElement>) {
    if (drag.current?.pointerId === e.pointerId || propDrag.current?.pointerId === e.pointerId) {
      drag.current = null;
      propDrag.current = null;
      setDragging(false);
      paint();
    }
    if (box?.pointerId === e.pointerId) setBox(null);
    if (stroke?.pointerId === e.pointerId) setStroke(null);
    if (handleDrag?.pointerId === e.pointerId) setHandleDrag(null);
  }

  function onDotKey(id: string, e: React.KeyboardEvent<SVGGElement>) {
    if (locked) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect([id], e.shiftKey);
      return;
    }
    const at = currentPositions();
    const p = at[id];
    if (!p) return;
    const next = nudgePoint(p, e.key, stage, e.shiftKey, mirrored);
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    onDragStart();
    onMove({ [id]: next });
  }

  function onPropKey(id: string, e: React.KeyboardEvent<SVGGElement>) {
    if (locked) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectProp(id);
      return;
    }
    const f = currentProps().find((x) => x.id === id);
    if (!f) return;
    const next = nudgePoint(f, e.key, stage, e.shiftKey, mirrored);
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    onDragStart();
    onMoveProp(id, next);
  }

  // ── Static layers: grid, centre line, «Mi recorrido» path, ghost of the next formation ──
  const gridLines = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    const g = stage.grid > 0 ? stage.grid : 0.5;
    for (let x = 0, i = 0; x <= W + 1e-6; x += g, i++) lines.push({ x1: x, y1: 0, x2: x, y2: D, major: i % 2 === 0 });
    for (let y = 0, i = 0; y <= D + 1e-6; y += g, i++) lines.push({ x1: 0, y1: y, x2: W, y2: y, major: i % 2 === 0 });
    return lines;
  }, [W, D, stage.grid]);

  const track = useMemo(
    () => (focusMember ? memberTrack(list, focusMember, memberIds, stage).map((p) => mirrorPoint(p, stage, mirrored)) : []),
    [focusMember, list, memberIds, stage, mirrored],
  );

  const ghostIndex = usePlayer((s) => (ghost ? nextIndex(list, s.time) : -1));
  const fromIndex = usePlayer((s) => (ghost ? activeIndex(list, s.time) : -1));
  const ghostLayer = useMemo(() => {
    if (ghostIndex < 0) return null;
    const next = withDefaults(list[ghostIndex]!.positions, memberIds, stage);
    const fromList = fromIndex >= 0 && fromIndex !== ghostIndex ? list[fromIndex]! : null;
    const from = fromList ? withDefaults(fromList.positions, memberIds, stage) : null;
    return memberIds.map((id) => ({
      id,
      to: mirrorPoint(next[id]!, stage, mirrored),
      from: from ? mirrorPoint(from[id]!, stage, mirrored) : null,
    }));
  }, [ghostIndex, fromIndex, list, memberIds, stage, mirrored]);

  // ── REQ-08: routes into the formation being edited, and its handles ──
  const routes = useMemo(() => {
    if (!showPaths || pathIndex < 1 || !list[pathIndex]) return null;
    const from = withDefaults(list[pathIndex - 1]!.positions, memberIds, stage);
    const to = withDefaults(list[pathIndex]!.positions, memberIds, stage);
    return memberIds.map((id) => {
      let path: FormationPath | undefined = to[id]!.path;
      if (id === pathMember && path && handleDrag?.moved) path = movePathPoint(path, handleDrag.index, handleDrag.point, stage);
      return {
        id,
        from: from[id]!,
        to: to[id]!,
        path,
        line: pathPolyline(from[id]!, to[id]!, path).map((p) => mirrorPoint(p, stage, mirrored)),
      };
    });
  }, [showPaths, pathIndex, list, memberIds, stage, mirrored, pathMember, handleDrag]);
  const editing = routes?.find((r) => r.id === pathMember) ?? null;

  // ── REQ-08: the clashes of the move shown (the formation at the playhead, or the move under way) ──
  const clashTarget = usePlayer((s) => {
    const here = formationAt(list, s.time);
    if (here) return here.id;
    const n = nextIndex(list, s.time);
    if (n > 0 && s.time >= moveWindow(list[n - 1]!, list[n]!).start) return list[n]!.id;
    return null;
  });
  const shownClashes = useMemo(
    () => (clashTarget ? clashes.filter((c) => c.formationId === clashTarget) : []),
    [clashes, clashTarget],
  );

  // ── REQ-10: every prop that appears in the plan (kind and text are the same in every formation) ──
  const allProps = useMemo(() => {
    const seen = new Map<string, FormationProp>();
    for (const f of list) for (const p of f.props ?? []) seen.set(p.id, p);
    return [...seen.values()];
  }, [list]);

  const centre = W / 2;
  const boxRect = box && {
    x: Math.min(mirrorPoint(box.a, stage, mirrored).x, mirrorPoint(box.b, stage, mirrored).x),
    y: Math.min(box.a.y, box.b.y),
    w: Math.abs(box.a.x - box.b.x),
    h: Math.abs(box.a.y - box.b.y),
  };
  const line = (pts: StagePoint[]) => pts.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');

  return (
    <svg
      ref={svgRef}
      viewBox={`${-PAD} ${-PAD} ${W + PAD * 2} ${D + PAD + AUDIENCE}`}
      role="group"
      aria-label={`Escenario de ${W.toLocaleString('es-ES')} × ${D.toLocaleString('es-ES')} m, visto ${mirrored ? 'desde los bailarines' : 'desde el público'}`}
      aria-disabled={locked || undefined}
      onPointerDown={onFloorDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={cn(
        'block h-auto w-full select-none',
        selectMode || drawing ? 'touch-none' : 'touch-pan-y',
        drawing && 'cursor-crosshair',
        locked && 'cursor-not-allowed',
        dragging && 'cursor-grabbing',
      )}
    >
      {/* Floor */}
      <rect x={0} y={0} width={W} height={D} rx={0.12} fill="var(--color-sumi-850)" stroke={drawing ? 'var(--color-kin-300)' : 'var(--color-rule)'} strokeWidth={drawing ? 0.06 : 0.04} />
      <g aria-hidden>
        {gridLines.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke="var(--color-line)"
            strokeWidth={l.major ? 0.022 : 0.012}
            strokeOpacity={l.major ? 0.9 : 0.5}
          />
        ))}
        <line x1={centre} y1={0} x2={centre} y2={D} stroke="var(--color-kin-300)" strokeOpacity={0.45} strokeWidth={0.035} strokeDasharray="0.18 0.14" />
        {/* The audience's edge */}
        <line x1={0} y1={D} x2={W} y2={D} stroke="var(--color-shu-400)" strokeWidth={0.06} />
        <text x={centre} y={D + 0.62} textAnchor="middle" fontSize={0.34} fontWeight={700} letterSpacing={0.08} fill="var(--color-shu-300)">
          PÚBLICO
        </text>
        <text x={0} y={-0.24} fontSize={0.24} fill="var(--color-washi-subtle)">
          {mirrored ? 'Desde los bailarines' : 'Desde el público'}
        </text>
      </g>

      {/* REQ-10 · Props, under the people */}
      {allProps.map((p) => (
        <g
          key={p.id}
          ref={(el) => {
            if (el) propRefs.current.set(p.id, el);
            else propRefs.current.delete(p.id);
          }}
          role="button"
          tabIndex={0}
          aria-pressed={selectedProp === p.id}
          aria-label={`${PROP_LABELS[p.kind]}${p.label ? ` «${p.label}»` : ''}. Flechas para moverla.`}
          onPointerDown={(e) => onPropDown(p.id, e)}
          onKeyDown={(e) => onPropKey(p.id, e)}
          className="cursor-grab touch-none outline-none focus-visible:[&_[data-shape]]:stroke-kin-300"
        >
          <g data-rot="">
            <PropShape kind={p.kind} selected={selectedProp === p.id} />
          </g>
          {p.kind === 'mark' && p.label && (
            <text y={0.48} textAnchor="middle" fontSize={0.2} fontWeight={700} fill="var(--color-kin-200)" pointerEvents="none">
              {p.label}
            </text>
          )}
        </g>
      ))}

      {ghostLayer && (
        <g aria-hidden pointerEvents="none">
          {ghostLayer.map(({ id, to, from }) => {
            const c = personColors(people.get(id));
            return (
              <g key={id}>
                {from && Math.hypot(from.x - to.x, from.y - to.y) > 0.05 && (
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={c.fill} strokeOpacity={0.5} strokeWidth={0.04} strokeDasharray="0.12 0.1" />
                )}
                <circle cx={to.x} cy={to.y} r={DOT} fill={c.fill} fillOpacity={0.22} stroke={c.fill} strokeOpacity={0.6} strokeWidth={0.03} strokeDasharray="0.08 0.06" />
              </g>
            );
          })}
        </g>
      )}

      {track.length > 1 && (
        <polyline
          aria-hidden
          points={line(track)}
          fill="none"
          stroke={personColors(people.get(focusMember!)).fill}
          strokeWidth={0.07}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeOpacity={0.85}
          strokeDasharray="0.2 0.12"
          pointerEvents="none"
        />
      )}

      {/* REQ-08 · Routes into the formation being edited */}
      {routes && (
        <g aria-hidden pointerEvents="none">
          {routes.map((r) => {
            const c = personColors(people.get(r.id));
            const mine = r.id === pathMember;
            if (Math.hypot(r.from.x - r.to.x, r.from.y - r.to.y) < 0.05 && !r.path) return null;
            return (
              <polyline
                key={r.id}
                points={line(r.line)}
                fill="none"
                stroke={c.fill}
                strokeWidth={mine ? 0.08 : 0.05}
                strokeOpacity={pathMember ? (mine ? 0.95 : 0.25) : 0.7}
                strokeDasharray={r.path ? undefined : '0.14 0.1'}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
          {editing?.path?.kind === 'curve' && (
            <polyline
              points={line([editing.from, editing.path.points[0]!, editing.to].map((p) => mirrorPoint(p, stage, mirrored)))}
              fill="none"
              stroke="var(--color-washi-subtle)"
              strokeWidth={0.02}
              strokeDasharray="0.06 0.06"
            />
          )}
        </g>
      )}

      {/* REQ-08 · Clashes: the stretch where two people pass too close */}
      {shownClashes.length > 0 && (
        <g aria-hidden pointerEvents="none">
          {shownClashes.flatMap((c, i) =>
            [c.routeA, c.routeB].map((route, k) =>
              route.length > 1 ? (
                <polyline key={`${i}-${k}`} points={line(route.map((p) => mirrorPoint(p, stage, mirrored)))} fill="none" stroke={CLASH} strokeWidth={0.13} strokeOpacity={0.85} strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <circle key={`${i}-${k}`} cx={mirrorPoint(route[0]!, stage, mirrored).x} cy={route[0]!.y} r={0.1} fill={CLASH} />
              ),
            ),
          )}
        </g>
      )}

      {/* People */}
      {memberIds.map((id) => {
        const person = people.get(id);
        const c = personColors(person);
        const dim = (focusMember != null && focusMember !== id) || (pathMember != null && pathMember !== id);
        const selected = selection.includes(id);
        const name = person?.name ?? 'Alguien que ya no está';
        return (
          <g
            key={id}
            ref={(el) => {
              if (el) dotRefs.current.set(id, el);
              else dotRefs.current.delete(id);
            }}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={`${name}${person?.archived ? ' (ya no está en el grupo)' : ''}. Flechas para moverle, Mayúsculas para un paso fino.`}
            onPointerDown={(e) => onDotDown(id, e)}
            onKeyDown={(e) => onDotKey(id, e)}
            onFocus={() => setFocused(id)}
            onBlur={() => setFocused((f) => (f === id ? null : f))}
            opacity={dim ? 0.3 : 1}
            className="cursor-grab touch-none outline-none"
          >
            <circle r={HIT} fill="transparent" />
            <circle
              ref={(el) => {
                if (el) ringRefs.current.set(id, el);
                else ringRefs.current.delete(id);
              }}
              r={DOT + 0.14}
              fill="none"
              stroke={CLASH}
              strokeWidth={0.08}
              visibility="hidden"
            />
            {(selected || focused === id) && (
              <circle r={DOT + 0.1} fill="none" stroke={focused === id ? 'var(--color-kin-300)' : 'var(--color-washi)'} strokeWidth={0.05} strokeDasharray={selected && focused !== id ? '0.1 0.07' : undefined} />
            )}
            <circle r={DOT} fill={c.fill} stroke="var(--color-sumi-950)" strokeWidth={0.04} />
            <text y={0.11} textAnchor="middle" fontSize={0.32} fontWeight={800} fill={c.ink} pointerEvents="none">
              {initialOf(person?.name)}
            </text>
            <text y={DOT + 0.3} textAnchor="middle" fontSize={0.2} fontWeight={600} fill="var(--color-washi-muted)" pointerEvents="none">
              {shortName(name)}
            </text>
          </g>
        );
      })}

      {/* REQ-08 · Handles of the path being edited (above everybody: they are what the finger wants) */}
      {editing?.path && !drawing && editing.path.kind !== 'free' && (
        <g>
          {editing.path.points.map((pt, i) => {
            const at = handleDrag?.index === i ? handleDrag.point : pt;
            const shown = mirrorPoint(at, stage, mirrored);
            const on = selectedHandle === i || handleDrag?.index === i;
            return (
              <g key={i} transform={`translate(${shown.x.toFixed(3)} ${shown.y.toFixed(3)})`}>
                <circle
                  r={HIT * 0.8}
                  fill="transparent"
                  className="cursor-grab touch-none"
                  onPointerDown={(e) => onHandleDown(i, pt, e)}
                />
                <circle
                  r={HANDLE}
                  fill={on ? 'var(--color-kin-300)' : 'var(--color-washi)'}
                  stroke="var(--color-sumi-950)"
                  strokeWidth={0.04}
                  pointerEvents="none"
                />
              </g>
            );
          })}
        </g>
      )}

      {stroke && stroke.points.length > 1 && (
        <polyline
          aria-hidden
          points={line(stroke.points.map((p) => mirrorPoint(p, stage, mirrored)))}
          fill="none"
          stroke="var(--color-kin-300)"
          strokeWidth={0.07}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}

      {boxRect && (
        <rect
          x={boxRect.x}
          y={boxRect.y}
          width={boxRect.w}
          height={boxRect.h}
          fill="var(--color-kin-300)"
          fillOpacity={0.08}
          stroke="var(--color-kin-300)"
          strokeWidth={0.03}
          strokeDasharray="0.1 0.08"
          pointerEvents="none"
        />
      )}
    </svg>
  );
}

/**
 * REQ-10 · A prop seen from above, centred on 0,0 before turning: square-cornered and in neutral pigments, so it never
 * reads as a person (round, in a member's colour).
 */
export function PropShape({ kind, selected = false }: { kind: FormationPropKind; selected?: boolean }) {
  const { w, d } = PROP_SIZE[kind];
  const hit = { w: Math.max(w, 0.9), d: Math.max(d, 0.9) };
  return (
    <>
      <rect x={-hit.w / 2} y={-hit.d / 2} width={hit.w} height={hit.d} fill="transparent" />
      {selected && (
        <rect x={-w / 2 - 0.12} y={-d / 2 - 0.12} width={w + 0.24} height={d + 0.24} rx={0.06} fill="none" stroke="var(--color-kin-300)" strokeWidth={0.04} strokeDasharray="0.1 0.07" />
      )}
      {kind === 'chair' && (
        <>
          <rect data-shape x={-w / 2} y={-d / 2} width={w} height={d} rx={0.06} fill="var(--color-sumi-700)" stroke="var(--color-kiji-300)" strokeWidth={0.04} />
          {/* The back of the chair */}
          <rect x={-w / 2} y={-d / 2} width={w} height={0.11} rx={0.03} fill="var(--color-kiji-300)" />
        </>
      )}
      {kind === 'bench' && (
        <>
          <rect data-shape x={-w / 2} y={-d / 2} width={w} height={d} rx={0.05} fill="var(--color-sumi-700)" stroke="var(--color-kiji-300)" strokeWidth={0.04} />
          {[-0.4, 0, 0.4].map((x) => (
            <line key={x} x1={x} y1={-d / 2 + 0.06} x2={x} y2={d / 2 - 0.06} stroke="var(--color-kiji-300)" strokeOpacity={0.6} strokeWidth={0.025} />
          ))}
        </>
      )}
      {kind === 'step' && (
        <>
          <rect data-shape x={-w / 2} y={-d / 2} width={w} height={d} rx={0.03} fill="var(--color-sumi-600)" stroke="var(--color-washi-muted)" strokeWidth={0.04} />
          <line x1={-w / 2 + 0.05} y1={0} x2={w / 2 - 0.05} y2={0} stroke="var(--color-washi-muted)" strokeWidth={0.025} />
          <line x1={-w / 2 + 0.05} y1={d / 4} x2={w / 2 - 0.05} y2={d / 4} stroke="var(--color-washi-muted)" strokeOpacity={0.6} strokeWidth={0.02} />
        </>
      )}
      {kind === 'mark' && (
        <g data-shape stroke="var(--color-kin-300)" strokeWidth={0.07} strokeLinecap="round">
          <line x1={-w / 2} y1={-d / 2} x2={w / 2} y2={d / 2} />
          <line x1={w / 2} y1={-d / 2} x2={-w / 2} y2={d / 2} />
        </g>
      )}
    </>
  );
}

/** The text alternative: where everybody (and every prop) is in the formation in force. */
export function PositionsList({
  list,
  memberIds,
  people,
  stage,
  index,
}: {
  list: FormationInput[];
  memberIds: string[];
  people: Map<string, FormationMember>;
  stage: Stage;
  index: number;
}) {
  const f = index >= 0 ? list[index] : null;
  const positions = f ? withDefaults(f.positions, memberIds, stage) : null;
  const props = f?.props ?? [];
  return (
    <details className="px-4 pb-3 text-sm text-washi-muted sm:px-5">
      <summary className="flex h-11 cursor-pointer items-center font-medium text-washi-muted hover:text-washi">Posiciones en texto</summary>
      {positions ? (
        <ul className="space-y-1 pb-2">
          {memberIds.map((id) => (
            <li key={id}>
              <span className="font-medium text-washi">{people.get(id)?.name ?? 'Alguien que ya no está'}</span>: {describePoint(positions[id]!, stage)}
            </li>
          ))}
          {props.map((p) => (
            <li key={p.id}>
              <span className="font-medium text-washi">
                {PROP_LABELS[p.kind]}
                {p.label ? ` «${p.label}»` : ''}
              </span>
              : {describePoint(p, stage)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="pb-2">Aún no hay formaciones.</p>
      )}
    </details>
  );
}

/** The name under a point: its first word, cut to fit between neighbours. */
export function shortName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return first.length > 7 ? `${first.slice(0, 6)}…` : first;
}
