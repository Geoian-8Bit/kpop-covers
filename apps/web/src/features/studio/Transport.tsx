import { formatSpeed, formatTime, SPEED_PRESETS, stepSpeed } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import {
  BookmarkPlus,
  FlipHorizontal2,
  MessageSquarePlus,
  Minus,
  Plus,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Scissors,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ButtonSkin } from '@/components/ui/ButtonSkin';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { useBackToClose } from '@/lib/useBackToClose';
import { hasRange, usePlayer } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';

const GAP_CHOICES = [0, 1, 2, 3, 5, 10] as const;

/** Tap = primary action; press-and-hold (or right click) = secondary, e.g. open the pause picker. */
export function useLongPress(onLong: () => void, onTap: () => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fired = useRef(false);
  const cancel = () => clearTimeout(timer.current);
  return {
    onPointerDown: () => {
      fired.current = false;
      cancel();
      timer.current = setTimeout(() => {
        fired.current = true;
        onLong();
      }, ms);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      cancel();
      fired.current = true;
      onLong();
    },
    onClick: () => {
      if (fired.current) {
        fired.current = false;
        return;
      }
      onTap();
    },
  };
}

/**
 * Closes a popover on outside pointer or Escape. Escape is caught before anything else sees it, so
 * closing a menu never also reaches the studio shortcut that clears the A–B range (or leaves fullscreen).
 */
function useDismiss(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    // Escape is live from the first frame; the outside-pointer close waits a tick so the opening
    // tap itself doesn't close the menu.
    window.addEventListener('keydown', onKey, true);
    const id = setTimeout(() => window.addEventListener('pointerdown', onDown), 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [ref, onClose]);
}

function Popover({ children, onClose, className, label }: { children: ReactNode; onClose: () => void; className?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose);
  // The phone's back button closes the menu instead of leaving the song.
  useBackToClose(true, onClose);
  return (
    <motion.div
      ref={ref}
      role="menu"
      aria-label={label}
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, transition: { duration: 0.1 } }}
      transition={jelly}
      className={cn('z-40 rounded-[12px] bg-sumi-950/95 p-2 shadow-xl ring-1 ring-washi/15', className)}
    >
      {children}
    </motion.div>
  );
}

/** Small menu to choose the pause between repetitions, with the metronome tick switch. */
export function GapPicker({
  title,
  value,
  onChange,
  onClose,
  className,
}: {
  title: string;
  value: number;
  onChange: (seconds: number) => void;
  onClose: () => void;
  className?: string;
}) {
  const countSound = usePlayer((s) => s.countSound);
  return (
    <Popover label={title} onClose={onClose} className={cn('w-56', className)}>
      <p className="px-2 pb-2 pt-1 text-xs font-bold text-washi-muted">{title}</p>
      <div className="grid grid-cols-3 gap-1">
        {GAP_CHOICES.map((s) => (
          <button
            key={s}
            type="button"
            role="menuitemradio"
            aria-checked={s === value}
            onClick={() => onChange(s)}
            className={cn(
              'tabular h-9 rounded-[8px] font-mono text-[13px] transition-colors',
              s === value ? 'bg-washi text-sumi-900' : 'text-washi hover:bg-washi/10',
            )}
          >
            {s === 0 ? 'No' : `${s} s`}
          </button>
        ))}
      </div>
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={countSound}
        onClick={() => usePlayer.getState().toggleCountSound()}
        className="mt-2 flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-[13px] text-washi hover:bg-washi/10"
      >
        {countSound ? <Volume2 className="size-4 text-kin-300" /> : <VolumeX className="size-4 text-washi-subtle" />}
        Tic de metrónomo {countSound ? 'activado' : 'silenciado'}
      </button>
    </Popover>
  );
}

const tool =
  'relative flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[10px] border px-3 text-sm font-bold transition-colors disabled:opacity-40';
