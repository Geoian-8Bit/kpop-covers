import { formatSpeed, formatTime } from '@coverscape/shared';
import { motion } from 'motion/react';
import { FlipHorizontal2, Pin } from 'lucide-react';
import { Link } from 'react-router';
import { CLIP_SWATCH, type ClipWithVideo } from '@/data/clips';
import { cn } from '@/lib/cn';
import { fadeUp, jelly, stagger } from '@/lib/motion';

/**
 * Clips as senjafuda – the narrow paper slips pilgrims leave at temples.
 * One tap opens the studio already looping that clip.
 */
export function PinnedClips({ clips }: { clips: ClipWithVideo[] }) {
  if (clips.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-washi-muted">
        Aquí aparecerán los clips fijados y los más recientes. Marca un tramo en el estudio y pulsa <span className="font-mono text-washi">S</span>.
      </p>
    );
  }

  return (
    <motion.ul
      variants={stagger(0.04)}
      initial="hidden"
      animate="show"
      className="scrollbar-none -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 pt-1"
    >
      {clips.map((clip) => (
        <motion.li key={clip.id} variants={fadeUp} className="snap-start">
          <Link to={`/v/${clip.video_id}?clip=${clip.id}`} className="block rounded-[10px]">
            <motion.div
              whileHover={{ y: -4, rotate: -0.6 }}
              whileTap={{ scale: 0.95 }}
              transition={jelly}
              className="relative flex h-[188px] w-[138px] flex-col rounded-[10px] bg-washi px-3.5 pb-3 pt-4 text-sumi-900 shadow-[0_14px_24px_-16px_rgb(0_0_0/0.95)]"
            >
              <span className={cn('absolute inset-x-3.5 top-0 h-1.5 rounded-b-[3px]', CLIP_SWATCH[clip.color].dot)} />
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-[11px] font-medium text-sumi-600">{clip.video?.title}</span>
                {clip.is_pinned && <Pin className="size-3.5 shrink-0 fill-shu-500 text-shu-500" aria-label="Fijado" />}
              </div>
              <p className="mt-2 line-clamp-3 font-display text-[19px] font-bold leading-[1.15]">{clip.name}</p>
              <div className="mt-auto space-y-1.5">
                <p className="tabular font-mono text-[11px] font-medium text-sumi-600">
                  {formatTime(clip.start_seconds)}–{formatTime(clip.end_seconds)}
                </p>
                <div className="flex items-center gap-1.5 text-[11px] font-medium">
                  <span className="rounded-[5px] bg-sumi-900 px-1.5 py-0.5 font-mono text-washi">{formatSpeed(clip.speed)}</span>
                  {clip.mirrored && (
                    <span className="flex items-center gap-1 text-ai-600">
                      <FlipHorizontal2 className="size-3.5" /> espejo
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          </Link>
        </motion.li>
      ))}
    </motion.ul>
  );
}
