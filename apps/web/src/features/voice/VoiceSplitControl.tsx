import { useId } from 'react';
import { VoiceNote } from './controlParts';
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
  /** Smaller, for the recorder's settings panel: no hints, a slimmer illustration. Targets stay ≥ 44 px. */
  compact?: boolean;
}

/**
 * F17 · Separar voz y música: choose between the whole song, the song without the voice and the voice forward.
 * A radio group (arrows, Home/End; Tab lands on the chosen mode) drawn as «La ola partida». Below it, a live note
 * explains when it is off (YouTube) or useless (mono track).
 */
export function VoiceSplitControl({ monoLike, ...props }: VoiceSplitControlProps) {
  const noteId = useId();
  return (
    <div className="w-full">
      <VoiceOnda {...props} monoLike={monoLike} noteId={noteId} />
      <VoiceNote id={noteId} available={props.available} monoLike={monoLike} mode={props.mode} />
    </div>
  );
}
