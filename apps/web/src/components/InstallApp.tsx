import { Download, Share, SquarePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Install state for the PWA: Chromium browsers fire `beforeinstallprompt`; iOS Safari has no prompt,
 * so we explain "Compartir → Añadir a pantalla de inicio" instead. Hidden once installed.
 */
export function useInstallApp() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const ios = isIos();

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return {
    available: !installed && (Boolean(deferred) || ios),
    ios,
    async install() {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      setDeferred(null);
      return outcome === 'accepted';
    },
  };
}

export function InstallAppButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { available, ios, install } = useInstallApp();
  const [help, setHelp] = useState(false);

  if (!available) return null;

  return (
    <>
      <Button
        variant="secondary"
        size={compact ? 'sm' : 'md'}
        className={cn('w-full', className)}
        onClick={() => (ios ? setHelp(true) : void install())}
      >
        <Download className="size-4" /> Instalar app
      </Button>
      <Dialog open={help} onClose={() => setHelp(false)} title="Instalar en el iPhone" size="sm">
        <ol className="space-y-4 text-[15px] text-washi-muted">
          <li className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-[6px] bg-shu-500 font-display text-sm font-bold text-washi">1</span>
            <span>
              Abre esta página en <span className="font-bold text-washi">Safari</span> y toca{' '}
              <Share className="inline size-4 align-[-2px] text-ai-300" aria-label="Compartir" /> <span className="font-bold text-washi">Compartir</span>.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-[6px] bg-shu-500 font-display text-sm font-bold text-washi">2</span>
            <span>
              Elige <SquarePlus className="inline size-4 align-[-2px] text-ai-300" aria-hidden />{' '}
              <span className="font-bold text-washi">Añadir a pantalla de inicio</span>.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-[6px] bg-shu-500 font-display text-sm font-bold text-washi">3</span>
            <span>Abre One Shoot desde el icono: se verá a pantalla completa, como una app.</span>
          </li>
        </ol>
      </Dialog>
    </>
  );
}
