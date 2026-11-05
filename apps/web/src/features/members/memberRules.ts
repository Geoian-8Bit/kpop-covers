import type { Member } from '@coverscape/shared';

/** How the database compares names (`lower(btrim(name))`): «Ana », «ana» and «ANA» are the same person. */
const nameKey = (name: string) => name.trim().toLowerCase();

/**
 * Why a member name can't be saved, or null if it can. `selfId` is the member being renamed: changing only the
 * case or spaces of your own name is fine. Same rule as the unique index, checked before the round trip.
 */
export function memberNameError(
  name: string,
  members: readonly Pick<Member, 'id' | 'name'>[] | undefined,
  selfId?: string,
): string | null {
  const key = nameKey(name);
  if (!key) return 'Escribe un nombre.';
  if (members?.some((m) => m.id !== selfId && nameKey(m.name) === key)) return 'Ya hay alguien con ese nombre en el grupo.';
  return null;
}

/** This device says it is a member the (loaded) list no longer has: deleted here or on another phone. */
export function isVanishedMe(memberId: string | null, members: readonly Pick<Member, 'id'>[] | undefined): boolean {
  return memberId != null && members != null && !members.some((m) => m.id === memberId);
}
