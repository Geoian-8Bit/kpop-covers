import { describe, expect, it } from 'vitest';
import { aacConfig, buildMp4, editList, opusPreSkip, sttsEntries } from './mp4';

interface Box {
  type: string;
  start: number;
  size: number;
  body: Uint8Array;
}

const CONTAINERS = new Set(['moov', 'trak', 'edts', 'mdia', 'minf', 'stbl', 'dinf']);

function parse(bytes: Uint8Array, start = 0, end = bytes.byteLength, out = new Map<string, Box>()): Map<string, Box> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = start;
  while (at < end) {
    const size = view.getUint32(at);
    const type = new TextDecoder().decode(bytes.subarray(at + 4, at + 8));
    expect(size).toBeGreaterThanOrEqual(8);
    expect(at + size).toBeLessThanOrEqual(end);
    out.set(type, { type, start: at, size, body: bytes.subarray(at + 8, at + size) });
    if (CONTAINERS.has(type)) parse(bytes, at + 8, at + size, out);
    at += size;
  }
  expect(at).toBe(end);
  return out;
}

const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint32(at);

describe('buildMp4', () => {
  const frames = [Uint8Array.of(1, 2, 3), Uint8Array.of(4, 5), Uint8Array.of(6, 7, 8, 9)];

  it('writes a well-formed AAC file with the index first and the samples where it says', () => {
    const file = buildMp4({ codec: 'aac', sampleRate: 44100, channels: 2, frames, frameSamples: [1024, 1024, 1024] });
    const boxes = parse(file);
    expect([...boxes.keys()].slice(0, 3)).toEqual(['ftyp', 'moov', 'mvhd']);
    expect(boxes.get('moov')!.start).toBeLessThan(boxes.get('mdat')!.start);
    // stco → first sample, stsz sizes, stts durations.
    const offset = u32(boxes.get('stco')!.body, 8);
    expect(Array.from(file.subarray(offset, offset + 9))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const stsz = boxes.get('stsz')!.body;
    expect([u32(stsz, 8), u32(stsz, 12), u32(stsz, 16), u32(stsz, 20)]).toEqual([3, 3, 2, 4]);
    const stts = boxes.get('stts')!.body;
    expect([u32(stts, 4), u32(stts, 8), u32(stts, 12)]).toEqual([1, 3, 1024]);
    // mdhd: timescale 44100, 3072 samples.
    const mdhd = boxes.get('mdhd')!.body;
    expect([u32(mdhd, 12), u32(mdhd, 16)]).toEqual([44100, 3072]);
    // The AAC config travels in esds.
    const stsd = boxes.get('stsd')!.body;
    expect(new TextDecoder().decode(stsd.subarray(12, 16))).toBe('mp4a');
    // mp4a: 8 (header) + 28 (audio sample entry) → then the esds box.
    expect(new TextDecoder().decode(stsd.subarray(8 + 36 + 4, 8 + 36 + 8))).toBe('esds');
    // The AudioSpecificConfig (0x12 0x10) is inside it.
    const at = file.indexOf(0x12, boxes.get('stsd')!.start + 60);
    expect(file[at + 1]).toBe(0x10);
  });

  it('writes Opus with dOps, at 48 kHz, with the encoder pre-skip', () => {
    const head = new Uint8Array(19);
    head.set(new TextEncoder().encode('OpusHead'));
    head[9] = 2;
    head[10] = 0x38; // 312
    head[11] = 0x01;
    const file = buildMp4({ codec: 'opus', sampleRate: 48000, channels: 2, frames, frameSamples: [960, 960, 480], description: head });
    const boxes = parse(file);
    const entry = boxes.get('stsd')!.body;
    expect(new TextDecoder().decode(entry.subarray(12, 16))).toBe('Opus');
    const dopsAt = file.indexOf(0x64, boxes.get('stsd')!.start); // 'd'
    expect(dopsAt).toBeGreaterThan(0);
    expect(opusPreSkip(head)).toBe(312);
    const mdhd = boxes.get('mdhd')!.body;
    expect([u32(mdhd, 12), u32(mdhd, 16)]).toEqual([48000, 2400]);
  });

  it('writes the AAC priming as an edit list, so every player drops it', () => {
    const file = buildMp4({ codec: 'aac', sampleRate: 44100, channels: 2, frames, frameSamples: [1024, 1024, 1024], primingSamples: 2112 });
    const boxes = parse(file);
    const elst = boxes.get('elst')!.body;
    expect(u32(elst, 4)).toBe(1); // one entry
    expect(u32(elst, 8)).toBe(Math.round(((3072 - 2112) / 44100) * 1000)); // what plays, ms
    expect(u32(elst, 12)).toBe(2112); // media time: the priming
    expect(u32(elst, 16)).toBe(0x00010000); // rate 1.0
    // The edit list sits in the track, before the media.
    expect(boxes.get('edts')!.start).toBeLessThan(boxes.get('mdia')!.start);
    expect(u32(boxes.get('mdhd')!.body, 16)).toBe(3072);
    expect(editList(0, 3072, 44100)).toBeNull();
    expect(editList(4000, 3072, 44100)).toBeNull();
    expect(boxes.has('elst')).toBe(true);
    expect(parse(buildMp4({ codec: 'aac', sampleRate: 44100, channels: 2, frames, frameSamples: [1024, 1024, 1024] })).has('elst')).toBe(false);
  });

  it('builds the AAC config and run-length durations', () => {
    expect(Array.from(aacConfig(44100, 2))).toEqual([0x12, 0x10]);
    expect(Array.from(aacConfig(48000, 2))).toEqual([0x11, 0x90]);
    expect(sttsEntries([1024, 1024, 1024, 512])).toEqual([
      [3, 1024],
      [1, 512],
    ]);
    expect(opusPreSkip(null)).toBe(0);
  });
});
