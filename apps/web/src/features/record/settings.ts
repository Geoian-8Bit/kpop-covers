import type { RecordCodec, RecordQuality, ResolutionChoice } from '@coverscape/shared';
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
  /** Camera when the recorder opens (Q8). */
  startCamera: 'back' | 'front' | 'last';
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
}

export const DEFAULT_RECORD_SETTINGS: RecordSettings = {
  quality: 'auto',
  resolution: 'auto',
  fps: 60,
  codec: 'auto',
  startCamera: 'back',
  lastFacing: 'environment',
  sound: 'song',
  micChannels: 'stereo',
  grid: false,
  level: false,
  info: false,
  mode: 'auto',
};

const KEY = 'oneshoot.record.v1';

const ALLOWED: { [K in keyof RecordSettings]: readonly RecordSettings[K][] } = {
  quality: ['saver', 'high', 'max', 'auto'],
  resolution: ['auto', '4k', '1440p', '1080p', '720p'],
  fps: [30, 60],
  codec: ['auto', 'h264'],
  startCamera: ['back', 'front', 'last'],
  lastFacing: ['user', 'environment'],
  sound: ['song', 'mic'],
  micChannels: ['mono', 'stereo'],
  grid: [true, false],
  level: [true, false],
  info: [true, false],
  mode: ['auto', 'canvas'],
};

/** Keeps only known values: an old or hand-edited entry falls back to the default, key by key. */
export function sanitizeSettings(raw: unknown): RecordSettings {
  const out = { ...DEFAULT_RECORD_SETTINGS };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(ALLOWED) as (keyof RecordSettings)[]) {
    const value = (raw as Record<string, unknown>)[key];
    if ((ALLOWED[key] as readonly unknown[]).includes(value)) (out as Record<string, unknown>)[key] = value;
  }
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
      localStorage.setItem(KEY, JSON.stringify(current));
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

/** Camera the recorder opens with (Q8). */
export function initialFacing(s: RecordSettings): Facing {
  if (s.startCamera === 'front') return 'user';
  if (s.startCamera === 'back') return 'environment';
  return s.lastFacing;
}
