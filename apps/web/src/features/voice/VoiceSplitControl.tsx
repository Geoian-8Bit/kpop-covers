import { useId } from 'react';
import { cn } from '@/lib/cn';
import { usePlayer } from '@/player/store';
import { GROUP_LABEL, ModeSeals, VoiceNote } from './controlParts';
import { VoiceOnda } from './VoiceOnda';
import type { VoiceMode } from './voiceRules';

export type { VoiceMode } from './voiceRules';

export interface VoiceSplitControlProps {
  mode: VoiceMode;
  onChange: (mode: VoiceMode) => void;
  /** False for YouTube (its audio can't be reached): the choices are off and the reason is shown. */
  available: boolean;
  /** From `VoiceSplit.analyse()`: the track sounds mono, so «sin voz» can't separate anything (a note says so). */
  monoLike?: boolean;
  /** Smaller, for the studio's row and the recorder's settings panel: no hints, a slimmer wave. Targets stay ≥ 44 px. */
  compact?: boolean;
  /**
   * 46 · Only the three seals, no wave, and the note in one short line: for the studio's fullscreen panel, where the
   * video plays on behind it (implies `compact`).
   */
  bare?: boolean;
  className?: string;
}

/** 46 · The note of the `bare` control: one short line. */
const BARE_UNAVAILABLE = 'Solo con el archivo del vídeo';
const BARE_MONO = 'Pista en mono: no se puede separar';

/**
 * F17 · Separar voz y música: choose between the whole song, the song without the voice and the voice forward.
 * A radio group (arrows, Home/End; Tab lands on the chosen mode) drawn as «La ola partida» (`VoiceOnda`, chosen in
 * the design lab in point 40). Below it, a live note explains when it is off (YouTube) or useless (mono track). The
 * waves drift while the studio's player plays (never with «reducir movimiento»).
 */
export function VoiceSplitControl({ monoLike, className, bare, ...props }: VoiceSplitControlProps) {
  const noteId = useId();
  const playing = usePlayer((s) => s.playing);
  if (bare) {
    const note = !props.available ? BARE_UNAVAILABLE : monoLike ? BARE_MONO : '';
    return (
      <div className={cn('min-w-0', className)}>
        <div
          role="radiogroup"
          aria-label={GROUP_LABEL}
          aria-describedby={noteId}
          aria-disabled={!props.available || undefined}
        >
          <ModeSeals mode={props.mode} onChange={props.onChange} available={props.available} compact />
        </div>
        <p
          id={noteId}
          role="status"
          aria-live="polite"
          className={cn(
            'truncate text-[12px] leading-tight empty:hidden',
            monoLike && props.mode === 'sin-voz' ? 'text-kin-300' : 'text-washi-muted',
            note && 'mt-1 px-1',
          )}
        >
          {note}
        </p>
      </div>
    );
  }
  return (
    <div className={cn('w-full', className)}>
      <VoiceOnda {...props} noteId={noteId} playing={playing} />
      <VoiceNote id={noteId} available={props.available} monoLike={monoLike} mode={props.mode} />
    </div>
  );
}
