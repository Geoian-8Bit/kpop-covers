import { formatBytes, formatDuration, MAX_CLOUD_UPLOAD_BYTES, similarTitles } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CloudUpload, HardDrive, Search, UploadCloud, X } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { YouTubePicker, type YouTubePick, type YouTubePickerHandle } from '@/components/YouTubePicker';
import { searchQueryOf } from '@/components/youTubePickerRules';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { uploadFailureMessage, useCreateVideo, useVideos } from '@/data/videos';
import { cn } from '@/lib/cn';
import { probeMediaFile } from '@/lib/localVideos';
import { jelly, soft } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { useCrew } from '@/providers/CrewProvider';
import { useToast } from '@/providers/ToastProvider';
import { editMeta, EMPTY_META, shownMeta, suggestMeta, type MetaState } from './addVideoRules';

type Tab = 'youtube' | 'file';

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
  // Only while open: once mounted the dialog stays (for its exit animation), even inside the studio.
  const library = useVideos(activeCrew?.id, { enabled: open });
  /** Synchronous lock: a fast double tap must not create the video twice before React re-renders. */
  const submitting = useRef(false);
  const navigate = useNavigate();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('youtube');
  const [link, setLink] = useState('');
  /** The YouTube video chosen in the shared picker (a search hit or a pasted link). */
  const [pick, setPick] = useState<YouTubePick | null>(null);
  const [searching, setSearching] = useState(false);
  const picker = useRef<YouTubePickerHandle>(null);
  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  /** F1: YouTube entries (without a file yet) whose title looks like this file's name. */
  const sameSong = file
    ? similarTitles(
        file.name,
        (library.data ?? []).filter((v) => v.source === 'youtube' && !v.file_name),
      )
    : [];
  /** Title and artist: each tab's own suggestion, or what was typed (see `addVideoRules`). */
  const [meta, setMeta] = useState<MetaState>(EMPTY_META);
  const { title, artist } = shownMeta(meta, tab);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Bumped on every pick/remove/close so a slow probe for an old file is ignored. */
  const probeToken = useRef(0);

  const youtubeId = pick?.youtubeId ?? null;

  useEffect(() => {
    if (!open) {
      probeToken.current++;
      setLink('');
      setPick(null);
      setFile(null);
      setProbe(null);
      setMeta(EMPTY_META);
      setError(null);
    }
  }, [open]);

  /** A search hit, or a pasted link (first without a title, then with it once the lookup answers). */
  function onPick(next: YouTubePick) {
    setPick(next);
    setMeta((m) => suggestMeta(m, 'youtube', { title: next.title, artist: next.channel }));
  }

  const wantsSearch = tab === 'youtube' && searchQueryOf(link) != null;

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
    setMeta((m) => suggestMeta(m, 'file', { title: cleanFileTitle(next.name), artist: '' }));
    const result = await probeMediaFile(next);
    if (token === probeToken.current) setProbe(result);
  }

  function clearFile() {
    probeToken.current++;
    setFile(null);
    setProbe(null);
    setMeta((m) => suggestMeta(m, 'file', { title: '', artist: '' }));
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
    (tab === 'youtube' ? Boolean(youtubeId) : Boolean(file));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (wantsSearch) {
      picker.current?.search();
      return;
    }
    if (!activeCrew || !canSubmit || submitting.current) return;
    submitting.current = true;
    setError(null);
    try {
      const result = await createVideo.mutateAsync(
        tab === 'youtube'
          ? {
              crewId: activeCrew.id,
              title,
              artist,
              youtubeId: youtubeId!,
              // The search already knows the length: the card shows it before anyone opens the studio.
              duration: pick?.durationSeconds ?? null,
            }
          : { crewId: activeCrew.id, title, artist, file: file!, duration: probe?.duration, poster: probe?.poster },
      );
      if (result.uploadFailure) toast(uploadFailureMessage(result.uploadFailure), 'info');
      else toast('Vídeo añadido a la biblioteca', 'success');
      onClose();
      // Replace the dialog's own back-button entry: otherwise “back” from the studio lands on a stale copy of the library.
      navigate(`/v/${result.video.id}`, { replace: true });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      submitting.current = false;
    }
  }

  const tooBig = file ? file.size > MAX_CLOUD_UPLOAD_BYTES : false;

  return (
    <Dialog open={open} onClose={onClose} busy={createVideo.isPending} title="Añadir vídeo" description="Busca en YouTube, pega un enlace o sube un archivo tuyo.">
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

        {/* The YouTube tab stays mounted while «Subir archivo» is on: going back finds its results and the chosen
            video as they were (with its length and title), not a fresh lookup of the link. */}
        <motion.div
          hidden={tab !== 'youtube'}
          initial={false}
          animate={tab === 'youtube' ? slide(-1).animate : slide(-1).initial}
          transition={soft}
          className="space-y-4"
        >
          <YouTubePicker
            ref={picker}
            autoFocus={tab === 'youtube'}
            value={link}
            onValueChange={setLink}
            onPick={onPick}
            onClear={() => {
              setPick(null);
              setMeta((m) => suggestMeta(m, 'youtube', { title: '', artist: '' }));
            }}
            onSearchingChange={setSearching}
            badgeFor={(id) => (alreadyAdded.has(id) ? { label: 'Ya en la biblioteca' } : null)}
          />

          {existing && (
            <div role="status" className="flex items-center gap-3 rounded-[12px] border border-kin-300/40 bg-kin-300/[0.07] px-3.5 py-3 text-[13px] text-kin-200">
              <span className="min-w-0 flex-1">Este vídeo ya está en la biblioteca.</span>
              <Button
                size="sm"
                variant="secondary"
                className="min-h-11"
                onClick={() => {
                  onClose();
                  navigate(`/v/${existing.id}`, { replace: true });
                }}
              >
                Abrir
              </Button>
            </div>
          )}
        </motion.div>

        {/* No exit animation: the YouTube tab is already back in its place. */}
        <AnimatePresence initial={false}>
          {tab === 'file' && (
            <motion.div key="file" initial={slide(1).initial} animate={slide(1).animate} transition={soft} className="space-y-4">
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

              {/* F1: the file of a YouTube video already in the library joins that entry instead of a new, empty one. */}
              {file && sameSong.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={soft}
                  className="rounded-[12px] border border-kin-400/45 bg-sumi-950/50 p-3"
                >
                  <p className="text-[14px] font-bold text-washi">¿Es el archivo de uno de estos vídeos?</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-washi-muted">
                    Se vincula a su entrada (mismos clips, notas y tomas) en vez de crear otra vacía.
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {sameSong.map((v) => (
                      <li key={v.id}>
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          transition={jelly}
                          onClick={() => {
                            navigate(`/v/${v.id}`, { state: { linkFile: file } });
                            onClose();
                          }}
                          className="flex min-h-12 w-full items-center gap-3 rounded-[10px] bg-sumi-800 px-3 text-left hover:bg-sumi-700"
                        >
                          {v.thumbnail_url && <img src={v.thumbnail_url} alt="" className="h-9 w-16 shrink-0 rounded-[6px] object-cover" />}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-bold">{v.title}</span>
                            {v.artist && <span className="block truncate text-[12px] text-washi-subtle">{v.artist}</span>}
                          </span>
                          <span className="shrink-0 text-[12px] font-bold text-kin-300">Vincular</span>
                        </motion.button>
                      </li>
                    ))}
                  </ul>
                </motion.div>
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
              const value = e.target.value;
              setMeta((m) => editMeta(m, tab, { title: value }));
            }}
          />
          <Field
            label="Artista"
            maxLength={120}
            placeholder="Ej. ILLIT"
            value={artist}
            onChange={(e) => {
              const value = e.target.value;
              setMeta((m) => editMeta(m, tab, { artist: value }));
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
          <Button variant="ghost" onClick={onClose} disabled={createVideo.isPending}>
            Cancelar
          </Button>
          {wantsSearch ? (
            <Button type="submit" loading={searching}>
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
