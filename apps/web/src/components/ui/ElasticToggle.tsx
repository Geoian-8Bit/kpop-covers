import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';

interface ElasticToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /** Render the label text next to the switch. */
  showLabel?: boolean;
  icon?: ReactNode;
  className?: string;
}

const TRACK_W = 52;
const THUMB = 24;
const PAD = 4;
const STRETCH = 9;

/** Switch whose thumb stretches like mochi while pressed and springs over on release. */
export function ElasticToggle({ checked, onChange, label, showLabel = true, icon, className }: ElasticToggleProps) {
  const travel = TRACK_W - THUMB - PAD * 2;

  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={showLabel ? undefined : label}
      onClick={() => onChange(!checked)}
      initial={false}
      animate={checked ? 'on' : 'off'}
      whileTap="pressed"
      custom={checked}
      className={cn('group inline-flex min-h-11 items-center gap-3 rounded-[10px] pr-1 text-left', className)}
    >
      <span className="relative flex h-8 shrink-0 items-center rounded-full p-1" style={{ width: TRACK_W }}>
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full border"
          variants={{
            off: { backgroundColor: '#2e2721', borderColor: 'rgba(239,230,212,0.14)' },
            on: { backgroundColor: '#2f5584', borderColor: 'rgba(169,194,222,0.45)' },
          }}
          transition={{ duration: 0.25 }}
        />
        <motion.span
          aria-hidden
          className="relative block h-6 rounded-full bg-washi shadow-[0_2px_6px_rgb(0_0_0/0.45)]"
          variants={{
            off: { x: 0, width: THUMB },
            on: { x: travel, width: THUMB },
            pressed: (on: boolean) => ({ x: on ? travel - STRETCH : 0, width: THUMB + STRETCH }),
          }}
          transition={jelly}
        />
      </span>
      {showLabel && (
        <span className="flex items-center gap-1.5 text-sm font-medium text-washi-muted transition-colors group-aria-checked:text-washi">
          {icon}
          {label}
        </span>
      )}
    </motion.button>
  );
}
