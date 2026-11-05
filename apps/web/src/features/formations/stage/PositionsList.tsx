import type { FormationInput, FormationMember } from '@/data/formations';
import { describePoint, withDefaults, type Stage } from '../formationRules';
import { PROP_LABELS } from '../propRules';

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
