import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'motion/react';
import { Grid3x3, Info, X } from 'lucide-react';
import { useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { jelly, snappy, soft } from '@/lib/motion';
import { BoxProbe, FieldBlock, stopToCamera, SwitchTrack, useBoxSize, useModalFocus } from './controls';
import { useSettingsFields, type RecorderSettingsProps, type SwitchField } from './model';

/**
 * «Bandeja de laca»: a lacquer tray that slides up from the bottom (from the side when the phone is turned), with
 * the settings sorted into bento cells — Imagen, Sonido, Pantalla. The sober, fastest one: everything in sight,
 * one tap per change. Drag the handle down (or sideways) to put it away.
 */
export function RecorderSettingsTray(props: RecorderSettingsProps) {
  const probe = useRef<HTMLDivElement>(null);
  const size = useBoxSize(probe);
  // Turned phones (~360 px tall) get a side tray: a bottom one would leave no room for the settings.
  const side = size != null && size.w > size.h && size.w >= 520;
  return (
    <>
      <BoxProbe probeRef={probe} />
      <AnimatePresence>{props.open && size && <TrayPanel key="tray" {...props} side={side} />}</AnimatePresence>
    </>
  );
}

function TrayPanel({ onClose, summary, side, maxSize, maxFps, songPossible }: RecorderSettingsProps & { side: boolean }) {
  const f = useSettingsFields({ maxSize, maxFps, songPossible });
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const summaryId = useId();
  const drag = useDragControls();
  useModalFocus(true, panelRef, onClose);

  // Both axes always: turning the phone mid-animation (or reopening while it slides away) never strands one.
  const away = side ? { x: '100%', y: 0 } : { x: 0, y: '100%' };
  const home = { x: 0, y: 0 };
  let cell = 0;
  const enter = () => {
    const i = cell++;
    return reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } }
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { ...soft, delay: 0.06 + Math.min(i, 8) * 0.03 },
        };
  };

  return (
    <>
      <motion.div
        aria-hidden
        className="absolute inset-0 z-40 bg-sumi-950/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        {...stopToCamera}
        onClick={onClose}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={summaryId}
        tabIndex={-1}
        initial={reduce ? { opacity: 0 } : away}
        animate={reduce ? { opacity: 1 } : home}
        exit={reduce ? { opacity: 0, transition: { duration: 0.15 } } : { ...away, transition: snappy }}
        transition={soft}
        drag={side ? 'x' : 'y'}
        dragListener={false}
        dragControls={drag}
        dragConstraints={side ? { left: 0, right: 0 } : { top: 0, bottom: 0 }}
        dragElastic={side ? { left: 0.04, right: 0.75 } : { top: 0.04, bottom: 0.75 }}
        onDragEnd={(_, info) => {
          const offset = side ? info.offset.x : info.offset.y;
          const speed = side ? info.velocity.x : info.velocity.y;
          if (offset > 90 || speed > 600) onClose();
        }}
        {...stopToCamera}
        className={cn(
          'absolute z-40 flex flex-col text-washi outline-none will-change-transform',
          side ? 'inset-y-0 right-0 w-[min(440px,64%)]' : 'inset-x-0 bottom-0 mx-auto max-h-[88%] w-full max-w-[560px]',
        )}
      >
        <div
          className={cn(
            'paper-raised flex min-h-0 flex-1 flex-col overflow-hidden',
            side ? 'rounded-l-[20px] border-r-0' : 'rounded-t-[20px] border-b-0',
          )}
        >
          {/* The header is the handle: drag it to put the tray away. */}
          <header
            onPointerDown={(e) => drag.start(e)}
            className={cn(
              'relative flex shrink-0 touch-none items-center gap-3 pb-3 pr-2',
              side ? 'pl-6 pt-[max(12px,env(safe-area-inset-top))]' : 'pl-4 pt-5',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'absolute rounded-full bg-washi/25',
                side ? 'left-2 top-1/2 h-10 w-1 -translate-y-1/2' : 'left-1/2 top-2 h-1 w-10 -translate-x-1/2',
              )}
            />
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-[8px] bg-shu-500 font-display text-[18px] font-bold text-washi shadow-[inset_0_0_0_2px_var(--color-shu-500),inset_0_0_0_3px_rgb(243_236_223/0.4)]"
            >
              設
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="font-display text-[20px] font-bold leading-tight">
                Ajustes de grabación
              </h2>
              <p id={summaryId} className="tabular mt-0.5 truncate font-mono text-[14px] font-bold text-kin-300">
                {summary}
              </p>
            </div>
            <motion.button
              type="button"
              aria-label="Cerrar los ajustes"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onClose}
              whileTap={{ scale: 0.86 }}
              transition={jelly}
              className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-washi/10"
            >
              <X className="size-5" />
            </motion.button>
          </header>

          <div
            className={cn(
              'min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 pt-1',
              side
                ? 'pb-[max(14px,env(safe-area-inset-bottom))] pr-[max(12px,env(safe-area-inset-right))]'
                : 'pb-[max(16px,env(safe-area-inset-bottom))]',
            )}
          >
            <Section title="Imagen" glyph="画">
              <Cell {...enter()} wide>
                <FieldBlock field={f.quality} />
              </Cell>
              <Cell {...enter()} wide>
                <FieldBlock field={f.resolution} />
              </Cell>
              <Cell {...enter()}>
                <FieldBlock field={f.fps} layout="stack" className="flex h-full flex-col" />
              </Cell>
              <Cell {...enter()}>
                <FieldBlock field={f.codec} layout="stack" className="flex h-full flex-col" />
              </Cell>
              <Cell {...enter()} wide>
                <FieldBlock field={f.mode} />
              </Cell>
            </Section>

            <Section title="Sonido" glyph="音">
              <Cell {...enter()}>
                <FieldBlock field={f.sound} layout="stack" className="flex h-full flex-col" />
              </Cell>
              <Cell {...enter()}>
                <FieldBlock field={f.micChannels} layout="stack" className="flex h-full flex-col" />
              </Cell>
            </Section>

            <Section title="Pantalla" glyph="面">
              <Cell {...enter()} wide>
                <FieldBlock field={f.startCamera} />
              </Cell>
              <motion.div {...enter()} className="col-span-2 grid grid-cols-3 gap-2">
                <ToggleTile field={f.grid} icon={<Grid3x3 className="size-5" />} />
                <ToggleTile field={f.level} icon={<LevelGlyph />} />
                <ToggleTile field={f.info} icon={<Info className="size-5" />} />
              </motion.div>
            </Section>

            <p className="px-1 pb-1 text-center text-[12px] text-washi-subtle">Se guarda en este móvil.</p>
          </div>
        </div>
      </motion.div>
    </>
  );
}

