import { CLAP_VERDICT_LABEL, describeMime, formatMbps, formatTime, measuredBitrate } from '@coverscape/shared';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { soft } from '@/lib/motion';
import {
  forgetWhiteBalanceFailures,
  listCameras,
  readTrackInfo,
  subscribeWhiteBalance,
  whiteBalanceHiddenCount,
  whiteBalanceVersion,
  type TrackInfo,
} from './camera';
import { clapLog, subscribeClapLog } from './clap/clapLog';
import { watchPresentedFrames } from './compositor';
import { paceLog, type BenchResult, type PaceRest } from './pace';
import { clearFailedFormats, failedFamilies, type RecordFormat } from './recorder';
import { useRecordSettings } from './settings';

/** What the last take really came out as (size ÷ duration says whether the bitrate was respected). */
export interface TakeStats {
  bytes: number;
  seconds: number;
  mimeType: string;
  requestedBps: number;
  /** Canvas takes: frames the camera delivered minus frames drawn into the take; null for direct takes. */
  dropped: number | null;
  expected: number;
  /** Frames per second the take really got. */
  realFps?: number | null;
  /** P19 review · Median camera → screen delay of the preview during the take (from its second 2). */
  lagMs?: number | null;
  /** P19 review · The camera's mean rate in the take's countdown (null without one). */
  restFps?: number | null;
  /** P19 review · Direct takes: camera frames the page didn't get to paint (the file has them; never judged). */
  missed?: number | null;
}

