/**
 * F17 · P16 · When «Olas del audio real» may read a file to draw its wave, as pure rules (covered by
 * `studioWaveRules.test.ts`). Reading means holding the whole file in memory and decoding it, so the limits are low
 * on phones, and a file in the cloud (a second download next to the one the <video> streams) is only read on its own
 * on wifi; elsewhere the variant offers it behind a button that says how much it downloads.
 */

const MB = 1024 * 1024;

/**
 * Most bytes read for one file: 60 MB, or 30 MB on a phone with 4 GB of memory or less (`navigator.deviceMemory`,
 * Chrome only; unknown → 60 MB). Past it the wave stays the sample shape.
 */
export function waveByteLimit(deviceMemory: number | null | undefined): number {
  return typeof deviceMemory === 'number' && deviceMemory > 0 && deviceMemory <= 4 ? 30 * MB : 60 * MB;
}

export interface ConnectionHints {
  saveData?: boolean;
  /** `navigator.connection.type` (Chrome on Android): 'wifi', 'cellular', 'ethernet', 'unknown'… */
  type?: string;
}

/**
 * Whether a file in the cloud may be downloaded again to draw its wave. Never with «ahorro de datos»; yes on wifi or
 * cable; no on mobile data or any other known link. When the browser doesn't say (iPhone, desktop browsers): only
 * with a mouse or trackpad (a computer, most likely not on mobile data), never on a touch screen. When it says no,
 * the download is offered instead (`remoteWaveOffer`).
 */
export function remoteWaveAllowed(
  connection: ConnectionHints | null | undefined,
  coarsePointer: boolean,
): boolean {
  if (connection?.saveData) return false;
  const type = connection?.type;
  if (type === 'wifi' || type === 'ethernet') return true;
  if (type && type !== 'unknown') return false;
  return !coarsePointer;
}

/** The size a response declares (`Content-Length`), or null when it doesn't say or says nonsense. */
export function declaredBytes(header: string | null | undefined): number | null {
  if (header == null || !/^\s*\d+\s*$/.test(header)) return null;
  const bytes = Number(header);
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : null;
}

/**
 * What to do with a file in the cloud that may not be downloaded on its own on this connection (iPhone, mobile data,
 * «ahorro de datos»): offer the download behind a button, with its size when the server says it (a HEAD request), or
 * not at all when it is known to be past the limit.
 */
export type RemoteWaveOffer = { kind: 'ask'; bytes: number | null } | { kind: 'too-big' };

export function remoteWaveOffer(bytes: number | null | undefined, limit: number): RemoteWaveOffer {
  if (typeof bytes === 'number' && bytes > limit) return { kind: 'too-big' };
  return { kind: 'ask', bytes: typeof bytes === 'number' && bytes > 0 ? bytes : null };
}

/** «4,2 MB» under 10 MB, «23 MB» from there; never «0 MB». */
export function formatMegabytes(bytes: number): string {
  const tenths = Math.max(0.1, Math.round((bytes / MB) * 10) / 10);
  if (tenths < 10) return `${tenths.toFixed(1).replace('.', ',')} MB`;
  return `${Math.round(bytes / MB)} MB`;
}

/** The button that downloads a cloud file to draw its wave. */
export function waveDownloadLabel(bytes: number | null): string {
  return bytes ? `Dibujar la ola (descarga ${formatMegabytes(bytes)})` : 'Dibujar la ola (descarga el audio)';
}

/** The studio wave's states, as the chip in its corner reads them. */
export type StudioWaveStatus = 'none' | 'loading' | 'ready' | 'failed' | 'ask' | 'too-big';

/** The chip over the wave: what is happening, or why it is the sample shape. «ask» shows the button instead. */
export function waveChipCopy(status: StudioWaveStatus): string | null {
  switch (status) {
    case 'loading':
      return 'Leyendo el audio…';
    case 'ready':
    case 'ask':
      return null;
    case 'too-big':
      return 'Forma de ejemplo · archivo muy grande';
    default:
      return 'Forma de ejemplo';
  }
}
