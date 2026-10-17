import { formatTime, type Clip } from '@coverscape/shared';
import { motion } from 'motion/react';
import { Check, Locate, Repeat, Scissors, SkipBack, X } from 'lucide-react';
import { useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { jelly, soft } from '@/lib/motion';
import { useModalFocus } from './settings/controls';
import { startLabel, type StartChoice } from './startRules';

/** How long a press must last to open the list instead of switching. */
const HOLD_MS = 480;

/**
 * P22 · Where the song starts when the take starts. A tap switches between what there is (Inicio → the moment the
 * song was at → the A–B section); holding it (or the context menu, or ↓ on a keyboard) opens the list, with the
 * song's clips too. The value is written out: «Empieza en · 0:26».
 */
export function StartButton({
  choice,
  onTap,
  onOpenList,
  listOpen,
}: {
  choice: StartChoice;
  onTap: () => void;
  onOpenList: () => void;
  listOpen: boolean;
}) {
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; fired: boolean } | null>(
    null,
  );
  const fired = useRef(false);
  const clear = () => {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
  };
  const label = startLabel(choice);
  const Icon =
    choice.kind === 'range' || choice.kind === 'clip' ? Repeat : choice.kind === 'here' ? Locate : SkipBack;
  return (
    <motion.button
      type="button"
      aria-label={`Empieza en: ${label.spoken}. Toca para cambiar; mantén pulsado para elegir un clip`}
      aria-haspopup="dialog"
      aria-expanded={listOpen}
      onPointerDown={(e) => {
        fired.current = false;
        clear();
        const state = {
          x: e.clientX,
          y: e.clientY,
          fired: false,
          timer: setTimeout(() => {
            state.fired = true;
            fired.current = true;
            onOpenList();
          }, HOLD_MS),
        };
        hold.current = state;
      }}
      onPointerMove={(e) => {
        const h = hold.current;
        if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 10) clear();
      }}
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
      // Android's long press (and a right click, or the menu key) also opens the list.
      onContextMenu={(e) => {
        e.preventDefault();
        clear();
        // A long press already opened it (opening again is harmless); the click that may follow is swallowed once.
        fired.current = true;
        onOpenList();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') fired.current = false;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || (e.key === 'F10' && e.shiftKey)) {
          e.preventDefault();
          onOpenList();
        }
      }}
      onClick={() => {
        // The press that opened the list is not also a tap.
        if (fired.current) {
          fired.current = false;
          return;
        }
        onTap();
      }}
      whileTap={{ scale: 0.86 }}
      transition={jelly}
      className="flex w-14 flex-col items-center gap-1 [-webkit-touch-callout:none]"
    >
      <span
        className={cn(
          'grid size-11 place-items-center rounded-full',
          listOpen ? 'bg-kin-300 text-sumi-900' : 'bg-black/45',
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="flex flex-col items-center leading-none [text-shadow:0_1px_4px_rgb(0_0_0/0.8)]">
        <span className="text-[9.5px] font-bold text-washi/80">Empieza en</span>
        <span className="tabular mt-0.5 max-w-14 truncate text-[11px] font-bold text-washi">
          {label.short}
        </span>
      </span>
    </motion.button>
  );
}

interface Option {
  key: string;
  choice: StartChoice;
  icon: ReactNode;
  title: string;
  detail: string;
}

