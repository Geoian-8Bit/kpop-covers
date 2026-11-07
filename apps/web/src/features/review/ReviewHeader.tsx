import { Columns2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import type { CompareMode } from './reviewRules';
import type { useTapAnyFinger } from './tapAnyFinger';

export const OVERLAY_NEEDS_FILE = 'Necesita el archivo del vídeo: vincúlalo en el estudio.';

/**
 * The review's title row: close, «Repaso», whose take and when, and how to compare. A phone on its side has no
 * header (the stage takes the whole height); the title stays for screen readers. REQ-27 · Moved out of `ReviewScreen`.
 */
export function ReviewHeader({
  low,
  titleId,
  subtitle,
  closeTap,
  hasOriginal,
  layoutId,
  mode,
  solo,
  onMode,
  canOverlay,
  onOverlayRefused,
}: {
  low: boolean;
  titleId: string;
  /** «Who · when». */
  subtitle: string;
  closeTap: ReturnType<typeof useTapAnyFinger<HTMLButtonElement>>;
  hasOriginal: boolean;
  layoutId: string;
  mode: CompareMode;
  /** «Solo toma»: the take alone; the header offers the way back to comparing. */
  solo: boolean;
  onMode: (mode: CompareMode) => void;
  canOverlay: boolean;
  onOverlayRefused: () => void;
}) {
  if (low) {
    return (
      <h2 id={titleId} className="sr-only">
        Repaso · {subtitle}
      </h2>
    );
  }
  return (
    <header className="sep-b flex shrink-0 items-center gap-2 bg-sumi-900 pb-1.5 pl-[max(8px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] pt-[max(6px,env(safe-area-inset-top))]">
      <Button variant="ghost" size="icon" aria-label="Cerrar el repaso" {...closeTap}>
        <X className="size-6" />
      </Button>
      <div className="min-w-0 flex-1">
        <h2
          id={titleId}
          className="flex items-baseline gap-1.5 truncate font-display text-[19px] font-bold leading-tight"
        >
          Repaso{' '}
          <span aria-hidden className="text-[14px] text-shu-400">
            比
          </span>
        </h2>
        <p className="truncate text-[12px] text-washi-muted">{subtitle}</p>
      </div>
      {solo ? (
        <Button variant="secondary" size="sm" className="min-h-11" onClick={() => onMode(mode)}>
          <Columns2 className="size-4" /> Comparar
        </Button>
      ) : (
        hasOriginal && (
          <Segmented
            label="Cómo comparar"
            layoutId={layoutId}
            size="sm"
            value={mode}
            onChange={onMode}
            onDisabled={onOverlayRefused}
            options={[
              { value: 'stacked', label: 'Separados' },
              {
                value: 'overlay',
                label: 'Superpuesto',
                disabled: !canOverlay,
                ariaLabel: canOverlay ? undefined : `Superpuesto, no disponible: ${OVERLAY_NEEDS_FILE}`,
              },
            ]}
          />
        )
      )}
    </header>
  );
}
