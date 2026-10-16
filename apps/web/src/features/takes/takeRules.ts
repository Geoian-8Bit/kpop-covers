import type { Take, TablesInsert } from '@coverscape/shared';

/**
 * F3 / F4 · Pure rules of the «Tomas» tab: where a take is, who may delete it, filters, order (best first),
 * the row a saved take writes, and the size of the reduced copy shared with the group. No DOM, no network.
 */

// ───────────── Where a take is ─────────────

/** 'here': its video is on this phone · 'cloud': only the shared 720p copy · 'elsewhere': on another phone. */
export type TakeWhere = 'here' | 'cloud' | 'elsewhere';
export type TakeItem = Take & { where: TakeWhere };

export function takeWhere(take: Pick<Take, 'id' | 'shared_path'>, keptHere: ReadonlySet<string>): TakeWhere {
  if (keptHere.has(take.id)) return 'here';
  if (take.shared_path) return 'cloud';
  return 'elsewhere';
}

export function withWhere(take: Take, keptHere: ReadonlySet<string>): TakeItem {
  return { ...take, where: takeWhere(take, keptHere) };
}

/** The label under a take: «En este móvil», «En la nube», «En el móvil de Ana»… */
export function whereLabel(
  take: Pick<TakeItem, 'where' | 'shared_path' | 'device_id'>,
  ctx: { deviceId: string; ownerName: string | null },
): string {
  if (take.where === 'here') return take.shared_path ? 'En este móvil · compartida' : 'En este móvil';
  if (take.where === 'cloud') return 'En la nube';
  if (take.device_id && take.device_id === ctx.deviceId) return 'Ya no está en este móvil';
  return ctx.ownerName ? `En el móvil de ${ctx.ownerName}` : 'En otro móvil';
}

// ───────────── Device id ─────────────

export const DEVICE_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** Same check as the database (`takes.device_id`). */
export function isDeviceId(value: unknown): value is string {
  return typeof value === 'string' && DEVICE_ID_PATTERN.test(value);
}

/** A fresh device id (a UUID: 36 letters, digits and hyphens). */
export function newDeviceId(random: () => string = () => crypto.randomUUID()): string {
  const id = String(random());
  if (DEVICE_ID_PATTERN.test(id)) return id;
  // Never store something the database would refuse.
  const clean = id.replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
  return clean.length >= 8 ? clean : `${clean}${'0'.repeat(8 - clean.length)}`;
}

// ───────────── Who may delete ─────────────

export type DeleteVerdict = { ok: true } | { ok: false; reason: string };

export const DELETE_REFUSED = 'Solo puede borrarla quien la grabó o el móvil donde está.';

/** «Solo puede borrarla quien la grabó o el dispositivo donde está» (trust rule, no login). */
export function canDeleteTake(
  take: Pick<TakeItem, 'where' | 'device_id' | 'member_id'>,
  ctx: { deviceId: string; meId: string | null },
): DeleteVerdict {
  if (take.where === 'here') return { ok: true };
  if (take.device_id && take.device_id === ctx.deviceId) return { ok: true };
  if (ctx.meId && take.member_id === ctx.meId) return { ok: true };
  return { ok: false, reason: DELETE_REFUSED };
}

/** «Limpiar»: the takes without a star this device may delete (one by one). */
export function cleanupCandidates<T extends TakeItem>(takes: readonly T[], ctx: { deviceId: string; meId: string | null }): T[] {
  return takes.filter((t) => !t.is_best && canDeleteTake(t, ctx).ok);
}

/** This device's takes without a name (F2: offered to whoever this device says it is). */
export function unnamedHere<T extends Pick<Take, 'device_id' | 'member_id'>>(takes: readonly T[], deviceId: string): T[] {
  return takes.filter((t) => t.member_id == null && t.device_id === deviceId);
}

// ───────────── Filters and order ─────────────

export type DateFilter = 'today' | 'week' | 'all';
export interface TakeFilter {
  /** 'all', 'none' («Sin nombre») or a member id. */
  member: string;
  /** 'all', 'none' (no clip) or a clip id. */
  clip: string;
  date: DateFilter;
}
export const NO_FILTER: TakeFilter = { member: 'all', clip: 'all', date: 'all' };

export function isFiltered(filter: TakeFilter): boolean {
  return filter.member !== 'all' || filter.clip !== 'all' || filter.date !== 'all';
}

export function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Monday 00:00 of this week (weeks start on Monday in Spain). */
export function startOfWeek(now: Date): Date {
  const day = startOfDay(now);
  const sinceMonday = (day.getDay() + 6) % 7;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - sinceMonday);
}

