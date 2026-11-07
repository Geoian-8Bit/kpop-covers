import { formatDuration, hasLinkedFile, withYouTubeThumbQuality } from '@coverscape/shared';
import { motion } from 'motion/react';
import { Film, HardDrive, Layers, Play, Trash2, Youtube } from 'lucide-react';
import { memo, useState } from 'react';
import { Link } from 'react-router';
import { guardNav } from '@/components/AppShell';
import { ButtonSkin } from '@/components/ui/ButtonSkin';
import { SwipeRow, type SwipeAction } from '@/components/ui/SwipeRow';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchClips } from '@/data/clips';
import { prefetchVideo, prefetchVideoUrl, type VideoWithClipCount } from '@/data/videos';
import { AddToBagButton } from '@/features/bags/AddToBagButton';
import { BagIcon } from '@/features/bags/BagIcon';
import { cn } from '@/lib/cn';
import { easeOutExpo, fadeUpCapped, jelly } from '@/lib/motion';
import { loadStudioPage } from '@/lib/prefetch';
import { thumbCors } from '@/lib/thumbCors';
import { useMediaQuery } from '@/lib/useMediaQuery';

/** Cards cascade in, but only the first 8 wait: the rest of a long library appears with the 8th. */
const cardIn = fadeUpCapped(0.04, 8);
/** Phone rows on a touch screen: the swipe actions replace the corner buttons (still there for keyboard and readers). */
const swipeHidden =
  'max-sm:touch:pointer-events-none max-sm:touch:opacity-0 max-sm:touch:focus-visible:pointer-events-auto max-sm:touch:focus-visible:opacity-100';

interface VideoCardProps {
  video: VideoWithClipCount;
  onDelete: (video: VideoWithClipCount) => void;
  featured?: boolean;
  /** Position in the grid; drives the (capped) entrance cascade. */
  index?: number;
  /** Glide to a new place when the list changes (only while the user filters; see LibraryPage). */
  animateLayout?: boolean;
  className?: string;
}

/**
 * Memoised: typing in the search re-renders the library, but a card only changes with its own data.
 * `layout="position"`: a filtered grid only moves cards, so they are never measured for a size change.
 * `min-w-0`: a grid item never grows past its column, whatever its caption holds (P38).
 */
