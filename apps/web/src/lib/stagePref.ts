/**
 * F1 · 12 · What the person chose to watch a linked YouTube entry on, per device: «Archivo» or «YouTube». Without a
 * choice the studio uses the file when this device can reach it (see features/studio/stageRules.ts).
 */
const STAGE_KEY = 'oneshoot.stage.v2';
/** v1 only stored «Archivo» (YouTube was the default and was never written). */
const LEGACY_KEY = 'oneshoot.stage.v1';

export type StageChoice = 'youtube' | 'file';

function readAll(key: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function write(key: string, all: Record<string, string>): void {
  try {
    if (Object.keys(all).length) localStorage.setItem(key, JSON.stringify(all));
    else localStorage.removeItem(key);
  } catch {
    /* this visit only */
  }
}

/** The person's own choice for this video on this device, or null when they never picked one. */
export function readStage(videoId: string): StageChoice | null {
  const value = readAll(STAGE_KEY)[videoId] ?? readAll(LEGACY_KEY)[videoId];
  return value === 'file' || value === 'youtube' ? value : null;
}

/** The person picked a stage: it wins over the default from now on (this video, this device). */
export function rememberStage(videoId: string, stage: StageChoice): void {
  const all = readAll(STAGE_KEY);
  all[videoId] = stage;
  write(STAGE_KEY, all);
  dropLegacy(videoId);
}

/** Back to the default (the file was removed or replaced): no choice remembered for this video. */
export function forgetStage(videoId: string): void {
  const all = readAll(STAGE_KEY);
  if (videoId in all) {
    delete all[videoId];
    write(STAGE_KEY, all);
  }
  dropLegacy(videoId);
}

function dropLegacy(videoId: string): void {
  const legacy = readAll(LEGACY_KEY);
  if (!(videoId in legacy)) return;
  delete legacy[videoId];
  write(LEGACY_KEY, legacy);
}
