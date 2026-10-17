import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { jelly, snappy, soft } from '@/lib/motion';
import { sensuGeometry, wedgePolygon } from '../navRules';
import {
  CurrentGlyph,
  EntryIcon,
  EntryLink,
  QuickNavRoot,
  QuickNavScrim,
  QuickNavTrigger,
  useQuickNav,
  type QuickNavApi,
  type QuickNavProps,
} from '../quickNavCore';

/**
 * P1 · Prototype «Sensu»: from the button in the corner, a fan of washi and lacquer springs open over a quarter
 * circle; each stick (a wedge of the leaf) is a section with its icon and kanji, yours in vermilion. The names run
 * along the sticks, like the writing on a real sensu. Delete this file if another prototype is chosen.
 */
export default function NavSensu(props: QuickNavProps) {
  const api = useQuickNav(props);
  return (
    <QuickNavRoot api={api}>
      <QuickNavScrim api={api} />
      <AnimatePresence>{api.open && api.stage && <Fan key="fan" api={api} />}</AnimatePresence>
      <QuickNavTrigger
        api={api}
        face={
          <span className="grid size-14 place-items-center rounded-full border-2 border-kin-400 bg-sumi-950 shadow-[0_10px_22px_-8px_rgb(0_0_0/0.95),inset_0_0_0_4px_var(--color-sumi-850)]">
            <span className="grid size-10 place-items-center rounded-full border border-kin-400/50 text-kin-200">
              <CurrentGlyph api={api} className="text-[19px]" />
            </span>
          </span>
        }
      />
    </QuickNavRoot>
  );
}

function Fan({ api }: { api: QuickNavApi }) {
  const stage = api.stage!;
  const n = api.entries.length;
  const g = sensuGeometry(n, stage.ax, stage.ay, api.top);
  const clip = wedgePolygon(g.r, g.r0, g.wedge + 0.4);
  const labelLength = g.r - g.r0 - 26;
  const folded = -45;
  const reduce = api.reduce;

  return (
    <div className="absolute inset-0" aria-label="Secciones" role="group">
      {/* Guard sticks (oya-bone): two lacquer ribs at both ends, and a gold rim. Decorative. */}
      {[-90, 0].map((angle) => (
        <motion.span
          key={angle}
          aria-hidden
          className="pointer-events-none absolute w-[7px] rounded-full border border-kin-400/60 bg-sumi-900"
          style={{
            left: stage.ax - 3.5,
            top: stage.ay - g.r - 4,
            height: g.r + 4,
            transformOrigin: '50% 100%',
          }}
          initial={reduce ? { opacity: 0, rotate: angle } : { opacity: 0, rotate: folded }}
          animate={{ opacity: 1, rotate: angle }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, rotate: folded, transition: snappy }}
          transition={reduce ? { duration: 0.2 } : jelly}
        />
      ))}
      {api.entries.map((entry, i) => {
        const angle = g.angles[i] ?? 0;
        const even = i % 2 === 0;
        return (
          <motion.div
            key={entry.id}
            className="absolute"
            style={{
              left: stage.ax - g.r,
              top: stage.ay - g.r,
              width: g.r * 2,
              height: g.r,
              transformOrigin: '50% 100%',
            }}
            initial={reduce ? { opacity: 0, rotate: angle } : { opacity: 0, rotate: folded, scale: 0.4 }}
            animate={{ opacity: 1, rotate: angle, scale: 1 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0.15 } } : { opacity: 0, rotate: folded, scale: 0.4, transition: snappy }}
            transition={reduce ? { duration: 0.2 } : { ...jelly, delay: 0.02 + i * 0.035 }}
          >
            <EntryLink
              api={api}
              entry={entry}
              aria-label={entry.label}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              transition={soft}
              className={cn(
                'pointer-events-auto absolute inset-0 block outline-none',
                'focus-visible:[&_.sensu-label]:ring-2 focus-visible:[&_.sensu-label]:ring-kin-300',
                entry.active ? 'bg-shu-600 text-washi' : even ? 'bg-washi text-sumi-900' : 'bg-kin-200 text-sumi-900',
              )}
              style={{ clipPath: clip }}
            >
              {/* Pleat shading towards the rivet, like light on folded paper. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-sumi-950/35"
              />
              <span
                className="sensu-label absolute flex h-10 items-center gap-2 rounded-[8px] px-1"
                style={{
                  left: g.r - labelLength / 2,
                  top: g.r - (g.r + g.r0) / 2 - 20 - 6,
                  width: labelLength,
                  transform: 'rotate(90deg)',
                }}
              >
                {/* Turned back so the kanji stands upright whatever the stick's angle. */}
                <span
                  aria-hidden
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-[5px] font-display text-[15px] font-extrabold',
                    entry.active ? 'bg-washi text-shu-600' : 'bg-shu-600 text-washi',
                  )}
                  style={{ transform: `rotate(${-(angle + 90)}deg)` }}
                >
                  {entry.kanji}
                </span>
                {!g.compact && (
                  <span aria-hidden className="grid shrink-0">
                    <EntryIcon entry={entry} />
                  </span>
                )}
                <span className="min-w-0 truncate text-[14px] font-bold">{entry.short}</span>
              </span>
            </EntryLink>
          </motion.div>
        );
      })}
      <motion.svg
        aria-hidden
        className="pointer-events-none absolute overflow-visible"
        style={{ left: stage.ax - g.r, top: stage.ay - g.r }}
        width={g.r}
        height={g.r}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: reduce ? 0 : 0.18, duration: 0.25 } }}
        exit={{ opacity: 0, transition: { duration: 0.1 } }}
      >
        <path
          d={`M0 ${g.r} A${g.r} ${g.r} 0 0 1 ${g.r} 0`}
          fill="none"
          stroke="var(--color-kin-400)"
          strokeWidth={2}
          strokeOpacity={0.85}
        />
      </motion.svg>
    </div>
  );
}