export const VideoCard = memo(function VideoCard({
  video,
  onDelete,
  featured = false,
  index = 0,
  animateLayout = false,
  className,
}: VideoCardProps) {
  const clipCount = video.clips[0]?.count ?? 0;
  const wide = useMediaQuery('(min-width: 40rem)');
  const [bagOpen, setBagOpen] = useState(false);
  // Only the compact phone rows swipe (a grid card or the featured one keeps its corner buttons).
  const swipeActions: SwipeAction[] = [
    {
      key: 'bag',
      label: 'Bolsa',
      ariaLabel: `Añadir «${video.title}» a una bolsa`,
      icon: <BagIcon />,
      tone: 'accent',
      onSelect: () => setBagOpen(true),
    },
    // Same confirmation as the corner button (deleting = archiving).
    {
      key: 'delete',
      label: 'Eliminar',
      ariaLabel: `Eliminar ${video.title}`,
      icon: <Trash2 />,
      tone: 'danger',
      onSelect: () => onDelete(video),
    },
  ];
  const queryClient = useQueryClient();
  // P3 · About to open: warm the studio chunk and this video's row, clips and notes (cached ones aren't refetched).
  const warm = () => {
    void loadStudioPage().catch(() => undefined);
    prefetchVideo(queryClient, video.id);
    prefetchClips(queryClient, video.id);
    // REQ-08 · The notes module (shared with the studio) loads on demand; a hover warms it and then the notes.
    // A chunk made stale by a deploy must not raise vite:preloadError (that reloads the page): ignore it.
    void import('@/data/notes').then((m) => m.prefetchNotes(queryClient, video.id)).catch(() => undefined);
    // REQ-16 · And the cloud file's signature (REQ-15 remembers it), so the studio starts the file at once.
    prefetchVideoUrl(video.storage_path);
  };

  return (
    <motion.article
      layout={animateLayout ? 'position' : false}
      variants={cardIn}
      custom={index}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.18 } }}
      whileHover="hover"
      className={cn('group relative min-w-0', className)}
    >
      {/* The frame reaches the link's -8 px margin (so its hover wash isn't clipped); the inner box is the card's own. */}
      <SwipeRow
        actions={swipeActions}
        disabled={featured || wide}
        hint={!featured && index <= 1}
        className="-m-2 h-[calc(100%+1rem)] rounded-[14px]"
        contentClassName="h-full p-2"
      >
        <div className="relative h-full">
          <Link
            to={`/v/${video.id}`}
            onClick={guardNav}
            // A mouse warms on hover; a finger only on the press itself (a scroll sweeping over cards warms none).
            onPointerEnter={(e) => e.pointerType === 'mouse' && warm()}
            onPointerDown={(e) => e.pointerType !== 'mouse' && warm()}
            onFocus={warm}
            className={cn(
              '-m-2 flex h-full rounded-[14px] p-2 transition-[background-color,scale] duration-200 hover:bg-washi/[0.04] active:scale-[0.98] active:bg-washi/[0.06]',
              // Phones: compact rows (thumb + caption) for everything but the featured video.
              // Rows align to the top so the thumbnail's corner buttons stay on it when a long title wraps.
              featured ? 'flex-col' : 'flex-row items-start gap-3 sm:flex-col sm:items-stretch sm:gap-0',
            )}
          >
            <div
              className={cn(
                'relative aspect-video overflow-hidden rounded-[10px] bg-sumi-950 shadow-[0_0_0_1px_rgb(243_236_223/0.14),0_0_0_4px_var(--color-sumi-850),0_0_0_5px_var(--color-rule),0_14px_28px_-16px_rgb(0_0_0/0.9)]',
                !featured && 'w-36 shrink-0 sm:w-auto',
              )}
            >
              {video.thumbnail_url ? (
                <motion.img
                  // P11 · Small cards (a 144 px row on phones, a quarter column on desktop) take YouTube's 320 px
                  // thumbnail; the featured one keeps the large one.
                  src={
                    featured ? video.thumbnail_url : withYouTubeThumbQuality(video.thumbnail_url, 'mqdefault')
                  }
                  crossOrigin={thumbCors(
                    featured
                      ? video.thumbnail_url
                      : withYouTubeThumbQuality(video.thumbnail_url, 'mqdefault'),
                  )}
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
            <div
              className={cn(
                'flex min-w-0 flex-1 items-end justify-between gap-3 px-1',
                featured ? 'pt-5' : 'sm:pt-4',
              )}
            >
              <div className="@container min-w-0 flex-1">
                <h3
                  title={video.title}
                  className={cn(
                    'line-clamp-2 font-display font-bold leading-snug text-washi [overflow-wrap:anywhere]',
                    featured ? 'text-[19px] sm:text-[26px]' : 'text-[15px] sm:text-[17px]',
                  )}
                >
                  {video.title}
                </h3>
                {/* P38 · One line: the artist ends in «…» (whole in `title`), «con archivo» keeps only its icon in a
                narrow column and the clip count never wraps. */}
                <p className="mt-0.5 flex items-center gap-x-2 text-[12.5px] text-washi-muted sm:mt-1 sm:text-[13px]">
                  <span title={video.artist || undefined} className="flex min-w-0 items-center gap-1.5">
                    {video.source === 'youtube' ? (
                      <Youtube className="size-3.5 shrink-0 text-enji-300" aria-label="YouTube" />
                    ) : (
                      <HardDrive className="size-3.5 shrink-0 text-kin-300" aria-label="Archivo" />
                    )}
                    <span className="truncate">{video.artist || 'Artista sin especificar'}</span>
                  </span>
                  {hasLinkedFile(video) && (
                    <span
                      title="Con archivo"
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-kin-300/15 px-2 py-0.5 text-[11px] font-bold text-kin-300"
                    >
                      <HardDrive className="size-3 shrink-0" aria-hidden />
                      {/* Too narrow for the words (phone rows): the icon stays, the words go to the screen reader. */}
                      <span className="whitespace-nowrap @max-[16rem]:sr-only">con archivo</span>
                    </span>
                  )}
                  {/* Phone rows: the clip count joins this line so the title keeps the column's width. */}
                  {!featured && <ClipCount count={clipCount} className="sm:hidden" />}
                </p>
              </div>
              <ClipCount count={clipCount} className={featured ? undefined : 'hidden sm:flex'} />
            </div>
          </Link>
          <motion.button
            type="button"
            aria-label={`Eliminar ${video.title}`}
            onClick={() => onDelete(video)}
            whileTap={{ scale: 0.85, rotate: -8 }}
            transition={jelly}
            // Visibility lives in CSS, not in motion's inline styles: always shown on touch screens and phones;
            // with a mouse it appears on card hover or keyboard focus.
            className={cn(
              'absolute size-10 drop-shadow-[0_6px_12px_rgb(0_0_0/0.7)] transition-[opacity,scale] duration-200',
              // Always the thumbnail's top-right corner (phone rows: 144 px thumb − 36 px button − 6 px), so the
              // title keeps the text column's whole width and wraps instead of being cut.
              featured
                ? 'right-3 top-3'
                : 'left-[102px] top-1.5 size-9 sm:left-auto sm:right-3 sm:top-3 sm:size-10',
              'sm:[@media(hover:hover)]:scale-75 sm:[@media(hover:hover)]:opacity-0',
              'group-hover:scale-100 group-hover:opacity-100 focus-visible:scale-100 focus-visible:opacity-100',
              !featured && swipeHidden,
            )}
          >
            <ButtonSkin kind="delete" />
          </motion.button>
          {/* F13 · «Añadir a una bolsa», on the thumbnail's top-left corner; shown like the delete button. */}
          <AddToBagButton
            look="crest"
            target={{ kind: 'songs', videoId: video.id, label: video.title }}
            open={bagOpen}
            onOpenChange={setBagOpen}
            className={cn(
              'absolute size-9 transition-[opacity,scale] duration-200',
              featured ? 'left-3 top-3 size-10' : 'left-1.5 top-1.5 sm:left-3 sm:top-3',
              'sm:[@media(hover:hover)]:scale-75 sm:[@media(hover:hover)]:opacity-0',
              'group-hover:scale-100 group-hover:opacity-100 focus-visible:scale-100 focus-visible:opacity-100',
              !featured && swipeHidden,
            )}
          />
        </div>
      </SwipeRow>
    </motion.article>
  );
});

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

function ClipCount({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-[8px] border border-line px-2 py-1 text-xs font-medium text-washi-muted',
        className,
      )}
    >
      <Layers className="size-3.5 text-ai-300" />
      {count}
    </span>
  );
}
