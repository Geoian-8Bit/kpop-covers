export type AddVideoTab = 'youtube' | 'file';

export interface VideoMeta {
  title: string;
  artist: string;
}

/**
 * «Añadir vídeo»'s title and artist. Each tab keeps its own suggestion (the YouTube video's title and channel, the
 * file's cleaned-up name), so going back to «YouTube» after picking a file never adds the YouTube video under the
 * file's name. What someone typed is theirs and stays whatever the tab.
 */
export interface MetaState {
  suggested: Record<AddVideoTab, VideoMeta>;
  typed: VideoMeta | null;
}

const BLANK: VideoMeta = { title: '', artist: '' };

export const EMPTY_META: MetaState = { suggested: { youtube: BLANK, file: BLANK }, typed: null };

/** What the fields show on this tab. */
export function shownMeta(state: MetaState, tab: AddVideoTab): VideoMeta {
  return state.typed ?? state.suggested[tab];
}

/** A tab's own suggestion (a pick, a file, or blank when it's removed). */
export function suggestMeta(state: MetaState, tab: AddVideoTab, meta: VideoMeta): MetaState {
  return { ...state, suggested: { ...state.suggested, [tab]: meta } };
}

/** A keystroke in «Título» or «Artista»: from now on the fields are the person's, on both tabs. */
export function editMeta(state: MetaState, tab: AddVideoTab, patch: Partial<VideoMeta>): MetaState {
  return { ...state, typed: { ...shownMeta(state, tab), ...patch } };
}
