import { useEffect, useRef, useState, type ComponentType } from 'react';
import { noteNavDemoOnScreen } from './navDemoPresence';
import NavHanafuda from './prototypes/NavHanafuda';
import NavKakejiku from './prototypes/NavKakejiku';
import NavKamon from './prototypes/NavKamon';
import NavSensu from './prototypes/NavSensu';
import type { QuickNavProps } from './quickNavCore';

/**
 * P1 · Lab demos of the quick menu: each prototype inside a phone-sized stage over a sample page. Nothing navigates:
 * the line under the stage says where it would have gone. (This file's chunk, `NavDemo-<hash>.js`, stays out of the
 * precache; the prototypes themselves are shared with the live menu.)
 *
 * While a stage is on screen the real floating button fades out (`navDemoPresence.ts`): it sits at the same corner
 * and would cover the demo's button. The stage is never taller than the screen minus the top bar, so in landscape
 * the button and the panel above it fit at once (the prototypes lay out from the size they measure).
 */
function Stage({ Prototype }: { Prototype: ComponentType<QuickNavProps> }) {
  const [note, setNote] = useState('');
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = stageRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => noteNavDemoOnScreen(node, Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.3)),
      { threshold: [0, 0.3] },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      noteNavDemoOnScreen(node, false);
    };
  }, []);
  return (
    <div>
      <div ref={stageRef} className="relative h-[min(520px,calc(100dvh-96px))] overflow-hidden bg-sumi-900">
        {/* A sample page underneath, so the panel is seen over something. */}
        <div aria-hidden className="pointer-events-none select-none">
          <div className="flex h-14 items-center justify-between border-b border-line-strong bg-sumi-950 px-4">
            <span className="font-display text-[17px] font-bold text-washi">One Shoot</span>
            <span className="size-8 rounded-full bg-sumi-800" />
          </div>
          <div className="space-y-3 p-4">
            <div className="h-6 w-40 rounded-[6px] bg-washi/15" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3 rounded-[10px] border border-line bg-sumi-850 p-3">
                <div className="h-14 w-24 shrink-0 rounded-[6px] bg-ai-800" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3.5 w-3/4 rounded bg-washi/20" />
                  <div className="h-3 w-1/2 rounded bg-washi/10" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <Prototype contained onDemoPick={setNote} />
      </div>
      <p aria-live="polite" className="min-h-[2.75em] px-4 py-2.5 text-[13px] leading-snug text-washi-muted">
        {note || 'Toca el botón de abajo a la derecha. Prueba también Esc y tocar fuera para cerrar.'}
      </p>
    </div>
  );
}

export function SensuDemo() {
  return <Stage Prototype={NavSensu} />;
}

export function HanafudaDemo() {
  return <Stage Prototype={NavHanafuda} />;
}

export function KamonDemo() {
  return <Stage Prototype={NavKamon} />;
}

export function KakejikuDemo() {
  return <Stage Prototype={NavKakejiku} />;
}
