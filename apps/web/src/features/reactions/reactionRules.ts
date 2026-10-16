import { REACTION_EMOJIS, type ReactionEmoji } from '@coverscape/shared';

/**
 * F15 · Pure rules of the quick reactions on shared takes (🔥 👏 💯 😂): grouping and counting them, and what a
 * tap does. One of each emoji per person; everyone without a name shares one «sin nombre» slot per emoji (the
 * database's unique index works so). Covered by `reactionRules.test.ts`.
 */

export interface ReactionRow {
  id: string;
  take_id: string;
  member_id: string | null;
  emoji: string;
  created_at: string;
}

export interface ReactionGroup {
  emoji: ReactionEmoji;
  count: number;
  /** This device's reaction is among them (its member's, or the «sin nombre» one when it has no name). */
  mine: boolean;
  /** Who reacted, oldest first; null = sin nombre. */
  who: (string | null)[];
  /** This device has no name: «mine» is the shared «sin nombre» slot (it may be someone else's). */
  unnamed: boolean;
}

/** The four emoji in their fixed order, with their counts, for one take (unknown emoji are ignored). */
export function groupReactions(rows: readonly ReactionRow[], takeId: string, meId: string | null): ReactionGroup[] {
  const own = rows.filter((r) => r.take_id === takeId).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return REACTION_EMOJIS.map((emoji) => {
    const of = own.filter((r) => r.emoji === emoji);
    return {
      emoji,
      count: of.length,
      mine: of.some((r) => r.member_id === meId),
      who: of.map((r) => r.member_id),
      unnamed: meId == null,
    };
  });
}

export function totalReactions(groups: readonly ReactionGroup[]): number {
  return groups.reduce((s, g) => s + g.count, 0);
}

export type ToggleAction =
  | { action: 'add'; row: { take_id: string; member_id: string | null; emoji: ReactionEmoji } }
  | { action: 'remove'; id: string };

/** A tap on an emoji: adds this device's reaction, or takes it away if it is already there. */
export function toggleReaction(
  rows: readonly ReactionRow[],
  takeId: string,
  memberId: string | null,
  emoji: ReactionEmoji,
): ToggleAction {
  const existing = rows.find((r) => r.take_id === takeId && r.member_id === memberId && r.emoji === emoji);
  return existing ? { action: 'remove', id: existing.id } : { action: 'add', row: { take_id: takeId, member_id: memberId, emoji } };
}

/** The list after a toggle, for the cache to show it at once (the server's row replaces the temporary one). */
export function applyToggle<R extends ReactionRow>(rows: readonly R[], toggle: ToggleAction, temp: R): R[] {
  return toggle.action === 'remove' ? rows.filter((r) => r.id !== toggle.id) : [...rows, temp];
}

/** «Flor, Iker y 1 sin nombre» for a screen reader or a short line. */
export function whoWords(who: readonly (string | null)[], nameOf: (id: string) => string): string {
  const names = who.filter((id): id is string => id != null).map(nameOf);
  const unnamed = who.length - names.length;
  const parts = [...names];
  if (unnamed) parts.push(unnamed === 1 ? '1 sin nombre' : `${unnamed} sin nombre`);
  if (parts.length <= 1) return parts[0] ?? 'nadie';
  return `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`;
}

/** The accessible name of an emoji button. */
export const EMOJI_NAMES: Record<ReactionEmoji, string> = {
  '🔥': 'Fuego',
  '👏': 'Aplausos',
  '💯': 'Cien',
  '😂': 'Risa',
};

export function reactionLabel(group: ReactionGroup): string {
  const count = group.count === 1 ? '1 reacción' : `${group.count} reacciones`;
  const mine = group.mine ? (group.unnamed ? ', incluida una sin nombre' : ', incluida la tuya') : '';
  return `${EMOJI_NAMES[group.emoji]}: ${count}${mine}`;
}
