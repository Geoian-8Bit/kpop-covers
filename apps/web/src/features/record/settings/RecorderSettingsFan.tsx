import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, Settings, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { jelly, snappy, soft } from '@/lib/motion';
import { BoxProbe, FieldBlock, Seal, stopToCamera, useBoxSize, useModalFocus } from './controls';
import { useSettingsFields, type FieldKey, type Fields, type RecorderSettingsProps } from './model';

/**
 * «Abanico (sensu)»: from the ⚙ rivet, the sticks of a folding fan spring open one after another; each stick is a
 * group of settings with a washi slip at its tip (always upright, so it reads from the floor). Tapping a slip folds
 * the fan and opens that group. Keyboard: arrows move between sticks, Enter opens, Escape goes back, then closes.
 * With reduced motion the sticks simply appear in place (no turning).
 */
export function RecorderSettingsFan(props: RecorderSettingsProps) {
  const probe = useRef<HTMLDivElement>(null);
  const size = useBoxSize(probe);
  return (
    <>
      <BoxProbe probeRef={probe} />
      <AnimatePresence>{props.open && size && <FanPanel key={`fan-${props.only ?? 'all'}`} {...props} w={size.w} h={size.h} />}</AnimatePresence>
    </>
  );
}

type GroupId = 'quality' | 'image' | 'format' | 'sound' | 'view';
interface Group {
  id: GroupId;
  title: string;
  glyph: string;
  keys: FieldKey[];
}

/**
 * P27 · «Calidad» gathers quality, size and frame rate (one decision: how the take looks and how much it weighs);
 * «Imagen» is the camera's light, colour of the light and focus: its stick opens the recorder's image panel (the
 * same one a take uses while it rolls).
 */
const GROUPS: Group[] = [
  { id: 'quality', title: 'Calidad', glyph: '質', keys: ['quality', 'resolution', 'fps'] },
  { id: 'image', title: 'Imagen', glyph: '光', keys: [] },
  { id: 'format', title: 'Formato', glyph: '式', keys: ['codec', 'mode'] },
  { id: 'sound', title: 'Sonido', glyph: '音', keys: ['sound', 'syncTrim', 'micChannels', 'clapSensitivity'] },
  { id: 'view', title: 'Visor', glyph: '眼', keys: ['grid', 'level', 'info'] },
];

/** What each slip shows under its name. */
function groupValue(id: GroupId, f: Fields, image: string): string {
  switch (id) {
    case 'quality':
      return [f.quality.display, f.resolution.value && f.resolution.value !== 'auto' ? f.resolution.display : null, f.fps.value ?? '30']
        .filter(Boolean)
        .join(' · ');
    case 'image':
      return image;
    case 'format':
      return `${f.codec.value === 'h264' ? 'H.264' : 'Auto'}${f.mode.value === 'canvas' ? ' · lienzo' : ''}`;
    case 'sound':
      return `${f.sound.value === 'song' ? 'Canción' : 'Micrófono'}${f.syncTrim.value !== 0 ? ` · ${f.syncTrim.display}` : ''}`;
    case 'view': {
      const on = [f.grid, f.level, f.info].filter((x) => x.value).map((x) => (x.key === 'info' ? 'Info' : x.label));
      return on.length ? on.join(' · ') : 'Sin guías';
    }
  }
}

const TOP = 78; // title band
const TITLE_W = 290; // the title and summary, top left
const EDGE = 10;
const CARD_H = 58;

interface Geometry {
  px: number;
  py: number;
  /** Rotation of a closed fan (0 = sticks up, -90 = sticks to the left). */
  base: number;
  /** Each stick's opening angle around `base`. */
  angles: number[];
  r: number;
  cardW: number;
  tall: boolean;
}

/**
 * Where the rivet goes and how long the sticks can be. Upright phones: the rivet sits on the right edge (where the
 * recorder's rail is) and the fan opens to the left. Turned phones (~360 px tall): the rivet sits at the bottom and
 * the fan opens upwards. The slips shrink before they would overlap.
 */
