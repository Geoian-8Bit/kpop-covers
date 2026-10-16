import { AnimatePresence, motion } from 'motion/react';
import { Component, Suspense, type ReactNode } from 'react';
import { ElasticToggle } from '@/components/ui/ElasticToggle';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { jelly, soft } from '@/lib/motion';
import { MOMENTS, setLabEnabled, setVariant, useDesignLab } from './designLab';
import { DEMOS } from './demos';
import { resolveVariant, type DesignMoment } from './labState';

/** Ajustes › Laboratorio de diseño: a switch, then every key moment with its variants and a live demo. */
export function DesignLabSection() {
  const enabled = useDesignLab((state) => state.enabled);

  return (
    <section aria-labelledby="lab-title" className="sep-t px-5 pb-9 pt-7 sm:px-9">
      <SectionTitle id="lab-title" glyph="試作">
        Laboratorio de diseño
      </SectionTitle>
      <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-washi-muted">
        Algunos momentos de la app tienen más de un diseño. Pruébalos aquí y quédate con el que te funcione
        mejor: la elección solo cambia este dispositivo.
      </p>
      <ElasticToggle
        className="mt-4"
        label="Mostrar laboratorio de diseño"
        checked={enabled}
        onChange={setLabEnabled}
      />
      <p className="mt-1 text-[13px] leading-relaxed text-washi-subtle">
        {enabled
          ? 'Tus elecciones ya se aplican en la app.'
          : 'Oculto. Los diseños que elegiste siguen aplicándose; sin elección, la app usa el recomendado.'}
      </p>

      <AnimatePresence initial={false}>
        {enabled && (
          <motion.div
            key="moments"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
            transition={soft}
            className="mt-7"
          >
            {MOMENTS.map((moment) => (
              <MomentPanel key={moment.id} moment={moment} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function MomentPanel({ moment }: { moment: (typeof MOMENTS)[number] }) {
  const current = useDesignLab((state) => resolveVariant(state, MOMENTS, moment.id)) ?? moment.defaultVariant;
  const chosen = moment.variants.find((v) => v.id === current) ?? moment.variants[0];
  const titleId = `lab-${moment.id}-title`;
  const Demo = DEMOS[moment.id];

  return (
    <article aria-labelledby={titleId} className="sep-t py-7 last:pb-0">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {moment.code && (
          <span className="font-mono text-[12px] font-bold tracking-[0.08em] text-kin-300">
            {moment.code}
          </span>
        )}
        <h3 id={titleId} className="font-display text-[18px] font-bold leading-tight text-washi">
          {moment.name}
        </h3>
      </header>
      <p className="mt-1.5 text-sm leading-relaxed text-washi-muted">{moment.description}</p>

      <VariantPicker moment={moment} value={chosen.id} />
      <p aria-live="polite" className="mt-3 min-h-[3em] text-sm leading-relaxed text-washi-muted">
        <span className="font-bold text-washi">{chosen.label}.</span> {chosen.description}
      </p>

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[13px] font-bold tracking-[0.04em] text-washi">Ver en acción</span>
          <span aria-hidden className="h-px flex-1 bg-line" />
          <span aria-hidden className="font-display text-[13px] font-bold text-shu-400">
            演
          </span>
        </div>
        <div className="well overflow-hidden rounded-[12px]">
          <DemoBoundary resetKey={chosen.id}>
            <Suspense fallback={<DemoLoading />}>
              <Demo variant={chosen.id} />
            </Suspense>
          </DemoBoundary>
        </div>
      </div>
    </article>
  );
}

/** Radio cards (native radios: arrow keys move between them). The active one carries a springy indigo frame. */
function VariantPicker({ moment, value }: { moment: DesignMoment; value: string }) {
  return (
    <fieldset className="mt-4">
      <legend className="sr-only">Diseño para «{moment.name}»</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {moment.variants.map((variant) => {
          const active = variant.id === value;
          const recommended = variant.id === moment.defaultVariant;
          return (
            <motion.label
              key={variant.id}
              whileTap={{ scale: 0.97 }}
              transition={jelly}
              className={cn(
                'relative isolate flex min-h-14 cursor-pointer items-center gap-3 rounded-[10px] border px-3.5 py-2.5 transition-colors',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-kin-300',
                active ? 'border-transparent' : 'border-line hover:border-line-strong hover:bg-washi/[0.03]',
              )}
            >
              <input
                type="radio"
                name={`lab-${moment.id}`}
                value={variant.id}
                checked={active}
                onChange={() => setVariant(moment.id, variant.id)}
                className="sr-only"
              />
              {active && (
                <motion.span
                  aria-hidden
                  layoutId={`lab-pick-${moment.id}`}
                  transition={jelly}
                  className="absolute inset-0 -z-10 rounded-[10px] border border-ai-400/80 bg-ai-800/45 shadow-[inset_0_1px_0_rgb(255_246_230/0.06)]"
                />
              )}
              <span
                aria-hidden
                className={cn(
                  'grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors',
                  active ? 'border-ai-300' : 'border-washi-subtle/70',
                )}
              >
                <motion.span
                  className="size-2 rounded-full bg-washi"
                  initial={false}
                  animate={{ scale: active ? 1 : 0 }}
                  transition={jelly}
                />
              </span>
              <span className="min-w-0">
                <span
                  className={cn('block text-[15px] font-bold', active ? 'text-washi' : 'text-washi-muted')}
                >
                  {variant.label}
                </span>
                {recommended && (
                  <span className="mt-0.5 inline-block rounded-[4px] border border-shu-400/60 px-1.5 text-[11px] font-bold leading-[18px] tracking-[0.04em] text-shu-400">
                    Recomendada
                  </span>
                )}
              </span>
            </motion.label>
          );
        })}
      </div>
    </fieldset>
  );
}

function DemoLoading() {
  return (
    <div role="status" className="grid min-h-[260px] place-items-center p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Spinner className="size-7 text-kin-300" label="Cargando la demostración" />
        <p className="text-[13px] text-washi-subtle">Preparando la demostración…</p>
      </div>
    </div>
  );
}

interface DemoBoundaryProps {
  children: ReactNode;
  resetKey: unknown;
}

/**
 * A demo that fails (chunk offline, render error) stays inside its stage instead of taking the page down.
 * React caches a failed lazy chunk, so the way out is a reload (the choices are already saved).
 */
class DemoBoundary extends Component<DemoBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidUpdate(prev: DemoBoundaryProps) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="grid min-h-[260px] place-items-center p-6 text-center">
        <div>
          <p className="text-sm text-washi-muted">No se pudo mostrar la demostración.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 inline-flex min-h-11 items-center rounded-[10px] px-3 text-sm font-medium text-kin-300 hover:underline"
          >
            Recargar
          </button>
        </div>
      </div>
    );
  }
}
