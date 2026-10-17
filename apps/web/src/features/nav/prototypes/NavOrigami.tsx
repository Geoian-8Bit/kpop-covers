import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { snappy, soft } from '@/lib/motion';
import { origamiLayout } from '../navRules';
import {
  CurrentGlyph,
  EntryIcon,
  EntryLink,
  QuickNavRoot,
  QuickNavScrim,
  QuickNavTrigger,
  TRIGGER_POSITION,
  useQuickNav,
  type NavEntry,
  type QuickNavApi,
  type QuickNavProps,
} from '../quickNavCore';

/**
 * P1 · Prototype «Origami»: a folded square of washi sits in the corner. Tapped, it unfolds pleat by pleat (rows
 * swing up from the corner, then each face opens sideways) into a panel with a section on every face; closing folds
 * it back. Only 3D transforms and opacity are animated. Delete this file if another prototype is chosen.
 */
export default function NavOrigami(props: QuickNavProps) {
  const api = useQuickNav(props);
  return (
    <QuickNavRoot api={api}>
      <QuickNavScrim api={api} />
      <AnimatePresence>{api.open && api.stage && <Paper key="paper" api={api} />}</AnimatePresence>
      <QuickNavTrigger
        api={api}
        face={
          <span className="relative grid size-11 rotate-45 place-items-center rounded-[4px] bg-washi shadow-[0_10px_20px_-8px_rgb(0_0_0/0.95)]">
            {/* The dog-ear and a crease: a folded sheet, not a button. */}
            <span aria-hidden className="absolute right-0 top-0 size-4 rounded-bl-[3px] bg-kin-200 [clip-path:polygon(0_0,100%_100%,0_100%)]" />
            <span aria-hidden className="absolute inset-0 rounded-[4px] bg-gradient-to-br from-transparent via-transparent to-sumi-950/20" />
            <span className="-rotate-45">
              <CurrentGlyph api={api} className="text-[18px] text-shu-600" />
            </span>
          </span>
        }
      />
    </QuickNavRoot>
  );
}

function Paper({ api }: { api: QuickNavApi }) {
  const stage = api.stage!;
  // Short screens (landscape, or the page zoomed by large system text): 3 × 2 short faces, and a height cap that
  // scrolls rather than pushing the top row off screen.
  const { cols, faceH, maxHeight } = origamiLayout(api.entries.length, stage.buttonTop, api.top);
  const rows: NavEntry[][] = [];
  for (let i = 0; i < api.entries.length; i += cols) rows.push(api.entries.slice(i, i + cols));
  const reduce = api.reduce;
  const last = rows.length - 1;

  return (
    <div
      className={cn(
        'pointer-events-none absolute',
        cols === 2 ? 'w-[min(340px,calc(100%-32px))]' : 'w-[min(440px,calc(100%-32px))]',
        TRIGGER_POSITION,
        // Sits just above the button: 56 px button + 12 px gap.
        'mb-[68px]',
      )}
    >
      <motion.div
        // No name of its own: the dialog around it is already «Secciones».
        role="group"
        className="pointer-events-auto origin-bottom-right overflow-y-auto overflow-x-hidden overscroll-contain rounded-[6px] bg-kin-400/50 shadow-[0_24px_48px_-16px_rgb(0_0_0/0.95)]"
        style={{ maxHeight }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.12 } }}
        exit={{ opacity: 0, transition: { duration: 0.12, delay: reduce ? 0 : 0.22 } }}
      >
        <div className="flex items-center justify-between bg-sumi-900 px-3 py-1.5">
          <span className="text-[12px] font-bold tracking-[0.04em] text-washi-muted">Secciones</span>
          <span aria-hidden className="font-display text-[13px] font-bold text-shu-400">
            折
          </span>
        </div>
        <div className="grid gap-px">
          {rows.map((row, ri) => {
            // The row nearest the corner unfolds first; folding back starts from the top.
            const order = last - ri;
            return (
              <motion.div
                key={ri}
                className={cn('grid origin-bottom gap-px', cols === 2 ? 'grid-cols-2' : 'grid-cols-3')}
                style={{ transformPerspective: 900 }}
                initial={reduce ? { opacity: 0 } : { rotateX: -96, opacity: 0 }}
                animate={reduce ? { opacity: 1 } : { rotateX: 0, opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { rotateX: -96, opacity: 0, transition: { ...snappy, delay: ri * 0.05 } }}
                transition={reduce ? { duration: 0.18 } : { ...soft, delay: order * 0.09 }}
              >
                {row.map((entry, ci) => {
                  // In each row, the face by the corner (right) opens first, the other swings out of it.
                  const fromCorner = ci === row.length - 1;
                  return (
                    <motion.div
                      key={entry.id}
                      className="origin-right"
                      style={{ transformPerspective: 900 }}
                      initial={reduce || fromCorner ? false : { rotateY: -110, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      exit={reduce || fromCorner ? undefined : { rotateY: -110, opacity: 0, transition: snappy }}
                      transition={reduce ? { duration: 0 } : { ...soft, delay: order * 0.09 + 0.12 }}
                    >
                      <Face api={api} entry={entry} shade={(ri + ci) % 2 === 1} height={faceH} />
                    </motion.div>
                  );
                })}
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

function Face({ api, entry, shade, height }: { api: QuickNavApi; entry: NavEntry; shade: boolean; height: number }) {
  return (
    <EntryLink
      api={api}
      entry={entry}
      aria-label={entry.label}
      whileTap={api.reduce ? undefined : { scale: 0.96 }}
      style={{ height }}
      className={cn(
        'relative flex flex-col justify-between overflow-hidden px-3 py-2 outline-none',
        'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-kin-300',
        entry.active ? 'bg-shu-600 text-washi' : shade ? 'bg-kin-200 text-sumi-900' : 'bg-washi text-sumi-900',
      )}
    >
      {/* Crease: the diagonal fold every face of the sheet carries. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-tl from-sumi-950/15 via-transparent to-transparent"
      />
      <span aria-hidden className="pointer-events-none absolute -right-px top-0 h-full w-px bg-sumi-950/15" />
      <span className="relative flex items-start justify-between">
        <span
          aria-hidden
          className={cn('font-display text-[26px] font-extrabold leading-none', entry.active ? 'text-washi' : 'text-shu-600')}
        >
          {entry.kanji}
        </span>
        <span aria-hidden className="grid">
          <EntryIcon entry={entry} />
        </span>
      </span>
      <span className="relative truncate text-[14px] font-bold leading-tight">{entry.short}</span>
    </EntryLink>
  );
}
