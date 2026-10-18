import { Maximize2, Minimize2, Pause, Play, RotateCcw, Save, SkipForward, Square } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { useLandscape } from './roundChrome';

interface RoundControlsProps {
  paused: boolean;
  onTogglePause: () => void;
  onRepeat: () => void;
  onSkip: () => void;
  onFinish: () => void;
  /** «Guardar como pista»; null when the round already is a saved track. */
  onSave?: (() => void) | null;
  /** Nothing to repeat / skip yet (before the first clip). */
  disabled?: boolean;
  fullscreen?: { on: boolean; toggle: () => void };
  /** 54 · Full screen: one slim bar (a row upright, a column sideways), beside the video and never over it. */
  compact?: boolean;
  className?: string;
}

// Icon over the label: three across fit a phone held upright and the narrow side column of a turned one.
const STACK = 'h-auto flex-col gap-1 whitespace-normal text-center leading-tight';

/**
 * Two tiers. The big three (Pausa/Seguir, Repetir, Saltar), readable from a step away; under them, a quieter tray
 * with Terminar, Pantalla completa and Guardar como pista. Every target is 48 px or more.
 */
export function RoundControls({
  paused,
  onTogglePause,
  onRepeat,
  onSkip,
  onFinish,
  onSave,
  disabled,
  fullscreen,
  compact,
  className,
}: RoundControlsProps) {
  if (compact) {
    return (
      <CompactControls
        paused={paused}
        onTogglePause={onTogglePause}
        onRepeat={onRepeat}
        onSkip={onSkip}
        onFinish={onFinish}
        disabled={disabled}
        fullscreen={fullscreen}
        className={className}
      />
    );
  }
  const extras = 1 + (fullscreen ? 1 : 0) + (onSave ? 1 : 0);
  return (
    <div role="group" aria-label="Controles de la ronda" className={cn('flex flex-col gap-2', className)}>
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="washi"
          onClick={onTogglePause}
          data-round-pause
          disabled={disabled}
          aria-keyshortcuts="Space"
          className={cn(STACK, 'min-h-16 py-2 text-[15px] xl:min-h-20 xl:text-lg')}
        >
          {paused ? (
            <Play aria-hidden className="size-6 xl:size-7" />
          ) : (
            <Pause aria-hidden className="size-6 xl:size-7" />
          )}
          {paused ? 'Seguir' : 'Pausa'}
        </Button>
        <Button
          variant="secondary"
          onClick={onRepeat}
          disabled={disabled}
          aria-keyshortcuts="R"
          className={cn(STACK, 'min-h-16 py-2 text-[15px] xl:min-h-20 xl:text-lg')}
        >
          <RotateCcw aria-hidden className="size-6 xl:size-7" /> Repetir
        </Button>
        <Button
          variant="secondary"
          onClick={onSkip}
          disabled={disabled}
          aria-keyshortcuts="ArrowRight"
          className={cn(STACK, 'min-h-16 py-2 text-[15px] xl:min-h-20 xl:text-lg')}
        >
          <SkipForward aria-hidden className="size-6 xl:size-7" /> Saltar
        </Button>
      </div>
      <div
        className={cn(
          'well grid gap-1 rounded-[12px] p-1',
          extras === 3 ? 'grid-cols-3' : extras === 2 ? 'grid-cols-2' : 'grid-cols-1',
        )}
      >
        <Button
          variant="ghost"
          onClick={onFinish}
          disabled={disabled}
          className={cn(STACK, 'min-h-12 px-1 py-1.5 text-[12px] text-shu-300 hover:text-shu-300 xl:text-sm')}
        >
          <Square aria-hidden className="size-4.5" /> Terminar
        </Button>
        {fullscreen && (
          // Off here: in full screen the compact bar below takes over (with its own way out).
          <Button
            variant="ghost"
            onClick={fullscreen.toggle}
            data-fs-toggle
            className={cn(STACK, 'min-h-12 px-1 py-1.5 text-[12px] xl:text-sm')}
          >
            <Maximize2 aria-hidden className="size-4.5" />
            Pantalla completa
          </Button>
        )}
        {onSave && (
          <Button
            variant="ghost"
            onClick={onSave}
            className={cn(STACK, 'min-h-12 px-1 py-1.5 text-[12px] xl:text-sm')}
          >
            <Save aria-hidden className="size-4.5" /> Guardar como pista
          </Button>
        )}
      </div>
    </div>
  );
}

