import { AnimatePresence, motion } from 'motion/react';
import { Plus, Search } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Page, useShell } from '@/components/AppShell';
import { Seal } from '@/components/Seal';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { useQuickClips } from '@/data/clips';
import { useDeleteVideo, useVideos, type VideoWithClipCount } from '@/data/videos';
import { byRecentlyOpened, readRecent } from '@/lib/recent';
import { fadeUp } from '@/lib/motion';
import { prefetchStudio } from '@/lib/prefetch';
import { friendlyError } from '@/lib/supabase';
import { useCrew } from '@/providers/CrewProvider';
import { useToast } from '@/providers/ToastProvider';
import { PinnedClips } from './PinnedClips';
import { VideoCard, VideoCardSkeleton } from './VideoCard';

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

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteVideo.mutateAsync(pendingDelete);
      toast('Vídeo eliminado', 'success');
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <Page className="px-2.5 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-[1500px] rounded-[10px] sm:rounded-[12px]">
        {/* Just the search: the app name is already in the top bar, and every pixel goes to the videos. */}
        <h1 className="sr-only">Biblioteca</h1>
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
          {quick.isPending ? (
            <div className="flex gap-3">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="skeleton h-[188px] w-[138px] rounded-[10px]" />
              ))}
            </div>
          ) : (
            <PinnedClips clips={quick.data ?? []} />
          )}
        </section>

        <section aria-labelledby="library-title" className="sep-t px-5 pb-9 pt-7 sm:px-9">
          <SectionTitle id="library-title" glyph="書庫" className="mb-5">
            Biblioteca
          </SectionTitle>

          {videos.isPending ? (
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
        onClose={() => setPendingDelete(null)}
        title="¿Eliminar vídeo?"
        description={
          <>
            Se borrarán <span className="font-medium text-washi">“{pendingDelete?.title}”</span> y sus{' '}
            {pendingDelete?.clips[0]?.count ?? 0} clips para todo el grupo.
          </>
        }
        size="sm"
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setPendingDelete(null)}>
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
