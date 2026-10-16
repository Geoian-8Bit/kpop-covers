import { motion } from 'motion/react';
import { cn } from '@/lib/cn';

/**
 * Rule-of-thirds lines (A1 «Rejilla»): fine washi hairlines at low opacity, never in the way of a tap.
 * Covers its parent; with `aspect` (the picture's width ÷ height) it covers only the picture as `object-contain`
 * shows it, not the black bands around it.
 */
export function GridOverlay({ aspect, className }: { aspect?: number; className?: string }) {
  const lines = (
    <>
      {[1, 2].map((n) => (
        <span
          key={`v${n}`}
          className="absolute inset-y-0 w-px -translate-x-1/2 bg-washi/35 shadow-[0_0_1px_rgb(0_0_0/0.45)]"
          style={{ left: `${(n * 100) / 3}%` }}
        />
      ))}
      {[1, 2].map((n) => (
        <span
          key={`h${n}`}
          className="absolute inset-x-0 h-px -translate-y-1/2 bg-washi/35 shadow-[0_0_1px_rgb(0_0_0/0.45)]"
          style={{ top: `${(n * 100) / 3}%` }}
        />
      ))}
    </>
  );
  return (
    <motion.div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0',
        aspect && 'grid place-items-center [container-type:size]',
        className,
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {aspect ? (
        <div
          className="relative max-h-full"
          style={{ aspectRatio: String(aspect), width: `min(100cqw, calc(100cqh * ${aspect}))` }}
        >
          {lines}
        </div>
      ) : (
        lines
      )}
    </motion.div>
  );
}
