import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Plus, Search, WifiOff } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Page, useShell } from '@/components/AppShell';
import { Seal } from '@/components/Seal';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { useQuickClips, type ClipWithVideo } from '@/data/clips';
import { useDeleteVideo, useVideos, type VideoWithClipCount } from '@/data/videos';
import { cn } from '@/lib/cn';
import { byRecentlyOpened, readRecent } from '@/lib/recent';
import { fadeUp } from '@/lib/motion';
import { prefetchStudio } from '@/lib/prefetch';
import { friendlyError } from '@/lib/supabase';
import { useCrew } from '@/providers/CrewProvider';
import { useToast } from '@/providers/ToastProvider';
import { NextEventBanner } from '@/features/events/NextEventBanner';
import { PinnedClips } from './PinnedClips';
import { VideoCard, VideoCardSkeleton } from './VideoCard';

/** Stable empty list, so the memoised row doesn't re-render on every keystroke while clips load or fail. */
const NO_CLIPS: ClipWithVideo[] = [];

/**
 * One framed sheet: search → quick-access pendants → library grid, divided by gold rules.
 * The sheet always sits inside a page margin (smaller on phones) so its frame never touches the screen edge.
 */
export function LibraryPage() {
  const { activeCrew } = useCrew();
  const { openAddVideo } = useShell();
  const videos = useVideos(activeCrew?.id);
  const quick = useQuickClips(activeCrew?.id);
  const deleteVideo = useDeleteVideo();
  const toast = useToast();
  const [pendingDelete, setPendingDelete] = useState<VideoWithClipCount | null>(null);
  const closeDelete = useCallback(() => setPendingDelete(null), []);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  // Opening a video is the next step: warm the studio chunk and the YouTube API while the phone is idle.
  useEffect(() => prefetchStudio(), []);

  // Read once per visit: the video you opened last leads the library (it becomes the big card).
  const [recent] = useState(readRecent);
  const filtered = useMemo(() => {
    const list = byRecentlyOpened(videos.data ?? [], recent);
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((v) => `${v.title} ${v.artist ?? ''}`.toLowerCase().includes(q));
  }, [videos.data, deferredQuery, recent]);

  const total = videos.data?.length ?? 0;
  // A failed or paused (offline) first load is not an empty library: say so and offer a retry.
  const videosFailed = !videos.data && (videos.isError || videos.fetchStatus === 'paused');
  const quickFailed = !quick.data && (quick.isError || quick.fetchStatus === 'paused');

  // The dialog keeps showing the last video while it animates out, instead of collapsing to “” and 0 clips.
  const shownDelete = useRef<VideoWithClipCount | null>(null);
  if (pendingDelete) shownDelete.current = pendingDelete;
  const deleteTarget = pendingDelete ?? shownDelete.current;
  // Synchronous lock: a double tap lands before `isPending` re-renders the button as loading.
  const deleting = useRef(false);

  async function confirmDelete() {
    if (!pendingDelete || deleting.current) return;
    deleting.current = true;
    try {
      await deleteVideo.mutateAsync(pendingDelete);
      toast('Vídeo eliminado', 'success');
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      deleting.current = false;
      setPendingDelete(null);
    }
  }

  return (
    <Page className="px-2.5 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-[1500px] rounded-[10px] sm:rounded-[12px]">
        {/* Just the search: the app name is already in the top bar, and every pixel goes to the videos. */}
        <h1 className="sr-only">Biblioteca</h1>
        {/* F16 · Countdown to the nearest event (nothing without one). */}
        <NextEventBanner />
        {total > 0 && (
          <header className="px-4 pb-1 pt-4 sm:px-9 sm:pt-6">
            <label className="well flex h-11 w-full items-center gap-2 rounded-[10px] px-3.5 focus-within:border-kin-300/70">
              <Search className="size-4 text-washi-subtle" />
              <span className="sr-only">Buscar</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar canción o artista"
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
          </header>
        )}

        <section aria-labelledby="quick-title" className="sep-t px-5 py-7 sm:px-9">
          <SectionTitle id="quick-title" glyph="札">
            Acceso rápido
          </SectionTitle>
          <div className="mb-4 mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-[13px] text-washi-subtle">Fijados primero · toca uno y empieza a repetir</p>
          </div>
          {quickFailed ? (
            <LoadError compact query={quick} what="el acceso rápido" />
          ) : quick.isPending ? (
            <div className="flex gap-3">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="skeleton h-[188px] w-[138px] rounded-[10px]" />
              ))}
            </div>
          ) : (
            <PinnedClips clips={quick.data ?? NO_CLIPS} />
          )}
        </section>

        <section aria-labelledby="library-title" className="sep-t px-5 pb-9 pt-7 sm:px-9">
          <SectionTitle id="library-title" glyph="書庫" className="mb-5">
            Biblioteca
          </SectionTitle>

          {videosFailed ? (
            <LoadError query={videos} what="la biblioteca" />
          ) : videos.isPending ? (
            <div className="grid gap-x-5 gap-y-7 sm:grid-cols-2 xl:grid-cols-4">
              <VideoCardSkeleton className="sm:col-span-2 xl:row-span-2" />
              {Array.from({ length: 4 }, (_, i) => (
                <VideoCardSkeleton key={i} />
              ))}
            </div>
          ) : total === 0 ? (
            <EmptyLibrary onAdd={openAddVideo} />
          ) : (
            // No staggerChildren here: each card delays itself by index (capped) via its own variants.
            <motion.div
              initial="hidden"
              animate="show"
              className="grid grid-flow-dense gap-x-5 gap-y-7 sm:grid-cols-2 xl:grid-cols-4"
            >
              <AnimatePresence mode="popLayout">
                {filtered.map((video, index) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    onDelete={setPendingDelete}
                    featured={index === 0 && !deferredQuery}
                    index={index}
                    className={index === 0 && !deferredQuery ? 'sm:col-span-2 xl:row-span-2' : undefined}
                  />
                ))}
              </AnimatePresence>
              {filtered.length === 0 && (
                <p className="col-span-full py-10 text-center text-washi-muted">Nada coincide con “{query}”.</p>
              )}
            </motion.div>
          )}
        </section>
      </div>

      <Dialog
        open={pendingDelete != null}
        onClose={closeDelete}
        busy={deleteVideo.isPending}
        hideClose
        title="¿Eliminar vídeo?"
        description={
          <>
            Se borrarán <span className="font-medium text-washi">“{deleteTarget?.title}”</span> y sus{' '}
            {deleteTarget?.clips[0]?.count ?? 0} clips para todo el grupo.
          </>
        }
        size="sm"
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={deleteVideo.isPending} onClick={closeDelete}>
            Cancelar
          </Button>
          <Button variant="danger" loading={deleteVideo.isPending} onClick={confirmDelete}>
            Eliminar
          </Button>
        </div>
      </Dialog>
    </Page>
  );
}

