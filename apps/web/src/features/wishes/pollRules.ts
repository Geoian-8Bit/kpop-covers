import type { Poll, PollOption, PollVote, VoteType } from '@coverscape/shared';

/**
 * F11 · pure rules of a vote (no React, no storage — `pollRules.test.ts`): counting per type, ties, the end by
 * time, what a ballot may hold (the same rules as `cast_vote()` in the database) and the tie draw.
 */

export const VOTE_TYPE_COPY: Record<VoteType, { label: string; how: string; unit: [string, string] }> = {
  single: { label: 'Un voto', how: 'Cada persona elige una.', unit: ['voto', 'votos'] },
  multi: { label: 'Varios votos', how: 'Cada persona marca todas las que le valen.', unit: ['voto', 'votos'] },
  ranking: { label: 'Ranking', how: 'Cada persona las ordena: la 1.ª suma más puntos.', unit: ['punto', 'puntos'] },
};

export function scoreLabel(type: VoteType, score: number): string {
  const [one, many] = VOTE_TYPE_COPY[type].unit;
  return `${score} ${score === 1 ? one : many}`;
}

type PollTiming = Pick<Poll, 'closed_at' | 'closes_at'>;

/** Closed by hand (closed_at) or because its time has come (closes_at in the past). */
export function isPollClosed(poll: PollTiming, now: number = Date.now()): boolean {
  return poll.closed_at != null || (poll.closes_at != null && Date.parse(poll.closes_at) <= now);
}

/** Its time has passed but nobody has written the close yet: whoever opens it does (with the winner). */
export function needsClosing(poll: PollTiming, now: number = Date.now()): boolean {
  return poll.closed_at == null && poll.closes_at != null && Date.parse(poll.closes_at) <= now;
}

/** Results are shown live, or only once it closes. */
export function resultsVisible(poll: PollTiming & Pick<Poll, 'results_live'>, now: number = Date.now()): boolean {
  return poll.results_live || isPollClosed(poll, now);
}

/** Milliseconds until it closes by time (null: closed by hand only, or already closed). */
export function msUntilClose(poll: PollTiming, now: number = Date.now()): number | null {
  if (poll.closed_at != null || poll.closes_at == null) return null;
  return Math.max(0, Date.parse(poll.closes_at) - now);
}

export interface OptionResult {
  optionId: string;
  wishId: string;
  /** Votes (single / multi) or points (ranking). */
  score: number;
  /** Who chose it, with the place they gave it in a ranking (1 = first). */
  voters: { memberId: string; position: number | null }[];
}

type VoteRow = Pick<PollVote, 'option_id' | 'member_id' | 'rank' | 'poll_id'>;
type OptionRow = Pick<PollOption, 'id' | 'wish_id' | 'poll_id'>;

/**
 * The count. single / multi: one per mark. ranking: each person's order (by rank) gives
 * n − position + 1 points, n = the poll's number of options (1st = n points). Highest first; equal scores keep
 * the options' order.
 */
export function tally(type: VoteType, options: OptionRow[], votes: VoteRow[]): OptionResult[] {
  const n = options.length;
  const byOption = new Map<string, OptionResult>(
    options.map((o) => [o.id, { optionId: o.id, wishId: o.wish_id, score: 0, voters: [] }]),
  );
  if (type === 'ranking') {
    const ballots = new Map<string, VoteRow[]>();
    for (const vote of votes) {
      if (!byOption.has(vote.option_id)) continue;
      const list = ballots.get(vote.member_id) ?? [];
      list.push(vote);
      ballots.set(vote.member_id, list);
    }
    for (const [memberId, list] of ballots) {
      list
        .slice()
        .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))
        .forEach((vote, i) => {
          const result = byOption.get(vote.option_id)!;
          result.score += Math.max(0, n - (i + 1) + 1);
          result.voters.push({ memberId, position: i + 1 });
        });
    }
  } else {
    for (const vote of votes) {
      const result = byOption.get(vote.option_id);
      if (!result || result.voters.some((v) => v.memberId === vote.member_id)) continue;
      result.score += 1;
      result.voters.push({ memberId: vote.member_id, position: null });
    }
  }
  const order = new Map(options.map((o, i) => [o.id, i]));
  return [...byOption.values()].sort((a, b) => b.score - a.score || order.get(a.optionId)! - order.get(b.optionId)!);
}

