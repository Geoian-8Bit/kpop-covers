import { motion } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import {
  APP_BUILD_DATE,
  APP_VERSION,
  checkForUpdate,
  confirmUpdate,
  postponeUpdate,
  resetUpdateStatus,
  savingCount,
  useUpdateStatus,
} from './appUpdate';
import { reloadNeedsConfirm, updateMessage, versionLabel } from './versionRules';

const needsConfirm = () =>
  reloadNeedsConfirm({
    pathname: window.location.pathname,
    dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
    saving: savingCount(),
  });

/**
 * P2 · «Versión 142 · 17-10-2026» and «Buscar actualización», with its answer read out (aria-live). `inMenu` makes
 * the buttons menu items of the «⋯» menu (arrow keys move between them).
 */
export function VersionCheck({ className, inMenu = false }: { className?: string; inMenu?: boolean }) {
  const status = useUpdateStatus((s) => s.status);
  const busy = status.kind === 'checking' || status.kind === 'downloading' || status.kind === 'applying';
  const message = updateMessage(status);
  const role = inMenu ? 'menuitem' : undefined;

  // A finished answer doesn't stay for the next time the menu opens.
  useEffect(() => () => resetUpdateStatus(), []);

  return (
    // In the «⋯» menu: a group, so its text and live answer are valid (and read) inside role="menu".
    <div className={className} role={inMenu ? 'group' : undefined} aria-label={inMenu ? 'Versión' : undefined}>
      <p className={cn('tabular font-mono font-bold text-kin-300', inMenu ? 'px-3 text-[12px]' : 'text-[13px]')}>
        {versionLabel(APP_VERSION, APP_BUILD_DATE)}
      </p>
      <button
        type="button"
        role={role}
        aria-disabled={busy || undefined}
        onClick={() => {
          if (!busy) void checkForUpdate(needsConfirm);
        }}
        className={cn(
          'mt-1 flex h-11 items-center gap-2.5 rounded-[10px] px-3 text-sm font-medium transition-colors',
          inMenu ? 'w-full text-washi-muted hover:bg-washi/[0.06] hover:text-washi' : '-ml-3 text-kin-300 hover:bg-washi/[0.05]',
          busy && 'opacity-70',
        )}
      >
        <motion.span
          aria-hidden
          animate={busy ? { rotate: 360 } : { rotate: 0 }}
          transition={busy ? { duration: 1, repeat: Infinity, ease: 'linear' } : { duration: 0 }}
          className="grid"
        >
          <RefreshCw className="size-4" />
        </motion.span>
        Buscar actualización
      </button>
      <p
        role="status"
        aria-live="polite"
        className={cn(
          'text-[13px] leading-snug',
          inMenu ? 'px-3' : '',
          status.kind === 'offline' || status.kind === 'error' ? 'text-enji-300' : 'text-washi-muted',
          message ? 'pb-1 pt-0.5' : 'sr-only',
        )}
      >
        {message}
      </p>
      {status.kind === 'confirm' && (
        <div className={cn('flex flex-wrap gap-2 pb-1 pt-1.5', inMenu && 'px-2')}>
          <Button role={role} onClick={confirmUpdate}>
            Actualizar ahora
          </Button>
          <Button variant="ghost" role={role} onClick={postponeUpdate}>
            Más tarde
          </Button>
        </div>
      )}
    </div>
  );
}
