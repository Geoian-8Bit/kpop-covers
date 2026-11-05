// REQ-27 · Moved out of Transport.tsx unchanged: the A–B selection row (move first, optimise later).
import { cn } from '@/lib/cn';
import { hasRange, usePlayer } from '@/player/store';
import { formatTime } from '@coverscape/shared';
import { Repeat, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { GapPicker } from './popover';
import { GapBadge, gapSuffix } from './transportButtons';
import { useLongPress } from './useLongPress';

/** Contextual row for the current A–B selection. */
export function RangeBar() {
  const loop = usePlayer((s) => s.loop);
  const gap = usePlayer((s) => s.gap);
  const ready = usePlayer((s) => s.ready);
  const [menu, setMenu] = useState(false);
  const p = usePlayer.getState();
  const range = hasRange(loop);
  const press = useLongPress(
    () => setMenu(true),
    () => p.toggleLoop(),
  );
  const shown = loop.start != null;

  return (
    <AnimatePresence initial={false}>
      {shown && (
        // Clipped only while the height animates: open, the pause panel above «Repetir» must not be cut off (9).
        // While that panel is open the bar rises over the pinned video, like the tray (7).
        <motion.div
          initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
          animate={{ opacity: 1, height: 'auto', transitionEnd: { overflow: 'visible' } }}
          exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
          transition={{ duration: 0.2 }}
          className="relative has-[[role=menu]]:z-30"
        >
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[12px] border border-shu-500/35 bg-shu-500/[0.07] p-2">
            <button
              type="button"
              disabled={!ready}
              onClick={() => p.markStart()}
              title="Mover el inicio aquí (A)"
              className="flex h-11 items-center gap-2 rounded-[8px] px-2 hover:bg-washi/10"
            >
              <span className="grid size-6 place-items-center rounded-[4px] bg-shu-500 font-display text-xs font-extrabold text-washi">
                A
              </span>
              <span className="tabular font-mono text-sm text-washi">
                {formatTime(loop.start!, { tenths: true })}
              </span>
            </button>
            <span className="text-washi-subtle">→</span>
            <button
              type="button"
              disabled={!ready}
              onClick={() => p.markEnd()}
              title="Mover el final aquí (B)"
              className="flex h-11 items-center gap-2 rounded-[8px] px-2 hover:bg-washi/10"
            >
              <span
                className={cn(
                  'grid size-6 place-items-center rounded-[4px] font-display text-xs font-extrabold',
                  range ? 'bg-shu-500 text-washi' : 'border border-washi/30 text-washi-muted',
                )}
              >
                B
              </span>
              <span className="tabular font-mono text-sm text-washi">
                {range ? formatTime(loop.end!, { tenths: true }) : 'pulsa «Fin del clip»'}
              </span>
            </button>
            {range && (
              <span className="tabular font-mono text-xs text-washi-subtle">
                {formatTime(loop.end! - loop.start!, { tenths: true })}
              </span>
            )}

            <div className="ml-auto flex items-center gap-2">
              {range && (
                <div className="relative">
                  <button
                    type="button"
                    aria-pressed={loop.enabled}
                    aria-label={`Repetir el tramo${gapSuffix(gap)} (mantén pulsado para la pausa)`}
                    {...press}
                    className={cn(
                      'relative flex h-11 items-center gap-2 rounded-[8px] px-3 text-sm font-bold transition-colors',
                      loop.enabled
                        ? 'bg-shu-500/25 text-shu-400'
                        : 'text-washi-muted hover:bg-washi/10 hover:text-washi',
                    )}
                  >
                    <Repeat className="size-4" />
                    Repetir
                    {gap > 0 && <GapBadge seconds={gap} />}
                  </button>
                  <AnimatePresence>
                    {menu && (
                      <GapPicker
                        title="Pausa entre vueltas del clip"
                        value={gap}
                        onChange={(s) => p.setGap(s)}
                        onClose={() => setMenu(false)}
                        className="absolute bottom-[calc(100%+8px)] right-0"
                      />
                    )}
                  </AnimatePresence>
                </div>
              )}
              <button
                type="button"
                aria-label="Quitar tramo"
                onClick={() => p.clearLoop()}
                className="grid size-11 place-items-center rounded-[8px] text-washi-muted hover:bg-washi/10 hover:text-washi"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
