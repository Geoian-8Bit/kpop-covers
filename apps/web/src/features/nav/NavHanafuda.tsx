import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/cn';
import { jelly, snappy, soft } from '@/lib/motion';
import { handLayout } from './navRules';
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
} from './quickNavCore';

/**
 * P1 · The quick menu «Hanafuda» (chosen by the product owner): a hand of flower cards fans out of the button. Slide
 * the thumb over them: the card under it rises; let go and it flies to the centre and takes you there. A plain tap
 * works the same.
 */
export default function NavHanafuda() {
  const api = useQuickNav();
  return (
    <QuickNavRoot api={api}>
      <QuickNavScrim api={api} />
      <AnimatePresence>{api.open && api.stage && <Hand key="hand" api={api} />}</AnimatePresence>
      <QuickNavTrigger
        api={api}
        face={
          <span className="relative grid h-14 w-11 rotate-[-8deg] place-items-center rounded-[7px] border-2 border-kin-400 bg-enji-700 shadow-[0_10px_20px_-8px_rgb(0_0_0/0.95)]">
            <span aria-hidden className="absolute inset-[3px] rounded-[4px] border border-kin-300/40" />
            <CurrentGlyph api={api} className="text-[20px] text-washi" />
          </span>
        }
      />
    </QuickNavRoot>
  );
}

const FLY_MS = 340;

function Hand({ api }: { api: QuickNavApi }) {
  const stage = api.stage!;
  const { cardW, cardH, cards } = handLayout(api.entries.length, stage.w, stage.buttonTop);
  // Under 66 px (360 px screens, a zoomed page) a card can't hold kanji, icon and a two-line name: the icon goes.
  const narrow = cardW < 66;
  const [lifted, setLiftedState] = useState<number | null>(null);
  const liftedRef = useRef<number | null>(null);
  const setLifted = (index: number | null) => {
    liftedRef.current = index;
    setLiftedState(index);
  };
  const [flying, setFlying] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const reduce = api.reduce;

  /** The card under the thumb (the topmost one: later cards lie on top). */
  const cardAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-card]');
    return el ? Number(el.dataset.card) : null;
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (flying != null) return;
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
    setLifted(cardAt(e.clientX, e.clientY));
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (flying != null) return;
    const d = drag.current;
    if (!d) {
      if (e.pointerType === 'mouse') setLifted(cardAt(e.clientX, e.clientY));
      return;
    }
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) {
      d.moved = true;
      // From here the hand follows the thumb and the release picks (no click fires on a card).
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    if (d.moved) setLifted(cardAt(e.clientX, e.clientY));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || flying != null) return;
    const index = liftedRef.current;
    if (d.moved) {
      const entry = index != null ? api.entries[index] : undefined;
      if (entry && index != null) fly(index, entry);
      else setLifted(null);
    } else if (index == null) {
      // A tap between the cards: like a tap on the ink wash.
      api.close(true);
    }
    // A tap on a card: its own click picks it.
  };

  const fly = (index: number, entry: NavEntry) => {
    setFlying(index);
    api.pick(entry, reduce ? 0 : FLY_MS);
  };

  return (
    <div
      // No name of its own: the dialog around it is already «Secciones».
      role="group"
      className="pointer-events-auto absolute inset-x-0 touch-none"
      style={{ top: Math.max(0, cards[0]!.y - cardH), height: cardH * 2 + 40 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
        setLifted(null);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse' && !drag.current) setLifted(null);
      }}
    >
      {api.entries.map((entry, i) => {
        const place = cards[i]!;
        const offsetTop = Math.max(0, cards[0]!.y - cardH);
        const up = lifted === i && flying == null;
        const isFlying = flying === i;
        const target = isFlying
          ? { x: stage.w / 2 - cardW / 2, y: stage.h / 2 - cardH / 2 - offsetTop, rotate: 0, scale: 1.7, opacity: 1 }
          : flying != null
            ? { x: place.x - cardW / 2, y: place.y - cardH / 2 - offsetTop + 60, rotate: place.rotate, scale: 0.9, opacity: 0 }
            : {
                x: place.x - cardW / 2,
                y: place.y - cardH / 2 - offsetTop - (up ? 22 : 0),
                rotate: place.rotate,
                scale: up ? 1.08 : 1,
                opacity: 1,
              };
        const from = { x: stage.ax - cardW / 2, y: stage.ay - cardH / 2 - offsetTop, rotate: 0, scale: 0.35, opacity: 0 };
        return (
          <motion.div
            key={entry.id}
            data-card={i}
            className="absolute left-0 top-0"
            style={{ width: cardW, height: cardH, zIndex: isFlying ? 30 : up ? 20 : i }}
            initial={reduce ? { ...target, opacity: 0 } : from}
            animate={target}
            exit={reduce ? { opacity: 0, transition: { duration: 0.15 } } : { ...from, transition: snappy }}
            transition={reduce ? { duration: 0.2 } : isFlying ? soft : { ...jelly, delay: flying == null && !up ? i * 0.03 : 0 }}
          >
            <EntryLink
              api={api}
              entry={entry}
              delay={reduce ? 0 : FLY_MS}
              onPicked={() => setFlying(i)}
              onFocus={() => setLifted(i)}
              aria-label={entry.label}
              className={cn(
                'relative flex size-full flex-col items-center overflow-hidden rounded-[8px] border-2 px-1 pb-1.5 pt-2 text-center outline-none',
                'shadow-[0_14px_24px_-12px_rgb(0_0_0/0.95)] focus-visible:ring-2 focus-visible:ring-kin-300 focus-visible:ring-offset-2 focus-visible:ring-offset-sumi-950',
                entry.tone.field,
                entry.active ? 'border-kin-300' : 'border-sumi-950',
              )}
            >
              {/* Card face: inner frame, a moon or sun disc behind the kanji, the name on a washi slip. */}
              <span aria-hidden className="pointer-events-none absolute inset-[3px] rounded-[5px] border border-washi/25" />
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute left-1/2 top-[18%] size-[62%] -translate-x-1/2 rounded-full opacity-90',
                  entry.active ? 'bg-shu-500' : 'bg-washi/15',
                )}
              />
              <span
                aria-hidden
                className={cn(
                  'relative mt-1 font-display font-extrabold leading-none',
                  narrow ? 'text-[24px]' : 'text-[30px]',
                  entry.active ? 'text-washi' : entry.tone.ink,
                )}
              >
                {entry.kanji}
              </span>
              {/* Narrow cards (360 px screens, or the page zoomed): no icon, so the name has room for two lines. */}
              {!narrow && (
                <span aria-hidden className={cn('relative mt-2 grid', entry.active ? 'text-washi' : entry.tone.ink)}>
                  <EntryIcon entry={entry} />
                </span>
              )}
              <span
                lang="es"
                className={cn(
                  'relative mt-auto w-full hyphens-auto rounded-[4px] bg-washi px-0.5 py-0.5 font-bold leading-[1.15] text-sumi-900 [overflow-wrap:anywhere]',
                  // Seven cards on a phone are narrow: a touch smaller so «Biblioteca» or «Calendario» fit on one line.
                  narrow ? 'text-[10px] tracking-[-0.03em]' : 'text-[11px]',
                )}
              >
                {entry.short}
              </span>
              {entry.active && (
                <span aria-hidden className="absolute right-1 top-1 rounded-[3px] bg-washi px-1 font-display text-[9px] font-extrabold leading-[14px] text-shu-600">
                  今
                </span>
              )}
            </EntryLink>
          </motion.div>
        );
      })}
    </div>
  );
}
