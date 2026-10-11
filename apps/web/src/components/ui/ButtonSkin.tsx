/**
 * The app's signature round-trip buttons (back, play/pause, add, slide arrows) drawn as kamon — family
 * crests: a kikkō hexagon with a gold rim and an inner hairline. Back is ink, actions are vermilion.
 * The rest of the interface follows the same crest geometry through the `.skin-*` classes in index.css.
 */
export type SkinKind = 'back' | 'play' | 'pause' | 'add';

/* Brush-drawn glyphs in a 24×24 box. */
const GLYPH: Record<SkinKind, string> = {
  back: 'M15.8 4.6C13.1 6.9 10 9.6 7.1 11.6c-.4.3-.4.6 0 .9 2.7 2.1 5.6 4.7 8.2 7.1.5.4 1.1-.1.7-.6-2-2.4-4.2-4.7-6.2-6.9 2.1-2.1 4.3-4.5 6.6-6.8.4-.5-.1-1.1-.6-.7ZM16.1 3.85a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3Z',
  play: 'M8 5.2c0-.8.9-1.3 1.6-.8l9 6.6c.6.4.6 1.3 0 1.7l-9 6.6c-.7.5-1.6 0-1.6-.8z',
  pause:
    'M7.4 5.2c.9-.3 2.2-.2 2.8.2.3 4.4.3 9.2-.1 13.6-.7.4-2 .4-2.7 0-.4-4.6-.4-9.2 0-13.8zM13.9 5.2c.9-.3 2.2-.2 2.8.2.3 4.4.3 9.2-.1 13.6-.7.4-2 .4-2.7 0-.4-4.6-.4-9.2 0-13.8z',
  add: 'M5 12.4c3.5-.8 10.5-1.3 14.2-.7.6.1.6.9 0 1-3.6.4-10.4.8-14 .9-.8 0-.9-1-.2-1.2zM12.3 4.8c.5 3.6.8 10.4.4 14.6 0 .6-.9.6-.9 0-.5-4-.8-10.6-.5-14.4.1-.8.9-.8 1-.2z',
};

/** The crest face of a button, filling its parent. `ink` forces the black-and-gold version. */
export function ButtonSkin({ kind, ink = kind === 'back' }: { kind: SkinKind; ink?: boolean }) {
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
      <path
        d={GLYPH[kind]}
        fill={ink ? 'var(--color-kin-300)' : 'var(--color-washi)'}
        transform={kind === 'play' ? 'translate(12.8 12)' : 'translate(12 12)'}
      />
    </svg>
  );
}
