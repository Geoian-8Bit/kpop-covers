import type { Note } from '@coverscape/shared';

// ───────────── Notes on a take (F6) ─────────────

export const NOTE_CATEGORIES = [
  { id: 'tiempo', label: 'Tiempo' },
  { id: 'brazos', label: 'Brazos' },
  { id: 'piernas', label: 'Piernas' },
  { id: 'direccion', label: 'Dirección o mirada' },
  { id: 'espacio', label: 'Espacio' },
  { id: 'expresion', label: 'Expresión' },
  { id: 'energia', label: 'Energía' },
] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number]['id'];

export function isNoteCategory(value: unknown): value is NoteCategory {
  return NOTE_CATEGORIES.some((c) => c.id === value);
}

export function categoryLabel(value: string | null | undefined): string | null {
  return NOTE_CATEGORIES.find((c) => c.id === value)?.label ?? null;
}

export type NoteStatus = 'open' | 'done';
export function noteStatus(note: Partial<Pick<Note, 'status'>>): NoteStatus {
  return note.status === 'done' ? 'done' : 'open';
}

export const NOTE_MAX = 500;
/** The text as saved: trimmed, 1–500 characters; null when empty. */
export function cleanNoteBody(body: string): string | null {
  const text = body.trim().slice(0, NOTE_MAX).trim();
  return text ? text : null;
}

/** A take's notes, in the order of the take. */
export function takeNotes(notes: readonly Note[], takeId: string): Note[] {
  return notes
    .filter((n) => n.take_id === takeId && n.take_seconds != null)
    .sort((a, b) => Number(a.take_seconds) - Number(b.take_seconds));
}

/**
 * The notes the song (studio) shows on this device: every note not tied to a take, and a take's notes only
 * for their recipient (or when they are for nobody in particular).
 */
export function songNotes(notes: readonly Note[], meId: string | null): Note[] {
  return notes.filter((n) => !n.take_id || !n.for_member_id || n.for_member_id === meId);
}

/**
 * The note a playing review crosses between two clock ticks: only natural forward playback (no scrubs, no
 * jumps longer than a slow tick), like the studio's note bubble.
 */
export function crossedNote(notes: readonly Note[], last: number, now: number): Note | null {
  if (!(now > last) || now - last >= 2.5) return null;
  return (
    notes.find(
      (n) => n.take_seconds != null && Number(n.take_seconds) > last && Number(n.take_seconds) <= now,
    ) ?? null
  );
}
