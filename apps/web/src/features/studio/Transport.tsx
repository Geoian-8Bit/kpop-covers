import { formatSpeed, formatTime, SPEED_PRESETS, stepSpeed } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import {
  BookmarkPlus,
  Minus,
  Pause,
  Play,
  Plus,
  Repeat1,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Seal } from '@/components/Seal';
import { Button } from '@/components/ui/Button';
import { ElasticToggle } from '@/components/ui/ElasticToggle';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Segmented } from '@/components/ui/Segmented';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { hasRange, usePlayer } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';

const speedOptions = SPEED_PRESETS.map((value) => ({
  value,
  label: `${value}`,
  ariaLabel: `Velocidad ${value}×`,
}));
const gapOptions = [0, 1, 2, 3, 5, 10].map((value) => ({
  value,
  label: value === 0 ? 'No' : `${value} s`,
  ariaLabel: value === 0 ? 'Sin pausa' : `Pausa de ${value} segundos`,
}));

function Tile({
  title,
  glyph,
  children,
  className,
}: {
  title: string;
  glyph: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-4 p-5 sm:p-6', className)}>
      <SectionTitle glyph={glyph}>{title}</SectionTitle>
      {children}
    </section>
  );
}

export function PlaybackTile() {
  const time = usePlayer((s) => s.time);
  const duration = usePlayer((s) => s.duration);
  const ready = usePlayer((s) => s.ready);
  const { nudge } = usePlayer.getState();

  return (
    <Tile title="Reproducción" glyph="再生">
      <p
        className="well tabular whitespace-nowrap rounded-[10px] px-3.5 py-2.5 font-mono text-[24px] font-semibold leading-none text-washi"
        aria-label="Tiempo"
      >
        {formatTime(time, { tenths: true })}
        <span className="text-base text-washi-subtle"> / {formatTime(duration)}</span>
      </p>
      <div className="mt-auto flex items-center gap-2.5">
        <Button
          variant="secondary"
          size="icon"
          aria-label="Retroceder 5 segundos"
          onClick={() => nudge(-5)}
          disabled={!ready}
        >
          <RotateCcw className="size-5" />
        </Button>
        <PlayButton />
        <Button
          variant="secondary"
          size="icon"
          aria-label="Avanzar 5 segundos"
          onClick={() => nudge(5)}
          disabled={!ready}
        >
          <RotateCw className="size-5" />
        </Button>
        <LoopAllButton />
      </div>
    </Tile>
  );
}

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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)
      )
        onClose();
    };
    const id = setTimeout(() => {
      window.addEventListener('pointerdown', close);
      window.addEventListener('keydown', close);
    }, 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      role="menu"
      aria-label={title}
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, transition: { duration: 0.1 } }}
      transition={jelly}
      className={cn('z-40 w-56 rounded-[12px] bg-sumi-950/95 p-2 shadow-xl ring-1 ring-washi/15', className)}
    >
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
        {countSound ? (
          <Volume2 className="size-4 text-kin-300" />
        ) : (
          <VolumeX className="size-4 text-washi-subtle" />
        )}
        Tic de metrónomo {countSound ? 'activado' : 'silenciado'}
      </button>
    </motion.div>
  );
}

/** Mute / unmute the metronome ticks of the pause between repetitions. */
function CountSoundButton() {
  const countSound = usePlayer((s) => s.countSound);
  const gap = usePlayer((s) => s.gap);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={countSound ? 'Silenciar el tic de la pausa' : 'Activar el tic de la pausa'}
      title={countSound ? 'Tic de metrónomo activado' : 'Tic de metrónomo silenciado'}
      aria-pressed={countSound}
      disabled={gap === 0}
      onClick={() => usePlayer.getState().toggleCountSound()}
      className={cn(countSound && 'text-kin-300')}
    >
      {countSound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
    </Button>
  );
}

