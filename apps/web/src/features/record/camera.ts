import { belowRequested } from '@coverscape/shared';

/**
 * Camera and microphone access for the recording studio. Picture and sound are asked for separately:
 * switching lens or flipping the camera restarts only the picture, never the sound under a take.
 */
export type Facing = 'user' | 'environment';

/** Camera abilities the standard TS types don't list yet (Chrome/Android expose them, Safari partly). */
type CameraCaps = MediaTrackCapabilities & { zoom?: { min: number; max: number }; torch?: boolean };

export interface CameraAbilities {
  /** The lens's own zoom range, when the browser lets us drive it. */
  zoom: { min: number; max: number } | null;
  zoomNow: number;
  torch: boolean;
}

/** Size and rate to ask for. Landscape numbers on purpose: phones pick a real mode and turn it as held. */
export interface CameraWant {
  width: number;
  height: number;
  fps: 30 | 60;
}

const sizeOf = (want: CameraWant, fps = want.fps) => ({
  width: { ideal: want.width },
  height: { ideal: want.height },
  frameRate: { ideal: fps },
});

export async function openCamera(facing: Facing, deviceId: string | null, want: CameraWant): Promise<MediaStream> {
  const SIZE = sizeOf(want);
  const base: MediaTrackConstraints = deviceId
    ? { deviceId: { exact: deviceId }, ...SIZE }
    : { facingMode: { ideal: facing }, ...SIZE };
  // `zoom: true` asks Chrome for the lens zoom too (otherwise it stays hidden on many Androids).
  const supported = navigator.mediaDevices.getSupportedConstraints?.() as MediaTrackSupportedConstraints & {
    zoom?: boolean;
  };
  if (supported?.zoom) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { ...base, zoom: true } as MediaTrackConstraints,
        audio: false,
      });
    } catch {
      // Zoom refused or unknown here: the camera alone (a refused camera fails again just below).
    }
  }
  return navigator.mediaDevices.getUserMedia({ video: base, audio: false });
}

/**
 * Raw microphone: music through the speaker must not be "cancelled" as if it were an echo, nor squashed by the
 * automatic volume (S2). Two channels when the phone has them (Samsungs have several microphones).
 */
