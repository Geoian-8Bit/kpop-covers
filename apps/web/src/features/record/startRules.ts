import { formatTime, MIN_LOOP_LENGTH, normalizeRange } from '@coverscape/shared';

/**
 * P22 · Where the song starts when a take starts: the beginning, the moment the song was at when the recorder
 * opened, the A–B section, or a clip of the song (which becomes the A–B section). Pure rules, shared by the button,
 * its list and the recorder.
 */
export type StartChoice =
  | { kind: 'start' }
  | { kind: 'here'; at: number }
  | { kind: 'range'; start: number; end: number }
  | { kind: 'clip'; clipId: string; start: number; end: number; name: string };

export type StartKind = 'start' | 'here' | 'range';

/** What a tap switches between (a clip counts as the A–B section it set). */
export function startKinds(opts: { hereAt: number; duration: number; hasRange: boolean }): StartKind[] {
  const kinds: StartKind[] = ['start'];
  // «Here» only when it isn't the start, nor right at the end.
  if (opts.hereAt > 1 && (opts.duration <= 0 || opts.hereAt < opts.duration - 3)) kinds.push('here');
  if (opts.hasRange) kinds.push('range');
  return kinds;
}

/** The next kind on a tap. */
export function nextStartKind(current: StartKind, kinds: StartKind[]): StartKind {
  const i = kinds.indexOf(current);
  return kinds[(i + 1) % kinds.length] ?? 'start';
}

/** The choice as shown: a section that is exactly a clip of the song is named after the clip. */
export function currentChoice(opts: {
  kind: StartKind;
  hereAt: number;
  range: { start: number; end: number } | null;
  clip: { id: string; name: string; start_seconds: number; end_seconds: number } | null;
}): StartChoice {
  if (opts.kind === 'here') return { kind: 'here', at: opts.hereAt };
  if (opts.kind === 'range' && opts.range) {
    const c = opts.clip;
    if (c && Math.abs(c.start_seconds - opts.range.start) < 0.05 && Math.abs(c.end_seconds - opts.range.end) < 0.05)
      return { kind: 'clip', clipId: c.id, start: opts.range.start, end: opts.range.end, name: c.name };
    return { kind: 'range', start: opts.range.start, end: opts.range.end };
  }
  return { kind: 'start' };
}

/** Short text under the button and the full one for screen readers. */
export function startLabel(choice: StartChoice): { short: string; spoken: string; line: string } {
  switch (choice.kind) {
    case 'start':
      return { short: 'Inicio', spoken: 'el inicio de la canción', line: 'empieza en el inicio' };
    case 'here':
      return { short: formatTime(choice.at), spoken: `el minuto ${formatTime(choice.at)}`, line: `empieza en ${formatTime(choice.at)}` };
    case 'range':
      return {
        short: 'Tramo A–B',
        spoken: `el tramo A–B, de ${formatTime(choice.start)} a ${formatTime(choice.end)}`,
        line: `tramo A–B ${formatTime(choice.start)}–${formatTime(choice.end)}`,
      };
    case 'clip':
      return {
        short: choice.name,
        spoken: `el clip «${choice.name}», de ${formatTime(choice.start)} a ${formatTime(choice.end)}`,
        line: `clip «${choice.name}» ${formatTime(choice.start)}–${formatTime(choice.end)}`,
      };
  }
}

/**
 * P22 review · The section a clip picked in «Empieza en» becomes: only its span (the take keeps the studio's speed,
 * mirror, zoom and follow, the clip doesn't bring its own); null when the clip falls outside this video.
 */
export function clipSection(
  clip: { start_seconds: number; end_seconds: number },
  duration: number,
): { start: number; end: number } | null {
  if (duration > 0 && Math.min(clip.start_seconds, clip.end_seconds) > duration - MIN_LOOP_LENGTH) return null;
  return normalizeRange(clip.start_seconds, clip.end_seconds, duration || clip.end_seconds);
}
