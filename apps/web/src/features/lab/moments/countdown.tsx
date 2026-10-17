import { lazy } from 'react';
import { LONG_COUNTDOWN_MOMENT } from '@/features/events/eventRules';
import type { LabMoment } from '../types';

// One chunk for the three demos (`EventCountdownDemo-<hash>.js`): out of the precache, downloaded when the lab shows it.
const demo = (name: 'KoyomiDemo' | 'SunadokeiDemo' | 'TsukiDemo') =>
  lazy(() => import('@/features/events/EventCountdownDemo').then((m) => ({ default: m[name] })));

/** F16 · Point 39 · The countdown while the event is more than a week away; Chōchin stays for the last week. */
export const countdownMoment: LabMoment = {
  id: LONG_COUNTDOWN_MOMENT,
  code: 'F16',
  name: 'Cuenta atrás cuando faltan más de 7 días',
  description:
    'Chōchin se queda para la última semana: el primer farolillo se enciende al entrar en ella. Antes, uno de estos diseños. Mueve el deslizador de «faltan N días» para verlo y pulsa «Ver el cambio». Al elegir uno, la portada y los eventos cambian en este móvil al momento.',
  defaultVariant: 'koyomi',
  appliesLive: true,
  variants: [
    {
      id: 'koyomi',
      label: 'Koyomi',
      description:
        'El calendario de hojas: cada día se arranca una hoja, que cae junto a las de los días anteriores. El número se lee de un vistazo.',
      Demo: demo('KoyomiDemo'),
    },
    {
      id: 'sunadokei',
      label: 'Sunadokei',
      description:
        'Un reloj de arena de washi y madera que baja desde que se creó el evento; la arena se va amontonando en dunas hasta el estandarte del festival.',
      Demo: demo('SunadokeiDemo'),
    },
    {
      id: 'tsuki',
      label: 'Tsuki',
      description:
        'Las fases de la luna en una fila, de luna nueva a llena: la luna se va llenando según se acerca el día y está llena a una semana, cuando se encienden los farolillos. Los días, en grande al lado.',
      Demo: demo('TsukiDemo'),
    },
  ],
};
