import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  usePresence,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { useEffect } from 'react';
import { cn } from '@/lib/cn';
import { snappy, soft, unfold } from '@/lib/motion';
import { polar, sensuGeometry, wedgePolygon } from '../navRules';
import {
  CurrentGlyph,
  EntryIcon,
  EntryLink,
  QuickNavRoot,
  QuickNavScrim,
  QuickNavTrigger,
  useQuickNav,
  type NavEntry,
  type QuickNavApi,
  type QuickNavProps,
} from '../quickNavCore';

/**
 * P1 · Prototype «Sensu»: from the button in the corner, a fan of washi and lacquer opens over a quarter circle;
 * each stick (a wedge of the leaf) is a section with its icon and kanji, yours in vermilion. The names run along
 * the sticks, like the writing on a real sensu. Delete this file if another prototype is chosen.
 *
 * Opening, like a real fan: it starts closed, every leaf stacked on the last one (by the fixed guard, straight up),
 * and opens with ONE progress (0 → 1, `unfold` spring) from which every leaf takes its angle, spread evenly. So the
 * far leaves travel the most, the paper never parts, and all of it passes its mark a little and settles. The bare
 * ribs follow their own progress a beat ahead (they only show between the rivet and the paper). Only `rotate`,
 * `scale` and `opacity` move, through motion values: no React render per frame. Closing is the inverse, quicker;
 * reopening while it closes carries on from where it is. With reduced motion, a plain fade.
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

/** How far the ribs lead the paper, seconds. */
const RIB_LEAD = 0.025;
/**
 * Leaves are drawn this much wider than their share: `unfold` overshoots ~5 %, and spread past 1 the leaves must
 * still overlap (no background between them) while the fan settles.
 */
const OVERSPREAD = 1.07;

/** Angle along a progress: `from` at 0, `to` at 1 (and a little past it while the spring overshoots). */
function useSwing(progress: MotionValue<number>, from: number, to: number): MotionValue<number> {
  return useTransform(progress, (v) => from + (to - from) * v);
}

function Fan({ api }: { api: QuickNavApi }) {
  const stage = api.stage!;
  const n = api.entries.length;
  const g = sensuGeometry(n, stage.ax, stage.ay, api.top);
  const reduce = api.reduce;
  const [isPresent, safeToRemove] = usePresence();

  // Paper and guards share `paper`; the ribs run on `ribs`, a beat ahead.
  const paper = useMotionValue(reduce ? 1 : 0);
  const ribs = useMotionValue(reduce ? 1 : 0);
  const opacity = useMotionValue(0);
  // Lifted from the button as it opens: grows a touch from the rivet, never from nothing.
  const scale = useTransform(paper, (v) => 0.9 + 0.1 * Math.min(1, Math.max(0, v)));

  useEffect(() => {
    let cancelled = false;
    if (isPresent) {
      const controls = [animate(opacity, 1, { duration: reduce ? 0.2 : 0.1 })];
      if (!reduce) controls.push(animate(ribs, 1, unfold), animate(paper, 1, { ...unfold, delay: RIB_LEAD }));
      return () => controls.forEach((c) => c.stop());
    }
    // Closing: the paper folds back first and the ribs follow, quicker than opening; then a short fade.
    const controls = reduce ? [] : [animate(paper, 0, snappy), animate(ribs, 0, { ...snappy, delay: 0.02 })];
    const fade = animate(opacity, 0, { duration: reduce ? 0.15 : 0.1, delay: reduce ? 0 : 0.14 });
    fade.then(() => {
      if (!cancelled) safeToRemove?.();
    });
    return () => {
      cancelled = true;
      controls.forEach((c) => c.stop());
      fade.stop();
    };
  }, [isPresent, reduce, paper, ribs, opacity, safeToRemove]);

  // Closed: every leaf stacked on the last one, whose right edge is the fixed guard (straight up).
  const closed = g.angles[n - 1] ?? 0;
  const half = g.wedge / 2;
  const leaf = g.wedge * OVERSPREAD + 0.4;
  const clip = wedgePolygon(g.r, g.r0, leaf);
  // The gold rim of each leaf: an arc on its outer edge, so it opens with the paper.
  const rimFrom = polar(g.r, g.r, g.r - 1, -leaf / 2);
  const rimTo = polar(g.r, g.r, g.r - 1, leaf / 2);
  const rim = `M${rimFrom.x.toFixed(1)} ${rimFrom.y.toFixed(1)} A${g.r - 1} ${g.r - 1} 0 0 1 ${rimTo.x.toFixed(1)} ${rimTo.y.toFixed(1)}`;
  const ribLength = g.r0 + 10;

  return (
    // No name of its own: the dialog around it is already «Secciones».
    <motion.div
      className="absolute inset-0"
      role="group"
      style={{ opacity, scale, transformOrigin: `${stage.ax}px ${stage.ay}px` }}
    >
      {/* Ribs (naka-bone): bare lacquer from the rivet to the paper. Decorative. */}
      {g.angles.map((angle, i) => (
        <Stick
          key={`rib-${i}`}
          progress={ribs}
          from={closed}
          to={angle}
          className="w-[5px] border-kin-400/45"
          style={{ left: stage.ax - 2.5, top: stage.ay - ribLength, height: ribLength }}
        />
      ))}
      {api.entries.map((entry, i) => (
        <Leaf
          key={entry.id}
          api={api}
          entry={entry}
          even={i % 2 === 0}
          progress={paper}
          from={closed}
          to={g.angles[i] ?? 0}
          r={g.r}
          r0={g.r0}
          compact={g.compact}
          clip={clip}
          rim={rim}
          left={stage.ax - g.r}
          top={stage.ay - g.r}
        />
      ))}
      {/* Guard sticks (oya-bone): the fixed one straight up; the leading one rides the far leaf's edge. */}
      {[0, -90].map((angle) => (
        <Stick
          key={`guard-${angle}`}
          progress={paper}
          from={angle === 0 ? 0 : closed - half}
          to={angle}
          className="w-[7px] border-kin-400/60"
          style={{ left: stage.ax - 3.5, top: stage.ay - g.r - 4, height: g.r + 4 }}
        />
      ))}
    </motion.div>
  );
}

