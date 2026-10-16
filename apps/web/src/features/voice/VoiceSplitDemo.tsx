import { Play, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { renderDemoMix, type DemoMix } from './voiceDemoMix';
import { VoiceSplitControl } from './VoiceSplitControl';
import type { VoiceMode } from './voiceRules';
import { createVoiceSplit, type VoiceAnalysis, type VoiceSplit } from './voiceSplit';

/** Kept low on purpose: the lab sits in Ajustes, maybe in a quiet room. */
const VOLUME = 0.2;
const FADE_S = 0.06;

interface DemoAudio {
  ctx: AudioContext;
  /** Where the looping sample plays into; the split listens here, so the sample can be swapped. */
  bus: GainNode;
  split: VoiceSplit;
  master: GainNode;
  buffers: { stereo: AudioBuffer; mono: AudioBuffer };
  player: AudioBufferSourceNode | null;
}

function buildAudio(mode: VoiceMode): DemoAudio | null {
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor({ latencyHint: 'interactive' });
  const toBuffer = (mix: DemoMix) => {
    const buffer = ctx.createBuffer(2, mix.left.length, ctx.sampleRate);
    buffer.copyToChannel(mix.left, 0);
    buffer.copyToChannel(mix.right, 1);
    return buffer;
  };
  const bus = ctx.createGain();
  const split = createVoiceSplit(ctx, bus, { initialMode: mode });
  const master = ctx.createGain();
  master.gain.value = 0;
  split.output.connect(master).connect(ctx.destination);
  return {
    ctx,
    bus,
    split,
    master,
    buffers: {
      stereo: toBuffer(renderDemoMix(ctx.sampleRate)),
      mono: toBuffer(renderDemoMix(ctx.sampleRate, { mono: true })),
    },
    player: null,
  };
}

/** Fades the master to `to` (no click on start or stop). */
function fade(a: DemoAudio, to: number) {
  // setTargetAtTime: interrupting it (play/stop in quick succession) continues smoothly (see `voiceSplit.ts`).
  const now = a.ctx.currentTime;
  a.master.gain.cancelScheduledValues(now);
  a.master.gain.setTargetAtTime(to, now, FADE_S / 3);
}

function stopPlayer(a: DemoAudio, at: number) {
  const player = a.player;
  if (!player) return;
  a.player = null;
  try {
    player.stop(at);
  } catch {
    /* already stopped */
  }
  player.onended = () => player.disconnect();
}

/**
 * Design lab stage for F17: a sample song made in the browser (a «sung» melody, kick and bass in the centre;
 * plucked guitars and hi-hats on the sides) played through the real split, so each mode can be heard. It never
 * plays on its own: only the ▶ button starts it, at a low volume. «YouTube» shows the control switched off;
 * «Mono» plays the same song folded to mono, to see the warning appear after a few seconds.
 */
export function VoiceSplitDemo({ variant }: { variant: string }) {
  const [mode, setMode] = useState<VoiceMode>('original');
  const [playing, setPlaying] = useState(false);
  const [origin, setOrigin] = useState<'file' | 'youtube'>('file');
  const [track, setTrack] = useState<'stereo' | 'mono'>('stereo');
  const [analysis, setAnalysis] = useState<VoiceAnalysis | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const audio = useRef<DemoAudio | null>(null);
  const available = origin === 'file';

  const start = (a: DemoAudio, which: 'stereo' | 'mono') => {
    stopPlayer(a, a.ctx.currentTime);
    const player = a.ctx.createBufferSource();
    player.buffer = a.buffers[which];
    player.loop = true;
    player.connect(a.bus);
    player.start();
    a.player = player;
    a.split.resetAnalysis();
    setAnalysis(null);
  };

  const play = () => {
    if (!audio.current) audio.current = buildAudio(mode);
    const a = audio.current;
    if (!a) {
      setUnsupported(true);
      return;
    }
    void a.ctx.resume();
    a.split.setMode(available ? mode : 'original', { rampMs: 0 });
    start(a, track);
    fade(a, VOLUME);
    setPlaying(true);
  };

  const stop = () => {
    const a = audio.current;
    if (a) {
      fade(a, 0);
      stopPlayer(a, a.ctx.currentTime + FADE_S + 0.02);
    }
    setPlaying(false);
  };

  const choose = (next: VoiceMode) => {
    setMode(next);
    audio.current?.split.setMode(next);
  };

  const chooseOrigin = (next: 'file' | 'youtube') => {
    setOrigin(next);
    // YouTube: nothing can be done to its sound, so it plays as it is.
    if (next === 'youtube') choose('original');
  };

  const chooseTrack = (next: 'stereo' | 'mono') => {
    setTrack(next);
    const a = audio.current;
    if (a && playing) start(a, next);
  };

  // While playing, read what the split has heard (it samples L and R a few times a second).
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const a = audio.current;
      if (a) setAnalysis(a.split.analyse());
    }, 400);
    return () => window.clearInterval(id);
  }, [playing]);

  // Leaving the lab: silence and free everything.
  useEffect(
    () => () => {
      const a = audio.current;
      if (!a) return;
      stopPlayer(a, 0);
      a.split.dispose();
      void a.ctx.close();
      audio.current = null;
    },
    [],
  );

  const monoLike = analysis?.monoLike ?? false;
  const readout = !playing
    ? 'Pulsa reproducir para oír la mezcla de ejemplo (suena bajito).'
    : !analysis?.settled
      ? 'Escuchando la pista…'
      : analysis.monoLike
        ? 'Parece mono'
        : 'Suena en estéreo';

  return (
    <div className="flex w-full max-w-[560px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          onClick={playing ? stop : play}
          aria-label={playing ? 'Parar la mezcla de ejemplo' : 'Reproducir la mezcla de ejemplo'}
        >
          {playing ? <Square aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
          {playing ? 'Parar' : 'Reproducir'}
        </Button>
        <Segmented
          size="sm"
          label="Origen del vídeo"
          layoutId="voice-demo-origin"
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
          layoutId="voice-demo-track"
          value={track}
          onChange={chooseTrack}
          options={[
            { value: 'stereo', label: 'Estéreo' },
            { value: 'mono', label: 'Mono' },
          ]}
        />
      </div>

      <p className="text-[13px] leading-snug text-washi-muted">
        Una canción de ejemplo hecha en el navegador: una melodía «cantada», bombo y bajo en el centro; guitarras y
        platillos a los lados. <span className="tabular font-mono text-[12px] text-washi-subtle">
          {unsupported ? 'Este navegador no puede reproducir el ejemplo.' : readout}
          {playing && analysis?.correlation != null && ` · L/R ${analysis.correlation.toFixed(2)}`}
        </span>
      </p>

      <section aria-label="En el estudio" className="flex flex-col gap-2">
        <h4 className="text-[12px] font-bold uppercase tracking-[0.08em] text-washi-subtle">En el estudio</h4>
        <VoiceSplitControl
          variant={variant}
          mode={mode}
          onChange={choose}
          available={available}
          monoLike={monoLike}
        />
      </section>

      <section aria-label="En el grabador" className="flex flex-col gap-2">
        <h4 className="text-[12px] font-bold uppercase tracking-[0.08em] text-washi-subtle">
          En el grabador (compacto)
        </h4>
        <div className="max-w-[340px] rounded-[18px] bg-black p-3 ring-1 ring-line-strong">
          <VoiceSplitControl
            variant={variant}
            mode={mode}
            onChange={choose}
            available={available}
            monoLike={monoLike}
            compact
          />
        </div>
      </section>
    </div>
  );
}
