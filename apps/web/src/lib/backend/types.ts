import type {
  Absence,
  Bag,
  BagDraw,
  BagItem,
  BagKind,
  CalendarChange,
  Clip,
  Crew,
  CrewEvent,
  DrawMode,
  EventSong,
  Formation,
  FormationPlan,
  FormationPositions,
  FormationProp,
  Member,
  MemberColor,
  Note,
  Poll,
  PollOption,
  PollVote,
  Profile,
  ReactionEmoji,
  RehearsalException,
  RehearsalRule,
  Tables,
  TablesInsert,
  TablesUpdate,
  Take,
  TakeReaction,
  Track,
  TrackItem,
  Video,
  Wish,
  WishInterest,
} from '@coverscape/shared';

// No thumbnail: an uploaded video's poster is an inline data URL, and the quick row would repeat it once per clip.
type ClipVideo = Pick<Video, 'id' | 'title' | 'artist' | 'source' | 'youtube_id'>;
export type ClipWithVideo = Clip & { video: ClipVideo | null };

/**
 * REQ-14 · A library row: `thumbnail_url` is `list_thumbnail_url` (null for an uploaded video's inline poster, which
 * comes from the poster query, combined by id). REQ-16 · It also carries the small file columns, so the studio can
 * open an uploaded or linked video from it.
 */
export type LibraryVideo = Pick<
  Video,
  | 'id'
  | 'crew_id'
  | 'title'
  | 'artist'
  | 'source'
  | 'youtube_id'
  | 'thumbnail_url'
  | 'duration_seconds'
  | 'created_at'
  | 'file_name'
  | 'aspect_ratio'
  | 'poster_inline'
  | 'poster_rev'
  | 'storage_path'
  | 'file_size'
  | 'file_offset_seconds'
  | 'file_duration_seconds'
  | 'updated_at'
>;
export type VideoWithClipCount = LibraryVideo & { clips: { count: number }[] };

/** REQ-14 · An uploaded video's inline poster and its revision (`md5` of the data URL). */
export type VideoPoster = { id: string; poster_rev: string; thumbnail_url: string };
export type VideoPosterRev = Pick<VideoPoster, 'id' | 'poster_rev'>;

/** REQ-17 · A note as listed: no `sketch` (only `has_sketch`); a written note's answer does carry it. */
export type ListedNote = Omit<Note, 'sketch'> & { sketch?: string | null };
type NoteSketch = { id: string; sketch: string };

/** Why a file stayed on this device instead of reaching the group's cloud. */
/** 'exists': a file with that name is already there (a take's earlier upload that went through). */
export type UploadFailure = 'too-big' | 'type' | 'network' | 'denied' | 'unavailable' | 'exists';
export type UploadResult = { ok: true; path: string } | { ok: false; reason: UploadFailure };

/** 13 · A long upload (a ~48 MB copy over mobile data): say how far it is, and let it be cancelled. */
export interface UploadOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** What the app may change on a take (the database grants exactly these columns). F5 adds the review's sync and fit. */
export type TakePatch = Pick<
  TablesUpdate<'takes'>,
  | 'is_best'
  | 'shared_path'
  | 'shared_size'
  | 'member_id'
  | 'clip_id'
  | 'sync_adjust_seconds'
  | 'fit_scale'
  | 'fit_x'
  | 'fit_y'
>;

/** What the app may change on a note (granted columns; a note's take and moment are set when it's written). */
export type NotePatch = Pick<
  TablesUpdate<'notes'>,
  'body' | 'at_seconds' | 'category' | 'for_member_id' | 'status' | 'sketch'
>;

interface StorageUsage {
  takes: number;
  total: number;
}

