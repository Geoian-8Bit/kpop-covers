import {
  CLAP_SCALE,
  CLAP_SENSITIVITIES,
  migrateClapSensitivity,
  type ClapSensitivity,
  type RecordCodec,
  type RecordQuality,
  type ResolutionChoice,
} from '@coverscape/shared';
import { create } from 'zustand';
import type { Facing } from './camera';

/**
 * The recorder's settings (A1), remembered on each phone. Not player state: they only shape how the camera is
 * opened and how a take is encoded.
 */
export interface RecordSettings {
  quality: RecordQuality;
  resolution: ResolutionChoice;
  /** 60 is used only when the camera gives it. */
  fps: 30 | 60;
  codec: RecordCodec;
  /** P25 · The recorder always opens with the camera used last (the back one the first time). */
  lastFacing: Facing;
  /** The take's sound: the song itself (files only) or the microphone (S3). */
  sound: 'song' | 'mic';
  micChannels: 'mono' | 'stereo';
  grid: boolean;
  level: boolean;
  /** Shows the «i» button. */
  info: boolean;
  /** Q5: record the camera picture as it comes when possible, or always redraw it on a canvas. */
  mode: 'auto' | 'canvas';
  /** F7: how loud the double clap that starts a take must be (low for rooms with echo or noise). */
  clapSensitivity: ClapSensitivity;
}

export const DEFAULT_RECORD_SETTINGS: RecordSettings = {
  quality: 'auto',
  resolution: 'auto',
  fps: 60,
  codec: 'auto',
  lastFacing: 'environment',
  sound: 'song',
  micChannels: 'stereo',
  grid: false,
  level: false,
  info: false,
  mode: 'auto',
  clapSensitivity: 'medium',
};

const KEY = 'oneshoot.record.v1';

const ALLOWED: { [K in keyof RecordSettings]: readonly RecordSettings[K][] } = {
  quality: ['saver', 'high', 'max', 'auto'],
  resolution: ['auto', '4k', '1440p', '1080p', '720p'],
  fps: [30, 60],
  codec: ['auto', 'h264'],
  lastFacing: ['user', 'environment'],
  sound: ['song', 'mic'],
  micChannels: ['mono', 'stereo'],
  grid: [true, false],
  level: [true, false],
  info: [true, false],
  mode: ['auto', 'canvas'],
  clapSensitivity: CLAP_SENSITIVITIES,
};

/** Keeps only known values: an old or hand-edited entry falls back to the default, key by key. */
export function sanitizeSettings(raw: unknown): RecordSettings {
  const out = { ...DEFAULT_RECORD_SETTINGS };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(ALLOWED) as (keyof RecordSettings)[]) {
    const value = (raw as Record<string, unknown>)[key];
    if ((ALLOWED[key] as readonly unknown[]).includes(value)) (out as Record<string, unknown>)[key] = value;
  }
  // P25 · The old «Cámara al abrir» setting is gone: whoever had it on «Trasera» or «Frontal» opens with that
  // camera once more (then the last one used takes over); «Última usada» already is the new rule.
  const old = (raw as Record<string, unknown>).startCamera;
  if (old === 'back') out.lastFacing = 'environment';
  else if (old === 'front') out.lastFacing = 'user';
  // P21 · The clap sensitivity went from 3 levels to 4: an entry saved without `clapScale` is on the old scale.
  const r = raw as Record<string, unknown>;
  out.clapSensitivity = migrateClapSensitivity(r.clapSensitivity, r.clapScale) ?? DEFAULT_RECORD_SETTINGS.clapSensitivity;
  return out;
}

function read(): RecordSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_RECORD_SETTINGS };
  }
}

interface SettingsStore extends RecordSettings {
  set(patch: Partial<RecordSettings>): void;
}

export const useRecordSettings = create<SettingsStore>()((set, get) => ({
  ...read(),
  set(patch) {
    set(patch);
    const { set: _omit, ...current } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...current, clapScale: CLAP_SCALE }));
    } catch {
      /* remembered for this visit only */
    }
  },
}));

/** The settings as plain values, for code outside React. */
export function recordSettings(): RecordSettings {
  const { set: _omit, ...current } = useRecordSettings.getState();
  return current;
}

/** Camera the recorder opens with (P25: the last one used; the back one the first time). */
export function initialFacing(s: Pick<RecordSettings, 'lastFacing'>): Facing {
  return s.lastFacing;
}
