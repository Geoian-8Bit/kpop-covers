import { formatSpeed } from '@coverscape/shared';
import { FileVideo } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import type { useToast } from '@/providers/ToastProvider';
import { OriginalFile, OriginalYouTube } from './ReviewMedia';

/**
 * The original's panel content: the file (uploaded or linked, F1), YouTube's player, a spinner while the file loads,
 * or a note when there is none here. REQ-27 · Moved out of `ReviewScreen`.
 */
export function ReviewOriginal({
  source,
  fileUrl,
  youtubeId,
  toast,
}: {
  source: 'file' | 'youtube' | 'loading' | 'none';
  fileUrl: string | null;
  youtubeId: string | null;
  toast: ReturnType<typeof useToast>;
}) {
  if (source === 'file' && fileUrl) return <OriginalFile url={fileUrl} />;
  if (source === 'youtube' && youtubeId)
    return (
      <OriginalYouTube
        videoId={youtubeId}
        onRateAdjusted={(actual) =>
          toast(
            `YouTube no admite esa velocidad en este vídeo: el original va a ${formatSpeed(actual)} y se recoloca de vez en cuando.`,
            'info',
          )
        }
        onStuck={() => toast('YouTube no ha arrancado: toca ▶ otra vez para seguir.', 'info')}
      />
    );
  if (source === 'loading')
    return (
      <div className="grid size-full place-items-center">
        <Spinner className="size-7 text-washi-muted" />
      </div>
    );
  return (
    <div className="seigaiha grid size-full place-items-center p-4 text-center">
      <p className="flex max-w-[16rem] flex-col items-center gap-2 text-[13px] text-washi-muted">
        <FileVideo className="size-6 text-kin-300" />
        El archivo del vídeo no está en este dispositivo ni en la nube. Vincúlalo en el estudio para
        compararlo.
      </p>
    </div>
  );
}
