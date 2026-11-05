import type { ButtonHTMLAttributes } from 'react';
import { useTapAnyFinger } from './tapAnyFinger';

export const signed = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(2).replace('.', ',')} s`;

/** A small pill like the studio's tray buttons: 38 px to the eye, 44 px to the finger. */
export const pill =
  "relative flex h-[38px] shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-bold transition-colors after:absolute after:inset-x-0 after:-inset-y-[3px] after:content-[''] disabled:opacity-40";
export const pillIdle = 'text-washi-muted hover:bg-washi/[0.07] hover:text-washi';

/** A plain review button that answers to any finger (see `useTapAnyFinger`). */
export function TapButton({
  onTap,
  disabled,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & { onTap: () => void }) {
  const tap = useTapAnyFinger(onTap, disabled);
  return <button {...rest} disabled={disabled} {...tap} />;
}