// 54 · Full screen upright: five equal targets (≥ 48 px), icon over a short label. «Guardar como pista» waits for
// the end of the round.
const SLIM = cn(STACK, 'min-h-14 min-w-0 px-0.5 py-1.5 text-[12px]');
// Sideways: the studio's fullscreen bar — round 44 px icons on the dark fade, the label only on a big screen.
const EDGE =
  'inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-2.5 text-[14px] font-bold text-washi transition-colors hover:bg-washi/15 active:bg-washi/20 disabled:pointer-events-none disabled:opacity-40';
const EDGE_LABEL = 'max-xl:sr-only';

function CompactControls({
  paused,
  onTogglePause,
  onRepeat,
  onSkip,
  onFinish,
  disabled,
  fullscreen,
  className,
}: Omit<RoundControlsProps, 'onSave' | 'compact'>) {
  const landscape = useLandscape();
  const pauseLabel = paused ? 'Seguir' : 'Pausa';
  if (landscape) {
    return (
      <div role="group" aria-label="Controles de la ronda" className={cn('flex shrink-0 items-center gap-1', className)}>
        <button
          type="button"
          onClick={onTogglePause}
          data-round-pause
          disabled={disabled}
          aria-keyshortcuts="Space"
          title={`${pauseLabel} (espacio)`}
          className={cn(EDGE, 'bg-washi text-sumi-900 hover:bg-kin-200 active:bg-kin-200')}
        >
          {paused ? <Play aria-hidden className="size-5" /> : <Pause aria-hidden className="size-5" />}
          <span className={EDGE_LABEL}>{pauseLabel}</span>
        </button>
        <button type="button" onClick={onRepeat} disabled={disabled} aria-keyshortcuts="R" title="Repetir (R)" className={EDGE}>
          <RotateCcw aria-hidden className="size-5" />
          <span className={EDGE_LABEL}>Repetir</span>
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={disabled}
          aria-keyshortcuts="ArrowRight"
          title="Saltar (→)"
          className={EDGE}
        >
          <SkipForward aria-hidden className="size-5" />
          <span className={EDGE_LABEL}>Saltar</span>
        </button>
        <button type="button" onClick={onFinish} disabled={disabled} title="Terminar" className={cn(EDGE, 'text-shu-300')}>
          <Square aria-hidden className="size-4.5" />
          <span className={EDGE_LABEL}>Terminar</span>
        </button>
        {fullscreen && (
          <button
            type="button"
            onClick={fullscreen.toggle}
            data-fs-toggle
            title="Salir de pantalla completa"
            className={EDGE}
          >
            <Minimize2 aria-hidden className="size-5" />
            <span className={EDGE_LABEL}>Salir de pantalla completa</span>
          </button>
        )}
      </div>
    );
  }
  return (
    <div role="group" aria-label="Controles de la ronda" className={cn('grid grid-cols-5 gap-1.5', className)}>
      <Button
        variant="washi"
        onClick={onTogglePause}
        data-round-pause
        disabled={disabled}
        aria-keyshortcuts="Space"
        className={SLIM}
      >
        {paused ? <Play aria-hidden className="size-5" /> : <Pause aria-hidden className="size-5" />}
        {pauseLabel}
      </Button>
      <Button variant="secondary" onClick={onRepeat} disabled={disabled} aria-keyshortcuts="R" className={SLIM}>
        <RotateCcw aria-hidden className="size-5" /> Repetir
      </Button>
      <Button variant="secondary" onClick={onSkip} disabled={disabled} aria-keyshortcuts="ArrowRight" className={SLIM}>
        <SkipForward aria-hidden className="size-5" /> Saltar
      </Button>
      <Button
        variant="ghost"
        onClick={onFinish}
        disabled={disabled}
        className={cn(SLIM, 'text-shu-300 hover:text-shu-300')}
      >
        <Square aria-hidden className="size-4.5" /> Terminar
      </Button>
      {fullscreen && (
        // Visible «Reducir»; the name starts with it and says what it does.
        <Button
          variant="ghost"
          onClick={fullscreen.toggle}
          data-fs-toggle
          aria-label="Reducir: salir de pantalla completa"
          className={SLIM}
        >
          <Minimize2 aria-hidden className="size-4.5" /> Reducir
        </Button>
      )}
    </div>
  );
}
