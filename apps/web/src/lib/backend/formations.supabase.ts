import { readProps } from '@/features/formations/propRules';
import { isMemberColor } from '@coverscape/shared';
import type { Formation, FormationPlan, FormationPositions, Tables } from '@coverscape/shared';
import { supabase } from '../supabase';
import { fromJson, must, toJson } from './shared';
import type { FormationsBackend } from './types';

const toFormation = (row: Tables<'formations'>): Formation => ({
  ...row,
  at: Number(row.at),
  transition: Number(row.transition),
  positions: fromJson<FormationPositions>(row.positions ?? {}),
  props: readProps(row.props),
});
const toPlan = (row: Tables<'formation_plans'>): FormationPlan => ({
  ...row,
  stage_width: Number(row.stage_width),
  stage_depth: Number(row.stage_depth),
  grid: Number(row.grid),
  bpm: row.bpm == null ? null : Number(row.bpm),
  first_beat: row.first_beat == null ? null : Number(row.first_beat),
});
interface RpcRevision {
  ok: boolean;
  revision: number;
  plan?: Tables<'formation_plans'>;
  formation?: Tables<'formations'>;
}

export const supabaseFormations: FormationsBackend = {
  async listFormationMembers() {
    const data = must(await supabase.rpc('formation_members'));
    return (data ?? []).map((m) => ({ ...m, color: isMemberColor(m.color) ? m.color : 'ai' }));
  },
  async listPlans(videoId) {
    const data = must(
      await supabase
        .from('formation_plans')
        .select('*, formation_plan_members(member_id), formations(count)')
        .eq('video_id', videoId)
        .order('created_at')
        .order('id'),
    );
    return ((data ?? []) as unknown[]).map((row) => {
      const {
        formation_plan_members: members,
        formations,
        ...plan
      } = row as Tables<'formation_plans'> & {
        formation_plan_members: { member_id: string }[];
        formations: { count: number }[];
      };
      return {
        ...toPlan(plan),
        members: members.map((m) => m.member_id),
        formationCount: formations[0]?.count ?? 0,
      };
    });
  },
  async getPlan(planId) {
    const [plan, members, formations] = await Promise.all([
      supabase.from('formation_plans').select('*').eq('id', planId).maybeSingle(),
      supabase
        .from('formation_plan_members')
        .select('member_id')
        .eq('plan_id', planId)
        .order('created_at')
        .order('id'),
      supabase.from('formations').select('*').eq('plan_id', planId).order('at').order('id'),
    ]);
    if (plan.error) throw plan.error;
    if (members.error) throw members.error;
    if (formations.error) throw formations.error;
    if (!plan.data) return null;
    return {
      plan: toPlan(plan.data),
      members: (members.data ?? []).map((m) => m.member_id),
      formations: (formations.data ?? []).map(toFormation),
    };
  },
  async createPlan(row) {
    const data = must(
      await supabase.rpc('create_formation_plan', {
        p_video: row.video_id,
        p_name: row.name,
        p_members: row.members,
        p_width: row.stage_width,
        p_depth: row.stage_depth,
      }),
    );
    return toPlan(data as Tables<'formation_plans'>);
  },
  async updatePlan(planId, expected, patch) {
    const data = must(
      await supabase.rpc('update_formation_plan', {
        p_plan: planId,
        p_expected_revision: expected,
        p_patch: toJson(patch),
      }),
    );
    const r = fromJson<RpcRevision>(data);
    return r.ok
      ? { ok: true, revision: r.revision, plan: toPlan(r.plan!) }
      : { ok: false, conflict: true, revision: r.revision };
  },
  async duplicatePlan(planId, name) {
    const data = must(await supabase.rpc('duplicate_formation_plan', { p_plan: planId, p_name: name }));
    return toPlan(data as Tables<'formation_plans'>);
  },
  async deletePlan(planId) {
    must(await supabase.from('formation_plans').delete().eq('id', planId));
  },
  async saveFormation(planId, expected, formation) {
    const data = must(
      await supabase.rpc('save_formation', {
        p_plan: planId,
        p_expected_revision: expected,
        p_formation: toJson(formation),
      }),
    );
    const r = fromJson<RpcRevision>(data);
    return r.ok
      ? { ok: true, revision: r.revision, formation: toFormation(r.formation!) }
      : { ok: false, conflict: true, revision: r.revision };
  },
  async deleteFormation(planId, expected, formationId) {
    const data = must(
      await supabase.rpc('delete_formation', {
        p_plan: planId,
        p_expected_revision: expected,
        p_formation_id: formationId,
      }),
    );
    const r = fromJson<RpcRevision>(data);
    return r.ok ? { ok: true, revision: r.revision } : { ok: false, conflict: true, revision: r.revision };
  },
};
