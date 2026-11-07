import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { useReview } from '@/player/store';
import { formatSpeed } from '@coverscape/shared';
import {
  Columns2,
  FlipHorizontal2,
  Layers,
  MessageSquarePlus,
  RectangleVertical,
  Repeat,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { type CompareMode, nextQuickOpacity, nextQuickRate } from './reviewRules';
import { useTapAnyFinger } from './tapAnyFinger';

// ───────────── Quick controls ─────────────

/** One square of the quick strip: 44 px, its name for screen readers and as a tooltip, its state visible. */
function QuickButton({
  label,
  title,
  onClick,
  pressed,
  tone = 'ai',
  disabled,
  children,
}: {
  label: string;
  title?: string;
  onClick: () => void;
  pressed?: boolean;
  tone?: 'ai' | 'shu' | 'kin';
  disabled?: boolean;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const tap = useTapAnyFinger(onClick, disabled);
  const on = {
    ai: 'bg-ai-600/50 text-ai-200',
    shu: 'bg-shu-700 text-washi',
    kin: 'bg-kin-300/15 text-kin-200',
  }[tone];
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={title ?? label}
      aria-pressed={pressed}
      disabled={disabled}
      {...tap}
      whileTap={reduce ? undefined : { scale: 0.88 }}
      transition={jelly}
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-[9px] text-[13px] font-bold transition-colors disabled:opacity-40',
        pressed ? on : 'text-washi-muted hover:bg-washi/[0.07] hover:text-washi',
      )}
    >
      {children}
    </motion.button>
  );
}

/**
 * The quick strip: what is used most while reviewing a dance, one tap each, always at hand (a column by the take's
 * side of the stage on a phone on its side, a row over the controls in portrait). Never over YouTube.
 * Speed (1 → 0,75 → 0,5), A, B, repeat, the original in a mirror, separate / overlaid (files only), how much of the
 * original shows (overlaid only), «Solo toma» (the take alone, big) and a note at this moment.
 */
