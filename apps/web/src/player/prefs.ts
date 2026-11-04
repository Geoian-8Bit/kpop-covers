/**
 * REQ-27 · The player's per-device preferences (mirror, whole-song loop, metronome ticks). Reading never throws: a
 * blocked localStorage (private mode, an embedded browser) falls back to each default.
 */
const MIRROR_KEY = 'coverscape.mirrored';
const LOOP_ALL_KEY = 'coverscape.loopAll';
const COUNT_SOUND_KEY = 'coverscape.countSound';

export function readCountSoundPreference(): boolean {
  try {
    return localStorage.getItem(COUNT_SOUND_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function readLoopAllPreference(): boolean {
  try {
    return localStorage.getItem(LOOP_ALL_KEY) === 'true';
  } catch {
    return false;
  }
}

export function readMirrorPreference(): boolean {
  try {
    return localStorage.getItem(MIRROR_KEY) !== 'false';
  } catch {
    return true;
  }
}

function write(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

export const writeMirrorPreference = (value: boolean) => write(MIRROR_KEY, value);
export const writeLoopAllPreference = (value: boolean) => write(LOOP_ALL_KEY, value);
export const writeCountSoundPreference = (value: boolean) => write(COUNT_SOUND_KEY, value);
