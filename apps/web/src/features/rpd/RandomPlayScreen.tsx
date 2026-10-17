import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { TONE, type Tone } from '@/features/bags/tones';
import { cn } from '@/lib/cn';
import { easeOutExpo, jelly, soft } from '@/lib/motion';
import type { LeadStatus } from './roundRules';

/**
 * F14 · The Random Play Dance screen, made to be read from across the room (phone, laptop or TV), as a
 * «Kamishibai»: the picture sits in a wooden paper-theatre frame; during the pause and the countdown a paper card
 * with the title covers it, and slides away when the clip plays.
 *
 * Layout: upright, everything in one column (bar, frame, what is on, «Siguiente», controls). Sideways (a turned
 * phone, a laptop, a TV) the frame takes the left as tall as the screen allows and the rest stacks on the right.
 */

export interface PlayCard {
  key: string;
  title: string;
  artist: string | null;
  clipName: string;
  tone: Tone;
}

export interface RandomPlayScreenProps {
  /** The bar above: «Salir» and where the clips come from. */
  top: ReactNode;
  /** The picture (the app's player), filling a 16:9 box. */
  stage: ReactNode;
  current: PlayCard | null;
  /** The ones coming after the current one (first = «Siguiente»). */
  upcoming: PlayCard[];
  /** 1-based place of the current clip among the playable ones, and how many there are. */
  position: { index: number; total: number };
  /** The pause / countdown before the clip; null while it plays. */
  lead: LeadStatus | null;
  /** The lead-in is over but the clip hasn't loaded yet. */
  waiting: boolean;
  /** Modo adivinar: false until the clip has sounded a while. */
  titleVisible: boolean;
  /** Modo adivinar keeps the next one a surprise too. */
  nextVisible: boolean;
  paused: boolean;
  /** Something went wrong with this clip (it is skipped). */
  notice?: string | null;
  controls: ReactNode;
}

// Sideways: the frame's column is as wide as a 16:9 picture as tall as the screen (less the frame's plank and the
// page's own margins) allows; the side column keeps a readable width, more on a big screen.
const LAYOUT = {
  '--rpd-chrome': 'calc(96px + env(safe-area-inset-top) + env(safe-area-inset-bottom))',
  '--rpd-cols':
    'minmax(0, calc((100dvh - var(--rpd-chrome)) * 16 / 9 + 24px)) minmax(clamp(13rem, 26vw, 32rem), 1fr)',
  '--rpd-upright-max': 'max(300px, calc((100dvh - 400px) * 16 / 9 + 24px))',
} as CSSProperties;

