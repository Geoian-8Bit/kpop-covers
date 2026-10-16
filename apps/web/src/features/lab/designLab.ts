import { create } from 'zustand';
import { isKnownVariant, parseLab, resolveVariant, type DesignMoment, type LabState } from './labState';

export type { DesignMoment, DesignVariant, LabState } from './labState';

/**
 * Key moments of the app that have more than one design to try. Each one is chosen per device in
 * Ajustes › Laboratorio de diseño and read by its component with `useDesignVariant(id)`.
 *
 * To add a moment: append an entry here (stable ids, `defaultVariant` = the recommended one), add its demo
 * to `DEMOS` in `demos.tsx` (the type requires it) and read the variant in the real component.
 * Planned next, not added yet: bag-draw, random-play, vote-reveal, reactions, event-countdown, clap-arm,
 * review-compare, voice-split.
 */
export const MOMENTS = [
  {
    id: 'record-settings',
    code: 'A1',
    name: 'Panel de ajustes del grabador',
    description: 'Cómo se abren los ajustes de cámara y sonido mientras preparas una toma.',
    defaultVariant: 'tray',
    variants: [
      {
        id: 'tray',
        label: 'Bandeja de laca',
        description: 'Una hoja inferior sobria con los ajustes en filas agrupadas. Clara y rápida de leer.',
      },
      {
        id: 'fan',
        label: 'Abanico',
        description:
          'Los ajustes se despliegan desde el botón ⚙ como las varillas de un sensu, con física de muelle.',
      },
      {
        id: 'scroll',
        label: 'Makimono',
        description: 'Un rollo que se desenrolla de lado, con cada ajuste como una columna del pergamino.',
      },
    ],
  },
] as const satisfies readonly DesignMoment[];

export type MomentId = (typeof MOMENTS)[number]['id'];
export type VariantId<M extends MomentId> = Extract<
  (typeof MOMENTS)[number],
  { id: M }
>['variants'][number]['id'];

export const STORAGE_KEY = 'oneshoot.lab.v1';

function read(): LabState {
  try {
    return parseLab(localStorage.getItem(STORAGE_KEY), MOMENTS);
  } catch {
    return { enabled: false, choices: {} };
  }
}

function write(state: LabState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: state.enabled, choices: state.choices }));
  } catch {
    // Private mode or full storage: the choice still applies until the page is closed.
  }
}

export const useDesignLab = create<LabState>(() => read());

/** Saves a variant for a moment on this device, at once. Unknown moments or variants are ignored. */
export function setVariant(momentId: string, variantId: string): void {
  if (!isKnownVariant(MOMENTS, momentId, variantId)) return;
  const { enabled, choices } = useDesignLab.getState();
  if (choices[momentId] === variantId) return;
  const next = { enabled, choices: { ...choices, [momentId]: variantId } };
  useDesignLab.setState(next);
  write(next);
}

/** Shows or hides the lab. Off = the recommended designs apply; the choices are kept for next time. */
export function setLabEnabled(enabled: boolean): void {
  const state = useDesignLab.getState();
  if (state.enabled === enabled) return;
  const next = { enabled, choices: state.choices };
  useDesignLab.setState(next);
  write(next);
}

/** The variant that applies to a moment: the saved choice (whether or not the lab is shown), else the recommended one. */
export function useDesignVariant<M extends MomentId>(momentId: M): VariantId<M> {
  return useDesignLab((state) => resolveVariant(state, MOMENTS, momentId)) as VariantId<M>;
}

/** Same as `useDesignVariant`, outside React. */
export function getDesignVariant<M extends MomentId>(momentId: M): VariantId<M> {
  return resolveVariant(useDesignLab.getState(), MOMENTS, momentId) as VariantId<M>;
}

// Another tab changed the lab: follow it.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === null) useDesignLab.setState(read());
  });
}
