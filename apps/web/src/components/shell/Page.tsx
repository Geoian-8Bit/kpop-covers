import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { easeOutExpo } from '@/lib/motion';

/** Enter animation wrapper for routed pages. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: easeOutExpo }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
