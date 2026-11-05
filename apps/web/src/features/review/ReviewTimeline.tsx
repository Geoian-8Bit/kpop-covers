import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { hasRange, useReview } from '@/player/store';
import { formatTime, type Note } from '@coverscape/shared';
import { motion, useReducedMotion } from 'motion/react';
import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { capturePointer } from './pointer';
import { TapButton } from './reviewControlParts';
import { categoryLabel, noteStatus } from './reviewRules';

// ───────────── Timeline of the take ─────────────

/**
 * The take's time bar: drag to scrub (both follow), the A–B band and the take's notes as diamonds; under it the
 * clock and, on the right, `actions` (sound, note).
 */
export function ReviewTimeline({
  notes,
  openNoteId,
  onNote,
  actions,
  variant = 'full',
  showTotal = true,
}: {
  notes: Note[];
  openNoteId: string | null;
  onNote: (note: Note) => void;
  actions?: ReactNode;
  /** 'bar': clock and line only, for the one-row bar of a phone on its side. */
  variant?: 'full' | 'bar';
  /** «/ 0:45» after the clock (left out when the row is busy). */
  showTotal?: boolean;
}) {
  const bar = variant === 'bar';
  const duration = useReview((s) => s.duration);
  const loop = useReview((s) => s.loop);
  const reduce = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const f = (t: number) => (duration > 0 ? Math.min(1, Math.max(0, t / duration)) : 0);

  // P1 · Fill, thumb, clock and aria follow the take's clock through the DOM (like the studio's FsProgress), so
  // playback never re-renders the timeline: the fill moves every frame (a transform), the label each tenth, aria
  // each second.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let lastTime = Number.NaN;
    let lastDuration = Number.NaN;
    let lastTenth = Number.NaN;
    let lastSecond = Number.NaN;
    const paint = (time: number, total: number) => {
      if (time === lastTime && total === lastDuration) return;
      const totalChanged = total !== lastDuration;
      lastTime = time;
      lastDuration = total;
      const ratio = total > 0 ? Math.min(1, Math.max(0, time / total)) : 0;
      fillRef.current?.style.setProperty('transform', `scaleX(${ratio})`);
      // REQ-25 · The thumb's layer moves by transform (no layout per frame); same place as `left: ratio %`.
      thumbRef.current?.style.setProperty('transform', `translateX(${ratio * 100}%)`);
      const tenth = Math.floor(time * 10);
      if (tenth !== lastTenth && clockRef.current) {
        lastTenth = tenth;
        clockRef.current.textContent = formatTime(time, { tenths: true });
      }
      const second = Math.floor(time);
      if (second !== lastSecond || totalChanged) {
        lastSecond = second;
        track.setAttribute('aria-valuenow', String(second));
        track.setAttribute('aria-valuetext', `${formatTime(second)} de ${formatTime(total)}`);
      }
    };
    const { time, duration: total } = useReview.getState();
    paint(time, total);
    return useReview.subscribe((s) => paint(s.time, s.duration));
  }, [bar]);

  const at = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * duration;
  };

  const dots =
    duration > 0 &&
    notes.map((n) => {
      const done = noteStatus(n) === 'done';
      const label = `Nota en ${formatTime(Number(n.take_seconds), { tenths: true })}${categoryLabel(n.category) ? ` · ${categoryLabel(n.category)}` : ''}${done ? ' · resuelta' : ''}: ${n.body}`;
      return (
        <TapButton
          key={n.id}
          type="button"
          aria-label={label}
          title={label}
          onTap={() => onNote(n)}
          className={cn(
            'group absolute z-10 grid w-11 -translate-x-1/2 place-items-center',
            // On the one-row bar the target is the strip above the line (44 × 22 px), never the line itself.
            bar ? '-top-2 h-[22px]' : 'top-1/2 h-11 -translate-y-1/2',
          )}
          style={{ left: `${f(Number(n.take_seconds)) * 100}%` }}
        >
          <motion.span
            aria-hidden
            animate={{ scale: openNoteId === n.id ? 1.45 : 1 }}
            transition={reduce ? { duration: 0 } : jelly}
            className={cn(
              'block rotate-45 rounded-[2px] ring-2 ring-sumi-850 group-hover:scale-125',
              bar ? 'size-2.5' : 'size-3',
              done ? 'bg-rokusho' : 'bg-ai-300',
              openNoteId === n.id && 'ring-kin-300',
            )}
          />
        </TapButton>
      );
    });

  const track = (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Tiempo de la toma"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration * 10) / 10}
      className={cn(
        'relative h-10 cursor-pointer touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-kin-300',
        bar ? 'min-w-0 flex-1' : 'mx-2',
      )}
      onPointerDown={(e) => {
        if (duration <= 0) return;
        capturePointer(e);
        const s = useReview.getState();
        s.setScrubbing(true);
        s.seek(at(e.clientX), { preview: true });
      }}
      onPointerMove={(e) => {
        if (!useReview.getState().scrubbing) return;
        useReview.getState().seek(at(e.clientX), { preview: true });
      }}
      onPointerUp={() => useReview.getState().setScrubbing(false)}
      onPointerCancel={() => useReview.getState().setScrubbing(false)}
      onKeyDown={(e) => {
        const s = useReview.getState();
        const step = e.shiftKey ? 5 : 1;
        if (e.key === 'ArrowLeft') s.seek(s.time - step);
        else if (e.key === 'ArrowRight') s.seek(s.time + step);
        else if (e.key === 'Home') s.seek(0);
        else if (e.key === 'End') s.seek(s.duration);
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="well absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full">
        {hasRange(loop) && (
          <div
            className={cn('absolute inset-y-0', loop.enabled ? 'bg-shu-500/70' : 'bg-shu-500/30')}
            style={{ left: `${f(loop.start) * 100}%`, width: `${(f(loop.end) - f(loop.start)) * 100}%` }}
          />
        )}
        <div ref={fillRef} className="absolute inset-0 origin-left scale-x-0 bg-kin-300/45" />
      </div>
      {loop.start != null && <Seal at={f(loop.start)} label="A" />}
      {loop.end != null && <Seal at={f(loop.end)} label="B" />}
      {/* REQ-25 · A layer as wide as the line, moved by translateX(ratio · 100 %): its width is the one `left: %` used. */}
      <span ref={thumbRef} aria-hidden className="pointer-events-none absolute inset-0">
        <span className="pointer-events-auto absolute left-0 top-1/2 size-[18px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[4px] border border-kin-400 bg-washi shadow-[0_0_0_3px_var(--color-sumi-850)]" />
      </span>
    </div>
  );

  const clock = (
    <p
      className={cn(
        'tabular shrink-0 whitespace-nowrap font-mono text-[13px] text-washi-muted',
        bar && 'w-[3.6rem] text-right',
      )}
    >
      <span ref={clockRef} className="font-semibold text-washi" />
      {!bar && showTotal && <span className="text-washi-subtle"> / {formatTime(duration)}</span>}
    </p>
  );

  if (bar) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {clock}
        {/* The line keeps clear of the clock (its thumb overhangs its start); the note marks sit just above it, as
            buttons of their own beside the slider, so a tap on one opens the note instead of moving the time. */}
        <div className="relative ml-3 mr-1 flex min-w-0 flex-1">
          {track}
          {notes.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-0 h-0 [&>button]:pointer-events-auto">
              {dots}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Note diamonds: each a 44 px target over a small mark, just above the bar. */}
      {notes.length > 0 && <div className="relative mx-2 h-6">{dots}</div>}
      {track}
      <div className="flex min-h-11 items-center gap-2 px-1">
        {clock}
        {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
      </div>
    </div>
  );
}

function Seal({ at, label }: { at: number; label: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute grid size-5 -translate-x-1/2 place-items-center rounded-[4px] bg-shu-600 font-display text-[11px] font-extrabold text-washi',
        label === 'A' ? '-top-1' : '-bottom-1',
      )}
      style={{ left: `${at * 100}%` }}
    >
      {label}
    </span>
  );
}
