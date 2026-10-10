import { AnimatePresence, motion } from 'motion/react';
import { Plus, Search, Users } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { Page } from '@/components/AppShell';
import { Seal } from '@/components/Seal';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { WaveArt } from '@/components/WaveArt';
import { useQuickClips } from '@/data/clips';
import { useDeleteVideo, useVideos, type VideoWithClipCount } from '@/data/videos';
import { CopyCodeButton, CrewDialog, useCrewMembers } from '@/features/crew/CrewDialog';
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
  const members = useCrewMembers(activeCrew?.id);
  const deleteVideo = useDeleteVideo();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [crewOpen, setCrewOpen] = useState(false);
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
      {/* Bento head: title · crew seal card · quick clips */}
      <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="grid gap-4 lg:grid-cols-12">
        <motion.section variants={fadeUp} className="paper relative flex flex-col justify-between gap-6 overflow-hidden rounded-[18px] p-6 sm:p-8 lg:col-span-8">
          <span
            aria-hidden
            className="pointer-events-none absolute right-6 top-6 hidden font-display text-[15px] font-bold leading-[1.2] tracking-[0.2em] text-washi-subtle/70 [writing-mode:vertical-rl] sm:block"
          >
            稽古帳
          </span>
          <div className="pr-10">
            <p className="text-sm text-washi-muted">{profile ? `Hola, ${profile.display_name}.` : 'Hola.'} Este es el cuaderno de ensayo de</p>
            <motion.h1
              variants={inkReveal}
              className="mt-1 font-display text-[clamp(2.4rem,5.6vw,4.4rem)] font-extrabold leading-[1] tracking-[-0.02em]"
            >
              {activeCrew?.name}
            </motion.h1>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <dl className="flex gap-8">
              <div>
                <dt className="text-[13px] text-washi-subtle">Vídeos</dt>
                <dd className="tabular font-display text-3xl font-bold">{total}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-washi-subtle">Clips</dt>
                <dd className="tabular font-display text-3xl font-bold">{clipTotal}</dd>
              </div>
            </dl>
            <Button size="lg" onClick={() => setAdding(true)}>
              <Plus className="size-5" /> Añadir vídeo
            </Button>
          </div>
        </motion.section>

        <motion.section variants={fadeUp} className="paper flex flex-col gap-5 rounded-[18px] p-6 lg:col-span-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">La crew</h2>
              <button
                type="button"
                onClick={() => setCrewOpen(true)}
                className="mt-1 flex items-center gap-1.5 text-sm text-washi-muted underline-offset-4 hover:text-washi hover:underline"
              >
                <Users className="size-4 text-ai-300" />
                {members.data ? `${members.data.length} ${members.data.length === 1 ? 'miembro' : 'miembros'}` : 'Miembros'}
              </button>
            </div>
            <Seal glyph="組" size={52} />
          </div>
          {activeCrew && (
            <div className="mt-auto rounded-[12px] border border-line bg-sumi-950/50 p-4">
              <p className="text-[13px] text-washi-muted">Código para invitar</p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="tabular font-mono text-2xl font-semibold tracking-[0.22em] text-kin-200">{activeCrew.invite_code}</span>
                <CopyCodeButton code={activeCrew.invite_code} />
              </div>
            </div>
          )}
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

      <section aria-labelledby="library-title" className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="library-title" className="font-display text-2xl font-bold">
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
            <VideoCardSkeleton className="lg:col-span-2 lg:row-span-2" />
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
              <p className="col-span-full py-10 text-center text-washi-muted">Nada coincide con “{query}”.</p>
            )}
          </motion.div>
        )}
      </section>

      <AddVideoDialog open={adding} onClose={() => setAdding(false)} />
      <CrewDialog open={crewOpen} onClose={() => setCrewOpen(false)} />

      <Dialog
        open={pendingDelete != null}
        onClose={() => setPendingDelete(null)}
        title="¿Eliminar vídeo?"
        description={
          <>
            Se borrarán <span className="font-medium text-washi">“{pendingDelete?.title}”</span> y sus{' '}
            {pendingDelete?.clips[0]?.count ?? 0} clips para toda la crew.
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
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="paper grid overflow-hidden rounded-[18px] md:grid-cols-[1fr_1.1fr]">
      <WaveArt cover className="h-56 w-full md:h-full" />
      <div className="flex flex-col justify-center p-7 sm:p-10">
        <h3 className="font-display text-[28px] font-bold leading-tight">Empieza con vuestra próxima cover</h3>
        <p className="mt-3 max-w-[46ch] text-washi-muted">
          Pega el enlace del dance practice o sube el vídeo. Luego marca las partes difíciles y guárdalas como clips para
          toda la crew.
        </p>
        <Button size="lg" className="mt-7 self-start" onClick={onAdd}>
          <Plus className="size-5" /> Añadir el primer vídeo
        </Button>
      </div>
    </motion.div>
  );
}
