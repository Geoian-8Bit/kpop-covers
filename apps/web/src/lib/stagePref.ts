/** F1 · The stage each linked YouTube entry was last watched on, per device (YouTube by default). */
const STAGE_KEY = 'oneshoot.stage.v1';

function readAll(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STAGE_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export function readStage(videoId: string): 'youtube' | 'file' {
  return readAll()[videoId] === 'file' ? 'file' : 'youtube';
}

export function rememberStage(videoId: string, stage: 'youtube' | 'file'): void {
  try {
    const all = readAll();
    if (stage === 'file') all[videoId] = 'file';
    else delete all[videoId];
    localStorage.setItem(STAGE_KEY, JSON.stringify(all));
  } catch {
    /* this visit only */
  }
}
