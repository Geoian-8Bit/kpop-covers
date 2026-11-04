import { isStaleCopy } from '@/data/videos';
import { loadLocalVideo } from '@/lib/localVideos';
import type { Note, Video } from '@coverscape/shared';
import { type ComponentType, lazy } from 'react';

/** F5 · The review screen, loaded when a take is first opened. */
export const ReviewScreen = lazy(() =>
  import('@/features/review/ReviewScreen').then((m) => ({ default: m.ReviewScreen })),
);
/**
 * P4 · The recorder (camera, recorder, clap…) loads when «Grabar» is first hovered, focused or pressed, and is only
 * mounted while open: closing it unmounts it (it keeps nothing between sessions: every open starts afresh).
 */
const loadRecordStudio = () => import('@/features/record/RecordStudio');
export const RecordStudio = lazy(() => loadRecordStudio().then((m) => ({ default: m.RecordStudio })));
export const warmRecordStudio = () => void loadRecordStudio().catch(() => undefined);
/** P4 · «Tomas» loads when its tab is first opened. */
export const TakesPanel = lazy(() =>
  import('@/features/takes/TakesPanel').then((m) => ({ default: m.TakesPanel })),
);
/** REQ-06 · «Formaciones»: the tab's list and the editor load when first opened. */
export const FormationsPanel = lazy(() =>
  import('@/features/formations/FormationsPanel').then((m) => ({ default: m.FormationsPanel })),
);
export const FormationEditor = lazy(() =>
  import('@/features/formations/FormationEditor').then((m) => ({ default: m.FormationEditor })),
);
export type SideTab = 'clips' | 'takes' | 'formations';
/**
 * Global review 2 [3] · An extra part of the studio in a chunk of its own: if the chunk can't load (offline before the
 * precache finished, no service worker, an iPhone that emptied its cache) it shows nothing, like the long countdowns,
 * instead of taking the whole studio to the error screen.
 */
function optionalPart<P extends object>(load: () => Promise<ComponentType<P>>) {
  const Nothing: ComponentType<P> = () => null;
  return lazy(() =>
    load().then(
      (Part) => ({ default: Part }),
      (error: unknown) => {
        console.warn('[studio] optional part not loaded', error);
        return { default: Nothing };
      },
    ),
  );
}
/** 18 · «Separar voz y música»: loads only for a song with a file of its own. */
export const SeparateVoiceButton = optionalPart(() =>
  import('@/features/voice/SeparateVoiceButton').then((m) => m.SeparateVoiceButton),
);

/**
 * Same as `releaseTakeUrl` (data/takes): a take's object URL is let go. Here so the studio doesn't import data/takes
 * (with the recorder's store and sharing) to open: that loads with «Tomas», the review or the recorder.
 */
export const releaseTakeUrl = (url: string | null | undefined) => {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
};

/** The stage's file source options (stable: no new object per render). */
export const STAGE_SOURCE = { cacheRemote: true } as const;

/** Stable empty list, so the stage never re-renders for a new [] while notes load. */
export const NO_NOTES: Note[] = [];

/** 12 · Whether this device keeps a current copy of the entry's linked file. */
export async function hasDeviceCopy(video: Video): Promise<boolean> {
  const blob = await loadLocalVideo(video.id);
  return blob != null && !isStaleCopy(video);
}
