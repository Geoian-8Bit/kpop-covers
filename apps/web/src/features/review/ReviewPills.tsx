import { cn } from '@/lib/cn';
import { useReview } from '@/player/store';
import { MessageSquarePlus, Volume2 } from 'lucide-react';
import { pill, pillIdle } from './reviewControlParts';
import { useTapAnyFinger } from './tapAnyFinger';

/** «Se oye: la toma / el original»: one tap switches which of the two is heard. */
export function SoundPill({ hasOriginal }: { hasOriginal: boolean }) {
  const audio = useReview((s) => s.audio);
  if (!hasOriginal) return null;
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

export function NotePill({ onNote }: { onNote: () => void }) {
  const ready = useReview((s) => s.takeEngine != null);
  const tap = useTapAnyFinger(onNote, !ready);
  return (
    <button
      type="button"
      aria-label="Nota en este momento (N)"
      title="Nota en este momento (N)"
      disabled={!ready}
      {...tap}
      className={cn(pill, 'text-kin-300 hover:bg-washi/[0.07]')}
    >
      <MessageSquarePlus className="size-[18px]" />
      <span>Nota</span>
    </button>
  );
}
