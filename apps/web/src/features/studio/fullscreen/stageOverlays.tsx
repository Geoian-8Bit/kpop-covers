import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { usePlayer } from '@/player/store';
import { formatSpeed, type Video, youTubeWatchUrl } from '@coverscape/shared';
import { ChevronsLeft, ChevronsRight, Pause, Play, Youtube } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useEffect, useLayoutEffect, useState } from 'react';
import { FsVoiceButton } from '../FsVoiceButton';
import { fsChrome, useFsChrome } from '../fullscreenChrome';

/**
 * 5 · The fullscreen controls layer. Only this wrapper follows the controls' visibility: its children are elements
 * made by the stage, so React keeps them as they are, and the stage itself never repaints. Always composited
 * (`will-change`), so showing it is an opacity change on a ready layer, not a fresh paint over a playing video.
 * Hit areas inside carry `fs-hit` and only take touches while the layer shows.
 */
export function FsChromeLayer({
  stageRef,
  children,
}: {
  stageRef: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const shown = useFsChrome((s) => s.shown || s.menu);
  const scrubbing = usePlayer((s) => s.scrubbing);
  const visible = shown || scrubbing;
  useLayoutEffect(() => {
    // The pointer hides with the controls (desktop): an attribute, not a re-render of the stage.
    stageRef.current?.toggleAttribute('data-idle', !visible);
  }, [visible, stageRef]);
  useEffect(() => {
    const el = stageRef.current;
    return () => el?.removeAttribute('data-idle');
  }, [stageRef]);
  return (
    <div
      // Touching any control keeps the controls up; the layer itself lets taps through to the video.
      onPointerDownCapture={fsChrome.wake}
      className={cn(
        'pointer-events-none absolute inset-0 z-30 transition-opacity will-change-[opacity] motion-reduce:transition-none',
        visible ? 'opacity-100 duration-100 [&_.fs-hit]:pointer-events-auto' : 'opacity-0 duration-200',
      )}
    >
      {children}
    </div>
  );
}

/** Double-tap seeks in fullscreen: «−10 s» / «+5 s» for a moment, on the side tapped. */
export function FsSeekFlash() {
  const flash = useFsChrome((s) => s.flash);
  return (
    <AnimatePresence>
      {flash && (
        <motion.span
          key={flash.key}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={cn(
            'tabular pointer-events-none absolute top-1/2 z-40 flex -translate-y-1/2 items-center gap-1.5 rounded-full bg-black/60 px-4 py-2.5 font-mono text-base font-semibold text-washi',
            flash.side === 'left' ? 'left-[10%]' : 'right-[10%]',
          )}
        >
          {flash.side === 'left' ? (
            <>
              <ChevronsLeft className="size-5" /> −{flash.seconds} s
            </>
          ) : (
            <>
              +{flash.seconds} s <ChevronsRight className="size-5" />
            </>
          )}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/** How long a new speed stays on the video before it fades (the bar below always shows it). */
const RATE_FLASH_MS = 1500;

/** 4 · The speed over the video only right after it changes (or when the song opens at another speed). */
export function RateFlash() {
  const rate = usePlayer((s) => s.rate);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (rate === 1) {
      setShown(false);
      return;
    }
    setShown(true);
    const id = setTimeout(() => setShown(false), RATE_FLASH_MS);
    return () => clearTimeout(id);
  }, [rate]);
  return (
    <AnimatePresence>
      {shown && (
        <motion.span
          key="rate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 0.12 }}
          className="tabular ml-auto rounded-[8px] bg-sumi-950/85 px-2.5 py-1.5 font-mono text-sm font-semibold text-washi"
        >
          {formatSpeed(rate)}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/** Waiting this long before the spinner shows: quick seeks and loop jumps never flash it over the picture. */
const SPINNER_DELAY_S = 0.35;

/** Loading or buffering: its own component, so YouTube's bursts of buffering states never repaint the stage. */
export function StageSpinner({ loading }: { loading: boolean }) {
  const buffering = usePlayer((s) => s.buffering);
  if (!loading && !buffering) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: loading ? 0 : SPINNER_DELAY_S, duration: 0.15 }}
      className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
    >
      <Spinner className="size-10 text-washi" label="Cargando vídeo" />
    </motion.div>
  );
}

/** Title and source credit across the top of the fullscreen video. */
export function FsTopBar({ video }: { video: Video }) {
  return (
    <div className="absolute inset-x-0 top-0 flex items-start gap-3 bg-[linear-gradient(to_bottom,rgb(0_0_0/0.7),transparent)] pb-10 pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] pt-[max(12px,env(safe-area-inset-top))] sm:pl-[max(24px,env(safe-area-inset-left))] sm:pr-[max(24px,env(safe-area-inset-right))]">
      <p className="min-w-0 flex-1 break-words font-display text-[17px] font-bold leading-tight text-washi sm:text-xl">
        {video.title}
      </p>
      {video.source === 'youtube' && video.youtube_id && (
        <a
          href={youTubeWatchUrl(video.youtube_id)}
          target="_blank"
          rel="noreferrer"
          aria-label="Ver en YouTube"
          onClick={(e) => {
            e.currentTarget.href = youTubeWatchUrl(video.youtube_id!, usePlayer.getState().time);
          }}
          className="fs-hit pointer-events-none relative flex shrink-0 items-center gap-1.5 rounded-[6px] bg-sumi-900/90 px-2 py-1 text-[12px] font-medium text-washi-muted before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[''] hover:text-washi"
        >
          <Youtube className="size-3.5" /> YouTube
        </a>
      )}
      {/* 46 · «Todo / Sin voz / Voz» without leaving fullscreen (only where the split works): a compact panel. */}
      <FsVoiceButton />
    </div>
  );
}

/** 4 · Play/pause in fullscreen's bottom bar (a plain icon: nothing of ours sits in the middle of the video). */
export function FsPlayButton() {
  const playing = usePlayer((s) => s.playing);
  const counting = usePlayer((s) => s.countdownEndsAt != null);
  const active = playing || counting;
  return (
    <motion.button
      type="button"
      aria-label={active ? 'Pausar' : 'Reproducir'}
      onClick={() => usePlayer.getState().togglePlay()}
      whileTap={{ scale: 0.86 }}
      transition={jelly}
      className="grid size-11 shrink-0 place-items-center rounded-full text-washi transition-colors hover:bg-washi/15 active:bg-washi/20"
    >
      {active ? (
        <Pause className="size-[22px] fill-current" />
      ) : (
        <Play className="size-[22px] fill-current" />
      )}
    </motion.button>
  );
}
