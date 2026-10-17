/**
 * 18 · A minimal MP4 (ISO BMFF) writer for one audio track: the separated tracks as `.m4a` files that every
 * browser plays and seeks precisely (iPhone included). AAC-LC (`mp4a` + `esds`) or Opus (`Opus` + `dOps`, from
 * the "Encapsulation of Opus in ISO Base Media File Format" spec). The whole file is built in memory with the
 * index first (`moov` before `mdat`), so playback can start and seek with range requests. All samples in one chunk.
 * With `primingSamples` an edit list (`edts/elst`) says how many samples at the start are the encoder's priming
 * (AAC adds ~1024–2112 of silence): the standard way every player drops them, so the track starts with its sound.
 * Pure; covered by `mp4.test.ts` (it parses what it writes).
 */

export type Mp4Codec = 'aac' | 'opus';

export interface Mp4Track {
  codec: Mp4Codec;
  sampleRate: number;
  channels: number;
  /** Encoded frames in order. */
  frames: readonly Uint8Array[];
  /** Length of each frame in samples (at `sampleRate`). */
  frameSamples: readonly number[];
  /** AAC: the AudioSpecificConfig; Opus: the OpusHead (if the encoder gave one). */
  description?: Uint8Array | null;
  /** Samples at the start that players must skip (encoder priming), written as an edit list. 0: none. */
  primingSamples?: number;
}

/** The edit list for a track whose first `skip` samples (of `total`, at `timescale`) are priming. */
export function editList(skip: number, total: number, timescale: number, movieTimescale = 1000): { segment: number; mediaTime: number } | null {
  const s = Math.round(skip);
  if (!(s > 0) || s >= total) return null;
  return { segment: Math.round(((total - s) / timescale) * movieTimescale), mediaTime: s };
}

const enc = new TextEncoder();

class Writer {
  private parts: Uint8Array[] = [];
  size = 0;
  bytes(b: Uint8Array) {
    this.parts.push(b);
    this.size += b.byteLength;
    return this;
  }
  u8(v: number) {
    return this.bytes(Uint8Array.of(v & 0xff));
  }
  u16(v: number) {
    return this.bytes(Uint8Array.of((v >>> 8) & 0xff, v & 0xff));
  }
  u24(v: number) {
    return this.bytes(Uint8Array.of((v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff));
  }
  u32(v: number) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v >>> 0);
    return this.bytes(b);
  }
  i16(v: number) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setInt16(0, v);
    return this.bytes(b);
  }
  str(s: string) {
    return this.bytes(enc.encode(s));
  }
  zeros(n: number) {
    return this.bytes(new Uint8Array(n));
  }
  done(): Uint8Array {
    const out = new Uint8Array(this.size);
    let at = 0;
    for (const p of this.parts) {
      out.set(p, at);
      at += p.byteLength;
    }
    return out;
  }
}

function box(type: string, ...children: Uint8Array[]): Uint8Array {
  const w = new Writer();
  const size = 8 + children.reduce((a, c) => a + c.byteLength, 0);
  w.u32(size).str(type);
  for (const c of children) w.bytes(c);
  return w.done();
}

function fullBox(type: string, version: number, flags: number, body: Uint8Array): Uint8Array {
  const w = new Writer().u8(version).u24(flags).bytes(body);
  return box(type, w.done());
}

const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];

/** AudioSpecificConfig for AAC-LC when the encoder gave none. */
export function aacConfig(sampleRate: number, channels: number): Uint8Array {
  const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  const index = rates.indexOf(sampleRate);
  if (index < 0) throw new Error(`AAC sample rate ${sampleRate}`);
  return Uint8Array.of((2 << 3) | (index >> 1), ((index & 1) << 7) | (channels << 3));
}

/** An MPEG-4 descriptor: tag, then the length in the 4-byte form (always valid, simplest to read back). */
function descriptor(tag: number, body: Uint8Array): Uint8Array {
  const n = body.byteLength;
  const w = new Writer().u8(tag).u8(0x80 | ((n >>> 21) & 0x7f)).u8(0x80 | ((n >>> 14) & 0x7f)).u8(0x80 | ((n >>> 7) & 0x7f)).u8(n & 0x7f);
  return w.bytes(body).done();
}

function esds(config: Uint8Array, bitrate: number): Uint8Array {
  const decoderConfig = new Writer()
    .u8(0x40) // objectTypeIndication: MPEG-4 Audio
    .u8((0x05 << 2) | 1) // streamType audio, upStream 0, reserved 1
    .u24(0) // bufferSizeDB
    .u32(bitrate) // maxBitrate
    .u32(bitrate) // avgBitrate
    .bytes(descriptor(0x05, config))
    .done();
  const es = new Writer().u16(1).u8(0).bytes(descriptor(0x04, decoderConfig)).bytes(descriptor(0x06, Uint8Array.of(0x02))).done();
  return fullBox('esds', 0, 0, descriptor(0x03, es));
}

/** Pre-skip from an OpusHead (little-endian, bytes 10–11), or 0 when there is none. */
export function opusPreSkip(head: Uint8Array | null | undefined): number {
  if (!head || head.byteLength < 19 || new TextDecoder().decode(head.subarray(0, 8)) !== 'OpusHead') return 0;
  return head[10]! | (head[11]! << 8);
}

function dOps(channels: number, preSkip: number, inputRate: number): Uint8Array {
  // Big-endian, unlike OpusHead. Channel mapping family 0 (mono / stereo).
  const w = new Writer().u8(0).u8(channels).u16(preSkip).u32(inputRate).i16(0).u8(0);
  return box('dOps', w.done());
}

