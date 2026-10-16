import type { Member, ReactionEmoji } from '@coverscape/shared';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown, Users } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { MemberSeal } from '@/features/members/MembersUI';
import { cn } from '@/lib/cn';
import { jelly, snappy, soft } from '@/lib/motion';
import { reactionLabel, totalReactions, type ReactionGroup } from './reactionRules';

/**
 * F15 · The four quick reactions under a shared take, in one of three designs from the lab (`reactions`):
 *  - hanko (recommended): each reaction is a seal; yours is stamped in vermilion with a splash of ink.
 *  - kami-fubuki: paper confetti bursts around the emoji when you react; the count bounces.
 *  - sensu: each emoji sits on a folding fan that opens wider the more reactions it has; yours takes colour.
 * Below, «Quién» lists who reacted (names in their F2 colour; «Sin nombre» for the rest).
 */

export type ReactionsVariant = 'hanko' | 'kami-fubuki' | 'sensu';

export interface ReactionBarProps {
  variant: string;
  groups: ReactionGroup[];
  onToggle: (emoji: ReactionEmoji) => void;
  /** Who a member id is (null when the member was deleted). */
  memberOf: (id: string) => Pick<Member, 'name' | 'color'> | null;
  className?: string;
}

export function ReactionBar({ variant, groups, onToggle, memberOf, className }: ReactionBarProps) {
  const [whoOpen, setWhoOpen] = useState(false);
  const listId = useId();
  const total = totalReactions(groups);
  const Button = variant === 'kami-fubuki' ? FubukiButton : variant === 'sensu' ? SensuButton : HankoButton;

  return (
    <div className={cn('mt-1.5', className)}>
      <div className="flex flex-wrap items-center gap-1">
        <div role="group" aria-label="Reacciones" className="flex items-center gap-1">
          {groups.map((group) => (
            <Button key={group.emoji} group={group} onToggle={() => onToggle(group.emoji)} />
          ))}
        </div>
        {total > 0 && (
          <button
            type="button"
            aria-expanded={whoOpen}
            aria-controls={listId}
            onClick={() => setWhoOpen((v) => !v)}
            className="ml-auto flex min-h-11 items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-medium text-washi-muted transition-colors hover:bg-washi/[0.06] hover:text-washi"
          >
            <Users aria-hidden className="size-4" />
            Quién
            <motion.span animate={{ rotate: whoOpen ? 180 : 0 }} transition={snappy} className="grid place-items-center">
              <ChevronDown aria-hidden className="size-3.5" />
            </motion.span>
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {whoOpen && total > 0 && (
          <motion.ul
            id={listId}
            key="who"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={soft}
            className="overflow-hidden"
            aria-label="Quién ha reaccionado"
          >
            {groups
              .filter((g) => g.count > 0)
              .map((g) => (
                <li key={g.emoji} className="flex items-start gap-2 py-1">
                  <span aria-hidden className="w-7 shrink-0 pt-0.5 text-center text-[18px] leading-6">
                    {g.emoji}
                  </span>
                  <span className="sr-only">{reactionLabel(g)}: </span>
                  <span className="flex min-w-0 flex-wrap gap-1.5">
                    {g.who.map((id, i) => {
                      const member = id ? memberOf(id) : null;
                      return (
                        <span
                          key={`${id ?? 'anon'}-${i}`}
                          className="flex items-center gap-1.5 rounded-full bg-sumi-800 py-0.5 pl-0.5 pr-2.5 text-[13px] text-washi"
                        >
                          <MemberSeal member={member} size="sm" />
                          {id ? (member?.name ?? 'Antiguo miembro') : 'Sin nombre'}
                        </span>
                      );
                    })}
                  </span>
                </li>
              ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ButtonProps {
  group: ReactionGroup;
  onToggle: () => void;
}

/**
 * Counts the times `mine` turned on (not on mount): a new value is the moment to play the «add» effect. Worked out
 * during the render (not in an effect), so the very render that mounts the stamp already knows it was just added.
 */
function useJustAdded(mine: boolean): number {
  const [seen, setSeen] = useState({ mine, burst: 0 });
  if (seen.mine !== mine) setSeen({ mine, burst: mine ? seen.burst + 1 : seen.burst });
  return seen.burst;
}

function Count({ value, className }: { value: number; className?: string }) {
  // A new key per change (not the value itself): 1 → 2 → 1 quickly would otherwise give two children key «1».
  const [shown, setShown] = useState({ value, n: 0 });
  if (shown.value !== value) setShown({ value, n: shown.n + 1 });
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={shown.n}
        aria-hidden
        initial={{ y: -8, opacity: 0, scale: 0.6 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 8, opacity: 0, scale: 0.6 }}
        transition={jelly}
        className={cn('tabular inline-block min-w-[1ch] font-mono text-[13px] font-semibold', className)}
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
}

// ───────────── Hanko ─────────────

function HankoButton({ group, onToggle }: ButtonProps) {
  const burst = useJustAdded(group.mine);
  return (
    <motion.button
      type="button"
      aria-pressed={group.mine}
      aria-label={reactionLabel(group)}
      onClick={onToggle}
      whileTap={{ scale: 0.88 }}
      transition={jelly}
      className="flex min-h-11 items-center gap-1 rounded-[8px] pl-1 pr-1.5 hover:bg-washi/[0.05]"
    >
      <span className="relative grid size-9 place-items-center">
        {/* The empty seal outline. */}
        <span
          aria-hidden
          className={cn(
            'absolute inset-0.5 rotate-[-4deg] rounded-[6px] border-2 border-dashed transition-colors',
            group.mine ? 'border-transparent' : 'border-shu-400/45',
          )}
        />
        <AnimatePresence>
          {group.mine && (
            <motion.span
              key="ink"
              aria-hidden
              initial={burst ? { scale: 1.7, rotate: -18, opacity: 0 } : false}
              animate={{ scale: 1, rotate: -4, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.14 } }}
              transition={jelly}
              className="absolute inset-0.5 rounded-[6px] bg-shu-500 shadow-[inset_0_0_0_2px_rgb(243_236_223/0.45),0_4px_10px_-4px_rgb(120_28_12/0.9)]"
            />
          )}
        </AnimatePresence>
        {burst > 0 && group.mine && (
          <motion.span
            key={`emoji-${burst}`}
            aria-hidden
            initial={{ scale: 0.6, opacity: 0.7 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-shu-400"
          />
        )}
        <span aria-hidden className={cn('relative text-[19px] leading-none', !group.mine && 'opacity-85')}>
          {group.emoji}
        </span>
      </span>
      <Count value={group.count} className={cn(group.mine ? 'text-shu-400' : group.count ? 'text-washi' : 'text-washi-subtle')} />
    </motion.button>
  );
}

// ───────────── Kami-fubuki ─────────────

const CONFETTI = ['bg-shu-500', 'bg-kin-300', 'bg-ai-400', 'bg-sakura', 'bg-rokusho', 'bg-fuji', 'bg-washi', 'bg-enji-400'];

function FubukiButton({ group, onToggle }: ButtonProps) {
  const burst = useJustAdded(group.mine);
  const reduce = useReducedMotion();
  // New random flight paths for every burst.
  const pieces = useMemo(
    () =>
      CONFETTI.concat(CONFETTI.slice(0, 4)).map((tone, i, all) => {
        const angle = (i / all.length) * Math.PI * 2 + Math.random() * 0.5;
        const dist = 22 + Math.random() * 18;
        return {
          tone,
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist - 10,
          fall: 18 + Math.random() * 16,
          rotate: (Math.random() - 0.5) * 540,
          w: Math.random() > 0.5 ? 6 : 4,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [burst],
  );
  return (
    <motion.button
      type="button"
      aria-pressed={group.mine}
      aria-label={reactionLabel(group)}
      onClick={onToggle}
      whileTap={{ scale: 0.86 }}
      transition={jelly}
      className={cn(
        'relative flex min-h-11 items-center gap-1.5 rounded-full border px-2.5 transition-colors',
        group.mine ? 'border-kin-300/60 bg-kin-300/15' : 'border-line bg-sumi-900/60 hover:border-line-strong',
      )}
    >
      {burst > 0 && group.mine && !reduce && (
        <span key={`confetti-${burst}`} aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
          {pieces.map((p, i) => (
            <motion.span
              key={i}
              className={cn('absolute h-2 rounded-[1px]', p.tone)}
              style={{ width: p.w }}
              initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
              animate={{ x: [0, p.x, p.x * 1.15], y: [0, p.y, p.y + p.fall], rotate: p.rotate, opacity: [1, 1, 0] }}
              transition={{ duration: 0.9, ease: 'easeOut', times: [0, 0.4, 1] }}
            />
          ))}
        </span>
      )}
      <motion.span
        aria-hidden
        key={`emoji-${burst}`}
        initial={burst ? { scale: 1.5, rotate: -12 } : false}
        animate={{ scale: 1, rotate: 0 }}
        transition={jelly}
        className="text-[18px] leading-none"
      >
        {group.emoji}
      </motion.span>
      <Count value={group.count} className={group.mine ? 'text-kin-200' : group.count ? 'text-washi' : 'text-washi-subtle'} />
    </motion.button>
  );
}

// ───────────── Sensu ─────────────

const RIBS = 6;
const PIVOT = { x: 30, y: 40 };
const R_OUT = 34;
const R_IN = 11;

function polar(r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return `${(PIVOT.x + r * Math.cos(rad)).toFixed(2)} ${(PIVOT.y + r * Math.sin(rad)).toFixed(2)}`;
}

/** One pleat of the fan from angle a to b (degrees, 0 = straight up). */
function pleat(a: number, b: number) {
  return `M ${polar(R_IN, a)} L ${polar(R_OUT, a)} A ${R_OUT} ${R_OUT} 0 0 1 ${polar(R_OUT, b)} L ${polar(R_IN, b)} A ${R_IN} ${R_IN} 0 0 0 ${polar(R_IN, a)} Z`;
}

/** The fan's spread: nearly closed with nobody, wide open from five reactions. */
export function fanSpread(count: number): number {
  return 44 + (Math.min(count, 5) / 5) * 116;
}

function SensuButton({ group, onToggle }: ButtonProps) {
  const spread = fanSpread(group.count);
  const step = spread / RIBS;
  return (
    <motion.button
      type="button"
      aria-pressed={group.mine}
      aria-label={reactionLabel(group)}
      onClick={onToggle}
      whileTap={{ scale: 0.88, rotate: -6 }}
      transition={jelly}
      className="relative grid h-12 w-[60px] place-items-center rounded-[8px] hover:bg-washi/[0.05]"
    >
      <svg viewBox="0 0 60 44" className="absolute inset-x-0 top-0 h-[44px] w-[60px]" aria-hidden>
        {Array.from({ length: RIBS }, (_, i) => {
          const a = -spread / 2 + i * step;
          return (
            <motion.path
              key={i}
              initial={false}
              animate={{ d: pleat(a, a + step) }}
              transition={soft}
              className={cn(
                'text-kin-300 transition-[fill] duration-300',
                group.mine
                  ? i % 2
                    ? 'fill-shu-500'
                    : 'fill-shu-400'
                  : i % 2
                    ? 'fill-sumi-700'
                    : 'fill-sumi-600',
              )}
              stroke="currentColor"
              strokeWidth={0.6}
              strokeOpacity={group.mine ? 0.7 : 0.25}
            />
          );
        })}
        <circle cx={PIVOT.x} cy={PIVOT.y} r={2.2} className="fill-kin-400" />
      </svg>
      <span aria-hidden className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[15px] leading-none">
        {group.emoji}
      </span>
      <span
        className={cn(
          'absolute right-0 top-0 grid min-w-[18px] place-items-center rounded-full px-1 leading-[16px]',
          group.mine ? 'bg-shu-500 text-washi' : 'bg-sumi-800 text-washi-muted',
        )}
      >
        <Count value={group.count} className="text-[11px]" />
      </span>
    </motion.button>
  );
}
