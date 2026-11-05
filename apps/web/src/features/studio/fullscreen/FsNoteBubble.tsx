import { jelly } from '@/lib/motion';
import { formatTime, type Note } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useNoteAlert } from '../TimelineNotes';

/** Fullscreen: the note the song just reached, in the bottom-right corner above the controls. */
export function FsNoteBubble({ notes }: { notes: Note[] }) {
  const shown = useNoteAlert(notes);
  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={shown.id}
          role="status"
          initial={{ opacity: 0, x: 24, scale: 0.94 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 16, transition: { duration: 0.2 } }}
          transition={jelly}
          className="pointer-events-none absolute bottom-[calc(max(6px,env(safe-area-inset-bottom))+104px)] right-4 z-40 max-w-[min(340px,70vw)] rounded-[12px] bg-washi px-4 py-2.5 text-[15px] font-medium leading-snug text-sumi-900 shadow-[0_14px_30px_-12px_rgb(0_0_0/0.9)] sm:right-6"
        >
          <span className="tabular mr-2 font-mono text-[12px] text-shu-500">
            {formatTime(shown.at_seconds)}
          </span>
          {shown.body}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
