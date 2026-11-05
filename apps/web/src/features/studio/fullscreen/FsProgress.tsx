import { CLIP_SWATCH } from '@/data/clips';
import { cn } from '@/lib/cn';
import { hasRange, usePlayer } from '@/player/store';
import { type Clip, formatTime } from '@coverscape/shared';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { axisFraction, inTurnedLayer } from '../fullscreenRules';
import { assignLanes } from '../timelineGeometry';

/** Thin YouTube-like progress line: scrub anywhere, A–B band in vermilion, saved clips as thin lines above. */
export function FsProgress({ clips, onClipSelect }: { clips: Clip[]; onClipSelect: (clip: Clip) => void }) {
  const duration = usePlayer((s) => s.duration);
  const loop = usePlayer((s) => s.loop);
  const activeClipId = usePlayer((s) => s.activeClipId);
  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  /** Bar rect cached for the whole drag: no forced layout on every pointermove. */
  const rectRef = useRef<DOMRect | null>(null);
  const [hover, setHoverNow] = useState<number | null>(null);
  const hoverFrame = useRef(0);
  const hoverNext = useRef<number | null>(null);
  /** At most one re-render per frame for the time bubble, however fast the pointer moves. */
  const setHover = useCallback((value: number | null) => {
    hoverNext.current = value;
    if (hoverFrame.current) return;
    hoverFrame.current = requestAnimationFrame(() => {
      hoverFrame.current = 0;
      setHoverNow(hoverNext.current);
    });
  }, []);
  const layout = useMemo(() => assignLanes(clips, duration), [clips, duration]);

  // Leaving fullscreen mid-drag unmounts the bar without a pointerup: never leave the player scrubbing.
  useEffect(
    () => () => {
      cancelAnimationFrame(hoverFrame.current);
      if (dragging.current) usePlayer.getState().setScrubbing(false);
    },
    [],
  );

  // Fill, thumb and aria follow the clock through the DOM, so playback never re-renders the bar.
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    let width = bar.clientWidth;
    let lastTime = Number.NaN;
    let lastDuration = Number.NaN;
    let lastSecond = Number.NaN;
    const paint = (time: number, total: number, force = false) => {
      if (!force && time === lastTime && total === lastDuration) return;
      lastTime = time;
      lastDuration = total;
      const f = total > 0 ? Math.min(1, Math.max(0, time / total)) : 0;
      fillRef.current?.style.setProperty('transform', `translate3d(${(f - 1) * 100}%,0,0)`);
      thumbRef.current?.style.setProperty('transform', `translate3d(${f * width}px,0,0)`);
      const second = Math.floor(time);
      if (second !== lastSecond) {
        lastSecond = second;
        bar.setAttribute('aria-valuenow', String(second));
        bar.setAttribute('aria-valuetext', formatTime(second));
      }
    };
    const repaint = () => {
      const { time, duration: total } = usePlayer.getState();
      paint(time, total, true);
    };
    repaint();
    const resize = new ResizeObserver(() => {
      width = bar.clientWidth;
      repaint();
    });
    resize.observe(bar);
    // Under the recorder (`covered`) nothing is painted; uncovering repaints once.
    const unsubscribe = usePlayer.subscribe((s, prev) => {
      if (s.covered) return;
      if (prev.covered) repaint();
      else paint(s.time, s.duration);
    });
    return () => {
      unsubscribe();
      resize.disconnect();
    };
  }, []);

  const pct = (t: number) => (duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0);
  const fractionAt = (point: { clientX: number; clientY: number }) => {
    const rect = (dragging.current && rectRef.current) || barRef.current!.getBoundingClientRect();
    // REQ-02 · Inside the CSS-turned layer the bar runs down the screen.
    return axisFraction(point, rect, inTurnedLayer(barRef.current));
  };
  const scrubAt = (point: { clientX: number; clientY: number }) =>
    usePlayer.getState().scrubTo(fractionAt(point) * duration);
  const release = () => {
    if (!dragging.current) return;
    dragging.current = false;
    rectRef.current = null;
    usePlayer.getState().setScrubbing(false);
  };

  const clipLines = useMemo(() => {
    if (duration <= 0) return null;
    const at = (t: number) => Math.min(100, Math.max(0, (t / duration) * 100));
    return clips.map((clip) => (
      <button
        key={clip.id}
        type="button"
        title={`${clip.name} · ${formatTime(clip.start_seconds)}–${formatTime(clip.end_seconds)}`}
        aria-label={`Reproducir clip ${clip.name}`}
        onClick={() => onClipSelect(clip)}
        className="group/clip absolute flex items-center"
        style={{
          left: `${at(clip.start_seconds)}%`,
          width: `${Math.max(0.6, at(clip.end_seconds) - at(clip.start_seconds))}%`,
          top: (layout.lanes.get(clip.id) ?? 0) * 7,
          height: 7,
        }}
      >
        <span
          className={cn(
            'block h-[3px] w-full rounded-full transition-[height,opacity] group-hover/clip:h-[5px]',
            CLIP_SWATCH[clip.color].dot,
            clip.id === activeClipId ? 'opacity-100' : 'opacity-70',
          )}
        />
      </button>
    ));
  }, [clips, duration, layout, activeClipId, onClipSelect]);

  return (
    <div className="relative">
      {/* clip lines */}
      <div
        className="relative mb-1"
        style={{ height: Math.max(1, layout.count) * 7 }}
        role="group"
        aria-label="Clips guardados"
      >
        {clipLines}
      </div>

      {/* aria-valuenow / aria-valuetext are written once per second by the paint effect above. */}
      <div
        ref={barRef}
        role="slider"
        tabIndex={0}
        aria-label="Progreso"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        // Same keys as the main timeline: ←/→ 5 s (Shift: 1 s), Home/End to either end.
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopPropagation();
            usePlayer.getState().nudge((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 5));
          } else if ((e.key === 'Home' || e.key === 'End') && duration > 0) {
            e.preventDefault();
            e.stopPropagation();
            usePlayer.getState().seek(e.key === 'Home' ? 0 : duration);
          }
        }}
        onPointerDown={(e) => {
          if (!duration) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* synthetic pointer */
          }
          rectRef.current = e.currentTarget.getBoundingClientRect();
          dragging.current = true;
          usePlayer.getState().setScrubbing(true);
          scrubAt(e);
          setHover(fractionAt(e));
        }}
        onPointerMove={(e) => {
          // Fingers only get the time bubble while dragging; a mouse gets it on hover too.
          if (e.pointerType !== 'touch' || dragging.current) setHover(fractionAt(e));
          if (dragging.current) scrubAt(e);
        }}
        onPointerUp={(e) => {
          release();
          if (e.pointerType === 'touch') setHover(null);
        }}
        onPointerCancel={() => {
          release();
          setHover(null);
        }}
        onLostPointerCapture={release}
        onPointerLeave={() => setHover(null)}
        className="group/bar relative flex h-5 cursor-pointer touch-none items-center"
      >
        <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-washi/25 transition-[height] duration-150 group-hover/bar:h-[5px]">
          {hover != null && (
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-washi/25"
              style={{ width: `${hover * 100}%` }}
            />
          )}
          {hasRange(loop) && (
            <div
              className={cn('absolute inset-y-0', loop.enabled ? 'bg-shu-400/55' : 'bg-washi/20')}
              style={{ left: `${pct(loop.start)}%`, width: `${pct(loop.end) - pct(loop.start)}%` }}
            />
          )}
          <div ref={fillRef} className="absolute inset-0 rounded-full bg-shu-500 will-change-transform" />
        </div>
        <span
          ref={thumbRef}
          className="pointer-events-none absolute left-0 size-3.5 -translate-x-1/2 scale-0 rounded-full bg-shu-500 shadow transition-[scale] duration-150 group-hover/bar:scale-100"
        />
        {hover != null && duration > 0 && (
          <span
            className="tabular pointer-events-none absolute -top-8 -translate-x-1/2 rounded-[6px] bg-sumi-950/90 px-2 py-1 font-mono text-xs text-washi"
            style={{ left: `${hover * 100}%` }}
          >
            {formatTime(hover * duration, { tenths: true })}
          </span>
        )}
      </div>
    </div>
  );
}
