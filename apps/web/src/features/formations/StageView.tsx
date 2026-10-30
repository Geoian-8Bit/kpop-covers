import type { FormationPositions, MemberColor, StagePoint } from '@coverscape/shared';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { FormationInput, FormationMember } from '@/data/formations';
import { cn } from '@/lib/cn';
import { usePlayer } from '@/player/store';
import {
  activeIndex,
  describePoint,
  memberTrack,
  mirrorPoint,
  nextIndex,
  nudgePoint,
  positionsAt,
  snapPoint,
  withDefaults,
  type Stage,
} from './formationRules';

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

export function personColors(person: FormationMember | undefined) {
  return !person || person.archived ? ARCHIVED : FILL[person.color];
}

export const initialOf = (name: string | undefined) => (name ?? '?').trim().charAt(0).toUpperCase() || '?';

const PAD = 0.7;
const AUDIENCE = 0.9;
const DOT = 0.3;
/** 0.5 m around the dot: about 44 px on a phone-wide 8 m stage. */
const HIT = 0.5;

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
}

/**
 * REQ-06 · The stage from above: grid, centre line, «Público» at the bottom and a point per participant. The points
 * are painted straight onto the SVG on every frame of the player's clock (no React render per frame).
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
}: StageViewProps) {
  const mirrored = usePlayer((s) => s.mirrored);
  const svgRef = useRef<SVGSVGElement>(null);
  const dotRefs = useRef(new Map<string, SVGGElement>());
  const drag = useRef<Drag | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const { width: W, depth: D } = stage;

  // Latest inputs for the painter (it runs from the player's subscription).
  const live = useRef({ list, memberIds, stage, mirrored, snap });
  live.current = { list, memberIds, stage, mirrored, snap };

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

  const paint = useCallback(() => {
    const { stage: s, mirrored: m } = live.current;
    const at = currentPositions();
    for (const [id, el] of dotRefs.current) {
      const p = at[id];
      if (!p) continue;
      const shown = mirrorPoint(p, s, m);
      el.setAttribute('transform', `translate(${shown.x.toFixed(3)} ${shown.y.toFixed(3)})`);
    }
  }, [currentPositions]);

  useLayoutEffect(() => {
    paint();
  }, [paint, list, memberIds, stage, mirrored]);

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

  function onDotDown(id: string, e: ReactPointerEvent<SVGGElement>) {
    if (e.button > 0) return;
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

  function onFloorDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button > 0 || drag.current) return;
    // A mouse always draws a box; a finger only in «Seleccionar» mode (else the page scrolls).
    if (e.pointerType !== 'mouse' && !selectMode) return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    const p = toStage(e.clientX, e.clientY);
    setBox({ pointerId: e.pointerId, a: p, b: p });
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
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
    if (drag.current?.pointerId === e.pointerId) {
      drag.current = null;
      setDragging(false);
      paint();
    }
    if (box?.pointerId === e.pointerId) setBox(null);
  }

  function onDotKey(id: string, e: React.KeyboardEvent<SVGGElement>) {
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

  const centre = W / 2;
  const boxRect = box && {
    x: Math.min(mirrorPoint(box.a, stage, mirrored).x, mirrorPoint(box.b, stage, mirrored).x),
    y: Math.min(box.a.y, box.b.y),
    w: Math.abs(box.a.x - box.b.x),
    h: Math.abs(box.a.y - box.b.y),
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`${-PAD} ${-PAD} ${W + PAD * 2} ${D + PAD + AUDIENCE}`}
      role="group"
      aria-label={`Escenario de ${W.toLocaleString('es-ES')} × ${D.toLocaleString('es-ES')} m, visto ${mirrored ? 'desde los bailarines' : 'desde el público'}`}
      onPointerDown={onFloorDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={cn('block h-auto w-full select-none', selectMode ? 'touch-none' : 'touch-pan-y', dragging && 'cursor-grabbing')}
    >
      {/* Floor */}
      <rect x={0} y={0} width={W} height={D} rx={0.12} fill="var(--color-sumi-850)" stroke="var(--color-rule)" strokeWidth={0.04} />
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
          points={track.map((p) => `${p.x},${p.y}`).join(' ')}
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

      {/* People */}
      {memberIds.map((id) => {
        const person = people.get(id);
        const c = personColors(person);
        const dim = focusMember != null && focusMember !== id;
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

/** The text alternative: where everybody is in the formation in force. */
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
