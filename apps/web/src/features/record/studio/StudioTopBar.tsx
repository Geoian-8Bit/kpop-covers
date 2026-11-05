import { Mic, MicOff, Music2, X } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/cn';
import type { CameraView } from '../useCamera';
import { SongBar, TakeClock } from './progress';
import { warmSettings } from './ToolsRail';
import type { Phase, SoundSource, Span } from './types';

/** Song progress edge to edge (like TikTok's), «Cerrar», the take's clock or the song, and the quality chip. */
export const StudioTopBar = memo(function StudioTopBar({
  phase,
  span,
  title,
  mode,
  wantFps,
  camReady,
  settingsAllowed,
  summary,
  readSeconds,
  onClose,
  onQuality,
}: {
  phase: Phase;
  span: Span | null;
  title: string;
  mode: CameraView['mode'];
  wantFps: CameraView['wantFps'];
  camReady: boolean;
  settingsAllowed: boolean;
  summary: string;
  readSeconds: () => number;
  onClose: () => void;
  onQuality: () => void;
}) {
  return (
    <>
      {/* Song progress, edge to edge, like TikTok's. */}
      {span &&
        (phase === 'arming' || phase === 'recording' || phase === 'paused' || phase === 'finishing') && (
          <SongBar span={span} />
        )}

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent pb-10 pl-[max(14px,env(safe-area-inset-left))] pr-[max(14px,env(safe-area-inset-right))] pt-[max(14px,env(safe-area-inset-top))]">
        <button
          type="button"
          aria-label="Cerrar"
          disabled={phase === 'finishing'}
          onClick={onClose}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-black/40 disabled:opacity-30"
        >
          <X className="size-6" />
        </button>
        <div className="flex min-w-0 flex-1 justify-center">
          {phase === 'recording' || phase === 'paused' || phase === 'finishing' ? (
            <span
              className={cn(
                'tabular inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-sm font-bold',
                phase === 'recording' ? 'bg-shu-500' : 'bg-black/55',
              )}
            >
              <span
                className={cn(
                  'size-2 rounded-full',
                  phase === 'recording' ? 'animate-pulse bg-washi' : 'bg-shu-400',
                )}
              />
              <TakeClock read={readSeconds} running={phase === 'recording'} />
            </span>
          ) : (
            <span className="inline-flex min-w-0 items-center gap-2 rounded-full bg-black/40 px-3 py-1.5">
              <Music2 className="size-4 shrink-0 text-kin-300" />
              <span className="truncate text-[14px] font-bold">{title}</span>
            </span>
          )}
        </div>
        {/* What the take will be: size · rate · quality (A1: a tap opens the settings). */}
        <span className="flex h-11 min-w-11 shrink-0 items-center justify-end">
          {mode && camReady && phase !== 'review' && (
            <button
              type="button"
              disabled={!settingsAllowed}
              onClick={onQuality}
              onPointerDown={warmSettings}
              aria-label={`Calidad: ${summary}. Toca para cambiarla`}
              className={cn(
                'tabular min-h-9 rounded-full bg-black/45 px-2.5 py-1 font-mono text-[11px] font-bold enabled:active:scale-95',
                wantFps === 60 && mode.fps < 45 ? 'text-kin-300' : 'text-washi/90',
              )}
            >
              {summary}
            </button>
          )}
        </span>
      </div>
    </>
  );
});

/** What the take will sound like. */
export const SoundChip = memo(function SoundChip({
  sound,
  songPossible,
  songSoundLabel,
  stereo,
  rate,
  onToggle,
}: {
  sound: SoundSource;
  songPossible: boolean;
  songSoundLabel: string;
  stereo: boolean;
  rate: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      // S3: with a file the dancer chooses: the clean song or the room's sound (steps, voices).
      disabled={!songPossible}
      onClick={onToggle}
      aria-label={
        songPossible
          ? `Sonido de la toma: ${sound === 'song' ? songSoundLabel : 'micrófono'}. Toca para cambiar`
          : undefined
      }
      className="absolute inset-x-0 top-[calc(max(14px,env(safe-area-inset-top))+60px)] mx-auto flex min-h-9 w-max max-w-[calc(100vw-150px)] items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-left text-[12px] leading-snug text-washi/90 enabled:active:scale-95"
    >
      {sound === 'song' ? (
        <Music2 className="size-3.5 shrink-0 text-kin-300" />
      ) : sound === 'mic' ? (
        <Mic className="size-3.5 shrink-0 text-kin-300" />
      ) : (
        <MicOff className="size-3.5 shrink-0 text-kin-300" />
      )}
      <span>
        {sound === 'song'
          ? `Con ${songSoundLabel}`
          : sound === 'mic'
            ? songPossible
              ? `Con el micro${stereo ? ' (estéreo)' : ''}: se oye la sala`
              : 'YouTube no deja grabar su audio: se oye por el micro, sube el volumen'
            : 'Sin permiso para el micro: se grabará sin sonido'}
        {rate !== 1 && ` · velocidad ${String(rate).replace('.', ',')}×`}
        {songPossible && <span className="ml-1.5 font-bold text-kin-300">Cambiar</span>}
      </span>
    </button>
  );
});
