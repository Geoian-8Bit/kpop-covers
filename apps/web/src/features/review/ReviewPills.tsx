import { cn } from '@/lib/cn';
import { useReview } from '@/player/store';
import { Volume2 } from 'lucide-react';
import { pill, pillIdle } from './reviewControlParts';
import { useTapAnyFinger } from './tapAnyFinger';

/** «Se oye: la toma / el original»: one tap switches which of the two is heard. */
export function SoundPill({ hasOriginal }: { hasOriginal: boolean }) {
  const audio = useReview((s) => s.audio);
  const solo = useReview((s) => s.solo);
  const syncEdit = useReview((s) => s.syncEdit);
  // One video alone («Solo toma», or placing one in «Sincronía»): that one is always the one heard.
  if (!hasOriginal || solo || syncEdit) return null;
  const takeHeard = audio === 'take';
  return <SoundPillButton takeHeard={takeHeard} />;
}

function SoundPillButton({ takeHeard }: { takeHeard: boolean }) {
  const soundTap = useTapAnyFinger(() => useReview.getState().setAudio(takeHeard ? 'original' : 'take'));
  return (
    <button
      type="button"
      aria-label={
        takeHeard
          ? 'Se oye la toma. Pulsa para oír el original'
          : 'Se oye el original. Pulsa para oír la toma'
      }
      {...soundTap}
      className={cn(pill, takeHeard ? pillIdle : 'bg-ai-600/50 text-ai-200 ring-1 ring-inset ring-ai-400/35')}
    >
      <Volume2 className="size-[18px]" />
      <span>{takeHeard ? 'Toma' : 'Original'}</span>
    </button>
  );
}
