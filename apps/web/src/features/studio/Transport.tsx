import { cn } from '@/lib/cn';
import { hasRange, usePlayer } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';
import { formatTime } from '@coverscape/shared';
import { MessageSquarePlus, X } from 'lucide-react';
import { RangeBar } from './RangeBar';
import {
  ClipButton,
  LoopAllButton,
  MirrorButton,
  NudgeButton,
  PlayButton,
  SpeedButton,
  TimeReadout,
  trayBtn,
  trayIdle,
  trayOn,
} from './transportButtons';

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
          {/*
            Playback settings live together in one tray instead of loose buttons. The tray is its own stacking context
            (kamon skin): while one of its menus is open it rises over the pinned video (z-20), under the top bar (z-40).
          */}
          <div
            role="group"
            aria-label="Ajustes de reproducción"
            className="skin-track skin-tray relative flex items-center rounded-[12px] border border-line bg-sumi-900/70 p-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] has-[[role=menu]]:z-30"
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

/**
 * REQ-06 · The player bar of the formation editor: the same transport and settings (speed, mirror, repeat) and an
 * A–B button that marks the start, then the end, then clears it. The A–B row below works as in the studio.
 */
export function FormationTransport() {
  const ready = usePlayer((s) => s.ready);
  const loop = usePlayer((s) => s.loop);
  const toast = useToast();
  const { nudge } = usePlayer.getState();
  const step = hasRange(loop) ? 'clear' : loop.start != null ? 'end' : 'start';

  function onLoop() {
    const p = usePlayer.getState();
    if (step === 'start') p.markStart();
    else if (step === 'end') {
      if (p.loop.start != null && p.time < p.loop.start) {
        toast(
          `El final tiene que ir después del inicio (${formatTime(p.loop.start, { tenths: true })}).`,
          'info',
        );
        return;
      }
      p.markEnd();
    } else p.clearLoop();
  }

  return (
    <div className="px-3 pb-3 pt-1 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1">
          <NudgeButton delta={-5} disabled={!ready} onClick={() => nudge(-5)} />
          <PlayButton />
          <NudgeButton delta={5} disabled={!ready} onClick={() => nudge(5)} />
          <TimeReadout />
        </div>
        <div
          role="group"
          aria-label="Ajustes de reproducción"
          className="skin-track skin-tray relative flex items-center rounded-[12px] border border-line bg-sumi-900/70 p-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] has-[[role=menu]]:z-30 sm:ml-auto"
        >
          <SpeedButton />
          <TrayDivider />
          <MirrorButton />
          <TrayDivider />
          <LoopAllButton />
          <TrayDivider />
          <button
            type="button"
            disabled={!ready}
            onClick={onLoop}
            aria-label={
              step === 'start'
                ? 'Marcar el inicio del bucle A–B'
                : step === 'end'
                  ? 'Marcar el final del bucle A–B'
                  : 'Quitar el bucle A–B'
            }
            className={cn(trayBtn, step === 'clear' ? trayOn : trayIdle, 'disabled:opacity-40')}
          >
            <span className="font-display font-extrabold">
              {step === 'start' ? 'A' : step === 'end' ? 'B' : 'A–B'}
            </span>
            {step === 'clear' && <X className="size-4" aria-hidden />}
          </button>
        </div>
      </div>
      <RangeBar />
    </div>
  );
}
