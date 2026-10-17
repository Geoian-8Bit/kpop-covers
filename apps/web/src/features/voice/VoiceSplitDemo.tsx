import { Pause, Play } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type ComponentType } from 'react';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { VoiceNote, type EnvelopeState, type PlaybackClock, type VoiceVariantProps } from './controlParts';
import { VoiceCapas } from './VoiceCapas';
import { VoiceFusuma } from './VoiceFusuma';
import { VoiceOlaAudio } from './VoiceOlaAudio';
import { VoiceOlaCompacta } from './VoiceOlaCompacta';
import { VoiceOlaHokusai } from './VoiceOlaHokusai';
import { VoiceOlaSeigaiha } from './VoiceOlaSeigaiha';
import { VoiceOnda } from './VoiceOnda';
import type { VoiceMode } from './voiceRules';
import { syntheticEnvelope } from './waveRules';

/**
 * F17 · Lab demos of the voice/music control: each design with the studio's own props, on a simulated song. Nothing
 * sounds (no audio is created): «Reproducir» only pretends the song is playing, so the waves move and the playhead
 * runs. «YouTube» shows the control switched off; «Mono» shows the warning and a song without sides.
 * (This file's chunk, `VoiceSplitDemo-<hash>.js`, stays out of the precache.)
 */

const DEMO_SECONDS = 48;
const STEREO = syntheticEnvelope('demo-cancion');
const MONO = { mid: STEREO.mid, side: STEREO.side.map(() => 0) };

/** A pretend playhead: advances with requestAnimationFrame while «playing», outside React. */
function useSimulatedClock(playing: boolean): PlaybackClock {
  const clock = useMemo(() => {
    const listeners = new Set<() => void>();
    let time = 12;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (last) time = (time + (now - last) / 1000) % DEMO_SECONDS;
      last = now;
      listeners.forEach((listener) => listener());
      frame = requestAnimationFrame(tick);
    };
    return {
      read: () => ({ time, duration: DEMO_SECONDS }),
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      start: () => {
        if (frame) return;
        last = 0;
        frame = requestAnimationFrame(tick);
      },
      stop: () => {
        cancelAnimationFrame(frame);
        frame = 0;
      },
    };
  }, []);
  useEffect(() => {
    if (playing) clock.start();
    else clock.stop();
    return () => clock.stop();
  }, [playing, clock]);
  return clock;
}

function Stage({ Variant }: { Variant: ComponentType<VoiceVariantProps> }) {
  const uid = useId();
  const noteId = useId();
  const [mode, setMode] = useState<VoiceMode>('original');
  const [playing, setPlaying] = useState(false);
  const [origin, setOrigin] = useState<'file' | 'youtube'>('file');
  const [track, setTrack] = useState<'stereo' | 'mono'>('stereo');
  const clock = useSimulatedClock(playing);
  const available = origin === 'file';
  const monoLike = available && track === 'mono';
  const envelope: EnvelopeState = { status: 'ready', envelope: track === 'mono' ? MONO : STEREO };

  const chooseOrigin = (next: 'file' | 'youtube') => {
    setOrigin(next);
    // YouTube: nothing can be done to its sound, so it plays as it is.
    if (next === 'youtube') setMode('original');
  };

  return (
    <div className="flex w-full flex-col gap-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          onClick={() => setPlaying((v) => !v)}
          aria-pressed={playing}
          aria-label={playing ? 'Pausar la canción simulada' : 'Reproducir la canción simulada'}
        >
          {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
          {playing ? 'Pausar' : 'Reproducir'}
        </Button>
        <Segmented
          size="sm"
          label="Origen del vídeo"
          layoutId={`${uid}-origin`}
          value={origin}
          onChange={chooseOrigin}
          options={[
            { value: 'file', label: 'Archivo' },
            { value: 'youtube', label: 'YouTube' },
          ]}
        />
        <Segmented
          size="sm"
          label="Pista de ejemplo"
          layoutId={`${uid}-track`}
          value={track}
          onChange={setTrack}
          options={[
            { value: 'stereo', label: 'Estéreo' },
            { value: 'mono', label: 'Mono' },
          ]}
        />
      </div>
      <p className="text-[13px] leading-snug text-washi-muted">
        La demostración no suena: «Reproducir» solo simula que la canción avanza, para ver cómo se mueve.
      </p>

      <section aria-label="Como en el estudio" className="flex flex-col gap-2">
        <h4 className="text-[12px] font-bold uppercase tracking-[0.08em] text-washi-subtle">
          Como en el estudio
        </h4>
        <div className="w-full">
          <Variant
            mode={mode}
            onChange={setMode}
            available={available}
            monoLike={monoLike}
            noteId={noteId}
            playing={playing}
            clock={clock}
            envelope={envelope}
            compact
          />
          <VoiceNote id={noteId} available={available} monoLike={monoLike} mode={mode} />
        </div>
      </section>
    </div>
  );
}

export function OndaDemo() {
  return <Stage Variant={VoiceOnda} />;
}

export function AudioDemo() {
  return <Stage Variant={VoiceOlaAudio} />;
}

export function HokusaiDemo() {
  return <Stage Variant={VoiceOlaHokusai} />;
}

export function SeigaihaDemo() {
  return <Stage Variant={VoiceOlaSeigaiha} />;
}

export function CompactaDemo() {
  return <Stage Variant={VoiceOlaCompacta} />;
}

export function FusumaDemo() {
  return <Stage Variant={VoiceFusuma} />;
}

export function CapasDemo() {
  return <Stage Variant={VoiceCapas} />;
}
