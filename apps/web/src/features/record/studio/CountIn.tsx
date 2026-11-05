import { AnimatePresence, motion } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import { memo } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { jelly } from '@/lib/motion';
import type { Phase } from './types';

/** The count-in's big numbers, what is being waited for (song, video, camera), and a camera that won't open. */
export const CountIn = memo(function CountIn({
  phase,
  left,
  starting,
  showCamera,
  error,
  supported,
  onRetry,
}: {
  phase: Phase;
  left: number;
  /** The camera is opening. */
  starting: boolean;
  showCamera: boolean;
  /** The camera's error, when it has one. */
  error: string | null;
  supported: boolean;
  onRetry: () => void;
}) {
  return (
    <>
      {/* Count-in */}
      <AnimatePresence>
        {phase === 'countdown' && left > 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <motion.span
              key={left}
              initial={{ scale: 1.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={jelly}
              className="font-display text-[9rem] font-extrabold leading-none text-washi [text-shadow:0_8px_36px_rgb(0_0_0/0.75)]"
            >
              {left}
            </motion.span>
          </div>
        )}
      </AnimatePresence>

      {(phase === 'arming' || phase === 'finishing' || (starting && showCamera)) && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-[13px]">
            <Spinner className="size-4" />
            {phase === 'arming'
              ? 'Arrancando la canción…'
              : phase === 'finishing'
                ? 'Preparando el vídeo…'
                : 'Abriendo la cámara…'}
          </span>
        </div>
      )}

      {showCamera && (error != null || !supported) && (
        <div className="absolute inset-0 grid place-items-center p-8 text-center">
          <div className="max-w-sm">
            <p className="text-[15px] leading-relaxed">
              {supported
                ? error
                : 'Este navegador no puede grabar vídeo. Prueba en Chrome o Safari actualizados.'}
            </p>
            {supported && (
              <Button className="mt-5" variant="secondary" onClick={onRetry}>
                <RefreshCw className="size-4" /> Reintentar
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
});
