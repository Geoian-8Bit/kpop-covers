import { describeMime, formatMbps, formatTime, measuredBitrate } from '@coverscape/shared';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { soft } from '@/lib/motion';
import { listCameras, readTrackInfo, type TrackInfo } from './camera';
import type { RecordFormat } from './recorder';

/** What the last take really came out as (size ÷ duration says whether the bitrate was respected). */
export interface TakeStats {
  bytes: number;
  seconds: number;
  mimeType: string;
  requestedBps: number;
  /** Frames the camera should have given minus those recorded; null when not measured. */
  dropped: number | null;
  expected: number;
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
  onClose,
}: {
  track: MediaStreamTrack | undefined;
  /** What the next take will be recorded with. */
  format: RecordFormat | null;
  /** How the picture reaches the recorder. */
  mode: string;
  last: TakeStats | null;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<TrackInfo | null>(() => readTrackInfo(track));
  const [cameras, setCameras] = useState<string[]>([]);

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
      aria-label="Información técnica"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={soft}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] top-[calc(max(14px,env(safe-area-inset-top))+60px)] z-40 mx-auto flex max-w-md flex-col overflow-hidden rounded-[16px] border border-line-strong bg-sumi-900/95 text-washi shadow-[0_24px_48px_-20px_rgb(0_0_0/0.95)] landscape:inset-y-3 landscape:left-auto landscape:right-3 landscape:w-96"
    >
      <header className="flex items-center gap-3 border-b border-rule px-4 py-3">
        <span className="grid size-8 place-items-center rounded-full border border-kin-400/60 font-display text-[15px] font-bold text-kin-300">
          i
        </span>
        <h2 className="flex-1 font-display text-[17px] font-bold">Información técnica</h2>
        <button
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
                v={info.zoom ? `${fmt(info.zoom.min)}× – ${fmt(info.zoom.max)}×` : 'no (el zoom sería digital)'}
              />
              <Row k="Linterna" v={yes(info.torch)} />
              <Row k="Enfoque" v={info.focusModes.length ? info.focusModes.join(', ') : 'no'} />
              <Row k="Tocar para enfocar" v={yes(info.pointsOfInterest)} />
              <Row k="Exposición" v={info.exposureModes.length ? info.exposureModes.join(', ') : 'no'} />
              <Row
                k="Compensación"
                v={info.exposureCompensation ? `${fmt(info.exposureCompensation.min)} a ${fmt(info.exposureCompensation.max)}` : 'no'}
              />
              <Row k="Balance de blancos" v={info.whiteBalanceModes.length ? info.whiteBalanceModes.join(', ') : 'no'} />
              <Row
                k="Temperatura de color"
                v={info.colorTemperature ? `${info.colorTemperature.min}–${info.colorTemperature.max} K` : 'no'}
              />
            </>
          ) : (
            <p className="text-washi-subtle">La cámara aún no está abierta.</p>
          )}
        </Section>

        <Section title="Grabación">
          <Row k="Formato" v={format ? describeMime(format.mimeType) : '—'} />
          <Row k="Compresión pedida" v={format ? formatMbps(format.videoBitsPerSecond) : '—'} />
          <Row k="Sonido" v={format ? `${Math.round(format.audioBitsPerSecond / 1000)} kbps` : '—'} />
          <Row k="Imagen" v={mode} />
          <Row k="HEVC disponible" v={yes(HEVC_PROBES.some(supportsType))} />
          <Row k="H.264 High disponible" v={yes(supportsType('video/mp4;codecs=avc1.640028,mp4a.40.2'))} />
        </Section>

        <Section title="Última toma">
          {last ? (
            <>
              <Row k="Duración" v={formatTime(last.seconds)} />
              <Row k="Tamaño" v={`${(last.bytes / 1_048_576).toFixed(1).replace('.', ',')} MB`} />
              <Row k="Formato real" v={describeMime(last.mimeType)} />
              <Row k="Compresión real" v={`${formatMbps(lastBps)} (pedida ${formatMbps(last.requestedBps)})`} />
              <Row
                k="Fotogramas perdidos"
                v={last.dropped == null ? 'sin medir' : `${last.dropped} de ${Math.round(last.expected)}`}
              />
            </>
          ) : (
            <p className="text-washi-subtle">Graba una toma para ver cómo ha salido.</p>
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