export interface Backend {
  joinGroup(): Promise<Crew>;
  getProfile(userId: string): Promise<Profile | null>;
  listVideos(crewId: string): Promise<VideoWithClipCount[]>;
  /** REQ-14 · Which inline posters the group has now (id + revision; no image). */
  listPosterRevs(crewId: string): Promise<VideoPosterRev[]>;
  /** REQ-14 · The inline posters of these videos (only the ones this device is missing). */
  listPosters(ids: string[]): Promise<VideoPoster[]>;
  /** REQ-14 · Every inline poster of the group in one request (a device that keeps none: the first visit). */
  listCrewPosters(crewId: string): Promise<VideoPoster[]>;
  getVideo(id: string): Promise<Video | null>;
  insertVideo(row: TablesInsert<'videos'> & { id: string }): Promise<Video>;
  updateVideo(id: string, patch: TablesUpdate<'videos'>): Promise<Video>;
  deleteVideo(video: Pick<Video, 'id'>): Promise<void>;
  listClips(videoId: string): Promise<Clip[]>;
  listQuickClips(crewId: string): Promise<ClipWithVideo[]>;
  insertClip(row: TablesInsert<'clips'>): Promise<Clip>;
  updateClip(id: string, patch: TablesUpdate<'clips'>): Promise<Clip>;
  deleteClip(id: string): Promise<void>;
  listNotes(videoId: string): Promise<ListedNote[]>;
  /** REQ-17 · The drawings of a video's notes that have one. */
  listNoteSketches(videoId: string): Promise<NoteSketch[]>;
  insertNote(row: TablesInsert<'notes'>): Promise<Note>;
  updateNote(id: string, patch: NotePatch): Promise<Note>;
  deleteNote(id: string): Promise<void>;
  /**
   * Never overwrites (each name is unique per video). Failures come back typed so the UI can say why.
   * There is deliberately no way to delete cloud files from the client: deleting archives, files stay.
   */
  /**
   * Never overwrites: `exists` when a file with that name is already in the bucket (an earlier try that got
   * through). With `options`: progress (0–1) as the bytes go out, and an abort that rejects with an AbortError.
   */
  uploadFile(path: string, file: File, options?: UploadOptions): Promise<UploadResult>;
  signedUrl(path: string): Promise<string | null>;
  /** F2 · the group's members (name + colour), oldest first. */
  listMembers(): Promise<Member[]>;
  insertMember(row: { id?: string; name: string; color: MemberColor }): Promise<Member>;
  updateMember(id: string, patch: { name?: string; color?: MemberColor }): Promise<Member>;
  /** Archives (the delete trigger keeps the row). */
  deleteMember(id: string): Promise<void>;
  /** F3 · takes of a video (rows: the videos live on phones, or shared in the `takes` bucket). */
  listTakes(videoId: string): Promise<Take[]>;
  insertTake(row: TablesInsert<'takes'>): Promise<Take>;
  /** One live take by id (null when it doesn't exist or was deleted). */
  getTake(id: string): Promise<Take | null>;
  updateTake(id: string, patch: TakePatch): Promise<Take>;
  deleteTake(id: string): Promise<void>;
  uploadTakeFile(path: string, file: Blob): Promise<UploadResult>;
  signedTakeUrl(path: string): Promise<string | null>;
  /**
   * Bytes really used in the cloud: by shared takes (deleted ones included: their files stay until the admin
   * purges them) and in total (with the library's videos), against the free plan's 1 GB.
   */
  storageUsage(): Promise<StorageUsage>;
}

export type BagWithCount = Bag & { items: number };
/** REQ-14 · `thumbnail_url` is `list_thumbnail_url` here (null for an inline poster, which comes by id). */
type BagItemVideo = Pick<
  Video,
  'id' | 'title' | 'artist' | 'thumbnail_url' | 'source' | 'youtube_id' | 'poster_inline' | 'poster_rev'
>;
type BagItemClip = Pick<
  Clip,
  'id' | 'name' | 'video_id' | 'start_seconds' | 'end_seconds' | 'speed' | 'mirrored' | 'color'
> & { video: ClipVideo | null };
type BagItemMember = Pick<Member, 'id' | 'name' | 'color'>;
/** A bag item with what it points at (songs, clips or people; archived ones never come back). */
/** F12: a bag of songs also takes wishes from the list (not in the library yet). */
type BagItemWish = Pick<Wish, 'id' | 'title' | 'artist' | 'thumbnail_url' | 'youtube_id' | 'added_video_id'>;
export type BagItemView = BagItem & {
  video: BagItemVideo | null;
  clip: BagItemClip | null;
  member: BagItemMember | null;
  wish: BagItemWish | null;
};
export type TrackWithCount = Track & { items: number };
/** A track's clip; `clip` is null when it was archived (shown as «no disponible», skipped when playing). */
export type TrackItemView = TrackItem & { clip: ClipWithVideo | null };
export type NewBag = { name: string; kind: BagKind; draw_mode: DrawMode; no_repeat: boolean };
export type BagPatch = Partial<Pick<Bag, 'name' | 'draw_mode' | 'no_repeat'>>;
/** Exactly one source. A YouTube song (point 28) lives only in its bag: youtube_id with its title and details. */
export type NewBagItem = {
  bag_id: string;
  video_id?: string;
  clip_id?: string;
  member_id?: string;
  wish_id?: string;
  youtube_id?: string;
  title?: string;
  artist?: string | null;
  thumbnail_url?: string | null;
  duration_seconds?: number | null;
};
export type TrackOptionsRow = Pick<Track, 'pause_seconds' | 'countdown' | 'use_clip_settings' | 'title_mode'>;
export type TrackPatch = Partial<
  Pick<Track, 'name' | 'pause_seconds' | 'countdown' | 'use_clip_settings' | 'title_mode'>
