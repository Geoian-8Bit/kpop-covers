import { cn } from '@/lib/cn';

/**
 * An original woodblock-style print in the spirit of the Great Wave off Kanagawa:
 * Prussian-blue swell, claw-like foam, a small Fuji, on washi paper.
 */
export function WaveArt({ className, cover = false }: { className?: string; cover?: boolean }) {
  return (
    <svg
      viewBox="0 0 480 360"
      preserveAspectRatio={cover ? 'xMidYMax slice' : 'xMidYMid meet'}
      className={cn('block', className)}
      role="img"
      aria-label="Grabado de una gran ola con el monte Fuji al fondo"
    >
      <defs>
        <filter id="wave-paper">
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" seed="3" />
          <feColorMatrix values="0 0 0 0 0.45 0 0 0 0 0.38 0 0 0 0 0.27 0 0 0 0.16 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <clipPath id="wave-frame">
          <rect width="480" height="360" />
        </clipPath>
      </defs>

      <g clipPath="url(#wave-frame)">
        {/* paper + sky */}
        <rect width="480" height="360" fill="#e9dcc2" />
        <rect width="480" height="120" fill="#d9c7a6" opacity="0.55" />
        <path d="M0 26 C120 18 260 34 480 22" stroke="#b9a37f" strokeWidth="1.2" fill="none" opacity="0.7" />
        <path d="M0 44 C140 38 300 52 480 40" stroke="#b9a37f" strokeWidth="1" fill="none" opacity="0.5" />

        {/* Fuji */}
        <path d="M282 278 L338 214 L394 278 Z" fill="#1f3b60" />
        <path d="M324 230 L338 214 L352 230 L346 228 L341 234 L336 228 L331 233 Z" fill="#efe6d4" />

        {/* far swell behind Fuji */}
        <path d="M230 360 C262 300 312 270 372 280 C420 288 452 314 480 300 L480 360 Z" fill="#2f5584" />
        <path d="M262 330 C300 296 350 288 398 300" stroke="#efe6d4" strokeOpacity="0.55" strokeWidth="2" fill="none" />

        {/* the great wave: body */}
        <path
          d="M0 360 L0 196 C26 128 86 60 168 42 C232 28 284 58 290 106 C294 142 266 166 238 156 C218 149 222 122 242 124 C254 125 258 138 250 144 C232 172 214 214 236 282 C246 314 266 342 292 360 Z"
          fill="#1f3b60"
        />
        {/* inner striations */}
        <path d="M10 300 C30 220 80 140 150 100" stroke="#7c9cc4" strokeWidth="2" fill="none" />
        <path d="M30 330 C52 248 104 166 170 128" stroke="#7c9cc4" strokeWidth="1.6" fill="none" opacity="0.8" />
        <path d="M60 352 C84 280 128 206 186 166" stroke="#7c9cc4" strokeWidth="1.4" fill="none" opacity="0.6" />
        <path d="M120 360 C138 300 168 246 206 214" stroke="#4d73a3" strokeWidth="1.4" fill="none" />

        {/* foam crest */}
        <path
          d="M40 150 C80 92 128 56 176 48 C228 40 272 64 282 104"
          stroke="#efe6d4"
          strokeWidth="9"
          strokeLinecap="round"
          fill="none"
        />
        <g fill="#efe6d4" stroke="#1f3b60" strokeWidth="1.4">
          <circle cx="282" cy="108" r="7" />
          <circle cx="274" cy="124" r="6" />
          <circle cx="288" cy="92" r="6" />
          <circle cx="262" cy="136" r="5" />
          <circle cx="284" cy="76" r="5" />
          <circle cx="270" cy="62" r="5.5" />
          <circle cx="252" cy="52" r="5" />
          <circle cx="232" cy="46" r="4.5" />
          <circle cx="296" cy="122" r="4" />
          <circle cx="300" cy="104" r="3.5" />
        </g>
        {/* spray */}
        <g fill="#efe6d4">
          <circle cx="314" cy="96" r="2.6" />
          <circle cx="322" cy="118" r="2" />
          <circle cx="308" cy="138" r="2.4" />
          <circle cx="330" cy="104" r="1.6" />
          <circle cx="318" cy="76" r="1.8" />
          <circle cx="300" cy="62" r="2" />
        </g>

        {/* foreground wave */}
        <path d="M150 360 C186 318 236 304 270 322 C292 334 290 356 270 352 C258 350 258 338 268 338 L300 360 Z" fill="#2f5584" />
        <path d="M170 352 C200 328 238 320 262 330" stroke="#efe6d4" strokeWidth="3" strokeLinecap="round" fill="none" />

        <rect width="480" height="360" filter="url(#wave-paper)" />
      </g>
      <rect x="0.5" y="0.5" width="479" height="359" fill="none" stroke="#3d342c" />
    </svg>
  );
}