const ms = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v)} ms`);
const fps1 = (v: number) => `${String(Math.round(v * 10) / 10).replace('.', ',')} fps`;

/**
 * P19 review · The preview right now: frames per second and camera → screen delay, measured once a second while the
 * panel is open (the numbers to read on the phone itself).
 */
function useLivePace(video: HTMLVideoElement | null): { fps: number; lagMs: number | null } | null {
  const [live, setLive] = useState<{ fps: number; lagMs: number | null } | null>(null);
  useEffect(() => {
    if (!video) return;
    const w = watchPresentedFrames(video);
    let frames = w.count();
    let at = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const n = w.count();
      const next = { fps: ((n - frames) * 1000) / Math.max(1, now - at), lagMs: w.lag.median() };
      setLive(next);
      paceLog('preview', next);
      w.lag.clear();
      frames = n;
      at = now;
    }, 1000);
    return () => {
      clearInterval(id);
      w.stop();
    };
  }, [video]);
  return live;
}

const yes = (v: boolean) => (v ? 'sí' : 'no');

/** Chrome only answers for HEVC with a full codec string; try the common 1080p and 4K ones. */
const HEVC_PROBES = [
  'video/mp4;codecs=hvc1.1.6.L120.B0,mp4a.40.2',
  'video/mp4;codecs=hev1.1.6.L120.B0,mp4a.40.2',
  'video/mp4;codecs=hvc1.1.6.L150.B0,mp4a.40.2',
  'video/mp4;codecs=hvc1,mp4a.40.2',
];

function supportsType(type: string): boolean {
  try {
    return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type);
  } catch {
    return false;
  }
}

/**
 * The «i» panel (plan: prueba 3): what the camera and the recorder are really using on this phone, so each
 * quality step can be checked on the Samsungs instead of guessed.
 */
export function InfoPanel({
  track,
  format,
  mode,
  last,
  pace,
  video = null,
  bench = null,
  rest = null,
  onRemeasure,
  paceHint,
  onClose,
}: {
  track: MediaStreamTrack | undefined;
  /** What the next take will be recorded with. */
  format: RecordFormat | null;
  /** How the picture reaches the recorder. */
  mode: string;
  last: TakeStats | null;
  /** P19 · Whether the camera mode was made lighter for this phone (or is being measured). */
  pace?: string;
  /** The live preview, to measure it while the panel is open. */
  video?: HTMLVideoElement | null;
  /** The last rehearsal of this opening, and what the camera gave at rest in this mode. */
  bench?: BenchResult | null;
  rest?: PaceRest | null;
  /** «Volver a medir»: forget the learnt pace and rehearse again (between takes only). */
  onRemeasure?: () => void;
  /** Without «Volver a medir» (a light mode, not measured): when the pace will be measured. */
  paceHint?: string;
  onClose: () => void;
}) {
  const live = useLivePace(video);
  useSyncExternalStore(subscribeWhiteBalance, whiteBalanceVersion);
  const wbHidden = whiteBalanceHiddenCount();
  const claps = useSyncExternalStore(subscribeClapLog, clapLog);
  const [info, setInfo] = useState<TrackInfo | null>(() => readTrackInfo(track));
  const [cameras, setCameras] = useState<string[]>([]);
  const codec = useRecordSettings((s) => s.codec);
  const [failed, setFailed] = useState(failedFamilies);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // A dialog like the others: focus inside, Escape closes it (and only it).
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, []);

  // Settings change after a lens switch or a zoom: read again while the panel is open.
  useEffect(() => {
    setInfo(readTrackInfo(track));
    const id = setInterval(() => setInfo(readTrackInfo(track)), 1000);
    void listCameras().then(setCameras);
    return () => clearInterval(id);
  }, [track]);

  const lastBps = last ? measuredBitrate(last.bytes, last.seconds) : 0;

  return (
    <motion.aside
      role="dialog"
      aria-modal="true"
      aria-label="Información técnica"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={soft}
      onPointerDown={(e) => e.stopPropagation()}
      className="paper-raised absolute inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] top-[calc(max(14px,env(safe-area-inset-top))+60px)] z-40 mx-auto flex max-w-md flex-col overflow-hidden rounded-[16px] text-washi landscape:inset-y-[max(12px,env(safe-area-inset-top))] landscape:left-auto landscape:right-[max(12px,env(safe-area-inset-right))] landscape:w-96"
    >
      <header className="flex items-center gap-3 border-b border-rule px-4 py-3">
        <span className="grid size-8 place-items-center rounded-full border border-kin-400/60 font-display text-[15px] font-bold text-kin-300">
          i
        </span>
        <h2 className="flex-1 font-display text-[17px] font-bold">Información técnica</h2>
        <button
          ref={closeRef}
          type="button"
          aria-label="Cerrar la información"
          onClick={onClose}
          className="grid size-11 place-items-center rounded-full hover:bg-washi/10"
        >
          <X className="size-5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 text-[13px] leading-relaxed">
        <Section title="Cámara">
          {info ? (
            <>
              <Row k="Lente" v={info.label || '—'} />
              <Row k="Resolución real" v={`${info.width}×${info.height}`} />
              <Row k="Fotogramas" v={`${String(info.frameRate).replace('.', ',')} fps`} />
              <Row
                k="Máximo de la cámara"
                v={
                  info.maxWidth && info.maxHeight
                    ? `${info.maxWidth}×${info.maxHeight}${info.maxFrameRate ? ` · ${Math.round(info.maxFrameRate)} fps` : ''}`
                    : '—'
                }
              />
              <Row
                k="Zoom de lente"
                v={
                  info.zoom ? `${fmt(info.zoom.min)}× – ${fmt(info.zoom.max)}×` : 'no (el zoom sería digital)'
                }
              />
              <Row k="Linterna" v={yes(info.torch)} />
              <Row k="Enfoque" v={info.focusModes.length ? info.focusModes.join(', ') : 'no'} />
              <Row
                k="Tocar para enfocar"
                v={
                  info.pointsOfInterest && info.focusModes.length
                    ? 'sí'
                    : info.pointsOfInterest
                      ? 'solo el navegador'
                      : 'no'
                }
              />
              <Row k="Exposición" v={info.exposureModes.length ? info.exposureModes.join(', ') : 'no'} />
              <Row
                k="Compensación"
                v={
                  info.exposureCompensation
                    ? `${fmt(info.exposureCompensation.min)} a ${fmt(info.exposureCompensation.max)}`
                    : 'no'
                }
              />
              <Row
                k="Balance de blancos"
                v={info.whiteBalanceModes.length ? info.whiteBalanceModes.join(', ') : 'no'}
              />
              <Row
                k="Temperatura de color"
                v={
                  info.colorTemperature ? `${info.colorTemperature.min}–${info.colorTemperature.max} K` : 'no'
                }
              />
              {wbHidden > 0 && (
                <div className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-washi-muted">
                    «Color de la luz» oculto: la cámara no lo aplicó dos veces.
                  </span>
                  <button
                    type="button"
                    onClick={forgetWhiteBalanceFailures}
                    className="min-h-11 shrink-0 rounded-[8px] px-2 text-[13px] font-bold text-kin-300 hover:bg-washi/10"
                  >
                    Volver a probar
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-washi-subtle">La cámara aún no está abierta.</p>
          )}
        </Section>

        <Section title="Grabación">
          <div className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-washi-muted">Formato preferido</span>
            <Segmented
              size="sm"
              label="Formato preferido"
              layoutId="info-codec"
              value={codec}
              onChange={(next) => useRecordSettings.getState().set({ codec: next })}
              options={[
                { value: 'auto', label: 'Automático' },
                { value: 'h264', label: 'Compatible' },
              ]}
            />
          </div>
          <p className="pb-1 text-[12px] text-washi-subtle">
            Automático usa HEVC si el móvil puede (mitad de tamaño); Compatible graba siempre H.264, que se ve
            en cualquier ordenador.
          </p>
          <Row k="Formato" v={format ? describeMime(format.mimeType) : '—'} />
          <Row k="Compresión pedida" v={format ? formatMbps(format.videoBitsPerSecond) : '—'} />
          <Row k="Sonido" v={format ? `${Math.round(format.audioBitsPerSecond / 1000)} kbps` : '—'} />
          <Row k="Captura" v={mode} />
          {pace && <Row k="Fluidez" v={pace} />}
          {video && (
            <Row
              k="Vista previa ahora"
              v={
                live
                  ? `${fps1(live.fps)} · retraso ${live.lagMs == null ? 'sin medir' : ms(live.lagMs)}`
                  : 'midiendo…'
              }
            />
          )}
          {(bench || rest) && (
            <Row
              k="Prueba de fluidez"
              v={
                bench
                  ? `grabando ${fps1(bench.fps)} · ${ms(bench.lagMs)}; en reposo ${fps1(bench.restFps)} · ${ms(bench.restLagMs)}`
                  : `en reposo ${fps1(rest!.fps)} · ${ms(rest!.lagMs)}`
              }
            />
          )}
          {!onRemeasure && paceHint && <p className="py-1.5 text-[12px] text-washi-subtle">{paceHint}</p>}
          {onRemeasure && (
            <div className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-washi-muted">Si la calidad bajó por un mal momento, mide otra vez.</span>
              <button
                type="button"
                onClick={onRemeasure}
                className="min-h-11 shrink-0 rounded-[8px] px-2 text-[13px] font-bold text-kin-300 hover:bg-washi/10"
              >
                Volver a medir
              </button>
            </div>
          )}
          <Row k="HEVC disponible" v={yes(HEVC_PROBES.some(supportsType))} />
          <Row k="H.264 High disponible" v={yes(supportsType('video/mp4;codecs=avc1.640028,mp4a.40.2'))} />
          {failed.length > 0 && (
            <div className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-washi-muted">
                Formatos que fallaron aquí:{' '}
                <span className="font-mono text-[12px] text-washi">{failed.join(', ')}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  clearFailedFormats();
                  setFailed([]);
                }}
                className="min-h-11 shrink-0 rounded-[8px] px-2 text-[13px] font-bold text-kin-300 hover:bg-washi/10"
              >
                Volver a probar
              </button>
            </div>
          )}
        </Section>

        <Section title="Última toma">
          {last ? (
            <>
              <Row k="Duración" v={formatTime(last.seconds)} />
              <Row k="Tamaño" v={`${(last.bytes / 1_048_576).toFixed(1).replace('.', ',')} MB`} />
              <Row k="Formato declarado" v={describeMime(last.mimeType)} />
              <Row
                k="Compresión real (total)"
                v={`${formatMbps(lastBps)} · vídeo pedido ${formatMbps(last.requestedBps)}`}
              />
              <Row
                k="Fotogramas por segundo"
                v={
                  last.realFps
                    ? `${String(Math.round(last.realFps * 10) / 10).replace('.', ',')} fps`
                    : 'sin medir'
                }
              />
              <Row
                k="Fotogramas perdidos"
                v={
                  last.dropped == null
                    ? 'no aplica (imagen directa)'
                    : `${last.dropped} de ${Math.round(last.expected)}`
                }
              />
              {last.missed != null && (
                <Row k="Sin pintar en pantalla" v={`${last.missed} (el archivo sí los tiene)`} />
              )}
              <Row k="Cámara en la cuenta atrás" v={last.restFps ? fps1(last.restFps) : 'sin medir'} />
              <Row k="Retraso de la vista previa" v={last.lagMs == null ? 'sin medir' : ms(last.lagMs)} />
            </>
          ) : (
            <p className="text-washi-subtle">Graba una toma para ver cómo ha salido.</p>
          )}
        </Section>

        <Section title="Aplauso">
          {claps.length ? (
            <ul aria-label="Últimos sonidos juzgados" className="space-y-1">
              {claps.map((c, i) => (
                <li key={`${c.time}-${i}`} className="border-b border-line py-1 last:border-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={c.verdict === 'first' || c.verdict === 'second' || c.verdict === 'echo' ? 'text-washi' : 'text-washi-muted'}>
                      {CLAP_VERDICT_LABEL[c.verdict]}
                    </span>
                    <span className="tabular shrink-0 font-mono text-[11px] text-washi-subtle">{clock(c.time)}</span>
                  </div>
                  <p className="tabular font-mono text-[11px] text-washi-muted">
                    nivel ×{fmt(c.overThreshold)} · brillo {fmt(c.brightness)} · ataque {ms1(c.attackMs)} · caída{' '}
                    {ms1(c.decayMs)} · cresta {fmt(c.crest)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-washi-subtle">
              Arma la grabación con el aplauso y da palmadas: aquí verás cómo se juzga cada una.
            </p>
          )}
        </Section>

        <Section title="Cámaras de este móvil">
          {cameras.length ? (
            <ul className="space-y-0.5 font-mono text-[12px] text-washi-muted">
              {cameras.map((c, i) => (
                <li key={`${c}-${i}`}>{c}</li>
              ))}
            </ul>
          ) : (
            <p className="text-washi-subtle">—</p>
          )}
        </Section>
      </div>
    </motion.aside>
  );
}

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
const ms1 = (v: number) => (Number.isFinite(v) ? `${String(Math.round(v * 10) / 10).replace('.', ',')} ms` : 'larga');
const clock = (t: number) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-kin-300">{title}</h3>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-1 last:border-0">
      <span className="shrink-0 text-washi-muted">{k}</span>
      <span className="tabular min-w-0 break-words text-right font-mono text-[12px] text-washi">{v}</span>
    </div>
  );
}