/** The list of places to start: the song's start, where it was, the A–B section, and every clip of the song. */
export function StartList({
  current,
  hereAt,
  range,
  clips,
  onPick,
  onClose,
}: {
  current: StartChoice;
  /** Where the song was when the recorder opened (null: at the start, nothing to offer). */
  hereAt: number | null;
  range: { start: number; end: number } | null;
  clips: Clip[];
  onPick: (choice: StartChoice) => void;
  onClose: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  useModalFocus(true, root, onClose);
  const options: Option[] = [
    {
      key: 'start',
      choice: { kind: 'start' },
      icon: <SkipBack className="size-4" />,
      title: 'Inicio',
      detail: 'Desde el principio de la canción',
    },
  ];
  if (hereAt != null)
    options.push({
      key: 'here',
      choice: { kind: 'here', at: hereAt },
      icon: <Locate className="size-4" />,
      title: `Momento actual · ${formatTime(hereAt)}`,
      detail: 'Donde estaba la canción al abrir el grabador',
    });
  if (range && !(current.kind === 'clip' && current.start === range.start && current.end === range.end))
    options.push({
      key: 'range',
      choice: { kind: 'range', start: range.start, end: range.end },
      icon: <Repeat className="size-4" />,
      title: `Tramo A–B · ${formatTime(range.start)}–${formatTime(range.end)}`,
      detail: 'Solo el tramo marcado; la toma termina en B',
    });
  const sorted = [...clips].sort((a, b) => a.start_seconds - b.start_seconds);
  const isOn = (c: StartChoice) =>
    c.kind === current.kind &&
    (c.kind !== 'clip' || (current.kind === 'clip' && current.clipId === c.clipId)) &&
    (c.kind !== 'range' || current.kind === 'range');
  const anyOn =
    options.some((o) => isOn(o.choice)) ||
    sorted.some((c) => current.kind === 'clip' && current.clipId === c.id);

  /** ↑ ↓ Home End move between the rows (one Tab stop: the chosen row); Enter or Space picks. */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
    if (!rows.length) return;
    e.preventDefault();
    const i = rows.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? rows.length - 1
          : (i + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
    rows.forEach((r, k) => (r.tabIndex = k === next ? 0 : -1));
    rows[next]?.focus();
  };

  return (
    <>
      {/* A tap outside closes the list (and never reaches the preview or the shutter underneath). */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={soft}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onClose}
        className="absolute inset-0 z-[39] bg-sumi-950/30"
      />
      <motion.section
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-start-title"
        tabIndex={-1}
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={soft}
        onPointerDown={(e) => e.stopPropagation()}
        className="paper-raised absolute inset-x-3 bottom-[calc(max(18px,env(safe-area-inset-bottom))+150px)] z-40 mx-auto flex max-h-[calc(100dvh-max(14px,env(safe-area-inset-top))-max(18px,env(safe-area-inset-bottom))-220px)] max-w-sm flex-col overflow-hidden rounded-[16px] text-washi outline-none landscape:bottom-auto landscape:left-auto landscape:right-[calc(max(16px,env(safe-area-inset-right))+120px)] landscape:top-[max(12px,env(safe-area-inset-top))] landscape:max-h-[calc(100dvh-24px)] landscape:w-80"
      >
        <header className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-3">
          <h2 id="record-start-title" className="flex-1 font-display text-[17px] font-bold">
            ¿Desde dónde empieza?
          </h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="-mr-2 grid size-11 place-items-center rounded-full hover:bg-washi/10"
          >
            <X className="size-5" />
          </button>
        </header>
        <p className="shrink-0 px-4 text-[12.5px] leading-snug text-washi-subtle">
          La canción arranca ahí cuando empieza la toma.
        </p>
        <div
          role="radiogroup"
          aria-label="Punto de inicio"
          onKeyDown={onKeyDown}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 pt-2"
        >
          {options.map((o, i) => {
            const on = isOn(o.choice);
            // Focus starts on the chosen row (on the first one when none is).
            const first = on || (!anyOn && i === 0);
            return (
              <Row
                key={o.key}
                on={on}
                focusFirst={first}
                icon={o.icon}
                title={o.title}
                detail={o.detail}
                onPick={() => onPick(o.choice)}
              />
            );
          })}
          {sorted.length > 0 && (
            <p className="px-2 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-kin-300">
              Clips de la canción
            </p>
          )}
          {sorted.map((c) => (
            <Row
              key={c.id}
              on={current.kind === 'clip' && current.clipId === c.id}
              focusFirst={current.kind === 'clip' && current.clipId === c.id}
              icon={<Scissors className="size-4" />}
              title={c.name}
              // Only its section: the take keeps the studio's speed (P22 review).
              detail={`${formatTime(c.start_seconds)}–${formatTime(c.end_seconds)} · solo el tramo`}
              onPick={() =>
                onPick({
                  kind: 'clip',
                  clipId: c.id,
                  start: c.start_seconds,
                  end: c.end_seconds,
                  name: c.name,
                })
              }
            />
          ))}
        </div>
      </motion.section>
    </>
  );
}

function Row({
  on,
  icon,
  title,
  detail,
  focusFirst,
  onPick,
}: {
  on: boolean;
  icon: ReactNode;
  title: string;
  detail: string;
  /** The row focus lands on, and the list's only Tab stop. */
  focusFirst?: boolean;
  onPick: () => void;
}) {
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={on}
      tabIndex={focusFirst ? 0 : -1}
      data-autofocus={focusFirst ? '' : undefined}
      onClick={onPick}
      whileTap={{ scale: 0.97 }}
      transition={jelly}
      className={cn(
        'flex min-h-12 w-full items-center gap-3 rounded-[10px] px-2 py-1.5 text-left',
        on ? 'bg-washi/10' : 'hover:bg-washi/5',
      )}
    >
      <span
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-full',
          on ? 'bg-kin-300 text-sumi-900' : 'bg-sumi-950/60 text-washi-muted',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-bold leading-tight">{title}</span>
        <span className="tabular block truncate text-[12px] leading-snug text-washi-subtle">{detail}</span>
      </span>
      {on && <Check aria-hidden className="size-4 shrink-0 text-kin-300" />}
    </motion.button>
  );
}
