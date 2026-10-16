import { Maximize2, Minimize2, Pause, Play, RotateCcw, SkipForward, Square } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

interface RoundControlsProps {
  paused: boolean;
  onTogglePause: () => void;
  onRepeat: () => void;
  onSkip: () => void;
  onFinish: () => void;
  /** Nothing to repeat / skip yet (before the first clip). */
  disabled?: boolean;
  fullscreen?: { on: boolean; toggle: () => void } | null;
  className?: string;
}

/** Pausa · Repetir · Saltar · Terminar (and full screen): big targets, readable from a step away. */
export function RoundControls({
  paused,
  onTogglePause,
  onRepeat,
  onSkip,
  onFinish,
  disabled,
  fullscreen,
  className,
}: RoundControlsProps) {
  return (
    <div
      role="toolbar"
      aria-label="Controles de la ronda"
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      <Button
        variant="washi"
        onClick={onTogglePause}
        disabled={disabled}
        aria-keyshortcuts="Space"
        className="min-w-[8.5rem]"
      >
        {paused ? <Play aria-hidden className="size-4.5" /> : <Pause aria-hidden className="size-4.5" />}
        {paused ? 'Seguir' : 'Pausa'}
      </Button>
      <Button variant="secondary" onClick={onRepeat} disabled={disabled}>
        <RotateCcw aria-hidden className="size-4.5" /> Repetir
      </Button>
      <Button variant="secondary" onClick={onSkip} disabled={disabled}>
        <SkipForward aria-hidden className="size-4.5" /> Saltar
      </Button>
      <span className="flex-1" />
      {fullscreen && (
        <Button
          variant="ghost"
          size="icon"
          onClick={fullscreen.toggle}
          aria-label={fullscreen.on ? 'Salir de pantalla completa' : 'Pantalla completa'}
        >
          {fullscreen.on ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
        </Button>
      )}
      <Button variant="danger" onClick={onFinish}>
        <Square aria-hidden className="size-4" /> Terminar
      </Button>
    </div>
  );
}