export function RandomPlayScreen(props: RandomPlayScreenProps) {
  const reduce = useReducedMotion();
  // Lead-in over: the card slides away at once (a clip still loading says so in its notice).
  const lead = props.lead?.phase === 'go' ? null : props.lead;
  const p = { ...props, lead };
  const hidden = !p.titleVisible;
  const covered = lead != null;
  return (
    <div
      style={LAYOUT}
      className="grid w-full min-w-0 gap-3 landscape:grid-cols-[var(--rpd-cols)] landscape:grid-rows-[auto_minmax(0,1fr)] landscape:gap-x-4 landscape:gap-y-2"
    >
      <div className="min-w-0 landscape:col-start-2 landscape:row-start-1">{p.top}</div>

      {/* The butai: a wooden frame with a header plank. */}
      <div className="w-full min-w-0 rounded-[14px] bg-kiji-700 p-2 shadow-[inset_0_0_0_2px_var(--color-kiji-400),0_18px_36px_-18px_rgb(0_0_0/0.9)] portrait:mx-auto portrait:max-w-[var(--rpd-upright-max)] sm:p-3 landscape:col-start-1 landscape:row-span-2 landscape:row-start-1 landscape:self-center">
        <div className="mb-2 flex items-center gap-2 rounded-[6px] bg-kiji-900 px-3 py-1 sm:mb-3">
          <span aria-hidden className="font-display text-[14px] font-extrabold text-kin-300 xl:text-[18px]">
            紙芝居
          </span>
          <span className="flex-1" />
          <span
            aria-hidden
            className="tabular shrink-0 rounded-full bg-sumi-950/60 px-2.5 py-0.5 font-mono text-[13px] font-bold text-washi xl:text-[18px]"
          >
            {Math.max(p.position.index, 0)}/{p.position.total}
          </span>
        </div>
        <StageBox className="rounded-[6px]">
          {p.stage}
          <AnimatePresence initial={false}>
            {covered && (
              <motion.div
                key={`card-${p.current?.key ?? 'none'}`}
                initial={reduce ? { opacity: 0 } : { x: '104%' }}
                animate={reduce ? { opacity: 1 } : { x: 0 }}
                exit={
                  reduce ? { opacity: 0 } : { x: '-104%', transition: { duration: 0.55, ease: easeOutExpo } }
                }
                transition={soft}
                className="absolute inset-0 z-20 flex flex-col justify-between bg-washi p-[clamp(12px,4cqw,44px)] text-sumi-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 truncate text-[clamp(12px,2.4cqw,24px)] font-bold uppercase tracking-[0.14em] text-sumi-700">
                    {p.current?.clipName}
                  </span>
                  {lead.phase === 'countdown' && lead.count != null ? (
                    <motion.span
                      key={lead.count}
                      initial={reduce ? { opacity: 0 } : { scale: 1.6, opacity: 0 }}
                      animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
                      transition={reduce ? { duration: 0.12 } : jelly}
                      // Seen, not read out each second: the round's own status line says which clip comes next.
                      aria-hidden
                      className="grid size-[clamp(44px,13cqw,150px)] shrink-0 place-items-center rounded-full bg-shu-500 font-display text-[clamp(26px,8cqw,96px)] font-extrabold text-washi"
                    >
                      {lead.count}
                    </motion.span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-sumi-700/40 px-3 py-1 text-[clamp(12px,2.4cqw,22px)] font-bold text-sumi-700">
                      間 · {Math.ceil(lead.remainingMs / 1000)} s
                    </span>
                  )}
                </div>
                <p
                  aria-hidden
                  className="line-clamp-3 font-display text-[clamp(22px,8cqw,104px)] font-extrabold leading-[1.02] break-words"
                >
                  {hidden ? '？' : p.current?.title}
                </p>
                <p aria-hidden className="truncate text-[clamp(13px,2.8cqw,28px)] text-sumi-700">
                  {hidden ? 'Escucha y adivina' : p.current?.artist}
                </p>
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-y-0 left-0 w-2',
                    p.current ? TONE[p.current.tone].bg : 'bg-shu-500',
                  )}
                />
              </motion.div>
            )}
          </AnimatePresence>
          <Notice p={p} />
        </StageBox>
      </div>

      <div className="flex min-w-0 flex-col gap-3 landscape:col-start-2 landscape:row-start-2 landscape:gap-2 landscape:self-center xl:landscape:gap-4">
        {/* What is on: big enough to read from the back of the room. */}
        <div className="min-w-0">
          <p className="tabular truncate text-[clamp(12px,2.2vmin,22px)] font-bold uppercase tracking-[0.1em] text-kin-300">
            Clip {Math.max(p.position.index, 1)} de {p.position.total}
            {p.current?.clipName ? ` · ${p.current.clipName}` : ''}
          </p>
          <h2 className="mt-0.5 line-clamp-2 break-words font-display text-[clamp(24px,5.5vmin,68px)] font-extrabold leading-[1.08] text-washi">
            {hidden ? '¿Qué canción es?' : p.current?.title}
          </h2>
          {(hidden || p.current?.artist) && (
            <p className="truncate text-[clamp(14px,2.6vmin,30px)] text-washi-muted">
              {hidden ? 'Escucha y adivina' : p.current?.artist}
            </p>
          )}
        </div>

        {/* The next card, waiting in the box. */}
        <div className="flex min-w-0 items-center gap-3">
          <div aria-hidden className="relative h-9 w-12 shrink-0 xl:h-12 xl:w-16">
            <span className="absolute inset-0 translate-x-1.5 translate-y-1 rounded-[4px] bg-washi-subtle" />
            <span className="absolute inset-0 grid place-items-center rounded-[4px] bg-washi font-display text-[15px] font-extrabold text-sumi-900 xl:text-[20px]">
              次
            </span>
          </div>
          <p className="min-w-0 flex-1 truncate text-[clamp(15px,2.6vmin,30px)] text-washi-muted">
            <span className="font-bold text-washi">Siguiente:</span> {nextLabel(p)}
          </p>
        </div>

        {p.controls}
      </div>
    </div>
  );
}

function nextLabel(p: RandomPlayScreenProps): string {
  const next = p.upcoming[0];
  if (!next) return 'Es el último';
  return p.nextVisible ? next.title : 'Sorpresa';
}

/** A 16:9 box and a size container: the card's type scales with the picture, not with the window. */
function StageBox({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('@container relative aspect-video w-full overflow-hidden bg-sumi-950', className)}>
      {children}
    </div>
  );
}

/** What the picture is doing when it isn't playing: paused, loading, or a clip being skipped. */
function Notice({ p }: { p: RandomPlayScreenProps }) {
  if (!p.notice && !p.waiting && !p.paused) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
      <span
        role="status"
        className="rounded-full bg-sumi-900/90 px-4 py-1.5 text-[clamp(13px,2.4cqw,24px)] font-bold text-washi ring-1 ring-line-strong"
      >
        {p.notice ?? (p.paused ? 'En pausa' : 'Cargando el clip…')}
      </span>
    </div>
  );
}
