import { Download, Share, SquarePlus } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

const ios = typeof navigator !== 'undefined' && isIos();

/**
 * Install state for the PWA, shared by every install button. Chromium fires `beforeinstallprompt` once per
 * page load, often before any button exists (the phone menu is only mounted when opened): it is captured
 * here, at module load in the entry chunk, so no button can miss it or keep it to itself.
 * iOS Safari has no prompt, so we explain "Compartir → Añadir a pantalla de inicio" instead.
 */
let deferred: BeforeInstallPromptEvent | null = null;
let installed = typeof window !== 'undefined' && isStandalone();
let helpOpen = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    helpOpen = false;
    emit();
  });
}

const setHelp = (open: boolean) => {
  helpOpen = open;
  emit();
};

async function install(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  // A prompt can be shown only once; the browser fires a fresh event if it may be offered again.
  deferred = null;
  emit();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === 'accepted';
}

export function useInstallApp() {
  const prompt = useSyncExternalStore(subscribe, () => deferred);
  const done = useSyncExternalStore(subscribe, () => installed);
  return {
    available: !done && (Boolean(prompt) || ios),
    ios,
    install,
  };
}

export function InstallAppButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { available } = useInstallApp();

  if (!available) return null;

  return (
    <Button
      variant="secondary"
      size={compact ? 'sm' : 'md'}
      className={cn('w-full', className)}
      onClick={() => (ios ? setHelp(true) : void install())}
    >
      <Download className="size-4" /> Instalar app
    </Button>
  );
}

/**
 * The iPhone install steps. Rendered once by the shell, outside any menu: a button inside the phone menu
 * would take its dialog down with it when the first tap closes the menu.
 */
export function InstallAppHelp() {
  const open = useSyncExternalStore(subscribe, () => helpOpen);
  return (
    <Dialog open={open} onClose={() => setHelp(false)} title="Instalar en el iPhone" size="sm">
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
  );
}
