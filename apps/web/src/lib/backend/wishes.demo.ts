import type { Poll, PollOption, PollVote, Wish, WishInterest } from '@coverscape/shared';
import { demoError, isLive, mutate, now, query } from './demoDb';
import type { DemoDb } from './demoDb';
import { NEW_POLL_RULES } from './shared';
import { pollVotesSignature } from './pollSignature';
import type { CloseResult, WishesBackend } from './types';

// Demo twin: the same rules as the database (one live entry per video, «Me apunto» once, close once with a winner
// among the options, cast_vote's checks). Archived rows stay with archived_at and are hidden, as with RLS.

type WishesDemoDb = DemoDb & {
  wishes?: Wish[];
  wish_interest?: WishInterest[];
  polls?: Poll[];
  poll_options?: PollOption[];
  poll_votes?: PollVote[];
};

const memberExists = (db: WishesDemoDb, id: string | null | undefined) =>
  Boolean(id && (db.members ?? []).some((m) => m.id === id));

function checkWish(row: Partial<Wish>) {
  if (row.title != null && (row.title.trim().length < 1 || row.title.trim().length > 200)) {
    throw demoError('wishes_title_check', '23514');
  }
  if (row.artist != null && row.artist.length > 120) throw demoError('wishes_artist_check', '23514');
  if (row.comment != null && row.comment.length > 300) throw demoError('wishes_comment_check', '23514');
  if (row.members_count != null && !(row.members_count >= 1 && row.members_count <= 30)) {
    throw demoError('wishes_members_count_check', '23514');
  }
  if (row.difficulty != null && !['facil', 'media', 'dificil'].includes(row.difficulty)) {
    throw demoError('wishes_difficulty_check', '23514');
  }
}

/** The leaders of a poll right now (twin of the count inside close_poll). */
function demoLeaders(db: WishesDemoDb, poll: Poll): { ids: string[]; top: number } {
  const liveWish = new Set((db.wishes ?? []).filter(isLive).map((w) => w.id));
  const options = (db.poll_options ?? []).filter(
    (o) => isLive(o) && o.poll_id === poll.id && liveWish.has(o.wish_id),
  );
  const n = options.length;
  const score = new Map(options.map((o) => [o.wish_id, 0]));
  for (const v of db.poll_votes ?? []) {
    if (!isLive(v) || v.poll_id !== poll.id) continue;
    const option = options.find((o) => o.id === v.option_id);
    if (!option) continue;
    score.set(
      option.wish_id,
      score.get(option.wish_id)! + (poll.vote_type === 'ranking' ? n - (v.rank ?? n) + 1 : 1),
    );
  }
  const top = Math.max(0, ...score.values());
  return {
    ids: [...score]
      .filter(([, s]) => s === top)
      .map(([id]) => id)
      .sort(),
    top,
  };
}