function matches(value: string | null, wanted: string): boolean {
  if (wanted === 'all') return true;
  if (wanted === 'none') return value == null;
  return value === wanted;
}

export function filterTakes<T extends Pick<Take, 'member_id' | 'clip_id' | 'recorded_at'>>(
  takes: readonly T[],
  filter: TakeFilter,
  now: Date = new Date(),
): T[] {
  const since = filter.date === 'today' ? startOfDay(now).getTime() : filter.date === 'week' ? startOfWeek(now).getTime() : null;
  return takes.filter((t) => {
    if (!matches(t.member_id, filter.member) || !matches(t.clip_id, filter.clip)) return false;
    if (since == null) return true;
    const at = Date.parse(t.recorded_at);
    return Number.isFinite(at) && at >= since;
  });
}

/** Best takes first (F4), then newest first. */
export function sortTakes<T extends Pick<Take, 'is_best' | 'recorded_at'>>(takes: readonly T[]): T[] {
  return [...takes].sort(
    (a, b) => Number(b.is_best) - Number(a.is_best) || b.recorded_at.localeCompare(a.recorded_at),
  );
}

// ───────────── Best take (F4) ─────────────

/** Same trio as the database trigger: one best take per song, section (clip) and person. */
export function sameTrio(a: Pick<Take, 'video_id' | 'member_id' | 'clip_id'>, b: Pick<Take, 'video_id' | 'member_id' | 'clip_id'>): boolean {
  return a.video_id === b.video_id && (a.member_id ?? null) === (b.member_id ?? null) && (a.clip_id ?? null) === (b.clip_id ?? null);
}

/** The list after starring (or unstarring) one take: starring clears the others of its trio, like the database. */
export function applyBest<T extends Take>(takes: readonly T[], id: string, isBest: boolean): T[] {
  const target = takes.find((t) => t.id === id);
  if (!target) return [...takes];
  return takes.map((t) => {
    if (t.id === id) return { ...t, is_best: isBest };
    if (isBest && t.is_best && sameTrio(t, target)) return { ...t, is_best: false };
    return t;
  });
}

/**
 * Patch that gives a take to a member (F2). The database only enforces one best take when `is_best` changes,
 * so a starred take that would become that member's second best for the same section loses its star here.
 */
export function assignPatch(
  take: Take,
  memberId: string,
  all: readonly Take[],
): { member_id: string; is_best?: boolean } {
  if (!take.is_best) return { member_id: memberId };
  const moved = { ...take, member_id: memberId };
  const clash = all.some((t) => t.id !== take.id && t.is_best && sameTrio(t, moved));
  return clash ? { member_id: memberId, is_best: false } : { member_id: memberId };
}

// ───────────── The row of a saved take ─────────────

export interface SaveTakeInput {
  /** The take's id: the same as its folder on this phone (`TakeSink.id`). */
  id: string;
  videoId: string;
  memberId: string | null;
  songStart: number;
  songEnd?: number | null;
  clipId?: string | null;
  speed: number;
  mirrored: boolean;
  durationSeconds: number;
  width?: number | null;
  height?: number | null;
  mimeType?: string | null;
  fileName?: string | null;
  /** ISO time it started recording (defaults to now). */
  recordedAt?: string | null;
}

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;
const finite = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

function dimension(value: number | null | undefined): number | null {
  if (!finite(value)) return null;
  const n = Math.round(value);
  return n >= 1 && n <= 8192 ? n : null;
}

/** A row the `takes` checks always accept (rounded, clamped, trimmed). */
export function takeRow(input: SaveTakeInput, deviceId: string): TablesInsert<'takes'> {
  const start = round(Math.max(0, finite(input.songStart) ? input.songStart : 0), 3);
  const end = finite(input.songEnd) ? round(Math.max(start, input.songEnd), 3) : null;
  const speed = round(Math.min(2, Math.max(0.25, finite(input.speed) ? input.speed : 1)), 2);
  const duration = round(Math.min(7200, Math.max(0, finite(input.durationSeconds) ? input.durationSeconds : 0)), 3);
  const recordedAt = input.recordedAt && Number.isFinite(Date.parse(input.recordedAt)) ? input.recordedAt : undefined;
  return {
    id: input.id,
    video_id: input.videoId,
    member_id: input.memberId,
    clip_id: input.clipId ?? null,
    song_start_seconds: start,
    song_end_seconds: end,
    speed,
    mirrored: input.mirrored,
    duration_seconds: duration,
    width: dimension(input.width),
    height: dimension(input.height),
    mime_type: input.mimeType ? input.mimeType.slice(0, 120) : null,
    file_name: input.fileName ? input.fileName.slice(0, 255) : null,
    device_id: isDeviceId(deviceId) ? deviceId : null,
    ...(recordedAt ? { recorded_at: recordedAt } : {}),
  };
}

