// Grain alpha is baked into the noise (no layer opacity, no blend mode), so the full-viewport layer stays a plain
// composited bitmap. 0.005 ≈ the old 0.5 × 4.5% opacity, scaled for normal vs soft-light blending on the dark ground.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.95 0 0 0 0 0.92 0 0 0 0 0.87 0 0 0 0.005 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/**
 * Even seigaiha (青海波) wave-scale pattern over the whole app, with a touch of washi grain.
 * Also hosts the shared SVG filter (stamp ink texture) used by <Seal>.
 */
export function Backdrop() {
  return (
    <div aria-hidden className="seigaiha pointer-events-none fixed inset-0 -z-10">
      <div className="absolute inset-0" style={{ backgroundImage: GRAIN }} />
      <svg width="0" height="0" className="absolute">
        <defs>
          <filter id="ink-rough" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="rough" />
            <feComponentTransfer in="noise" result="speckle">
              <feFuncA type="discrete" tableValues="1 1 1 1 1 1 1 0 1 1" />
            </feComponentTransfer>
            <feComposite in="rough" in2="speckle" operator="in" />
          </filter>
        </defs>
      </svg>
    </div>
  );
}