>;

/**
 * F13 · bags and F14 · tracks, shared by the group. Only the columns the database grants are ever written:
 * bags (name, draw_mode, no_repeat), bag_items (removed_at), bag_draws (removed), tracks (name and options),
 * track_items (position). Deleting archives. The draw itself happens on the server (`draw_from_bag`).
 */
/** What «Añadir a una bolsa» looks for in the bags: a library song, a wish or a clip. */
export type BagHoldingRef = { video_id: string } | { wish_id: string } | { clip_id: string };

/** REQ-19 · What a round needs to play a song: no poster, no audit columns. */
export type PlayableVideo = Pick<
  Video,
  'id' | 'source' | 'youtube_id' | 'storage_path' | 'file_name' | 'file_size' | 'file_offset_seconds'
>;

export interface BagsBackend {
  listBags(): Promise<BagWithCount[]>;
  insertBag(row: NewBag): Promise<Bag>;
  updateBag(id: string, patch: BagPatch): Promise<Bag>;
  deleteBag(id: string): Promise<void>;
  listBagItems(bagId: string): Promise<BagItemView[]>;
  /** REQ-19 · The bags (ids) that already hold this song, wish or clip: one `bag_items select bag_id` query. */
  listBagsHolding(ref: BagHoldingRef): Promise<string[]>;
  insertBagItem(row: NewBagItem): Promise<BagItem>;
  deleteBagItem(id: string): Promise<void>;
  /** Takes an item out of the bag (or puts it back). */
  setBagItemOut(id: string, out: boolean): Promise<void>;
  /** «Rellenar»: everything taken out goes back in. */
  refillBag(bagId: string): Promise<void>;
  /** Newest first. */
  listBagDraws(bagId: string, limit?: number): Promise<BagDraw[]>;
  /** Draws `count` (1–10) at random; `remove` null = the bag's mode. Empty when nothing is left. */
  drawFromBag(
    bagId: string,
    count: number,
    remove: boolean | null,
    memberId: string | null,
  ): Promise<BagDraw[]>;
  /** «Quitar de la bolsa» / «Devolver» after a draw: the draw's record and its item follow. */
  setDrawRemoved(draw: Pick<BagDraw, 'id' | 'item_id'>, removed: boolean): Promise<void>;
  /**
   * «Añadir a la biblioteca» for a YouTube song of a bag: the item now points at the library video with the same
   * YouTube id (same row, so its history stays). Anything else is refused (`bag_item_invalid`).
   */
  linkBagItemVideo(itemId: string, videoId: string): Promise<void>;
  /**
   * «Añadir a la biblioteca», for every bag at once: each live YouTube song of the group with this YouTube id points
   * at the library video (one link per row, each checked by the trigger); in a bag that already holds the video, the
   * YouTube copy leaves the bag instead. Returns the bags it touched.
   */
  linkYoutubeSongs(youtubeId: string, videoId: string): Promise<string[]>;
  /** Every live clip of the group with its song (pickers, rounds). */
  listAllClips(): Promise<ClipWithVideo[]>;
  /** REQ-19 · The playable columns of several songs in one request (a round's songs). */
  listPlayableVideos(ids: string[]): Promise<PlayableVideo[]>;
  /** REQ-19 · One batch signature for several files; the URLs go to the signed-URL memory (REQ-15). */
  signVideoFiles(paths: string[]): Promise<void>;
  listTracks(): Promise<TrackWithCount[]>;
  getTrack(id: string): Promise<Track | null>;
  listTrackItems(trackId: string): Promise<TrackItemView[]>;
  insertTrack(row: { name: string } & TrackOptionsRow, clipIds: string[]): Promise<Track>;
  updateTrack(id: string, patch: TrackPatch): Promise<Track>;
  deleteTrack(id: string): Promise<void>;
  insertTrackItems(trackId: string, clipIds: string[], fromPosition: number): Promise<TrackItem[]>;
  deleteTrackItem(id: string): Promise<void>;
  /** REQ-20 · One atomic write: `ids` is the whole track in its new order (position = index). */
  setTrackPositions(trackId: string, ids: string[]): Promise<void>;
}

