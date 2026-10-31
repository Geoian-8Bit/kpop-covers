import { isMemberColor } from '@coverscape/shared';
import type { Absence, RehearsalException, RehearsalRule, Tables, TablesInsert } from '@coverscape/shared';
import { supabase } from '../supabase';
import { fetchAll, must } from './shared';
import type { CalendarBackend } from './types';

export const supabaseCalendar: CalendarBackend = {
  async listCalendarMembers() {
    const data = must(await supabase.rpc('calendar_members'));
    return (data ?? []).map((m) => ({ ...m, color: isMemberColor(m.color) ? m.color : 'ai' }));
  },
  async listAbsences(from, to) {
    const rows = await fetchAll<Tables<'absences'>>((start, end) =>
      supabase
        .from('absences')
        .select('*')
        .lte('starts_on', to)
        .gte('ends_on', from)
        .order('starts_on')
        .order('id')
        .range(start, end),
    );
    return rows as Absence[];
  },
  async insertAbsence(row) {
    // crew_id comes from the database (the default group).
    const data = must(await supabase.from('absences').insert(row).select().single());
    return data as Absence;
  },
  async updateAbsence(id, patch, author) {
    const data = must(
      await supabase
        .from('absences')
        .update({ ...patch, changed_by_member: author })
        .eq('id', id)
        .select()
        .single(),
    );
    return data as Absence;
  },
  async deleteAbsence(id, author) {
    // Archives saying who did it (REQ-05), in one request.
    must(await supabase.rpc('archive_calendar_row', { p_table: 'absences', p_id: id, p_member: author }));
  },
  async listRehearsalRules() {
    return must(await supabase.from('rehearsal_rules').select('*').order('weekday').order('starts_at'));
  },
  async insertRehearsalRule(row, author) {
    return must(
      await supabase
        .from('rehearsal_rules')
        .insert({ ...row, changed_by_member: author })
        .select()
        .single(),
    );
  },
  async editRehearsalRule(id, row, author) {
    const data = must(
      await supabase
        .rpc('edit_rehearsal_rule', {
          p_rule: id,
          p_weekday: row.weekday,
          p_starts: row.starts_at,
          p_ends: row.ends_at,
          p_member: author,
        })
        .single(),
    );
    return data as RehearsalRule;
  },
  async endRehearsalRule(id, author) {
    must(await supabase.rpc('end_rehearsal_rule', { p_rule: id, p_member: author }));
  },
  async listRehearsalExceptions(from, to) {
    const data = must(
      await supabase
        .from('rehearsal_exceptions')
        .select('*')
        .gte('on_date', from)
        .lte('on_date', to)
        .order('on_date'),
    );
    return data as RehearsalException[];
  },
  async insertRehearsalException(row, author) {
    const insert: TablesInsert<'rehearsal_exceptions'> = { ...row, changed_by_member: author };
    const data = must(await supabase.from('rehearsal_exceptions').insert(insert).select().single());
    return data as RehearsalException;
  },
  async deleteRehearsalException(id, author) {
    must(
      await supabase.rpc('archive_calendar_row', {
        p_table: 'rehearsal_exceptions',
        p_id: id,
        p_member: author,
      }),
    );
  },
  async listCalendarChanges(since) {
    return must(
      await supabase
        .from('calendar_changes')
        .select('*')
        .gt('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50),
    );
  },
};