function fanGeometry(w: number, h: number, n: number): Geometry {
  const tall = h >= w * 0.9;
  const px = tall ? w - 40 : w / 2;
  const py = tall ? TOP + (h - TOP) / 2 : h - 34;
  const base = tall ? -90 : 0;
  const spread = tall ? 66 : 72;
  const angles = Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : -spread + (2 * spread * i) / (n - 1);
    return tall ? -t : t; // first stick on top (upright) or on the left (turned)
  });
  // Upright, the title band runs across the top; turned, only its top-left corner is taken.
  const top = tall ? TOP : 14;
  const centre = (r: number, t: number): [number, number] => {
    const a = ((base + t) * Math.PI) / 180;
    return [px + r * Math.sin(a), py - r * Math.cos(a)];
  };
  let geo: Geometry = { px, py, base, angles, r: 0, cardW: 140, tall };
  for (const cardW of [140, 128, 116, 104]) {
    let r = 290;
    for (const t of angles) {
      const a = ((base + t) * Math.PI) / 180;
      const dx = Math.sin(a);
      const dy = -Math.cos(a);
      if (dx < -1e-6) r = Math.min(r, (px - EDGE - cardW / 2) / -dx);
      if (dx > 1e-6) r = Math.min(r, (w - EDGE - cardW / 2 - px) / dx);
      if (dy < -1e-6) r = Math.min(r, (py - top - CARD_H / 2) / -dy);
      if (dy > 1e-6) r = Math.min(r, (h - EDGE - CARD_H / 2 - py) / dy);
    }
    const clearOfTitle = (radius: number) =>
      angles.every((t) => {
        const [x, y] = centre(radius, t);
        return x - cardW / 2 > TITLE_W || y - CARD_H / 2 > TOP;
      });
    while (r > 96 && !clearOfTitle(r)) r -= 4;
    r = Math.max(r, 96);
    const centres = angles.map((t) => centre(r, t));
    geo = { px, py, base, angles, r, cardW, tall };
    const overlaps = centres.some((c, i) => {
      const next = centres[i + 1];
      return next != null && Math.abs(c[0] - next[0]) < cardW + 6 && Math.abs(c[1] - next[1]) < CARD_H + 6;
    });
    if (!overlaps) break;
  }
  return geo;
}

