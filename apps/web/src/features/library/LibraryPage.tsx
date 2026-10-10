import { AnimatePresence, motion } from 'motion/react';
import { Plus, Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { Page } from '@/components/AppShell';
import { Seal } from '@/components/Seal';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useQuickClips } from '@/data/clips';
import { useDeleteVideo, useVideos, type VideoWithClipCount } from '@/data/videos';
import { fadeUp, inkReveal, stagger } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { useCrew } from '@/providers/CrewProvider';
import { useToast } from '@/providers/ToastProvider';
import { AddVideoDialog } from './AddVideoDialog';
import { PinnedClips } from './PinnedClips';
import { VideoCard, VideoCardSkeleton } from './VideoCard';

export function LibraryPage() {
  const { activeCrew, profile } = useCrew();
  const videos = useVideos(activeCrew?.id);
  const quick = useQuickClips(activeCrew?.id);
  const deleteVideo = useDeleteVideo();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<VideoWithClipCount | null>(null);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const list = videos.data ?? [];
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((v) => `${v.title} ${v.artist ?? ''}`.toLowerCase().includes(q));
  }, [videos.data, deferredQuery]);

  const total = videos.data?.length ?? 0;
  const clipTotal = (videos.data ?? []).reduce((sum, v) => sum + (v.clips[0]?.count ?? 0), 0);

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
    <Page className="mx-auto max-w-[1440px] px-4 pb-24 pt-5 sm:px-6">
      <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="grid gap-4 lg:grid-cols-12">
        <motion.section
          variants={fadeUp}
          className="paper relative flex flex-col justify-between gap-8 overflow-hidden rounded-[18px] p-6 sm:p-8 lg:col-span-12"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute right-7 top-7 hidden font-display text-[15px] font-bold leading-[1.2] tracking-[0.2em] text-washi-subtle [writing-mode:vertical-rl] sm:block"
          >
            稽古帳
          </span>
          <div className="pr-10">
            <p className="text-[15px] text-washi-muted">{profile ? `Hola, ${profile.display_name}.` : 'Hola.'}</p>
            <motion.h1
              variants={inkReveal}
              className="mt-1 font-display text-[clamp(2.4rem,5.6vw,4.2rem)] font-extrabold leading-[1] tracking-[-0.02em]"
            >
              Cuaderno de ensayo
            </motion.h1>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <p className="tabular text-washi-muted">
              <span className="font-display text-2xl font-bold text-washi">{total}</span> {total === 1 ? 'vídeo' : 'vídeos'}
              <span className="mx-3 text-washi-subtle">·</span>
              <span className="font-display text-2xl font-bold text-washi">{clipTotal}</span> clips
            </p>
            <Button size="lg" onClick={() => setAdding(true)}>
              <Plus className="size-5" /> Añadir vídeo
            </Button>
          </div>
        </motion.section>

        <motion.section variants={fadeUp} aria-labelledby="quick-title" className="paper rounded-[18px] p-5 sm:p-6 lg:col-span-12">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 id="quick-title" className="font-display text-xl font-bold">
              Acceso rápido
            </h2>
            <p className="hidden text-[13px] text-washi-subtle sm:block">Fijados primero · toca uno y empieza a repetir</p>
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
        </motion.section>
      </motion.div>

      <section aria-labelledby="library-title" className="mt-4">
        <div className="paper mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] px-5 py-4 sm:px-6">
          <h2 id="library-title" className="font-display text-xl font-bold">
            Biblioteca
          </h2>
          {total > 4 && (
            <label className="flex h-11 w-full items-center gap-2 rounded-[10px] border border-line bg-sumi-950/50 px-3.5 focus-within:border-kin-300/60 sm:w-72">
              <Search className="size-4 text-washi-subtle" />
              <span className="sr-only">Buscar</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar canción o artista"
                className="h-full flex-1 bg-transparent text-sm outline-none"
              />
            </label>
          )}
        </div>

        {videos.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <VideoCardSkeleton className="sm:col-span-2 lg:row-span-2" />
            {Array.from({ length: 4 }, (_, i) => (
              <VideoCardSkeleton key={i} />
            ))}
          </div>
        ) : total === 0 ? (
          <EmptyLibrary onAdd={() => setAdding(true)} />
        ) : (
          <motion.div
            variants={stagger(0.04)}
            initial="hidden"
            animate="show"
            className="grid grid-flow-dense gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <AnimatePresence mode="popLayout">
              {filtered.map((video, index) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  onDelete={setPendingDelete}
                  featured={index === 0 && !deferredQuery}
                  className={index === 0 && !deferredQuery ? 'sm:col-span-2 lg:row-span-2' : undefined}
                />
              ))}
            </AnimatePresence>
            {filtered.length === 0 && (
              <p className="paper col-span-full rounded-[18px] py-10 text-center text-washi-muted">Nada coincide con “{query}”.</p>
            )}
          </motion.div>
        )}
      </section>

      <AddVideoDialog open={adding} onClose={() => setAdding(false)} />

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
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="paper flex flex-col items-center rounded-[18px] px-6 py-16 text-center">
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
