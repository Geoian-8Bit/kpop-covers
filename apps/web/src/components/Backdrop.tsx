/**
 * Even seigaiha (青海波) wave-scale pattern over the whole app. (A washi grain layer used to sit on top,
 * but at an alpha of 0.005 it rounded to nothing on screen while still costing a full-viewport layer.)
 * Also hosts the shared SVG filter (stamp ink texture) used by <Seal>.
 *
 * REQ-09 · `100lvh` (large viewport) keeps its height when the browser bar shows or hides, so it is not rasterised
 * again; where `lvh` is unknown the declaration is dropped and `inset-0` still covers the screen.
 */
export function Backdrop() {
  return (
    <div aria-hidden className="seigaiha pointer-events-none fixed inset-0 top-0 -z-10 h-[100lvh]">
      <svg width="0" height="0" className="absolute">
        <defs>
          <filter id="ink-rough" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="1.6"
              xChannelSelector="R"
              yChannelSelector="G"
              result="rough"
            />
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