export function QuickStrip({
  orientation,
  mode,
  canOverlay,
  hasOriginal,
  opacity,
  onTop,
  onMode,
  onOpacity,
  onNote,
  onLoopMissing,
  withLoop = true,
  withNote = true,
  withMode = true,
  bare = false,
}: {
  orientation: 'row' | 'column';
  mode: CompareMode;
  canOverlay: boolean;
  hasOriginal: boolean;
  /** «Superpuesto»: how much the one on top shows (0–1). */
  opacity: number;
  /** Which one is on top in «Superpuesto» (the see-through one). */
  onTop: 'original' | 'take';
  onMode: (mode: CompareMode) => void;
  onOpacity: (opacity: number) => void;
  onNote: () => void;
  onLoopMissing: () => void;
  /** The A–B buttons (the portrait controls already have them). */
  withLoop?: boolean;
  withNote?: boolean;
  /** Separate / overlaid (in portrait the header has it). */
  withMode?: boolean;
  /** Without the tray of its own (inside another row). */
  bare?: boolean;
}) {
  const rate = useReview((s) => s.rate);
  const loop = useReview((s) => s.loop);
  const mirrorOriginal = useReview((s) => s.mirrorOriginal);
  const ready = useReview((s) => s.takeEngine != null);
  const solo = useReview((s) => s.solo);
  const review = useReview.getState;
  const overlay = mode === 'overlay' && !solo;
  const comparing = hasOriginal && !solo;
  const topName = onTop === 'take' ? 'La toma' : 'El original';

  // A column taller than the room scrolls: a fade at its foot says there is more below.
  const listRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || orientation !== 'column') return;
    const check = () => setMore(el.scrollHeight - el.clientHeight - el.scrollTop > 4);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    el.addEventListener('scroll', check, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', check);
    };
  }, [orientation]);

  return (
    <div
      role="group"
      aria-label="Accesos rápidos del repaso"
      className={cn(
        // `relative`: the tray's crest backdrop (index.css, .skin-tray::before, inset 0) must cover the tray only.
        'relative flex shrink-0',
        !bare &&
          'skin-track skin-tray rounded-[12px] border border-line bg-sumi-900/80 p-0.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]',
        orientation === 'column' && 'max-h-full',
      )}
    >
      <div
        ref={listRef}
        className={cn(
          'flex items-center gap-0.5',
          orientation === 'column'
            ? 'max-h-full flex-col overflow-y-auto overscroll-contain scrollbar-none'
            : 'flex-row',
        )}
      >
        {/* The most used first: a note, the speed, the section. */}
        {withNote && (
          <QuickButton label="Nota en este momento (N)" disabled={!ready} tone="kin" onClick={onNote}>
            <MessageSquarePlus className="size-[18px] text-kin-300" />
          </QuickButton>
        )}
        <QuickButton
          label={`Velocidad: ${formatSpeed(rate)}. Pulsa para ${formatSpeed(nextQuickRate(rate))}`}
          title="Velocidad (1× · 0,75× · 0,5×)"
          pressed={rate !== 1}
          tone="kin"
          onClick={() => review().setRate(nextQuickRate(rate))}
        >
          <span className="tabular font-mono text-[12px]">{formatSpeed(rate)}</span>
        </QuickButton>
        {withLoop && (
          <>
            <QuickButton
              label="Marcar A (inicio del tramo)"
              pressed={loop.start != null}
              tone="shu"
              onClick={() => review().markStart()}
            >
              <span className="font-display text-[16px] font-extrabold">A</span>
            </QuickButton>
            <QuickButton
              label="Marcar B (fin del tramo)"
              pressed={loop.end != null}
              tone="shu"
              onClick={() => review().markEnd()}
            >
              <span className="font-display text-[16px] font-extrabold">B</span>
            </QuickButton>
            <QuickButton
              label="Repetir el tramo A–B"
              pressed={loop.enabled}
              onClick={() => {
                if (!review().toggleLoop()) onLoopMissing();
              }}
            >
              <Repeat className="size-[18px]" />
            </QuickButton>
          </>
        )}
        {hasOriginal && (
          <QuickButton
            label={solo ? 'Volver a comparar con el original' : 'Ver solo la toma, sin el original'}
            title={solo ? 'Volver a comparar' : 'Solo la toma'}
            pressed={solo}
            onClick={() => review().setSolo(!solo)}
          >
            <RectangleVertical className="size-[18px]" />
          </QuickButton>
        )}
        {comparing && (
          <QuickButton
            label="Original en espejo"
            pressed={mirrorOriginal}
            onClick={() => review().toggleMirrorOriginal()}
          >
            <FlipHorizontal2 className="size-[18px]" />
          </QuickButton>
        )}
        {withMode && canOverlay && !solo && (
          <QuickButton
            label="Superpuesto"
            title="Superpuesto (si no, separados)"
            pressed={overlay}
            onClick={() => onMode(overlay ? 'stacked' : 'overlay')}
          >
            {overlay ? <Layers className="size-[18px]" /> : <Columns2 className="size-[18px]" />}
          </QuickButton>
        )}
        {overlay && (
          <QuickButton
            label={`${topName} (encima) se ve al ${Math.round(opacity * 100)} %. Pulsa para cambiarlo`}
            title={`Cuánto se ve ${onTop === 'take' ? 'la toma' : 'el original'} (encima)`}
            tone="kin"
            onClick={() => onOpacity(nextQuickOpacity(opacity))}
          >
            <span className="tabular font-mono text-[11px] text-kin-200">{Math.round(opacity * 100)}%</span>
          </QuickButton>
        )}
      </div>
      {more && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0.5 bottom-0.5 h-6 rounded-b-[10px] bg-linear-to-t from-sumi-900 to-transparent"
        />
      )}
    </div>
  );
}
