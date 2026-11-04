import { cn } from '@/lib/cn';
import { rememberStage } from '@/lib/stagePref';
import { usePlayer } from '@/player/store';
import type { Video } from '@coverscape/shared';
import { FileVideo, Youtube } from 'lucide-react';

const SOURCES = [
  { value: 'file', label: 'Archivo', Icon: FileVideo },
  { value: 'youtube', label: 'YouTube', Icon: Youtube },
] as const;

/**
 * F1 · 12 · «Archivo | YouTube» for a YouTube entry with its own file: under the controls, with the video's
 * settings, so it never takes room from the video. The person's pick is remembered for this video on this device.
 */
export function SourceRow({ video, copyLabel }: { video: Video; copyLabel: string | null }) {
  const stage = usePlayer((s) => s.stage);
  const choose = (next: 'youtube' | 'file') => {
    rememberStage(video.id, next);
    usePlayer.getState().setStage(next);
  };
  return (
    <div className="sep-t flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-5">
      <p
        id="source-row-title"
        className="text-[12px] font-bold uppercase tracking-[0.12em] text-washi-subtle"
      >
        Vídeo
      </p>
      <div
        role="radiogroup"
        aria-labelledby="source-row-title"
        className="well skin-track inline-flex items-center gap-0.5 rounded-[12px] p-0.5"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          const next = stage === 'file' ? 'youtube' : 'file';
          choose(next);
          e.currentTarget.querySelector<HTMLButtonElement>(`[data-source="${next}"]`)?.focus();
        }}
      >
        {SOURCES.map(({ value, label, Icon }) => {
          const active = stage === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              data-source={value}
              onClick={() => !active && choose(value)}
              className={cn(
                'flex min-h-11 items-center gap-1.5 rounded-[10px] px-3.5 text-[13px] font-medium transition-colors duration-150',
                active ? 'bg-washi font-bold text-sumi-900' : 'text-washi-muted hover:text-washi',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>
      <span className="min-w-0 flex-1 truncate text-[12px] text-washi-subtle">
        {stage === 'file' ? (copyLabel ?? video.file_name ?? '') : 'Con el archivo: sin anuncios ni esperas'}
      </span>
    </div>
  );
}
