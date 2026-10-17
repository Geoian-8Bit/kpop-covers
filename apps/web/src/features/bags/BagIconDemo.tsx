import { BagGlyph, type BagIconVariant } from './BagIcon';

/**
 * Point 29 · Lab demos of the bag icon: one drawing at 16, 20 and 24 px (on lacquer and on washi), and where the
 * app uses it (the menu row, the round «Añadir a una bolsa» crest on a library card, a picked option in Random
 * Play Dance). (This file's chunk, `BagIconDemo-<hash>.js`, stays out of the precache.)
 */
const SIZES = [
  { px: 16, cls: 'size-4' },
  { px: 20, cls: 'size-5' },
  { px: 24, cls: 'size-6' },
] as const;

function Stage({ variant }: { variant: BagIconVariant }) {
  return (
    <div className="space-y-5 bg-sumi-900 px-4 py-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-end justify-around rounded-[10px] border border-line bg-sumi-850 px-2 pb-2 pt-4 text-washi">
          {SIZES.map((s) => (
            <figure key={s.px} className="flex flex-col items-center gap-2">
              <BagGlyph variant={variant} className={s.cls} />
              <figcaption className="tabular font-mono text-[11px] text-washi-subtle">{s.px}</figcaption>
            </figure>
          ))}
        </div>
        <div className="flex items-end justify-around rounded-[10px] bg-washi px-2 pb-2 pt-4 text-sumi-900">
          {SIZES.map((s) => (
            <figure key={s.px} className="flex flex-col items-center gap-2">
              <BagGlyph variant={variant} className={s.cls} />
              <figcaption className="tabular font-mono text-[11px] text-sumi-700">{s.px}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-washi-subtle">En la app</p>
        {/* Menu row */}
        <div className="flex h-12 items-center gap-3 rounded-[10px] bg-kiji-700 px-3 text-kin-200">
          <BagGlyph variant={variant} className="size-5" />
          <span className="text-[15px] font-bold">Bolsas</span>
        </div>
        {/* Library card crest */}
        <div className="relative h-24 overflow-hidden rounded-[10px] bg-ai-800">
          <span className="absolute bottom-2 right-2 grid size-9 place-items-center rounded-full bg-sumi-950/90 text-kin-300 shadow-[0_0_0_1.5px_var(--color-kin-400)]">
            <BagGlyph variant={variant} />
          </span>
          <span className="absolute left-3 top-3 text-[14px] font-bold text-washi">Magnetic · ILLIT</span>
        </div>
        {/* Random Play Dance source */}
        <div className="flex h-12 items-center gap-2.5 rounded-[10px] border border-kin-300/60 bg-sumi-850 px-3">
          <BagGlyph variant={variant} className="text-kin-300" />
          <span className="text-[14px] font-bold text-washi">Una bolsa</span>
        </div>
      </div>
    </div>
  );
}

export function ActualIconDemo() {
  return <Stage variant="actual" />;
}
export function KinchakuIconDemo() {
  return <Stage variant="kinchaku" />;
}
export function FuroshikiIconDemo() {
  return <Stage variant="furoshiki" />;
}
export function FukubukuroIconDemo() {
  return <Stage variant="fukubukuro" />;
}
