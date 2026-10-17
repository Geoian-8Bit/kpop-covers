import { Maximize2, Minimize2, Pause, Play, RotateCcw, Save, SkipForward, Square } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

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
  fullscreen?: { on: boolean; toggle: () => void } | null;
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
  className,
}: RoundControlsProps) {
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
          <Button
            variant="ghost"
            onClick={fullscreen.toggle}
            aria-pressed={fullscreen.on}
            className={cn(STACK, 'min-h-12 px-1 py-1.5 text-[12px] xl:text-sm')}
          >
            {fullscreen.on ? (
              <Minimize2 aria-hidden className="size-4.5" />
            ) : (
              <Maximize2 aria-hidden className="size-4.5" />
            )}
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