// ───────────── The reduced copy shared with the group ─────────────

export const SHARE = {
  /** 720p: the long side at most 1280 px. */
  longSide: 1280,
  videoBps: 2_000_000,
  audioBps: 128_000,
  /** Below this the copy isn't worth watching: too long to share. */
  minVideoBps: 1_000_000,
  fps: 30,
  /** The `takes` bucket's limit per file (50 MB). */
  maxBytes: 52_428_800,
  /** Encoders overshoot a little: aim under the limit. */
  margin: 0.9,
  /** Free plan storage (1 GB) and when to warn. */
  quotaBytes: 1024 ** 3,
  warnRatio: 0.8,
} as const;

/** Size of the reduced copy: the long side fits 1280 px, never upscaled, even numbers (encoders need them). */
export function shareDimensions(width: number, height: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: SHARE.longSide, height: 720 };
  const scale = Math.min(1, SHARE.longSide / Math.max(width, height));
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

/** Expected bytes of the reduced copy (video + audio). */
export function shareBytes(seconds: number, videoBps: number = SHARE.videoBps, audioBps: number = SHARE.audioBps): number {
  if (!(seconds > 0)) return 0;
  return Math.round(((videoBps + audioBps) / 8) * seconds);
}

/**
 * Video bitrate for a take of `seconds`: 2 Mbps (≈ 16 MB a minute) while it fits under 50 MB, lowered for longer
 * takes down to 1 Mbps; null when even that wouldn't fit. Unknown length → 2 Mbps (the size is checked after).
 */
export function shareVideoBitrate(seconds: number): number | null {
  if (!(seconds > 0)) return SHARE.videoBps;
  const budget = (SHARE.maxBytes * SHARE.margin * 8) / seconds - SHARE.audioBps;
  if (budget >= SHARE.videoBps) return SHARE.videoBps;
  if (budget >= SHARE.minVideoBps) return Math.floor(budget / 1000) * 1000;
  return null;
}

/** Longest take that can be shared, in seconds. */
export function maxShareSeconds(): number {
  return Math.floor((SHARE.maxBytes * SHARE.margin * 8) / (SHARE.minVideoBps + SHARE.audioBps));
}

/** MediaRecorder types for the reduced copy, best first: MP4 H.264 (720p30 levels), then WebM. */
export function shareMimeCandidates(): string[] {
  return [
    'video/mp4;codecs=avc1.4D401F,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
}

/** The plain container type and file extension of a recorder type ('' = the browser chose). */
export function containerOf(mime: string): { type: 'video/mp4' | 'video/webm'; extension: 'mp4' | 'webm' } {
  return /mp4/i.test(mime) ? { type: 'video/mp4', extension: 'mp4' } : { type: 'video/webm', extension: 'webm' };
}

/** `<group>/<take id>.<ext>`: the only name the bucket accepts for a take. */
export function sharedPath(take: Pick<Take, 'crew_id' | 'id'>, extension: string): string {
  return `${take.crew_id}/${take.id}.${extension}`;
}

export interface QuotaState {
  used: number;
  ratio: number;
  /** Past 80 %. */
  warn: boolean;
  full: boolean;
}

export function quotaState(usedBytes: number): QuotaState {
  const used = Math.max(0, usedBytes || 0);
  const ratio = used / SHARE.quotaBytes;
  return { used, ratio: Math.min(1, ratio), warn: ratio >= SHARE.warnRatio, full: ratio >= 1 };
}

/** Would sharing a copy of `bytes` go past the group's 1 GB? */
export function wouldOverflow(usedBytes: number, bytes: number): boolean {
  return Math.max(0, usedBytes || 0) + Math.max(0, bytes) > SHARE.quotaBytes;
}

// ───────────── Labels ─────────────

/** «Hoy, 18:32», «Ayer, 09:10», «lun 12 oct, 18:32» (local time). */
export function takeDateLabel(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const time = at.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const day = startOfDay(at).getTime();
  const today = startOfDay(now).getTime();
  if (day === today) return `Hoy, ${time}`;
  if (day === startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)).getTime()) return `Ayer, ${time}`;
  const sameYear = at.getFullYear() === now.getFullYear();
  const date = at
    .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
    .replace(/\./g, '')
    .replace(/,/g, '');
  return `${date}, ${time}`;
}

/** «1 toma», «3 tomas». */
export function takesCount(n: number): string {
  return `${n} ${n === 1 ? 'toma' : 'tomas'}`;
}
