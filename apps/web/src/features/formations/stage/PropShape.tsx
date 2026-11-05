import type { FormationPropKind } from '@coverscape/shared';
import { PROP_SIZE } from '../propRules';

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
