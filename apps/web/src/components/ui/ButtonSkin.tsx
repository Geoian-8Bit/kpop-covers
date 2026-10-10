import { useId } from 'react';
import { create } from 'zustand';
import { Segmented } from '@/components/ui/Segmented';

/**
 * Trial skins for the app's signature buttons (back, play/pause, add). "actual" keeps the existing
 * look; "enso" draws a one-stroke zen brush circle on washi; "kamon" frames the icon in a family crest;
 * "imperial" is black-garnet lacquer with a gold rim and gold glyphs.
 * The choice is per device and only meant while the group decides.
 */
export type ButtonStyle = 'actual' | 'enso' | 'kamon' | 'imperial';
export type SkinKind = 'back' | 'play' | 'pause' | 'add';

const KEY = 'coverscape.buttonStyle';

/** The skin is a document-level attribute so plain CSS can reshape every component at once. */
function apply(style: ButtonStyle) {
  if (typeof document !== 'undefined') document.documentElement.dataset.skin = style;
}

function read(): ButtonStyle {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'enso' || v === 'kamon' || v === 'imperial' || v === 'actual') return v;
  } catch {
    /* storage blocked */
  }
  return 'actual';
}

const initial = read();
apply(initial);

export const useButtonStyle = create<{ style: ButtonStyle; setStyle: (s: ButtonStyle) => void }>((set) => ({
  style: initial,
  setStyle(style) {
    apply(style);
    set({ style });
    try {
      localStorage.setItem(KEY, style);
    } catch {
      /* applied for this visit only */
    }
  },
}));

export function ButtonStylePicker({ className }: { className?: string }) {
  const style = useButtonStyle((s) => s.style);
  const setStyle = useButtonStyle((s) => s.setStyle);
  return (
    <div className={className}>
      <p className="mb-1.5 px-1 text-[11px] font-medium text-washi-subtle">Estilo de la interfaz (prueba)</p>
      <Segmented
        label="Estilo de la interfaz"
        layoutId="button-style"
        size="sm"
        value={style}
        onChange={setStyle}
        options={[
          { value: 'actual', label: 'Actual' },
          { value: 'enso', label: 'Ensō' },
          { value: 'kamon', label: 'Kamon' },
          { value: 'imperial', label: 'Imperial' },
        ]}
        className="w-full [&>button]:flex-1 [&>button]:px-1.5 [&>button]:text-[12px]"
      />
    </div>
  );
}

/* Brush-drawn glyphs in a 24×24 box. */
const GLYPH: Record<SkinKind, string> = {
  back: 'M15.8 4.6C13.1 6.9 10 9.6 7.1 11.6c-.4.3-.4.6 0 .9 2.7 2.1 5.6 4.7 8.2 7.1.5.4 1.1-.1.7-.6-2-2.4-4.2-4.7-6.2-6.9 2.1-2.1 4.3-4.5 6.6-6.8.4-.5-.1-1.1-.6-.7ZM16.1 3.85a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3Z',
  play: 'M8 5.2c0-.8.9-1.3 1.6-.8l9 6.6c.6.4.6 1.3 0 1.7l-9 6.6c-.7.5-1.6 0-1.6-.8z',
  pause:
    'M7.4 5.2c.9-.3 2.2-.2 2.8.2.3 4.4.3 9.2-.1 13.6-.7.4-2 .4-2.7 0-.4-4.6-.4-9.2 0-13.8zM13.9 5.2c.9-.3 2.2-.2 2.8.2.3 4.4.3 9.2-.1 13.6-.7.4-2 .4-2.7 0-.4-4.6-.4-9.2 0-13.8z',
  add: 'M5 12.4c3.5-.8 10.5-1.3 14.2-.7.6.1.6.9 0 1-3.6.4-10.4.8-14 .9-.8 0-.9-1-.2-1.2zM12.3 4.8c.5 3.6.8 10.4.4 14.6 0 .6-.9.6-.9 0-.5-4-.8-10.6-.5-14.4.1-.8.9-.8 1-.2z',
};

const PETAL = 'M0-21C6-21 9-15 6-11 3-15-3-15-6-11-9-15-6-21 0-21Z';

/**
 * The drawn face of a skinned button, filling its parent. Returns null for the "actual" style so
 * callers keep rendering their original button.
 */
