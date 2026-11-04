// REQ-27 · Moved out of SaveClipDialog.tsx unchanged: the dialog's small parts (move first, optimise later).
import { Button } from '@/components/ui/Button';
import { ElasticToggle } from '@/components/ui/ElasticToggle';
import { CLIP_SWATCH } from '@/data/clips';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { CLIP_COLORS, type ClipColor } from '@coverscape/shared';
import { motion } from 'motion/react';
import { type ReactNode, useId } from 'react';
import { CLIP_NAME_SUGGESTIONS } from './clipRules';

/** Same words everywhere the pin appears (dialog, clip list): what it does, not how it's stored. */
export const PIN_LABEL = 'Fijar en la portada';
export const PIN_HINT = 'Sale el primero en Acceso rápido para repetirlo con un toque.';

/** The name, with the quick names in one row that slides sideways under it. */
export function NameField({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (name: string) => void;
  invalid?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        Nombre del clip
      </label>
      <input
        id={id}
        // The name comes filled in: on phones don't pop the keyboard over the colours and Guardar.
        data-autofocus="desktop"
        required
        maxLength={80}
        autoComplete="off"
        placeholder="Nombre del clip"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        aria-invalid={invalid || undefined}
        className={cn(
          'well h-11 w-full rounded-[10px] px-4 text-[15px] text-washi outline-none transition-[border-color,box-shadow] duration-200',
          'focus:border-kin-300/70 focus:shadow-[0_0_0_3px_rgb(228_200_143/0.14)]',
          invalid && 'border-enji-400/80',
        )}
      />
      <div
        role="group"
        aria-label="Nombres rápidos"
        // Bleeds to the dialog's edges so a half-cut tag hints that the row slides.
        className="scrollbar-none -mx-6 mt-2 flex gap-1.5 overflow-x-auto overscroll-x-contain px-6 py-1 sm:-mx-7 sm:px-7"
      >
        {CLIP_NAME_SUGGESTIONS.map((s) => (
          <motion.button
            key={s}
            type="button"
            aria-pressed={value === s}
            onClick={() => onChange(s)}
            whileTap={{ scale: 0.9 }}
            transition={jelly}
            className={cn(
              // 36 px pill, 44 px tall hit area.
              'relative h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-[13px] transition-colors before:absolute before:-inset-y-1 before:inset-x-0 before:content-[""]',
              value === s
                ? 'border-washi bg-washi text-sumi-900'
                : 'border-line text-washi-muted hover:text-washi',
            )}
          >
            {s}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

/** Six dye colours in one row, each a 44 px target. */
export function ColorRow({
  value,
  onChange,
  ringId,
}: {
  value: ClipColor;
  onChange: (c: ClipColor) => void;
  ringId: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Color del clip"
      className="flex justify-between gap-1 sm:justify-start sm:gap-2"
    >
      {CLIP_COLORS.map((c) => (
        <motion.button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={CLIP_SWATCH[c].label}
          title={CLIP_SWATCH[c].label}
          onClick={() => onChange(c)}
          whileTap={{ scale: 0.85 }}
          transition={jelly}
          className="relative grid size-11 place-items-center rounded-[8px]"
        >
          {value === c && (
            <motion.span
              layoutId={ringId}
              transition={jelly}
              className="absolute inset-0 rounded-[8px] border-2 border-washi"
            />
          )}
          <span className={cn('size-7 rounded-[5px]', CLIP_SWATCH[c].dot)} />
        </motion.button>
      ))}
    </div>
  );
}

/** Switches live together in one well instead of loose lines. */
export function ToggleGroup({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col rounded-[12px] bg-sumi-950/35 px-3 py-0.5 ring-1 ring-line">{children}</div>
  );
}

/** «Fijar en la portada» with the line that says what it is for. */
export function PinToggle({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  const hintId = useId();
  return (
    <div>
      <ElasticToggle checked={checked} onChange={onChange} label={PIN_LABEL} describedBy={hintId} />
      {/* Lines up under the label (52 px track + 12 px gap). */}
      <p id={hintId} className="-mt-1.5 pb-2 pl-16 text-[12px] leading-snug text-washi-subtle">
        {PIN_HINT}
      </p>
    </div>
  );
}

export function Footer({
  formId,
  onCancel,
  busy,
  disabled,
  children,
}: {
  formId: string;
  onCancel: () => void;
  busy: boolean;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="ghost" onClick={onCancel} disabled={busy}>
        Cancelar
      </Button>
      <Button type="submit" form={formId} loading={busy} disabled={disabled}>
        {children}
      </Button>
    </div>
  );
}

export function Notice({ children, tone = 'gold' }: { children: ReactNode; tone?: 'gold' | 'error' }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-[10px] px-3.5 py-2.5 text-[13px] leading-snug',
        tone === 'error' ? 'bg-enji-500/15 text-enji-300' : 'bg-kin-300/10 text-kin-200',
      )}
    >
      {children}
    </p>
  );
}
