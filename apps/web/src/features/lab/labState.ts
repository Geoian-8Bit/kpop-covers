/**
 * Pure logic of the design lab: shapes, sanitising what comes back from storage and picking the variant
 * that applies. No React, no storage — covered by `labState.test.ts`.
 */

export interface DesignVariant {
  /** Stable id, stored on the device. Never rename one that has shipped: old choices fall back to the default. */
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

export interface DesignMoment {
  readonly id: string;
  /** Short reference from the design plan (e.g. «A1»), shown next to the name. */
  readonly code?: string;
  readonly name: string;
  readonly description: string;
  readonly variants: readonly DesignVariant[];
  /** The recommended variant: used when nothing valid is chosen or the lab is off. */
  readonly defaultVariant: string;
}

export interface LabState {
  enabled: boolean;
  /** momentId → variantId. Only known moments with known variants survive sanitising. */
  choices: Record<string, string>;
}

export const EMPTY_LAB: LabState = { enabled: false, choices: {} };

function findMoment(moments: readonly DesignMoment[], momentId: string): DesignMoment | undefined {
  return moments.find((moment) => moment.id === momentId);
}

export function isKnownVariant(
  moments: readonly DesignMoment[],
  momentId: string,
  variantId: unknown,
): boolean {
  return (
    typeof variantId === 'string' && !!findMoment(moments, momentId)?.variants.some((v) => v.id === variantId)
  );
}

/**
 * Whatever was stored (possibly by an older build, by hand, or corrupted) → a valid state.
 * `enabled` must be exactly `true`; choices for unknown moments or variants are dropped, so they resolve to
 * the default.
 */
export function sanitizeLab(raw: unknown, moments: readonly DesignMoment[]): LabState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { enabled: false, choices: {} };
  const record = raw as Record<string, unknown>;
  const choices: Record<string, string> = {};
  const rawChoices = record.choices;
  if (rawChoices && typeof rawChoices === 'object' && !Array.isArray(rawChoices)) {
    for (const moment of moments) {
      if (!Object.hasOwn(rawChoices, moment.id)) continue;
      const value = (rawChoices as Record<string, unknown>)[moment.id];
      if (isKnownVariant(moments, moment.id, value)) choices[moment.id] = value as string;
    }
  }
  return { enabled: record.enabled === true, choices };
}

/** Parses the stored JSON string; anything unreadable is the empty lab. */
export function parseLab(json: string | null, moments: readonly DesignMoment[]): LabState {
  if (json == null) return { enabled: false, choices: {} };
  try {
    return sanitizeLab(JSON.parse(json), moments);
  } catch {
    return { enabled: false, choices: {} };
  }
}

/**
 * The variant that applies to a moment: the saved choice (the lab only hides the picker), else the recommended
 * one. `undefined` only for a moment that isn't in the registry.
 */
export function resolveVariant(
  state: LabState,
  moments: readonly DesignMoment[],
  momentId: string,
): string | undefined {
  const moment = findMoment(moments, momentId);
  if (!moment) return undefined;
  const chosen = state.choices[momentId];
  if (isKnownVariant(moments, momentId, chosen)) return chosen;
  return moment.defaultVariant;
}

/** Registry self-check: unique moment ids, unique variant ids per moment, default among the variants. */
export function registryProblems(moments: readonly DesignMoment[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const moment of moments) {
    if (seen.has(moment.id)) problems.push(`momento repetido: ${moment.id}`);
    seen.add(moment.id);
    const ids = moment.variants.map((v) => v.id);
    if (ids.length === 0) problems.push(`${moment.id}: sin variantes`);
    if (new Set(ids).size !== ids.length) problems.push(`${moment.id}: variantes repetidas`);
    if (!ids.includes(moment.defaultVariant))
      problems.push(`${moment.id}: la variante por defecto no existe`);
  }
  return problems;
}