const toolIdle = 'border-line-strong bg-sumi-800 text-washi-muted hover:border-washi/40 hover:text-washi';
/** Buttons inside the settings tray: borderless, the tray itself is the frame. */
const trayBtn =
  'skin-pill relative flex h-[38px] shrink-0 items-center gap-2 rounded-[8px] px-3 text-sm font-bold transition-colors max-sm:px-2.5';
const trayIdle = 'text-washi-muted hover:bg-washi/[0.07] hover:text-washi';
const trayOn = 'bg-ai-600/50 text-ai-200 shadow-[inset_0_0_0_1px_rgb(124_156_196/0.35)]';

function TrayDivider() {
  return <span aria-hidden className="skin-divider mx-1 h-5 w-px shrink-0 bg-line-strong" />;
}

/**
 * One player bar under the timeline: transport on the left, quick toggles on the right,
 * and a contextual row for the current A–B range.
 */
export function PlayerBar({ onSaveClip, onAddNote }: { onSaveClip: () => void; onAddNote: () => void }) {
  const ready = usePlayer((s) => s.ready);
  const { nudge } = usePlayer.getState();

  return (
    <div className="px-3 pb-5 pt-1 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Transport: the play seal flanked by the ±5 s jumps, then the clock. */}
        <div className="flex items-center gap-1">
          <NudgeButton delta={-5} disabled={!ready} onClick={() => nudge(-5)} />
          <PlayButton />
          <NudgeButton delta={5} disabled={!ready} onClick={() => nudge(5)} />
          <TimeReadout />
        </div>

        <div className="flex w-full items-center gap-3 sm:ml-auto sm:w-auto sm:gap-4">
          {/* Playback settings live together in one tray instead of loose buttons. */}
          <div
            role="group"
            aria-label="Ajustes de reproducción"
            className="skin-track skin-tray relative flex items-center rounded-[12px] border border-line bg-sumi-900/70 p-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]"
          >
            <SpeedButton />
            <TrayDivider />
            <MirrorButton />
            <TrayDivider />
            <LoopAllButton />
            <TrayDivider />
            <button
              type="button"
              aria-label="Añadir una nota en este momento"
              title="Nota en este momento (N)"
              disabled={!ready}
              onClick={onAddNote}
              className={cn(trayBtn, trayIdle, 'disabled:opacity-40')}
            >
              <MessageSquarePlus className="size-[18px]" />
              <span className="max-sm:sr-only">Nota</span>
            </button>
          </div>
          <ClipButton onSaveClip={onSaveClip} />
        </div>
      </div>
      <RangeBar />
    </div>
  );
}

function NudgeButton({ delta, disabled, onClick }: { delta: number; disabled: boolean; onClick: () => void }) {
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

function TimeReadout() {
  // Tenths are all the readout shows: re-render ~10×/s instead of on every frame.
  const tenths = usePlayer((s) => Math.floor(s.time * 10));
  return (
    <p role="timer" aria-label="Tiempo" className="tabular ml-3 whitespace-nowrap font-mono text-[17px] font-semibold text-washi">
      {formatTime(tenths / 10, { tenths: true })}
    </p>
  );
}

function PlayButton() {
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
      className="relative size-12 drop-shadow-[0_8px_12px_rgb(0_0_0/0.55)] disabled:opacity-40"
    >
      <ButtonSkin kind={active ? 'pause' : 'play'} />
    </motion.button>
  );
}

