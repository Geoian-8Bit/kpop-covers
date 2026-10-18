import { describe, expect, it } from 'vitest';
import {
  ballotOf,
  ballotProblem,
  closingLabel,
  drawAmongTied,
  isPollClosed,
  leaders,
  moveInRanking,
  msUntilClose,
  needsClosing,
  outcomeOf,
  pastVotesOf,
  pollSummary,
  scoreLabel,
  showsVoterNames,
  tally,
  voterCount,
} from './pollRules';

const options = [
  { id: 'oA', wish_id: 'A', poll_id: 'p' },
  { id: 'oB', wish_id: 'B', poll_id: 'p' },
  { id: 'oC', wish_id: 'C', poll_id: 'p' },
];
const vote = (member: string, option: string, rank: number | null = null) => ({
  poll_id: 'p',
  member_id: member,
  option_id: option,
  rank,
});
const scores = (results: ReturnType<typeof tally>) => Object.fromEntries(results.map((r) => [r.wishId, r.score]));

describe('tally · un voto', () => {
  it('counts one per person and option, highest first', () => {
    const results = tally('single', options, [vote('m1', 'oB'), vote('m2', 'oB'), vote('m3', 'oA')]);
    expect(scores(results)).toEqual({ A: 1, B: 2, C: 0 });
    expect(results[0]!.wishId).toBe('B');
    expect(results[0]!.voters.map((v) => v.memberId)).toEqual(['m1', 'm2']);
  });

  it('ignores votes for options outside the poll and repeated rows', () => {
    const results = tally('single', options, [vote('m1', 'oB'), vote('m1', 'oB'), vote('m2', 'zz')]);
    expect(scores(results)).toEqual({ A: 0, B: 1, C: 0 });
  });
});

describe('tally · varios votos', () => {
  it('counts every mark', () => {
    const results = tally('multi', options, [
      vote('m1', 'oA'),
      vote('m1', 'oB'),
      vote('m2', 'oB'),
      vote('m2', 'oC'),
      vote('m3', 'oB'),
    ]);
    expect(scores(results)).toEqual({ A: 1, B: 3, C: 1 });
  });
});

describe('tally · ranking', () => {
  it('gives n − position + 1 points (n = options)', () => {
    // m1: B > A > C → B 3, A 2, C 1. m2: A > B → A 3, B 2.
    const results = tally('ranking', options, [
      vote('m1', 'oB', 1),
      vote('m1', 'oA', 2),
      vote('m1', 'oC', 3),
      vote('m2', 'oA', 1),
      vote('m2', 'oB', 2),
    ]);
    expect(scores(results)).toEqual({ A: 5, B: 5, C: 1 });
    expect(results.find((r) => r.wishId === 'C')!.voters).toEqual([{ memberId: 'm1', position: 3 }]);
  });

  it('uses the order of the ranks even with gaps', () => {
    const results = tally('ranking', options, [vote('m1', 'oC', 4), vote('m1', 'oA', 9)]);
    expect(scores(results)).toEqual({ A: 2, B: 0, C: 3 });
  });
});

describe('ties and outcome', () => {
  it('no votes: no winner', () => {
    expect(leaders(tally('single', options, []))).toEqual([]);
    expect(outcomeOf(tally('single', options, []))).toEqual({ kind: 'none' });
  });

  it('one on top: winner', () => {
    expect(outcomeOf(tally('single', options, [vote('m1', 'oC')]))).toEqual({ kind: 'winner', wishId: 'C' });
  });

  it('equal top scores: tie between them only', () => {
    const outcome = outcomeOf(tally('multi', options, [vote('m1', 'oA'), vote('m2', 'oC')]));
    expect(outcome).toEqual({ kind: 'tie', wishIds: ['A', 'C'] });
  });

  it('a ranking tie is on points', () => {
    const outcome = outcomeOf(
      tally('ranking', options, [vote('m1', 'oB', 1), vote('m1', 'oA', 2), vote('m2', 'oA', 1), vote('m2', 'oB', 2)]),
    );
    expect(outcome).toEqual({ kind: 'tie', wishIds: ['A', 'B'] });
  });

  it('the tie draw picks one of the tied, at random', () => {
    expect(drawAmongTied(['A', 'B', 'C'], () => 0)).toBe('A');
    expect(drawAmongTied(['A', 'B', 'C'], () => 0.5)).toBe('B');
    expect(drawAmongTied(['A', 'B', 'C'], () => 0.9999)).toBe('C');
    expect(drawAmongTied([], () => 0.3)).toBeNull();
  });

  it('counts people, not marks', () => {
    expect(voterCount([vote('m1', 'oA'), vote('m1', 'oB'), vote('m2', 'oA')])).toBe(2);
  });
});