export const demoWishes: WishesBackend = {
  listWishes: () =>
    query((raw) =>
      ((raw as WishesDemoDb).wishes ?? [])
        .filter(isLive)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    ),
  insertWish: async (row) =>
    mutate((raw) => {
      const db = raw as WishesDemoDb;
      if (!/^[A-Za-z0-9_-]{11}$/.test(row.youtube_id)) throw demoError('wishes_youtube_id_check', '23514');
      checkWish(row);
      const wishes = (db.wishes ??= []);
      if (wishes.some((w) => isLive(w) && w.added_video_id == null && w.youtube_id === row.youtube_id)) {
        throw demoError('duplicate key value violates unique constraint "wishes_crew_youtube_key"', '23505');
      }
      const wish: Wish = {
        id: crypto.randomUUID(),
        crew_id: db.crews[0]!.id,
        youtube_id: row.youtube_id,
        title: row.title.trim(),
        artist: row.artist ?? null,
        thumbnail_url: row.thumbnail_url ?? null,
        members_count: row.members_count ?? null,
        difficulty: row.difficulty ?? null,
        comment: row.comment ?? null,
        proposed_by_member_id: memberExists(db, row.proposed_by_member_id)
          ? row.proposed_by_member_id!
          : null,
        added_video_id: null,
        created_at: now(),
        archived_at: null,
      };
      wishes.push(wish);
      return wish;
    }),
  updateWish: async (id, patch) =>
    mutate((raw) => {
      const db = raw as WishesDemoDb;
      const wish = db.wishes?.find((w) => w.id === id && isLive(w));
      if (!wish) throw demoError('PGRST116 0 rows');
      checkWish(patch);
      if (patch.added_video_id && !db.videos.some((v) => v.id === patch.added_video_id)) {
        throw demoError('wish_video_invalid');
      }
      Object.assign(wish, patch, patch.title != null ? { title: patch.title.trim() } : {});
      return wish;
    }),
  deleteWish: async (id) =>
    mutate((raw) => {
      const wish = (raw as WishesDemoDb).wishes?.find((w) => w.id === id);
      if (wish && isLive(wish)) wish.archived_at = now();
    }),
  listInterest: () =>
    query((raw) => {
      const db = raw as WishesDemoDb;
      const live = new Set((db.wishes ?? []).filter(isLive).map((w) => w.id));
      return (db.wish_interest ?? [])
        .filter((i) => isLive(i) && live.has(i.wish_id) && memberExists(db, i.member_id))
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    }),
  addInterest: async (wishId, memberId) =>
    mutate((raw) => {
      const db = raw as WishesDemoDb;
      if (!db.wishes?.some((w) => w.id === wishId && isLive(w)) || !memberExists(db, memberId)) {
        throw demoError('wish_interest_invalid');
      }
      const rows = (db.wish_interest ??= []);
      if (rows.some((i) => isLive(i) && i.wish_id === wishId && i.member_id === memberId)) {
        throw demoError('duplicate key value violates unique constraint "wish_interest_once_key"', '23505');
      }
      const row: WishInterest = {
        id: crypto.randomUUID(),
        crew_id: db.crews[0]!.id,
        wish_id: wishId,
        member_id: memberId,
        created_at: now(),
        archived_at: null,
      };
      rows.push(row);
      return row;
    }),
  removeInterest: async (id) =>
    mutate((raw) => {
      const row = (raw as WishesDemoDb).wish_interest?.find((i) => i.id === id);
      if (row && isLive(row)) row.archived_at = now();
    }),
  listPolls: () =>
    query((raw) =>
      ((raw as WishesDemoDb).polls ?? [])
        .filter(isLive)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    ),
  listPollOptions: () =>
    query((raw) => {
      const db = raw as WishesDemoDb;
      const live = new Set((db.polls ?? []).filter(isLive).map((p) => p.id));
      return (db.poll_options ?? []).filter((o) => isLive(o) && live.has(o.poll_id));
    }),
  listPollVotes: (pollIds) =>
    query((raw) => {
      const db = raw as WishesDemoDb;
      const wanted = new Set(pollIds);
      const live = new Set((db.polls ?? []).filter((p) => isLive(p) && wanted.has(p.id)).map((p) => p.id));
      return (db.poll_votes ?? []).filter((v) => isLive(v) && live.has(v.poll_id));
    }),
  pollVotesSignature: (pollId) =>
    query((raw) => {
      const db = raw as WishesDemoDb;
      // RLS-like: nothing of a poll that is gone.
      if (!(db.polls ?? []).some((p) => p.id === pollId && isLive(p))) return null;
      return pollVotesSignature((db.poll_votes ?? []).filter((v) => isLive(v) && v.poll_id === pollId));
    }),
  closePoll: async (pollId, resolve, winnerWishId = null) =>
    mutate((raw): CloseResult => {
      // Twin of close_poll(): counts the live candidates (wish not deleted) with the votes as they are now.
      const db = raw as WishesDemoDb;
      const poll = db.polls?.find((p) => p.id === pollId && isLive(p));
      if (!poll) throw demoError('poll_not_found');
      if (poll.closed_at != null) return { status: 'closed', winner: poll.winner_wish_id, tied: [] };
      const leaders = demoLeaders(db, poll);
      const close = (winner: string | null) => {
        poll.closed_at = now();
        poll.winner_wish_id = winner;
      };
      if (resolve === 'none') {
        close(null);
        return { status: 'closed', winner: null, tied: leaders.ids };
      }
      if (resolve === 'pick') {
        if (!winnerWishId || !leaders.ids.includes(winnerWishId)) throw demoError('poll_winner_invalid');
        close(winnerWishId);
        return { status: 'closed', winner: winnerWishId, tied: leaders.ids };
      }
      if (!leaders.ids.length || leaders.top === 0) {
        close(null);
        return { status: 'closed', winner: null, tied: [] };
      }
      if (leaders.ids.length > 1) return { status: 'tie', winner: null, tied: leaders.ids };
      close(leaders.ids[0]!);
      return { status: 'closed', winner: leaders.ids[0]!, tied: [] };
    }),
  insertPoll: async (row, wishIds) =>
    mutate((raw) => {
      const db = raw as WishesDemoDb;
      const title = row.title.trim();
      if (title.length < 1 || title.length > 80) throw demoError('polls_title_check', '23514');
      if (!['single', 'multi', 'ranking'].includes(row.vote_type))
        throw demoError('polls_vote_type_check', '23514');
      const liveWishIds = new Set((db.wishes ?? []).filter(isLive).map((w) => w.id));
      if (wishIds.some((id) => !liveWishIds.has(id))) throw demoError('poll_option_invalid');
      if (new Set(wishIds).size !== wishIds.length) {
        throw demoError('duplicate key value violates unique constraint "poll_options_once_key"', '23505');
      }
      const poll: Poll = {
        id: crypto.randomUUID(),
        crew_id: db.crews[0]!.id,
        title,
        vote_type: row.vote_type,
        ...NEW_POLL_RULES,
        closed_at: null,
        winner_wish_id: null,
        parent_poll_id:
          row.parent_poll_id && db.polls?.some((p) => p.id === row.parent_poll_id)
            ? row.parent_poll_id
            : null,
        created_by_member_id: memberExists(db, row.created_by_member_id) ? row.created_by_member_id : null,
        created_at: now(),
        archived_at: null,
      };
      (db.polls ??= []).push(poll);
      const options = (db.poll_options ??= []);
      for (const wish_id of wishIds) {
        options.push({
          id: crypto.randomUUID(),
          crew_id: poll.crew_id,
          poll_id: poll.id,
          wish_id,
          created_at: now(),
          archived_at: null,
        });
      }
      return poll;
    }),
  updatePoll: async (id, patch) =>
    mutate((raw) => {
      const db = raw as WishesDemoDb;
      const poll = db.polls?.find((p) => p.id === id && isLive(p));
      if (!poll) throw demoError('PGRST116 0 rows');
      const next = { ...poll, ...patch };
      // Twin of guard_poll_update(): closed once; then frozen; the winner only while closing, and an option.
      if (poll.closed_at != null) {
        if (
          next.closed_at !== poll.closed_at ||
          next.winner_wish_id !== poll.winner_wish_id ||
          next.closes_at !== poll.closes_at ||
          next.anonymous !== poll.anonymous ||
          next.results_live !== poll.results_live
        ) {
          throw demoError('poll_closed');
        }
      } else if (
        poll.closes_at != null &&
        Date.parse(poll.closes_at) <= Date.now() &&
        next.closes_at !== poll.closes_at
      ) {
        throw demoError('poll_closed');
      } else if (next.closed_at != null) {
        next.closed_at = now();
      }
      if (next.winner_wish_id != null && next.winner_wish_id !== poll.winner_wish_id) {
        const isOption = (db.poll_options ?? []).some(
          (o) => isLive(o) && o.poll_id === id && o.wish_id === next.winner_wish_id,
        );
        if (next.closed_at == null || !isOption) throw demoError('poll_winner_invalid');
      }
      if (next.title.trim().length < 1 || next.title.trim().length > 80)
        throw demoError('polls_title_check', '23514');
      Object.assign(poll, next, { title: next.title.trim() });
      return poll;
    }),
  deletePoll: async (id) =>
    mutate((raw) => {
      const db = raw as WishesDemoDb;
      const poll = db.polls?.find((p) => p.id === id);
      if (!poll || !isLive(poll)) return;
      poll.archived_at = now();
      for (const o of db.poll_options ?? []) if (o.poll_id === id && isLive(o)) o.archived_at = now();
    }),
  castVote: async (pollId, memberId, optionIds) =>
    mutate((raw) => {
      // Twin of cast_vote().
      const db = raw as WishesDemoDb;
      const poll = db.polls?.find((p) => p.id === pollId && isLive(p));
      if (!poll) throw demoError('poll_not_found');
      if (poll.closed_at != null || (poll.closes_at != null && Date.parse(poll.closes_at) <= Date.now())) {
        throw demoError('poll_closed');
      }
      if (!memberExists(db, memberId)) throw demoError('vote_member_invalid');
      const valid = new Set(
        (db.poll_options ?? []).filter((o) => isLive(o) && o.poll_id === pollId).map((o) => o.id),
      );
      if (new Set(optionIds.filter((id) => valid.has(id))).size !== optionIds.length) {
        throw demoError('vote_options_invalid');
      }
      if (poll.vote_type === 'single' && optionIds.length > 1) throw demoError('vote_options_invalid');
      const votes = (db.poll_votes ??= []);
      for (const v of votes)
        if (v.poll_id === pollId && v.member_id === memberId && isLive(v)) v.archived_at = now();
      // A candidate whose wish was deleted meanwhile is skipped; the ranks of the rest close up.
      const liveWish = new Set((db.wishes ?? []).filter(isLive).map((w) => w.id));
      const kept = optionIds.filter((id) => {
        const option = db.poll_options?.find((o) => o.id === id);
        return option != null && liveWish.has(option.wish_id);
      });
      kept.forEach((option_id, i) => {
        votes.push({
          id: crypto.randomUUID(),
          crew_id: poll.crew_id,
          poll_id: pollId,
          option_id,
          member_id: memberId,
          rank: poll.vote_type === 'ranking' ? i + 1 : null,
          created_at: now(),
          archived_at: null,
        });
      });
      return optionIds.length;
    }),
};
