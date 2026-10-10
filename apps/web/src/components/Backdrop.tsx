const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.94 0 0 0 0 0.9 0 0 0 0 0.83 0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/**
 * Sumi ground with washi grain and a seigaiha tide along the bottom edge.
 * Also hosts the shared SVG filters (stamp ink texture) used by <Seal>.
 */
export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-sumi-900">
      <div
        className="seigaiha absolute -inset-x-12 bottom-0 h-[34vh] opacity-60 animate-tide"
        style={{ maskImage: 'linear-gradient(to top, black 0%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to top, black 0%, transparent 100%)' }}
      />
      <div className="absolute inset-0 opacity-[0.05] mix-blend-soft-light" style={{ backgroundImage: GRAIN }} />
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
