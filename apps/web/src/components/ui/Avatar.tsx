import { cn } from '@/lib/cn';

interface AvatarProps {
  name: string;
  hue?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = { sm: 'size-7 text-[11px]', md: 'size-9 text-[13px]', lg: 'size-12 text-base' } as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

/** Muted, dyed-cloth colour per person (hue from their profile). */
export function Avatar({ name, hue = 350, size = 'md', className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full border border-washi/20 font-display font-bold text-washi',
        sizes[size],
        className,
      )}
      style={{ backgroundColor: `hsl(${hue} 32% 34%)` }}
    >
      {initials(name)}
    </span>
  );
}
