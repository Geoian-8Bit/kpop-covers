import { formatDuration } from '@coverscape/shared';
import { motion } from 'motion/react';
import { Film, HardDrive, Layers, Play, Trash2, Youtube } from 'lucide-react';
import { Link } from 'react-router';
import type { VideoWithClipCount } from '@/data/videos';
import { cn } from '@/lib/cn';
import { easeOutExpo, fadeUp, jelly } from '@/lib/motion';

interface VideoCardProps {
  video: VideoWithClipCount;
  onDelete: (video: VideoWithClipCount) => void;
  featured?: boolean;
  className?: string;
}

export function VideoCard({ video, onDelete, featured = false, className }: VideoCardProps) {
  const clipCount = video.clips[0]?.count ?? 0;

  return (
    <motion.article
      layout
      variants={fadeUp}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.18 } }}
      whileHover="hover"
      className={cn('group relative', className)}
    >
      <Link
        to={`/v/${video.id}`}
        className="paper flex h-full flex-col overflow-hidden rounded-[16px] transition-colors duration-300 group-hover:border-line-strong"
        aria-label={`Abrir ${video.title}`}
      >
        <div className={cn('relative overflow-hidden bg-sumi-950', featured ? 'aspect-video lg:aspect-auto lg:flex-1' : 'aspect-video')}>
          {video.thumbnail_url ? (
            <motion.img
              src={video.thumbnail_url}
              alt=""
              loading="lazy"
              variants={{ hover: { scale: 1.04 } }}
              transition={{ duration: 0.7, ease: easeOutExpo }}
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <div className="seigaiha grid size-full place-items-center">
              <Film className="size-8 text-washi-subtle" />
            </div>
          )}
          <motion.span
            initial={{ opacity: 0, scale: 0.7 }}
            variants={{ hover: { opacity: 1, scale: 1 } }}
            transition={jelly}
            className={cn(
              'absolute inset-0 m-auto grid place-items-center rounded-full bg-washi text-sumi-900 shadow-[0_10px_24px_-10px_rgb(0_0_0/0.9)]',
              featured ? 'size-16' : 'size-12',
            )}
          >
            <Play className={cn('ml-0.5 fill-sumi-900', featured ? 'size-6' : 'size-5')} />
          </motion.span>
          <span className="tabular absolute bottom-2.5 right-2.5 rounded-[6px] bg-sumi-950/85 px-2 py-0.5 font-mono text-[11px] font-medium text-washi">
            {formatDuration(video.duration_seconds)}
          </span>
        </div>
        <div className={cn('flex items-end justify-between gap-3', featured ? 'p-5' : 'p-4')}>
          <div className="min-w-0">
            <h3
              className={cn(
                'line-clamp-2 font-display font-bold leading-snug text-washi',
                featured ? 'text-[26px]' : 'text-[17px]',
              )}
            >
              {video.title}
            </h3>
            <p className="mt-1 flex items-center gap-1.5 truncate text-[13px] text-washi-muted">
              {video.source === 'youtube' ? (
                <Youtube className="size-3.5 shrink-0 text-enji-300" aria-label="YouTube" />
              ) : (
                <HardDrive className="size-3.5 shrink-0 text-kin-300" aria-label="Archivo" />
              )}
              <span className="truncate">{video.artist || 'Artista sin especificar'}</span>
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-[8px] border border-line px-2 py-1 text-xs font-medium text-washi-muted">
            <Layers className="size-3.5 text-ai-300" />
            {clipCount}
          </span>
        </div>
      </Link>
      <motion.button
        type="button"
        aria-label={`Eliminar ${video.title}`}
        onClick={() => onDelete(video)}
        initial={{ opacity: 0, scale: 0.7 }}
        variants={{ hover: { opacity: 1, scale: 1 } }}
        whileFocus={{ opacity: 1, scale: 1 }}
        whileTap={{ scale: 0.85 }}
        transition={jelly}
        className="absolute right-2.5 top-2.5 grid size-9 place-items-center rounded-[8px] bg-sumi-950/85 text-washi-muted hover:text-enji-300 max-sm:opacity-100"
      >
        <Trash2 className="size-4" />
      </motion.button>
    </motion.article>
  );
}

export function VideoCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('paper overflow-hidden rounded-[16px]', className)}>
      <div className="skeleton aspect-video" />
      <div className="space-y-2 p-4">
        <div className="skeleton h-4 w-3/4 rounded-full" />
        <div className="skeleton h-3 w-1/2 rounded-full" />
      </div>
    </div>
  );
}
