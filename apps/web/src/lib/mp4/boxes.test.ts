import { describe, expect, it } from 'vitest';
import { audioSpecificConfig } from '@/features/studio/mp4Mux';
import { aacConfig } from '@/features/voice/separate/mp4';
import { AAC_SAMPLE_RATES, aacLcConfig, aacRateIndex, descriptorBytes, MATRIX, runLength } from './boxes';

describe('lib/mp4/boxes', () => {
  it('the identity matrix in fixed point', () => {
    expect(MATRIX).toEqual([0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000]);
  });

  it('knows the AAC frequency indexes and says -1 for any other rate', () => {
    expect(aacRateIndex(96000)).toBe(0);
    expect(aacRateIndex(48000)).toBe(3);
    expect(aacRateIndex(44100)).toBe(4);
    expect(aacRateIndex(7350)).toBe(12);
    expect(aacRateIndex(47000)).toBe(-1);
    expect(AAC_SAMPLE_RATES).toHaveLength(13);
  });

  it('writes the AAC-LC AudioSpecificConfig (48 kHz stereo = 0x11 0x90, 44.1 kHz stereo = 0x12 0x10)', () => {
    expect([...aacLcConfig(3, 2)]).toEqual([0x11, 0x90]);
    expect([...aacLcConfig(4, 2)]).toEqual([0x12, 0x10]);
    expect([...aacLcConfig(4, 1)]).toEqual([0x12, 0x08]);
  });

  it('each writer keeps its own answer to an unknown rate', () => {
    // The copy writes index 0; the separated tracks refuse it.
    expect([...audioSpecificConfig(47000, 2)]).toEqual([...aacLcConfig(0, 2)]);
    expect(() => aacConfig(47000, 2)).toThrow('AAC sample rate 47000');
    // Same bytes for every known rate.
    for (const rate of AAC_SAMPLE_RATES)
      expect([...audioSpecificConfig(rate, 2)]).toEqual([...aacConfig(rate, 2)]);
  });

  it('frames a descriptor with the 4-byte length', () => {
    expect([...descriptorBytes(0x06, Uint8Array.of(0x02))]).toEqual([0x06, 0x80, 0x80, 0x80, 0x01, 0x02]);
    const big = descriptorBytes(0x04, new Uint8Array(300));
    expect([...big.subarray(0, 5)]).toEqual([0x04, 0x80, 0x80, 0x82, 0x2c]);
    expect(big.length).toBe(305);
  });

  it('run-length codes a table', () => {
    expect(runLength([])).toEqual([]);
    expect(runLength([1024, 1024, 1024, 300])).toEqual([
      [3, 1024],
      [1, 300],
    ]);
    expect(runLength([5, 6, 6, 5])).toEqual([
      [1, 5],
      [2, 6],
      [1, 5],
    ]);
  });
});
