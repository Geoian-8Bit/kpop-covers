import { clamp, clampSpeed, formatTime, MIN_LOOP_LENGTH, round3, type Clip, type ClipColor, type TablesUpdate } from '@coverscape/shared';

/** Quick names offered under the clip's name field. */
export const CLIP_NAME_SUGGESTIONS = ['Intro', 'Verso', 'Pre-estribillo', 'Estribillo', 'Puente', 'Dance break', 'Final'] as const;

/** The fine-tuning steps offered for a clip's start and end, in seconds. */
export const CLIP_NUDGES = [-1, -0.1, 0.1, 1] as const;

/** A clip's end may sit this little past the reported length (rounding of the media's own duration). */
const END_SLACK = 0.05;

/** What the edit dialog lets you change on a saved clip (the client may write exactly these columns). */
export interface ClipEdit {
  name: string;
  color: ClipColor;
  is_pinned: boolean;
  speed: number;
  mirrored: boolean;
  start_seconds: number;
  end_seconds: number;
}

export function clipEditOf(clip: Clip): ClipEdit {
  return {
    name: clip.name,
    color: clip.color,
    is_pinned: clip.is_pinned,
    speed: clip.speed,
    mirrored: clip.mirrored,
    start_seconds: clip.start_seconds,
    end_seconds: clip.end_seconds,
  };
}

/**
 * Moves a mark by `delta` seconds: never before 0, never past the song's end (when its length is known),
 * rounded to milliseconds so repeated ±0,1 s taps don't drift (12.300000001).
 */
export function nudgeTime(seconds: number, delta: number, duration: number): number {
  const next = seconds + delta;
  return round3(duration > 0 ? clamp(next, 0, duration) : Math.max(0, next));
}

/** A mark set from the playhead («Poner aquí»), with the same limits as a nudge. */
export function markAt(seconds: number, duration: number): number {
  return nudgeTime(seconds, 0, duration);
}

/**
 * Why this range can't be saved, in the words the dialog shows; null when it can. `duration` is the
 * song's length as the player knows it (0 while it is still unknown: then only the order is checked).
 */
export function clipRangeError(start: number, end: number, duration: number): string | null {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'El inicio y el final tienen que ser tiempos válidos.';
  if (start < 0) return 'El inicio no puede ir antes de 0:00.';
  if (end <= start) return 'El final tiene que ir después del inicio.';
  if (end - start < MIN_LOOP_LENGTH - 1e-9) return 'El clip es demasiado corto: tiene que durar al menos 0,2 s.';
  if (duration > 0 && start >= duration) return `El inicio pasa del final de la canción (${formatTime(duration)}).`;
  if (duration > 0 && end > duration + END_SLACK) return `El final pasa del final de la canción (${formatTime(duration)}).`;
  return null;
}

/** Why the edit can't be saved (name first, then the range); null when it can. */
export function clipEditError(edit: ClipEdit, duration: number): string | null {
  if (!edit.name.trim()) return 'Ponle un nombre al clip.';
  return clipRangeError(edit.start_seconds, edit.end_seconds, duration);
}

const same = (a: number, b: number) => Math.abs(a - b) < 0.0005;

/** Only the columns that really changed (an empty patch means there is nothing to save). */
export function clipEditPatch(clip: Clip, edit: ClipEdit): TablesUpdate<'clips'> {
  const patch: TablesUpdate<'clips'> = {};
  const name = edit.name.trim();
  if (name !== clip.name) patch.name = name;
  if (edit.color !== clip.color) patch.color = edit.color;
  if (edit.is_pinned !== clip.is_pinned) patch.is_pinned = edit.is_pinned;
  const speed = clampSpeed(edit.speed);
  if (!same(speed, clip.speed)) patch.speed = speed;
  if (edit.mirrored !== clip.mirrored) patch.mirrored = edit.mirrored;
  if (!same(edit.start_seconds, clip.start_seconds)) patch.start_seconds = round3(edit.start_seconds);
  if (!same(edit.end_seconds, clip.end_seconds)) patch.end_seconds = round3(edit.end_seconds);
  return patch;
}

/** The patch changes what the player loops (range, speed or mirror), not just how the clip is labelled. */
export function patchChangesPlayback(patch: TablesUpdate<'clips'>): boolean {
  return (
    patch.start_seconds !== undefined ||
    patch.end_seconds !== undefined ||
    patch.speed !== undefined ||
    patch.mirrored !== undefined
  );
}

/**
 * Another clip of the song with the same range, speed and mirror (saving would only make a copy of it).
 * `exceptId`: the clip being edited never counts as its own duplicate.
 */
export function findDuplicateClip<C extends Pick<Clip, 'id' | 'start_seconds' | 'end_seconds' | 'speed' | 'mirrored'>>(
  clips: readonly C[] | undefined,
  range: { start: number; end: number; speed: number; mirrored: boolean },
  exceptId?: string,
): C | undefined {
  return clips?.find(
    (c) =>
      c.id !== exceptId &&
      same(c.start_seconds, range.start) &&
      same(c.end_seconds, range.end) &&
      same(c.speed, range.speed) &&
      c.mirrored === range.mirrored,
  );
}

/** Clips in song order, as the list and the timeline show them. */
export function sortClips<C extends Pick<Clip, 'start_seconds'>>(clips: readonly C[]): C[] {
  return [...clips].sort((a, b) => a.start_seconds - b.start_seconds);
}

/**
 * 4 · The song length an edited clip is checked against (and its marks are kept within): the stage's, but never
 * shorter than the clip's own saved end. A clip cut on YouTube may end past the linked file's length (an offset, a
 * trimmed copy); editing just its name on the file must not be blocked by it.
 */
export function clipEditLimit(clip: Pick<Clip, 'end_seconds'>, duration: number): number {
  return duration > 0 ? Math.max(duration, clip.end_seconds) : 0;
}