/** Repeat the whole song (no clip needed). */
function LoopAllButton() {
  const loopAll = usePlayer((s) => s.loopAll);
  const gapAll = usePlayer((s) => s.gapAll);
  const [menu, setMenu] = useState(false);
  const press = useLongPress(
    () => setMenu(true),
    () => usePlayer.getState().toggleLoopAll(),
  );
  return (
    <div className="relative ml-auto">
      <motion.button
        {...press}
        type="button"
        aria-label="Repetir la canción entera"
        title="Repetir la canción entera (R)"
        aria-pressed={loopAll}
        whileTap={{ scale: 0.88 }}
        transition={jelly}
        className={cn(
          'flex h-11 items-center gap-2 rounded-[10px] border px-3 text-sm font-bold transition-colors',
          loopAll
            ? 'border-ai-400/70 bg-ai-600 text-washi'
            : 'border-line-strong bg-sumi-800 text-washi-muted hover:text-washi',
        )}
      >
        <Repeat1 className="size-[18px]" />
        <span className="max-sm:sr-only">Bucle{gapAll > 0 ? ` · ${gapAll} s` : ''}</span>
      </motion.button>
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

export function SpeedTile({ className }: { className?: string }) {
  const rate = usePlayer((s) => s.rate);
  const { setRate } = usePlayer.getState();
  const isPreset = (SPEED_PRESETS as readonly number[]).includes(rate);

  return (
    <Tile title="Velocidad" glyph="速" className={className}>
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="secondary"
          size="icon"
          aria-label="Más lento"
          onClick={() => setRate(stepSpeed(rate, -1))}
        >
          <Minus className="size-5" />
        </Button>
        <span className="well relative grid h-11 flex-1 place-items-center overflow-hidden rounded-[10px]">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={rate}
              initial={{ y: 18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -18, opacity: 0 }}
              transition={jelly}
              className={cn(
                'tabular font-mono text-[28px] font-semibold',
                isPreset ? 'text-washi' : 'text-kin-300',
              )}
              aria-live="polite"
            >
              {formatSpeed(rate)}
            </motion.span>
          </AnimatePresence>
        </span>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Más rápido"
          onClick={() => setRate(stepSpeed(rate, 1))}
        >
          <Plus className="size-5" />
        </Button>
      </div>
      <Segmented
        label="Velocidades rápidas"
        layoutId="speed-tab"
        size="sm"
        options={speedOptions}
        value={isPreset ? rate : null}
        onChange={setRate}
        className="scrollbar-none w-full overflow-x-auto [&>button]:min-w-10 [&>button]:flex-1"
      />
    </Tile>
  );
}

export function MirrorTile({ className }: { className?: string }) {
  const mirrored = usePlayer((s) => s.mirrored);
  const { setMirrored } = usePlayer.getState();

  return (
    <Tile title="Espejo" glyph="鏡" className={className}>
      {/* Full-width row on medium screens, stacked when it sits in the three-column bar. */}
      <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-3 2xl:flex-col 2xl:items-stretch">
        <p className="min-w-[16rem] flex-1 text-sm leading-relaxed text-washi-muted 2xl:flex-none">
          {mirrored ? 'Ves la coreo como frente al espejo de la sala.' : 'Ves la coreo tal como se grabó.'}
        </p>
        <div className="flex items-center gap-4 2xl:mt-auto 2xl:justify-between">
          <ElasticToggle
            checked={mirrored}
            onChange={setMirrored}
            label={mirrored ? 'Activado' : 'Desactivado'}
          />
          <span className="grid size-[38px] place-items-center">
            <AnimatePresence>{mirrored && <Seal key="seal" glyph="鏡" size={38} stamp />}</AnimatePresence>
          </span>
        </div>
      </div>
    </Tile>
  );
}

export function LoopTile({ onSaveClip, className }: { onSaveClip: () => void; className?: string }) {
  const loop = usePlayer((s) => s.loop);
  const gap = usePlayer((s) => s.gap);
  const ready = usePlayer((s) => s.ready);
  const { markStart, markEnd, toggleLoop, clearLoop, setGap } = usePlayer.getState();
  const toast = useToast();
  const range = hasRange(loop);

  return (
    <Tile title="Tramo A–B" glyph="反復" className={className}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-2">
          <MarkButton
            letter="A"
            value={loop.start}
            onClick={() => markStart()}
            disabled={!ready}
            label="Marcar inicio"
          />
          <MarkButton
            letter="B"
            value={loop.end}
            onClick={() => markEnd()}
            disabled={!ready}
            label="Marcar final"
          />
          <AnimatePresence>
            {range && (
              <motion.span
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={jelly}
              >
                <Button variant="ghost" size="icon-sm" aria-label="Quitar tramo" onClick={clearLoop}>
                  <X className="size-4" />
                </Button>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <ElasticToggle
          checked={loop.enabled && range}
          onChange={() => {
            if (!toggleLoop()) toast('Marca A y B para repetir un tramo', 'info');
          }}
          label="Repetir"
        />
        <div className="flex items-center gap-2">
          <span className="text-sm text-washi-muted">Pausa entre vueltas</span>
          <Segmented
            label="Pausa entre repeticiones"
            layoutId="gap-tab"
            size="sm"
            options={gapOptions}
            value={gap}
            onChange={setGap}
          />
          <CountSoundButton />
        </div>
        <Button className="ml-auto max-sm:w-full" onClick={onSaveClip} disabled={!range}>
          <BookmarkPlus className="size-4.5" /> Guardar clip
        </Button>
      </div>
    </Tile>
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
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.86 }}
      transition={jelly}
      className="relative grid size-16 place-items-center rounded-[14px] bg-shu-500 bg-[linear-gradient(180deg,rgb(255_255_255/0.16),rgb(0_0_0/0.1))] text-washi shadow-[0_12px_24px_-12px_rgb(120_28_12/0.95)] before:pointer-events-none before:absolute before:inset-[4px] before:rounded-[10px] before:border before:border-washi/45 hover:bg-shu-400 disabled:opacity-40"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={active ? 'pause' : 'play'}
          initial={{ scale: 0.3, opacity: 0, rotate: -60 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.3, opacity: 0, rotate: 60 }}
          transition={jelly}
        >
          {active ? <Pause className="size-7 fill-washi" /> : <Play className="ml-1 size-7 fill-washi" />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

function MarkButton({
  letter,
  value,
  onClick,
  disabled,
  label,
}: {
  letter: string;
  value: number | null;
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  const set = value != null;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label} (${letter}) en la posición actual`}
      whileTap={{ scale: 0.92 }}
      transition={jelly}
      className="well flex h-11 items-center gap-2 rounded-[10px] pl-1.5 pr-3.5 text-sm transition-colors hover:border-line-strong disabled:opacity-40"
    >
      <motion.span
        animate={{ rotate: set ? -4 : 0, scale: set ? 1 : 0.92 }}
        transition={jelly}
        className={cn(
          'grid size-8 place-items-center rounded-[5px] font-display text-[13px] font-extrabold transition-colors',
          set ? 'bg-shu-500 text-washi' : 'border border-line-strong text-washi-muted',
        )}
      >
        {letter}
      </motion.span>
      <span className={cn('tabular font-mono', set ? 'text-washi' : 'text-washi-subtle')}>
        {set ? formatTime(value, { tenths: true }) : 'Marcar'}
      </span>
    </motion.button>
  );
}
