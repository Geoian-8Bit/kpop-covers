import type { Video } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { Copy, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/SectionTitle';
import {
  formationErrorMessage,
  useDeleteFormationPlan,
  useDuplicateFormationPlan,
  useFormationPlans,
  type FormationPlanSummary,
} from '@/data/formations';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { useToast } from '@/providers/ToastProvider';
import { PlanNameDialog, NewPlanDialog } from './PlanDialogs';
import { formationPath } from './formationLinks';

const rowAction =
  'relative grid size-9 shrink-0 place-items-center rounded-[8px] text-washi-subtle before:absolute before:-inset-1 before:content-[""] hover:bg-washi/[0.06] hover:text-washi';

/** REQ-06 · The studio's «Formaciones» tab: the plans of this song, a new one, rename, duplicate and delete. */
export function FormationsPanel({ video }: { video: Video }) {
  const plans = useFormationPlans(video.id);
  const navigate = useNavigate();
  const toast = useToast();
  const duplicate = useDuplicateFormationPlan();
  const remove = useDeleteFormationPlan();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<FormationPlanSummary | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const armedAt = useRef(0);

  useEffect(() => {
    if (!confirmId) return;
    const timer = setTimeout(() => setConfirmId(null), 2600);
    return () => clearTimeout(timer);
  }, [confirmId]);

  const list = plans.data ?? [];

  function onDuplicate(plan: FormationPlanSummary) {
    const name = `${plan.name} (copia)`.slice(0, 60);
    duplicate
      .mutateAsync({ planId: plan.id, name })
      .then(() => toast(`Plan duplicado: «${name}»`, 'success'))
      .catch((err) => toast(formationErrorMessage(err), 'error'));
  }

  function onDelete(plan: FormationPlanSummary) {
    if (confirmId !== plan.id) {
      armedAt.current = performance.now();
      setConfirmId(plan.id);
      return;
    }
    if (performance.now() - armedAt.current < 400) return;
    setConfirmId(null);
    remove
      .mutateAsync({ planId: plan.id, videoId: video.id })
      .then(() => toast(`«${plan.name}» borrado`, 'info'))
      .catch((err) => toast(formationErrorMessage(err), 'error'));
  }

  return (
    <aside className="@container flex flex-col p-5 sm:p-6">
      {/* Narrow (a phone): the button under the title, full width; it never pushes past the edge. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <SectionTitle
          className="w-full min-w-0 @md:w-auto @md:flex-1"
          glyph="陣"
          aside={<span className="tabular text-sm font-medium text-washi-subtle">{list.length}</span>}
        >
          Formaciones
        </SectionTitle>
        <Button size="sm" variant="secondary" className="h-11 w-full @md:h-9 @md:w-auto" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Nuevo plan
        </Button>
      </div>

      {plans.isPending ? (
        <div className="mt-4 space-y-2" role="status" aria-label="Cargando planes">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="skeleton h-[60px] rounded-[12px]" />
          ))}
        </div>
      ) : plans.isError ? (
        <div className="mt-6 px-2 pb-4 text-center">
          <p className="text-sm text-washi-muted">No se pudieron cargar los planes.</p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => void plans.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : list.length === 0 ? (
        <div className="mt-6 px-2 pb-4 text-center">
          <p className="font-display text-lg font-bold">Aún no hay planes</p>
          <p className="mt-2 text-sm leading-relaxed text-washi-muted">
            Un plan coloca a cada persona en el escenario, sincronizado con la canción. Haz uno para cada reparto: «Con 5»,
            «Con 4 si falta alguien»…
          </p>
        </div>
      ) : (
        <ul className="-mx-1 mt-3 space-y-1 px-1 pb-1">
          <AnimatePresence initial={false}>
            {list.map((plan) => {
              const confirming = confirmId === plan.id;
              return (
                <motion.li
                  key={plan.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -30, transition: { duration: 0.16 } }}
                  transition={jelly}
                >
                  <div className="flex items-center gap-2 rounded-[12px] p-2 hover:bg-washi/[0.04]">
                    <button
                      type="button"
                      onClick={() => navigate(formationPath(video.id, plan.id))}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] text-left transition-[scale] duration-150 active:scale-[0.98]"
                    >
                      <span className="grid size-10 shrink-0 rotate-[-3deg] place-items-center rounded-[5px] bg-ai-600 font-display text-lg font-extrabold text-washi shadow-[inset_0_0_0_3px_rgb(0_0_0/0.08),inset_0_0_0_4px_rgb(243_236_223/0.4)]">
                        陣
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{plan.name}</span>
                        <span className="tabular mt-0.5 flex items-center gap-1.5 whitespace-nowrap font-mono text-xs text-washi-muted">
                          <Users className="size-3" aria-hidden />
                          {plan.members.length}
                          <span className="text-washi-subtle">·</span>
                          {plan.formationCount === 1 ? '1 formación' : `${plan.formationCount} formaciones`}
                          <span className="text-washi-subtle">·</span>
                          {plan.stage_width}×{plan.stage_depth} m
                        </span>
                      </span>
                    </button>
                    <motion.button
                      type="button"
                      aria-label={`Renombrar ${plan.name}`}
                      title="Renombrar"
                      onClick={() => setRenaming(plan)}
                      whileTap={{ scale: 0.85, rotate: -8 }}
                      transition={jelly}
                      className={rowAction}
                    >
                      <Pencil className="size-4" />
                    </motion.button>
                    <motion.button
                      type="button"
                      aria-label={`Duplicar ${plan.name}`}
                      title="Duplicar"
                      disabled={duplicate.isPending}
                      onClick={() => onDuplicate(plan)}
                      whileTap={{ scale: 0.85 }}
                      transition={jelly}
                      className={cn(rowAction, 'disabled:opacity-40')}
                    >
                      <Copy className="size-4" />
                    </motion.button>
                    <motion.button
                      type="button"
                      layout
                      aria-label={confirming ? `Confirmar borrar ${plan.name}` : `Borrar ${plan.name}`}
                      onClick={() => onDelete(plan)}
                      whileTap={{ scale: 0.85 }}
                      transition={jelly}
                      className={cn(
                        'relative flex h-9 shrink-0 items-center justify-center gap-1 rounded-[8px] text-xs font-medium before:absolute before:-inset-1 before:content-[""]',
                        confirming ? 'bg-enji-500 px-3 text-washi' : 'w-9 text-washi-subtle hover:bg-washi/[0.06] hover:text-enji-300',
                      )}
                    >
                      <Trash2 className="size-4" />
                      {confirming && <span>Borrar</span>}
                    </motion.button>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <NewPlanDialog
        open={creating}
        onClose={() => setCreating(false)}
        video={video}
        onCreated={(plan) => navigate(formationPath(video.id, plan.id))}
      />
      <PlanNameDialog plan={renaming} onClose={() => setRenaming(null)} />
    </aside>
  );
}
