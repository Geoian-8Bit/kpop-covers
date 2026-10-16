import { create } from 'zustand';
import { isKnownVariant, parseLab, resolveVariant, type DesignMoment, type LabState } from './labState';

export type { DesignMoment, DesignVariant, LabState } from './labState';

/**
 * Key moments of the app that have more than one design to try. Each one is chosen per device in
 * Ajustes › Laboratorio de diseño and read by its component with `useDesignVariant(id)`.
 *
 * To add a moment: append an entry here (stable ids, `defaultVariant` = the recommended one), add its demo
 * to `DEMOS` in `demos.tsx` (the type requires it) and read the variant in the real component.
 * Planned next, not added yet: vote-reveal, reactions, event-countdown.
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
  {
    id: 'voice-split',
    code: 'F17',
    name: 'Separar voz y música',
    description:
      'Elegir entre la canción entera, la música sin la voz o la voz al frente. Solo con el archivo del vídeo.',
    defaultVariant: 'onda',
    variants: [
      {
        id: 'onda',
        label: 'La ola partida',
        description:
          'La ola de la app se parte en dos franjas, la voz en bermellón y la música en índigo; la que quitas se aquieta. Debajo, tres sellos.',
      },
      {
        id: 'fusuma',
        label: 'Puertas correderas',
        description:
          'Dos puertas de papel washi se deslizan con muelle sobre la voz o la música para tapar lo que se quita.',
      },
      {
        id: 'capas',
        label: 'Capas de grabado',
        description:
          'Tres planchas de ukiyo-e apiladas (todo, música, voz): la elegida pasa al frente con sus marcas de registro.',
      },
    ],
  },
  {
    id: 'clap-arm',
    code: 'F7',
    name: 'Armar y empezar con un aplauso',
    description:
      'La pantalla del grabador armado: «Esperando señal…», el nivel de la sala y la marca que debe alcanzar el doble aplauso.',
    defaultVariant: 'taiko',
    variants: [
      {
        id: 'taiko',
        label: 'Taiko',
        description:
          'Un tambor taiko visto de frente: el parche se hincha con el sonido, cada palmada lo cruza con una onda y gira el mitsudomoe; el borde es el nivel.',
      },
      {
        id: 'hyoshigi',
        label: 'Hyōshigi',
        description:
          'Las dos tablillas de madera del kabuki, colgadas de su cordón: se acercan con el sonido y chocan en cada palmada; la segunda las enciende.',
      },
      {
        id: 'enso',
        label: 'Ensō',
        description:
          'Un círculo de tinta sobre washi que se dibuja hasta donde llega el sonido; la primera palmada deja medio trazo y la segunda lo cierra con el sello.',
      },
    ],
  },
  {
    id: 'review-compare',
    code: 'F5',
    name: 'Repaso: comparar la toma con el original',
    description:
      'Cómo comparten pantalla la toma y el original en «Apilado» y «Superpuesto». Los mismos controles en las tres: orden, reparto, transparencia y encaje con dos dedos.',
    defaultVariant: 'biombo',
    variants: [
      {
        id: 'biombo',
        label: 'Biombo',
        description:
          'La recomendada. Dos paneles de laca con una bisagra dorada que se arrastra para repartir el espacio; en «Superpuesto», el original va dentro de un marco de biombo que se mueve y escala hasta que los cuerpos coinciden. Es la que menos tapa el vídeo.',
      },
      {
        id: 'cortina',
        label: 'Cortina',
        description:
          'Un noren: en «Apilado» los dos llenan el marco y una cortina índigo los separa; se barre a un lado y a otro para comparar el mismo sitio. En «Superpuesto» el original entra como una tela.',
      },
      {
        id: 'linterna',
        label: 'Linterna',
        description:
          'El original como silueta de tinta luminosa (alto contraste y mezcla de luz) sobre la toma, para ver solo el contorno del cuerpo; en «Apilado», paneles de farolillo de papel.',
      },
    ],
  },
  {
    id: 'bag-draw',
    code: 'F13',
    name: 'Sacar de una bolsa',
    description: 'La animación corta del sorteo al pulsar «Sacar» en una bolsa de canciones, clips o personas.',
    defaultVariant: 'omikuji',
    variants: [
      {
        id: 'omikuji',
        label: 'Omikuji',
        description:
          'Se agita la caja hexagonal de madera del templo y sale una varilla; el papel con el resultado se despliega debajo.',
      },
      {
        id: 'fukubiki',
        label: 'Fukubiki',
        description:
          'La rueda garagara del sorteo de feria gira y suelta una bola del color de lo que ha salido, que rueda hasta la bandeja.',
      },
      {
        id: 'daruma',
        label: 'Daruma',
        description: 'Un daruma se tambalea; al salir el resultado se le pinta el ojo y el nombre aparece escrito a pincel.',
      },
    ],
  },
  {
    id: 'random-play',
    code: 'F14',
    name: 'Pantalla de Random Play Dance',
    description: 'La pantalla de la ronda, pensada para verse de lejos en la tele o el portátil del local.',
    defaultVariant: 'marquesina',
    variants: [
      {
        id: 'marquesina',
        label: 'Marquesina',
        description:
          'El título enorme en un cartel de laca con marco dorado; la cuenta atrás se estampa como un sello bermellón sobre el vídeo.',
      },
      {
        id: 'kamishibai',
        label: 'Kamishibai',
        description:
          'Un teatro de papel: la tarjeta con el título tapa el vídeo durante la cuenta atrás y se desliza fuera cuando empieza a sonar.',
      },
      {
        id: 'taiko-cuenta',
        label: 'Taiko',
        description:
          'La cuenta atrás como golpes en un taiko con su mitsudomoe; lo que viene después corre por una banda índigo debajo.',
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