export async function openMic(channels: 'mono' | 'stereo' = 'stereo'): Promise<MediaStreamTrack | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: channels === 'stereo' ? 2 : 1 },
        sampleRate: { ideal: 48_000 },
      },
      video: false,
    });
    return stream.getAudioTracks()[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Q3/Q4: a camera asked for 1080p60 may trade the size for the rate (720p60). The plan prefers the size:
 * ask again at 30 fps for the same picture. Resolves with what the camera ends up giving.
 */
export async function settleCameraMode(
  track: MediaStreamTrack | undefined,
  want: CameraWant,
): Promise<{ width: number; height: number; fps: number }> {
  const read = () => {
    const s = track?.getSettings?.() ?? {};
    return { width: s.width ?? 0, height: s.height ?? 0, fps: s.frameRate ?? 0 };
  };
  const got = read();
  if (!track || want.fps !== 60 || !got.width) return got;
  if (!belowRequested(got, want)) return got;
  try {
    await track.applyConstraints(sizeOf(want, 30));
  } catch {
    /* keep what we had */
  }
  return read();
}

export function readAbilities(track: MediaStreamTrack | undefined): CameraAbilities {
  const caps = (track?.getCapabilities?.() ?? {}) as CameraCaps;
  const settings = (track?.getSettings?.() ?? {}) as MediaTrackSettings & { zoom?: number };
  const zoom = caps.zoom && caps.zoom.max > caps.zoom.min ? { min: caps.zoom.min, max: caps.zoom.max } : null;
  return { zoom, zoomNow: settings.zoom ?? 1, torch: Boolean(caps.torch) };
}

type Range = { min: number; max: number; step?: number };
type FullCaps = MediaTrackCapabilities & {
  zoom?: Range;
  torch?: boolean;
  focusMode?: string[];
  exposureMode?: string[];
  exposureCompensation?: Range;
  whiteBalanceMode?: string[];
  colorTemperature?: Range;
  focusDistance?: Range;
};

/** What the camera really gives, for the «i» panel (plan: prueba 3). */
export interface TrackInfo {
  label: string;
  width: number;
  height: number;
  frameRate: number;
  maxWidth: number | null;
  maxHeight: number | null;
  maxFrameRate: number | null;
  zoom: Range | null;
  torch: boolean;
  focusModes: string[];
  exposureModes: string[];
  exposureCompensation: Range | null;
  whiteBalanceModes: string[];
  colorTemperature: Range | null;
  pointsOfInterest: boolean;
}

export function readTrackInfo(track: MediaStreamTrack | undefined): TrackInfo | null {
  if (!track) return null;
  const caps = (track.getCapabilities?.() ?? {}) as FullCaps;
  const s = track.getSettings?.() ?? {};
  const supported = (navigator.mediaDevices.getSupportedConstraints?.() ?? {}) as Record<string, boolean>;
  const range = (r: Range | undefined) => (r && r.max > r.min ? { min: r.min, max: r.max, step: r.step } : null);
  return {
    label: track.label,
    width: s.width ?? 0,
    height: s.height ?? 0,
    frameRate: Math.round((s.frameRate ?? 0) * 10) / 10,
    maxWidth: caps.width?.max ?? null,
    maxHeight: caps.height?.max ?? null,
    maxFrameRate: caps.frameRate?.max ?? null,
    zoom: range(caps.zoom),
    torch: Boolean(caps.torch),
    focusModes: caps.focusMode ?? [],
    exposureModes: caps.exposureMode ?? [],
    exposureCompensation: range(caps.exposureCompensation),
    whiteBalanceModes: caps.whiteBalanceMode ?? [],
    colorTemperature: range(caps.colorTemperature),
    pointsOfInterest: Boolean(supported.pointsOfInterest),
  };
}

/** Every camera the browser lists (names readable once the camera is allowed): checks how lenses show up. */
export async function listCameras(): Promise<string[]> {
  try {
    return (await navigator.mediaDevices.enumerateDevices())
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => d.label || `Cámara ${i + 1}`);
  } catch {
    return [];
  }
}

export function applyTrack(
  track: MediaStreamTrack | undefined,
  set: { zoom?: number; torch?: boolean },
): Promise<boolean> {
  if (!track) return Promise.resolve(false);
  return track
    .applyConstraints({ advanced: [set as MediaTrackConstraintSet] })
    .then(() => true)
    .catch(() => false);
}

// ───────────── Image controls (C1–C4): only what this camera offers is ever shown ─────────────

type Advanced = MediaTrackConstraintSet & Record<string, unknown>;

async function applyAdvanced(track: MediaStreamTrack | undefined, set: Advanced): Promise<boolean> {
  if (!track || track.readyState !== 'live') return false;
  try {
    await track.applyConstraints({ advanced: [set] });
    return true;
  } catch {
    return false;
  }
}

/**
 * C1 · Focus and meter the light on a point of the picture (0–1 from the top-left of the recorded frame,
 * not of the mirrored preview).
 */
export async function focusAt(track: MediaStreamTrack | undefined, x: number, y: number, info: TrackInfo): Promise<boolean> {
  const set: Advanced = { pointsOfInterest: [{ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }] };
  // Continuous keeps following that point (dancers move); single-shot only where that's all there is.
  if (info.focusModes.includes('continuous')) set.focusMode = 'continuous';
  else if (info.focusModes.includes('single-shot')) set.focusMode = 'single-shot';
  if (info.exposureModes.includes('continuous')) set.exposureMode = 'continuous';
  return applyAdvanced(track, set);
}

/**
 * C2 · Hold focus and exposure where they are for the whole take (someone walking past the camera must not
 * make the picture "breathe"), or let them follow the scene again.
 */
