import { lazy } from 'react';
import type { LabMoment } from '../types';

// One chunk for the four demos (`NavDemo-<hash>.js`): out of the precache, downloaded when the lab shows it.
const demo = (name: 'SensuDemo' | 'HanafudaDemo' | 'KamonDemo' | 'OrigamiDemo') =>
  lazy(() => import('@/features/nav/NavDemo').then((m) => ({ default: m[name] })));

/** P1 · The phone's quick menu at the bottom right: the five sections and «¿Quién eres?». */
export const navMoment: LabMoment = {
  id: 'nav',
  code: 'P1',
  name: 'Menú de acciones rápidas (móvil)',
  description:
    'El botón de abajo a la derecha con las cinco secciones y «¿Quién eres?». Al elegir uno, el menú de la app cambia en este móvil al momento: pruébalo también fuera del laboratorio.',
  defaultVariant: 'sensu',
  appliesLive: true,
  variants: [
    {
      id: 'sensu',
      label: 'Sensu',
      description:
        'Un abanico de washi y laca se abre desde la esquina en un cuarto de círculo; cada varilla es una sección y la tuya va en bermellón.',
      Demo: demo('SensuDemo'),
    },
    {
      id: 'hanafuda',
      label: 'Hanafuda',
      description:
        'Del botón sale una mano de cartas. Desliza el pulgar por encima: la carta que tocas se eleva y, al soltar, vuela al centro y te lleva.',
      Demo: demo('HanafudaDemo'),
    },
    {
      id: 'kamon',
      label: 'Rueda de kamon',
      description:
        'Un sello grande asoma desde la esquina. Gíralo con el pulgar: la sección que queda en la muesca dorada se resalta y el móvil vibra un poco en cada paso. Tocar cualquiera también lleva.',
      Demo: demo('KamonDemo'),
    },
    {
      id: 'origami',
      label: 'Origami',
      description:
        'Un cuadrado de washi doblado en la esquina se despliega pliegue a pliegue hasta formar un panel con una sección en cada cara; al cerrar, se vuelve a doblar.',
      Demo: demo('OrigamiDemo'),
    },
  ],
};
