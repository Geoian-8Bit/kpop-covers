import { lazy } from 'react';
import type { LabMoment } from '../types';

// One chunk for the seven demos (`VoiceSplitDemo-<hash>.js`): out of the precache, downloaded when the lab shows it.
const demo = (
  name:
    'OndaDemo' | 'AudioDemo' | 'HokusaiDemo' | 'SeigaihaDemo' | 'CompactaDemo' | 'FusumaDemo' | 'CapasDemo',
) => lazy(() => import('@/features/voice/VoiceSplitDemo').then((m) => ({ default: m[name] })));

/**
 * F17 · Voz y música (point 16): how the studio's «Todo / Sin voz / Voz» control looks. The variant ids are read by
 * `VoiceSplitControl` (`useDesignVariant('voice-split')`); keep them in step with its `VARIANTS`.
 */
export const voiceMoment: LabMoment = {
  id: 'voice-split',
  code: 'F17',
  name: 'Voz y música',
  description:
    'El control del estudio para oír la canción entera, sin la voz o solo la voz. Al elegir uno, el estudio cambia en este dispositivo: pruébalo también con un archivo de verdad. La demostración no suena.',
  defaultVariant: 'onda',
  appliesLive: true,
  variants: [
    {
      id: 'onda',
      label: 'A · Ola partida',
      description:
        'La de ahora, arreglada: las olas se repiten a lo ancho sin estirarse, son más altas, la cresta de la voz lleva espuma y hay varias capas que se mueven despacio mientras suena.',
      Demo: demo('OndaDemo'),
    },
    {
      id: 'audio',
      label: 'B · Audio real',
      description:
        'La canción entera dibujada como un mar: la música es el cuerpo índigo y la voz la cresta bermellón, con la marca de reproducción. Se ve dónde canta y dónde no. «Sin voz» aplana la cresta en espuma; «Voz» hunde la música.',
      Demo: demo('AudioDemo'),
    },
    {
      id: 'hokusai',
      label: 'C · Gran ola',
      description:
        'Una sola ola grabada como un ukiyo-e: el cuerpo es la música y la cresta con garras de espuma es la voz. «Sin voz» rompe la cresta y la apaga; «Voz» hunde el mar y la deja sola.',
      Demo: demo('HokusaiDemo'),
    },
    {
      id: 'seigaiha',
      label: 'D · Seigaiha y pincel',
      description:
        'La música es el mar de olas seigaiha de la app y la voz un trazo de pincel bermellón encima. Cada modo enciende una capa y atenúa la otra.',
      Demo: demo('SeigaihaDemo'),
    },
    {
      id: 'compacta',
      label: 'E · Compacta',
      description:
        'Pensada para el móvil: sin franja grande, solo los tres botones, cada uno con una mini ola dentro. La elegida se ilumina y se mueve mientras suena.',
      Demo: demo('CompactaDemo'),
    },
    {
      id: 'fusuma',
      label: 'Puertas correderas',
      description:
        'Diseño anterior, como referencia: dos puertas de washi se deslizan sobre la voz o la música para quitarlas.',
      Demo: demo('FusumaDemo'),
    },
    {
      id: 'capas',
      label: 'Capas de grabado',
      description:
        'Diseño anterior, como referencia: tres planchas de grabado apiladas; la elegida pasa delante con las marcas doradas.',
      Demo: demo('CapasDemo'),
    },
  ],
};
