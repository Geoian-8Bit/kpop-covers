import { formatSpeed, formatTime, SPEED_PRESETS, stepSpeed } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { BookmarkPlus, Minus, Pause, Play, Plus, RotateCcw, RotateCw, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Seal } from '@/components/Seal';
import { Button } from '@/components/ui/Button';
import { ElasticToggle } from '@/components/ui/ElasticToggle';
import { Segmented } from '@/components/ui/Segmented';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { hasRange, usePlayer } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';

const speedOptions = SPEED_PRESETS.map((value) => ({ value, label: `${value}`, ariaLabel: `Velocidad ${value}×` }));
const gapOptions = [0, 1, 2, 3].map((value) => ({
  value,
  label: value === 0 ? 'No' : `${value} s`,
  ariaLabel: value === 0 ? 'Sin pausa' : `Pausa de ${value} segundos`,
}));

function Tile({ title, glyph, children, className }: { title: string; glyph: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('paper flex min-w-0 flex-col gap-4 rounded-[18px] p-4 sm:p-5', className)}>
      <h2 className="flex items-baseline justify-between font-display text-[17px] font-bold">
        {title}
        <span aria-hidden className="text-[15px] font-medium text-washi-subtle">
          {glyph}
        </span>
      </h2>
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
      <p className="tabular font-mono text-[26px] font-semibold leading-none text-washi" aria-label="Tiempo">
        {formatTime(time, { tenths: true })}
        <span className="text-base text-washi-subtle"> / {formatTime(duration)}</span>
      </p>
      <div className="mt-auto flex items-center gap-2.5">
        <Button variant="secondary" size="icon" aria-label="Retroceder 5 segundos" onClick={() => nudge(-5)} disabled={!ready}>
          <RotateCcw className="size-5" />
        </Button>
        <PlayButton />
        <Button variant="secondary" size="icon" aria-label="Avanzar 5 segundos" onClick={() => nudge(5)} disabled={!ready}>
          <RotateCw className="size-5" />
        </Button>
      </div>
    </Tile>
  );
}

export function SpeedTile() {
  const rate = usePlayer((s) => s.rate);
  const { setRate } = usePlayer.getState();
  const isPreset = (SPEED_PRESETS as readonly number[]).includes(rate);

  return (
    <Tile title="Velocidad" glyph="速">
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" size="icon" aria-label="Más lento" onClick={() => setRate(stepSpeed(rate, -1))}>
          <Minus className="size-5" />
        </Button>
        <span className="relative grid h-10 flex-1 place-items-center overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={rate}
              initial={{ y: 18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -18, opacity: 0 }}
              transition={jelly}
              className={cn('tabular font-mono text-[28px] font-semibold', isPreset ? 'text-washi' : 'text-kin-300')}
              aria-live="polite"
            >
              {formatSpeed(rate)}
            </motion.span>
          </AnimatePresence>
        </span>
        <Button variant="secondary" size="icon" aria-label="Más rápido" onClick={() => setRate(stepSpeed(rate, 1))}>
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

export function MirrorTile() {
  const mirrored = usePlayer((s) => s.mirrored);
  const { setMirrored } = usePlayer.getState();

  return (
    <Tile title="Espejo" glyph="鏡">
      <p className="text-sm leading-relaxed text-washi-muted">
        {mirrored ? 'Ves la coreo como frente al espejo de la sala.' : 'Ves la coreo tal como se grabó.'}
      </p>
      <div className="mt-auto flex items-center justify-between">
        <ElasticToggle checked={mirrored} onChange={setMirrored} label={mirrored ? 'Activado' : 'Desactivado'} />
        <AnimatePresence>{mirrored && <Seal key="seal" glyph="鏡" size={38} stamp />}</AnimatePresence>
      </div>
    </Tile>
  );
}

export function LoopTile({ onSaveClip }: { onSaveClip: () => void }) {
  const loop = usePlayer((s) => s.loop);
  const gap = usePlayer((s) => s.gap);
  const ready = usePlayer((s) => s.ready);
  const { markStart, markEnd, toggleLoop, clearLoop, setGap } = usePlayer.getState();
  const toast = useToast();
  const range = hasRange(loop);

  return (
    <Tile title="Tramo A–B" glyph="反復" className="sm:col-span-2 xl:col-span-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-2">
          <MarkButton letter="A" value={loop.start} onClick={() => markStart()} disabled={!ready} label="Marcar inicio" />
          <MarkButton letter="B" value={loop.end} onClick={() => markEnd()} disabled={!ready} label="Marcar final" />
          <AnimatePresence>
            {range && (
              <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={jelly}>
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
          <Segmented label="Pausa entre repeticiones" layoutId="gap-tab" size="sm" options={gapOptions} value={gap} onChange={setGap} />
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
      className="grid size-16 place-items-center rounded-full bg-washi text-sumi-900 shadow-[0_12px_24px_-14px_rgb(0_0_0/0.95)] disabled:opacity-40"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={active ? 'pause' : 'play'}
          initial={{ scale: 0.3, opacity: 0, rotate: -60 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.3, opacity: 0, rotate: 60 }}
          transition={jelly}
        >
          {active ? <Pause className="size-7 fill-sumi-900" /> : <Play className="ml-1 size-7 fill-sumi-900" />}
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
      className="flex h-11 items-center gap-2 rounded-[10px] border border-line bg-sumi-800 pl-1.5 pr-3.5 text-sm transition-colors hover:border-line-strong disabled:opacity-40"
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