function SpeedButton() {
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
        className={cn(trayBtn, rate !== 1 ? 'bg-kin-300/10 text-kin-200' : trayIdle, open && 'bg-washi/[0.07]')}
      >
        <span className="tabular font-mono">{formatSpeed(rate)}</span>
      </button>
      <AnimatePresence>
        {open && (
          <Popover label="Velocidad" onClose={() => setOpen(false)} className="absolute bottom-[calc(100%+8px)] left-0 w-60">
            <div className="grid grid-cols-4 gap-1">
              {SPEED_PRESETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="menuitemradio"
                  aria-checked={s === rate}
                  onClick={() => setRate(s)}
                  className={cn(
                    'tabular h-9 rounded-[8px] font-mono text-[13px] transition-colors',
                    s === rate ? 'bg-washi text-sumi-900' : 'text-washi hover:bg-washi/10',
                  )}
                >
                  {formatSpeed(s)}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1 border-t border-washi/10 pt-2">
              <button type="button" aria-label="Más lento" onClick={() => setRate(stepSpeed(rate, -1))} className="grid size-9 place-items-center rounded-[8px] text-washi hover:bg-washi/10">
                <Minus className="size-4" />
              </button>
              <span className="tabular flex-1 text-center font-mono text-sm text-washi">{formatSpeed(rate)}</span>
              <button type="button" aria-label="Más rápido" onClick={() => setRate(stepSpeed(rate, 1))} className="grid size-9 place-items-center rounded-[8px] text-washi hover:bg-washi/10">
                <Plus className="size-4" />
              </button>
            </div>
          </Popover>
        )}
      </AnimatePresence>
    </div>
  );
}

function MirrorButton() {
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

function GapBadge({ seconds }: { seconds: number }) {
  return (
    <span className="tabular pointer-events-none absolute -right-1.5 -top-1.5 rounded-full bg-shu-500 px-1.5 font-mono text-[10px] font-bold leading-4 text-washi">
      {seconds}s
    </span>
  );
}

/** Repeat the whole song (no clip needed). Hold for the pause between repetitions. */
function LoopAllButton() {
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
        aria-label="Bucle: repetir la canción entera (mantén pulsado para la pausa)"
        title="Repetir la canción (R) · mantén pulsado para la pausa"
        {...press}
        className={cn(trayBtn, loopAll ? trayOn : trayIdle)}
      >
        <Repeat1 className="size-[18px]" />
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
function ClipButton({ onSaveClip }: { onSaveClip: () => void }) {
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
        toast(`El final tiene que ir después del inicio (${formatTime(p.loop.start, { tenths: true })}).`, 'info');
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

/** Contextual row for the current A–B selection. */
function RangeBar() {
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
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[12px] border border-shu-500/35 bg-shu-500/[0.07] p-2">
            <button type="button" disabled={!ready} onClick={() => p.markStart()} title="Mover el inicio aquí (A)" className="flex h-9 items-center gap-2 rounded-[8px] px-2 hover:bg-washi/10">
              <span className="grid size-6 place-items-center rounded-[4px] bg-shu-500 font-display text-xs font-extrabold text-washi">A</span>
              <span className="tabular font-mono text-sm text-washi">{formatTime(loop.start!, { tenths: true })}</span>
            </button>
            <span className="text-washi-subtle">→</span>
            <button type="button" disabled={!ready} onClick={() => p.markEnd()} title="Mover el final aquí (B)" className="flex h-9 items-center gap-2 rounded-[8px] px-2 hover:bg-washi/10">
              <span className={cn('grid size-6 place-items-center rounded-[4px] font-display text-xs font-extrabold', range ? 'bg-shu-500 text-washi' : 'border border-washi/30 text-washi-muted')}>B</span>
              <span className="tabular font-mono text-sm text-washi">{range ? formatTime(loop.end!, { tenths: true }) : 'pulsa «Fin del clip»'}</span>
            </button>
            {range && (
              <span className="tabular font-mono text-xs text-washi-subtle">{formatTime(loop.end! - loop.start!, { tenths: true })}</span>
            )}

            <div className="ml-auto flex items-center gap-2">
              {range && (
                <div className="relative">
                  <button
                    type="button"
                    aria-pressed={loop.enabled}
                    aria-label="Repetir el tramo (mantén pulsado para la pausa)"
                    {...press}
                    className={cn(
                      'relative flex h-9 items-center gap-2 rounded-[8px] px-3 text-sm font-bold transition-colors',
                      loop.enabled ? 'bg-shu-500/25 text-shu-400' : 'text-washi-muted hover:bg-washi/10 hover:text-washi',
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
              <button type="button" aria-label="Quitar tramo" onClick={() => p.clearLoop()} className="grid size-9 place-items-center rounded-[8px] text-washi-muted hover:bg-washi/10 hover:text-washi">
                <X className="size-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
