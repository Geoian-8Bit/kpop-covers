import { ButtonSkin } from '@/components/ui/ButtonSkin';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { useReview } from '@/player/store';
import { ChevronLeft, ChevronRight, Repeat, SlidersHorizontal } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { forwardRef, type ReactNode, type Ref } from 'react';
import { pillIdle, TapButton } from './reviewControlParts';
import { useTapAnyFinger } from './tapAnyFinger';

// ───────────── Transport ─────────────

export function IconButton({
  label,
  onClick,
  children,
  pressed,
  className,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const reduce = useReducedMotion();
  const tap = useTapAnyFinger(onClick, disabled);
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      {...tap}
      whileTap={reduce ? undefined : { scale: 0.86 }}
      transition={jelly}
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-full text-washi-muted transition-colors hover:bg-washi/[0.08] hover:text-washi disabled:opacity-40',
        pressed && 'bg-washi/[0.12] text-washi',
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

/** The play crest, as in the studio: plays and pauses both (inside the tap). */
export function PlayCrest({ size = 'md' }: { size?: 'md' | 'sm' }) {
  const playing = useReview((s) => s.playing);
  const ready = useReview((s) => s.takeEngine != null);
  const reduce = useReducedMotion();
  const tap = useTapAnyFinger(() => useReview.getState().togglePlay(), !ready);
  return (
    <motion.button
      type="button"
      aria-label={playing ? 'Pausar los dos (espacio)' : 'Reproducir los dos (espacio)'}
      {...tap}
      disabled={!ready}
      whileTap={reduce ? undefined : { scale: 0.88, rotate: -6 }}
      transition={jelly}
      className={cn(
        'relative shrink-0 drop-shadow-[0_8px_12px_rgb(0_0_0/0.55)] disabled:opacity-40',
        size === 'md' ? 'size-12' : 'size-11',
      )}
    >
      <ButtonSkin kind={playing ? 'pause' : 'play'} />
    </motion.button>
  );
}

/** ‹ and › frame by frame. */
export function FrameStep({ dir }: { dir: -1 | 1 }) {
  const ready = useReview((s) => s.takeEngine != null);
  return (
    <IconButton
      label={dir < 0 ? 'Fotograma anterior (,)' : 'Fotograma siguiente (.)'}
      onClick={() => useReview.getState().step(dir)}
      disabled={!ready}
    >
      {dir < 0 ? <ChevronLeft className="size-6" /> : <ChevronRight className="size-6" />}
    </IconButton>
  );
}

/** The section of the take: A, B and repeat, together like the studio's tray. */
export function LoopTray({ onLoopMissing }: { onLoopMissing: () => void }) {
  const loop = useReview((s) => s.loop);
  const trayBtn =
    "relative grid h-[38px] w-11 place-items-center rounded-[8px] transition-colors after:absolute after:inset-x-0 after:-inset-y-[3px] after:content-['']";
  return (
    <div
      role="group"
      aria-label="Tramo A–B"
      // `relative`: the tray's crest backdrop (index.css, .skin-tray::before, inset 0) must cover the tray only —
      // without it, it covered the whole bar and took its taps.
      className="skin-track skin-tray relative flex shrink-0 items-center rounded-[12px] border border-line bg-sumi-900/70 p-0.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]"
    >
      <TapButton
        type="button"
        aria-label="Marcar A (inicio del tramo)"
        aria-pressed={loop.start != null}
        onTap={() => useReview.getState().markStart()}
        className={cn(trayBtn, loop.start != null ? 'bg-shu-700 text-washi' : pillIdle)}
      >
        <span className="font-display text-[16px] font-extrabold">A</span>
      </TapButton>
      <TapButton
        type="button"
        aria-label="Marcar B (fin del tramo)"
        aria-pressed={loop.end != null}
        onTap={() => useReview.getState().markEnd()}
        className={cn(trayBtn, loop.end != null ? 'bg-shu-700 text-washi' : pillIdle)}
      >
        <span className="font-display text-[16px] font-extrabold">B</span>
      </TapButton>
      <TapButton
        type="button"
        aria-label={loop.enabled ? 'Quitar el bucle del tramo' : 'Repetir el tramo A–B'}
        aria-pressed={loop.enabled}
        onTap={() => {
          if (!useReview.getState().toggleLoop()) onLoopMissing();
        }}
        className={cn(trayBtn, loop.enabled ? 'bg-ai-600/50 text-ai-200' : pillIdle)}
      >
        <Repeat className="size-[18px]" />
      </TapButton>
    </div>
  );
}

/** The settings button (it says when they're open). */
export const SettingsButton = forwardRef<
  HTMLButtonElement,
  { open: boolean; onClick: () => void; className?: string }
>(function SettingsButton({ open, onClick, className }, ref) {
  const reduce = useReducedMotion();
  const tap = useTapAnyFinger(onClick);
  return (
    <motion.button
      ref={ref}
      type="button"
      aria-label={open ? 'Cerrar ajustes del repaso' : 'Ajustes del repaso'}
      aria-expanded={open}
      {...tap}
      whileTap={reduce ? undefined : { scale: 0.86 }}
      transition={jelly}
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-full text-washi-muted transition-colors hover:bg-washi/[0.08] hover:text-washi',
        open && 'bg-washi/[0.12] text-washi',
        className,
      )}
    >
      <SlidersHorizontal className="size-5" />
    </motion.button>
  );
});

/** A–B · ‹ ▶ › · settings: one row that fits a 390 px phone, the play crest in the middle as in the studio. */
export function ReviewTransport({
  settingsOpen,
  onSettings,
  onLoopMissing,
  settingsRef,
  hideSettings,
}: {
  settingsOpen: boolean;
  onSettings: () => void;
  onLoopMissing: () => void;
  settingsRef?: Ref<HTMLButtonElement>;
  /** The settings live beside (a wide screen): the button keeps its room, unseen. */
  hideSettings?: boolean;
}) {
  return (
    <div className="mx-auto flex max-w-xl items-center justify-between gap-1">
      <LoopTray onLoopMissing={onLoopMissing} />
      <div className="flex items-center">
        <FrameStep dir={-1} />
        <PlayCrest />
        <FrameStep dir={1} />
      </div>
      <SettingsButton
        ref={settingsRef}
        open={settingsOpen}
        onClick={onSettings}
        className={hideSettings ? 'invisible' : undefined}
      />
    </div>
  );
}
