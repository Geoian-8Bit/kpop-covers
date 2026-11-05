import {
  fitPositions,
  formationError,
  planNameError,
  roundTime,
  stageSizeError,
} from '@/features/formations/formationRules';
import { fitProps } from '@/features/formations/propRules';
import type { Formation, FormationPlan, FormationPlanMember } from '@coverscape/shared';
import { checkViolation } from './calendar.demo';
import { demoError, isLive, mutate, now, query } from './demoDb';
import type { DemoDb } from './demoDb';
import type { FormationsBackend, RevisionResult } from './types';

// Demo twin: the same rules as the database (revision per plan, positions inside the stage, one formation per
// moment, a smaller stage pulls points inside, removed participants kept archived, deleting archives).

type FormationsDemoDb = DemoDb & {
  formation_plans?: FormationPlan[];
  formation_plan_members?: FormationPlanMember[];
  formations?: Formation[];
};

function demoPlan(db: FormationsDemoDb, id: string): FormationPlan {
  const plan = (db.formation_plans ?? []).find((p) => p.id === id && isLive(p));
  if (!plan) throw demoError('formation_plan_not_found');
  return plan;
}

const demoPlanMembers = (db: FormationsDemoDb, planId: string) =>
  (db.formation_plan_members ?? [])
    .filter((m) => m.plan_id === planId && isLive(m))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((m) => m.member_id);

function demoSetParticipants(db: FormationsDemoDb, planId: string, ids: string[]) {
  const rows = (db.formation_plan_members ??= []);
  // Live members, plus people already in the plan who left the group (kept, greyed out; as the server does).
  const live = new Set([
    ...(db.members ?? []).map((m) => m.id),
    ...rows.filter((r) => r.plan_id === planId && isLive(r)).map((r) => r.member_id),
  ]);
  if (ids.length > 40 || ids.some((id) => !live.has(id))) throw demoError('formation_member_invalid');
  for (const row of rows) {
    if (row.plan_id !== planId) continue;
    const wanted = ids.includes(row.member_id);
    if (!wanted && isLive(row)) row.archived_at = now();
    if (wanted && !isLive(row)) {
      row.archived_at = null;
      row.created_at = now();
    }
  }
  for (const id of new Set(ids)) {
    if (rows.some((r) => r.plan_id === planId && r.member_id === id)) continue;
    rows.push({
      id: crypto.randomUUID(),
      crew_id: db.crews[0]!.id,
      plan_id: planId,
      member_id: id,
      created_at: now(),
      archived_at: null,
    });
  }
}

function demoCheckPlan(
  plan: Pick<FormationPlan, 'name' | 'stage_width' | 'stage_depth' | 'grid' | 'bpm' | 'first_beat'>,
) {
  if (planNameError(plan.name)) throw checkViolation('formation_plans_name_check', 'formation_plans');
  if (stageSizeError(plan.stage_width, plan.stage_depth))
    throw checkViolation('formation_plans_stage_width_check', 'formation_plans');
  if (!(plan.grid >= 0.1 && plan.grid <= 2))
    throw checkViolation('formation_plans_grid_check', 'formation_plans');
  if (plan.bpm != null && !(plan.bpm >= 40 && plan.bpm <= 240))
    throw checkViolation('formation_plans_bpm_check', 'formation_plans');
  if (plan.first_beat != null && !(plan.first_beat >= 0))
    throw checkViolation('formation_plans_first_beat_check', 'formation_plans');
}

const demoConflict = (plan: FormationPlan) => ({
  ok: false as const,
  conflict: true as const,
  revision: plan.revision,
});

