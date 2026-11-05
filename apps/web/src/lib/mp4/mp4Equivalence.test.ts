import { describe, expect, it } from 'vitest';
import { muxMp4, vpcConfig, type MuxSample } from '@/features/studio/mp4Mux';
import { buildMp4 } from '@/features/voice/separate/mp4';

/**
 * REQ-26 · REQ-28 · Byte equivalence of both MP4 writers with fixed inputs. The digests were taken from the writers as
 * they were before `lib/mp4/boxes.ts` existed (commit d3776f7): sharing the boxes must not move a single byte, so
 * the tracks and copies already uploaded stay equivalent to the new ones.
 */

/** FNV-1a (32-bit) plus the length: enough to notice any changed byte, with no Node-only APIs. */
function digest(parts: Uint8Array | Uint8Array[]): string {
  const list = Array.isArray(parts) ? parts : [parts];
  let h = 0x811c9dc5;
  let n = 0;
  for (const p of list) {
    for (let i = 0; i < p.length; i++) {
      h ^= p[i]!;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    n += p.length;
  }
  return `${n}:${h.toString(16).padStart(8, '0')}`;
}

/** Deterministic bytes (a linear congruential generator), so the inputs never change between runs. */
function bytes(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let s = seed >>> 0;
  for (let i = 0; i < length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = s >>> 24;
  }
  return out;
}

const audioSamples = (count: number, frame: number, rate: number): MuxSample[] =>
  Array.from({ length: count }, (_, i) => ({
    data: bytes(180 + ((i * 37) % 90), i + 1),
    time: Math.round(((i * frame) / rate) * 1e6),
    duration: Math.round((frame / rate) * 1e6),
    key: true,
  }));

const videoSamples = (count: number): MuxSample[] =>
  Array.from({ length: count }, (_, i) => ({
    data: bytes(i % 30 === 0 ? 3000 : 400 + ((i * 53) % 700), 1000 + i),
    time: Math.round((i / 30) * 1e6) + (i % 7 === 3 ? 11 : 0),
    duration: Math.round(1e6 / 30),
    key: i % 30 === 0,
  }));

describe('MP4 writers, byte for byte', () => {
  it('copy for the cloud: H.264 + AAC with priming', () => {
    const parts = muxMp4({
      video: { codec: 'avc1', width: 640, height: 360, description: bytes(40, 7), samples: videoSamples(95) },
      audio: {
        codec: 'mp4a',
        sampleRate: 48000,
        channels: 2,
        description: Uint8Array.of(0x11, 0x90),
        primingSamples: 1024,
        bitrate: 96_000,
        samples: audioSamples(150, 1024, 48000),
      },
    });
    expect(digest(parts)).toBe('116455:77f6822f');
  });

  it('copy for the cloud: VP9 + Opus, and AAC with no description at an unknown rate', () => {
    const vp9 = muxMp4({
      video: {
        codec: 'vp09',
        width: 320,
        height: 240,
        description: vpcConfig(31),
        samples: videoSamples(40),
      },
      audio: {
        codec: 'Opus',
        sampleRate: 48000,
        channels: 2,
        preSkip: 0,
        bitrate: 64_000,
        samples: audioSamples(70, 960, 48000),
      },
    });
    expect(digest(vp9)).toBe('52476:54681807');
    const odd = muxMp4({
      audio: { codec: 'mp4a', sampleRate: 47000, channels: 1, samples: audioSamples(30, 1024, 47000) },
    });
    expect(digest(odd)).toBe('7475:96cb38d6');
  });

  it('separated tracks: AAC with an edit list, AAC without a description, Opus with its head', () => {
    const frames = Array.from({ length: 120 }, (_, i) => bytes(200 + ((i * 29) % 120), 500 + i));
    const aac = buildMp4({
      codec: 'aac',
      sampleRate: 44100,
      channels: 2,
      frames,
      frameSamples: frames.map(() => 1024),
      description: Uint8Array.of(0x12, 0x10),
      primingSamples: 2112,
    });
    expect(digest(aac)).toBe('32260:e8219edc');
    const bare = buildMp4({
      codec: 'aac',
      sampleRate: 44100,
      channels: 2,
      frames,
      frameSamples: frames.map((_, i) => (i === 119 ? 300 : 1024)),
    });
    expect(digest(bare)).toBe('32232:ca180146');
    const head = new Uint8Array(19);
    head.set([...'OpusHead'].map((c) => c.charCodeAt(0)));
    head[9] = 2;
    head[10] = 0x38;
    head[11] = 0x01;
    const opus = buildMp4({
      codec: 'opus',
      sampleRate: 48000,
      channels: 2,
      frames,
      frameSamples: frames.map(() => 960),
      description: head,
    });
    expect(digest(opus)).toBe('32192:0fcbc7d7');
  });
});
