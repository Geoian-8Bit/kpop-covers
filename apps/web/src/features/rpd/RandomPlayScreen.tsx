import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { TONE, type Tone } from '@/features/bags/tones';
import { cn } from '@/lib/cn';
import { easeOutExpo, inkReveal, jelly, snappy, soft } from '@/lib/motion';
import type { LeadStatus } from './roundRules';

/**
 * F14 · The Random Play Dance screen, made to be read from across the room (laptop or TV). Three designs from the
 * lab (`random-play`), the same data and controls in all of them:
 *  - marquesina (recommended): the title huge on a lacquer signboard, the countdown stamped as a seal.
 *  - kamishibai: paper-theatre cards slide over the picture with the title and slide away when it plays.
 *  - taiko-cuenta: the countdown as drum hits on a taiko, the next ones running along a band underneath.
 */

export interface PlayCard {
  key: string;
  title: string;
  artist: string | null;
  clipName: string;
  tone: Tone;
}

export interface RandomPlayScreenProps {
  variant: string;
  /** The picture (the app's player, or the demo's stand-in), filling a 16:9 box. */
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
  /** Smaller type, for the lab's demo. */
  compact?: boolean;
}

export function RandomPlayScreen(props: RandomPlayScreenProps) {
  const View =
    props.variant === 'kamishibai' ? Kamishibai : props.variant === 'taiko-cuenta' ? TaikoCuenta : Marquesina;
  // Lead-in over: the veil lifts at once (a clip still loading says so in its notice).
  const lead = props.lead?.phase === 'go' ? null : props.lead;
  return <View {...props} lead={lead} />;
}

