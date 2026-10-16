import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { jelly, snappy, soft } from '@/lib/motion';
import { FieldBlock, Seal, stopToCamera, SwitchRow, useBoxSize, useModalFocus } from './controls';
import { useSettingsFields, type FieldKey, type Fields, type RecorderSettingsProps } from './model';

/**
 * «Makimono»: a washi scroll that unrolls across the recorder — the sumi roller travels while the paper opens
 * behind it (scaleX / translate on one spring, so the edge stays under the roller). Settings are set in vertical
 * columns like a scroll's text, each with its seal. Upright phones unroll it downwards (a hanging scroll) with the
 * columns two by two. With reduced motion it simply fades in.
 */
export function RecorderSettingsScroll(props: RecorderSettingsProps) {
  const probe = useRef<HTMLDivElement>(null);
  const size = useBoxSize(probe);
  return (
    <>
      <div ref={probe} aria-hidden className={cn(STAGE, 'pointer-events-none invisible')} />
      <AnimatePresence>{props.open && size && <ScrollPanel key="scroll" {...props} w={size.w} h={size.h} />}</AnimatePresence>
    </>
  );
}

/** The scroll's stage: the box minus a margin and the safe areas. */
const STAGE =
  'absolute bottom-[max(10px,env(safe-area-inset-bottom))] left-[max(10px,env(safe-area-inset-left))] right-[max(10px,env(safe-area-inset-right))] top-[max(10px,env(safe-area-inset-top))]';

/** The thin stick the scroll starts from (hassō) and the thick roller it is wound on (jiku). */
const THIN = 12;
const THICK = 22;
/** Indigo silk mounting bands (ichimonji) along the paper. */
const BAND = 11;

interface Column {
  keys: FieldKey[];
  width: number;
  /** Options of a long list in two columns when the paper is short. */
  split?: boolean;
  title?: string;
  glyph?: string;
}

const WIDE_COLUMNS: Column[] = [
  { keys: ['quality'], width: 212, split: true },
  { keys: ['resolution'], width: 212, split: true },
  { keys: ['fps'], width: 160 },
  { keys: ['codec'], width: 178 },
  { keys: ['mode'], width: 178 },
  { keys: ['sound'], width: 178 },
  { keys: ['micChannels'], width: 160 },
  { keys: ['startCamera'], width: 178 },
  { keys: ['grid', 'level', 'info'], width: 244, title: 'Visor', glyph: '眼' },
];

/** Upright: pairs of columns, the switches across the whole width at the end. */
const TALL_CELLS: { keys: FieldKey[]; wide?: boolean; title?: string; glyph?: string }[] = [
  { keys: ['quality'] },
  { keys: ['resolution'] },
  { keys: ['fps'] },
  { keys: ['codec'] },
  { keys: ['mode'] },
  { keys: ['startCamera'] },
  { keys: ['sound'] },
  { keys: ['micChannels'] },
  { keys: ['grid', 'level', 'info'], wide: true, title: 'Visor', glyph: '眼' },
];

