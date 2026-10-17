import { motion, useReducedMotion } from 'motion/react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import type { ChoiceField, Field, SwitchField } from './model';

/**
 * Building blocks of the settings panel: a radio group with a springing tab, a mochi switch, a field block
 * (label · explanation · control), a hanko seal, focus handling for a modal panel and a size probe.
 *
 * `tone` (of the seal): 'ink' sits on the dark urushi lacquer, 'paper' on light washi (the fan's slips).
 */
export type Tone = 'ink' | 'paper';

// ───────────────────────── Radio group ─────────────────────────

/** Radio group whose washi tab springs between options (side by side, equal widths); arrows move the choice. */
function Choice({
  field,
  labelledBy,
  describedBy,
}: {
  field: ChoiceField;
  labelledBy: string;
  describedBy?: string;
}) {
  const tabId = useId();
  const reduce = useReducedMotion();
  const [shake, setShake] = useState<string | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const { options } = field;
  const enabled = options.map((o) => !o.disabled);
  const checked = options.findIndex((o) => o.value === field.value);
  // Roving focus: Tab lands on the checked option (or the first one that can be chosen).
  const focusAt = checked >= 0 && enabled[checked] ? checked : enabled.indexOf(true);

  const move = (from: number, to: 1 | -1 | 'first' | 'last') => {
    const n = options.length;
    let i = from;
    if (to === 'first') i = enabled.indexOf(true);
    else if (to === 'last') i = enabled.lastIndexOf(true);
    else
      for (let k = 0; k < n; k++) {
        i = (i + to + n) % n;
        if (enabled[i]) break;
      }
    const option = options[i];
    if (!option || option.disabled) return;
    // Nowhere else to go (e.g. 60 is off): don't re-save the shown value over the stored one.
    if (i !== checked) field.select(option.value);
    refs.current[i]?.focus();
  };

  const onKeyDown = (e: ReactKeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(index, 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(index, -1);
    else if (e.key === 'Home') move(index, 'first');
    else if (e.key === 'End') move(index, 'last');
    else return;
    e.preventDefault();
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="well skin-track grid gap-1 rounded-[12px] p-1"
      style={{ gridAutoFlow: 'column', gridAutoColumns: 'minmax(0, 1fr)' }}
    >
      {options.map((option, index) => {
        const active = index === checked;
        return (
          <motion.button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-disabled={option.disabled || undefined}
            aria-label={option.ariaLabel}
            tabIndex={index === focusAt ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, index)}
            onClick={() => {
              // A choice this phone can't make doesn't move: it shakes its head (the reason is written below).
              if (option.disabled) setShake(option.value);
              // The option shown as chosen may be an effective value (e.g. 30 when 60 isn't possible): leave the stored one.
              else if (!active) field.select(option.value);
            }}
            whileTap={option.disabled ? undefined : { scale: 0.9 }}
            animate={shake === option.value && !reduce ? { x: [0, -5, 5, -3, 3, 0] } : { x: 0 }}
            transition={shake === option.value ? { duration: 0.36 } : jelly}
            onAnimationComplete={() => shake === option.value && setShake(null)}
            className={cn(
              'relative isolate flex min-h-11 items-center justify-center rounded-[9px] px-1.5 text-center text-[14px] leading-tight transition-colors duration-200',
              active
                ? 'font-bold text-sumi-900'
                : option.disabled
                  ? 'cursor-not-allowed text-washi-subtle/55 line-through decoration-1'
                  : 'font-medium text-washi-muted hover:text-washi',
            )}
          >
            {active && (
              <motion.span
                aria-hidden
                layoutId={tabId}
                transition={jelly}
                className="skin-thumb absolute inset-0 -z-10 rounded-[9px] bg-washi [--skin-fill:var(--color-washi)] shadow-[inset_0_0_0_2px_var(--color-washi),inset_0_0_0_3px_rgb(27_25_22/0.2),0_4px_10px_-4px_rgb(0_0_0/0.8)]"
              />
            )}
            <span className="tabular relative">{option.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

// ───────────────────────── Switch ─────────────────────────

/**
 * The switch's drawing. Its parent is a motion element animating 'on' / 'off' with whileTap="pressed": the thumb
 * stretches like mochi while pressed (scaleX, never width) and the indigo fill fades in (opacity only).
 */
function SwitchTrack({ on }: { on: boolean }) {
  return (
    <span aria-hidden className="relative block h-8 w-[52px] shrink-0">
      <span className="skin-track absolute inset-0 rounded-full border border-washi/20 bg-sumi-950" />
      <motion.span
        className="skin-track absolute inset-0 rounded-full border border-ai-300/70 bg-ai-500"
        custom={on}
        variants={{ off: { opacity: 0 }, on: { opacity: 1 }, pressed: (o: boolean) => ({ opacity: o ? 1 : 0 }) }}
        transition={{ duration: 0.2 }}
      />
      <motion.span
        className="skin-thumb absolute left-1 top-1 size-6 rounded-full bg-washi [--skin-fill:var(--color-washi)] shadow-[inset_0_-2px_0_rgb(0_0_0/0.12),0_2px_6px_rgb(0_0_0/0.45)]"
        custom={on}
        variants={{
          off: { x: 0, scaleX: 1 },
          on: { x: 20, scaleX: 1 },
          pressed: (o: boolean) => ({ x: o ? 16 : 4, scaleX: 1.35 }),
        }}
        transition={jelly}
      />
    </span>
  );
}

/** A whole row is the switch (≥ 48 px): label and explanation on the left, the switch on the right. */
function SwitchRow({ field, className }: { field: SwitchField; className?: string }) {
  const labelId = useId();
  const helpId = useId();
  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={field.value}
      aria-labelledby={labelId}
      aria-describedby={helpId}
      onClick={field.toggle}
      initial={false}
      animate={field.value ? 'on' : 'off'}
      whileTap="pressed"
      className={cn('flex min-h-12 w-full items-center gap-3 rounded-[12px] py-1.5 text-left', className)}
    >
      <span className="min-w-0 flex-1">
        <span id={labelId} className="block text-[15px] font-bold leading-tight text-washi">
          {field.label}
        </span>
        <span id={helpId} className="mt-0.5 block text-[12.5px] leading-snug text-washi-subtle">
          {field.help}
        </span>
      </span>
      <SwitchTrack on={field.value} />
    </motion.button>
  );
}

// ───────────────────────── Field block ─────────────────────────

/** Small hanko seal with the setting's kanji (decorative). */
export function Seal({ glyph, tone = 'ink', className }: { glyph: string; tone?: Tone; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-[5px] border font-display text-[14px] font-bold leading-none',
        tone === 'ink' ? 'border-shu-500/70 text-shu-400' : 'border-shu-500 text-shu-500',
        className,
      )}
    >
      {glyph}
    </span>
  );
}

/** Label · what the current value does · why something is off · the control. */
export function FieldBlock({ field, className }: { field: Field; className?: string }) {
  const labelId = useId();
  const helpId = useId();
  const noteId = useId();
  if (field.kind === 'switch') return <SwitchRow field={field} className={className} />;
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <span id={labelId} className="text-[15px] font-bold leading-tight text-washi">
          {field.label}
        </span>
      </div>
      <motion.p
        key={field.help}
        id={helpId}
        initial={{ opacity: 0.35 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="mt-1 text-[12.5px] leading-snug text-washi-subtle"
      >
        {field.help}
      </motion.p>
      {field.note && (
        <p id={noteId} className="mt-1 flex items-start gap-1.5 text-[12.5px] font-medium leading-snug text-kin-300">
          <span aria-hidden className="mt-[5px] size-1.5 shrink-0 rotate-45 bg-current" />
          <span>
            {field.note}
            {field.noteAction && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={field.noteAction.run}
                  className="-my-3 inline-flex min-h-11 items-center font-bold text-washi underline underline-offset-2"
                >
                  {field.noteAction.label}
                </button>
              </>
            )}
          </span>
        </p>
      )}
      <div className="mt-auto pt-2">
        <Choice
          field={field}
          labelledBy={labelId}
          describedBy={field.note ? `${helpId} ${noteId}` : helpId}
        />
      </div>
    </div>
  );
}

// ───────────────────────── Modal behaviour ─────────────────────────

function focusables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]'),
  ).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !(el as HTMLButtonElement).disabled &&
      !el.closest('[inert]') &&
      el.getClientRects().length > 0,
  );
}

