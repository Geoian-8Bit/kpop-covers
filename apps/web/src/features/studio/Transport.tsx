import { formatSpeed, formatTime, SPEED_PRESETS, stepSpeed } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { BookmarkPlus, Minus, Pause, Play, Plus, RotateCcw, RotateCw, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Seal } from '@/components/Seal';
import { Button } from '@/components/ui/Button';
import { ElasticToggle } from '@/components/ui/ElasticToggle';
import { SectionTitle } from '@/components/ui/SectionTitle';
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
      <p className="well tabular whitespace-nowrap rounded-[10px] px-3.5 py-2.5 font-mono text-[24px] font-semibold leading-none text-washi" aria-label="Tiempo">
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

export function SpeedTile({ className }: { className?: string }) {
  const rate = usePlayer((s) => s.rate);
  const { setRate } = usePlayer.getState();
  const isPreset = (SPEED_PRESETS as readonly number[]).includes(rate);

  return (
    <Tile title="Velocidad" glyph="速" className={className}>
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" size="icon" aria-label="Más lento" onClick={() => setRate(stepSpeed(rate, -1))}>
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
          <ElasticToggle checked={mirrored} onChange={setMirrored} label={mirrored ? 'Activado' : 'Desactivado'} />
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
