import type { FormationPlan, Video } from '@coverscape/shared';
import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import {
  formationErrorMessage,
  useCreateFormationPlan,
  useFormationMembers,
  useUpdateFormationPlan,
  type FormationMember,
  type FormationPlanSummary,
} from '@/data/formations';
import { MemberSeal } from '@/features/members/MembersUI';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { useToast } from '@/providers/ToastProvider';
import { DEFAULT_STAGE, PLAN_NAME_MAX, planNameError, stageSizeError, STAGE_MAX, STAGE_MIN } from './formationRules';

export interface PlanFormValue {
  name: string;
  members: string[];
  width: number;
  depth: number;
}

/** Participants as toggles (the live members; an archived one already in the plan shows greyed out). */
function ParticipantPicker({
  people,
  value,
  onChange,
}: {
  people: FormationMember[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  if (people.length === 0) {
    return <p className="text-sm text-washi-muted">Aún no hay nadie en el grupo: añade a la gente en Ajustes.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {people.map((m) => {
        const on = value.includes(m.id);
        return (
          <motion.button
            key={m.id}
            type="button"
            role="checkbox"
            aria-checked={on}
            disabled={m.archived && !on}
            onClick={() => onChange(on ? value.filter((id) => id !== m.id) : [...value, m.id])}
            whileTap={{ scale: 0.92 }}
            transition={jelly}
            className={cn(
              'flex h-11 max-w-full items-center gap-2 rounded-[10px] border pl-1.5 pr-3 text-[14px] font-bold transition-colors disabled:opacity-40',
              on ? 'border-kin-300 bg-washi/[0.1] text-washi' : 'border-line text-washi-muted hover:border-line-strong',
            )}
          >
            <MemberSeal member={m.archived ? null : m} size="sm" />
            <span className={cn('truncate', m.archived && 'text-washi-subtle')}>{m.name}</span>
            {on && <Check className="size-4 text-kin-300" aria-hidden />}
          </motion.button>
        );
      })}
    </div>
  );
}

/** The plan's form: name, who dances and the stage size (create, and «Ajustes del plan» in the editor). */
export function PlanForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
  extraPeople,
}: {
  initial: PlanFormValue;
  submitLabel: string;
  pending: boolean;
  onSubmit: (value: PlanFormValue) => void;
  onCancel: () => void;
  /** People to list besides the live members (archived ones still in the plan). */
  extraPeople?: FormationMember[];
}) {
  const members = useFormationMembers();
  const [name, setName] = useState(initial.name);
  const [ids, setIds] = useState(initial.members);
  const [width, setWidth] = useState(String(initial.width));
  const [depth, setDepth] = useState(String(initial.depth));
  const [error, setError] = useState<{ field: 'name' | 'stage' | 'members'; message: string } | null>(null);
  const people = [
    ...(members.data ?? []).filter((m) => !m.archived || initial.members.includes(m.id)),
    ...(extraPeople ?? []).filter((p) => !(members.data ?? []).some((m) => m.id === p.id)),
  ];

  function submit(event: FormEvent) {
    event.preventDefault();
    const nameProblem = planNameError(name);
    if (nameProblem) return setError({ field: 'name', message: nameProblem });
    const w = Number(width.replace(',', '.'));
    const d = Number(depth.replace(',', '.'));
    const stageProblem = stageSizeError(w, d);
    if (stageProblem) return setError({ field: 'stage', message: stageProblem });
    if (ids.length === 0) return setError({ field: 'members', message: 'Elige al menos a una persona.' });
    setError(null);
    onSubmit({ name: name.trim(), members: ids, width: w, depth: d });
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Field
        label="Nombre"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={PLAN_NAME_MAX}
        placeholder="Con 5, Con 4 si falta alguien…"
        error={error?.field === 'name' ? error.message : null}
        autoComplete="off"
      />
      <fieldset>
        <legend className="mb-1.5 block text-[13px] font-medium text-washi-muted">Quién baila</legend>
        {members.isPending ? (
          <p className="text-sm text-washi-muted">Cargando el grupo…</p>
        ) : (
          <ParticipantPicker people={people} value={ids} onChange={setIds} />
        )}
        {error?.field === 'members' && (
          <p role="alert" className="mt-1.5 text-[13px] text-enji-300">
            {error.message}
          </p>
        )}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Ancho (m)"
          inputMode="decimal"
          value={width}
          onChange={(e) => setWidth(e.target.value)}
          error={error?.field === 'stage' ? error.message : null}
          hint={`De ${STAGE_MIN} a ${STAGE_MAX} m`}
        />
        <Field label="Fondo (m)" inputMode="decimal" value={depth} onChange={(e) => setDepth(e.target.value)} hint="Rejilla de 0,5 m" />
      </div>
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function NewPlanDialog({
  open,
  onClose,
  video,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  video: Video;
  onCreated: (plan: FormationPlan) => void;
}) {
  const members = useFormationMembers();
  const create = useCreateFormationPlan();
  const toast = useToast();
  const live = (members.data ?? []).filter((m) => !m.archived).map((m) => m.id);
  return (
    <Dialog open={open} onClose={onClose} title="Nuevo plan" busy={create.isPending}>
      {open && !members.isPending && (
        <PlanForm
          initial={{ name: live.length ? `Con ${live.length}` : '', members: live, width: DEFAULT_STAGE.width, depth: DEFAULT_STAGE.depth }}
          submitLabel="Crear plan"
          pending={create.isPending}
          onCancel={onClose}
          onSubmit={(value) =>
            create
              .mutateAsync({ video_id: video.id, name: value.name, members: value.members, stage_width: value.width, stage_depth: value.depth })
              .then((plan) => {
                onClose();
                onCreated(plan);
              })
              .catch((err) => toast(formationErrorMessage(err), 'error'))
          }
        />
      )}
    </Dialog>
  );
}

/** «Renombrar» from the list. */
export function PlanNameDialog({ plan, onClose }: { plan: FormationPlanSummary | null; onClose: () => void }) {
  const update = useUpdateFormationPlan();
  const toast = useToast();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (plan) {
      setName(plan.name);
      setError(null);
    }
  }, [plan]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!plan) return;
    const problem = planNameError(name);
    if (problem) return setError(problem);
    update
      .mutateAsync({ planId: plan.id, revision: plan.revision, videoId: plan.video_id, patch: { name: name.trim() } })
      .then(onClose)
      .catch((err) => toast(formationErrorMessage(err), 'error'));
  }

  return (
    <Dialog open={plan != null} onClose={onClose} title="Renombrar plan" size="sm" busy={update.isPending}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field label="Nombre" value={name} onChange={(e) => setName(e.target.value)} maxLength={PLAN_NAME_MAX} error={error} autoComplete="off" />
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={update.isPending}>
            Cancelar
          </Button>
          <Button type="submit" loading={update.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
