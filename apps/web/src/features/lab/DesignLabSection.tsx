import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown } from 'lucide-react';
import { Component, Suspense, useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { jelly, soft } from '@/lib/motion';
import { setVariant, useDesignVariant } from './labState';
import { MOMENTS } from './registry';
import type { LabMoment } from './types';

/**
 * Ajustes › Laboratorio de diseño (temporary): every moment on trial with its variants, a live demo of the one being
 * looked at and «Usar esta». Moments start folded, so a demo only downloads when its moment is opened.
 */
export function DesignLabSection() {
  if (MOMENTS.length === 0) return null;
  return (
    <section aria-labelledby="lab-title" className="sep-t px-5 pb-9 pt-7 sm:px-9">
      <SectionTitle id="lab-title" glyph="試作">
        Laboratorio de diseño
      </SectionTitle>
      <div className="mt-2 max-w-prose space-y-2 text-[15px] leading-relaxed text-washi-muted">
        <p>
          Es temporal. Aquí están los diseños que aún están en duda: prueba cada propuesta y pulsa «Usar esta» en la
          que más te guste. El responsable elige probando y después se quitan las demás.
        </p>
        <p className="text-[13px] text-washi-subtle">La elección solo cambia este dispositivo.</p>
      </div>
      <div className="mt-5">
        {MOMENTS.map((moment) => (
          <MomentPanel key={moment.id} moment={moment} />
        ))}
      </div>
    </section>
  );
}

function MomentPanel({ moment }: { moment: LabMoment }) {
  const inUse = useDesignVariant(moment.id) || moment.defaultVariant;
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(inUse);
  const bodyId = useId();
  const titleId = useId();
  const shown = moment.variants.find((v) => v.id === viewing) ?? moment.variants[0]!;
  const inUseLabel = moment.variants.find((v) => v.id === inUse)?.label ?? '';
  const Demo = shown.Demo;

  return (
    <article aria-labelledby={titleId} className="sep-t py-4 first:pt-0 last:pb-0">
      <h3 id={titleId}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-14 w-full items-center gap-3 rounded-[10px] py-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-2.5">
              <span className="font-mono text-[12px] font-bold tracking-[0.08em] text-kin-300">{moment.code}</span>
              <span className="font-display text-[18px] font-bold leading-tight text-washi">{moment.name}</span>
            </span>
            <span className="mt-0.5 block text-[13px] text-washi-subtle">
              En uso: <span className="font-bold text-washi-muted">{inUseLabel}</span>
              {moment.appliesLive && ' · cambia la app en este móvil'}
            </span>
          </span>
          <motion.span aria-hidden animate={{ rotate: open ? 180 : 0 }} transition={jelly} className="shrink-0">
            <ChevronDown className="size-5 text-washi-muted" />
          </motion.span>
        </button>
      </h3>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={bodyId}
            key="body"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={soft}
            className="pb-2 pt-1"
          >
            <p className="max-w-prose text-sm leading-relaxed text-washi-muted">{moment.description}</p>

            <fieldset className="mt-4">
              <legend className="sr-only">Propuesta que ves para «{moment.name}»</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {moment.variants.map((variant) => {
                  const active = variant.id === shown.id;
                  return (
                    <motion.label
                      key={variant.id}
                      whileTap={{ scale: 0.97 }}
                      transition={jelly}
                      className={cn(
                        'relative isolate flex min-h-12 cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2 transition-colors',
                        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-kin-300',
                        active ? 'border-transparent' : 'border-line hover:border-line-strong',
                      )}
                    >
                      <input
                        type="radio"
                        name={`lab-${moment.id}`}
                        value={variant.id}
                        checked={active}
                        onChange={() => setViewing(variant.id)}
                        className="sr-only"
                      />
                      {active && (
                        <motion.span
                          aria-hidden
                          layoutId={`lab-view-${moment.id}`}
                          transition={jelly}
                          className="absolute inset-0 -z-10 rounded-[10px] border border-ai-400/80 bg-ai-800/45"
                        />
                      )}
                      <span className={cn('min-w-0 flex-1 truncate text-[14px] font-bold', active ? 'text-washi' : 'text-washi-muted')}>
                        {variant.label}
                      </span>
                      {variant.id === inUse && (
                        <span className="shrink-0 rounded-[4px] border border-shu-400/60 px-1 text-[10.5px] font-bold leading-[16px] text-shu-400">
                          En uso
                        </span>
                      )}
                    </motion.label>
                  );
                })}
              </div>
            </fieldset>

            <div aria-live="polite" className="mt-3">
              <p className="text-sm leading-relaxed text-washi-muted">
                <span className="font-bold text-washi">{shown.label}.</span> {shown.description}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              {shown.id === inUse ? (
                <p className="inline-flex h-11 items-center gap-2 text-sm font-bold text-kin-300">
                  <Check className="size-4" /> Es la que usas{moment.appliesLive ? ' en la app' : ''}
                </p>
              ) : (
                <Button onClick={() => setVariant(moment.id, shown.id)}>Usar esta</Button>
              )}
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[13px] font-bold tracking-[0.04em] text-washi">Pruébala aquí</span>
                <span aria-hidden className="h-px flex-1 bg-line" />
                <span aria-hidden className="font-display text-[13px] font-bold text-shu-400">
                  演
                </span>
              </div>
              <div className="well overflow-hidden rounded-[12px]">
                <DemoBoundary resetKey={shown.id}>
                  <Suspense fallback={<DemoLoading />}>
                    <Demo key={shown.id} />
                  </Suspense>
                </DemoBoundary>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
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
          <p className="text-sm text-washi-muted">
            {navigator.onLine ? 'No se pudo mostrar la demostración.' : 'Sin conexión: la demostración no se ha descargado.'}
          </p>
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
