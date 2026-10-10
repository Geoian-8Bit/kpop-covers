import {
  formatBytes,
  formatDuration,
  MAX_CLOUD_UPLOAD_BYTES,
  parseYouTubeId,
  youTubeThumbnail,
} from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CloudUpload, HardDrive, Link2, Search, UploadCloud, X, Youtube } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { useCreateVideo, useVideos } from '@/data/videos';
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

interface SearchItem {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number | null;
}
type SearchState =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | { status: 'ok'; query: string; items: SearchItem[] }
  | { status: 'error'; message: string };

const SEARCH_ERRORS: Record<number, string> = {
  503: 'La búsqueda todavía no está activada. Pega el enlace del vídeo.',
  429: 'Se acabaron las búsquedas de hoy. Pega el enlace o prueba mañana.',
};

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
  const library = useVideos(activeCrew?.id);
  /** Synchronous lock: a fast double tap must not create the video twice before React re-renders. */
  const submitting = useRef(false);
  const navigate = useNavigate();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('youtube');
  const [link, setLink] = useState('');
  const [meta, setMeta] = useState<MetaState>({ status: 'idle' });
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });
  const searchAbort = useRef<AbortController | null>(null);
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
      searchAbort.current?.abort();
      setSearch({ status: 'idle' });
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

  const query = link.trim().replace(/\s+/g, ' ');
  const wantsSearch = tab === 'youtube' && !youtubeId && query.length >= 2 && !/^https?:\/\//i.test(query);

  /** One request per explicit search (Enter / button), never while typing: the API quota is 100 searches a day. */
  async function runSearch() {
    if (!wantsSearch) return;
    if ((search.status === 'loading' || search.status === 'ok') && search.query === query) return;
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearch({ status: 'loading', query });
    try {
      // Lower-cased so the same search hits Vercel's edge cache instead of the quota.
      const res = await fetch(`/api/youtube-search?q=${encodeURIComponent(query.toLowerCase())}`, {
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => ({}))) as { items?: SearchItem[] };
      if (!res.ok) {
        setSearch({ status: 'error', message: SEARCH_ERRORS[res.status] ?? 'No se pudo buscar. Prueba otra vez.' });
        return;
      }
      setSearch({ status: 'ok', query, items: body.items ?? [] });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setSearch({ status: 'error', message: 'Sin conexión. Prueba otra vez.' });
    }
  }

  function pickResult(item: SearchItem) {
    setLink(`https://youtu.be/${item.id}`);
    if (!titleTouched.current) {
      setTitle(item.title);
      setArtist(item.channel);
    }
  }

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

  /** Already in the group's library: offer to open it instead of adding a copy. */
  const existing = tab === 'youtube' && youtubeId ? library.data?.find((v) => v.youtube_id === youtubeId) : undefined;
  const alreadyAdded = new Set(library.data?.map((v) => v.youtube_id).filter(Boolean));

  const canSubmit =
    Boolean(activeCrew) &&
    !existing &&
    title.trim().length > 0 &&
    (tab === 'youtube' ? Boolean(youtubeId) && meta.status !== 'error' : Boolean(file));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (wantsSearch) {
      void runSearch();
      return;
    }
    if (!activeCrew || !canSubmit || submitting.current) return;
    submitting.current = true;
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
    } finally {
      submitting.current = false;
    }
  }

  const tooBig = file ? file.size > MAX_CLOUD_UPLOAD_BYTES : false;

  return (
    <Dialog open={open} onClose={onClose} title="Añadir vídeo" description="Busca en YouTube, pega un enlace o sube un archivo tuyo.">
      <form onSubmit={onSubmit} noValidate={wantsSearch} className="space-y-5">
        <Segmented
          label="Origen"
          layoutId="add-video-tab"
          value={tab}
          onChange={(t) => {
            setTab(t);
            setError(null);
          }}
          options={[
            { value: 'youtube', label: 'YouTube' },
            { value: 'file', label: 'Subir archivo' },
          ]}
          className="w-full [&>button]:flex-1"
        />

        <AnimatePresence mode="wait" initial={false}>
          {tab === 'youtube' ? (
            <motion.div key="yt" {...slide(-1)} transition={soft} className="space-y-4">
              <Field
                data-autofocus
                label="Buscar o pegar enlace"
                placeholder="Ej. ILLIT Magnetic dance practice"
                type="search"
                enterKeyHint={youtubeId ? 'done' : 'search'}
                autoComplete="off"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                error={
                  /^https?:\/\//i.test(link.trim()) && !youtubeId
                    ? 'No reconocemos ese enlace de YouTube.'
                    : meta.status === 'error'
                      ? meta.message
                      : null
                }
                trailing={
                  youtubeId ? (
                    <Link2 className="mr-2.5 size-4.5 text-washi-subtle" />
                  ) : (
                    <button
                      type="button"
                      aria-label="Buscar en YouTube"
                      disabled={!wantsSearch}
                      onClick={() => void runSearch()}
                      className="mr-1 grid size-9 place-items-center rounded-[8px] text-washi-muted transition-colors hover:bg-washi/[0.07] hover:text-washi disabled:opacity-40"
                    >
                      <Search className="size-4.5" />
                    </button>
                  )
                }
              />

              {!youtubeId && search.status !== 'idle' && <SearchResults state={search} onPick={pickResult} added={alreadyAdded} />}

              {existing && (
                <div role="status" className="flex items-center gap-3 rounded-[12px] border border-kin-300/40 bg-kin-300/[0.07] px-3.5 py-3 text-[13px] text-kin-200">
                  <span className="min-w-0 flex-1">Este vídeo ya está en la biblioteca.</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      onClose();
                      navigate(`/v/${existing.id}`);
                    }}
                  >
                    Abrir
                  </Button>
                </div>
              )}

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
                    ? 'Pesa más de 50 MB: se guarda solo en este dispositivo. El resto del grupo podrá vincular su propia copia del archivo.'
                    : 'Se sube a la nube del grupo y también queda guardado en este dispositivo.'}
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
          {wantsSearch ? (
            <Button type="submit" loading={search.status === 'loading'}>
              <Search className="size-4" /> Buscar
            </Button>
          ) : (
            <Button type="submit" disabled={!canSubmit} loading={createVideo.isPending}>
              {createVideo.isPending && tab === 'file' ? 'Guardando…' : 'Añadir y abrir'}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}

/** Search hits, credited to YouTube as its API policies ask. */
function SearchResults({
  state,
  onPick,
  added,
}: {
  state: SearchState;
  onPick: (item: SearchItem) => void;
  added: Set<string | null>;
}) {
  return (
    <div className="rounded-[12px] border border-line bg-sumi-950/50">
      <p className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-xs text-washi-subtle">
        <Youtube className="size-4 text-shu-400" /> Resultados de YouTube
      </p>
      {state.status === 'loading' && (
        <ul className="space-y-1 p-1.5" aria-busy>
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3 p-1.5">
              <div className="skeleton aspect-video w-28 shrink-0 rounded-[8px]" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3.5 w-4/5 rounded-full" />
                <div className="skeleton h-3 w-1/2 rounded-full" />
              </div>
            </li>
          ))}
        </ul>
      )}
      {state.status === 'error' && <p className="px-3 py-4 text-sm text-washi-muted">{state.message}</p>}
      {state.status === 'ok' && state.items.length === 0 && (
        <p className="px-3 py-4 text-sm text-washi-muted">Sin resultados. Prueba con otras palabras.</p>
      )}
      {state.status === 'ok' && state.items.length > 0 && (
        <ul className="max-h-[min(46dvh,360px)] space-y-0.5 overflow-y-auto overscroll-contain p-1.5">
          {state.items.map((item, i) => (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...soft, delay: Math.min(i, 8) * 0.03 }}
            >
              <button
                type="button"
                onClick={() => onPick(item)}
                className="flex w-full items-center gap-3 rounded-[10px] p-1.5 text-left transition-colors hover:bg-washi/[0.06]"
              >
                <span className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-[8px] bg-sumi-800">
                  <img src={item.thumbnail} alt="" loading="lazy" className="size-full object-cover" />
                  {item.duration != null && (
                    <span className="tabular absolute bottom-1 right-1 rounded-[4px] bg-black/80 px-1 font-mono text-[10px] text-washi">
                      {formatDuration(item.duration)}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-medium text-washi">{item.title}</span>
                  {added.has(item.id) && (
                    <span className="mt-1 inline-block rounded-[4px] bg-kin-300/15 px-1.5 text-[11px] font-medium text-kin-200">
                      Ya en la biblioteca
                    </span>
                  )}
                  <span className="mt-0.5 block truncate text-xs text-washi-muted">{item.channel}</span>
                </span>
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
