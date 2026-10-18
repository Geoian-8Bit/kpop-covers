import { lazy } from 'react';
import type { LabMoment } from '../types';

// One chunk for the four demos (`NavDemo-<hash>.js`): out of the precache, downloaded when the lab shows it.
const demo = (name: 'SensuDemo' | 'HanafudaDemo' | 'KamonDemo' | 'KakejikuDemo') =>
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
        'Un abanico de washi y laca se abre desde la esquina: las varillas se despliegan juntas desde el remache, con el papel siempre tenso, y se asientan con un pequeño rebote. Cada varilla es una sección y la tuya va en bermellón.',
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
      // Replaces «Origami» (round 2, point 41). Whoever had it saved falls back to the default.
      id: 'kakejiku',
      label: 'Kakejiku',
      description:
        'Un pergamino colgante enrollado sobre el botón. Al tocarlo, la varilla sube y el papel se desenrolla con una sección por línea, la tuya con sello bermellón. Al elegir, un hanko la marca; al cerrar, se vuelve a enrollar.',
      Demo: demo('KakejikuDemo'),
    },
  ],
};
