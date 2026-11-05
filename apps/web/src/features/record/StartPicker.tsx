import { motion } from 'motion/react';
import { Locate, Repeat, SkipBack } from 'lucide-react';
import { useRef } from 'react';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
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
  onWarm,
}: {
  choice: StartChoice;
  onTap: () => void;
  onOpenList: () => void;
  listOpen: boolean;
  /** REQ-23 · A press started: the list may open, fetch it now. */
  onWarm?: () => void;
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
        onWarm?.();
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
      {/* On a pill of solid ink: readable over the camera's picture whatever it shows (WCAG 1.4.3). */}
      <span className="flex flex-col items-center rounded-[6px] bg-sumi-900/90 px-1 py-0.5 leading-none">
        <span className="whitespace-nowrap text-[11px] font-bold text-washi-muted">Empieza en</span>
        <span className="tabular mt-0.5 max-w-14 truncate text-[12px] font-bold text-washi">{label.short}</span>
      </span>
    </motion.button>
  );
}
