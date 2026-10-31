import { demoFormations } from './formations.demo';
import { supabaseFormations } from './formations.supabase';
import { IS_DEMO } from './mode';
import type { FormationsBackend } from './types';

// REQ-08 · `IS_DEMO` is a build-time constant (false in production), so the demo branch and its module drop out.
export const formationsBackend: FormationsBackend = IS_DEMO ? demoFormations : supabaseFormations;

export type {
  FormationInput,
  FormationMember,
  FormationPlanFull,
  FormationPlanPatch,
  FormationPlanSummary,
  FormationsBackend,
  NewFormationPlan,
  RevisionResult,
} from './types';
