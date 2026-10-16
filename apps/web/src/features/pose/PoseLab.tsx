import { formatTime } from '@coverscape/shared';
import { Copy, FileVideo, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { useToast } from '@/providers/ToastProvider';
import { addRun, describeDevice, loadRuns, runsToText, saveRuns, summarize, type LabRun } from './labStats';
import {
  learnDuration,
  loadLandmarker,
  loadMoveNet,
  moveNetPairs,
  resetTracker,
  seekVideo,
  type MoveNetPose,
  type TfBackend,
} from './models';

/**
 * 5.5 · Paso 1 «Prueba rápida»: on a take or a dance practice chosen from this device, draw the skeleton with
 * MoveNet (MultiPose) and with MediaPipe (Pose Landmarker lite) and time them, to compare phones and laptops.
 * The video is only read here (never uploaded); the results stay on this device and can be copied.
 */

type Which = 'movenet' | 'mediapipe';
const FPS = 5;

/** Pigments from index.css for each person's skeleton (canvas needs the colour values). */
function palette(): string[] {
  const css = getComputedStyle(document.documentElement);
  return [
    '--color-kin-300',
    '--color-ai-300',
    '--color-sakura',
    '--color-rokusho',
    '--color-fuji',
    '--color-shu-400',
  ].map((name) => css.getPropertyValue(name).trim() || 'currentColor');
}

export default function PoseLab() {
  const toast = useToast();
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const [meta, setMeta] = useState<{ width: number; height: number; duration: number } | null>(null);
  const [frames, setFrames] = useState<30 | 60 | 120>(60);
  const [backend, setBackend] = useState<TfBackend>('webgl');
  const [runs, setRuns] = useState<LabRun[]>(() => loadRuns());
  const [busy, setBusy] = useState<{
    which: Which;
    done: number;
    total: number;
    phase: 'load' | 'run';
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => () => (file ? URL.revokeObjectURL(file.url) : undefined), [file]);

  function pick(f: File | undefined) {
    if (!f) return;
    abort.current?.abort();
    setMeta(null);
    setError(null);
    setFile({ url: URL.createObjectURL(f), name: f.name });
  }

  function clearCanvas() {
    const c = canvas.current;
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
  }

  function drawMoveNet(poses: readonly MoveNetPose[], pairs: [number, number][], colors: string[]) {
    const c = canvas.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    g.clearRect(0, 0, c.width, c.height);
    const lw = Math.max(3, c.width / 220);
    poses.forEach((pose, n) => {
      const color = colors[n % colors.length]!;
      g.strokeStyle = color;
      g.fillStyle = color;
      g.lineWidth = lw;
      for (const [a, b] of pairs) {
        const p = pose.keypoints[a];
        const q = pose.keypoints[b];
        if (!p || !q || (p.score ?? 0) < 0.3 || (q.score ?? 0) < 0.3) continue;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(q.x, q.y);
        g.stroke();
      }
      for (const k of pose.keypoints) {
        if ((k.score ?? 0) < 0.3) continue;
        g.beginPath();
        g.arc(k.x, k.y, lw * 1.4, 0, Math.PI * 2);
        g.fill();
      }
    });
  }

  function drawLandmarks(
    sets: { x: number; y: number }[][],
    connections: { start: number; end: number }[],
    colors: string[],
  ) {
    const c = canvas.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    g.clearRect(0, 0, c.width, c.height);
    const lw = Math.max(3, c.width / 220);
    sets.forEach((points, n) => {
      const color = colors[(n + 1) % colors.length]!;
      g.strokeStyle = color;
      g.fillStyle = color;
      g.lineWidth = lw;
      for (const { start, end } of connections) {
        const p = points[start];
        const q = points[end];
        if (!p || !q) continue;
        g.beginPath();
        g.moveTo(p.x * c.width, p.y * c.height);
        g.lineTo(q.x * c.width, q.y * c.height);
        g.stroke();
      }
      for (const p of points) {
        g.beginPath();
        g.arc(p.x * c.width, p.y * c.height, lw * 1.2, 0, Math.PI * 2);
        g.fill();
      }
    });
  }

  async function measure(which: Which, signal: AbortSignal): Promise<LabRun> {
    const v = video.current!;
    const colors = palette();
    setBusy({ which, done: 0, total: frames, phase: 'load' });
    const loaded =
      which === 'movenet'
        ? { kind: 'movenet' as const, ...(await loadMoveNet(backend)), pairs: await moveNetPairs() }
        : { kind: 'mediapipe' as const, ...(await loadLandmarker()) };
    if (loaded.kind === 'movenet') {
      resetTracker(loaded.detector);
      if (loaded.backend !== backend) {
        toast(
          `${backend === 'webgpu' ? 'WebGPU' : 'WebGL'} no está disponible aquí: se mide con ${loaded.backend}`,
          'info',
        );
      }
    }
    const start = v.currentTime;
    const length = Number.isFinite(v.duration) ? v.duration : 0;
    const times = Array.from({ length: frames }, (_, i) => {
      const t = start + i / FPS;
      return length > 0 ? t % Math.max(0.1, length - 0.05) : t;
    });
    const frameMs: number[] = [];
    const people: number[] = [];
    let firstMs = 0;
    let clock = performance.now();
    setBusy({ which, done: 0, total: frames, phase: 'run' });
    const t0 = performance.now();
    for (let i = 0; i < times.length; i++) {
      if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
      await seekVideo(v, times[i]!);
      const a = performance.now();
      let count = 0;
      if (loaded.kind === 'movenet') {
        const poses = await loaded.detector.estimatePoses(
          v,
          { maxPoses: 6, flipHorizontal: false },
          (i + 1) * (1000 / FPS),
        );
        count = poses.length;
        const ms = performance.now() - a;
        if (i === 0) firstMs = ms;
        else frameMs.push(ms);
        drawMoveNet(poses, loaded.pairs, colors);
      } else {
        // VIDEO mode wants a timestamp that always grows.
        clock = Math.max(clock + 1, performance.now());
        const result = loaded.landmarker.detectForVideo(v, clock);
        count = result.landmarks.length;
        const ms = performance.now() - a;
        if (i === 0) firstMs = ms;
        else frameMs.push(ms);
        drawLandmarks(result.landmarks, loaded.connections, colors);
      }
      if (i > 0) people.push(count);
      setBusy({ which, done: i + 1, total: frames, phase: 'run' });
    }
    const wall = performance.now() - t0;
    return {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      model: loaded.model,
      backend: loaded.kind === 'movenet' ? loaded.backend : loaded.delegate,
      loadMs: Math.round(loaded.loadMs),
      firstMs: Math.round(firstMs),
      ...summarize(frameMs, people, wall),
      video: `${file?.name ?? 'vídeo'} · ${v.videoWidth}×${v.videoHeight}`,
      device: describeDevice(navigator as Navigator & { deviceMemory?: number }),
    };
  }

  async function run(which: Which[]) {
    if (!video.current || busy) return;
    video.current.pause();
    setError(null);
    const controller = new AbortController();
    abort.current = controller;
    const start = video.current.currentTime;
    try {
      for (const w of which) {
        await seekVideo(video.current, start);
        const result = await measure(w, controller.signal);
        setRuns((current) => {
          const next = addRun(current, result);
          saveRuns(next);
          return next;
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') toast('Prueba cancelada', 'info');
      else setError(err instanceof Error ? err.message : 'La prueba falló.');
    } finally {
      setBusy(null);
      abort.current = null;
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(runsToText(runs));
      toast('Resultados copiados', 'success');
    } catch {
      toast('No se pudo copiar: selecciona la tabla a mano', 'error');
    }
  }

  return (
    <div className="mt-5 space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept="video/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy != null}>
          <FileVideo className="size-4" /> {file ? 'Otro vídeo' : 'Elegir vídeo'}
        </Button>
        <span className="min-w-0 truncate text-[13px] text-washi-subtle">
          {file
            ? `${file.name}${meta ? ` · ${meta.width}×${meta.height} · ${formatTime(meta.duration)}` : ''}`
            : 'Una toma o un dance practice de este dispositivo. No se sube.'}
        </span>
      </div>

      {file && (
        <div className="relative aspect-video w-full overflow-hidden rounded-[12px] bg-black">
          <video
            ref={video}
            src={file.url}
            muted
            playsInline
            controls={busy == null}
            preload="auto"
            aria-label="Vídeo de prueba"
            className="absolute inset-0 size-full object-contain"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (canvas.current) {
                canvas.current.width = v.videoWidth;
                canvas.current.height = v.videoHeight;
              }
              // A take recorded here doesn't know its length yet: find it before measuring.
              void learnDuration(v).then(() =>
                setMeta({ width: v.videoWidth, height: v.videoHeight, duration: v.duration }),
              );
            }}
            onSeeking={() => busy == null && clearCanvas()}
            onPlay={clearCanvas}
          />
          <canvas
            ref={canvas}
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full object-contain"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-washi-muted">Fotogramas (a {FPS} por segundo)</p>
          <Segmented
            label="Fotogramas que medir"
            layoutId="pose-lab-frames"
            value={frames}
            onChange={setFrames}
            options={[
              { value: 30, label: '30' },
              { value: 60, label: '60' },
              { value: 120, label: '120' },
            ]}
          />
        </div>
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-washi-muted">MoveNet con</p>
          <Segmented
            label="Motor de MoveNet"
            layoutId="pose-lab-backend"
            value={backend}
            onChange={setBackend}
            options={[
              { value: 'webgl', label: 'WebGL' },
              { value: 'webgpu', label: 'WebGPU' },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!meta || busy != null} onClick={() => void run(['movenet', 'mediapipe'])}>
          Probar los dos
        </Button>
        <Button variant="secondary" disabled={!meta || busy != null} onClick={() => void run(['movenet'])}>
          MoveNet
        </Button>
        <Button variant="secondary" disabled={!meta || busy != null} onClick={() => void run(['mediapipe'])}>
          MediaPipe
        </Button>
        {busy && (
          <Button variant="ghost" onClick={() => abort.current?.abort()}>
            Cancelar
          </Button>
        )}
      </div>
      <p aria-live="polite" className="text-[13px] text-washi-muted">
        {busy
          ? busy.phase === 'load'
            ? `Cargando ${busy.which === 'movenet' ? 'MoveNet' : 'MediaPipe'}… (la primera vez se descarga)`
            : `${busy.which === 'movenet' ? 'MoveNet' : 'MediaPipe'}: ${busy.done} de ${busy.total} fotogramas`
          : meta
            ? 'Se mide desde el momento en que está el vídeo. El primer fotograma se cuenta aparte (la tarjeta gráfica se prepara).'
            : ''}
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-[10px] bg-enji-500/15 px-3.5 py-3 text-[13px] leading-snug text-enji-200"
        >
          {error}
        </p>
      )}

      {runs.length > 0 && (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-washi-subtle">
              Resultados en este dispositivo
            </p>
            <div className="flex gap-1.5">
              <Button variant="secondary" size="sm" className="min-h-11" onClick={() => void copy()}>
                <Copy className="size-4" /> Copiar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11"
                disabled={busy != null}
                onClick={() => {
                  setRuns([]);
                  saveRuns([]);
                }}
              >
                <Trash2 className="size-4" /> Borrar
              </Button>
            </div>
          </div>
          <ul className="space-y-2">
            {runs.map((r) => (
              <li key={r.id} className="rounded-[10px] border border-line px-3.5 py-3 text-[13px]">
                <p className="font-semibold text-washi">
                  {r.model === 'movenet-multipose-lightning' ? 'MoveNet MultiPose' : 'MediaPipe lite'} ·{' '}
                  <span className="font-mono">{r.backend}</span>
                </p>
                <dl className="tabular mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[12px] text-washi-muted sm:grid-cols-4">
                  <Stat label="ms/fotograma" value={`${r.avgMs} (p95 ${r.p95Ms})`} />
                  <Stat label="fps modelo" value={String(r.modelFps)} />
                  <Stat label="fps análisis" value={String(r.runFps)} />
                  <Stat label="carga" value={r.loadMs ? `${(r.loadMs / 1000).toFixed(1)} s` : 'ya cargado'} />
                  <Stat label="1.er fotograma" value={`${r.firstMs} ms`} />
                  <Stat label="fotogramas" value={String(r.frames + 1)} />
                  <Stat label="personas" value={String(r.people)} />
                </dl>
                <p className="mt-1.5 truncate text-[12px] text-washi-subtle">
                  {r.video} · {r.device} ·{' '}
                  {new Date(r.at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate font-sans text-[11px] text-washi-subtle">{label}</dt>
      <dd className="truncate text-washi">{value}</dd>
    </div>
  );
}
