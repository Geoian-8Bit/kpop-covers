import { describe, expect, it } from 'vitest';
import { audioSpecificConfig, muxMp4, vpcConfig, type MuxSample } from './mp4Mux';

interface Box {
  type: string;
  start: number;
  size: number;
  body: number;
  children?: Box[];
}

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf']);

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function boxes(bytes: Uint8Array, from: number, to: number): Box[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Box[] = [];
  let at = from;
  while (at < to) {
    const size = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    expect(size).toBeGreaterThanOrEqual(8);
    expect(at + size).toBeLessThanOrEqual(to);
    const box: Box = { type, start: at, size, body: at + 8 };
    if (CONTAINERS.has(type)) box.children = boxes(bytes, at + 8, at + size);
    out.push(box);
    at += size;
  }
  expect(at).toBe(to);
  return out;
}

function find(list: Box[] | undefined, path: string[]): Box {
  let current: Box | undefined;
  let level = list;
  for (const type of path) {
    current = level?.find((b) => b.type === type);
    if (!current) throw new Error(`no ${type}`);
    level = current.children;
  }
  return current!;
}

const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint32(at);

function table(bytes: Uint8Array, box: Box, fields: number): number[][] {
  // Full box: version/flags (4), entry count (4), then entries.
  const count = u32(bytes, box.body + 4);
  const rows: number[][] = [];
  for (let i = 0; i < count; i++) {
    const row: number[] = [];
    for (let f = 0; f < fields; f++) row.push(u32(bytes, box.body + 8 + (i * fields + f) * 4));
    rows.push(row);
  }
  return rows;
}

function sample(n: number, size: number, time: number, duration: number, key: boolean): MuxSample {
  return { data: new Uint8Array(size).fill(n % 251), time, duration, key };
}

/** 2 s of 30 fps video (a key frame every second) and 2 s of AAC (1024-sample frames at 48 kHz). */
function input() {
  const video = Array.from({ length: 60 }, (_, i) => sample(i, 100 + i, Math.round((i * 1e6) / 30), 33_333, i % 30 === 0));
  const frame = (1024 / 48000) * 1e6;
  const audio = Array.from({ length: 94 }, (_, i) => sample(200 + i, 20 + (i % 7), Math.round(i * frame), Math.round(frame), true));
  return {
    video: { codec: 'avc1' as const, width: 1280, height: 720, description: new Uint8Array([1, 0x64, 0, 0x1f, 0xff]), samples: video },
    audio: { codec: 'mp4a' as const, sampleRate: 48000, channels: 2, bitrate: 160_000, samples: audio },
  };
}