export async function lockFocusExposure(track: MediaStreamTrack | undefined, lock: boolean, info: TrackInfo): Promise<boolean> {
  const now = (track?.getSettings?.() ?? {}) as Record<string, unknown>;
  const set: Advanced = {};
  if (lock) {
    if (info.focusModes.includes('manual') && typeof now.focusDistance === 'number') {
      set.focusMode = 'manual';
      set.focusDistance = now.focusDistance;
    } else if (info.focusModes.includes('single-shot')) set.focusMode = 'single-shot';
    if (info.exposureModes.includes('manual') && typeof now.exposureTime === 'number') {
      set.exposureMode = 'manual';
      set.exposureTime = now.exposureTime;
    } else if (info.exposureModes.includes('single-shot')) set.exposureMode = 'single-shot';
  } else {
    if (info.focusModes.includes('continuous')) set.focusMode = 'continuous';
    if (info.exposureModes.includes('continuous')) set.exposureMode = 'continuous';
  }
  if (!Object.keys(set).length) return false;
  return applyAdvanced(track, set);
}

/** C2 is possible when the camera can hold its focus or exposure. */
export function canLock(info: TrackInfo | null): boolean {
  if (!info) return false;
  return (
    info.focusModes.some((m) => m === 'manual' || m === 'single-shot') ||
    info.exposureModes.some((m) => m === 'manual' || m === 'single-shot')
  );
}

/** C3 · Exposure compensation, in the camera's own steps (usually −2 to +2). */
export function setExposureCompensation(track: MediaStreamTrack | undefined, value: number): Promise<boolean> {
  return applyAdvanced(track, { exposureCompensation: value });
}

/** C4 · White balance presets (Kelvin), as the phone's camera app names them. Null = automatic. */
export const WHITE_BALANCE: { label: string; kelvin: number | null }[] = [
  { label: 'Auto', kelvin: null },
  { label: 'Cálida', kelvin: 3000 },
  { label: 'Fluorescente', kelvin: 4000 },
  { label: 'Día', kelvin: 5500 },
  { label: 'Nublado', kelvin: 6500 },
];

export function setWhiteBalance(track: MediaStreamTrack | undefined, kelvin: number | null, info: TrackInfo): Promise<boolean> {
  if (kelvin == null) {
    return info.whiteBalanceModes.includes('continuous')
      ? applyAdvanced(track, { whiteBalanceMode: 'continuous' })
      : Promise.resolve(false);
  }
  const range = info.colorTemperature;
  if (!range) return Promise.resolve(false);
  const k = Math.min(range.max, Math.max(range.min, kelvin));
  return applyAdvanced(track, { whiteBalanceMode: 'manual', colorTemperature: k });
}

/** C4 needs a manual mode with a colour temperature range. */
export function canWhiteBalance(info: TrackInfo | null): boolean {
  return Boolean(info?.colorTemperature && info.whiteBalanceModes.includes('manual'));
}

export interface BackLenses {
  ids: string[];
  /** The 0.5× lens, when its name says so (iPhone and many Androids name it). */
  ultra: string | null;
}

/** Device names are only readable once the camera is allowed. */
export async function listBackLenses(): Promise<BackLenses> {
  try {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === 'videoinput' && d.deviceId,
    );
    const back = cams.filter((d) => !/front|frontal|delantera|user|selfie|facetime/i.test(d.label));
    // iPhone also lists "virtual" lens bundles (Dual, Triple): the real lenses are enough.
    const real = back.filter((d) => !/dual|triple|desk view/i.test(d.label));
    const ultra = real.find((d) => /ultra|0[.,]5|gran ?angular|grand ?angle|weitwinkel/i.test(d.label));
    return { ids: real.map((d) => d.deviceId), ultra: ultra?.deviceId ?? null };
  } catch {
    return { ids: [], ultra: null };
  }
}

export function cameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (!navigator.mediaDevices?.getUserMedia)
    return 'Este navegador no deja usar la cámara. Abre la app en Chrome o Safari.';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Necesito permiso para usar la cámara. Actívalo en los ajustes del navegador y vuelve a intentarlo.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'No encuentro ninguna cámara en este dispositivo.';
  if (name === 'NotReadableError' || name === 'AbortError')
    return 'La cámara la está usando otra app. Ciérrala y vuelve a intentarlo.';
  return 'No se pudo abrir la cámara.';
}