/** What the app may change on a wish (the database grants exactly these columns). */
export type WishPatch = Partial<
  Pick<Wish, 'title' | 'artist' | 'members_count' | 'difficulty' | 'comment' | 'added_video_id'>
>;
export type NewWish = Pick<Wish, 'youtube_id' | 'title'> &
  Partial<
    Pick<
      Wish,
      'artist' | 'thumbnail_url' | 'members_count' | 'difficulty' | 'comment' | 'proposed_by_member_id'
    >
  >;
/**
 * What the app changes on a poll: the title, and closing = closed_at (once); the winner only at that moment, and
 * only an option. 52 · results_live / anonymous / closes_at are no longer edited (older rows keep theirs).
 */
export type PollPatch = Partial<Pick<Poll, 'title' | 'closed_at' | 'winner_wish_id'>>;
export type CloseResolve = 'auto' | 'pick' | 'none';
export interface CloseResult {
  status: 'closed' | 'tie';
  winner: string | null;
  /** The leaders (wish ids) when it is a tie. */
  tied: string[];
}

export type NewPoll = Pick<Poll, 'title' | 'vote_type'> & {
  created_by_member_id: string | null;
  parent_poll_id: string | null;
};

/**
 * F12 · the wish list («Me apunto» included) and F11 · its votes. Shared by the group; deleting archives. Votes
 * only go in through `cast_vote()` (one ballot per person, replaced while the poll is open; empty = withdraw).
 */
export interface WishesBackend {
  listWishes(): Promise<Wish[]>;
  insertWish(row: NewWish): Promise<Wish>;
  updateWish(id: string, patch: WishPatch): Promise<Wish>;
  deleteWish(id: string): Promise<void>;
  listInterest(): Promise<WishInterest[]>;
  addInterest(wishId: string, memberId: string): Promise<WishInterest>;
  removeInterest(id: string): Promise<void>;
  listPolls(): Promise<Poll[]>;
  listPollOptions(): Promise<PollOption[]>;
  /** Live votes of these polls only (a poll's page asks for its own; the list for the closed ones it shows). */
  listPollVotes(pollIds: string[]): Promise<PollVote[]>;
  /** REQ-19 · A light fingerprint (md5) of a poll's live ballots, null without votes: changes with any vote. */
  pollVotesSignature(pollId: string): Promise<string | null>;
  /**
   * Closes on the server with the votes as they are at that moment (`close_poll`): 'auto' closes with a clear
   * winner (or none if nobody voted) and answers 'tie' without closing; 'pick' closes with one of the tied leaders;
   * 'none' closes without a winner (a second round follows). An already closed poll answers with its winner.
   */
  closePoll(pollId: string, resolve: CloseResolve, winnerWishId?: string | null): Promise<CloseResult>;
  /** The poll and its options (the wishes that take part); a poll left without options is archived again. */
  insertPoll(row: NewPoll, wishIds: string[]): Promise<Poll>;
  updatePoll(id: string, patch: PollPatch): Promise<Poll>;
  deletePoll(id: string): Promise<void>;
  /** Replaces this person's ballot (ranking: the order of the array). Returns how many options it holds. */
  castVote(pollId: string, memberId: string, optionIds: string[]): Promise<number>;
}

export type EventWithCount = CrewEvent & { songs: number };
/** REQ-14 · `thumbnail_url` is `list_thumbnail_url` here (null for an inline poster, which comes by id). */
type EventSongVideo = Pick<
  Video,
  'id' | 'title' | 'artist' | 'thumbnail_url' | 'source' | 'youtube_id' | 'poster_inline' | 'poster_rev'
