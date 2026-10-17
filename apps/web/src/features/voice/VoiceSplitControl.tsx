import { lazy, Suspense, useId, type ComponentType } from 'react';
import { useDesignVariant } from '@/features/lab/labState';
import { cn } from '@/lib/cn';
import { usePlayer } from '@/player/store';
import { VoiceNote, type VoiceVariantProps } from './controlParts';
import { VoiceOnda } from './VoiceOnda';
import type { VoiceMode } from './voiceRules';
import { isVoiceDesign, type VoiceDesign } from './waveRules';

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
 * Lab moment `voice-split` (F17): the designs on trial, by variant id (see `features/lab/moments/voice.tsx`). The
 * default, «La ola partida», ships in the bundle; the rest load when chosen.
 */
const VARIANTS: Record<VoiceDesign, ComponentType<VoiceVariantProps>> = {
  onda: VoiceOnda,
  audio: lazy(() => import('./VoiceOlaAudio').then((m) => ({ default: m.VoiceOlaAudio }))),
  hokusai: lazy(() => import('./VoiceOlaHokusai').then((m) => ({ default: m.VoiceOlaHokusai }))),
  seigaiha: lazy(() => import('./VoiceOlaSeigaiha').then((m) => ({ default: m.VoiceOlaSeigaiha }))),
  compacta: lazy(() => import('./VoiceOlaCompacta').then((m) => ({ default: m.VoiceOlaCompacta }))),
  fusuma: lazy(() => import('./VoiceFusuma').then((m) => ({ default: m.VoiceFusuma }))),
  capas: lazy(() => import('./VoiceCapas').then((m) => ({ default: m.VoiceCapas }))),
};

/** The component for a variant id; anything unknown gets «La ola partida». */
export function voiceVariant(id: string): ComponentType<VoiceVariantProps> {
  return isVoiceDesign(id) ? VARIANTS[id] : VoiceOnda;
}

/**
 * F17 · Separar voz y música: choose between the whole song, the song without the voice and the voice forward.
 * A radio group (arrows, Home/End; Tab lands on the chosen mode) drawn in the design chosen in the lab on this
 * device. Below it, a live note explains when it is off (YouTube) or useless (mono track). The waves follow the
 * studio's player (they move while it plays).
 */
export function VoiceSplitControl({ monoLike, ...props }: VoiceSplitControlProps) {
  const noteId = useId();
  const Variant = voiceVariant(useDesignVariant('voice-split'));
  const playing = usePlayer((s) => s.playing);
  return (
    <div className="w-full">
      <Suspense fallback={<VariantLoading compact={props.compact} />}>
        <Variant {...props} monoLike={monoLike} noteId={noteId} playing={playing} />
      </Suspense>
      <VoiceNote id={noteId} available={props.available} monoLike={monoLike} mode={props.mode} />
    </div>
  );
}

/** Holds the place while a variant's code arrives (once per device; it is cached afterwards). */
export function VariantLoading({ compact }: { compact?: boolean }) {
  return (
    <div aria-hidden className={cn('well w-full rounded-[14px]', compact ? 'h-[118px]' : 'h-[150px]')} />
  );
}