function Section({ title, glyph, children }: { title: string; glyph: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <div className="mb-2 flex items-center gap-2 px-1">
        <h3 id={id} className="font-display text-[15px] font-bold text-washi">
          {title}
        </h3>
        <span aria-hidden className="h-px flex-1 bg-rule" />
        <span aria-hidden className="font-display text-[14px] font-bold text-shu-400">
          {glyph}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </section>
  );
}

function Cell({
  wide = false,
  children,
  ...motionProps
}: { wide?: boolean; children: ReactNode } & Pick<Parameters<typeof motion.div>[0], 'initial' | 'animate' | 'transition'>) {
  return (
    <motion.div
      {...motionProps}
      className={cn('rounded-[14px] border border-line bg-sumi-850 p-3', wide && 'col-span-2')}
    >
      {children}
    </motion.div>
  );
}

/** Bento tile that is itself the switch. */
function ToggleTile({ field, icon }: { field: SwitchField; icon: ReactNode }) {
  const labelId = useId();
  const helpId = useId();
  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={field.value}
      aria-labelledby={labelId}
      aria-describedby={helpId}
      onClick={field.toggle}
      initial={false}
      animate={field.value ? 'on' : 'off'}
      whileTap="pressed"
      className="flex h-full min-h-[118px] flex-col items-start gap-1.5 rounded-[14px] border border-line bg-sumi-850 p-2.5 text-left"
    >
      <span className="flex w-full items-center justify-between gap-1">
        <span className="text-washi-muted">{icon}</span>
        <SwitchTrack on={field.value} />
      </span>
      <span id={labelId} className="mt-1 text-[14px] font-bold leading-tight text-washi">
        {field.label}
      </span>
      <span id={helpId} className="text-[12px] leading-snug text-washi-subtle">
        {field.help}
      </span>
    </motion.button>
  );
}

/** A spirit level: the line and its bubble. */
function LevelGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M2 12h6M16 12h6" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
