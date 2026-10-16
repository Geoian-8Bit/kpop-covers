import type { BagKind, DrawMode } from '@coverscape/shared';
import { Minus, RotateCcw, Undo2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ElasticToggle } from '@/components/ui/ElasticToggle';
import { Segmented } from '@/components/ui/Segmented';
import { BagDrawStage, SHAKE_MS, type DrawPhase } from './BagDrawStage';
import { countLabel, drawOrder, drawRemoves, effectiveNoRepeat, KIND_COPY, MODE_COPY } from './drawRules';
import type { DrawShown, Tone } from './tones';

interface DemoItem {
  id: string;
  label: string;
  sub: string;
  tone: Tone;
  removed_at: string | null;
}

const SAMPLES: Record<BagKind, Omit<DemoItem, 'removed_at'>[]> = {
  songs: [
    { id: 's1', label: 'Hype Boy', sub: 'NewJeans', tone: 'kin' },
    { id: 's2', label: 'Supernova', sub: 'aespa', tone: 'kin' },
    { id: 's3', label: 'Magnetic', sub: 'ILLIT', tone: 'kin' },
    { id: 's4', label: 'Love Dive', sub: 'IVE', tone: 'kin' },
  ],
  clips: [
    { id: 'c1', label: 'Estribillo 1', sub: 'Hype Boy', tone: 'enji' },
    { id: 'c2', label: 'Puente', sub: 'Supernova', tone: 'rokusho' },
    { id: 'c3', label: 'Dance break', sub: 'Magnetic', tone: 'fuji' },
    { id: 'c4', label: 'Final', sub: 'Love Dive', tone: 'kin' },
  ],
  people: [
    { id: 'p1', label: 'Flor', sub: '¡Te toca!', tone: 'sakura' },
    { id: 'p2', label: 'Iker', sub: '¡Te toca!', tone: 'ai' },
    { id: 'p3', label: 'Nerea', sub: '¡Te toca!', tone: 'rokusho' },
    { id: 'p4', label: 'Dani', sub: '¡Te toca!', tone: 'kin' },
  ],
};

const fresh = (kind: BagKind): DemoItem[] => SAMPLES[kind].map((s) => ({ ...s, removed_at: null }));

/**
 * Lab stage for F13 «Sacar»: a sample bag drawn with the same rules as the real one (`drawOrder`: only what is in
 * the bag, «sin repetir seguidas», «se queda» / «se quita»), in the chosen design. Nothing is saved.
 */
export function BagDrawDemo({ variant }: { variant: string }) {
  const [kind, setKind] = useState<BagKind>('songs');
  const [mode, setMode] = useState<DrawMode>('remove');
  const [noRepeat, setNoRepeat] = useState(true);
  const [items, setItems] = useState<DemoItem[]>(() => fresh('songs'));
  const [phase, setPhase] = useState<DrawPhase>('idle');
  const [result, setResult] = useState<{ item: DemoItem; removed: boolean } | null>(null);
  const lastId = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const inBag = items.filter((i) => i.removed_at == null);

  function reset(nextKind = kind) {
    clearTimeout(timer.current);
    setItems(fresh(nextKind));
    setPhase('idle');
    setResult(null);
    lastId.current = null;
  }

  function draw() {
    if (phase === 'shaking') return;
    const [picked] = drawOrder(items, {
      count: 1,
      noRepeat: effectiveNoRepeat(mode, noRepeat),
      lastItemId: lastId.current,
    });
    if (!picked) return;
    setPhase('shaking');
    setResult(null);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const removed = drawRemoves(mode, null);
      lastId.current = picked.id;
      setItems((list) =>
        list.map((i) =>
          i.id === picked.id ? { ...i, removed_at: removed ? new Date().toISOString() : null } : i,
        ),
      );
      setResult({ item: picked, removed });
      setPhase('reveal');
    }, SHAKE_MS);
  }

  function setRemoved(removed: boolean) {
    if (!result) return;
    setItems((list) =>
      list.map((i) =>
        i.id === result.item.id ? { ...i, removed_at: removed ? new Date().toISOString() : null } : i,
      ),
    );
    setResult({ ...result, removed });
  }

  const shown: DrawShown[] = result
    ? [
        {
          label: result.item.label,
          sub: result.item.sub,
          tone: result.item.tone,
          glyph: kind === 'people' ? result.item.label.charAt(0) : KIND_COPY[kind].glyph,
        },
      ]
    : [];

  return (
    <div className="flex w-full flex-col gap-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          label="Qué se sortea"
          layoutId="bag-demo-kind"
          value={kind}
          onChange={(k) => {
            setKind(k);
            reset(k);
          }}
          options={(['songs', 'clips', 'people'] as const).map((k) => ({
            value: k,
            label: KIND_COPY[k].label,
          }))}
        />
        <Segmented
          size="sm"
          label="Al sacar"
          layoutId="bag-demo-mode"
          value={mode}
          onChange={setMode}
          options={(['keep', 'remove'] as const).map((m) => ({ value: m, label: MODE_COPY[m].label }))}
        />
        {mode === 'keep' && (
          <ElasticToggle label="Sin repetir seguidas" checked={noRepeat} onChange={setNoRepeat} />
        )}
      </div>

      <BagDrawStage
        variant={variant}
        phase={phase}
        results={shown}
        empty={inBag.length === 0 && phase === 'idle'}
      />

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={draw} disabled={phase === 'shaking' || inBag.length === 0}>
          Sacar
        </Button>
        {phase === 'reveal' && result && (
          <>
            <Button
              variant={result.removed ? 'primary' : 'secondary'}
              aria-pressed={result.removed}
              onClick={() => setRemoved(true)}
            >
              <Minus aria-hidden className="size-4" /> Quitar de la bolsa
            </Button>
            <Button
              variant={!result.removed ? 'primary' : 'secondary'}
              aria-pressed={!result.removed}
              onClick={() => setRemoved(false)}
            >
              <Undo2 aria-hidden className="size-4" /> Devolver
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={() => reset()} disabled={inBag.length === items.length}>
          <RotateCcw aria-hidden className="size-4" /> Rellenar
        </Button>
      </div>
      <p className="text-center text-[13px] text-washi-subtle" aria-live="polite">
        {countLabel(kind, inBag.length)} en la bolsa
        {items.length - inBag.length > 0 ? ` · ${items.length - inBag.length} fuera` : ''}
        {phase === 'reveal' && result ? ` · ha salido ${result.item.label}` : ''}
      </p>
    </div>
  );
}