function sampleEntry(track: Mp4Track, bitrate: number): Uint8Array {
  const head = new Writer()
    .zeros(6)
    .u16(1) // data_reference_index
    .zeros(8) // version, revision, vendor
    .u16(track.channels)
    .u16(16) // sample size
    .u16(0) // pre_defined
    .u16(0) // reserved
    .u32((track.codec === 'opus' ? 48000 : track.sampleRate) * 65536)
    .done();
  if (track.codec === 'aac') {
    const config = track.description?.byteLength ? track.description : aacConfig(track.sampleRate, track.channels);
    return box('mp4a', head, esds(config, bitrate));
  }
  return box('Opus', head, dOps(track.channels, opusPreSkip(track.description), track.sampleRate));
}

/** Run-length time-to-sample entries. */
export function sttsEntries(frameSamples: readonly number[]): [count: number, delta: number][] {
  const out: [number, number][] = [];
  for (const d of frameSamples) {
    const last = out[out.length - 1];
    if (last && last[1] === d) last[0]++;
    else out.push([1, d]);
  }
  return out;
}

export function buildMp4(track: Mp4Track): Uint8Array {
  if (track.frames.length !== track.frameSamples.length) throw new Error('frames and durations differ');
  // Opus in MP4 always counts time at 48 kHz.
  const timescale = track.codec === 'opus' ? 48000 : track.sampleRate;
  const totalSamples = track.frameSamples.reduce((a, b) => a + b, 0);
  const payload = track.frames.reduce((a, f) => a + f.byteLength, 0);
  const seconds = totalSamples / timescale;
  const bitrate = seconds > 0 ? Math.round((payload * 8) / seconds) : 0;
  const edit = editList(track.primingSamples ?? 0, totalSamples, timescale);
  // What plays (after the priming is dropped): the movie and track durations.
  const durationMs = edit ? edit.segment : Math.round(seconds * 1000);

  const ftyp =
    track.codec === 'aac'
      ? box('ftyp', new Writer().str('M4A ').u32(0x200).str('M4A ').str('isom').str('iso2').str('mp41').done())
      : box('ftyp', new Writer().str('isom').u32(0x200).str('isom').str('iso2').str('mp41').str('Opus').done());

  const mvhd = fullBox(
    'mvhd',
    0,
    0,
    (() => {
      const w = new Writer().u32(0).u32(0).u32(1000).u32(durationMs).u32(0x00010000).u16(0x0100).zeros(10);
      for (const m of MATRIX) w.u32(m);
      return w.zeros(24).u32(2).done();
    })(),
  );
  const tkhd = fullBox(
    'tkhd',
    0,
    3,
    (() => {
      const w = new Writer().u32(0).u32(0).u32(1).u32(0).u32(durationMs).zeros(8).u16(0).u16(0).u16(0x0100).u16(0);
      for (const m of MATRIX) w.u32(m);
      return w.u32(0).u32(0).done();
    })(),
  );
  const mdhd = fullBox('mdhd', 0, 0, new Writer().u32(0).u32(0).u32(timescale).u32(totalSamples).u16(0x55c4).u16(0).done());
  const hdlr = fullBox('hdlr', 0, 0, new Writer().u32(0).str('soun').zeros(12).str('SoundHandler').u8(0).done());
  const smhd = fullBox('smhd', 0, 0, new Writer().u16(0).u16(0).done());
  const dinf = box('dinf', fullBox('dref', 0, 0, new Writer().u32(1).bytes(fullBox('url ', 0, 1, new Uint8Array(0))).done()));
  const stsd = fullBox('stsd', 0, 0, new Writer().u32(1).bytes(sampleEntry(track, bitrate)).done());
  const runs = sttsEntries(track.frameSamples);
  const stts = fullBox(
    'stts',
    0,
    0,
    (() => {
      const w = new Writer().u32(runs.length);
      for (const [count, delta] of runs) w.u32(count).u32(delta);
      return w.done();
    })(),
  );
  const stsc = fullBox('stsc', 0, 0, new Writer().u32(1).u32(1).u32(track.frames.length).u32(1).done());
  const stsz = fullBox(
    'stsz',
    0,
    0,
    (() => {
      const w = new Writer().u32(0).u32(track.frames.length);
      for (const f of track.frames) w.u32(f.byteLength);
      return w.done();
    })(),
  );
  // The chunk offset depends on the moov size, which doesn't depend on the offset's value: build twice.
  const moovWith = (offset: number) => {
    const stco = fullBox('stco', 0, 0, new Writer().u32(1).u32(offset).done());
    const stbl = box('stbl', stsd, stts, stsc, stsz, stco);
    const minf = box('minf', smhd, dinf, stbl);
    const mdia = box('mdia', mdhd, hdlr, minf);
    const edts = edit
      ? [box('edts', fullBox('elst', 0, 0, new Writer().u32(1).u32(edit.segment).u32(edit.mediaTime).u16(1).u16(0).done()))]
      : [];
    const trak = box('trak', tkhd, ...edts, mdia);
    return box('moov', mvhd, trak);
  };
  const probe = moovWith(0);
  const moov = moovWith(ftyp.byteLength + probe.byteLength + 8);

  const mdat = new Writer().u32(8 + payload).str('mdat');
  for (const f of track.frames) mdat.bytes(f);
  return new Writer().bytes(ftyp).bytes(moov).bytes(mdat.done()).done();
}
