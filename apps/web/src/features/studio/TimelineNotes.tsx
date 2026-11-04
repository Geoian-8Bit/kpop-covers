import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { usePlayer } from '@/player/store';
import { clamp, formatTime, type Note } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react';
import { useUnlessCovered } from './studioAsleep';
import { layoutNoteDots } from './timelineGeometry';

/**
 * The group's notes as blue dots floating over the wave, each tied to its exact moment on the line by a
 * dashed thread. A dot turns white once the song has passed it (the component re-renders only when a
 * note is crossed). Tapping one jumps there and opens it.
 */
export const NoteDots = memo(function NoteDots({
  notes,
  levels,
  duration,
  onOpen,
}: {
  notes: Note[];
  levels: number[];
  duration: number;
  onOpen?: (note: Note) => void;
}) {
  // Holds still under the recorder (`covered`): the dots are hidden there.
  const passed = useUnlessCovered((s) => {
    let n = 0;
    while (n < notes.length && notes[n]!.at_seconds <= s.time) n++;
    return n;
  });
  const placed = useMemo(
    () => (duration > 0 ? layoutNoteDots(notes, levels, duration) : []),
    [notes, levels, duration],
  );
  return placed.map(({ note, f, anchor, dot }, i) => {
    const done = i < passed;
    return (
      <Fragment key={note.id}>
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute w-0 -translate-x-1/2 border-l border-dashed transition-colors duration-300',
            done ? 'border-washi/50' : 'border-ai-400/90',
          )}
          style={{ left: `${f * 100}%`, top: `${dot * 100}%`, height: `${Math.max(0, anchor - dot) * 100}%` }}
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full',
            done ? 'bg-washi/70' : 'bg-ai-400',
          )}
          style={{ left: `${f * 100}%`, top: `${anchor * 100}%` }}
        />
        <button
          type="button"
          aria-label={`Nota en ${formatTime(note.at_seconds)}: ${note.body}`}
          title={`${formatTime(note.at_seconds)} · ${note.body}`}
          // Keep the track from starting a scrub under the finger.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            usePlayer.getState().seek(note.at_seconds);
            onOpen?.(note);
          }}
          className="group/note absolute z-10 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center"
          style={{ left: `${f * 100}%`, top: `${dot * 100}%` }}
        >
          <span
            className={cn(
              'size-[11px] rounded-full ring-2 ring-sumi-950/80 transition-[background-color,transform,box-shadow] duration-300 group-hover/note:scale-150',
              done
                ? 'bg-washi shadow-[0_0_8px_rgb(243_236_223/0.45)]'
                : 'bg-ai-400 shadow-[0_0_10px_var(--color-ai-300)]',
            )}
          />
        </button>
      </Fragment>
    );
  });
});

/** Shows each note for a few seconds as natural playback reaches it (not on scrubs or jumps). */
export function useNoteAlert(notes: Note[]): Note | null {
  const [shown, setShown] = useState<Note | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  useEffect(() => {
    let last = usePlayer.getState().time;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = usePlayer.subscribe((s) => {
      const now = s.time;
      // Only natural forward playback announces a note: not scrubs, and not jumps longer than a
      // throttled frame (a phone saving battery can tick as slowly as ~1 s).
      // Nor under the recorder (`covered`): nobody sees the studio's bubbles there.
      if (s.playing && !s.scrubbing && !s.covered && now > last && now - last < 2.5) {
        const hit = notesRef.current.find((n) => n.at_seconds > last && n.at_seconds <= now);
        if (hit) {
          setShown(hit);
          clearTimeout(timer);
          timer = setTimeout(() => setShown(null), 4200);
        }
      }
      last = now;
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  return shown;
}

/**
 * While the song plays, each note pops up above its dot for a few seconds as the playhead reaches it,
 * so the dancers read "this step needs work" right when it matters.
 */
export function NoteBubble({ notes, duration }: { notes: Note[]; duration: number }) {
  const shown = useNoteAlert(notes);
  const f = shown && duration > 0 ? clamp(shown.at_seconds / duration, 0.12, 0.88) : 0.5;
  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={shown.id}
          role="status"
          initial={{ opacity: 0, y: 8, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={jelly}
          // z-10: under the phone's pinned video (z-20), which it would otherwise cover while the page scrolls.
          className="pointer-events-none absolute bottom-[calc(100%+10px)] z-10 w-max max-w-[min(260px,80vw)] -translate-x-1/2 rounded-[10px] bg-washi px-3 py-2 text-[13px] font-medium leading-snug text-sumi-900 shadow-[0_10px_24px_-10px_rgb(0_0_0/0.9)]"
          style={{ left: `${f * 100}%` }}
        >
          <span className="tabular mr-1.5 font-mono text-[11px] text-shu-500">
            {formatTime(shown.at_seconds)}
          </span>
          {shown.body}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