/** Load failure (or no connection) with a retry; the query refetches by itself once back online. */
function LoadError({
  query,
  what,
  compact = false,
}: {
  query: { isFetching: boolean; fetchStatus: string; refetch: () => Promise<unknown> };
  what: string;
  compact?: boolean;
}) {
  const offline = query.fetchStatus === 'paused' || !navigator.onLine;
  const Icon = offline ? WifiOff : AlertTriangle;
  return (
    <div role="alert" className={cn('flex flex-col items-center text-center', compact ? 'py-4' : 'px-6 py-14')}>
      <Icon className={cn('size-8', offline ? 'text-washi-muted' : 'text-enji-300')} />
      <p className={cn('mt-3 font-display font-bold', compact ? 'text-lg' : 'text-2xl')}>
        {offline ? 'Sin conexión' : `No pudimos cargar ${what}`}
      </p>
      <p className="mt-1.5 max-w-[46ch] text-sm text-washi-muted">
        {offline ? 'Se cargará en cuanto vuelva la conexión.' : 'Revisa la conexión e inténtalo de nuevo.'}
      </p>
      <Button size={compact ? 'sm' : 'md'} variant="secondary" className="mt-4" loading={query.isFetching} onClick={() => void query.refetch()}>
        Reintentar
      </Button>
    </div>
  );
}

function EmptyLibrary({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex flex-col items-center px-6 py-14 text-center">
      <Seal glyph="舞" size={72} stamp />
      <h3 className="mt-6 font-display text-[28px] font-bold leading-tight">Empieza con vuestra próxima cover</h3>
      <p className="mt-3 max-w-[46ch] text-washi-muted">
        Pega el enlace del dance practice o sube el vídeo. Luego marca las partes difíciles y guárdalas como clips para todo
        el grupo.
      </p>
      <Button size="lg" className="mt-7" onClick={onAdd}>
        <Plus className="size-5" /> Añadir el primer vídeo
      </Button>
    </motion.div>
  );
}
