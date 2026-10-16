import { ArrowLeftRight, Crosshair, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { CompareStage, type CompareVariant } from './CompareStage';
import { DEFAULT_PREFS, NO_FIT, type CompareMode, type Fit, type ViewPrefs } from './reviewRules';

/**
 * Design lab stage for F5: a drawn dancer as «the original» and a second one, smaller, off-centre and a beat
 * late, as «the take». Same stage and gestures as the real review (drag, two fingers, wheel), nothing from the
 * network, nothing saved.
 */

const VARIANTS: readonly CompareVariant[] = ['biombo', 'cortina', 'linterna'];

function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** A stick dancer on a canvas, posed for the shared clock `clock.current` (seconds). */
function Dancer({
  clock,
  lag = 0,
  scale = 1,
  dx = 0,
  room,
  ink,
  accent,
}: {
  clock: React.RefObject<number>;
  lag?: number;
  scale?: number;
  dx?: number;
  room: string;
  ink: string;
  accent: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const colors = { room: cssToken(room), ink: cssToken(ink), accent: cssToken(accent) };
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const t = (clock.current ?? 0) - lag;
      ctx.fillStyle = colors.room;
      ctx.fillRect(0, 0, w, h);
      // Floor line.
      ctx.strokeStyle = colors.accent;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.86);
      ctx.lineTo(w, h * 0.86);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const unit = (Math.min(w, h) / 11.5) * scale;
      const cx = w / 2 + dx * w + Math.sin(t * 1.6) * unit * 0.6;
      const hip = { x: cx, y: h * 0.86 - unit * 3.2 + Math.abs(Math.sin(t * 3.2)) * unit * 0.25 };
      const neck = { x: cx, y: hip.y - unit * 2.4 };
      const swing = Math.sin(t * 3.2);
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = Math.max(3, unit * 0.32);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const limb = (from: { x: number; y: number }, a1: number, a2: number, l1: number, l2: number) => {
        const mid = { x: from.x + Math.cos(a1) * l1, y: from.y + Math.sin(a1) * l1 };
        const end = { x: mid.x + Math.cos(a2) * l2, y: mid.y + Math.sin(a2) * l2 };
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(mid.x, mid.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      };
      ctx.beginPath();
      ctx.moveTo(hip.x, hip.y);
      ctx.lineTo(neck.x, neck.y);
      ctx.stroke();
      limb(neck, -Math.PI / 2 - 0.9 - swing * 0.9, -Math.PI / 2 - 0.4 - swing * 1.2, unit * 1.2, unit * 1.1);
      limb(neck, -Math.PI / 2 + 0.9 - swing * 0.6, -Math.PI / 2 + 0.3 + swing * 0.8, unit * 1.2, unit * 1.1);
      limb(hip, Math.PI / 2 + 0.35 + swing * 0.35, Math.PI / 2 + 0.1, unit * 1.5, unit * 1.5);
      limb(hip, Math.PI / 2 - 0.35 + swing * 0.2, Math.PI / 2 - 0.05 - swing * 0.3, unit * 1.5, unit * 1.5);
      ctx.fillStyle = colors.accent;
      ctx.beginPath();
      ctx.arc(neck.x, neck.y - unit * 0.75, unit * 0.62, 0, Math.PI * 2);
      ctx.fill();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [clock, lag, scale, dx, room, ink, accent]);
  return <canvas ref={ref} aria-hidden className="absolute inset-0 size-full" />;
}

export function ReviewCompareDemo({ variant }: { variant: string }) {
  const v: CompareVariant = (VARIANTS as readonly string[]).includes(variant) ? (variant as CompareVariant) : 'biombo';
  const [mode, setMode] = useState<CompareMode>('stacked');
  const [prefs, setPrefs] = useState<ViewPrefs>(DEFAULT_PREFS);
  const [fit, setFit] = useState<Fit>(NO_FIT);
  const [playing, setPlaying] = useState(true);
  const [mirror, setMirror] = useState(false);
  const clock = useRef(0);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      clock.current += (now - last) / 1000;
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Cómo comparar"
          layoutId={`demo-review-mode-${v}`}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'stacked', label: 'Apilado' },
            { value: 'overlay', label: 'Superpuesto' },
          ]}
        />
        <Button variant="secondary" size="icon" aria-label={playing ? 'Pausar' : 'Reproducir'} onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
        </Button>
        {mode === 'stacked' ? (
          <Button
            variant="ghost"
            className="min-h-11"
            onClick={() => setPrefs((p) => ({ ...p, order: p.order === 'original-first' ? 'take-first' : 'original-first' }))}
          >
            <ArrowLeftRight className="size-4" /> Orden
          </Button>
        ) : (
          <Button variant="ghost" className="min-h-11" onClick={() => setFit(NO_FIT)}>
            <Crosshair className="size-4" /> Recolocar
          </Button>
        )}
        <Button variant="ghost" className="min-h-11" aria-pressed={mirror} onClick={() => setMirror((m) => !m)}>
          Espejo en la toma
        </Button>
      </div>
      {mode === 'overlay' && (
        <label className="flex min-h-11 items-center gap-3 text-[13px] text-washi-muted">
          Transparencia
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((1 - prefs.opacity) * 100)}
            onChange={(e) => setPrefs((p) => ({ ...p, opacity: 1 - Number(e.target.value) / 100 }))}
            className="h-11 flex-1 accent-kin-400"
          />
        </label>
      )}
      <div className="h-[300px] overflow-hidden rounded-[12px] border border-line-strong sm:h-[340px]">
        <CompareStage
          variant={v}
          mode={mode}
          prefs={prefs}
          onPrefs={(patch) => setPrefs((p) => ({ ...p, ...patch }))}
          fit={fit}
          onFit={(next) => setFit(next)}
          mirrorTake={mirror}
          mirrorOriginal={false}
          take={<Dancer clock={clock} lag={0.18} scale={0.8} dx={0.12} room="--color-sumi-800" ink="--color-washi" accent="--color-kin-300" />}
          original={<Dancer clock={clock} room="--color-washi-muted" ink="--color-sumi-900" accent="--color-ai-600" />}
          onTap={() => setPlaying((p) => !p)}
          labels={{ take: 'Toma', original: 'Original' }}
        />
      </div>
      <p className="text-[12px] leading-snug text-washi-subtle">
        {mode === 'overlay'
          ? 'Arrastra el original, pellízcalo con dos dedos o usa la rueda hasta que los dos cuerpos coincidan. En el repaso, ese encaje se guarda con la toma.'
          : v === 'cortina'
            ? 'Arrastra la cortina para barrer entre el original y la toma.'
            : 'Arrastra la bisagra para repartir el espacio (30–70 %).'}
      </p>
    </div>
  );
}
