import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { overlayHost } from '@/components/ui/overlayHost';
import { jelly } from '@/lib/motion';

type Tone = 'info' | 'success' | 'error';
interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

type ToastFn = (message: string, tone?: Tone) => void;
const ToastContext = createContext<ToastFn | null>(null);

const icons = {
  info: <Info className="size-4.5 text-ai-300" />,
  success: <CheckCircle2 className="size-4.5 text-kin-300" />,
  error: <AlertCircle className="size-4.5 text-enji-300" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  /** Hide timers by message: repeating a message restarts its timer instead of stacking a copy. */
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Native fullscreen only shows the fullscreen element's subtree: toasts must live inside it (the whole page's
  // fullscreen, Random Play Dance, keeps them in body: see overlayHost). The studio's CSS fullscreen needs nothing:
  // its layer sits at z-75 and the toasts' z-100 on body is already above it.
  const [host, setHost] = useState<Element>(() => document.body);

  useEffect(() => {
    const onChange = () => setHost(document.fullscreenElement ? overlayHost() : document.body);
    document.addEventListener('fullscreenchange', onChange);
    const pending = timers.current;
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      pending.forEach(clearTimeout);
    };
  }, []);

  const toast = useCallback<ToastFn>((message, tone = 'info') => {
    const key = `${tone}:${message}`;
    const existing = timers.current.get(key);
    if (existing) clearTimeout(existing);
    // Decide on what is on screen, not on the timer: a toast pushed out by newer ones still has a timer
    // running, and its repeat must show again instead of only restarting that timer.
    const id = nextId.current++;
    setToasts((current) =>
      current.some((t) => `${t.tone}:${t.message}` === key) ? current : [...current.slice(-2), { id, message, tone }],
    );
    timers.current.set(
      key,
      setTimeout(() => {
        timers.current.delete(key);
        setToasts((current) => current.filter((t) => `${t.tone}:${t.message}` !== key));
      }, tone === 'error' ? 5200 : 3200),
    );
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {createPortal(
      <div
        data-toast-host
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[max(20px,calc(env(safe-area-inset-bottom)+12px))] z-[100] flex flex-col items-center gap-2 px-4"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95, transition: { duration: 0.14 } }}
              transition={jelly}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className="paper-raised pointer-events-auto flex max-w-md items-center gap-2.5 rounded-[12px] py-2.5 pl-3.5 pr-5 text-sm text-washi"
            >
              {icons[t.tone]}
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>,
      host,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
