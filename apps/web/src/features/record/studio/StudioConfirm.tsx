import { AnimatePresence, motion } from 'motion/react';
import { memo } from 'react';
import { Button } from '@/components/ui/Button';
import { soft } from '@/lib/motion';
import type { Confirm } from './types';

/** Inside the studio (above it), not a page Dialog: the studio covers every layer below it. */
export const StudioConfirm = memo(function StudioConfirm({
  confirm,
  reviewing,
  onCancel,
  onDiscard,
}: {
  confirm: Confirm | null;
  reviewing: boolean;
  onCancel: () => void;
  onDiscard: (exit?: boolean) => void;
}) {
  return (
    <AnimatePresence>
      {confirm && (
        <motion.div
          className="absolute inset-0 z-30 grid grid-rows-[minmax(0,1fr)] place-items-center bg-sumi-950/80 p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="record-discard-title"
            aria-describedby="record-discard-text"
            // Big system text on a turned phone: the card scrolls instead of pushing its buttons off screen.
            className="paper-raised max-h-full w-full max-w-sm overflow-y-auto overscroll-contain rounded-[16px] p-6"
            initial={{ y: 24, scale: 0.97 }}
            animate={{ y: 0, scale: 1, transition: soft }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="record-discard-title"
              className="font-display text-[22px] font-bold leading-tight text-washi"
            >
              {confirm === 'leftover' ? '¿Descartar la toma sin guardar?' : '¿Descartar la toma?'}
            </h2>
            <p id="record-discard-text" className="mt-2 text-sm leading-relaxed text-washi-muted">
              {confirm === 'leftover'
                ? 'Se borra de este móvil y no se puede recuperar.'
                : reviewing
                  ? 'Aún no la has guardado en el móvil. Si la descartas, se pierde.'
                  : 'Lo grabado hasta ahora se pierde.'}
              {confirm !== 'leftover' &&
                confirm !== 'rearm' &&
                confirm !== 'close' &&
                ' Después, la cámara queda lista para otra toma.'}
            </p>
            {/* Asked from «Cerrar» (or «Atrás»): the main action is what was asked, leaving; staying is the other one. */}
            {confirm === 'close' ? (
              <div className="mt-5 flex flex-col gap-2">
                <Button variant="danger" onClick={() => onDiscard(true)}>
                  Descartar y salir
                </Button>
                <Button variant="secondary" onClick={() => onDiscard()}>
                  Descartar y seguir grabando
                </Button>
                <Button variant="ghost" autoFocus onClick={onCancel}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <Button variant="ghost" autoFocus onClick={onCancel}>
                  Cancelar
                </Button>
                <Button variant="danger" onClick={() => onDiscard()}>
                  Descartar
                </Button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