>;
/** A song of the repertoire with its video (a song archived from the library never comes back). */
export type EventSongView = EventSong & { video: EventSongVideo | null };
/** The granted columns of an event: name, starts_at, place. */
export type NewEvent = Pick<CrewEvent, 'name' | 'starts_at' | 'place'>;
export type EventPatch = Partial<NewEvent>;
type NewReaction = { take_id: string; member_id: string | null; emoji: ReactionEmoji };

/**
 * F16 · events and their repertoire, F15 · reactions on shared takes. Shared by the group; deleting archives.
 * Only granted columns are written: events (name, starts_at, place), event_songs (position); reactions are only
 * added or removed. The database checks the rest (the song is in the library, the take is shared…).
 */
export interface EventsBackend {
  listEvents(): Promise<EventWithCount[]>;
  getEvent(id: string): Promise<CrewEvent | null>;
  insertEvent(row: NewEvent): Promise<CrewEvent>;
  updateEvent(id: string, patch: EventPatch): Promise<CrewEvent>;
  deleteEvent(id: string): Promise<void>;
  listEventSongs(eventId: string): Promise<EventSongView[]>;
  insertEventSongs(eventId: string, videoIds: string[], positions: number[]): Promise<EventSong[]>;
  deleteEventSong(id: string): Promise<void>;
  /** REQ-20 · One atomic write: `ids` is the whole repertoire in its new order (position = index). */
  setEventSongPositions(eventId: string, ids: string[]): Promise<void>;
  /** The reactions on the takes of one song, oldest first. */
  listReactions(videoId: string): Promise<TakeReaction[]>;
  addReaction(row: NewReaction): Promise<TakeReaction>;
  removeReaction(id: string): Promise<void>;
}

/** One separation of a video's file: two tracks (voice, instrumental) in the `videos` bucket, shared by the group. */
export type VideoStems = Tables<'video_stems'>;
/** What the device that separated says about it (the database sets the group, the date and the files). */
type NewVideoStems = Pick<
  VideoStems,
  | 'id'
  | 'video_id'
  | 'member_id'
  | 'source_file_name'
  | 'source_file_size'
  | 'model'
  | 'duration_seconds'
  | 'delay_seconds'
  | 'mime_type'
>;

/**
 * 18 · Separating happens once on a powerful device; this keeps the result for everyone: a row (born without
 * files), the two uploads under `<group>/stems/<row id>/`, then both paths at once (the database checks the files
 * are there and records their real sizes). Deleting archives; files are never deleted from the client.
 */
export interface StemsBackend {
  listStems(videoId: string): Promise<VideoStems[]>;
  insertStems(row: NewVideoStems): Promise<VideoStems>;
  /** Never overwrites. `exists` means an earlier attempt already uploaded it (fine to carry on). */
  uploadStemFile(path: string, file: Blob): Promise<UploadResult>;
  completeStems(id: string, paths: { vocals_path: string; instrumental_path: string }): Promise<VideoStems>;
  deleteStems(id: string): Promise<void>;
  /** REQ-15 · Both tracks of a separation in one signature request (null for one that couldn't be signed). */
  signedStemUrls(paths: string[]): Promise<(string | null)[]>;
}

/** A person the calendar can name: the live members plus archived ones that still have absences (greyed out). */
export type CalendarMember = Pick<Member, 'id' | 'name' | 'color'> & { archived: boolean };
export type NewAbsence = Pick<
  Absence,
  'member_id' | 'starts_on' | 'ends_on' | 'kind' | 'at_time' | 'note'
> & {
  created_by_member: string | null;
};
/** The granted columns: dates, kind, time and note (the person and who marked it are fixed). */
export type AbsencePatch = Pick<Absence, 'starts_on' | 'ends_on' | 'kind' | 'at_time' | 'note'>;
export type NewRehearsalRule = Pick<RehearsalRule, 'weekday' | 'starts_at' | 'ends_at'>;
export type NewRehearsalException =
  | { kind: 'cancel'; on_date: string; rule_id: string }
  | { kind: 'extra'; on_date: string; starts_at: string; ends_at: string };

/**
 * REQ-03 / REQ-04 · the calendar: absences, weekly rehearsal rules and their per-date exceptions. Shared by the
 * group; deleting archives. Rules are never edited in place: `editRehearsalRule` and `endRehearsalRule` close the
 * old rule yesterday (Madrid) in one RPC so past weeks keep their timetable.
 */
