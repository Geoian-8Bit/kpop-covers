import {
  formatBytes,
  formatDuration,
  MAX_CLOUD_UPLOAD_BYTES,
  parseYouTubeId,
  youTubeThumbnail,
} from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CloudUpload, HardDrive, Info, Link2, UploadCloud, X } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { useCreateVideo } from '@/data/videos';
import { cn } from '@/lib/cn';
import { probeMediaFile } from '@/lib/localVideos';
import { jelly, soft } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { useCrew } from '@/providers/CrewProvider';
import { useToast } from '@/providers/ToastProvider';

type Tab = 'youtube' | 'file';
type MetaState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; title: string | null; author: string | null }
  | { status: 'error'; message: string };

interface Probe {
  duration: number | null;
  poster: string | null;
}

function cleanFileTitle(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

const slide = (dir: 1 | -1) => ({
  initial: { opacity: 0, x: 14 * dir },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -14 * dir, transition: { duration: 0.12 } },
});

export function AddVideoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeCrew } = useCrew();
  const createVideo = useCreateVideo();
  const navigate = useNavigate();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('youtube');
  const [link, setLink] = useState('');
  const [meta, setMeta] = useState<MetaState>({ status: 'idle' });
  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const titleTouched = useRef(false);
  /** Bumped on every pick/remove/close so a slow probe for an old file is ignored. */
  const probeToken = useRef(0);

  const youtubeId = parseYouTubeId(link);

  useEffect(() => {
    if (!open) {
      probeToken.current++;
      setLink('');
      setMeta({ status: 'idle' });
      setFile(null);
      setProbe(null);
      setTitle('');
      setArtist('');
      setError(null);
      titleTouched.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!youtubeId) {
      setMeta({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setMeta({ status: 'loading' });
    fetch(`/api/youtube-meta?id=${youtubeId}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { title?: string | null; author?: string | null };
        if (res.status === 422) {
          setMeta({
            status: 'error',
            message: 'El autor no permite reproducir este vídeo fuera de YouTube. Descárgalo y súbelo como archivo.',
          });
          return;
        }
        if (res.status === 404) {
          setMeta({ status: 'error', message: 'No encontramos ese vídeo. ¿Es privado?' });
          return;
        }
        setMeta({ status: 'ok', title: body.title ?? null, author: body.author ?? null });
        if (!titleTouched.current) {
          setTitle(body.title ?? '');
          setArtist(body.author ?? '');
        }
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setMeta({ status: 'ok', title: null, author: null });
      });
    return () => controller.abort();
  }, [youtubeId]);

  async function pickFile(next: File | null | undefined) {
    if (!next) return;
    if (!/^(video|audio)\//.test(next.type) && !/\.(mp4|mov|webm|m4v|mkv|mp3|m4a|wav)$/i.test(next.name)) {
      setError('Ese archivo no parece un vídeo o audio.');
      return;
    }
    const token = ++probeToken.current;
    setError(null);
    setFile(next);
    setProbe(null);
    if (!titleTouched.current) setTitle(cleanFileTitle(next.name));
    const result = await probeMediaFile(next);
    if (token === probeToken.current) setProbe(result);
  }

  function clearFile() {
    probeToken.current++;
    setFile(null);
    setProbe(null);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void pickFile(event.dataTransfer.files[0]);
  }

  const canSubmit =
    Boolean(activeCrew) &&
    title.trim().length > 0 &&
    (tab === 'youtube' ? Boolean(youtubeId) && meta.status !== 'error' : Boolean(file));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!activeCrew || !canSubmit) return;
    setError(null);
    try {
      const result = await createVideo.mutateAsync(
        tab === 'youtube'
          ? { crewId: activeCrew.id, title, artist, youtubeId: youtubeId! }
          : { crewId: activeCrew.id, title, artist, file: file!, duration: probe?.duration, poster: probe?.poster },
      );
      toast(
        tab === 'file' && !result.synced ? 'Guardado en este dispositivo (no subido a la nube).' : 'Vídeo añadido a la biblioteca',
        tab === 'file' && !result.synced ? 'info' : 'success',
      );
      onClose();
      navigate(`/v/${result.video.id}`);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  const tooBig = file ? file.size > MAX_CLOUD_UPLOAD_BYTES : false;

  return (
    <Dialog open={open} onClose={onClose} title="Añadir vídeo" description="Desde un enlace de YouTube o desde un archivo tuyo.">
      <form onSubmit={onSubmit} className="space-y-5">
        <Segmented
          label="Origen"
          layoutId="add-video-tab"
          value={tab}
          onChange={(t) => {
            setTab(t);
            setError(null);
          }}
          options={[
            { value: 'youtube', label: 'Enlace de YouTube' },
            { value: 'file', label: 'Subir archivo' },
          ]}
          className="w-full [&>button]:flex-1"
        />

        <AnimatePresence mode="wait" initial={false}>
          {tab === 'youtube' ? (
            <motion.div key="yt" {...slide(-1)} transition={soft} className="space-y-4">
              <Field
                data-autofocus
                label="Enlace"
                placeholder="https://youtu.be/…"
                inputMode="url"
                autoComplete="off"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                error={
                  link && !youtubeId
                    ? 'No reconocemos ese enlace de YouTube.'
                    : meta.status === 'error'
                      ? meta.message
                      : null
                }
                trailing={<Link2 className="mr-2.5 size-4.5 text-washi-subtle" />}
              />

              <AnimatePresence>
                {youtubeId && meta.status !== 'error' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={soft}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-3 rounded-[12px] border border-line bg-sumi-950/50 p-2">
                      <img src={youTubeThumbnail(youtubeId, 'mqdefault')} alt="" className="aspect-video w-28 shrink-0 rounded-[8px] object-cover" />
                      <div className="min-w-0 flex-1">
                        {meta.status === 'loading' ? (
                          <div className="space-y-2">
                            <div className="skeleton h-3.5 w-4/5 rounded-full" />
                            <div className="skeleton h-3 w-1/2 rounded-full" />
                          </div>
                        ) : (
                          <>
                            <p className="line-clamp-2 text-sm font-medium">
                              {meta.status === 'ok' && meta.title ? meta.title : 'Vídeo de YouTube'}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-washi-muted">
                              {meta.status === 'ok' && meta.author ? meta.author : youtubeId}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <details className="rounded-[12px] border border-line px-4 py-3 text-[13px] text-washi-muted">
                <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-washi-muted">
                  <Info className="size-4 text-ai-300" /> ¿Por qué no se descarga el MP4?
                </summary>
                <p className="mt-2 leading-relaxed">
                  YouTube no permite descargas de terceros y bloquea los servidores que lo intentan. Aquí reproducimos el
                  vídeo original con espejo, velocidad y clips, sin descargar nada. Si quieres trabajarlo offline, bájalo
                  tú (por ejemplo con <span className="font-mono text-washi">yt-dlp</span>) y súbelo en “Subir archivo”.
                </p>
              </details>
            </motion.div>
          ) : (
            <motion.div key="file" {...slide(1)} transition={soft} className="space-y-4">
              <input
                ref={fileInput}
                type="file"
                accept="video/*,audio/*"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => void pickFile(e.target.files?.[0])}
              />
              <AnimatePresence mode="wait" initial={false}>
                {file ? (
                  <motion.div
                    key="chosen"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={jelly}
                    className="flex items-center gap-3 rounded-[12px] border border-line bg-sumi-950/50 p-2"
                  >
                    <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-[8px] bg-sumi-800">
                      {probe?.poster ? <img src={probe.poster} alt="" className="size-full object-cover" /> : <div className="skeleton size-full" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="tabular mt-0.5 text-xs text-washi-muted">
                        {formatBytes(file.size)} · {formatDuration(probe?.duration)}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon-sm" aria-label="Quitar archivo" onClick={clearFile}>
                      <X className="size-4" />
                    </Button>
                  </motion.div>
                ) : (
                  <motion.button
                    key="drop"
                    type="button"
                    data-autofocus
                    onClick={() => fileInput.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    animate={{ scale: dragging ? 1.02 : 1 }}
                    whileTap={{ scale: 0.98 }}
                    transition={jelly}
                    className={cn(
                      'flex w-full flex-col items-center justify-center gap-3 rounded-[14px] border border-dashed px-6 py-10 text-center transition-colors',
                      dragging ? 'border-kin-300 bg-kin-300/[0.06]' : 'border-line-strong hover:border-washi-subtle',
                    )}
                  >
                    <motion.span animate={{ y: dragging ? -5 : 0 }} transition={jelly}>
                      <UploadCloud className="size-8 text-ai-300" />
                    </motion.span>
                    <span className="font-medium text-washi">Arrastra el vídeo o toca para elegir</span>
                    <span className="text-[13px] text-washi-subtle">MP4, MOV, WEBM o audio</span>
                  </motion.button>
                )}
              </AnimatePresence>

              {file && (
                <p
                  className={cn(
                    'flex items-start gap-2 rounded-[10px] px-3.5 py-3 text-[13px] leading-snug',
                    tooBig ? 'bg-kin-300/10 text-kin-200' : 'bg-ai-600/20 text-ai-200',
                  )}
                >
                  {tooBig ? <HardDrive className="mt-0.5 size-4 shrink-0" /> : <CloudUpload className="mt-0.5 size-4 shrink-0" />}
                  {tooBig
                    ? 'Pesa más de 50 MB: se guarda solo en este dispositivo. El resto de la crew podrá vincular su propia copia del archivo.'
                    : 'Se sube a la nube de tu crew y también queda guardado en este dispositivo.'}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Título"
            required
            maxLength={200}
            placeholder="Ej. Magnetic — Dance Practice"
            value={title}
            onChange={(e) => {
              titleTouched.current = true;
              setTitle(e.target.value);
            }}
          />
          <Field
            label="Artista"
            maxLength={120}
            placeholder="Ej. ILLIT"
            value={artist}
            onChange={(e) => {
              titleTouched.current = true;
              setArtist(e.target.value);
            }}
          />
        </div>

        <AnimatePresence>
          {error && (
            <motion.p
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-sm text-enji-300"
            >
              <AlertTriangle className="size-4" /> {error}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!canSubmit} loading={createVideo.isPending}>
            {createVideo.isPending && tab === 'file' ? 'Guardando…' : 'Añadir y abrir'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
