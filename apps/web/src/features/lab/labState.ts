import { create } from 'zustand';
import { MOMENT_IDS } from './labIds';
import type { LabMoment } from './types';

/**
 * Design lab state: which variant this device uses for each moment (momentId → variantId), kept in localStorage.
 * The functions taking `moments` are pure (covered by `labState.test.ts`); the store below binds them to the
 * moments' ids (`labIds.ts`: the full registry, with every name and description, stays in the lab's own chunk).
 */

export const STORAGE_KEY = 'oneshoot.lab.v2';

export type LabChoices = Record<string, string>;

type MomentShape = Pick<LabMoment, 'id' | 'defaultVariant'> & { variants: readonly { id: string }[] };

function findMoment<M extends MomentShape>(moments: readonly M[], momentId: string): M | undefined {
  return moments.find((moment) => moment.id === momentId);
}

export function isKnownVariant(moments: readonly MomentShape[], momentId: string, variantId: unknown): boolean {
  return typeof variantId === 'string' && !!findMoment(moments, momentId)?.variants.some((v) => v.id === variantId);
}

/**
 * Whatever was stored (by an older build, by hand, or corrupted) → valid choices. Unknown moments, unknown variants
 * and non-string values are dropped, so they resolve to the default.
 */
export function sanitizeChoices(raw: unknown, moments: readonly MomentShape[]): LabChoices {
  const choices: LabChoices = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return choices;
  for (const moment of moments) {
    if (!Object.hasOwn(raw, moment.id)) continue;
    const value = (raw as Record<string, unknown>)[moment.id];
    if (isKnownVariant(moments, moment.id, value)) choices[moment.id] = value as string;
  }
  return choices;
}

/** Parses the stored JSON string; anything unreadable is «nothing chosen». */
export function parseChoices(json: string | null | undefined, moments: readonly MomentShape[]): LabChoices {
  if (json == null) return {};
  try {
    return sanitizeChoices(JSON.parse(json), moments);
  } catch {
    return {};
  }
}

/** The variant that applies: the saved choice, else the moment's default. `undefined` only for an unknown moment. */
export function resolveVariant(
  choices: LabChoices,
  moments: readonly MomentShape[],
  momentId: string,
): string | undefined {
  const moment = findMoment(moments, momentId);
  if (!moment) return undefined;
  const chosen = choices[momentId];
  return isKnownVariant(moments, momentId, chosen) ? chosen : moment.defaultVariant;
}

/** Registry self-check: unique moment ids, unique variant ids per moment, default among the variants. */
export function registryProblems(moments: readonly MomentShape[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const moment of moments) {
    if (seen.has(moment.id)) problems.push(`momento repetido: ${moment.id}`);
    seen.add(moment.id);
    const ids = moment.variants.map((v) => v.id);
    if (ids.length === 0) problems.push(`${moment.id}: sin variantes`);
    if (new Set(ids).size !== ids.length) problems.push(`${moment.id}: variantes repetidas`);
    if (!ids.includes(moment.defaultVariant)) problems.push(`${moment.id}: la variante por defecto no existe`);
  }
  return problems;
}

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem'>;

/** Reads the choices from a storage that may be missing or throw (private mode, blocked site data). */
export function readChoices(storage: ReadableStorage | undefined, moments: readonly MomentShape[]): LabChoices {
  try {
    return parseChoices(storage?.getItem(STORAGE_KEY), moments);
  } catch {
    return {};
  }
}

/** Writes the choices; false when the storage is missing or refuses (the choice still applies until reload). */
export function writeChoices(storage: WritableStorage | undefined, choices: LabChoices): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(choices));
    return true;
  } catch {
    return false;
  }
}

function deviceStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

interface LabStore {
  choices: LabChoices;
}

export const useLabStore = create<LabStore>(() => ({ choices: readChoices(deviceStorage(), MOMENT_IDS) }));

/** Saves a variant for a moment on this device, at once. Unknown moments or variants are ignored. */
export function setVariant(momentId: string, variantId: string): void {
  if (!isKnownVariant(MOMENT_IDS, momentId, variantId)) return;
  const { choices } = useLabStore.getState();
  if (choices[momentId] === variantId) return;
  const next = { ...choices, [momentId]: variantId };
  useLabStore.setState({ choices: next });
  writeChoices(deviceStorage(), next);
}

/** The variant that applies to a moment on this device (the saved choice, else the default). '' for an unknown id. */
export function useDesignVariant(momentId: string): string {
  return useLabStore((state) => resolveVariant(state.choices, MOMENT_IDS, momentId) ?? '');
}

/** Same as `useDesignVariant`, outside React. */
export function getDesignVariant(momentId: string): string {
  return resolveVariant(useLabStore.getState().choices, MOMENT_IDS, momentId) ?? '';
}

// Another tab changed the lab: follow it.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      useLabStore.setState({ choices: readChoices(deviceStorage(), MOMENT_IDS) });
    }
  });
}
