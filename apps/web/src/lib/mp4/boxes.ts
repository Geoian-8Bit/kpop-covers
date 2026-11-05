/**
 * REQ-28 · Q-04 · The MP4 pieces both writers share: the copy for the cloud (`features/studio/mp4Mux.ts`) and the
 * separated tracks (`features/voice/separate/mp4.ts`). Each writer keeps its own byte writer and layout; only what
 * was written twice lives here: the identity matrix, the MPEG-4 descriptor framing, the AAC-LC AudioSpecificConfig
 * and the run-length coding of the sample tables. Pure (no DOM): it runs in workers and in Node tests alike.
 */

/** The identity transform of `mvhd` and `tkhd` (16.16 and 2.30 fixed point). */
export const MATRIX: readonly number[] = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];

/** The sampling frequencies an AudioSpecificConfig can name by index (ISO 14496-3). */
export const AAC_SAMPLE_RATES: readonly number[] = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
];

/** The frequency index of a rate, or -1 when it has none (each caller decides what that means). */
export function aacRateIndex(sampleRate: number): number {
  return AAC_SAMPLE_RATES.indexOf(sampleRate);
}

/**
 * The two-byte AudioSpecificConfig of AAC-LC (object type 2) for a frequency index and a channel configuration.
 * The caller resolves an unknown rate (index 0 or an error) and masks the channels as it always did.
 */
export function aacLcConfig(rateIndex: number, channelBits: number): Uint8Array {
  return new Uint8Array([(2 << 3) | (rateIndex >> 1), ((rateIndex & 1) << 7) | (channelBits << 3)]);
}

/** An MPEG-4 descriptor: tag, the length in its 4-byte form (as most muxers write it), then the body. */
export function descriptorBytes(tag: number, body: Uint8Array): Uint8Array {
  const n = body.byteLength;
  const out = new Uint8Array(5 + n);
  out[0] = tag & 0xff;
  out[1] = 0x80 | ((n >>> 21) & 0x7f);
  out[2] = 0x80 | ((n >>> 14) & 0x7f);
  out[3] = 0x80 | ((n >>> 7) & 0x7f);
  out[4] = n & 0x7f;
  out.set(body, 5);
  return out;
}

/** Run-length coding of a sample table (`stts`, `ctts`, `stsc`): [how many in a row, value]. */
export function runLength(values: readonly number[]): [count: number, value: number][] {
  const out: [number, number][] = [];
  for (const v of values) {
    const last = out[out.length - 1];
    if (last && last[1] === v) last[0]++;
    else out.push([1, v]);
  }
  return out;
}
