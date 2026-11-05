import { hasSeparableFile } from '@/features/voice/voiceRules';
import { VoiceSplitControl } from '@/features/voice/VoiceSplitControl';
import type { Video } from '@coverscape/shared';
import { Suspense } from 'react';
import { SeparateVoiceButton } from './studioParts';
import { useVoiceSplit } from './useVoiceSplit';

/**
 * F17 · Voice and music apart: on files only (YouTube's sound can't be reached). 18 · Below it, «Separar voz y
 * música» (AI, once per song) or a line saying the separated tracks are in use.
 */
export function VoiceRow({ video }: { video: Video }) {
  // 46 · The same state as fullscreen's «Voz y música» (the player's store).
  const { mode, available, monoLike, setMode } = useVoiceSplit();
  return (
    <div className="sep-t px-4 py-3 sm:px-5">
      <p className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-washi-subtle">
        Voz y música
      </p>
      <VoiceSplitControl mode={mode} onChange={setMode} available={available} monoLike={monoLike} compact />
      {/* Global review 2 [5] · Mounted while the song has a file, not only while its engine is on the stage: a
          separation running survives «YouTube», a resync or a media error (it hides itself when idle). */}
      {hasSeparableFile(video) && (
        <Suspense fallback={null}>
          <SeparateVoiceButton video={video} available={available} />
        </Suspense>
      )}
    </div>
  );
}
