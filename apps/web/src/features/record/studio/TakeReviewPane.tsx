import { formatTime } from '@coverscape/shared';
import { motion } from 'motion/react';
import { Check, Download, Library, RefreshCw, Share } from 'lucide-react';
import { memo } from 'react';
import { Button } from '@/components/ui/Button';
import { useSaveTake } from '@/data/takes';
import { cn } from '@/lib/cn';
import { soft } from '@/lib/motion';
import { IS_IOS, canShareFile } from '../recorder';
import { preloadInfoPanel } from './lazyPanels';
import type { Take } from './types';
import type { SaveTake } from './useReviewActions';

/** Review: the take on its own (its own sound, song quiet), actions in their own strip so nothing covers its controls. */
export const TakeReviewPane = memo(function TakeReviewPane({
  take,
  seconds,
  saved,
  kept,
  keeping,
  canKeep,
  fromClap,
  keepMsg,
  notice,
  onDetails,
  onKeep,
  onSave,
  onShare,
  onAgain,
  onArmAgain,
}: {
  take: Take;
  seconds: number;
  saved: boolean;
  kept: boolean;
  keeping: boolean;
  canKeep: boolean;
  fromClap: boolean;
  keepMsg: { text: string; error: boolean } | null;
  notice: string;
  onDetails: () => void;
  onKeep: (save: SaveTake) => void;
  onSave: () => void;
  onShare: () => void;
  onAgain: () => void;
  onArmAgain: () => void;
}) {
  const saveTake = useSaveTake();
  return (
    <div className="absolute inset-0 flex flex-col bg-black landscape:flex-row">
      <video
        src={take.url}
        controls
        autoPlay
        playsInline
        loop
        className="min-h-0 w-full flex-1 bg-black object-contain pt-[calc(max(14px,env(safe-area-inset-top))+48px)] landscape:h-full landscape:min-w-0 landscape:pt-0"
      />
      <div className="flex flex-col items-center gap-3 px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-4 landscape:w-64 landscape:shrink-0 landscape:justify-center landscape:pb-4 landscape:pr-[max(16px,env(safe-area-inset-right))]">
        <p className="tabular text-[12px] text-washi/75">
          {seconds >= 0 ? `${formatTime(seconds)} · ` : 'Recuperada · '}
          {(take.file.size / 1_048_576).toFixed(1).replace('.', ',')} MB
          {saved ? ' · guardado' : ''}
          {' · '}
          <button
            type="button"
            onClick={onDetails}
            onPointerDown={preloadInfoPanel}
            className="inline-flex min-h-11 items-center font-bold text-kin-300 underline-offset-2 hover:underline"
          >
            Detalles
          </button>
        </p>
        <div className="flex w-full max-w-md flex-wrap items-center justify-center gap-2 landscape:flex-col landscape:items-stretch">
          {canKeep && (
            <Button onClick={() => onKeep(saveTake)} loading={keeping} disabled={kept}>
              {kept ? <Check className="size-4" /> : <Library className="size-4" />}
              {kept ? 'En «Tomas»' : 'Guardar en «Tomas»'}
            </Button>
          )}
          <Button variant={canKeep ? 'secondary' : 'primary'} onClick={onSave}>
            {saved ? <Check className="size-4" /> : <Download className="size-4" />}
            {IS_IOS ? 'Guardar en Fotos' : 'Descargar'}
          </Button>
          {!IS_IOS && canShareFile(take.file) && (
            <Button variant="secondary" onClick={onShare}>
              <Share className="size-4" /> Compartir
            </Button>
          )}
          <Button variant="secondary" disabled={keeping} onClick={onAgain}>
            <RefreshCw className="size-4" /> Repetir
          </Button>
          {fromClap && (
            <Button variant="secondary" disabled={keeping} onClick={onArmAgain}>
              <span aria-hidden className="font-display text-[15px] font-extrabold leading-none">
                拍
              </span>
              Armar otra vez
            </Button>
          )}
        </div>
        <div aria-live="polite" className="w-full max-w-md empty:hidden">
          {(keepMsg ?? (notice ? { text: notice, error: false } : null)) && (
            <motion.p
              key={keepMsg?.text ?? notice}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={soft}
              role={keepMsg?.error ? 'alert' : 'status'}
              className={cn(
                'rounded-[10px] px-3 py-2 text-center text-[13px] leading-snug',
                keepMsg?.error ? 'bg-enji-700/70 text-enji-200' : 'bg-sumi-900/90 text-washi',
              )}
            >
              {keepMsg?.text ?? notice}
            </motion.p>
          )}
        </div>
      </div>
    </div>
  );
});
