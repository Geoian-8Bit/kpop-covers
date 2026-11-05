import type { FormationPath, StagePoint } from '@coverscape/shared';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { FormationMember } from '@/data/formations';
import type { Clash } from '../clashRules';
import { mirrorPoint, type Stage } from '../formationRules';
import { personColors, CLASH } from './personStyle';
import { DOT, HANDLE, HIT, line, type HandleDrag } from './stageDrag';

/** REQ-27 · The stage's drawn layers, moved out of StageView as is (same elements, same order). */

export interface GridLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  major: boolean;
}

/** Floor, grid, centre line and the audience's edge. */
export function StageFloor({
  W,
  D,
  gridLines,
  drawing,
  mirrored,
}: {
  W: number;
  D: number;
  gridLines: GridLine[];
  drawing: boolean;
  mirrored: boolean;
}) {
  const centre = W / 2;
  return (
    <>
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
    </>
  );
}

/** F-2 · The next formation, faint, with a line to it. */
export function GhostLayer({
  ghostLayer,
  people,
}: {
  ghostLayer: { id: string; to: StagePoint; from: StagePoint | null }[];
  people: Map<string, FormationMember>;
}) {
  return (
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
  );
}

export interface Route {
  id: string;
  from: StagePoint;
  to: StagePoint;
  path: FormationPath | undefined;
  line: StagePoint[];
}

/** REQ-08 · Routes into the formation being edited, and the arms of the curve being edited. */
export function RouteLayer({
  routes,
  editing,
  pathMember,
  people,
  stage,
  mirrored,
}: {
  routes: Route[];
  editing: Route | null;
  pathMember: string | null;
  people: Map<string, FormationMember>;
  stage: Stage;
  mirrored: boolean;
}) {
  return (
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
      {/* The arms of a curve: from each end to its control point (an S: one arm per end). */}
      {editing?.path?.kind === 'curve' &&
        (editing.path.points.length >= 2
          ? [
              [editing.from, editing.path.points[0]!],
              [editing.path.points[1]!, editing.to],
            ]
          : [[editing.from, editing.path.points[0]!, editing.to]]
        ).map((arm, i) => (
          <polyline
            key={i}
            points={line(arm.map((p) => mirrorPoint(p, stage, mirrored)))}
            fill="none"
            stroke="var(--color-washi-subtle)"
            strokeWidth={0.02}
            strokeDasharray="0.06 0.06"
          />
        ))}
    </g>
  );
}

/** REQ-08 · Clashes: the stretch where two people pass too close. */
export function ClashLayer({ shownClashes, stage, mirrored }: { shownClashes: Clash[]; stage: Stage; mirrored: boolean }) {
  return (
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
  );
}

/** REQ-08 · Handles of the path being edited (above everybody: they are what the finger wants). */
export function PathHandles({
  path,
  handleDrag,
  selectedHandle,
  stage,
  mirrored,
  onHandleDown,
}: {
  path: FormationPath;
  handleDrag: HandleDrag | null;
  selectedHandle: number | null;
  stage: Stage;
  mirrored: boolean;
  onHandleDown: (index: number, point: StagePoint, e: ReactPointerEvent<SVGCircleElement>) => void;
}) {
  return (
    <g>
      {path.points.map((pt, i) => {
        const at = handleDrag?.index === i ? handleDrag.point : pt;
        const shown = mirrorPoint(at, stage, mirrored);
        const on = selectedHandle === i || handleDrag?.index === i;
        return (
          <g key={i} transform={`translate(${shown.x.toFixed(3)} ${shown.y.toFixed(3)})`}>
            <circle
              r={HIT * 0.8}
              fill="transparent"
              data-drag=""
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
  );
}