export interface CalendarBackend {
  listCalendarMembers(): Promise<CalendarMember[]>;
  /** Absences touching the days from `from` to `to` (both included). */
  listAbsences(from: string, to: string): Promise<Absence[]>;
  insertAbsence(row: NewAbsence): Promise<Absence>;
  /** `author`: who makes the change (REQ-05: their own devices aren't notified); null when the device has no name. */
  updateAbsence(id: string, patch: AbsencePatch, author: string | null): Promise<Absence>;
  deleteAbsence(id: string, author: string | null): Promise<void>;
  /** Every rule (ended ones too: past weeks are drawn from them). */
  listRehearsalRules(): Promise<RehearsalRule[]>;
  insertRehearsalRule(row: NewRehearsalRule, author: string | null): Promise<RehearsalRule>;
  editRehearsalRule(id: string, row: NewRehearsalRule, author: string | null): Promise<RehearsalRule>;
  endRehearsalRule(id: string, author: string | null): Promise<void>;
  listRehearsalExceptions(from: string, to: string): Promise<RehearsalException[]>;
  insertRehearsalException(row: NewRehearsalException, author: string | null): Promise<RehearsalException>;
  deleteRehearsalException(id: string, author: string | null): Promise<void>;
  /** REQ-05 · The newest changes of the calendar after `since` (ISO), newest first (at most 50). */
  listCalendarChanges(since: string): Promise<CalendarChange[]>;
}

export interface PushKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * REQ-05 · This device's Web Push subscription on the server. Write-only for the app: the table is unreadable for
 * anon (RPCs `save_push_subscription` / `delete_push_subscription`); the Edge Function reads it to send.
 */
export interface PushBackend {
  saveSubscription(keys: PushKeys, member: string | null): Promise<void>;
  deleteSubscription(endpoint: string): Promise<void>;
}

/** A person the editor can draw: the live members plus archived ones still in a live plan (greyed out). */
export type FormationMember = Pick<Member, 'id' | 'name' | 'color'> & { archived: boolean };
/** A plan in the «Formaciones» list: its participants (member ids) and how many formations it has. */
export type FormationPlanSummary = FormationPlan & { members: string[]; formationCount: number };
export interface FormationPlanFull {
  plan: FormationPlan;
  members: string[];
  formations: Formation[];
}
export interface NewFormationPlan {
  video_id: string;
  name: string;
  members: string[];
  stage_width: number;
  stage_depth: number;
}
export type FormationPlanPatch = Partial<
  Pick<FormationPlan, 'name' | 'stage_width' | 'stage_depth' | 'grid' | 'bpm' | 'first_beat'> & {
    members: string[];
  }
>;
/** What `save_formation` takes: a formation without its row bookkeeping (`id` lets the editor keep its own ids). */
export interface FormationInput {
  id: string;
  at: number;
  transition: number;
  positions: FormationPositions;
  note: string | null;
  /** REQ-10 · Always sent by this client (the server keeps a formation's props when the key is missing). */
  props: FormationProp[];
}
/** A write against the plan's revision: done (with the new revision) or refused because somebody changed the plan. */
export type RevisionResult<T = object> =
  ({ ok: true; revision: number } & T) | { ok: false; conflict: true; revision: number };

/**
 * REQ-06 · Formation plans of a song. Every write of a plan or its formations carries the revision the editor loaded
 * and bumps it; a stale one is refused without writing (the editor says «Alguien ha cambiado este plan»).
 */
export interface FormationsBackend {
  listFormationMembers(): Promise<FormationMember[]>;
  listPlans(videoId: string): Promise<FormationPlanSummary[]>;
  getPlan(planId: string): Promise<FormationPlanFull | null>;
  createPlan(row: NewFormationPlan): Promise<FormationPlan>;
  updatePlan(
    planId: string,
    expected: number,
    patch: FormationPlanPatch,
  ): Promise<RevisionResult<{ plan: FormationPlan }>>;
  duplicatePlan(planId: string, name: string): Promise<FormationPlan>;
  deletePlan(planId: string): Promise<void>;
  saveFormation(
    planId: string,
    expected: number,
    formation: FormationInput,
  ): Promise<RevisionResult<{ formation: Formation }>>;
  deleteFormation(planId: string, expected: number, formationId: string): Promise<RevisionResult>;
}