describe('muxMp4', () => {
  const parts = muxMp4(input());
  const bytes = concat(parts);
  const top = boxes(bytes, 0, bytes.length);

  it('writes ftyp, then the index, then the samples (fast start)', () => {
    expect(top.map((b) => b.type)).toEqual(['ftyp', 'moov', 'mdat']);
  });

  it('describes both tracks', () => {
    const traks = find(top, ['moov']).children!.filter((b) => b.type === 'trak');
    expect(traks).toHaveLength(2);
    const handlers = traks.map((t) => String.fromCharCode(...bytes.subarray(find(t.children, ['mdia', 'hdlr']).body + 8, find(t.children, ['mdia', 'hdlr']).body + 12)));
    expect(handlers).toEqual(['vide', 'soun']);
    const stsd = find(traks[0]!.children, ['mdia', 'minf', 'stbl', 'stsd']);
    expect(String.fromCharCode(...bytes.subarray(stsd.body + 12, stsd.body + 16))).toBe('avc1');
    const audioStsd = find(traks[1]!.children, ['mdia', 'minf', 'stbl', 'stsd']);
    expect(String.fromCharCode(...bytes.subarray(audioStsd.body + 12, audioStsd.body + 16))).toBe('mp4a');
  });

  it('keeps the exact timeline: 2 s, starting at 0', () => {
    const moov = find(top, ['moov']);
    const mvhd = find(moov.children, ['mvhd']);
    // version/flags, creation, modification, timescale, duration
    expect(u32(bytes, mvhd.body + 12)).toBe(1000);
    expect(Math.abs(u32(bytes, mvhd.body + 16) - 2000)).toBeLessThanOrEqual(5);
    const videoStts = find(moov.children!.filter((b) => b.type === 'trak')[0]!.children, ['mdia', 'minf', 'stbl', 'stts']);
    const total = table(bytes, videoStts, 2).reduce((n, [count, delta]) => n + count! * delta!, 0);
    expect(Math.abs(total - 2 * 90000)).toBeLessThanOrEqual(3);
  });

  it('lists the key frames', () => {
    const trak = find(top, ['moov']).children!.filter((b) => b.type === 'trak')[0]!;
    const stss = find(trak.children, ['mdia', 'minf', 'stbl', 'stss']);
    expect(table(bytes, stss, 1).map((r) => r[0])).toEqual([1, 31]);
  });

  it('points every chunk at its samples', () => {
    const { video, audio } = input();
    const traks = find(top, ['moov']).children!.filter((b) => b.type === 'trak');
    [video.samples, audio.samples].forEach((samples, t) => {
      const stbl = find(traks[t]!.children, ['mdia', 'minf', 'stbl']);
      const offsets = table(bytes, find(stbl.children, ['stco']), 1).map((r) => r[0]!);
      const stsc = table(bytes, find(stbl.children, ['stsc']), 3);
      const stsz = find(stbl.children, ['stsz']);
      expect(u32(bytes, stsz.body + 8)).toBe(samples.length);
      let sampleIndex = 0;
      offsets.forEach((offset, c) => {
        const entry = [...stsc].reverse().find((r) => r[0]! <= c + 1)!;
        let at = offset;
        for (let k = 0; k < entry[1]!; k++) {
          const s = samples[sampleIndex]!;
          expect(u32(bytes, stsz.body + 12 + sampleIndex * 4)).toBe(s.data.length);
          expect(Array.from(bytes.subarray(at, at + s.data.length))).toEqual(Array.from(s.data));
          at += s.data.length;
          sampleIndex++;
        }
      });
      expect(sampleIndex).toBe(samples.length);
    });
  });

  it('interleaves sound and picture in half-second chunks', () => {
    const traks = find(top, ['moov']).children!.filter((b) => b.type === 'trak');
    const v = table(bytes, find(traks[0]!.children, ['mdia', 'minf', 'stbl', 'stco']), 1).map((r) => r[0]!);
    const a = table(bytes, find(traks[1]!.children, ['mdia', 'minf', 'stbl', 'stco']), 1).map((r) => r[0]!);
    expect(v.length).toBe(4);
    expect(a.length).toBeGreaterThanOrEqual(4);
    // The second video chunk comes after the first sound chunk, not after all the sound.
    expect(v[1]!).toBeLessThan(a[a.length - 1]!);
  });

  it('starts the picture at 0 even if the first frame came a bit late', () => {
    const late = input();
    late.video.samples = late.video.samples.map((s) => ({ ...s, time: s.time + 40_000 }));
    const b = concat(muxMp4({ video: late.video }));
    const t = boxes(b, 0, b.length);
    const trak = find(t, ['moov', 'trak']);
    expect(find(trak.children, ['mdia', 'minf', 'stbl']).children!.some((x) => x.type === 'ctts')).toBe(false);
  });

  it('writes reordered frames with composition offsets', () => {
    const v = input().video;
    const order = [0, 3, 1, 2];
    const samples = order.map((n, i) => sample(i, 50, Math.round((n * 1e6) / 30), 33_333, i === 0));
    const b = concat(muxMp4({ video: { ...v, samples } }));
    const trak = find(boxes(b, 0, b.length), ['moov', 'trak']);
    expect(find(trak.children, ['mdia', 'minf', 'stbl']).children!.some((x) => x.type === 'ctts')).toBe(true);
  });

  it('writes VP9 and Opus entries', () => {
    const { video, audio } = input();
    const b = concat(
      muxMp4({
        video: { ...video, codec: 'vp09', description: vpcConfig() },
        audio: { ...audio, codec: 'Opus', preSkip: 312 },
      }),
    );
    const traks = find(boxes(b, 0, b.length), ['moov']).children!.filter((x) => x.type === 'trak');
    const entry = (i: number) => {
      const stsd = find(traks[i]!.children, ['mdia', 'minf', 'stbl', 'stsd']);
      return String.fromCharCode(...b.subarray(stsd.body + 12, stsd.body + 16));
    };
    expect([entry(0), entry(1)]).toEqual(['vp09', 'Opus']);
  });

  it('refuses an empty file', () => {
    expect(() => muxMp4({})).toThrow();
  });
});

describe('muxMp4 with the sound encoder priming', () => {
  const PRIMING = 2112;
  const base = input();
  const bytes = concat(muxMp4({ ...base, audio: { ...base.audio, primingSamples: PRIMING } }));
  const top = boxes(bytes, 0, bytes.length);
  const traks = find(top, ['moov']).children!.filter((b) => b.type === 'trak');

  it('writes an edit list on the sound only, starting after the priming', () => {
    expect(traks[0]!.children!.some((b) => b.type === 'edts')).toBe(false);
    const edts = traks[1]!.children!.find((b) => b.type === 'edts')!;
    expect(edts).toBeDefined();
    const elst = boxes(bytes, edts.body, edts.start + edts.size)[0]!;
    expect(elst.type).toBe('elst');
    // version/flags, entry count, segment duration (movie ms), media time (samples), rate 1.0
    expect(u32(bytes, elst.body + 4)).toBe(1);
    const totalSamples = base.audio.samples.length * 1024;
    expect(u32(bytes, elst.body + 8)).toBe(Math.round(((totalSamples - PRIMING) / 48000) * 1000));
    expect(u32(bytes, elst.body + 12)).toBe(PRIMING);
    expect(u32(bytes, elst.body + 16)).toBe(0x00010000);
  });

  it('the sound track lasts what it plays; the samples stay all there', () => {
    const tkhd = find(traks[1]!.children, ['tkhd']);
    const totalSamples = base.audio.samples.length * 1024;
    expect(u32(bytes, tkhd.body + 20)).toBe(Math.round(((totalSamples - PRIMING) / 48000) * 1000));
    const mdhd = find(traks[1]!.children, ['mdia', 'mdhd']);
    expect(u32(bytes, mdhd.body + 16)).toBe(totalSamples);
  });

  it('no priming, no edit list', () => {
    const plain = concat(muxMp4(input()));
    const t = find(boxes(plain, 0, plain.length), ['moov']).children!.filter((b) => b.type === 'trak');
    expect(t.every((trak) => !trak.children!.some((b) => b.type === 'edts'))).toBe(true);
  });
});

describe('audioSpecificConfig', () => {
  it('is AAC-LC, 48 kHz, stereo', () => {
    expect(Array.from(audioSpecificConfig(48000, 2))).toEqual([0x11, 0x90]);
    expect(Array.from(audioSpecificConfig(44100, 2))).toEqual([0x12, 0x10]);
  });
});
