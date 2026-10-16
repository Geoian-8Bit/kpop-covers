import { createClapDetector, type ClapDetector } from '@coverscape/shared';
import { Mic, MicOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { cn } from '@/lib/cn';
import { openMic } from '../camera';
import { useRecordSettings } from '../settings';
import { ClapArmView, useClapUi } from './ClapArmView';
import { createListeningContext, listenForClap, type ClapListener } from './clapListener';

/** A sound scheduled in the simulated room (seconds on the page clock). */
type SimSound = { at: number; peak: number };

/** The simulated room: background with a little life in it, plus the claps asked for (sharp hit, short tail). */
function simLevel(t: number, sounds: SimSound[], background: number): number {
  let level = background * (1 + 0.35 * Math.sin(t * 23) * Math.sin(t * 7.3)) * (0.85 + Math.random() * 0.3);
  for (const s of sounds) {
    const dt = t - s.at;
    if (dt < 0 || dt > 0.4) continue;
    level = Math.max(level, dt < 0.025 ? s.peak : s.peak * Math.exp(-(dt - 0.025) / 0.03));
  }
  return level;
}

const BACKGROUND = { quiet: 0.012, noisy: 0.2 } as const;
/** After a signal, the demo listens again after this long. */
const REARM_MS = 1800;

/**
 * Design lab stage for F7: the armed recorder in a phone-shaped box, in the chosen design. By default it listens to a
 * simulated room (no microphone): «Simular aplauso» claps twice, «Una palmada» once (it must not fire), «Sala
 * ruidosa» raises the background. «Probar con el micro» listens to the real microphone instead. The sensitivity is
 * the recorder's own setting on this phone, so what is tried here applies there.
 */
export function ClapArmDemo({ variant }: { variant: string }) {
  const sensitivity = useRecordSettings((s) => s.clapSensitivity);
  const setSettings = useRecordSettings((s) => s.set);
  const ui = useClapUi(sensitivity);
  const { take, clear } = ui;
  const [shape, setShape] = useState<'portrait' | 'landscape'>('portrait');
  const [room, setRoom] = useState<keyof typeof BACKGROUND>('quiet');
  const [armed, setArmed] = useState(true);
  const [fired, setFired] = useState(false);
  const [source, setSource] = useState<'sim' | 'mic'>('sim');
  const [micError, setMicError] = useState('');
  const sounds = useRef<SimSound[]>([]);
  const detector = useRef<ClapDetector | null>(null);
  const roomRef = useRef(room);
  roomRef.current = room;
  const sensRef = useRef(sensitivity);
  sensRef.current = sensitivity;
  const mic = useRef<{ ctx: AudioContext; track: MediaStreamTrack; listener: ClapListener } | null>(null);

  // Simulated room: a detector fed every frame while armed and not just fired.
  useEffect(() => {
    if (!armed || fired || source !== 'sim') return;
    const d = createClapDetector({ sensitivity: sensRef.current });
    detector.current = d;
    sounds.current = [];
    clear();
    let frame = 0;
    const tick = () => {
      const t = performance.now() / 1000;
      sounds.current = sounds.current.filter((s) => t - s.at < 1);
      const reading = d.push(t, simLevel(t, sounds.current, BACKGROUND[roomRef.current]));
      take(reading);
      if (reading.state === 'fired') {
        setFired(true);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      detector.current = null;
    };
  }, [armed, fired, source, take, clear]);

  useEffect(() => {
    detector.current?.setSensitivity(sensitivity);
    mic.current?.listener.setSensitivity(sensitivity);
  }, [sensitivity]);

  // After a signal, show it for a moment and listen again (here nothing is recorded).
  useEffect(() => {
    if (!fired) return;
    const t = setTimeout(() => {
      setFired(false);
      if (source === 'mic') restartMic();
    }, REARM_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fired]);

  const stopMic = () => {
    const m = mic.current;
    mic.current = null;
    if (!m) return;
    m.listener.stop();
    m.track.stop();
    void m.ctx.close().catch(() => undefined);
  };

  function listenMic(ctx: AudioContext, track: MediaStreamTrack) {
    clear();
    const listener = listenForClap(ctx, track, {
      sensitivity: sensRef.current,
      onReading: (reading) => {
        take(reading);
        if (reading.state === 'fired') {
          listener.stop();
          setFired(true);
        }
      },
    });
    mic.current = { ctx, track, listener };
  }

  function restartMic() {
    const m = mic.current;
    if (!m) return;
    m.listener.stop();
    listenMic(m.ctx, m.track);
  }

  async function startMic() {
    setMicError('');
    const ctx = createListeningContext();
    if (!ctx) {
      setMicError('Este navegador no puede escuchar el micrófono.');
      return;
    }
    const track = await openMic('mono');
    if (!track) {
      void ctx.close().catch(() => undefined);
      setMicError('Sin permiso para el micrófono: sigue con la sala simulada.');
      return;
    }
    stopMic();
    setFired(false);
    setArmed(true);
    setSource('mic');
    listenMic(ctx, track);
  }

  function backToSim() {
    stopMic();
    setFired(false);
    setSource('sim');
  }

  // Leaving the lab frees the microphone.
  useEffect(() => () => stopMic(), []);

  const clapNow = (times: number) => {
    const t = performance.now() / 1000;
    for (let i = 0; i < times; i++) sounds.current.push({ at: t + 0.03 + i * 0.42, peak: 0.85 });
  };

  const disarm = () => {
    stopMic();
    setSource('sim');
    setFired(false);
    setArmed(false);
    clear();
  };

  const turned = shape === 'landscape';
  const simulated = source === 'sim';

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" onClick={() => clapNow(2)} disabled={!armed || fired || !simulated}>
          Simular aplauso
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => clapNow(1)}
          disabled={!armed || fired || !simulated}
        >
          Una palmada
        </Button>
        <Segmented
          size="sm"
          label="Sala simulada"
          layoutId="clap-demo-room"
          value={room}
          onChange={setRoom}
          options={[
            { value: 'quiet', label: 'Sala tranquila' },
            { value: 'noisy', label: 'Sala ruidosa' },
          ]}
        />
        <Segmented
          size="sm"
          label="Forma del móvil"
          layoutId="clap-demo-shape"
          value={shape}
          onChange={setShape}
          options={[
            { value: 'portrait', label: 'Vertical' },
            { value: 'landscape', label: 'Horizontal' },
          ]}
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => (simulated ? void startMic() : backToSim())}
          aria-pressed={!simulated}
        >
          {simulated ? <Mic className="size-4" /> : <MicOff className="size-4" />}
          {simulated ? 'Probar con el micro' : 'Volver a la simulación'}
        </Button>
      </div>
      <p className="max-w-prose text-center text-[13px] leading-snug text-washi-muted">
        {simulated
          ? 'Sala simulada, sin micrófono. Una palmada sola no dispara; en la sala ruidosa con sensibilidad baja, ni el doble aplauso.'
          : 'Escuchando el micrófono de verdad: da dos palmadas. Aquí no se graba nada.'}
        {micError && <span className="block font-bold text-shu-400">{micError}</span>}
      </p>

      <div
        className={cn(
          'relative isolate max-w-full select-none overflow-hidden rounded-[22px] bg-black text-washi ring-1 ring-line-strong',
          turned ? 'aspect-[16/9] min-h-[340px] w-[min(680px,100%)]' : 'aspect-[9/16] w-[min(380px,100%)]',
        )}
      >
        {/* The camera behind, roughly: a rehearsal room's floor and mirror. */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[30%] bg-sumi-900" />
        <div
          aria-hidden
          className="absolute inset-x-[12%] bottom-[30%] top-[18%] border-x border-t border-sumi-700"
        />
        {armed ? (
          <div className="absolute inset-0 overflow-y-auto bg-sumi-950/85 backdrop-blur-sm">
            <ClapArmView
              variant={variant}
              ui={ui}
              phase={fired ? 'fired' : 'listening'}
              sensitivity={sensitivity}
              onSensitivity={(clapSensitivity) => setSettings({ clapSensitivity })}
              onCancel={disarm}
              secondsLeft={null}
              embedded={turned ? 'row' : 'column'}
            />
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <p className="text-[14px] text-washi-muted">
                Desarmado. En el grabador, el botón está junto al disparador.
              </p>
              <Button onClick={() => setArmed(true)}>
                <span aria-hidden className="font-display text-[16px] font-extrabold leading-none">
                  拍
                </span>
                Armar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
