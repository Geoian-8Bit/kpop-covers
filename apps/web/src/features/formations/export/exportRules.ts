import type { Keyframe, Stage } from '../formationRules';

/**
 * REQ-11 / REQ-12 · Pure rules of the exports: file names, where the stage sits on a picture, and which frames a
 * video of the plan has. No DOM: testable in Node.
 */

/** Margins around the floor in metres, the same as the editor's stage (room for names and «PÚBLICO»). */
export const STAGE_PAD = 0.7;
export const STAGE_AUDIENCE = 0.9;

/** Width of the PNG (px); its height follows the stage's proportion. */
export const PNG_WIDTH = 1600;
/** Header (plan, time) and footer (note) bands of the PNG, px. */
export const PNG_HEADER = 132;
export const PNG_FOOTER = 120;

/** A4 landscape page drawn at 150 dpi (px) and its size in mm. */
export const PDF_PAGE_PX = { width: 1754, height: 1240 } as const;
export const PDF_PAGE_MM = { width: 297, height: 210 } as const;

/** REQ-12 · The video: frames per second, longest plan and width of the picture. */
export const VIDEO_FPS = 30;
export const VIDEO_MAX_SECONDS = 600;
export const VIDEO_WIDTH = 1280;
/** Seconds shown before the first formation and after the last one. */
export const VIDEO_LEAD = 1;
export const VIDEO_TAIL = 1.5;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The stage's whole drawing in metres: floor plus margins (x from −PAD, y from −PAD). */
export function stageExtent(stage: Pick<Stage, 'width' | 'depth'>): { w: number; h: number } {
  return { w: stage.width + STAGE_PAD * 2, h: stage.depth + STAGE_PAD + STAGE_AUDIENCE };
}

/** px per metre and the floor's corner (0,0) inside `box`, keeping the proportion and centring it. */
export function fitStage(stage: Pick<Stage, 'width' | 'depth'>, box: Rect): { scale: number; originX: number; originY: number } {
  const ext = stageExtent(stage);
  const scale = Math.min(box.w / ext.w, box.h / ext.h);
  const left = box.x + (box.w - ext.w * scale) / 2;
  const top = box.y + (box.h - ext.h * scale) / 2;
  return { scale, originX: left + STAGE_PAD * scale, originY: top + STAGE_PAD * scale };
}

/** Size of the PNG of one formation: fixed width, the stage's proportion, plus header and footer. */
export function pngSize(stage: Pick<Stage, 'width' | 'depth'>): { width: number; height: number; stage: Rect } {
  const ext = stageExtent(stage);
  const margin = 48;
  const w = PNG_WIDTH - margin * 2;
  const h = Math.round((w * ext.h) / ext.w);
  return { width: PNG_WIDTH, height: PNG_HEADER + h + PNG_FOOTER, stage: { x: margin, y: PNG_HEADER, w, h } };
}

/** «Con 5 · Supernova» → «con-5-supernova» (letters and digits only, no accents, at most 48 characters). */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}

/** File name of an export: «formacion-con-5-0m10s.png», «formaciones-con-5.pdf», «formaciones-con-5.mp4». */
export function exportFileName(planName: string, ext: 'png' | 'pdf' | 'mp4', at?: number): string {
  const slug = slugify(planName) || 'plan';
  if (ext === 'png') {
    const t = Math.max(0, Math.round(at ?? 0));
    return `formacion-${slug}-${Math.floor(t / 60)}m${String(t % 60).padStart(2, '0')}s.png`;
  }
  return `formaciones-${slug}.${ext}`;
}

/** «m:ss» for the PDF and the picture (REQ-11). */
export function formatClock(t: number): string {
  const total = Math.max(0, Math.round(t));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// ───────────── REQ-12 · Video ─────────────

export interface LoopRange {
  enabled: boolean;
  start: number | null;
  end: number | null;
}

export type VideoRange = { ok: true; start: number; end: number } | { ok: false; reason: 'empty' | 'too_long' };

/**
 * What the video covers: the A–B loop when it is on, else the plan from a moment before its first formation to a
 * moment after its last one (never past the song's end when it is known). Longer than 10 minutes: refused.
 */
export function videoRange(list: readonly Keyframe[], loop: LoopRange, duration: number): VideoRange {
  let start: number;
  let end: number;
  if (loop.enabled && loop.start != null && loop.end != null && loop.end > loop.start) {
    start = loop.start;
    end = loop.end;
  } else {
    if (list.length === 0) return { ok: false, reason: 'empty' };
    const ats = list.map((f) => f.at);
    start = Math.max(0, Math.min(...ats) - VIDEO_LEAD);
    end = Math.max(...ats) + VIDEO_TAIL;
    if (duration > 0) end = Math.min(end, Math.max(duration, start + 0.5));
  }
  if (end - start > VIDEO_MAX_SECONDS + 1e-6) return { ok: false, reason: 'too_long' };
  return { ok: true, start, end };
}

/** Frames of a video `seconds` long (at least one). */
export function frameCount(seconds: number, fps = VIDEO_FPS): number {
  return Math.max(1, Math.round(seconds * fps));
}

/** The song's time drawn in frame `i` of a video that starts at `start`. */
export function frameTime(i: number, start: number, fps = VIDEO_FPS): number {
  return start + i / fps;
}

/** Timestamp (µs) and duration (µs) of frame `i`, exact on the frame grid (no drift over minutes). */
export function frameStamp(i: number, fps = VIDEO_FPS): { timestamp: number; duration: number } {
  const timestamp = Math.round((i * 1e6) / fps);
  return { timestamp, duration: Math.round(((i + 1) * 1e6) / fps) - timestamp };
}

/** One key frame every two seconds, so a player can seek. */
export function isKeyFrame(i: number, fps = VIDEO_FPS): boolean {
  return i % (fps * 2) === 0;
}

/** Even pixel size of the video for a stage (encoders want even sides): fixed width, the stage's proportion. */
export function videoSize(stage: Pick<Stage, 'width' | 'depth'>, width = VIDEO_WIDTH): { width: number; height: number } {
  const ext = stageExtent(stage);
  const header = 0.09; // share of the height for the time and the note
  const h = Math.round((width * ext.h) / ext.w / (1 - header));
  const even = (n: number) => Math.max(2, n - (n % 2));
  return { width: even(width), height: even(Math.min(h, 1440)) };
}

/**
 * Sound samples of the song between two moments of the plan's clock. A linked file is `fileOffset` seconds ahead
 * (file time = song time + offset, like the player's `withOffset`).
 */
export function soundWindow(start: number, end: number, fileOffset: number, sampleRate: number, totalSamples: number): { from: number; count: number; pad: number } {
  const first = Math.round((start + fileOffset) * sampleRate);
  const count = Math.max(0, Math.round((end - start) * sampleRate));
  // A start before the file's first sample is silence first.
  const pad = Math.min(count, Math.max(0, -first));
  const from = Math.max(0, first);
  return { from: Math.min(from, totalSamples), count, pad };
}

/** Progress 0–100 of an export of `total` frames after `done`, leaving the last per cent for the file. */
export function exportPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(99, Math.floor((done / total) * 99));
}
