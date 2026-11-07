import type { Take } from '@coverscape/shared';

/**
 * The name a take shows in «Tomas»: a name typed by the group (`label`), else who dances it, else the name of the
 * uploaded file («Grupo 1 · Primera versión»), else «Sin nombre». Pure: no DOM, no network.
 */

/** Same limit as the database (`takes_label_length`: 1–80 letters once trimmed). */
export const TAKE_LABEL_MAX = 80;

/** What is saved from the «Nombre» field: trimmed, at most 80 letters; empty → no name (null). */
export function cleanLabel(value: string | null | undefined): string | null {
  const text = (value ?? '').replace(/\s+/g, ' ').trim().slice(0, TAKE_LABEL_MAX).trim();
  return text || null;
}

/** Files the recorder names itself (`takeFileName`): they say nothing a person would call the take. */
const APP_FILE = /^one-shoot-/i;

/** A file's name without its extension («Grupo 1 · Primera versión.mp4» → «Grupo 1 · Primera versión»). */
export function labelFromFileName(fileName: string | null | undefined): string | null {
  if (!fileName) return null;
  return cleanLabel(fileName.replace(/\.[A-Za-z0-9]{1,10}$/, '').replace(/_/g, ' '));
}

/**
 * The take's own name: its label or, for a take of nobody in particular, the name of the file uploaded from the gallery
 * (a take with a person shows that person before any file name).
 */
export function takeOwnTitle(take: Pick<Take, 'label' | 'file_name' | 'member_id'>): string | null {
  const label = cleanLabel(take.label);
  if (label) return label;
  if (take.member_id || !take.file_name || APP_FILE.test(take.file_name)) return null;
  return labelFromFileName(take.file_name);
}

/**
 * The row's title and, when the take has its own name and a person too, that person as the secondary line.
 * `memberName` is the member's name (null when the take has nobody).
 */
export function takeTitle(
  take: Pick<Take, 'label' | 'file_name' | 'member_id'>,
  memberName: string | null,
): { title: string; person: string | null } {
  const own = takeOwnTitle(take);
  const person = take.member_id ? memberName : null;
  if (own) return { title: own, person };
  return { title: person ?? 'Sin nombre', person: null };
}