function Stick({
  progress,
  from,
  to,
  className,
  style,
}: {
  progress: MotionValue<number>;
  from: number;
  to: number;
  className: string;
  style: { left: number; top: number; height: number };
}) {
  const rotate = useSwing(progress, from, to);
  return (
    <motion.span
      aria-hidden
      className={cn('pointer-events-none absolute rounded-full border bg-sumi-900', className)}
      style={{ ...style, rotate, transformOrigin: '50% 100%' }}
    />
  );
}

function Leaf({
  api,
  entry,
  even,
  progress,
  from,
  to,
  r,
  r0,
  compact,
  clip,
  rim,
  left,
  top,
}: {
  api: QuickNavApi;
  entry: NavEntry;
  even: boolean;
  progress: MotionValue<number>;
  from: number;
  to: number;
  r: number;
  r0: number;
  compact: boolean;
  clip: string;
  rim: string;
  left: number;
  top: number;
}) {
  const rotate = useSwing(progress, from, to);
  const labelLength = r - r0 - 26;
  return (
    <motion.div
      className="absolute"
      style={{ left, top, width: r * 2, height: r, rotate, transformOrigin: '50% 100%' }}
    >
      <EntryLink
        api={api}
        entry={entry}
        aria-label={entry.label}
        whileTap={api.reduce ? undefined : { scale: 0.97 }}
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
            left: r - labelLength / 2,
            top: r - (r + r0) / 2 - 20 - 6,
            width: labelLength,
            transform: 'rotate(90deg)',
          }}
        >
          {/* Short fans (landscape, a zoomed page): name only, on up to two lines, so it is never cut. */}
          {!compact && (
            <>
              {/* Turned back so the kanji stands upright whatever the stick's angle. */}
              <span
                aria-hidden
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-[5px] font-display text-[15px] font-extrabold',
                  entry.active ? 'bg-washi text-shu-600' : 'bg-shu-600 text-washi',
                )}
                style={{ transform: `rotate(${-(to + 90)}deg)` }}
              >
                {entry.kanji}
              </span>
              <span aria-hidden className="grid shrink-0">
                <EntryIcon entry={entry} />
              </span>
            </>
          )}
          {compact ? (
            <span lang="es" className="min-w-0 hyphens-auto text-[12px] font-bold leading-[1.1] [overflow-wrap:anywhere]">
              {entry.short}
            </span>
          ) : (
            <span className="min-w-0 truncate text-[14px] font-bold">{entry.short}</span>
          )}
        </span>
      </EntryLink>
      <svg aria-hidden className="pointer-events-none absolute left-0 top-0 overflow-visible" width={r * 2} height={r}>
        <path d={rim} fill="none" stroke="var(--color-kin-400)" strokeWidth={2} strokeOpacity={0.85} />
      </svg>
    </motion.div>
  );
}
