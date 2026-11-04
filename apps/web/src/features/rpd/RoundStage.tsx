import { youTubeWatchUrl } from '@coverscape/shared';
import { motion } from 'motion/react';
import { Youtube } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { FileStage } from '@/player/FileStage';
import { usePlayer } from '@/player/store';
import { YouTubeStage } from '@/player/YouTubeStage';
import type { ClipSource } from './useClipSource';

// REQ-27 · Split out of RpdPlayPage.tsx: the picture of the round and what goes around it.

export function Preloader({ source, current }: { source: ClipSource; current: ClipSource }) {
  if (source.status !== 'file' || (current.status === 'file' && current.url === source.url)) return null;
  return <video aria-hidden src={source.url} preload="auto" muted playsInline className="hidden" />;
}

/** The app's own player (YouTube or the file), flipped for the mirror, with a tap-to-pause cover. */
export function RoundStage({
  source,
  stageKey,
  mirrored,
  onToggle,
  playing,
  tapShowsBar,
}: {
  source: ClipSource;
  stageKey: string | null;
  mirrored: boolean;
  onToggle: () => void;
  playing: boolean;
  /** 54 · Sideways full screen: a tap on the picture shows or hides the bar (the bar has «Pausa»). */
  tapShowsBar?: boolean;
}) {
  return (
    <>
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{ scaleX: mirrored ? -1 : 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18, mass: 0.9 }}
      >
        {stageKey && source.status === 'youtube' ? (
          <YouTubeStage key={stageKey} videoId={source.youtubeId} />
        ) : stageKey && source.status === 'file' ? (
          <FileStage key={stageKey} src={source.url} offset={source.offset} />
        ) : null}
      </motion.div>
      {!stageKey && (
        <div className="absolute inset-0 grid place-items-center" aria-hidden>
          <Spinner className="size-8 text-washi-subtle" />
        </div>
      )}
      <button
        type="button"
        aria-label={tapShowsBar ? 'Mostrar u ocultar los controles' : playing ? 'Pausar' : 'Seguir'}
        onClick={onToggle}
        className={cn('absolute inset-0 z-10 cursor-pointer')}
      />
    </>
  );
}

/**
 * The source credit for a YouTube video (the API's policies, as in the studio): opens the original at the current
 * second. Outside the picture, in the round's own bar.
 */
export function YouTubeCredit({ youtubeId }: { youtubeId: string }) {
  return (
    <a
      href={youTubeWatchUrl(youtubeId)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => {
        e.currentTarget.href = youTubeWatchUrl(youtubeId, usePlayer.getState().time);
      }}
      className="relative inline-flex shrink-0 items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[12px] font-medium text-washi-muted transition-colors before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[''] hover:text-washi"
    >
      <Youtube aria-hidden className="size-3.5" /> Ver en YouTube
    </a>
  );
}
