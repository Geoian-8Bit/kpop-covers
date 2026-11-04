import { ButtonSkin } from '@/components/ui/ButtonSkin';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { hasRange, usePlayer } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';
import { formatSpeed, formatTime, SPEED_PRESETS, stepSpeed } from '@coverscape/shared';
import {
  BookmarkPlus,
  FlipHorizontal2,
  Minus,
  Plus,
  Repeat1,
  RotateCcw,
  RotateCw,
  Scissors,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { GapPicker, Popover } from './popover';
import { useUnlessCovered } from './studioAsleep';
import { useLongPress } from './useLongPress';

const tool =
  'relative flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[10px] border px-3 text-sm font-bold transition-colors disabled:opacity-40';
const toolIdle = 'border-line-strong bg-sumi-800 text-washi-muted hover:border-washi/40 hover:text-washi';
/**
 * Buttons inside the settings tray: borderless, the tray itself is the frame. Drawn 38 px tall, touched 44 px: the
 * ::after reaches 3 px into the tray's padding above and below.
 */
export const trayBtn =
  "skin-pill relative flex h-[38px] shrink-0 items-center gap-2 rounded-[8px] px-3 text-sm font-bold transition-colors after:absolute after:inset-x-0 after:-inset-y-[3px] after:content-[''] max-sm:px-2.5";
export const trayIdle = 'text-washi-muted hover:bg-washi/[0.07] hover:text-washi';
export const trayOn = 'bg-ai-600/50 text-ai-200 shadow-[inset_0_0_0_1px_rgb(124_156_196/0.35)]';

export function NudgeButton({
  delta,
  disabled,
  onClick,
}: {
  delta: number;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = delta < 0 ? RotateCcw : RotateCw;
  return (
    <motion.button
      type="button"
      aria-label={delta < 0 ? 'Retroceder 5 segundos' : 'Avanzar 5 segundos'}
      disabled={disabled}
      onClick={onClick}
      whileTap={{ scale: 0.85, rotate: delta < 0 ? -25 : 25 }}
      transition={jelly}
      className="relative grid size-11 place-items-center rounded-full text-washi-muted transition-colors hover:bg-washi/[0.07] hover:text-washi disabled:opacity-40"
    >
      <Icon className="size-[26px]" strokeWidth={1.6} />
      <span className="tabular absolute font-mono text-[9px] font-bold">5</span>
    </motion.button>
  );
}

export function TimeReadout() {
  // Tenths are all the readout shows: re-render ~10×/s instead of on every frame. Under the recorder (hidden there)
  // it doesn't follow the clock at all; it reads it again on the way back.
  const tenths = useUnlessCovered((s) => Math.floor(s.time * 10));
  return (
    <p
      role="timer"
      aria-label="Tiempo"
      className="tabular ml-3 whitespace-nowrap font-mono text-[17px] font-semibold text-washi"
    >
      {formatTime(tenths / 10, { tenths: true })}
    </p>
  );
}

export function PlayButton() {
  const playing = usePlayer((s) => s.playing);
  const ready = usePlayer((s) => s.ready);
  const counting = usePlayer((s) => s.countdownEndsAt != null);
  const active = playing || counting;

  return (
    <motion.button
      type="button"
      aria-label={active ? 'Pausar' : 'Reproducir'}
      onClick={() => usePlayer.getState().togglePlay()}
      disabled={!ready}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.88, rotate: -6 }}
      transition={jelly}
      // REQ-21 · Own layer: the spring scales it without re-rasterising the drop-shadow every frame.
      className="relative size-12 drop-shadow-[0_8px_12px_rgb(0_0_0/0.55)] will-change-transform disabled:opacity-40"
    >
      <ButtonSkin kind={active ? 'pause' : 'play'} />
    </motion.button>
  );
}