/** An annular sector (degrees, clockwise from straight up) centred on (c, c). */
function sector(c: number, r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => {
    const rad = (a * Math.PI) / 180;
    return `${(c + r * Math.sin(rad)).toFixed(2)} ${(c - r * Math.cos(rad)).toFixed(2)}`;
  };
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${p(r1, a0)}A${r1} ${r1} 0 ${large} 1 ${p(r1, a1)}L${p(r0, a1)}A${r0} ${r0} 0 ${large} 0 ${p(r0, a0)}Z`;
}

function FanPanel({
  onClose,
  summary,
  maxSize,
  maxFps,
  songPossible,
  only,
  image,
  w,
  h,
}: RecorderSettingsProps & { w: number; h: number }) {
  const f = useSettingsFields({ maxSize, maxFps, songPossible });
  const reduce = useReducedMotion() ?? false;
  const rootRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const stickRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const titleId = useId();
  const summaryId = useId();
  const detailTitleId = useId();
  // P26: the quality chip opens its group straight away (and closing it closes the settings).
  const [openGroup, setOpenGroup] = useState<GroupId | null>(only ?? null);
  const lastStick = useRef(0);
  // «Imagen» only when this camera has light, colour or focus controls.
  const groups = GROUPS.filter((x) => x.id !== 'image' || image);
  const g = fanGeometry(w, h, groups.length);
  const folded = openGroup != null;
  const group = groups.find((x) => x.id === openGroup) ?? null;
  const back = () => (only ? onClose() : setOpenGroup(null));

  useModalFocus(true, rootRef, () => (openGroup ? back() : onClose()));

  // Focus follows the fan: into the group that opened, back to its stick when it closes.
  const wasFolded = useRef(false);
  useEffect(() => {
    if (folded === wasFolded.current) return;
    wasFolded.current = folded;
    const frame = requestAnimationFrame(() =>
      folded ? detailRef.current?.focus({ preventScroll: true }) : stickRefs.current[lastStick.current]?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [folded]);

  const onStickKey = (e: ReactKeyboardEvent, i: number) => {
    const n = groups.length;
    let next = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (i + 1) % n;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (i - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    stickRefs.current[next]?.focus();
  };

  // The paper leaf between the sticks: pleats as flat bands of washi, alternately lighter and darker.
  const spread = Math.max(...g.angles.map(Math.abs));
  const leafR1 = g.r - 6;
  const leafR0 = Math.max(26, g.r * 0.4);
  const a0 = g.base - spread - 10;
  const a1 = g.base + spread + 10;
  const pleats = 16;
  const box = leafR1 + 2;

  const stickTransition = (i: number) =>
    reduce ? { duration: 0.2 } : folded ? snappy : { ...jelly, delay: 0.05 + i * 0.045 };

  return (
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={summaryId}
      tabIndex={-1}
      className="absolute inset-0 z-40 overflow-hidden text-washi outline-none"
      {...stopToCamera}
    >
      {/* Ink wash over the camera; a tap on it closes the fan. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-sumi-950/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.2, delay: 0.08 } }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      <motion.div
        className="pointer-events-none absolute left-[max(14px,env(safe-area-inset-left))] right-16 top-[max(14px,env(safe-area-inset-top))]"
        initial={{ opacity: 0 }}
        animate={{ opacity: folded ? 0 : 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id={titleId} className="font-display text-[22px] font-bold leading-tight">
            Ajustes
          </h2>
          <span
            id={summaryId}
            className="tabular rounded-full bg-sumi-950/80 px-2.5 py-1 font-mono text-[13px] font-bold text-kin-300"
          >
            {summary}
          </span>
        </div>
        <p className="mt-1 text-[12.5px] text-washi-subtle">Toca una varilla para cambiarla.</p>
      </motion.div>

      {/* The leaf (decorative). */}
      <motion.svg
        aria-hidden
        width={box * 2}
        height={box * 2}
        viewBox={`0 0 ${box * 2} ${box * 2}`}
        className="pointer-events-none absolute"
        style={{ left: g.px - box, top: g.py - box }}
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.35 }}
        animate={reduce ? { opacity: folded ? 0 : 1 } : { opacity: folded ? 0 : 1, scale: folded ? 0.5 : 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
        transition={soft}
      >
        {Array.from({ length: pleats }, (_, k) => {
          const s0 = a0 + ((a1 - a0) * k) / pleats;
          const s1 = a0 + ((a1 - a0) * (k + 1)) / pleats;
          return (
            <path
              key={k}
              d={sector(box, leafR0, leafR1, s0, s1)}
              fill="var(--color-washi)"
              fillOpacity={k % 2 ? 0.07 : 0.12}
            />
          );
        })}
        <path
          d={sector(box, leafR0, leafR1, a0, a1)}
          fill="none"
          stroke="var(--color-kin-400)"
          strokeOpacity={0.45}
          strokeWidth={1.2}
        />
      </motion.svg>

      {/* The sticks, each with its slip. */}
      <div role="list" aria-label="Grupos de ajustes" inert={folded} className="absolute inset-0">
        {groups.map((grp, i) => {
          const angle = g.base + (g.angles[i] ?? 0);
          const turn = folded ? g.base : angle;
          const value = groupValue(grp.id, f, image?.summary ?? '');
          return (
            <motion.div
              key={grp.id}
              role="listitem"
              className="absolute size-0"
              style={{ left: g.px, top: g.py }}
              initial={{ rotate: reduce ? angle : g.base, opacity: 0 }}
              animate={{ rotate: reduce ? angle : turn, opacity: folded ? 0 : 1 }}
              exit={{ rotate: reduce ? angle : g.base, opacity: 0, transition: reduce ? { duration: 0.15 } : snappy }}
              transition={stickTransition(i)}
            >
              <span
                aria-hidden
                className="absolute bottom-0 left-[-3px] w-1.5 rounded-full border border-kin-400/50 bg-sumi-700"
                style={{ height: g.r - CARD_H / 2 + 6 }}
              />
              <div className="absolute left-0" style={{ top: -g.r }}>
                {/* Turned back by the same spring, so the slip stays upright all the way. */}
                <motion.div
                  className="absolute size-0"
                  initial={{ rotate: -(reduce ? angle : g.base) }}
                  animate={{ rotate: -(reduce ? angle : turn) }}
                  exit={{ rotate: -(reduce ? angle : g.base), transition: reduce ? { duration: 0.15 } : snappy }}
                  transition={stickTransition(i)}
                >
                  <motion.button
                    ref={(node) => {
                      stickRefs.current[i] = node;
                    }}
                    type="button"
                    data-autofocus={i === 0 ? '' : undefined}
                    aria-label={`${grp.title}: ${value}`}
                    onKeyDown={(e) => onStickKey(e, i)}
                    onClick={() => {
                      lastStick.current = i;
                      // «Imagen» is the recorder's own image panel: the fan closes and it opens.
                      if (grp.id === 'image') image?.onOpen();
                      else setOpenGroup(grp.id);
                    }}
                    whileTap={{ scale: 0.9 }}
                    transition={jelly}
                    className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-[10px] bg-washi px-2.5 text-left text-sumi-950 shadow-[inset_0_0_0_1px_rgb(228_200_143/0.7),0_10px_20px_-8px_rgb(0_0_0/0.9)]"
                    style={{ width: g.cardW, height: CARD_H }}
                  >
                    <Seal glyph={grp.glyph} tone="paper" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold leading-tight">{grp.title}</span>
                      <span className="tabular block truncate text-[12.5px] font-bold leading-tight text-sumi-600">
                        {value}
                      </span>
                    </span>
                  </motion.button>
                </motion.div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* The rivet (kaname): the ⚙ the fan opens from; it turns into the close button. */}
      <motion.button
        type="button"
        aria-label="Cerrar los ajustes"
        inert={folded}
        onClick={onClose}
        className="absolute grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-kin-400 bg-sumi-950 text-washi shadow-[0_6px_16px_-6px_rgb(0_0_0/0.9)]"
        style={{ left: g.px, top: g.py }}
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
        animate={reduce ? { opacity: folded ? 0 : 1 } : { opacity: folded ? 0 : 1, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
        whileTap={{ scale: 0.88 }}
        transition={jelly}
      >
        <motion.span
          aria-hidden
          className="absolute"
          initial={reduce ? { opacity: 1 } : { opacity: 1, rotate: 0 }}
          animate={reduce ? { opacity: 0 } : { opacity: 0, rotate: 120 }}
          transition={soft}
        >
          <Settings className="size-6" />
        </motion.span>
        <motion.span
          aria-hidden
          className="absolute"
          initial={reduce ? { opacity: 0 } : { opacity: 0, rotate: -90 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, rotate: 0 }}
          transition={jelly}
        >
          <X className="size-6" />
        </motion.span>
      </motion.button>

      {/* A group, opened from its stick. */}
      <AnimatePresence>
        {group && (
          <div
            key="detail"
            className="pointer-events-none absolute inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] flex items-center justify-center"
            style={{ top: g.tall ? TOP : 12 }}
          >
            <motion.section
              ref={detailRef}
              tabIndex={-1}
              aria-labelledby={detailTitleId}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.86 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92, transition: { duration: 0.14 } }}
              transition={soft}
              style={{ transformOrigin: g.tall ? 'right center' : 'center bottom' }}
              className="pointer-events-auto flex max-h-full w-full max-w-[440px] flex-col outline-none"
            >
              <div className="paper-raised flex min-h-0 flex-col overflow-hidden rounded-[16px]">
                <header className={cn('flex shrink-0 items-center gap-2 pb-1 pt-2', only ? 'pl-4 pr-2' : 'px-2')}>
                  {!only && (
                    <motion.button
                      type="button"
                      aria-label="Volver al abanico"
                      onClick={() => setOpenGroup(null)}
                      whileTap={{ scale: 0.86 }}
                      transition={jelly}
                      className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-washi/10"
                    >
                      <ChevronLeft className="size-6" />
                    </motion.button>
                  )}
                  <Seal glyph={group.glyph} />
                  <h3 id={detailTitleId} className="min-w-0 flex-1 truncate font-display text-[20px] font-bold">
                    {group.title}
                  </h3>
                  <motion.button
                    type="button"
                    aria-label="Cerrar los ajustes"
                    onClick={onClose}
                    whileTap={{ scale: 0.86 }}
                    transition={jelly}
                    className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-washi/10"
                  >
                    <X className="size-5" />
                  </motion.button>
                </header>
                <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-4 pb-4 pt-1">
                  {group.keys.map((key) => (
                    <FieldBlock key={key} field={f[key]} className={cn(f[key].kind === 'switch' && '-my-1')} />
                  ))}
                </div>
              </div>
            </motion.section>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