export function ButtonSkin({ kind, style }: { kind: SkinKind; style: ButtonStyle }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (style === 'actual') return null;

  if (style === 'imperial') {
    // Black-garnet urushi disc, gold rim and inner hairline, a soft sheen and a gold glyph.
    return (
      <svg viewBox="0 0 44 44" className="size-full overflow-visible" aria-hidden>
        <circle cx="22" cy="22" r="21" fill="var(--color-kin-400)" />
        <circle cx="22" cy="22" r="19.2" fill="var(--color-sumi-950)" />
        <circle
          cx="22"
          cy="22"
          r="19.2"
          fill="var(--color-enji-500)"
          fillOpacity={kind === 'play' || kind === 'pause' ? 0.55 : 0.28}
        />
        <circle cx="22" cy="22" r="16" fill="none" stroke="var(--color-kin-300)" strokeOpacity="0.35" strokeWidth="0.8" />
        <ellipse cx="16" cy="13" rx="9" ry="4.5" fill="var(--color-washi)" fillOpacity="0.1" transform="rotate(-28 16 13)" />
        <path d={GLYPH[kind]} fill="var(--color-kin-300)" transform="translate(10 10)" />
      </svg>
    );
  }

  const accent = kind === 'back' ? 'var(--color-sumi-950)' : 'var(--color-shu-500)';

  if (style === 'enso') {
    return (
      <svg viewBox="0 0 48 48" className="size-full overflow-visible" aria-hidden>
        <defs>
          <filter id={`${id}p`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="3" />
            <feColorMatrix values="0 0 0 0 .55  0 0 0 0 .5  0 0 0 0 .42  0 0 0 .25 0" />
            <feComposite in2="SourceGraphic" operator="in" />
            <feBlend in2="SourceGraphic" mode="multiply" />
          </filter>
          <filter id={`${id}i`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" />
          </filter>
        </defs>
        <circle cx="24" cy="24" r="22" fill="var(--color-washi)" filter={`url(#${id}p)`} />
        {/* One brush stroke, left open near the top right like a real ensō. */}
        <path
          d="M40 16A18 18 0 1 0 41 27"
          stroke={accent}
          strokeWidth="3.8"
          fill="none"
          strokeLinecap="round"
          filter={`url(#${id}i)`}
        />
        <path d={GLYPH[kind]} fill={accent} transform="translate(12 12)" />
      </svg>
    );
  }

  // Kamon: back is an ink hexagon (kikkō) with a gold rim; play/pause is a vermilion five-petal crest;
  // add is a vermilion hexagon.
  if (kind === 'play' || kind === 'pause') {
    return (
      <svg viewBox="0 0 58 58" className="size-full overflow-visible" aria-hidden>
        <g transform="translate(29 29)">
          <circle r="27" fill="var(--color-shu-500)" />
          <circle r="27" fill="none" stroke="var(--color-kin-400)" strokeWidth="1.2" />
          <g fill="none" stroke="var(--color-washi)" strokeOpacity="0.7" strokeWidth="1.3">
            {[0, 72, 144, 216, 288].map((a) => (
              <path key={a} d={PETAL} transform={`rotate(${a})`} />
            ))}
          </g>
          <circle r="11.5" fill="var(--color-shu-500)" />
        </g>
        <path d={GLYPH[kind]} fill="var(--color-washi)" transform="translate(18 18) scale(0.92)" />
      </svg>
    );
  }
  const ink = kind === 'back';
  return (
    <svg viewBox="0 0 48 48" className="size-full overflow-visible" aria-hidden>
      <polygon
        points="24,2 43,13 43,35 24,46 5,35 5,13"
        fill={ink ? 'var(--color-sumi-950)' : 'var(--color-shu-500)'}
        stroke="var(--color-kin-400)"
        strokeWidth="1.6"
      />
      <polygon
        points="24,7 38.5,15.5 38.5,32.5 24,41 9.5,32.5 9.5,15.5"
        fill="none"
        stroke={ink ? 'var(--color-kin-400)' : 'var(--color-washi)'}
        strokeOpacity="0.45"
      />
      <path d={GLYPH[kind]} fill={ink ? 'var(--color-kin-300)' : 'var(--color-washi)'} transform="translate(12 12)" />
    </svg>
  );
}
