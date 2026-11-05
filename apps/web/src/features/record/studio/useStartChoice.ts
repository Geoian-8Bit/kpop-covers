import type { Clip, Video } from '@coverscape/shared';
import { useEffect, useRef } from 'react';
import { useClips } from '@/data/clips';
import { usePlayer } from '@/player/store';
import { clipSection, currentChoice, startKinds, type StartChoice } from '../startRules';
import type { Studio } from './useStudioSession';
import { TIMER_KEY, TIMERS, type From } from './types';

/** P22 · Where the take starts: from the start, from here, the A–B section or a clip, and the count-in's length. */
export function useStartChoice(S: Studio, open: boolean, video: Video) {
  const { phase, from, setFrom, hereAt, loopRange, setStartListOpen, setNotice, timer, setTimer } = S;
  const duration = usePlayer((s) => s.duration);
  const fromOptions: From[] = startKinds({ hereAt, duration, hasRange: loopRange != null });
  const fromNow = fromOptions.includes(from) ? from : 'start';
  // P22 · The start as shown (a section that is a clip carries the clip's name), and the song's clips to pick from.
  const clips = useClips(video.id);
  const activeClipId = usePlayer((s) => s.activeClipId);
  const activeClip = clips.data?.find((c) => c.id === activeClipId) ?? null;
  const startChoice = currentChoice({ kind: fromNow, hereAt, range: loopRange, clip: activeClip });
  useEffect(() => {
    if (phase !== 'idle') setStartListOpen(false);
  }, [phase, setStartListOpen]);

  /**
   * P22 · A start picked from the list. A clip becomes the A–B section (without looping: the take ends at B), and
   * only that: the take keeps the studio's speed, mirror and zoom (a clip saved at 0,75× would otherwise
   * record at 0,75×, mirrored, and move the studio's zoom under the recorder). The studio gets its own A–B and clip
   * back on closing.
   */
  const startRestore = useRef<{
    start: number | null;
    end: number | null;
    activeClipId: string | null;
  } | null>(null);
  function pickStart(choice: StartChoice) {
    setStartListOpen(false);
    if (choice.kind === 'clip') {
      const clip = clips.data?.find((c: Clip) => c.id === choice.clipId);
      const p = usePlayer.getState();
      const section = clip ? clipSection(clip, p.duration) : null;
      if (!clip || !section) {
        setNotice('Este clip queda fuera de este vídeo.');
        return;
      }
      startRestore.current ??= { start: p.loop.start, end: p.loop.end, activeClipId: p.activeClipId };
      p.pause();
      usePlayer.setState({ loop: { ...section, enabled: false }, activeClipId: clip.id });
      setFrom('range');
      return;
    }
    setFrom(choice.kind);
  }
  // Declared after the opening effect (useStudioSession): its clean-up runs after that one's, which gives the loop's
  // on/off back.
  useEffect(() => {
    if (!open) return;
    startRestore.current = null;
    return () => {
      const before = startRestore.current;
      startRestore.current = null;
      if (before)
        usePlayer.setState((s) => ({
          loop: { ...s.loop, start: before.start, end: before.end },
          activeClipId: before.activeClipId,
        }));
    };
  }, [open]);

  function cycleTimer() {
    const next = TIMERS[(TIMERS.indexOf(timer) + 1) % TIMERS.length]!;
    setTimer(next);
    try {
      localStorage.setItem(TIMER_KEY, String(next));
    } catch {
      /* remembered for this visit only */
    }
  }

  return { fromOptions, fromNow, clips, startChoice, pickStart, cycleTimer };
}

export type StartApi = ReturnType<typeof useStartChoice>;
