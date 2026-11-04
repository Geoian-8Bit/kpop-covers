import { clamp, formatTime, type Clip } from '@coverscape/shared';
import { motion } from 'motion/react';
import { memo } from 'react';
import { CLIP_SWATCH } from '@/data/clips';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { usePlayer } from '@/player/store';
import { LANE_GAP, LANE_H, LANE_PAD } from './timelineGeometry';

/**
 * REQ-21 · The saved clips' bars in the timeline's lane. Memoised and reading only the active clip itself, so a drag
 * of A–B (which re-renders the timeline once per frame) never redraws the bars.
 */
export const ClipLane = memo(function ClipLane({
  clips,
  duration,
  lanes,
  onClipSelect,
}: {
  clips: Clip[];
  duration: number;
  lanes: Map<string, number>;
  onClipSelect: (clip: Clip) => void;
}) {
  const activeClipId = usePlayer((s) => s.activeClipId);
  const pct = (t: number) => (duration > 0 ? clamp(t / duration, 0, 1) * 100 : 0);
  return (
    <div className="relative size-full">
      {duration > 0 &&
        clips.map((clip) => (
          <motion.button
            key={clip.id}
            type="button"
            title={`${clip.name} · ${formatTime(clip.start_seconds)}–${formatTime(clip.end_seconds)}`}
            aria-label={`Reproducir clip ${clip.name}`}
            onClick={() => onClipSelect(clip)}
            whileHover={{ scaleY: 1.35 }}
            whileTap={{ scaleY: 0.9 }}
            transition={jelly}
            className={cn(
              // The bar is thin; an invisible margin around it makes it easy to hit with a finger.
              "absolute min-w-2.5 rounded-[3px] transition-opacity before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-['']",
              CLIP_SWATCH[clip.color].dot,
              activeClipId === clip.id ? 'opacity-100 ring-1 ring-washi/70' : 'opacity-60 hover:opacity-100',
            )}
            style={{
              left: `${pct(clip.start_seconds)}%`,
              width: `${pct(clip.end_seconds) - pct(clip.start_seconds)}%`,
              top: LANE_PAD + (lanes.get(clip.id) ?? 0) * (LANE_H + LANE_GAP),
              height: LANE_H,
            }}
          />
        ))}
    </div>
  );
});