export function SpeedButton() {
  const rate = usePlayer((s) => s.rate);
  const [open, setOpen] = useState(false);
  const { setRate } = usePlayer.getState();

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Velocidad: ${formatSpeed(rate)}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          trayBtn,
          rate !== 1 ? 'bg-kin-300/10 text-kin-200' : trayIdle,
          open && 'bg-washi/[0.07]',
        )}
      >
        <span className="tabular font-mono">{formatSpeed(rate)}</span>
      </button>
      <AnimatePresence>
        {open && (
          <Popover
            label="Velocidad"
            onClose={() => setOpen(false)}
            className="absolute bottom-[calc(100%+8px)] left-0 w-60"
          >
            <div className="grid grid-cols-4 gap-1">
              {SPEED_PRESETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="menuitemradio"
                  aria-checked={s === rate}
                  onClick={() => setRate(s)}
                  className={cn(
                    'tabular h-11 rounded-[8px] font-mono text-[13px] transition-colors',
                    s === rate ? 'bg-washi text-sumi-900' : 'text-washi hover:bg-washi/10',
                  )}
                >
                  {formatSpeed(s)}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1 border-t border-washi/10 pt-2">
              <button
                type="button"
                aria-label="Más lento"
                onClick={() => setRate(stepSpeed(rate, -1))}
                className="grid size-11 place-items-center rounded-[8px] text-washi hover:bg-washi/10"
              >
                <Minus className="size-4" />
              </button>
              <span className="tabular flex-1 text-center font-mono text-sm text-washi">
                {formatSpeed(rate)}
              </span>
              <button
                type="button"
                aria-label="Más rápido"
                onClick={() => setRate(stepSpeed(rate, 1))}
                className="grid size-11 place-items-center rounded-[8px] text-washi hover:bg-washi/10"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </Popover>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MirrorButton() {
  const mirrored = usePlayer((s) => s.mirrored);
  return (
    <button
      type="button"
      aria-pressed={mirrored}
      aria-label="Espejo"
      title="Espejo (M)"
      onClick={() => usePlayer.getState().toggleMirror()}
      className={cn(trayBtn, mirrored ? trayOn : trayIdle)}
    >
      <FlipHorizontal2 className="size-[18px]" />
      <span className="max-sm:sr-only">Espejo</span>
    </button>
  );
}

/**
 * The pause between repetitions, as a seal beside the icon (never on top of it): 12 px bold washi on
 * shu-700, the token pair that keeps ≥ 4.5:1. The button's own name already says it for screen readers.
 */
export function GapBadge({ seconds }: { seconds: number }) {
  return (
    <span
      aria-hidden
      className="tabular pointer-events-none shrink-0 rounded-[5px] bg-shu-700 px-1 font-mono text-[12px] font-bold leading-[18px] text-washi shadow-[inset_0_0_0_1px_rgb(243_236_223/0.25)]"
    >
      {seconds}s
    </span>
  );
}

/** «, pausa de 2 s» for a button's accessible name; nothing without a pause. */
export const gapSuffix = (seconds: number) => (seconds > 0 ? `, pausa de ${seconds} s` : '');

/** Repeat the whole song (no clip needed). Hold for the pause between repetitions. */
export function LoopAllButton() {
  const loopAll = usePlayer((s) => s.loopAll);
  const gapAll = usePlayer((s) => s.gapAll);
  const [menu, setMenu] = useState(false);
  const press = useLongPress(
    () => setMenu(true),
    () => usePlayer.getState().toggleLoopAll(),
  );
  return (
    <div className="relative">
      <button
        type="button"
        aria-pressed={loopAll}
        aria-label={`Bucle: repetir la canción entera${gapSuffix(gapAll)} (mantén pulsado para la pausa)`}
        title="Repetir la canción (R) · mantén pulsado para la pausa"
        {...press}
        className={cn(trayBtn, loopAll ? trayOn : trayIdle, gapAll > 0 && 'max-sm:gap-1 max-sm:px-1.5')}
      >
        <Repeat1 className="size-[18px] shrink-0" />
        <span className="max-sm:sr-only">Bucle</span>
        {gapAll > 0 && <GapBadge seconds={gapAll} />}
      </button>
      <AnimatePresence>
        {menu && (
          <GapPicker
            title="Pausa entre vueltas de la canción"
            value={gapAll}
            onChange={(s) => usePlayer.getState().setGapAll(s)}
            onClose={() => setMenu(false)}
            className="absolute bottom-[calc(100%+8px)] right-0"
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Two-tap clip creation: start at the current position, end at the current position → save dialog. */
export function ClipButton({ onSaveClip }: { onSaveClip: () => void }) {
  const loop = usePlayer((s) => s.loop);
  const ready = usePlayer((s) => s.ready);
  const step = hasRange(loop) ? 'save' : loop.start != null ? 'end' : 'start';
  const toast = useToast();

  function onClick() {
    const p = usePlayer.getState();
    if (step === 'start') p.markStart();
    else if (step === 'end') {
      // Rewound past A: the end must come after the start, waiting won't help from here.
      if (p.loop.start != null && p.time < p.loop.start) {
        toast(
          `El final tiene que ir después del inicio (${formatTime(p.loop.start, { tenths: true })}).`,
          'info',
        );
        return;
      }
      // A double tap would cut a useless 0.2 s clip: the end needs the song to have moved on.
      if (p.loop.start != null && p.time - p.loop.start < 0.5) {
        toast('Deja avanzar la canción y vuelve a pulsar para marcar el final.', 'info');
        return;
      }
      p.markEnd();
      onSaveClip();
    } else onSaveClip();
  }

  return (
    <motion.button
      type="button"
      disabled={!ready}
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      transition={jelly}
      className={cn(
        tool,
        // Phones: takes the space the tray leaves and may tighten, but never spills out of the card.
        'skin-btn h-12 justify-center px-4 max-sm:min-w-0 max-sm:flex-1 max-sm:shrink max-sm:gap-1.5 max-sm:px-3',
        step === 'save'
          ? 'skin-primary [--skin-fill:var(--color-shu-700)] hover:[--skin-fill:var(--color-shu-600)]'
          : '[--skin-fill:var(--color-sumi-800)]',
        step === 'start' && toolIdle,
        step === 'end' && 'animate-pulse border-shu-400 bg-sumi-800 text-shu-400',
        step === 'save' && 'border-shu-700 bg-shu-700 text-washi hover:bg-shu-600',
      )}
    >
      {/* Very narrow phones drop the icon so the label never spills out of the card. */}
      {step === 'save' ? (
        <BookmarkPlus className="size-[18px] shrink-0 max-[380px]:hidden" />
      ) : (
        <Scissors className="size-[18px] shrink-0 max-[380px]:hidden" />
      )}
      {step === 'start' ? 'Nuevo clip' : step === 'end' ? 'Fin del clip' : 'Guardar clip'}
    </motion.button>
  );
}
