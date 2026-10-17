import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/cn';
import { jelly, snappy, soft } from '@/lib/motion';
import {
  angleDelta,
  clampDial,
  dialIndexAt,
  dialRadius,
  dialRotationFor,
  pointerAngle,
  polar,
  type DialConfig,
} from '../navRules';
import {
  CurrentGlyph,
  EntryIcon,
  EntryLink,
  QuickNavRoot,
  QuickNavScrim,
  QuickNavTrigger,
  useQuickNav,
  type NavEntry,
  type QuickNavApi,
  type QuickNavProps,
} from '../quickNavCore';

/**
 * P1 · Prototype «Rueda de kamon»: a large lacquer seal peeks out of the corner (a quarter shows). The sections sit
 * on its rim like a dial: turn it with the thumb and the one in the golden notch lights up, with a tiny vibration
 * at each step when the phone allows it. Tapping any of them also takes you there; arrows turn it from the keyboard.
 * Delete this file if another prototype is chosen.
 */
export default function NavKamon(props: QuickNavProps) {
  const api = useQuickNav(props);
  return (
    <QuickNavRoot api={api}>
      <QuickNavScrim api={api} />
      <AnimatePresence>{api.open && api.stage && <Dial key="dial" api={api} />}</AnimatePresence>
      <QuickNavTrigger
        api={api}
        face={
          <span className="relative grid size-14 place-items-center rounded-full bg-sumi-950 shadow-[0_10px_22px_-8px_rgb(0_0_0/0.95)]">
            <span aria-hidden className="absolute inset-[3px] rounded-full border-2 border-dashed border-kin-400/70" />
            <span aria-hidden className="absolute inset-[9px] rounded-full border border-kin-400/50" />
            <CurrentGlyph api={api} className="relative text-[19px] text-kin-200" />
          </span>
        }
      />
    </QuickNavRoot>
  );
}

const STEP = 32;
const NOTCH = -45;

function Dial({ api }: { api: QuickNavApi }) {
  const stage = api.stage!;
  const { entries, reduce } = api;
  const config: DialConfig = { step: STEP, notch: NOTCH, count: entries.length };
  const r = dialRadius(stage.ax, stage.ay, api.top);
  const discR = r + 62;
  const start = Math.max(0, entries.findIndex((e) => e.active));
  const rotation = useMotionValue(dialRotationFor(start, config));
  const [notchIndex, setNotchIndex] = useState(start);
  const notchRef = useRef(start);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const drag = useRef<{ cx: number; cy: number; last: number; value: number; x: number; y: number; moved: boolean } | null>(null);

  useMotionValueEvent(rotation, 'change', (value) => {
    const k = dialIndexAt(value, config);
    if (k === notchRef.current) return;
    notchRef.current = k;
    setNotchIndex(k);
    // A click of the dial under the thumb (Android; ignored where unsupported).
    if (drag.current?.moved) navigator.vibrate?.(8);
  });

  const turnTo = (index: number) => {
    const k = Math.max(0, Math.min(entries.length - 1, index));
    void animate(rotation, dialRotationFor(k, config), reduce ? { duration: 0 } : jelly);
    return k;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const root = api.rootRef.current?.getBoundingClientRect();
    if (!root) return;
    rotation.stop();
    const cx = root.left + stage.ax;
    const cy = root.top + stage.ay;
    drag.current = { cx, cy, last: pointerAngle(cx, cy, e.clientX, e.clientY), value: rotation.get(), x: e.clientX, y: e.clientY, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
      d.moved = true;
      // Captured from here: no click reaches a section once the dial is being turned.
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    const angle = pointerAngle(d.cx, d.cy, e.clientX, e.clientY);
    d.value += angleDelta(d.last, angle);
    d.last = angle;
    rotation.set(clampDial(d.value, config));
  };
  const onPointerEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) turnTo(dialIndexAt(rotation.get(), config));
  };

  const onItemKey = (e: ReactKeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = i + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = i - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = entries.length - 1;
    if (next < 0 || next >= entries.length) return;
    e.preventDefault();
    const k = turnTo(next);
    itemRefs.current[k]?.focus({ preventScroll: true });
  };

  const notchPoint = polar(stage.ax, stage.ay, r + 44, NOTCH);
  // The hint sits just above the seal, right-aligned with the button.
  const hint = { x: stage.ax - 8, y: stage.ay - discR - 10 };

  return (
    <motion.div
      role="group"
      aria-label="Secciones"
      aria-roledescription="rueda"
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.18, delay: 0.05 } }}
      transition={{ duration: 0.18 }}
    >
      {/* The seal: spins in from the corner, then turns with the thumb. */}
      <motion.div
        className="absolute"
        style={{ left: stage.ax, top: stage.ay }}
        initial={reduce ? false : { scale: 0.25, rotate: -60 }}
        animate={{ scale: 1, rotate: 0 }}
        exit={reduce ? undefined : { scale: 0.25, rotate: -60, transition: snappy }}
        transition={soft}
      >
        <div
          className="pointer-events-auto absolute touch-none rounded-full"
          style={{ left: -discR, top: -discR, width: discR * 2, height: discR * 2 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <span
            aria-hidden
            className="absolute inset-0 rounded-full border-[3px] border-kin-400/80 bg-sumi-900 shadow-[0_0_0_6px_var(--color-sumi-950),0_24px_60px_-10px_rgb(0_0_0/0.9)]"
          />
          <span aria-hidden className="absolute inset-[18px] rounded-full border border-kin-400/35" />
          <span aria-hidden className="absolute rounded-full border border-kin-400/35" style={{ inset: discR - r + 40 }} />
          <motion.div className="absolute left-1/2 top-1/2 size-0" style={{ rotate: rotation }}>
            <Ticks r={discR - 9} count={entries.length} />
            {entries.map((entry, i) => (
              <DialItem
                key={entry.id}
                api={api}
                entry={entry}
                index={i}
                r={r}
                rotation={rotation}
                inNotch={i === notchIndex}
                refFn={(node) => {
                  itemRefs.current[i] = node;
                }}
                onKeyDown={(e) => onItemKey(e, i)}
                // Tab to a section turns it into the notch (not while the thumb is turning the dial).
                onFocus={() => {
                  if (!drag.current) turnTo(i);
                }}
              />
            ))}
          </motion.div>
        </div>
      </motion.div>

      {/* The golden notch (fixed: the dial turns under it). */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute size-0"
        style={{ left: notchPoint.x, top: notchPoint.y, rotate: NOTCH }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: reduce ? 0 : 0.2 } }}
        exit={{ opacity: 0, transition: { duration: 0.1 } }}
      >
        <span className="absolute -left-[9px] -top-[14px] h-[14px] w-[18px] bg-kin-300 [clip-path:polygon(0_0,100%_0,50%_100%)]" />
      </motion.span>

      <motion.p
        aria-hidden
        className="pointer-events-none absolute -translate-x-full -translate-y-full whitespace-nowrap rounded-full bg-sumi-950/85 px-2.5 py-1 text-[12px] font-bold text-washi-muted"
        style={{ left: hint.x, top: hint.y }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: reduce ? 0 : 0.35 } }}
        exit={{ opacity: 0, transition: { duration: 0.1 } }}
      >
        Gira la rueda · toca para ir
      </motion.p>
    </motion.div>
  );
}