/** The ones with the top score (several = a tie). Nobody voted: none. */
export function leaders(results: OptionResult[]): OptionResult[] {
  const top = results.reduce((max, r) => Math.max(max, r.score), 0);
  if (top <= 0) return [];
  return results.filter((r) => r.score === top);
}

export type Outcome =
  | { kind: 'none' }
  | { kind: 'winner'; wishId: string }
  | { kind: 'tie'; wishIds: string[] };

export function outcomeOf(results: OptionResult[]): Outcome {
  const top = leaders(results);
  if (top.length === 0) return { kind: 'none' };
  if (top.length === 1) return { kind: 'winner', wishId: top[0]!.wishId };
  return { kind: 'tie', wishIds: top.map((r) => r.wishId) };
}

/** How many different people voted. */
export function voterCount(votes: Pick<PollVote, 'member_id'>[]): number {
  return new Set(votes.map((v) => v.member_id)).size;
}

/** A person's current ballot: the options chosen, in their order (ranking) or as stored. */
export function ballotOf(votes: VoteRow[], memberId: string | null): string[] {
  if (!memberId) return [];
  return votes
    .filter((v) => v.member_id === memberId)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map((v) => v.option_id);
}

export type BallotProblem = 'too-many' | 'unknown-option' | 'repeated';

/** What `cast_vote()` refuses, checked before sending (an empty ballot = withdraw the vote). */
export function ballotProblem(type: VoteType, ballot: string[], optionIds: string[]): BallotProblem | null {
  if (new Set(ballot).size !== ballot.length) return 'repeated';
  if (ballot.some((id) => !optionIds.includes(id))) return 'unknown-option';
  if (type === 'single' && ballot.length > 1) return 'too-many';
  return null;
}

/** Moves one entry of a ranking up (−1) or down (+1); out of range = unchanged. */
export function moveInRanking<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = list.slice();
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}

/** «Sorteo entre empatadas»: one at random (`random` in [0, 1), injectable for tests). */
export function drawAmongTied<T>(tied: T[], random: () => number = Math.random): T | null {
  if (tied.length === 0) return null;
  return tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))]!;
}

/**
 * The wish list's memory of past votes (F11: the ones that don't win stay in the list with their votes):
 * for a wish, its score in each closed vote it lost, newest first.
 */
export interface PastVote {
  pollId: string;
  title: string;
  type: VoteType;
  score: number;
}

export function pastVotesOf(
  wishId: string,
  polls: Pick<Poll, 'id' | 'title' | 'vote_type' | 'closed_at' | 'closes_at' | 'winner_wish_id' | 'created_at'>[],
  options: OptionRow[],
  votes: VoteRow[],
  now: number = Date.now(),
): PastVote[] {
  const out: (PastVote & { at: string })[] = [];
  for (const poll of polls) {
    if (!isPollClosed(poll, now) || poll.winner_wish_id === wishId) continue;
    const pollOptions = options.filter((o) => o.poll_id === poll.id);
    if (!pollOptions.some((o) => o.wish_id === wishId)) continue;
    const results = tally(
      poll.vote_type,
      pollOptions,
      votes.filter((v) => v.poll_id === poll.id),
    );
    const mine = results.find((r) => r.wishId === wishId);
    out.push({ pollId: poll.id, title: poll.title, type: poll.vote_type, score: mine?.score ?? 0, at: poll.created_at });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).map(({ at: _at, ...rest }) => rest);
}

/** «Cierra el domingo a las 22:00» / «Cierra en 5 min» / «Cierre a mano». */
export function closingLabel(poll: PollTiming, now: number = Date.now()): string {
  if (poll.closed_at) return 'Cerrada';
  if (!poll.closes_at) return 'Se cierra a mano';
  const at = Date.parse(poll.closes_at);
  if (at <= now) return 'Ha terminado el plazo';
  const mins = Math.round((at - now) / 60_000);
  if (mins < 60) return `Cierra en ${Math.max(1, mins)} min`;
  const date = new Date(at);
  const sameDay = new Date(now).toDateString() === date.toDateString();
  const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Cierra hoy a las ${time}`;
  const day = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
  return `Cierra el ${day} a las ${time}`;
}
