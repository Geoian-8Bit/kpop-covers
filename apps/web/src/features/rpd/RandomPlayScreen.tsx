import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { TONE, type Tone } from '@/features/bags/tones';
import { cn } from '@/lib/cn';
import { easeOutExpo, jelly, soft } from '@/lib/motion';
import type { LeadStatus } from './roundRules';

/**
 * F14 · The Random Play Dance screen, made to be read from across the room (laptop or TV), as a «Kamishibai»: the
 * picture sits in a wooden paper-theatre frame; during the pause and the countdown a paper card with the title
 * covers it, and slides away when the clip plays.
 */

export interface PlayCard {
  key: string;
  title: string;
  artist: string | null;
  clipName: string;
  tone: Tone;
}

export interface RandomPlayScreenProps {
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

export function RandomPlayScreen(props: RandomPlayScreenProps) {
  const reduce = useReducedMotion();
  // Lead-in over: the card slides away at once (a clip still loading says so in its notice).
  const lead = props.lead?.phase === 'go' ? null : props.lead;
  const p = { ...props, lead };
  const hidden = !p.titleVisible;
  const covered = lead != null;
  const title = p.current?.title ?? '';
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* The butai: a wooden frame with a header plank. */}
      <div className="rounded-[14px] bg-kiji-700 p-2 shadow-[inset_0_0_0_2px_var(--color-kiji-400),0_18px_36px_-18px_rgb(0_0_0/0.9)] sm:p-3">
        <div className="mb-2 flex items-center gap-2 rounded-[6px] bg-kiji-900 px-3 py-1.5 sm:mb-3">
          <span aria-hidden className="font-display text-[14px] font-extrabold text-kin-300">
            紙芝居
          </span>
          {/* The clip's heading: on the plank while it plays; while the card covers the picture, only for readers. */}
          <h2 className="min-w-0 flex-1 truncate text-right text-[14px] font-bold text-washi sm:text-[16px]">
            {covered ? (
              <span className="sr-only">{hidden ? '¿Qué canción es?' : title}</span>
            ) : hidden ? (
              <>
                <span aria-hidden>¿…?</span>
                <span className="sr-only">¿Qué canción es?</span>
              </>
            ) : (
              title
            )}
          </h2>
          <span className="tabular shrink-0 rounded-full bg-sumi-950/60 px-2 py-0.5 font-mono text-[12px] text-washi-muted">
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
                className="absolute inset-0 z-20 flex flex-col justify-between bg-washi p-4 text-sumi-900 sm:p-7"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-sumi-700 sm:text-[14px]">
                    {p.current?.clipName}
                  </span>
                  {lead.phase === 'countdown' && lead.count != null ? (
                    <motion.span
                      key={lead.count}
                      initial={{ scale: 1.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={jelly}
                      aria-label={`Empieza en ${lead.count}`}
                      className="grid size-[min(16vw,120px)] shrink-0 place-items-center rounded-full bg-shu-500 font-display text-[min(10vw,76px)] font-extrabold text-washi"
                    >
                      {lead.count}
                    </motion.span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-sumi-700/40 px-3 py-1 text-[12px] font-bold text-sumi-700 sm:text-sm">
                      間 · {Math.ceil(lead.remainingMs / 1000)} s
                    </span>
                  )}
                </div>
                <p
                  aria-hidden
                  className="line-clamp-3 font-display text-[clamp(28px,5.6vw,84px)] font-extrabold leading-[1.02] break-words"
                >
                  {hidden ? '？' : p.current?.title}
                </p>
                <p className="truncate text-[13px] text-sumi-700 sm:text-base">
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
      {/* The next card, waiting in the box. */}
      <div className="flex shrink-0 items-center gap-3">
        <div aria-hidden className="relative h-10 w-14 shrink-0">
          <span className="absolute inset-0 translate-x-1.5 translate-y-1 rounded-[4px] bg-washi-subtle" />
          <span className="absolute inset-0 grid place-items-center rounded-[4px] bg-washi font-display text-[16px] font-extrabold text-sumi-900">
            次
          </span>
        </div>
        <p className="min-w-0 flex-1 truncate text-[15px] text-washi-muted sm:text-[18px]">
          <span className="font-bold text-washi">Siguiente:</span> {nextLabel(p)}
        </p>
      </div>
      <div className="shrink-0">{p.controls}</div>
    </div>
  );
}

function nextLabel(p: RandomPlayScreenProps): string {
  const next = p.upcoming[0];
  if (!next) return 'Es el último';
  return p.nextVisible ? next.title : 'Sorpresa';
}

function StageBox({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('relative aspect-video w-full overflow-hidden bg-black', className)}>{children}</div>
  );
}

/** What the picture is doing when it isn't playing: paused, loading, or a clip being skipped. */
function Notice({ p }: { p: RandomPlayScreenProps }) {
  if (!p.notice && !p.waiting && !p.paused) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
      <span
        role="status"
        className="rounded-full bg-sumi-950/90 px-4 py-1.5 text-sm font-bold text-washi ring-1 ring-line-strong"
      >
        {p.notice ?? (p.paused ? 'En pausa' : 'Cargando el clip…')}
      </span>
    </div>
  );
}