/** Carved ticks on the rim, between the sections. Decorative. */
function Ticks({ r, count }: { r: number; count: number }) {
  const size = r * 2 + 8;
  const ticks = Array.from({ length: count * 4 + 8 }, (_, i) => -STEP * 2 + (i * STEP) / 4);
  return (
    <svg aria-hidden className="pointer-events-none absolute overflow-visible" style={{ left: -size / 2, top: -size / 2 }} width={size} height={size}>
      {ticks.map((deg, i) => {
        const a = polar(size / 2, size / 2, r, deg);
        const b = polar(size / 2, size / 2, r - (i % 4 === 0 ? 10 : 5), deg);
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="var(--color-kin-400)"
            strokeOpacity={i % 4 === 0 ? 0.8 : 0.4}
            strokeWidth={i % 4 === 0 ? 2 : 1}
          />
        );
      })}
    </svg>
  );
}

function DialItem({
  api,
  entry,
  index,
  r,
  rotation,
  inNotch,
  refFn,
  onKeyDown,
  onFocus,
}: {
  api: QuickNavApi;
  entry: NavEntry;
  index: number;
  r: number;
  rotation: MotionValue<number>;
  inNotch: boolean;
  refFn: (node: HTMLElement | null) => void;
  onKeyDown: (e: ReactKeyboardEvent) => void;
  onFocus: () => void;
}) {
  // Turned back by the dial's own rotation, so every seal stays upright while the wheel turns.
  const upright = useTransform(rotation, (v) => -(v + index * STEP));
  return (
    <div className="absolute size-0" style={{ transform: `rotate(${index * STEP}deg) translateY(${-r}px)` }}>
      <motion.div className="absolute size-0" style={{ rotate: upright }}>
        <EntryLink
          ref={refFn}
          api={api}
          entry={entry}
          aria-label={entry.label}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          animate={{ scale: inNotch ? 1.14 : 0.92, opacity: inNotch ? 1 : 0.78 }}
          transition={api.reduce ? { duration: 0 } : jelly}
          className="absolute -left-12 -top-9 flex w-24 flex-col items-center gap-1 rounded-[14px] py-1 outline-none focus-visible:ring-2 focus-visible:ring-kin-300"
        >
          <span
            aria-hidden
            className={cn(
              'relative grid size-14 place-items-center rounded-full border-2 shadow-[0_8px_16px_-8px_rgb(0_0_0/0.9)]',
              entry.active ? 'border-washi bg-shu-600 text-washi' : inNotch ? 'border-kin-300 bg-washi text-sumi-900' : 'border-kin-400/60 bg-sumi-800 text-washi',
            )}
          >
            <span className="font-display text-[20px] font-extrabold leading-none">{entry.kanji}</span>
            <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full border border-kin-400/60 bg-sumi-950 text-kin-200">
              <EntryIcon entry={entry} className="size-3.5" />
            </span>
          </span>
          <span
            className={cn(
              'max-w-full rounded-full px-2 text-center text-[12px] font-bold leading-[18px]',
              inNotch ? 'bg-kin-300 text-sumi-950' : 'bg-sumi-950/85 text-washi-muted',
            )}
          >
            {entry.short}
          </span>
        </EntryLink>
      </motion.div>
    </div>
  );
}
