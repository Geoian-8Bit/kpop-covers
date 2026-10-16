import { describe, expect, it } from 'vitest';
import {
  applyToggle,
  groupReactions,
  reactionLabel,
  toggleReaction,
  totalReactions,
  whoWords,
  type ReactionRow,
} from './reactionRules';

const row = (id: string, member: string | null, emoji: string, take = 't1', at = id): ReactionRow => ({
  id,
  take_id: take,
  member_id: member,
  emoji,
  created_at: `2026-10-16T10:00:0${at.slice(-1)}Z`,
});

const rows: ReactionRow[] = [
  row('r1', 'flor', '🔥'),
  row('r2', 'iker', '🔥'),
  row('r3', null, '👏'),
  row('r4', 'flor', '😂'),
  row('r5', 'iker', '🔥', 't2'),
  row('r6', 'nerea', '💩'),
];

describe('groupReactions', () => {
  it('counts each emoji of one take, in the fixed order, ignoring other takes and unknown emoji', () => {
    const groups = groupReactions(rows, 't1', null);
    expect(groups.map((g) => [g.emoji, g.count])).toEqual([
      ['🔥', 2],
      ['👏', 1],
      ['💯', 0],
      ['😂', 1],
    ]);
    expect(totalReactions(groups)).toBe(4);
  });

  it('marks the ones of this device: its member, or the «sin nombre» slot without a name', () => {
    expect(groupReactions(rows, 't1', 'flor').filter((g) => g.mine).map((g) => g.emoji)).toEqual(['🔥', '😂']);
    expect(groupReactions(rows, 't1', null).filter((g) => g.mine).map((g) => g.emoji)).toEqual(['👏']);
    expect(groupReactions(rows, 't1', 'dani').some((g) => g.mine)).toBe(false);
  });

  it('lists who reacted, oldest first', () => {
    expect(groupReactions(rows, 't1', null)[0]!.who).toEqual(['flor', 'iker']);
    expect(groupReactions(rows, 't1', null)[1]!.who).toEqual([null]);
  });

  it('is all zeros for a take without reactions', () => {
    expect(totalReactions(groupReactions(rows, 'nope', 'flor'))).toBe(0);
  });
});

describe('toggleReaction', () => {
  it('adds when this person has not reacted with that emoji', () => {
    expect(toggleReaction(rows, 't1', 'iker', '😂')).toEqual({
      action: 'add',
      row: { take_id: 't1', member_id: 'iker', emoji: '😂' },
    });
  });

  it('removes their own one, not someone else’s', () => {
    expect(toggleReaction(rows, 't1', 'iker', '🔥')).toEqual({ action: 'remove', id: 'r2' });
    expect(toggleReaction(rows, 't2', 'flor', '🔥').action).toBe('add');
  });

  it('without a name, toggles the shared «sin nombre» slot', () => {
    expect(toggleReaction(rows, 't1', null, '👏')).toEqual({ action: 'remove', id: 'r3' });
    expect(toggleReaction(rows, 't1', null, '🔥')).toEqual({
      action: 'add',
      row: { take_id: 't1', member_id: null, emoji: '🔥' },
    });
  });

  it('two people react with the same emoji, then one takes it back', () => {
    let list = [...rows];
    const t = toggleReaction(list, 't1', 'nerea', '💯');
    list = applyToggle(list, t, row('tmp', 'nerea', '💯', 't1', '7'));
    const t2 = toggleReaction(list, 't1', 'dani', '💯');
    list = applyToggle(list, t2, row('tmp2', 'dani', '💯', 't1', '8'));
    expect(groupReactions(list, 't1', 'dani')[2]).toMatchObject({ count: 2, mine: true, who: ['nerea', 'dani'] });
    list = applyToggle(list, toggleReaction(list, 't1', 'nerea', '💯'), row('x', null, '💯'));
    expect(groupReactions(list, 't1', 'nerea')[2]).toMatchObject({ count: 1, mine: false, who: ['dani'] });
  });
});

describe('words', () => {
  const names: Record<string, string> = { flor: 'Flor', iker: 'Iker', nerea: 'Nerea' };
  const nameOf = (id: string) => names[id] ?? 'Antiguo miembro';

  it('joins names in Spanish and counts the unnamed', () => {
    expect(whoWords([], nameOf)).toBe('nadie');
    expect(whoWords(['flor'], nameOf)).toBe('Flor');
    expect(whoWords(['flor', 'iker'], nameOf)).toBe('Flor y Iker');
    expect(whoWords(['flor', null, 'iker', null], nameOf)).toBe('Flor, Iker y 2 sin nombre');
    expect(whoWords([null], nameOf)).toBe('1 sin nombre');
  });

  it('labels a button for screen readers', () => {
    const [fire] = groupReactions(rows, 't1', 'flor');
    expect(reactionLabel(fire!)).toBe('Fuego: 2 reacciones, incluida la tuya');
    // Without a name the slot is shared: it may be someone else's, so it doesn't claim to be yours.
    const clap = groupReactions(rows, 't1', null)[1]!;
    expect(reactionLabel(clap)).toBe('Aplausos: 1 reacción, incluida una sin nombre');
  });
});
