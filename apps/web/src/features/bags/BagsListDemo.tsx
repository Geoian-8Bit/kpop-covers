import { useState } from 'react';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { BagGroup, type BagCardData, type BagsListVariant } from './BagShelf';
import { KIND_COPY } from './drawRules';

/**
 * Point 30 · Lab demos of the «Bolsas» page: each way of showing the bags, at phone width, with sample bags.
 * Nothing navigates: the line under the stage says which bag would open. (This file's chunk, `BagsListDemo-<hash>.js`,
 * stays out of the precache; the components are the page's own, from `BagShelf.tsx`.)
 */
const SAMPLE: BagCardData[] = [
  { id: 'demo-1', name: 'Próxima coreo', kind: 'songs', draw_mode: 'remove', no_repeat: false, items: 6 },
  { id: 'demo-2', name: 'Calentar', kind: 'songs', draw_mode: 'keep', no_repeat: true, items: 12 },
  { id: 'demo-3', name: 'Retos del sábado', kind: 'songs', draw_mode: 'keep', no_repeat: false, items: 1 },
  {
    id: 'demo-4',
    name: 'Estribillos para calentar',
    kind: 'clips',
    draw_mode: 'keep',
    no_repeat: true,
    items: 18,
  },
  { id: 'demo-5', name: 'Quién dirige hoy', kind: 'people', draw_mode: 'remove', no_repeat: false, items: 7 },
];

const KINDS = ['songs', 'clips', 'people'] as const;

function Stage({ variant }: { variant: BagsListVariant }) {
  const [note, setNote] = useState('');
  return (
    <div>
      <div className="mx-auto max-w-[390px] bg-sumi-900">
        <div className="px-4 pb-1 pt-5">
          <p className="font-display text-[26px] font-bold leading-tight text-washi">Bolsas</p>
        </div>
        {KINDS.map((kind) => {
          const bags = SAMPLE.filter((b) => b.kind === kind);
          return (
            <section key={kind} className="sep-t px-4 py-5">
              <SectionTitle as="h3" glyph={KIND_COPY[kind].glyph} className="mb-4">
                {KIND_COPY[kind].label}
              </SectionTitle>
              <BagGroup variant={variant} bags={bags} onPick={(bag) => setNote(`Abriría «${bag.name}».`)} />
            </section>
          );
        })}
      </div>
      <p aria-live="polite" className="min-h-[2.75em] px-4 py-2.5 text-[13px] leading-snug text-washi-muted">
        {note || 'Toca una bolsa. Con «reducir movimiento» en el móvil, lo que cuelga se queda quieto.'}
      </p>
    </div>
  );
}

export function ListaDemo() {
  return <Stage variant="lista" />;
}
export function FuroshikiDemo() {
  return <Stage variant="furoshiki" />;
}
export function OmikujiDemo() {
  return <Stage variant="omikuji" />;
}
export function ChochinDemo() {
  return <Stage variant="chochin" />;
}
