import { cn } from '@/lib/cn';
import { Seal } from './Seal';

export function LogoMark({ size = 34, className }: { size?: number; className?: string }) {
  return <Seal glyph="舞" size={size} className={className} />;
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      {!compact && <span className="font-display text-[21px] font-bold tracking-[-0.01em] text-washi">One Shoot</span>}
    </span>
  );
}
