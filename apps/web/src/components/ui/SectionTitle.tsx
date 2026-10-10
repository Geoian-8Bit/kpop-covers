import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface SectionTitleProps {
  children: ReactNode;
  /** Kanji set at the end of the rule, like the cartouche on a woodblock print. */
  glyph?: string;
  /** Extra content after the title (count, actions). */
  aside?: ReactNode;
  as?: 'h1' | 'h2' | 'h3';
  id?: string;
  className?: string;
}

/** Mincho title · hairline rule · kanji. Shared heading for every tile and dialog. */
export function SectionTitle({ children, glyph, aside, as: Tag = 'h2', id, className }: SectionTitleProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Tag id={id} className="shrink-0 font-display text-[19px] font-bold leading-tight text-washi">
        {children}
      </Tag>
      {aside}
      <span aria-hidden className="h-px min-w-6 flex-1 bg-gradient-to-r from-washi/25 to-washi/5" />
      {glyph && (
        <span aria-hidden className="shrink-0 font-display text-[15px] font-bold tracking-[0.08em] text-shu-400">
          {glyph}
        </span>
      )}
    </div>
  );
}
