import { formatTime, type Note } from '@coverscape/shared';
import { BookmarkPlus, X } from 'lucide-react';
import type { ComponentProps, Ref } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { PerfProbe } from '@/lib/perfProbe';
import { hasRange, useReview } from '@/player/store';
import {
  PlayCrest,
  QuickStrip,
  ReviewTimeline,
  ReviewTransport,
  SettingsButton,
  SoundPill,
} from './ReviewControls';
import type { useTapAnyFinger } from './tapAnyFinger';

interface TimelineNotes {
  notes: Note[];
  openNoteId: string | null;
  onNote: (note: Note) => void;
}

/**
 * One row: close, play, time and line, what's heard, settings (a phone on its side, or under the settings).
 * REQ-27 · Moved out of `ReviewScreen`.
 */
export function ReviewBar({
  closeTap,
  hasOriginal,
  settingsOpen,
  onSettings,
  settingsRef,
  ...timeline
}: TimelineNotes & {
  closeTap: ReturnType<typeof useTapAnyFinger<HTMLButtonElement>>;
  hasOriginal: boolean;
  settingsOpen: boolean;
  onSettings: () => void;
  settingsRef: Ref<HTMLButtonElement>;
}) {
  return (
    <footer
      className={cn(
        'sep-t relative z-20 box-content flex h-14 shrink-0 items-center gap-1 bg-sumi-900 pb-[env(safe-area-inset-bottom)] pl-[max(6px,env(safe-area-inset-left))]',
        'pr-[max(6px,env(safe-area-inset-right))]',
      )}
    >
      <Button variant="ghost" size="icon" aria-label="Cerrar el repaso" {...closeTap}>
        <X className="size-6" />
      </Button>
      <PlayCrest size="sm" />
      <ReviewTimeline variant="bar" {...timeline} />
      <SoundPill hasOriginal={hasOriginal} />
      <SettingsButton ref={settingsRef} open={settingsOpen} onClick={onSettings} />
    </footer>
  );
}

/**
 * Portrait and wide screens: the take's line with the quick ones on the clock's row, the A–B range with «Guardar
 * como clip», and the transport. REQ-27 · Moved out of `ReviewScreen`.
 */
export function ReviewFooter({
  hasOriginal,
  quickProps,
  onSaveRange,
  settingsOpen,
  onSettings,
  onLoopMissing,
  settingsRef,
  hideSettings,
  ...timeline
}: TimelineNotes & {
  hasOriginal: boolean;
  quickProps: Omit<ComponentProps<typeof QuickStrip>, 'orientation' | 'bare' | 'withLoop' | 'withMode'>;
  onSaveRange: () => void;
  settingsOpen: boolean;
  onSettings: () => void;
  onLoopMissing: () => void;
  settingsRef: Ref<HTMLButtonElement>;
  hideSettings: boolean;
}) {
  const loop = useReview((s) => s.loop);
  const activeClipId = useReview((s) => s.activeClipId);
  return (
    <footer className="paper relative z-20 shrink-0 rounded-t-[20px] border-x-0 border-b-0 px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 before:hidden sm:px-5">
      <div className="mx-auto max-w-2xl">
        <ReviewTimeline
          {...timeline}
          // Portrait: the quick ones share the clock's row (no row of their own: the stage keeps its height).
          showTotal={false}
          actions={
            <>
              <SoundPill hasOriginal={hasOriginal} />
              <QuickStrip orientation="row" bare {...quickProps} withLoop={false} withMode={false} />
            </>
          }
        />
        {hasRange(loop) && !activeClipId && (
          <div className="flex items-center justify-between gap-2 pb-1">
            <span className="tabular truncate font-mono text-[12px] text-washi-muted">
              A–B {formatTime(loop.start, { tenths: true })}–{formatTime(loop.end, { tenths: true })}
            </span>
            <Button variant="secondary" size="sm" className="min-h-11" onClick={onSaveRange}>
              <BookmarkPlus className="size-4" /> Guardar como clip
            </Button>
          </div>
        )}
        <PerfProbe id="ReviewControls">
          <ReviewTransport
            settingsOpen={settingsOpen}
            onSettings={onSettings}
            onLoopMissing={onLoopMissing}
            settingsRef={settingsRef}
            hideSettings={hideSettings}
          />
        </PerfProbe>
      </div>
    </footer>
  );
}
