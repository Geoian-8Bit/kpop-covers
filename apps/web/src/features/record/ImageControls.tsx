import { motion } from 'motion/react';
import { Lock, LockOpen, X } from 'lucide-react';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { cn } from '@/lib/cn';
import { jelly, soft } from '@/lib/motion';
import {
  canLock,
  canWhiteBalance,
  subscribeWhiteBalance,
  whiteBalanceHiddenNow,
  whiteBalanceVersion,
  type TrackInfo,
} from './camera';
import { formatExposure } from './quickExposureRules';
import { visiblePresets } from './whiteBalanceRules';

export interface ImageState {
  /** Exposure compensation (C3), 0 = as the camera meters. */
  exposure: number;
  /** White balance (C4), null = automatic. */
  kelvin: number | null;
  /** Focus and exposure held (C2). */
  locked: boolean;
}

export const IMAGE_DEFAULT: ImageState = { exposure: 0, kelvin: null, locked: false };

/**
 * Image controls for rehearsal rooms (C2–C4): exposure compensation, white balance and the focus/exposure
 * lock, each only when this camera offers it. Tap-to-focus (C1) lives on the preview itself.
 */
export function ImageControls({
  info,
  state,
  onExposure,
  onWhiteBalance,
  onLock,
  onClose,
}: {
  info: TrackInfo;
  state: ImageState;
  onExposure: (value: number) => void;
  onWhiteBalance: (kelvin: number | null) => void;
  onLock: (locked: boolean) => void;
  onClose: () => void;
}) {
  const ev = info.exposureCompensation;
  const step = ev?.step && ev.step > 0 ? ev.step : 0.1;
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // P24 · Re-render when this phone turns out to ignore the colour presets (the option then hides).
  useSyncExternalStore(subscribeWhiteBalance, whiteBalanceVersion);
  const whiteBalance = canWhiteBalance(info);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <motion.section
      role="dialog"
      aria-label="Imagen"
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={soft}
      onPointerDown={(e) => e.stopPropagation()}
      className="paper-raised absolute inset-x-3 bottom-[calc(max(18px,env(safe-area-inset-bottom))+150px)] z-40 mx-auto max-w-sm rounded-[16px] p-4 text-washi landscape:bottom-auto landscape:left-auto landscape:right-[calc(max(16px,env(safe-area-inset-right))+120px)] landscape:top-[max(12px,env(safe-area-inset-top))] landscape:w-80 max-h-[calc(100dvh-24px)] overflow-y-auto overscroll-contain landscape:max-h-[calc(100dvh-24px)]"
    >
      <header className="flex items-center gap-2">
        <h2 className="flex-1 font-display text-[17px] font-bold">Imagen</h2>
        <button
          ref={closeRef}
          type="button"
          aria-label="Cerrar los ajustes de imagen"
          onClick={onClose}
          className="grid size-11 place-items-center rounded-full hover:bg-washi/10"
        >
          <X className="size-5" />
        </button>
      </header>

      {ev && (
        <div className="mt-2">
          <div className="flex items-baseline justify-between">
            <label htmlFor="rec-exposure" className="text-[13px] font-bold text-washi-muted">
              Luz
            </label>
            <span className="tabular font-mono text-[13px] font-bold">
              {formatExposure(state.exposure)}
            </span>
          </div>
          <input
            id="rec-exposure"
            type="range"
            min={ev.min}
            max={ev.max}
            step={step}
            value={state.exposure}
            onChange={(e) => onExposure(Number(e.target.value))}
            className="mt-1 h-11 w-full cursor-pointer accent-kin-300"
            aria-valuetext={`${state.exposure > 0 ? 'más' : state.exposure < 0 ? 'menos' : 'sin cambio de'} luz, ${Math.abs(state.exposure).toFixed(1)}`}
          />
          <div className="flex justify-between text-[11px] text-washi-subtle">
            <span>Más oscuro</span>
            <button type="button" className="min-h-11 px-2 font-bold text-kin-300" onClick={() => onExposure(0)}>
              Restablecer
            </button>
            <span>Más claro</span>
          </div>
        </div>
      )}

      {!whiteBalance && whiteBalanceHiddenNow(info) && (
        <p role="status" className="mt-3 text-[12px] leading-snug text-washi-subtle">
          Este móvil no cambia el color de la luz desde el navegador: se queda en automático.
        </p>
      )}
      {whiteBalance && (
        <div className="mt-3">
          <p className="text-[13px] font-bold text-washi-muted">Color de la luz</p>
          <div role="radiogroup" aria-label="Balance de blancos" className="mt-1.5 flex flex-wrap gap-1.5">
            {visiblePresets(info.colorTemperature).map((wb) => {
              const active = state.kelvin === wb.kelvin;
              return (
                <motion.button
                  key={wb.label}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  whileTap={{ scale: 0.9 }}
                  transition={jelly}
                  onClick={() => onWhiteBalance(wb.kelvin)}
                  className={cn(
                    'min-h-11 rounded-full px-3.5 text-[13px] font-bold',
                    active ? 'bg-washi text-sumi-900' : 'bg-sumi-950/60 text-washi-muted',
                  )}
                >
                  {wb.label}
                </motion.button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[12px] leading-snug text-washi-subtle">
            Si la sala sale naranja, prueba «Fría»; si sale azulada, «Cálida».
          </p>
        </div>
      )}

      {canLock(info) && (
        <motion.button
          type="button"
          aria-pressed={state.locked}
          whileTap={{ scale: 0.96 }}
          transition={jelly}
          onClick={() => onLock(!state.locked)}
          className={cn(
            'mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] border text-[14px] font-bold',
            state.locked ? 'border-kin-300 bg-kin-300 text-sumi-900' : 'border-line-strong text-washi',
          )}
        >
          {state.locked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
          {state.locked ? 'Enfoque y luz fijos' : 'Fijar enfoque y luz'}
        </motion.button>
      )}
      <p className="mt-2 text-[12px] leading-snug text-washi-subtle">
        Toca la imagen para enfocar y medir la luz en ese punto; mantén pulsado para fijarlos.
      </p>
    </motion.section>
  );
}
