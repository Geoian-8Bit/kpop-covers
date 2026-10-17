import { lazy } from 'react';
import type { LabMoment } from '../types';

// One chunk per moment (`BagsListDemo-<hash>.js`, `BagIconDemo-<hash>.js`): out of the precache, downloaded when the
// lab shows it. No static import of the bags feature here: BagIcon reads the lab's state, which reads this registry.
const listDemo = (name: 'ListaDemo' | 'FuroshikiDemo' | 'OmikujiDemo' | 'ChochinDemo') =>
  lazy(() => import('@/features/bags/BagsListDemo').then((m) => ({ default: m[name] })));
const iconDemo = (name: 'ActualIconDemo' | 'KinchakuIconDemo' | 'FuroshikiIconDemo' | 'FukubukuroIconDemo') =>
  lazy(() => import('@/features/bags/BagIconDemo').then((m) => ({ default: m[name] })));

/** Point 30 · How the «Bolsas» page shows the bags to choose one. */
export const bagsListMoment: LabMoment = {
  id: 'bags-list',
  code: 'P30',
  name: 'Pantalla «Bolsas»: elegir bolsa',
  description:
    'Cómo se ven las bolsas del grupo para elegir una. Al elegir una propuesta, la pantalla «Bolsas» cambia en este móvil al momento. «Lista» es el diseño de ahora, como referencia.',
  defaultVariant: 'lista',
  appliesLive: true,
  variants: [
    {
      id: 'lista',
      label: 'Lista (actual)',
      description: 'Tarjetas en lista con un sello del tipo de bolsa: el diseño de ahora, para comparar.',
      Demo: listDemo('ListaDemo'),
    },
    {
      id: 'furoshiki',
      label: 'Furoshiki',
      description:
        'Hatillos de tela colgados de una vara de bambú que se balancean despacio. Índigo si lo que sale vuelve a la bolsa, bermellón si se quita.',
      Demo: listDemo('FuroshikiDemo'),
    },
    {
      id: 'omikuji',
      label: 'Omikuji',
      description:
        'Cajas de la suerte de madera en un estante, con su varilla asomando. La etiqueta lleva el tipo; la franja bermellón marca las que quitan lo que sale. Al tocarla, la caja se agita.',
      Demo: listDemo('OmikujiDemo'),
    },
    {
      id: 'chochin',
      label: 'Farolillos',
      description:
        'Un farolillo de papel por bolsa, con el nombre escrito encima y una luz que respira. Blanco si lo que sale vuelve, rojo si se quita.',
      Demo: listDemo('ChochinDemo'),
    },
  ],
};

/** Point 29 · The bag icon (menu, library cards, Random Play Dance). */
export const bagIconMoment: LabMoment = {
  id: 'bag-icon',
  code: 'P29',
  name: 'Icono de las bolsas',
  description:
    'El dibujo de «bolsa» en el menú, en las tarjetas de la biblioteca y en Random Play Dance. Al elegir uno, cambia en toda la app en este móvil. «Actual» es el de ahora, como referencia.',
  defaultVariant: 'actual',
  appliesLive: true,
  variants: [
    {
      id: 'actual',
      label: 'Actual',
      description: 'El kinchaku de ahora, para comparar.',
      Demo: iconDemo('ActualIconDemo'),
    },
    {
      id: 'kinchaku',
      label: 'Kinchaku',
      description:
        'El saquito de cordón redibujado más simple: cuerpo redondo, volante arriba y el nudo del cordón.',
      Demo: iconDemo('KinchakuIconDemo'),
    },
    {
      id: 'furoshiki',
      label: 'Furoshiki',
      description: 'Un hatillo de tela con sus dos orejas anudadas arriba y un pliegue.',
      Demo: iconDemo('FuroshikiIconDemo'),
    },
    {
      id: 'fukubukuro',
      label: 'Fukubukuro',
      description: 'La bolsa de la suerte de Año Nuevo, atada al cuello y con un sello redondo delante.',
      Demo: iconDemo('FukubukuroIconDemo'),
    },
  ],
};

export const bagMoments: LabMoment[] = [bagsListMoment, bagIconMoment];