describe('end by time', () => {
  const now = Date.parse('2026-10-18T20:00:00Z');
  it('is open before closes_at, closed after it or with closed_at', () => {
    expect(isPollClosed({ closed_at: null, closes_at: '2026-10-18T22:00:00Z' }, now)).toBe(false);
    expect(isPollClosed({ closed_at: null, closes_at: '2026-10-18T19:59:59Z' }, now)).toBe(true);
    expect(isPollClosed({ closed_at: null, closes_at: '2026-10-18T20:00:00Z' }, now)).toBe(true);
    expect(isPollClosed({ closed_at: '2026-10-18T10:00:00Z', closes_at: null }, now)).toBe(true);
    expect(isPollClosed({ closed_at: null, closes_at: null }, now)).toBe(false);
  });

  it('asks whoever opens it to write the close only once the time has passed and nobody did', () => {
    expect(needsClosing({ closed_at: null, closes_at: '2026-10-18T19:00:00Z' }, now)).toBe(true);
    expect(needsClosing({ closed_at: '2026-10-18T19:30:00Z', closes_at: '2026-10-18T19:00:00Z' }, now)).toBe(false);
    expect(needsClosing({ closed_at: null, closes_at: '2026-10-18T21:00:00Z' }, now)).toBe(false);
    expect(needsClosing({ closed_at: null, closes_at: null }, now)).toBe(false);
  });

  it('counts down to the close', () => {
    expect(msUntilClose({ closed_at: null, closes_at: '2026-10-18T20:05:00Z' }, now)).toBe(300_000);
    expect(msUntilClose({ closed_at: null, closes_at: null }, now)).toBeNull();
    expect(closingLabel({ closed_at: null, closes_at: '2026-10-18T20:05:00Z' }, now)).toBe('Cierra en 5 min');
    expect(closingLabel({ closed_at: null, closes_at: null }, now)).toBe('Abierta');
    expect(closingLabel({ closed_at: 'x', closes_at: null }, now)).toBe('Cerrada');
  });
});

describe('ballots', () => {
  it('reads a person’s ballot in rank order', () => {
    expect(ballotOf([vote('m1', 'oC', 2), vote('m1', 'oA', 1), vote('m2', 'oB', 1)], 'm1')).toEqual(['oA', 'oC']);
    expect(ballotOf([vote('m1', 'oA')], null)).toEqual([]);
  });

  it('refuses what cast_vote refuses', () => {
    const ids = options.map((o) => o.id);
    expect(ballotProblem('single', ['oA', 'oB'], ids)).toBe('too-many');
    expect(ballotProblem('multi', ['oA', 'zz'], ids)).toBe('unknown-option');
    expect(ballotProblem('ranking', ['oA', 'oA'], ids)).toBe('repeated');
    expect(ballotProblem('multi', ['oA', 'oB'], ids)).toBeNull();
    expect(ballotProblem('single', [], ids)).toBeNull();
  });

  it('moves ranking entries with the buttons', () => {
    expect(moveInRanking(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveInRanking(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    const list = ['a', 'b'];
    expect(moveInRanking(list, 0, -1)).toBe(list);
    expect(moveInRanking(list, 1, 1)).toBe(list);
  });

  it('labels scores per type', () => {
    expect(scoreLabel('single', 1)).toBe('1 voto');
    expect(scoreLabel('multi', 3)).toBe('3 votos');
    expect(scoreLabel('ranking', 7)).toBe('7 puntos');
  });
});

describe('past votes of a wish', () => {
  const now = Date.parse('2026-10-18T20:00:00Z');
  const poll = (id: string, extra: object) => ({
    id,
    title: `Votación ${id}`,
    vote_type: 'single' as const,
    closed_at: '2026-10-18T10:00:00Z',
    closes_at: null,
    winner_wish_id: null,
    created_at: `2026-10-1${id === 'p' ? 1 : 2}T00:00:00Z`,
    ...extra,
  });

  it('keeps the score of closed votes it lost, newest first; not the open one nor the one it won', () => {
    const opts = [...options, { id: 'q1', wish_id: 'A', poll_id: 'q' }, { id: 'r1', wish_id: 'A', poll_id: 'r' }];
    const votes = [vote('m1', 'oB'), vote('m2', 'oA'), { ...vote('m1', 'q1'), poll_id: 'q' }];
    const result = pastVotesOf(
      'A',
      [poll('p', { winner_wish_id: 'B' }), poll('q', { winner_wish_id: 'A' }), poll('r', { closed_at: null })],
      opts,
      votes,
      now,
    );
    expect(result).toEqual([{ pollId: 'p', title: 'Votación p', type: 'single', score: 1 }]);
  });
});

describe('the compact summary of a vote (37, 52)', () => {
  const now = Date.parse('2026-10-18T20:00:00Z');
  const base = { closed_at: null, closes_at: null, vote_type: 'single' as const, anonymous: false };

  it('a new vote (live, named, closed by hand) only shows its type', () => {
    expect(pollSummary(base, now)).toEqual(['Un voto']);
    expect(pollSummary({ ...base, vote_type: 'ranking' }, now)).toEqual(['Ranking']);
  });

  it('an older vote keeps its closing time and its anonymous ballots', () => {
    expect(pollSummary({ ...base, closes_at: '2026-10-18T20:05:00Z', anonymous: true }, now)).toEqual([
      'Cierra en 5 min',
      'Un voto',
      'Votos anónimos',
    ]);
    expect(showsVoterNames({ anonymous: true })).toBe(false);
    expect(showsVoterNames({ anonymous: false })).toBe(true);
  });

  it('a deadline that passed without the close written yet, or a closed one', () => {
    expect(pollSummary({ ...base, closes_at: '2026-10-18T19:00:00Z' }, now)[0]).toBe('Plazo terminado');
    expect(pollSummary({ ...base, closed_at: '2026-10-18T19:00:00Z' }, now)[0]).toBe('Cerrada');
  });
});
