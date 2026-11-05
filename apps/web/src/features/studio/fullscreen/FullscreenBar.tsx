import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { useBackToClose } from '@/lib/useBackToClose';
import { hasRange, usePlayer } from '@/player/store';
import { type Clip, formatSpeed, formatTime, SPEED_PRESETS } from '@coverscape/shared';
import { FlipHorizontal2, Minimize2, Repeat, Repeat1, RotateCw, Smartphone } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { fsChrome } from '../fullscreenChrome';
import { orientationButtonLabel, orientationLabel, type OrientationPref } from '../fullscreenRules';
import { useUnlessCovered } from '../studioAsleep';
import { GapPicker } from '../popover';
import { GapBadge } from '../transportButtons';
import { useLongPress } from '../useLongPress';
import { useMenuFocus } from '../useMenuFocus';
import { FsPanArrows } from '../ZoomControls';
import { FsProgress } from './FsProgress';
import { FsPlayButton } from './stageOverlays';

/** Compact fullscreen transport: progress line + one small row of controls. */
export function FullscreenBar({
  clips,
  onClipSelect,
  onExit,
  orientation,
  onCycleOrientation,
}: {
  clips: Clip[];
  onClipSelect: (clip: Clip) => void;
  onExit: () => void;
  /** REQ-02 · The fixed-orientation state; null where the button would do nothing (a desktop with a mouse). */
  orientation: OrientationPref | null;
  onCycleOrientation: () => void;
}) {
  const mirrored = usePlayer((s) => s.mirrored);
  const rate = usePlayer((s) => s.rate);
  const loop = usePlayer((s) => s.loop);
  const loopAll = usePlayer((s) => s.loopAll);
  const gap = usePlayer((s) => s.gap);
  const gapAll = usePlayer((s) => s.gapAll);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [gapMenu, setGapMenu] = useState<'all' | 'clip' | null>(null);
  const menuOpen = speedOpen || gapMenu != null;
  // An open menu keeps the controls up (they never auto-hide underneath it).
  useEffect(() => fsChrome.setMenu(menuOpen), [menuOpen]);
  useEffect(() => () => fsChrome.setMenu(false), []);
  const allPress = useLongPress(
    () => setGapMenu('all'),
    () => usePlayer.getState().toggleLoopAll(),
  );
  const clipPress = useLongPress(
    () => setGapMenu('clip'),
    () => usePlayer.getState().toggleLoop(),
  );
  const p = usePlayer.getState();
  const btnBase = 'rounded-full text-washi transition-colors hover:bg-washi/15 active:bg-washi/20';
  const btn = `grid size-11 place-items-center ${btnBase}`;
  /** With a pause set, the seconds sit beside the icon (Transport's badge, same as the bar below). */
  const badged = 'flex h-11 w-auto min-w-11 items-center justify-center gap-1 px-2';

  const speedRef = useRef<HTMLDivElement>(null);
  const speedMenuRef = useRef<HTMLDivElement>(null);
  // Keyboard: focus into the menu, arrows between speeds, back to the button on closing.
  useMenuFocus(speedMenuRef, speedOpen);
  // The phone's back button closes the menu instead of leaving fullscreen and the song.
  useBackToClose(speedOpen, () => setSpeedOpen(false));
  useEffect(() => {
    if (!speedOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!speedRef.current?.contains(e.target as Node)) setSpeedOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setSpeedOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [speedOpen]);

  return (
    <div className="fs-hit pointer-events-none absolute inset-x-0 bottom-0">
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgb(0_0_0/0.75),transparent)]" />
      <div className="px-3 pb-[max(6px,env(safe-area-inset-bottom))] pt-10 sm:px-5">
        <FsPanArrows />
        <FsProgress clips={clips} onClipSelect={onClipSelect} />
        <div className="flex items-center gap-0.5 sm:gap-1">
          <FsPlayButton />
          <FsClock />

          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            <div ref={speedRef} className="relative">
              <button
                type="button"
                aria-label={`Velocidad: ${formatSpeed(rate)}`}
                aria-haspopup="menu"
                aria-expanded={speedOpen}
                onClick={() => setSpeedOpen((v) => !v)}
                className="tabular h-11 rounded-full px-3 font-mono text-[13px] font-semibold text-washi transition-colors hover:bg-washi/15"
              >
                {formatSpeed(rate)}
              </button>
              <AnimatePresence>
                {speedOpen && (
                  <motion.div
                    ref={speedMenuRef}
                    role="menu"
                    aria-label="Velocidad"
                    initial={{ opacity: 0, y: 6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, transition: { duration: 0.1 } }}
                    transition={jelly}
                    className="absolute bottom-12 right-0 grid w-40 grid-cols-2 gap-1 rounded-[12px] bg-sumi-950/95 p-1.5 shadow-xl ring-1 ring-washi/15"
                  >
                    {SPEED_PRESETS.map((s) => (
                      <button
                        key={s}
                        role="menuitemradio"
                        aria-checked={s === rate}
                        type="button"
                        onClick={() => {
                          p.setRate(s);
                          setSpeedOpen(false);
                        }}
                        className={cn(
                          'tabular flex h-11 w-full items-center justify-center rounded-[8px] font-mono text-[13px]',
                          s === rate ? 'bg-washi text-sumi-900' : 'text-washi hover:bg-washi/10',
                        )}
                      >
                        {formatSpeed(s)}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="relative">
              <button
                type="button"
                aria-label={`Repetir la canción entera${gapAll > 0 ? `, pausa de ${gapAll} s` : ''} (mantén pulsado para la pausa)`}
                aria-pressed={loopAll}
                {...allPress}
                className={cn(gapAll > 0 ? btnBase : btn, gapAll > 0 && badged, loopAll && 'text-ai-300')}
              >
                <Repeat1 className="size-[18px]" />
                {gapAll > 0 && <GapBadge seconds={gapAll} />}
              </button>
              <AnimatePresence>
                {gapMenu === 'all' && (
                  <GapPicker
                    title="Pausa entre vueltas de la canción"
                    value={gapAll}
                    onChange={(s) => p.setGapAll(s)}
                    onClose={() => setGapMenu(null)}
                    className="absolute bottom-12 right-0"
                  />
                )}
              </AnimatePresence>
            </div>
            <div className="relative">
              <button
                type="button"
                aria-label={`Repetir tramo${gap > 0 ? `, pausa de ${gap} s` : ''} (mantén pulsado para la pausa)`}
                aria-pressed={loop.enabled && hasRange(loop)}
                {...clipPress}
                className={cn(
                  gap > 0 ? btnBase : btn,
                  gap > 0 && badged,
                  !hasRange(loop) && 'opacity-50',
                  loop.enabled && hasRange(loop) && 'text-shu-400',
                )}
              >
                <Repeat className="size-[18px]" />
                {gap > 0 && <GapBadge seconds={gap} />}
              </button>
              <AnimatePresence>
                {gapMenu === 'clip' && (
                  <GapPicker
                    title="Pausa entre vueltas del clip"
                    value={gap}
                    onChange={(s) => p.setGap(s)}
                    onClose={() => setGapMenu(null)}
                    className="absolute bottom-12 right-0"
                  />
                )}
              </AnimatePresence>
            </div>
            <button
              type="button"
              aria-label="Espejo"
              aria-pressed={mirrored}
              onClick={() => p.toggleMirror()}
              className={cn(btn, mirrored && 'text-ai-300')}
            >
              <FlipHorizontal2 className="size-[18px]" />
            </button>
            {orientation && (
              <button
                type="button"
                aria-label={orientationButtonLabel(orientation)}
                title={`Orientación ${orientationLabel(orientation)}`}
                onClick={onCycleOrientation}
                className={cn(btn, orientation !== 'auto' && 'text-ai-300')}
              >
                {orientation === 'portrait' ? (
                  <Smartphone className="size-[18px]" />
                ) : orientation === 'landscape' ? (
                  <Smartphone className="size-[18px] rotate-90" />
                ) : (
                  <RotateCw className="size-[18px]" />
                )}
              </button>
            )}
            <button type="button" aria-label="Salir de pantalla completa" className={btn} onClick={onExit}>
              <Minimize2 className="size-[18px]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Only the clock reads the playhead, and only once per second. */
function FsClock() {
  const second = useUnlessCovered((s) => Math.floor(s.time));
  const duration = usePlayer((s) => s.duration);
  return (
    <span className="tabular ml-0.5 whitespace-nowrap font-mono text-[13px] text-washi">
      {formatTime(second)}
      {/* On a narrow upright screen the length gives way to the buttons (it's on the progress line anyway). */}
      <span className="text-washi-subtle max-[420px]:hidden"> / {formatTime(duration)}</span>
    </span>
  );
}
