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

/** Landscape numbers on purpose: phones then pick a real video mode and turn it to how they're held. */
const SIZE = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };

export async function openCamera(facing: Facing, deviceId: string | null): Promise<MediaStream> {
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

/** Raw microphone: music through the speaker must not be "cancelled" as if it were an echo. */
export async function openMic(): Promise<MediaStreamTrack | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    return stream.getAudioTracks()[0] ?? null;
  } catch {
    return null;
  }
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