function ScrollPanel({
  onClose,
  summary,
  maxSize,
  maxFps,
  songPossible,
  w,
  h,
}: RecorderSettingsProps & { w: number; h: number }) {
  const f = useSettingsFields({ maxSize, maxFps, songPossible });
  const reduce = useReducedMotion() ?? false;
  const rootRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const summaryId = useId();
  useModalFocus(true, rootRef, onClose);

  const wide = w > h;
  // The paper, tucked under both ends.
  const paper: CSSProperties = wide
    ? { left: THIN - 2, top: 8, width: w - THIN - THICK + 4, height: h - 16 }
    : { left: 8, top: THIN - 2, width: w - 16, height: h - THIN - THICK + 4 };
  // The written part of the paper (inside the silk bands and clear of the rollers).
  const text: CSSProperties = wide
    ? { left: THIN + 4, right: THICK + 4, top: 8 + BAND, bottom: 8 + BAND }
    : { left: 8 + BAND, right: 8 + BAND, top: THIN + 2, bottom: THICK + 2 };
  const travel = wide ? w - THICK : h - THICK;
  const short = h - 16 - BAND * 2 < 400;

  // Desktop: the wheel scrolls the columns sideways (unless it is over a column that scrolls itself).
  useEffect(() => {
    const el = railRef.current;
    if (!el || !wide) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const col = (e.target as HTMLElement).closest<HTMLElement>('[data-column]');
      if (col && col.scrollHeight > col.clientHeight + 1) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [wide]);

  const unroll = reduce ? { duration: 0.2 } : soft;
  const rollUp = reduce ? { duration: 0.15 } : { ...snappy, delay: 0.08 };
  const paperShut = wide ? { scaleX: 0 } : { scaleY: 0 };
  const paperOpen = wide ? { scaleX: 1 } : { scaleY: 1 };
  const rollerHome = wide ? { x: 0 } : { y: 0 };
  const rollerOut = wide ? { x: travel } : { y: travel };

  return (
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={summaryId}
      tabIndex={-1}
      className="absolute inset-0 z-40 overflow-hidden outline-none"
      {...stopToCamera}
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-sumi-950/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.2, delay: 0.12 } }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      <div className={STAGE}>
        {/* The paper: opens from the fixed stick, following the roller. */}
        <motion.div
          aria-hidden
          className={cn(
            'absolute flex bg-washi shadow-[0_18px_36px_-14px_rgb(0_0_0/0.8)]',
            wide ? 'origin-left flex-col justify-between' : 'origin-top flex-row justify-between',
          )}
          style={paper}
          initial={reduce ? { opacity: 0 } : paperShut}
          animate={reduce ? { opacity: 1 } : paperOpen}
          exit={reduce ? { opacity: 0, transition: rollUp } : { ...paperShut, transition: rollUp }}
          transition={unroll}
        >
          <span className={cn('bg-ai-800', wide ? 'h-[11px] w-full border-b border-kin-400/60' : 'h-full w-[11px] border-r border-kin-400/60')} />
          <span className={cn('bg-ai-800', wide ? 'h-[11px] w-full border-t border-kin-400/60' : 'h-full w-[11px] border-l border-kin-400/60')} />
        </motion.div>

        <Roller wide={wide} thick={false} />
        <motion.div
          aria-hidden
          className="absolute left-0 top-0"
          initial={reduce ? { opacity: 0 } : rollerHome}
          animate={reduce ? { opacity: 1 } : rollerOut}
          exit={reduce ? { opacity: 0, transition: rollUp } : { ...rollerHome, transition: rollUp }}
          transition={unroll}
          style={wide ? { width: THICK, height: h } : { width: w, height: THICK }}
        >
          <Roller wide={wide} thick />
        </motion.div>

        {/* The writing appears once the paper is open, and goes first when it rolls up. */}
        <motion.div
          className="absolute text-sumi-950 [&_:focus-visible]:outline-ai-600"
          style={text}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.25, delay: reduce ? 0 : 0.22 } }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
        >
          {wide ? (
            <div ref={railRef} className="flex h-full overflow-x-auto overflow-y-hidden overscroll-contain">
              <div className="grid h-full w-[150px] shrink-0 grid-cols-[1fr_auto] gap-2 py-2.5 pl-1 pr-2">
                <div className="flex min-h-0 flex-col">
                  <CloseButton onClose={onClose} />
                  <h2 id={titleId} className="mt-2 font-display text-[22px] font-bold leading-tight">
                    Ajustes
                  </h2>
                  <p id={summaryId} className="tabular mt-1 font-mono text-[13px] font-bold leading-snug text-sumi-700">
                    {summary}
                  </p>
                  <p className="mt-auto text-[12px] leading-snug text-sumi-600">Desliza para ver más →</p>
                </div>
                <TitleSlip />
              </div>
              {WIDE_COLUMNS.map((col) => (
                <section
                  key={col.keys.join()}
                  data-column
                  aria-label={col.title}
                  className="flex h-full shrink-0 flex-col overflow-y-auto border-l border-sumi-600/25 px-3 py-2.5"
                  style={{ width: col.width }}
                >
                  <ColumnBody col={col} f={f} split={short && Boolean(col.split)} />
                </section>
              ))}
            </div>
          ) : (
            <div className="h-full overflow-y-auto overscroll-contain">
              <header className="flex items-start gap-3 border-b border-sumi-600/25 px-2 pb-3 pt-3">
                <TitleSlip />
                <div className="min-w-0 flex-1 pt-1">
                  <h2 id={titleId} className="font-display text-[22px] font-bold leading-tight">
                    Ajustes
                  </h2>
                  <p id={summaryId} className="tabular mt-1 font-mono text-[14px] font-bold text-sumi-700">
                    {summary}
                  </p>
                </div>
                <CloseButton onClose={onClose} />
              </header>
              <div className="grid grid-cols-2">
                {TALL_CELLS.map((cell, i) => (
                  <section
                    key={cell.keys.join()}
                    aria-label={cell.title}
                    className={cn(
                      'border-b border-sumi-600/20 px-3 py-3',
                      cell.wide ? 'col-span-2' : i % 2 === 0 && 'border-r',
                    )}
                  >
                    <ColumnBody col={cell} f={f} split={false} />
                  </section>
                ))}
              </div>
              <p className="px-3 py-3 text-center text-[12px] text-sumi-600">Se guarda en este móvil.</p>
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

function ColumnBody({ col, f, split }: { col: Pick<Column, 'keys' | 'title' | 'glyph'>; f: Fields; split: boolean }) {
  if (col.title) {
    // The switches share one column under their own seal.
    return (
      <>
        <div className="flex items-center gap-2">
          <Seal glyph={col.glyph ?? ''} tone="paper" />
          <h3 className="text-[15px] font-bold">{col.title}</h3>
        </div>
        <div className="mt-1 divide-y divide-sumi-600/15">
          {col.keys.map((key) => {
            const field = f[key];
            return field.kind === 'switch' ? <SwitchRow key={key} field={field} tone="paper" className="py-2" /> : null;
          })}
        </div>
      </>
    );
  }
  return (
    <>
      {col.keys.map((key) => (
        <FieldBlock
          key={key}
          field={f[key]}
          tone="paper"
          layout="stack"
          columns={split ? 2 : 1}
          seal
          className="flex h-full flex-col"
        />
      ))}
    </>
  );
}

/** The title slip (daisen) pasted on a scroll: 録画設定, «recording settings», in vermilion (decorative). */
function TitleSlip() {
  return (
    <span
      aria-hidden
      className="self-start border border-shu-500/70 px-1 py-2 font-display text-[15px] font-bold leading-none tracking-[0.25em] text-shu-500 [writing-mode:vertical-rl]"
    >
      録画設定
    </span>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <motion.button
      type="button"
      aria-label="Cerrar los ajustes"
      onClick={onClose}
      whileTap={{ scale: 0.86 }}
      transition={jelly}
      className="grid size-11 shrink-0 place-items-center rounded-full bg-sumi-900 text-washi"
    >
      <X className="size-5" />
    </motion.button>
  );
}

/** A sumi roller: flat lacquer with two fine lines for the curve, and gold ends (jiku-saki). */
function Roller({ wide, thick }: { wide: boolean; thick: boolean }) {
  const size = thick ? THICK : THIN;
  return (
    <span
      aria-hidden
      className="absolute left-0 top-0 block"
      style={wide ? { width: size, height: '100%' } : { width: '100%', height: size }}
    >
      <span className="absolute inset-0 rounded-[5px] border border-sumi-700 bg-sumi-950 shadow-[0_6px_14px_-6px_rgb(0_0_0/0.9)]" />
      <span
        className={cn('absolute rounded-full bg-sumi-700', wide ? 'inset-y-3 left-[30%] w-[2px]' : 'inset-x-3 top-[30%] h-[2px]')}
      />
      {thick && (
        <span
          className={cn('absolute rounded-full bg-sumi-800', wide ? 'inset-y-3 left-[62%] w-px' : 'inset-x-3 top-[62%] h-px')}
        />
      )}
      <span
        className={cn(
          'absolute rounded-[3px] bg-kin-400',
          wide ? '-inset-x-[3px] -top-1 h-2.5' : '-inset-y-[3px] -left-1 w-2.5',
        )}
      />
      <span
        className={cn(
          'absolute rounded-[3px] bg-kin-400',
          wide ? '-inset-x-[3px] -bottom-1 h-2.5' : '-inset-y-[3px] -right-1 w-2.5',
        )}
      />
    </span>
  );
}
