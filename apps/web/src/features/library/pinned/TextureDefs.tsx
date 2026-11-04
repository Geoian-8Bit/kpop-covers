/**
 * REQ-27 · Split out of PinnedClips.tsx: the shared SVG filter of the hanging items.
 *
 * Silk/paper fibres for the jade medallion. Only used on a surface that never changes shape (it moves as a whole
 * composited layer), so it is rasterised once.
 */
export function TextureDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
      <defs>
        <filter id="os-paper" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="2" />
          <feColorMatrix values="0 0 0 0 0.6  0 0 0 0 0.55  0 0 0 0 0.45  0 0 0 0.2 0" />
          <feComposite in2="SourceGraphic" operator="in" />
          <feBlend in2="SourceGraphic" mode="multiply" />
        </filter>
      </defs>
    </svg>
  );
}
