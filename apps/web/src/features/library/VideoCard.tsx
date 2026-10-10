import { formatDuration } from '@coverscape/shared';
import { motion } from 'motion/react';
import { Film, HardDrive, Layers, Play, Trash2, Youtube } from 'lucide-react';
import { Link } from 'react-router';
import type { VideoWithClipCount } from '@/data/videos';
import { cn } from '@/lib/cn';
import { easeOutExpo, fadeUpCapped, jelly } from '@/lib/motion';

/** Cards cascade in, but only the first 8 wait: the rest of a long library appears with the 8th. */
const cardIn = fadeUpCapped(0.04, 8);

interface VideoCardProps {
  video: VideoWithClipCount;
  onDelete: (video: VideoWithClipCount) => void;
  featured?: boolean;
  /** Position in the grid; drives the (capped) entrance cascade. */
  index?: number;
  className?: string;
}

export function VideoCard({ video, onDelete, featured = false, index = 0, className }: VideoCardProps) {
  const clipCount = video.clips[0]?.count ?? 0;

  return (
    <motion.article
      layout
      variants={cardIn}
      custom={index}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.18 } }}
      whileHover="hover"
      className={cn('group relative', className)}
    >
      <Link
        to={`/v/${video.id}`}
        className={cn(
          '-m-2 flex h-full rounded-[14px] p-2 transition-colors duration-300 hover:bg-washi/[0.04]',
          // Phones: compact rows (thumb + caption) for everything but the featured video.
          featured ? 'flex-col' : 'flex-row items-center gap-3 sm:flex-col sm:items-stretch sm:gap-0',
        )}
        aria-label={`Abrir ${video.title}`}
      >
        <div className={cn('relative aspect-video overflow-hidden rounded-[10px] bg-sumi-950 shadow-[0_0_0_1px_rgb(243_236_223/0.14),0_0_0_4px_var(--color-sumi-850),0_0_0_5px_var(--color-rule),0_14px_28px_-16px_rgb(0_0_0/0.9)]', !featured && 'w-36 shrink-0 sm:w-auto')}>
          {video.thumbnail_url ? (
            <motion.img
              src={video.thumbnail_url}
              alt=""
              // The featured thumbnail is the library's LCP image: fetch it first; the rest wait for the viewport.
              loading={featured ? 'eager' : 'lazy'}
              fetchPriority={featured ? 'high' : 'auto'}
              decoding="async"
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
        <div className={cn('flex min-w-0 flex-1 items-end justify-between gap-3 px-1', featured ? 'pt-5' : 'sm:pt-4')}>
          <div className="min-w-0">
            <h3
              className={cn(
                'line-clamp-2 font-display font-bold leading-snug text-washi',
                featured ? 'text-[21px] sm:text-[26px]' : 'text-[16px] sm:text-[17px]',
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
        className="absolute right-3 top-3 grid size-9 place-items-center rounded-[8px] bg-sumi-950/85 text-washi-muted hover:text-enji-300 max-sm:opacity-100"
      >
        <Trash2 className="size-4" />
      </motion.button>
    </motion.article>
  );
}

export function VideoCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('overflow-hidden', className)}>
      <div className="skeleton aspect-video rounded-[10px]" />
      <div className="space-y-2 px-1 pt-4">
        <div className="skeleton h-4 w-3/4 rounded-full" />
        <div className="skeleton h-3 w-1/2 rounded-full" />
      </div>
    </div>
  );
}
