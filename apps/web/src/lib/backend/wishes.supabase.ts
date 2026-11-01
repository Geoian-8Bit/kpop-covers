import type { Poll, PollOption, PollVote, Wish, WishInterest } from '@coverscape/shared';
import { supabase } from '../supabase';
import { NEW_POLL_RULES, fetchAll, must } from './shared';
import type { CloseResult, WishesBackend } from './types';

export const supabaseWishes: WishesBackend = {
  async listWishes() {
    const data = must(await supabase.from('wishes').select('*').order('created_at'));
    return data as Wish[];
  },
  async insertWish(row) {
    // crew_id comes from the database (the default group).
    const data = must(
      await supabase
        .from('wishes')
        .insert({ ...row, title: row.title.trim() })
        .select()
        .single(),
    );
    return data as Wish;
  },
  async updateWish(id, patch) {
    const clean = patch.title != null ? { ...patch, title: patch.title.trim() } : patch;
    const data = must(await supabase.from('wishes').update(clean).eq('id', id).select().single());
    return data as Wish;
  },
  async deleteWish(id) {
    must(await supabase.from('wishes').delete().eq('id', id));
  },
  async listInterest() {
    return fetchAll<WishInterest>((from, to) =>
      supabase.from('wish_interest').select('*').order('created_at').order('id').range(from, to),
    );
  },
  async addInterest(wishId, memberId) {
    return must(
      await supabase.from('wish_interest').insert({ wish_id: wishId, member_id: memberId }).select().single(),
    );
  },
  async removeInterest(id) {
    must(await supabase.from('wish_interest').delete().eq('id', id));
  },
  async listPolls() {
    const data = must(await supabase.from('polls').select('*').order('created_at', { ascending: false }));
    return data as Poll[];
  },
  async listPollOptions() {
    return fetchAll<PollOption>((from, to) =>
      supabase.from('poll_options').select('*').order('created_at').order('id').range(from, to),
    );
  },
  async listPollVotes(pollIds) {
    if (!pollIds.length) return [];
    return fetchAll<PollVote>((from, to) =>
      supabase
        .from('poll_votes')
        .select('*')
        .in('poll_id', pollIds)
        .is('archived_at', null)
        .order('created_at')
        .order('id')
        .range(from, to),
    );
  },
  async pollVotesSignature(pollId) {
    return must(await supabase.rpc('poll_votes_signature', { p_poll: pollId })) ?? null;
  },
  async closePoll(pollId, resolve, winnerWishId = null) {
    const data = must(
      await supabase.rpc('close_poll', { p_poll: pollId, p_resolve: resolve, p_winner: winnerWishId }),
    );
    const r = (data ?? {}) as Partial<CloseResult>;
    return { status: r.status === 'tie' ? 'tie' : 'closed', winner: r.winner ?? null, tied: r.tied ?? [] };
  },
  async insertPoll(row, wishIds) {
    const data = must(
      await supabase
        .from('polls')
        .insert({ ...row, ...NEW_POLL_RULES, title: row.title.trim() })
        .select()
        .single(),
    );
    const poll = data as Poll;
    const { error: optionsError } = await supabase
      .from('poll_options')
      .insert(wishIds.map((wish_id) => ({ poll_id: poll.id, wish_id })));
    if (optionsError) {
      // A vote without its candidates is no use: archive it and report the failure.
      await supabase.from('polls').delete().eq('id', poll.id);
      throw optionsError;
    }
    return poll;
  },
  async updatePoll(id, patch) {
    const clean = patch.title != null ? { ...patch, title: patch.title.trim() } : patch;
    const data = must(await supabase.from('polls').update(clean).eq('id', id).select().single());
    return data as Poll;
  },
  async deletePoll(id) {
    must(await supabase.from('polls').delete().eq('id', id));
  },
  async castVote(pollId, memberId, optionIds) {
    const data = must(
      await supabase.rpc('cast_vote', { p_poll: pollId, p_member: memberId, p_options: optionIds }),
    );
    return Number(data) || 0;
  },
};