/**
 * A modal panel's keyboard contract: focus moves inside on open ([data-autofocus] first), Tab stays inside, Escape
 * calls `onEscape` (and only it: the recorder behind doesn't hear it), and focus goes back where it was on close.
 */
export function useModalFocus(open: boolean, panelRef: RefObject<HTMLElement | null>, onEscape: () => void) {
  const escape = useRef(onEscape);
  escape.current = onEscape;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const preferred = panel?.querySelector<HTMLElement>('[data-autofocus]');
      (preferred ?? focusables(panel)[0] ?? panel)?.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        escape.current();
        return;
      }
      const panel = panelRef.current;
      if (e.key !== 'Tab' || !panel) return;
      const nodes = focusables(panel);
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const active = document.activeElement;
      const outside = !panel.contains(active) || active === panel;
      if (e.shiftKey && (outside || active === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (outside || active === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, panelRef]);
}

/** The size of a box (the recorder): the panel shapes itself to it, not the window. */
export function useBoxSize(ref: RefObject<HTMLElement | null>): { w: number; h: number } | null {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** An invisible layer covering the panel's box, measured by useBoxSize. */
export function BoxProbe({ probeRef }: { probeRef: RefObject<HTMLDivElement | null> }) {
  return <div ref={probeRef} aria-hidden className="pointer-events-none invisible absolute inset-0" />;
}

/** Stops taps on the panel from reaching the camera preview below (tap to focus, pinch). */
export const stopToCamera = { onPointerDown: (e: { stopPropagation(): void }) => e.stopPropagation() };