export const demoFormations: FormationsBackend = {
  listFormationMembers: () =>
    query((db) =>
      [...(db.members ?? [])]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((m) => ({ id: m.id, name: m.name, color: m.color, archived: false })),
    ),
  listPlans: (videoId) =>
    query((raw) => {
      const db = raw as FormationsDemoDb;
      return (db.formation_plans ?? [])
        .filter((p) => p.video_id === videoId && isLive(p))
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
        .map((p) => ({
          ...p,
          members: demoPlanMembers(db, p.id),
          formationCount: (db.formations ?? []).filter((f) => f.plan_id === p.id && isLive(f)).length,
        }));
    }),
  getPlan: (planId) =>
    query((raw) => {
      const db = raw as FormationsDemoDb;
      const plan = (db.formation_plans ?? []).find((p) => p.id === planId && isLive(p));
      if (!plan) return null;
      return {
        plan,
        members: demoPlanMembers(db, plan.id),
        formations: (db.formations ?? [])
          .filter((f) => f.plan_id === plan.id && isLive(f))
          .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)),
      };
    }),
  createPlan: async (row) =>
    mutate((raw) => {
      const db = raw as FormationsDemoDb;
      if (!db.videos.some((v) => v.id === row.video_id)) throw demoError('formation_video_not_found');
      const plan: FormationPlan = {
        id: crypto.randomUUID(),
        crew_id: db.crews[0]!.id,
        video_id: row.video_id,
        name: row.name.trim(),
        stage_width: row.stage_width,
        stage_depth: row.stage_depth,
        grid: 0.5,
        bpm: null,
        first_beat: null,
        revision: 0,
        created_at: now(),
        archived_at: null,
      };
      demoCheckPlan(plan);
      (db.formation_plans ??= []).push(plan);
      demoSetParticipants(db, plan.id, row.members);
      return plan;
    }),
  updatePlan: async (planId, expected, patch) =>
    mutate((raw): RevisionResult<{ plan: FormationPlan }> => {
      const db = raw as FormationsDemoDb;
      const plan = demoPlan(db, planId);
      if (plan.revision !== expected) return demoConflict(plan);
      const { members, ...fields } = patch;
      const next = { ...plan, ...fields, name: (fields.name ?? plan.name).trim() };
      demoCheckPlan(next);
      if (members) demoSetParticipants(db, plan.id, members);
      Object.assign(plan, next, { revision: plan.revision + 1 });
      for (const f of db.formations ?? []) {
        if (f.plan_id !== plan.id || !isLive(f)) continue;
        f.positions = fitPositions(f.positions, { width: plan.stage_width, depth: plan.stage_depth });
        f.props = fitProps(f.props ?? [], { width: plan.stage_width, depth: plan.stage_depth });
      }
      return { ok: true, revision: plan.revision, plan: { ...plan } };
    }),
  duplicatePlan: async (planId, name) =>
    mutate((raw) => {
      const db = raw as FormationsDemoDb;
      const source = demoPlan(db, planId);
      const plan: FormationPlan = {
        ...source,
        id: crypto.randomUUID(),
        name: name.trim(),
        revision: 0,
        created_at: now(),
      };
      demoCheckPlan(plan);
      (db.formation_plans ??= []).push(plan);
      demoSetParticipants(db, plan.id, demoPlanMembers(db, source.id));
      const copies = (db.formations ?? [])
        .filter((f) => f.plan_id === source.id && isLive(f))
        .map((f) => ({
          ...structuredClone(f),
          id: crypto.randomUUID(),
          plan_id: plan.id,
          created_at: now(),
        }));
      (db.formations ??= []).push(...copies);
      return plan;
    }),
  deletePlan: async (planId) =>
    mutate((raw) => {
      const db = raw as FormationsDemoDb;
      const plan = (db.formation_plans ?? []).find((p) => p.id === planId && isLive(p));
      if (!plan) return;
      const at = now();
      plan.archived_at = at;
      for (const f of db.formations ?? []) if (f.plan_id === planId && isLive(f)) f.archived_at = at;
      for (const m of db.formation_plan_members ?? [])
        if (m.plan_id === planId && isLive(m)) m.archived_at = at;
    }),
  saveFormation: async (planId, expected, input) =>
    mutate((raw): RevisionResult<{ formation: Formation }> => {
      const db = raw as FormationsDemoDb;
      const plan = demoPlan(db, planId);
      if (plan.revision !== expected) return demoConflict(plan);
      const at = roundTime(input.at);
      const note = input.note?.trim() || null;
      const problem = formationError(
        { ...input, at, note },
        { width: plan.stage_width, depth: plan.stage_depth },
      );
      if (problem) throw demoError(problem);
      const known = new Set((db.members ?? []).map((m) => m.id));
      if (Object.keys(input.positions).some((id) => !known.has(id))) throw demoError('formation_invalid');
      const list = (db.formations ??= []);
      if (
        list.some(
          (f) => f.plan_id === plan.id && isLive(f) && f.id !== input.id && Math.abs(f.at - at) < 0.005,
        )
      ) {
        throw demoError('formation_time_taken');
      }
      let row = list.find((f) => f.id === input.id);
      if (row && row.plan_id !== plan.id) throw demoError('formation_not_found');
      if (row) {
        Object.assign(row, {
          at,
          transition: input.transition,
          positions: structuredClone(input.positions),
          note,
          // Like the server: no props sent keeps the formation's own.
          props: structuredClone(input.props ?? row.props ?? []),
          archived_at: null,
        });
      } else {
        if (list.filter((f) => f.plan_id === plan.id && isLive(f)).length >= 300)
          throw demoError('formations_cap_reached');
        row = {
          id: input.id,
          crew_id: plan.crew_id,
          plan_id: plan.id,
          at,
          transition: input.transition,
          positions: structuredClone(input.positions),
          note,
          props: structuredClone(input.props ?? []),
          created_at: now(),
          archived_at: null,
        };
        list.push(row);
      }
      plan.revision += 1;
      return { ok: true, revision: plan.revision, formation: { ...row } };
    }),
  deleteFormation: async (planId, expected, formationId) =>
    mutate((raw): RevisionResult => {
      const db = raw as FormationsDemoDb;
      const plan = demoPlan(db, planId);
      if (plan.revision !== expected) return demoConflict(plan);
      const row = (db.formations ?? []).find(
        (f) => f.id === formationId && f.plan_id === plan.id && isLive(f),
      );
      if (!row) throw demoError('formation_not_found');
      row.archived_at = now();
      plan.revision += 1;
      return { ok: true, revision: plan.revision };
    }),
};