/** The title, or the question while it is hidden (modo adivinar). */
function useTitle(p: RandomPlayScreenProps) {
  const hidden = !p.titleVisible;
  return {
    hidden,
    title: hidden ? '¿Qué canción es?' : (p.current?.title ?? ''),
    sub: hidden ? 'Escucha y adivina' : [p.current?.artist, p.current?.clipName].filter(Boolean).join(' · '),
  };
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

/** Shared veil over the picture while it isn't playing. */
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

// ───────────── Marquesina ─────────────

function Marquesina(p: RandomPlayScreenProps) {
  const t = useTitle(p);
  const big = p.compact ? 'text-[26px] sm:text-[34px]' : 'text-[clamp(30px,6.2vw,92px)]';
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Signboard */}
      <header className="relative shrink-0 rounded-[12px] border-2 border-kin-400/70 bg-sumi-950 px-4 py-3 shadow-[inset_0_0_0_4px_var(--color-sumi-900),inset_0_0_0_5px_rgb(228_200_143/0.35)] sm:px-6 sm:py-4">
        <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.16em] text-kin-300 sm:text-[13px]">
          <span aria-hidden className="font-display text-[15px] tracking-normal text-shu-400">
            番
          </span>
          <span className="tabular">
            {p.position.index > 0
              ? `${p.position.index} de ${p.position.total}`
              : `${p.position.total} clips`}
          </span>
          <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-kin-400/40 to-transparent" />
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.h2
            key={`${p.current?.key ?? 'none'}-${t.hidden}`}
            variants={inkReveal}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            className={cn(
              'mt-1 line-clamp-2 font-display font-extrabold leading-[1.02] break-words',
              big,
              t.hidden ? 'text-washi-muted' : 'text-washi',
            )}
          >
            {t.title}
          </motion.h2>
        </AnimatePresence>
        <p className="mt-1 truncate text-[14px] text-washi-muted sm:text-[17px]">{t.sub}</p>
      </header>

      <StageBox className="rounded-[12px] shadow-[0_0_0_1px_rgb(243_236_223/0.16),0_0_0_5px_var(--color-sumi-850),0_0_0_6px_var(--color-rule)]">
        {p.stage}
        <AnimatePresence>
          {p.lead && (
            <motion.div
              key="veil"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              className="absolute inset-0 z-20 grid place-items-center bg-sumi-950/80"
            >
              {p.lead.phase === 'countdown' && p.lead.count != null ? (
                <motion.div
                  key={p.lead.count}
                  initial={{ scale: 1.8, rotate: -16, opacity: 0 }}
                  animate={{ scale: 1, rotate: -5, opacity: 1 }}
                  transition={jelly}
                  className={cn(
                    'grid place-items-center rounded-[10%] bg-shu-500 font-display font-extrabold text-washi shadow-[inset_0_0_0_5px_var(--color-shu-500),inset_0_0_0_7px_rgb(243_236_223/0.8)]',
                    p.compact
                      ? 'size-24 text-[56px]'
                      : 'size-[min(34vw,34vh,240px)] text-[min(22vw,22vh,160px)]',
                  )}
                  aria-label={`Empieza en ${p.lead.count}`}
                >
                  {p.lead.count}
                </motion.div>
              ) : (
                <PauseMark lead={p.lead} compact={p.compact} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <Notice p={p} />
      </StageBox>

      <footer className="flex shrink-0 items-center gap-3">
        <span
          aria-hidden
          className="grid size-9 shrink-0 rotate-[-4deg] place-items-center rounded-[6px] border border-shu-400 font-display text-[17px] font-extrabold text-shu-400"
        >
          次
        </span>
        <p className="min-w-0 flex-1 truncate text-[15px] text-washi-muted sm:text-[18px]">
          <span className="font-bold text-washi">Siguiente:</span> {nextLabel(p)}
        </p>
      </footer>
      <div className="shrink-0">{p.controls}</div>
    </div>
  );
}

/** The pause between clips: 間 (ma) and a thin line running out. */
function PauseMark({ lead, compact }: { lead: LeadStatus; compact?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span
        aria-hidden
        className={cn(
          'font-display font-extrabold text-washi/90',
          compact ? 'text-[48px]' : 'text-[min(16vw,120px)]',
        )}
      >
        間
      </span>
      <span className="text-sm font-bold text-washi-muted sm:text-base">
        Respira · sigue en {Math.ceil(lead.remainingMs / 1000)} s
      </span>
    </div>
  );
}

// ───────────── Kamishibai ─────────────

function Kamishibai(p: RandomPlayScreenProps) {
  const t = useTitle(p);
  const reduce = useReducedMotion();
  const covered = p.lead != null;
  const big = p.compact ? 'text-[24px] sm:text-[30px]' : 'text-[clamp(28px,5.6vw,84px)]';
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* The butai: a wooden frame with a header plank. */}
      <div className="rounded-[14px] bg-kiji-700 p-2 shadow-[inset_0_0_0_2px_var(--color-kiji-400),0_18px_36px_-18px_rgb(0_0_0/0.9)] sm:p-3">
        <div className="mb-2 flex items-center gap-2 rounded-[6px] bg-kiji-900 px-3 py-1.5 sm:mb-3">
          <span aria-hidden className="font-display text-[14px] font-extrabold text-kin-300">
            紙芝居
          </span>
          <span className="min-w-0 flex-1 truncate text-right text-[14px] font-bold text-washi sm:text-[16px]">
            {!covered && !t.hidden ? p.current?.title : t.hidden && !covered ? '¿…?' : ''}
          </span>
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
                  {p.lead?.phase === 'countdown' && p.lead.count != null ? (
                    <motion.span
                      key={p.lead.count}
                      initial={{ scale: 1.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={jelly}
                      aria-label={`Empieza en ${p.lead.count}`}
                      className={cn(
                        'grid shrink-0 place-items-center rounded-full bg-shu-500 font-display font-extrabold text-washi',
                        p.compact ? 'size-12 text-[28px]' : 'size-[min(16vw,120px)] text-[min(10vw,76px)]',
                      )}
                    >
                      {p.lead.count}
                    </motion.span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-sumi-700/40 px-3 py-1 text-[12px] font-bold text-sumi-700 sm:text-sm">
                      {p.lead ? `間 · ${Math.ceil(p.lead.remainingMs / 1000)} s` : ''}
                    </span>
                  )}
                </div>
                <p className={cn('line-clamp-3 font-display font-extrabold leading-[1.02] break-words', big)}>
                  {t.hidden ? '？' : p.current?.title}
                </p>
                <p className="truncate text-[13px] text-sumi-700 sm:text-base">
                  {t.hidden ? 'Escucha y adivina' : p.current?.artist}
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

// ───────────── Taiko ─────────────

const R = 40;
const r = R * 0.58;
function tomoe(k: number): string {
  const a0 = ((k * 120 - 90) * Math.PI) / 180;
  const a1 = a0 + (120 * Math.PI) / 180;
  const ax = (R * Math.cos(a0)).toFixed(2);
  const ay = (R * Math.sin(a0)).toFixed(2);
  const bx = (R * Math.cos(a1)).toFixed(2);
  const by = (R * Math.sin(a1)).toFixed(2);
  return `M${ax} ${ay} A${R} ${R} 0 0 1 ${bx} ${by} A${r} ${r} 0 0 0 0 0 A${r} ${r} 0 0 1 ${ax} ${ay} Z`;
}
const TOMOE = [0, 1, 2].map(tomoe);
const TOMOE_FILL = ['fill-shu-500', 'fill-kin-400', 'fill-ai-500'];

function Drum({ count, compact }: { count: number | null; compact?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div
      className={cn('relative grid place-items-center', compact ? 'size-28' : 'size-[min(36vw,36vh,260px)]')}
    >
      {count != null && !reduce && (
        <motion.span
          key={`ring-${count}`}
          aria-hidden
          initial={{ scale: 0.9, opacity: 0.7 }}
          animate={{ scale: 1.6, opacity: 0 }}
          transition={{ duration: 0.8, ease: easeOutExpo }}
          className="absolute inset-0 rounded-full border-4 border-kin-300"
        />
      )}
      <motion.svg
        key={`drum-${count ?? 'rest'}`}
        viewBox="-50 -50 100 100"
        className="size-full drop-shadow-[0_10px_20px_rgb(0_0_0/0.7)]"
        initial={count != null && !reduce ? { scale: 0.84 } : false}
        animate={{ scale: 1 }}
        transition={jelly}
        aria-hidden
      >
        <circle r="49" className="fill-enji-700" />
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2;
          return (
            <circle
              key={i}
              cx={(46 * Math.cos(a)).toFixed(2)}
              cy={(46 * Math.sin(a)).toFixed(2)}
              r="1.6"
              className="fill-kin-300"
            />
          );
        })}
        <circle r="43" className="fill-washi" />
        <g opacity="0.95">
          {TOMOE.map((d, i) => (
            <path key={i} d={d} className={TOMOE_FILL[i]} />
          ))}
        </g>
      </motion.svg>
    </div>
  );
}

function TaikoCuenta(p: RandomPlayScreenProps) {
  const t = useTitle(p);
  const big = p.compact ? 'text-[22px] sm:text-[28px]' : 'text-[clamp(26px,4.6vw,72px)]';
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <StageBox className="rounded-[12px] shadow-[0_0_0_1px_rgb(243_236_223/0.16),0_0_0_5px_var(--color-sumi-850),0_0_0_6px_var(--color-rule)]">
        {p.stage}
        <AnimatePresence>
          {p.lead && (
            <motion.div
              key="veil"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              className="absolute inset-0 z-20 flex items-center justify-center gap-[4%] bg-sumi-950/85"
            >
              <Drum count={p.lead.phase === 'countdown' ? p.lead.count : null} compact={p.compact} />
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={p.lead.phase === 'countdown' ? `n${p.lead.count}` : 'ma'}
                  initial={{ y: 24, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -24, opacity: 0 }}
                  transition={snappy}
                  aria-label={p.lead.phase === 'countdown' ? `Empieza en ${p.lead.count}` : 'Pausa'}
                  className={cn(
                    'font-display font-extrabold leading-none text-washi',
                    p.compact ? 'text-[56px]' : 'text-[min(22vw,22vh,170px)]',
                  )}
                >
                  {p.lead.phase === 'countdown' ? p.lead.count : '間'}
                </motion.span>
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
        <Notice p={p} />
      </StageBox>

      {/* Obi band: now playing, then what's coming. */}
      <div className="shrink-0 overflow-hidden rounded-[12px] border border-ai-400/40 bg-ai-900">
        <div className="flex items-stretch">
          <div
            className={cn('w-2 shrink-0', p.current ? TONE[p.current.tone].bg : 'bg-shu-500')}
            aria-hidden
          />
          <div className="min-w-0 flex-1 px-3 py-2 sm:px-5 sm:py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ai-300 sm:text-[12px]">
              Ahora ·{' '}
              <span className="tabular">
                {Math.max(p.position.index, 0)} de {p.position.total}
              </span>
            </p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={`${p.current?.key ?? 'none'}-${t.hidden}`}
                variants={inkReveal}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                className={cn(
                  'truncate font-display font-extrabold leading-tight',
                  big,
                  t.hidden ? 'text-ai-200' : 'text-washi',
                )}
              >
                {t.title}
              </motion.p>
            </AnimatePresence>
            <p className="truncate text-[13px] text-ai-200 sm:text-[15px]">{t.sub}</p>
          </div>
        </div>
        <ol
          aria-label="Lo siguiente"
          className="flex gap-2 overflow-hidden border-t border-ai-400/30 bg-ai-800/60 px-3 py-2"
        >
          {p.upcoming.length === 0 ? (
            <li className="text-[13px] text-ai-200">Es el último.</li>
          ) : (
            p.upcoming.slice(0, 4).map((card, i) => (
              <motion.li
                key={card.key}
                layout
                transition={snappy}
                className={cn(
                  'flex min-w-0 shrink-0 items-center gap-2 rounded-full px-2.5 py-1 text-[13px] sm:text-[14px]',
                  i === 0 ? 'max-w-[60%] bg-washi text-sumi-900' : 'max-w-[34%] bg-ai-700 text-ai-200',
                )}
              >
                {i === 0 && (
                  <span aria-hidden className="font-display text-[13px] font-extrabold text-shu-500">
                    次
                  </span>
                )}
                <span className="truncate font-bold">{p.nextVisible ? card.title : 'Sorpresa'}</span>
              </motion.li>
            ))
          )}
        </ol>
      </div>
      <div className="shrink-0">{p.controls}</div>
    </div>
  );
}
